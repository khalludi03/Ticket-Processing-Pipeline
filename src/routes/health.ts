import { Hono } from 'hono'
import { sql } from 'drizzle-orm'
import { GetQueueAttributesCommand } from '@aws-sdk/client-sqs'
import { db } from '../db/index.ts'
import { createSQSClient } from '../queue/client.ts'
import { config } from '../config.ts'

export const healthRoute = new Hono()

healthRoute.get('/', async (c) => {
  const checks: { db: 'ok' | 'error'; sqs: 'ok' | 'error' } = { db: 'ok', sqs: 'ok' }

  try {
    await db.execute(sql`SELECT 1`)
  } catch {
    checks.db = 'error'
  }

  try {
    await createSQSClient().send(
      new GetQueueAttributesCommand({ QueueUrl: config.SQS_QUEUE_URL, AttributeNames: ['QueueArn'] }),
    )
  } catch {
    checks.sqs = 'error'
  }

  const status = checks.db === 'ok' && checks.sqs === 'ok' ? 'ok' : 'degraded'
  return c.json({ status, uptime: process.uptime(), timestamp: new Date().toISOString(), checks }, status === 'ok' ? 200 : 503)
})
