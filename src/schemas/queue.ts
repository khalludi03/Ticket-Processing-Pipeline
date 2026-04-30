import { z } from 'zod'

export const sqsMessageSchema = z.object({
  ticket_id: z.string().uuid(),
  phase: z.enum(['triage', 'resolution']),
  replay_id: z.string().uuid().optional(),
})

export type SQSMessage = z.infer<typeof sqsMessageSchema>
