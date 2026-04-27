import type { SQSMessage } from '../queue/schema.ts'
import { callResolutionAI, type TicketRow } from './ai.ts'
import type { TriageOutput } from '../triage/schema.ts'
import type { ResolutionOutput } from './schema.ts'
import {
  getTicketForResolution,
  setJobTaskProcessing,
  insertResolutionDraft,
  setJobTaskFailed,
  setNeedsManualReview,
  setResolutionFallback,
} from '../repositories/tickets.repository.ts'
import { SendMessageCommand } from '@aws-sdk/client-sqs'
import { createSQSClient } from '../queue/client.ts'
import { config } from '../config.ts'
import { roomManager } from '../realtime/room-manager.ts'
import { logger } from '../logger.ts'

const MAX_RETRIES = 3

export async function processResolutionMessage(
  message: SQSMessage,
  aiCall: (ticket: TicketRow, triage: TriageOutput) => Promise<ResolutionOutput> = callResolutionAI,
): Promise<void> {
  const { ticket_id, retry_count } = message
  const log = logger.child({ ticketId: ticket_id, phase: 'resolution' })

  const row = await getTicketForResolution(ticket_id)
  if (!row) {
    log.error('ticket not found')
    return
  }

  const { ticket, jobTask } = row

  if (jobTask.status === 'completed') {
    log.info('skipping already-completed ticket')
    return
  }

  const triage = ticket.triageOutput as TriageOutput
  if (!triage) {
    log.error('missing triage_output')
    return
  }

  await setJobTaskProcessing(ticket_id, 'resolution')
  roomManager.emit(ticket_id, { type: 'ticket_started', ticket_id, phase: 'resolution', timestamp: new Date().toISOString() })
  log.info('resolution started')

  try {
    const start = Date.now()
    const output = await aiCall(ticket, triage)
    const processingTimeMs = Date.now() - start
    await insertResolutionDraft(ticket_id, output, processingTimeMs, config.BEDROCK_MODEL_ID)
    roomManager.emit(ticket_id, { type: 'ticket_success', ticket_id, timestamp: new Date().toISOString() })
    roomManager.close(ticket_id)
    log.info({ processingTimeMs }, 'resolution completed')
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    const newRetryCount = retry_count + 1

    await setJobTaskFailed(ticket_id, 'resolution', error, newRetryCount)
    log.warn({ retryCount: newRetryCount, err }, 'resolution failed')

    if (newRetryCount < MAX_RETRIES) {
      await reEnqueue(ticket_id, newRetryCount)
    } else {
      await setResolutionFallback(ticket_id)
      await setNeedsManualReview(ticket_id, error)
      await sendToDLQ(ticket_id, 'resolution', newRetryCount, error)
      roomManager.emit(ticket_id, { type: 'ticket_failed', ticket_id, reason: error, timestamp: new Date().toISOString() })
      roomManager.close(ticket_id)
      log.warn({ retryCount: newRetryCount }, 'resolution retries exhausted — fallback applied')
    }
  }
}

async function reEnqueue(ticketId: string, retryCount: number): Promise<void> {
  const client = createSQSClient()
  await client.send(
    new SendMessageCommand({
      QueueUrl: config.SQS_QUEUE_URL,
      MessageBody: JSON.stringify({ ticket_id: ticketId, phase: 'resolution', retry_count: retryCount }),
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
