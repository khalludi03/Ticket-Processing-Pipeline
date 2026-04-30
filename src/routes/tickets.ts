import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.ts'
import { rateLimitMiddleware } from '../middleware/rate-limit.ts'
import { createTicket, getTicket, getTicketResultHandler, replayTicketHandler, manualReplyHandler } from '../controllers/tickets.controller.ts'
import { logger } from '../logger.ts'

export const ticketsRoute = new Hono()

ticketsRoute.post('/', rateLimitMiddleware, authMiddleware, createTicket)
ticketsRoute.get('/:id', authMiddleware, getTicket)
ticketsRoute.get('/:id/result', authMiddleware, getTicketResultHandler)
ticketsRoute.post('/:id/replay', authMiddleware, replayTicketHandler)
ticketsRoute.post('/:id/reply', authMiddleware, manualReplyHandler)
