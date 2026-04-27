import { SendMessageCommand } from '@aws-sdk/client-sqs'
import { createSQSClient } from '../queue/client.ts'
import { insertTicketWithJobTask, setTicketFailed } from '../repositories/tickets.repository.ts'
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
          retry_count: 0,
        }),
      })
    )
  } catch (err) {
    await setTicketFailed(ticket.id, err instanceof Error ? err.message : 'Unknown error')
    throw err
  }

  return { ticket_id: ticket.id, status: 'queued' as const }
}
