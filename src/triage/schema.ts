import { z } from 'zod'

export const triageOutputSchema = z.object({
  category: z.enum(['billing', 'technical', 'account', 'general']),
  priority: z.enum(['low', 'medium', 'high', 'critical']),
  summary: z.string(),
  sentiment: z.enum(['positive', 'neutral', 'negative', 'frustrated']),
  suggested_tags: z.array(z.string()),
  confidence: z.number().min(0).max(1),
})

export type TriageOutput = z.infer<typeof triageOutputSchema>
