import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs'

export const sqsClient = new SQSClient({
  region: 'us-east-1',
  credentials: {
    accessKeyId: 'test',
    secretAccessKey: 'test',
  },
  ...(process.env.SQS_ENDPOINT ? { endpoint: process.env.SQS_ENDPOINT } : {}),
})

export async function sendToQueue(queueUrl: string, body: object, delaySeconds?: number): Promise<void> {
  await sqsClient.send(new SendMessageCommand({
    QueueUrl: queueUrl,
    MessageBody: JSON.stringify(body),
    ...(delaySeconds !== undefined ? { DelaySeconds: delaySeconds } : {}),
  }))
}

export async function sendToDLQ(dlqUrl: string, ticketId: string, phase: string, reason: string): Promise<void> {
  await sendToQueue(dlqUrl, { ticket_id: ticketId, phase, failed_at: new Date().toISOString(), reason })
}
