import { Hono } from 'hono'
import { z } from 'zod'
import { sql } from 'drizzle-orm'
import { GetQueueAttributesCommand } from '@aws-sdk/client-sqs'
import { ticketsController } from './controllers/tickets.controller.ts'
import { config } from './config.ts'
import { db } from './db/index.ts'
import { createSQSClient } from './queue/client.ts'
import { roomManager } from './realtime/room-manager.ts'
import { logger } from './logger.ts'

const app = new Hono()

app.get('/health', async (c) => {
  const checks: { db: 'ok' | 'error'; sqs: 'ok' | 'error' } = { db: 'ok', sqs: 'ok' }

  await db.execute(sql`SELECT 1`).catch(() => { checks.db = 'error' })

  await createSQSClient()
    .send(new GetQueueAttributesCommand({ QueueUrl: config.SQS_QUEUE_URL, AttributeNames: ['QueueArn'] }))
    .catch(() => { checks.sqs = 'error' })

  const status = checks.db === 'ok' && checks.sqs === 'ok' ? 'ok' : 'degraded'
  return c.json({ status, uptime: process.uptime(), timestamp: new Date().toISOString(), checks }, status === 'ok' ? 200 : 503)
})

app.route('/tickets', ticketsController)

app.onError((err, c) => {
  logger.error({ err }, 'unhandled request error')
  return c.json({ error: 'Internal server error' }, 500)
})

export default app

if (process.env.NODE_ENV !== 'test') {
  const { serve, upgradeWebSocket } = await import('@hono/node-server')
  const { WebSocketServer } = await import('ws')

  const wss = new WebSocketServer({ noServer: true })

  const joinSchema = z.object({
    type: z.literal('join'),
    ticket_id: z.string().uuid(),
  })

  app.get('/ws', upgradeWebSocket(() => ({
    onMessage(event, ws) {
      try {
        const parsed = joinSchema.safeParse(JSON.parse(String(event.data)))
        if (!parsed.success) return
        roomManager.join(parsed.data.ticket_id, ws)
      } catch {
        // ignore malformed messages
      }
    },
    onClose(_, ws) {
      roomManager.disconnect(ws)
    },
  })))

  serve({ fetch: app.fetch, port: config.PORT, websocket: { server: wss } }, (info) => {
    logger.info({ port: info.port }, 'server listening')
  })

  const { startConsumer } = await import('./queue/consumer.ts')
  startConsumer().catch((err) => {
    logger.error({ err }, 'consumer fatal error')
    process.exit(1)
  })
}
