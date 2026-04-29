import { z } from 'zod'

export const sqsMessageSchema = z.object({
  ticket_id: z.string().uuid(),
  phase: z.enum(['triage', 'resolution']),
})

export type SQSMessage = z.infer<typeof sqsMessageSchema>
