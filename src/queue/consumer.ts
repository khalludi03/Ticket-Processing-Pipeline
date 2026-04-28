import { ReceiveMessageCommand, DeleteMessageCommand } from '@aws-sdk/client-sqs'
import { createSQSClient } from './client.ts'
import { config } from '../config.ts'
import { sqsMessageSchema } from '../schemas/queue.ts'
import { processTriageMessage } from '../handlers/triage.ts'
import { processResolutionMessage } from '../handlers/resolution.ts'
import { logger } from '../logger.ts'

const POLL_WAIT_SECONDS = 20
const MAX_MESSAGES = 10

export async function startConsumer(): Promise<void> {
  const client = createSQSClient()
  logger.info({ queueUrl: config.SQS_QUEUE_URL }, 'consumer starting')

  while (true) {
    const res = await client.send(
      new ReceiveMessageCommand({
        QueueUrl: config.SQS_QUEUE_URL,
        MaxNumberOfMessages: MAX_MESSAGES,
        WaitTimeSeconds: POLL_WAIT_SECONDS,
      }),
    )

    const messages = res.Messages ?? []

    await Promise.all(
      messages.map(async (raw) => {
        const parsed = sqsMessageSchema.safeParse(JSON.parse(raw.Body ?? '{}'))

        if (!parsed.success) {
          logger.error({ body: raw.Body }, 'invalid message shape, skipping')
          return
        }

        const message = parsed.data
        try {
          if (message.phase === 'triage') {
            await processTriageMessage(message)
          } else {
            await processResolutionMessage(message)
          }

          await client.send(
            new DeleteMessageCommand({
              QueueUrl: config.SQS_QUEUE_URL,
              ReceiptHandle: raw.ReceiptHandle!,
            }),
          )
        } catch (err) {
          logger.error({ ticketId: message.ticket_id, err }, 'unhandled error processing message')
        }
      }),
    )
  }
}
