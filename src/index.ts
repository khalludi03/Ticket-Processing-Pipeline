import { Hono } from 'hono'
import { ticketsRoute } from './routes/tickets.ts'
import { healthRoute } from './routes/health.ts'
import { config } from './config.ts'
import { logger } from './logger.ts'

const app = new Hono()

app.route('/health', healthRoute)
app.route('/tickets', ticketsRoute)

app.onError((err, c) => {
  logger.error({ err }, 'unhandled request error')
  return c.json({ error: 'Internal server error' }, 500)
})

export default app

if (process.env.NODE_ENV !== 'test') {
  const { serve, upgradeWebSocket } = await import('@hono/node-server')
  const { WebSocketServer } = await import('ws')
  const { registerWsRoute } = await import('./routes/ws.ts')

  const wss = new WebSocketServer({ noServer: true })

  registerWsRoute(app, upgradeWebSocket)

  serve({ fetch: app.fetch, port: config.PORT, websocket: { server: wss } }, (info) => {
    logger.info({ port: info.port }, 'server listening')
  })

  const { startConsumer } = await import('./queue/consumer.ts')
  startConsumer().catch((err) => {
    logger.error({ err }, 'consumer fatal error')
    process.exit(1)
  })
}
