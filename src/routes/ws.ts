import { Hono } from 'hono'
import { z } from 'zod'
import type { upgradeWebSocket } from '@hono/node-server'
import { roomManager } from '../realtime/room-manager.ts'

const joinSchema = z.object({
  type: z.literal('join'),
  ticket_id: z.string().uuid(),
})

export function registerWsRoute(app: Hono, upgradeWebSocket: typeof import('@hono/node-server').upgradeWebSocket) {
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
}
