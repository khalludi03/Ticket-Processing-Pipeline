import { describe, test, expect, vi, beforeAll, afterAll } from 'vitest'
import {
  SQSClient,
  CreateQueueCommand,
  ReceiveMessageCommand,
  PurgeQueueCommand,
  GetQueueAttributesCommand,
} from '@aws-sdk/client-sqs'
import { eq, and } from 'drizzle-orm'
import { db } from '../../src/db/index.ts'
import { tickets, jobTasks } from '../../src/db/schema.ts'
import { processTriageMessage } from '../../src/handlers/triage.ts'
import { roomManager } from '../../src/realtime/room-manager.ts'
import type { TriageOutput } from '../../src/schemas/triage.ts'
import type { SQSMessage } from '../../src/schemas/queue.ts'

const QUEUE_NAME = 'dev-tickets-queue'
const DLQ_NAME = 'dev-tickets-dlq'
const SQS_ENDPOINT = process.env.SQS_ENDPOINT ?? 'http://localhost:4566'

const sqsSetup = new SQSClient({
  region: 'us-east-1',
  endpoint: SQS_ENDPOINT,
  credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
})

const stubOutput: TriageOutput = {
  category: 'technical',
  priority: 'high',
  summary: 'User cannot log in on mobile.',
  sentiment: 'frustrated',
  suggested_tags: ['login', 'mobile'],
  confidence: 0.92,
}
const stubAI = async () => stubOutput
const failingAI = async () => { throw new Error('Bedrock unavailable') }

let queueUrl: string

async function insertTicketAndJobTask() {
  return db.transaction(async (tx) => {
    const [ticket] = await tx
      .insert(tickets)
      .values({
        title: 'Login broken',
        description: 'Cannot log in on mobile.',
        customerId: 'test-customer',
        channel: 'web',
      })
      .returning()
    await tx.insert(jobTasks).values({
      ticketId: ticket!.id,
      phase: 'triage',
      status: 'queued',
    })
    return ticket!
  })
}

async function cleanupTicket(ticketId: string) {
  await db.delete(tickets).where(eq(tickets.id, ticketId))
}

async function peekQueue(): Promise<{ body: unknown }[]> {
  const res = await sqsSetup.send(
    new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: 10,
      WaitTimeSeconds: 0,
    }),
  )
  return (res.Messages ?? []).map((m) => ({
    body: JSON.parse(m.Body ?? '{}') as unknown,
  }))
}

async function countDelayedMessages(): Promise<number> {
  const res = await sqsSetup.send(
    new GetQueueAttributesCommand({
      QueueUrl: queueUrl,
      AttributeNames: ['ApproximateNumberOfMessagesDelayed'],
    }),
  )
  return parseInt(res.Attributes?.ApproximateNumberOfMessagesDelayed ?? '0', 10)
}

let dlqUrl: string

beforeAll(async () => {
  const { QueueUrl } = await sqsSetup.send(new CreateQueueCommand({ QueueName: QUEUE_NAME }))
  queueUrl = QueueUrl!
  process.env.SQS_QUEUE_URL = queueUrl
  const { QueueUrl: dlq } = await sqsSetup.send(new CreateQueueCommand({ QueueName: DLQ_NAME }))
  dlqUrl = dlq!
  await sqsSetup.send(new PurgeQueueCommand({ QueueUrl: queueUrl }))
})

afterAll(async () => {
  sqsSetup.destroy()
})

describe('processTriageMessage (integration)', () => {
  test('happy path — writes triage_output, completes job_task, enqueues resolution', async () => {
    const ticket = await insertTicketAndJobTask()
    const message: SQSMessage = { ticket_id: ticket.id, phase: 'triage', retry_count: 0 }

    const mockWs = { send: vi.fn(), close: vi.fn() }
    roomManager.join(ticket.id, mockWs)

    await processTriageMessage(message, stubAI)

    roomManager.leave(ticket.id, mockWs)

    const [updatedTicket] = await db.select().from(tickets).where(eq(tickets.id, ticket.id))
    expect(updatedTicket?.triageOutput).toMatchObject(stubOutput)

    const [updatedTask] = await db
      .select()
      .from(jobTasks)
      .where(and(eq(jobTasks.ticketId, ticket.id), eq(jobTasks.phase, 'triage')))
    expect(updatedTask?.status).toBe('completed')
    expect(updatedTask?.completedAt).not.toBeNull()
    expect(updatedTask?.processingTimeMs).toBeGreaterThanOrEqual(0)
    expect(updatedTask?.modelVersion).toBeTruthy()

    const queued = await peekQueue()
    const resolutionMsg = queued.find(
      (m) => (m.body as Record<string, unknown>).phase === 'resolution',
    )
    expect(resolutionMsg).toBeDefined()
    expect((resolutionMsg!.body as Record<string, unknown>).ticket_id).toBe(ticket.id)

    expect(mockWs.send).toHaveBeenCalledWith(
      expect.stringContaining('"type":"ticket_started"'),
    )

    await cleanupTicket(ticket.id)
  })

  test('phase guard — skips processing if job_task already completed', async () => {
    const ticket = await insertTicketAndJobTask()

    await db
      .update(jobTasks)
      .set({ status: 'completed' })
      .where(and(eq(jobTasks.ticketId, ticket.id), eq(jobTasks.phase, 'triage')))

    await sqsSetup.send(new PurgeQueueCommand({ QueueUrl: queueUrl }))

    const message: SQSMessage = { ticket_id: ticket.id, phase: 'triage', retry_count: 0 }
    await processTriageMessage(message, stubAI)

    const [t] = await db.select().from(tickets).where(eq(tickets.id, ticket.id))
    expect(t?.triageOutput).toBeNull()

    const queued = await peekQueue()
    expect(queued).toHaveLength(0)

    await cleanupTicket(ticket.id)
  })

  test('failure retry < 3 — sets job_task failed, re-enqueues triage', async () => {
    const ticket = await insertTicketAndJobTask()
    await sqsSetup.send(new PurgeQueueCommand({ QueueUrl: queueUrl }))

    const message: SQSMessage = { ticket_id: ticket.id, phase: 'triage', retry_count: 1 }
    await processTriageMessage(message, failingAI)

    const [task] = await db
      .select()
      .from(jobTasks)
      .where(and(eq(jobTasks.ticketId, ticket.id), eq(jobTasks.phase, 'triage')))
    expect(task?.status).toBe('failed')
    expect(task?.retryCount).toBe(2)

    // Confirm re-enqueue happened — check all message states since LocalStack
    // may treat DelaySeconds differently across versions.
    const attrs = await sqsSetup.send(new GetQueueAttributesCommand({
      QueueUrl: queueUrl,
      AttributeNames: ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesDelayed', 'ApproximateNumberOfMessagesNotVisible'],
    }))
    const total = ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesDelayed', 'ApproximateNumberOfMessagesNotVisible']
      .reduce((sum, k) => sum + parseInt(attrs.Attributes?.[k] ?? '0', 10), 0)
    expect(total).toBeGreaterThan(0)

    await cleanupTicket(ticket.id)
  })

  test('failure retry exhausted — sets needs_manual_review, no re-enqueue', async () => {
    const ticket = await insertTicketAndJobTask()
    await sqsSetup.send(new PurgeQueueCommand({ QueueUrl: queueUrl }))

    const mockWs = { send: vi.fn(), close: vi.fn() }
    roomManager.join(ticket.id, mockWs)

    const message: SQSMessage = { ticket_id: ticket.id, phase: 'triage', retry_count: 2 }
    await processTriageMessage(message, failingAI)

    const [t] = await db.select().from(tickets).where(eq(tickets.id, ticket.id))
    expect(t?.status).toBe('needs_manual_review')
    expect(t?.errorLog).toBe('Bedrock unavailable')

    const queued = await peekQueue()
    expect(queued).toHaveLength(0)

    expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"type":"ticket_started"'))
    expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"type":"ticket_failed"'))
    expect(mockWs.close).toHaveBeenCalledOnce()

    // DLQ message
    const dlqMessages = await sqsSetup.send(new ReceiveMessageCommand({ QueueUrl: dlqUrl, MaxNumberOfMessages: 1, WaitTimeSeconds: 0 }))
    const dlqBody = JSON.parse(dlqMessages.Messages?.[0]?.Body ?? '{}') as Record<string, unknown>
    expect(dlqBody).toMatchObject({ ticket_id: ticket.id, phase: 'triage', reason: 'Bedrock unavailable' })
    expect(dlqBody.failed_at).toBeTruthy()

    // Fallback triage output written
    const [t2] = await db.select().from(tickets).where(eq(tickets.id, ticket.id))
    expect(t2?.triageOutput).toMatchObject({ category: 'general', priority: 'medium', confidence: 0 })

    await cleanupTicket(ticket.id)
  })
})
