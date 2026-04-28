import { Hono } from 'hono'
import { authMiddleware } from '../middleware/auth.ts'
import { rateLimitMiddleware } from '../middleware/rate-limit.ts'
import { createTicket, getTicket, getTicketResultHandler, replayTicketHandler } from '../controllers/tickets.controller.ts'

export const ticketsRoute = new Hono()

ticketsRoute.post('/', rateLimitMiddleware, authMiddleware, createTicket)
ticketsRoute.get('/:id', authMiddleware, getTicket)
ticketsRoute.get('/:id/result', authMiddleware, getTicketResultHandler)
ticketsRoute.post('/:id/replay', authMiddleware, replayTicketHandler)
