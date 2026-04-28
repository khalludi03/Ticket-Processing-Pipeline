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
import { tickets, jobTasks, resolutionDrafts } from '../../src/db/schema.ts'
import { processResolutionMessage } from '../../src/handlers/resolution.ts'
import { roomManager } from '../../src/realtime/room-manager.ts'
import type { ResolutionOutput } from '../../src/schemas/resolution.ts'
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

const fakeTriage: TriageOutput = {
  category: 'technical',
  priority: 'high',
  summary: 'User cannot log in on mobile.',
  sentiment: 'frustrated',
  suggested_tags: ['login', 'mobile'],
  confidence: 0.92,
}

const stubOutput: ResolutionOutput = {
  suggested_reply: 'We have identified the issue and applied a fix. Please try again.',
  internal_note: 'Session token expiry confirmed. Reset tokens and cleared CDN cache.',
  resolution_steps: ['Reset session tokens', 'Clear CDN cache', 'Notify user'],
  requires_escalation: false,
  confidence: 0.9,
}

const stubAI = async () => stubOutput
const failingAI = async () => { throw new Error('Bedrock unavailable') }

let queueUrl: string
let dlqUrl: string

async function insertTicketWithTriage() {
  return db.transaction(async (tx) => {
    const [ticket] = await tx
      .insert(tickets)
      .values({
        title: 'Login broken',
        description: 'Cannot log in on mobile.',
        customerId: 'test-customer',
        channel: 'web',
        triageOutput: fakeTriage,
        status: 'processing',
      })
      .returning()
    await tx.insert(jobTasks).values({
      ticketId: ticket!.id,
      phase: 'resolution',
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

describe('processResolutionMessage (integration)', () => {
  test('happy path — writes resolution_output, completes job_task, sets ticket completed', async () => {
    const ticket = await insertTicketWithTriage()
    const message: SQSMessage = { ticket_id: ticket.id, phase: 'resolution', retry_count: 0 }

    const mockWs = { send: vi.fn(), close: vi.fn() }
    roomManager.join(ticket.id, mockWs)

    await processResolutionMessage(message, stubAI)

    const [updatedTicket] = await db.select().from(tickets).where(eq(tickets.id, ticket.id))
    expect(updatedTicket?.resolutionOutput).toMatchObject(stubOutput)
    expect(updatedTicket?.status).toBe('completed')

    const [updatedTask] = await db
      .select()
      .from(jobTasks)
      .where(and(eq(jobTasks.ticketId, ticket.id), eq(jobTasks.phase, 'resolution')))
    expect(updatedTask?.status).toBe('completed')
    expect(updatedTask?.completedAt).not.toBeNull()

    const [draft] = await db
      .select()
      .from(resolutionDrafts)
      .where(eq(resolutionDrafts.ticketId, ticket.id))
    expect(draft?.version).toBe(1)
    expect(draft?.output).toMatchObject(stubOutput)
    expect(draft?.processingTimeMs).toBeGreaterThanOrEqual(0)
    expect(draft?.modelVersion).toBeTruthy()

    expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"type":"ticket_started"'))
    expect(mockWs.send).toHaveBeenCalledWith(expect.stringContaining('"type":"ticket_success"'))
    expect(mockWs.close).toHaveBeenCalledOnce()

    await cleanupTicket(ticket.id)
  })

  test('phase guard — skips processing if job_task already completed', async () => {
    const ticket = await insertTicketWithTriage()

    await db
      .update(jobTasks)
      .set({ status: 'completed' })
      .where(and(eq(jobTasks.ticketId, ticket.id), eq(jobTasks.phase, 'resolution')))

    await sqsSetup.send(new PurgeQueueCommand({ QueueUrl: queueUrl }))

    const message: SQSMessage = { ticket_id: ticket.id, phase: 'resolution', retry_count: 0 }
    await processResolutionMessage(message, stubAI)

    const [t] = await db.select().from(tickets).where(eq(tickets.id, ticket.id))
    expect(t?.resolutionOutput).toBeNull()

    await cleanupTicket(ticket.id)
  })

  test('failure retry < 3 — sets job_task failed, re-enqueues resolution with delay', async () => {
    const ticket = await insertTicketWithTriage()
    await sqsSetup.send(new PurgeQueueCommand({ QueueUrl: queueUrl }))

    const message: SQSMessage = { ticket_id: ticket.id, phase: 'resolution', retry_count: 1 }
    await processResolutionMessage(message, failingAI)

    const [task] = await db
      .select()
      .from(jobTasks)
      .where(and(eq(jobTasks.ticketId, ticket.id), eq(jobTasks.phase, 'resolution')))
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
    const ticket = await insertTicketWithTriage()
    await sqsSetup.send(new PurgeQueueCommand({ QueueUrl: queueUrl }))

    const mockWs = { send: vi.fn(), close: vi.fn() }
    roomManager.join(ticket.id, mockWs)

    const message: SQSMessage = { ticket_id: ticket.id, phase: 'resolution', retry_count: 2 }
    await processResolutionMessage(message, failingAI)

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
    expect(dlqBody).toMatchObject({ ticket_id: ticket.id, phase: 'resolution', reason: 'Bedrock unavailable' })
    expect(dlqBody.failed_at).toBeTruthy()

    // Fallback resolution draft written
    const [draft] = await db.select().from(resolutionDrafts).where(eq(resolutionDrafts.ticketId, ticket.id))
    expect(draft?.output).toMatchObject({ requires_escalation: true, confidence: 0 })

    await cleanupTicket(ticket.id)
  })
})
