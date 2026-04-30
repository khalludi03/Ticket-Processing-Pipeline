import { SendMessageCommand } from '@aws-sdk/client-sqs'
import { createSQSClient } from '../queue/client.ts'
import { config } from '../config.ts'
import type { SQSMessage } from '../schemas/queue.ts'
import { callTriageAI, type TicketRow } from '../ai/triage.ts'
import type { TriageOutput } from '../schemas/triage.ts'
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

export async function processTriageMessage(
  message: SQSMessage,
  aiCall: (ticket: TicketRow) => Promise<TriageOutput> = callTriageAI,
): Promise<void> {
  const { ticket_id } = message
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
    roomManager.emit(ticket_id, { type: 'phase_progress', ticket_id, phase: 'triage', timestamp: new Date().toISOString() })
    const start = Date.now()
    const output = await aiCall(ticket)
    const processingTimeMs = Date.now() - start
    await setTriageCompleted(ticket_id, output, processingTimeMs, config.OPENROUTER_MODEL_TRIAGE)
    roomManager.emit(ticket_id, { type: 'phase_complete', ticket_id, phase: 'triage', timestamp: new Date().toISOString() })
    await enqueueResolution(ticket_id)
    log.info({ processingTimeMs }, 'triage completed')
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    
    // Portkey handles retries - just log the final failure
    await setJobTaskFailed(ticket_id, 'triage', error, 0)
    log.warn({ err }, 'triage failed after Portkey retries')

    await setTriageFallback(ticket_id, error)
    await setNeedsManualReview(ticket_id, error)
    await sendToDLQ(ticket_id, 'triage', error)
    roomManager.emit(ticket_id, { type: 'ticket_failed', ticket_id, reason: error, timestamp: new Date().toISOString() })
    roomManager.close(ticket_id)
    log.warn('triage fallback applied after Portkey exhaustion')
  }
}

async function enqueueResolution(ticketId: string): Promise<void> {
  const client = createSQSClient()
  await client.send(
    new SendMessageCommand({
      QueueUrl: config.SQS_QUEUE_URL,
      MessageBody: JSON.stringify({ ticket_id: ticketId, phase: 'resolution' }),
    }),
  )
}

async function sendToDLQ(ticketId: string, phase: string, reason: string): Promise<void> {
  const client = createSQSClient()
  await client.send(
    new SendMessageCommand({
      QueueUrl: config.SQS_DLQ_URL,
      MessageBody: JSON.stringify({
        ticket_id: ticketId,
        phase,
        failed_at: new Date().toISOString(),
        reason,
      }),
    }),
  )
}
