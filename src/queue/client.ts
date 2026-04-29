import { SQSClient } from '@aws-sdk/client-sqs'

export function createSQSClient(): SQSClient {
  return new SQSClient({
    region: 'us-east-1',
    credentials: {
      accessKeyId: 'test',
      secretAccessKey: 'test',
    },
    ...(process.env.SQS_ENDPOINT ? { endpoint: process.env.SQS_ENDPOINT } : {}),
  })
}
