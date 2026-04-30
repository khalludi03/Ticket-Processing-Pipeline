import { sendToQueue } from '../queue/client.ts'
import { config } from '../config.ts'
import {
  insertTicketWithJobTask,
  setTicketFailed,
  getTicket,
  resetJobTaskForReplay,
} from '../repositories/tickets.repository.ts'
import type { NewTicket } from '../repositories/tickets.repository.ts'

export async function submitTicket(data: NewTicket) {
  const ticket = await insertTicketWithJobTask(data)

  try {
    await sendToQueue(config.SQS_QUEUE_URL, { ticket_id: ticket.id, phase: 'triage' })
  } catch (err) {
    await setTicketFailed(ticket.id, err instanceof Error ? err.message : 'Unknown error')
    throw err
  }

  return { ticket_id: ticket.id, status: 'queued' as const }
}

export async function replayTicket(ticketId: string) {
  const ticket = await getTicket(ticketId)
  if (!ticket) return { error: 'not_found' } as const

  if (ticket.status === 'processing') return { error: 'already_processing' } as const
  if (ticket.status !== 'needs_manual_review') return { error: 'not_eligible' } as const

  const phase: 'triage' | 'resolution' = ticket.triageFallbackUsed ? 'triage' : 'resolution'

  const replayId = await resetJobTaskForReplay(ticketId, phase)
  await sendToQueue(config.SQS_QUEUE_URL, { ticket_id: ticketId, phase, replay_id: replayId })

  return { ticket_id: ticketId, phase, status: 'queued' as const }
}
