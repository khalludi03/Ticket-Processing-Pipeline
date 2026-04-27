import type { TriageOutput } from './schema.ts'

export const TRIAGE_FALLBACK: TriageOutput = {
  category: 'general',
  priority: 'medium',
  sentiment: 'neutral',
  summary: 'Automated triage unavailable — manual review required.',
  suggested_tags: [],
  confidence: 0,
}
