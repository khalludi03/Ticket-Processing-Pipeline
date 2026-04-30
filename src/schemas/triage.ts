import { z } from 'zod'

export const triageOutputSchema = z.object({
  category: z.enum(['billing', 'technical', 'account', 'general']),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  summary: z.string(),
  sentiment: z.enum(['positive', 'neutral', 'negative', 'frustrated']),
  suggested_tags: z.array(z.string()),
  escalation_need: z.boolean().default(false),
  routing_target: z.string().default('general'),
  confidence: z.number().min(0).max(1),
})

export type TriageOutput = z.infer<typeof triageOutputSchema>

export const TRIAGE_FALLBACK: TriageOutput = {
  category: 'general',
  priority: 'medium',
  sentiment: 'neutral',
  summary: 'Automated triage unavailable — manual review required.',
  suggested_tags: [],
  escalation_need: true,
  routing_target: 'manual_review',
  confidence: 0,
}
