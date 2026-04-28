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

export const RESOLUTION_FALLBACK: ResolutionOutput = {
  suggested_reply:
    'Thank you for contacting us. We have received your request and a support agent will follow up with you shortly.',
  internal_note: 'Automated resolution unavailable — manual handling required.',
  resolution_steps: ['Assign to support queue for manual review'],
  requires_escalation: true,
  confidence: 0,
}
