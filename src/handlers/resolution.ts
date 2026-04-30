import { config } from '../config.ts'
import { sendToDLQ } from '../queue/client.ts'
import type { SQSMessage } from '../schemas/queue.ts'
import { callResolutionAI, type TicketRow } from '../ai/resolution.ts'
import type { TriageOutput } from '../schemas/triage.ts'
import type { ResolutionOutput } from '../schemas/resolution.ts'
import {
  getTicket,
  setJobTaskProcessing,
  insertResolutionDraft,
  setNeedsManualReview,
  setResolutionFallback,
  setReplayCompleted,
  setReplayFailed,
} from '../repositories/tickets.repository.ts'
import { roomManager } from '../realtime/room-manager.ts'
import { logger } from '../logger.ts'

export async function processResolutionMessage(
  message: SQSMessage,
  aiCall: (ticket: TicketRow, triage: TriageOutput) => Promise<ResolutionOutput> = callResolutionAI,
): Promise<void> {
  const { ticket_id, replay_id } = message
  const log = logger.child({ ticketId: ticket_id, phase: 'resolution' })

  const ticket = await getTicket(ticket_id)
  if (!ticket) {
    log.error('ticket not found')
    if (replay_id) await setReplayFailed(replay_id, 'Ticket not found')
    return
  }

  if (ticket.resolutionOutput !== null) {
    log.info('skipping already-resolved ticket')
    if (replay_id) await setReplayCompleted(replay_id, { skipped: true })
    return
  }

  const triage = ticket.triageOutput as TriageOutput
  if (!triage) {
    log.error('missing triage_output')
    if (replay_id) await setReplayFailed(replay_id, 'Missing triage output')
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
    if (replay_id) await setReplayCompleted(replay_id, { output })
    roomManager.emit(ticket_id, { type: 'phase_complete', ticket_id, phase: 'resolution', timestamp: new Date().toISOString() })
    roomManager.emit(ticket_id, { type: 'ticket_success', ticket_id, timestamp: new Date().toISOString() })
    roomManager.close(ticket_id)
    log.info({ processingTimeMs }, 'resolution completed')
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    if (replay_id) await setReplayFailed(replay_id, error)
    await setResolutionFallback(ticket_id, error)
    await setNeedsManualReview(ticket_id, error)
    await sendToDLQ(config.SQS_DLQ_URL, ticket_id, 'resolution', error)
    roomManager.emit(ticket_id, { type: 'ticket_failed', ticket_id, reason: error, timestamp: new Date().toISOString() })
    roomManager.close(ticket_id)
    log.warn({ error }, 'resolution failed, fallback applied')
  }
}
