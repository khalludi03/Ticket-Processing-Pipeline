import { Hono } from 'hono'
import { z } from 'zod'
import { authMiddleware } from '../middleware/auth.ts'
import { submitTicket } from '../services/tickets.service.ts'

const submitSchema = z.object({
  title: z.string().min(1).max(500),
  description: z.string().min(1).max(5000),
  customer_id: z.string().min(1),
  channel: z.enum(['email', 'chat', 'web']),
  attachments: z.array(z.record(z.string(), z.unknown())).optional(),
  tags: z.array(z.string()).optional(),
  priority_hint: z.enum(['low', 'medium', 'high']).optional(),
})

export const ticketsController = new Hono()

ticketsController.post('/', authMiddleware, async (c) => {
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
})
