import { z } from 'zod'

export const sqsMessageSchema = z.object({
  ticket_id: z.string().uuid(),
  phase: z.enum(['triage', 'resolution']),
  retry_count: z.number().int().min(0),
})

export type SQSMessage = z.infer<typeof sqsMessageSchema>
