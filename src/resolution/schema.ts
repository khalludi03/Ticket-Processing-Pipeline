import { z } from 'zod'

export const resolutionOutputSchema = z.object({
  suggested_reply: z.string(),
  internal_note: z.string(),
  resolution_steps: z.array(z.string()),
  requires_escalation: z.boolean(),
  escalation_reason: z.string().optional(),
  confidence: z.number().min(0).max(1),
})

export type ResolutionOutput = z.infer<typeof resolutionOutputSchema>
