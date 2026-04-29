import { SendMessageCommand } from '@aws-sdk/client-sqs'
import { createSQSClient } from '../queue/client.ts'
import { config } from '../config.ts'
import type { SQSMessage } from '../schemas/queue.ts'
import { callResolutionAI, type TicketRow } from '../ai/resolution.ts'
import type { TriageOutput } from '../schemas/triage.ts'
import type { ResolutionOutput } from '../schemas/resolution.ts'
import {
  getTicketForResolution,
  setJobTaskProcessing,
  insertResolutionDraft,
  setJobTaskFailed,
  setNeedsManualReview,
  setResolutionFallback,
} from '../repositories/tickets.repository.ts'
import { roomManager } from '../realtime/room-manager.ts'
import { logger } from '../logger.ts'

export async function processResolutionMessage(
  message: SQSMessage,
  aiCall: (ticket: TicketRow, triage: TriageOutput) => Promise<ResolutionOutput> = callResolutionAI,
): Promise<void> {
  const { ticket_id } = message
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
    roomManager.emit(ticket_id, { type: 'phase_progress', ticket_id, phase: 'resolution', timestamp: new Date().toISOString() })
    const start = Date.now()
    const output = await aiCall(ticket, triage)
    const processingTimeMs = Date.now() - start
    await insertResolutionDraft(ticket_id, output, processingTimeMs, config.OPENROUTER_MODEL_RESOLUTION)
    roomManager.emit(ticket_id, { type: 'phase_complete', ticket_id, phase: 'resolution', timestamp: new Date().toISOString() })
    roomManager.emit(ticket_id, { type: 'ticket_success', ticket_id, timestamp: new Date().toISOString() })
    roomManager.close(ticket_id)
    log.info({ processingTimeMs }, 'resolution completed')
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)

    await setJobTaskFailed(ticket_id, 'resolution', error, 0)
    log.warn({ err }, 'resolution failed after Portkey retries')

    await setResolutionFallback(ticket_id)
    await setNeedsManualReview(ticket_id, error)
    await sendToDLQ(ticket_id, 'resolution', error)
    roomManager.emit(ticket_id, { type: 'ticket_failed', ticket_id, reason: error, timestamp: new Date().toISOString() })
    roomManager.close(ticket_id)
    log.warn('resolution fallback applied after Portkey exhaustion')
  }
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
