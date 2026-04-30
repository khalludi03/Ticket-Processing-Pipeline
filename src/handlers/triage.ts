import { config } from '../config.ts'
import { sendToQueue, sendToDLQ } from '../queue/client.ts'
import type { SQSMessage } from '../schemas/queue.ts'
import { callTriageAI, type TicketRow } from '../ai/triage.ts'
import type { TriageOutput } from '../schemas/triage.ts'
import {
  getTicket,
  setJobTaskProcessing,
  setTriageCompleted,
  setNeedsManualReview,
  setTriageFallback,
  setReplayCompleted,
  setReplayFailed,
} from '../repositories/tickets.repository.ts'
import { roomManager } from '../realtime/room-manager.ts'
import { logger } from '../logger.ts'

export async function processTriageMessage(
  message: SQSMessage,
  aiCall: (ticket: TicketRow) => Promise<TriageOutput> = callTriageAI,
): Promise<void> {
  const { ticket_id, replay_id } = message
  const log = logger.child({ ticketId: ticket_id, phase: 'triage' })

  const ticket = await getTicket(ticket_id)
  if (!ticket) {
    log.error('ticket not found')
    if (replay_id) await setReplayFailed(replay_id, 'Ticket not found')
    return
  }

  if (ticket.triageOutput !== null) {
    log.info('skipping already-triaged ticket')
    if (replay_id) await setReplayCompleted(replay_id, { skipped: true })
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
    if (replay_id) await setReplayCompleted(replay_id, { output })
    roomManager.emit(ticket_id, { type: 'phase_complete', ticket_id, phase: 'triage', timestamp: new Date().toISOString() })
    await sendToQueue(config.SQS_QUEUE_URL, { ticket_id, phase: 'resolution' })
    log.info({ processingTimeMs }, 'triage completed')
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err)
    if (replay_id) await setReplayFailed(replay_id, error)
    await setTriageFallback(ticket_id, error)
    await setNeedsManualReview(ticket_id, error)
    await sendToDLQ(config.SQS_DLQ_URL, ticket_id, 'triage', error)
    roomManager.emit(ticket_id, { type: 'ticket_failed', ticket_id, reason: error, timestamp: new Date().toISOString() })
    roomManager.close(ticket_id)
    log.warn({ error }, 'triage failed, fallback applied')
  }
}
