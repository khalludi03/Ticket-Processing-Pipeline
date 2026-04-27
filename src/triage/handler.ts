import { SendMessageCommand } from '@aws-sdk/client-sqs'
import { createSQSClient } from '../queue/client.ts'
import { config } from '../config.ts'
import type { SQSMessage } from '../queue/schema.ts'
import { callTriageAI, type TicketRow } from './ai.ts'
import type { TriageOutput } from './schema.ts'
import {
  getTicketForTriage,
  setJobTaskProcessing,
  setTriageCompleted,
  setJobTaskFailed,
  setNeedsManualReview,
  setTriageFallback,
} from '../repositories/tickets.repository.ts'
import { roomManager } from '../realtime/room-manager.ts'
import { logger } from '../logger.ts'

const MAX_RETRIES = 3

export async function processTriageMessage(
  message: SQSMessage,
  aiCall: (ticket: TicketRow) => Promise<TriageOutput> = callTriageAI,
): Promise<void> {
  const { ticket_id, retry_count } = message
  const log = logger.child({ ticketId: ticket_id, phase: 'triage' })

  const row = await getTicketForTriage(ticket_id)
  if (!row) {
    log.error('ticket not found')
    return
  }

  const { ticket, jobTask } = row

  if (jobTask.status === 'completed') {
    log.info('skipping already-completed ticket')
    return
  }

  await setJobTaskProcessing(ticket_id, 'triage')
  roomManager.emit(ticket_id, { type: 'ticket_started', ticket_id, phase: 'triage', timestamp: new Date().toISOString() })
  log.info('triage started')

  try {
    const start = Date.now()
    const output = await aiCall(ticket)
    const processingTimeMs = Date.now() - start
    await setTriageCompleted(ticket_id, output, processingTimeMs, config.BEDROCK_MODEL_ID)
    await enqueueResolution(ticket_id)
    log.info({ processingTimeMs }, 'triage completed')
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    const newRetryCount = retry_count + 1

    await setJobTaskFailed(ticket_id, 'triage', error, newRetryCount)
    log.warn({ retryCount: newRetryCount, err }, 'triage failed')

    if (newRetryCount < MAX_RETRIES) {
      await reEnqueue(ticket_id, newRetryCount)
    } else {
      await setTriageFallback(ticket_id)
      await setNeedsManualReview(ticket_id, error)
      await sendToDLQ(ticket_id, 'triage', newRetryCount, error)
      roomManager.emit(ticket_id, { type: 'ticket_failed', ticket_id, reason: error, timestamp: new Date().toISOString() })
      roomManager.close(ticket_id)
      log.warn({ retryCount: newRetryCount }, 'triage retries exhausted — fallback applied')
    }
  }
}

async function enqueueResolution(ticketId: string): Promise<void> {
  const client = createSQSClient()
  await client.send(
    new SendMessageCommand({
      QueueUrl: config.SQS_QUEUE_URL,
      MessageBody: JSON.stringify({ ticket_id: ticketId, phase: 'resolution', retry_count: 0 }),
    }),
  )
}

async function reEnqueue(ticketId: string, retryCount: number): Promise<void> {
  const client = createSQSClient()
  await client.send(
    new SendMessageCommand({
      QueueUrl: config.SQS_QUEUE_URL,
      MessageBody: JSON.stringify({ ticket_id: ticketId, phase: 'triage', retry_count: retryCount }),
      DelaySeconds: Math.pow(2, retryCount),
    }),
  )
}

async function sendToDLQ(ticketId: string, phase: string, retryCount: number, reason: string): Promise<void> {
  const client = createSQSClient()
  await client.send(
    new SendMessageCommand({
      QueueUrl: config.SQS_DLQ_URL,
      MessageBody: JSON.stringify({
        ticket_id: ticketId,
        phase,
        retry_count: retryCount,
        failed_at: new Date().toISOString(),
        reason,
      }),
    }),
  )
}
