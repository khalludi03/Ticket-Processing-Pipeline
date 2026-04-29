import { SendMessageCommand } from '@aws-sdk/client-sqs'
import { createSQSClient } from '../queue/client.ts'
import { insertTicketWithJobTask, setTicketFailed, getTicketForReplay, resetJobTaskForReplay } from '../repositories/tickets.repository.ts'
import type { NewTicket } from '../repositories/tickets.repository.ts'

export async function submitTicket(data: NewTicket) {
  const ticket = await insertTicketWithJobTask(data)

  try {
    const client = createSQSClient()
    await client.send(
      new SendMessageCommand({
        QueueUrl: process.env.SQS_QUEUE_URL!,
        MessageBody: JSON.stringify({
          ticket_id: ticket.id,
          phase: 'triage',
        }),
      }),
    )
  } catch (err) {
    await setTicketFailed(ticket.id, err instanceof Error ? err.message : 'Unknown error')
    throw err
  }

  return { ticket_id: ticket.id, status: 'queued' as const }
}

export async function replayTicket(ticketId: string) {
  const row = await getTicketForReplay(ticketId)
  if (!row) return { error: 'not_found' } as const

  if (row.ticket.status !== 'needs_manual_review') {
    return { error: 'not_eligible' } as const
  }

  const isProcessing = row.tasks.some((t) => t.status === 'processing')
  if (isProcessing) return { error: 'already_processing' } as const

  const failedTask = row.tasks.find((t) => t.status === 'failed')
  const phase = (failedTask?.phase ?? 'triage') as 'triage' | 'resolution'

  await resetJobTaskForReplay(ticketId, phase)

  const client = createSQSClient()
  await client.send(
    new SendMessageCommand({
      QueueUrl: process.env.SQS_QUEUE_URL!,
      MessageBody: JSON.stringify({ ticket_id: ticketId, phase }),
    }),
  )

  return { ticket_id: ticketId, phase, status: 'queued' as const }
}
