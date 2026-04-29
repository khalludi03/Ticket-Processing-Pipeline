import type { Context } from 'hono'
import { z } from 'zod'
import { submitTicket, replayTicket } from '../services/tickets.service.ts'
import { getTicketStatus, getTicketResult } from '../repositories/tickets.repository.ts'
import { logger } from '../logger.ts'

const submitSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().min(1).max(5000),
  customer_id: z.string().min(1),
  channel: z.enum(['email', 'chat', 'web']),
  attachments: z.array(z.record(z.string(), z.unknown())).optional(),
  tags: z.array(z.string()).optional(),
  priority_hint: z.enum(['low', 'medium', 'high']).optional(),
})

export async function createTicket(c: Context) {
  try {
    const body = await c.req.json().catch(() => null)

    if (!body) {
      return c.json({ error: 'Invalid JSON body' }, 400)
    }

    const result = submitSchema.safeParse(body)
    if (!result.success) {
      return c.json(
        {
          error: 'Validation failed',
          issues: result.error.issues.map((i) => ({
            field: i.path.join('.'),
            message: i.message,
          })),
        },
        400,
      )
    }

    const { title, description, customer_id, channel, attachments, tags, priority_hint } = result.data

    const response = await submitTicket({
      title,
      description,
      customerId: customer_id,
      channel,
      attachments: attachments ?? null,
      tags: tags ?? null,
      priorityHint: priority_hint ?? null,
    })

    return c.json(response, 201)
  } catch (err) {
    logger.error({ err }, 'failed to submit ticket')
    return c.json({ error: 'Internal server error' }, 500)
  }
}

export async function getTicket(c: Context) {
  try {
    const id = c.req.param('id')

    if (!id || !z.string().uuid().safeParse(id).success) {
      return c.json({ error: 'Invalid ticket ID format' }, 400)
    }

    const result = await getTicketStatus(id)
    if (!result) return c.json({ error: 'Ticket not found' }, 404)
    return c.json(result)
  } catch (err) {
    logger.error({ err }, 'failed to get ticket status')
    return c.json({ error: 'Internal server error' }, 500)
  }
}

export async function replayTicketHandler(c: Context) {
  try {
    const id = c.req.param('id')

    if (!id || !z.string().uuid().safeParse(id).success) {
      return c.json({ error: 'Invalid ticket ID format' }, 400)
    }

    const result = await replayTicket(id)

    if ('error' in result) {
      if (result.error === 'not_found') return c.json({ error: 'Ticket not found' }, 404)
      if (result.error === 'not_eligible') return c.json({ error: 'Ticket is not in needs_manual_review status' }, 422)
      if (result.error === 'already_processing') return c.json({ error: 'Ticket phase is currently processing' }, 409)
    }

    return c.json(result, 202)
  } catch (err) {
    logger.error({ err }, 'failed to replay ticket')
    return c.json({ error: 'Internal server error' }, 500)
  }
}

export async function getTicketResultHandler(c: Context) {
  try {
    const id = c.req.param('id')

    if (!id || !z.string().uuid().safeParse(id).success) {
      return c.json({ error: 'Invalid ticket ID format' }, 400)
    }

    const result = await getTicketResult(id)
    if (!result) return c.json({ error: 'Ticket not found' }, 404)

    const pendingStatuses = ['queued', 'processing', 'failed']
    if (pendingStatuses.includes(result.status)) {
      return c.json({ error: 'Ticket processing not yet complete' }, 409)
    }

    return c.json(result)
  } catch (err) {
    logger.error({ err }, 'failed to get ticket result')
    return c.json({ error: 'Internal server error' }, 500)
  }
}
