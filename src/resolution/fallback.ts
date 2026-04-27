import type { ResolutionOutput } from './schema.ts'

export const RESOLUTION_FALLBACK: ResolutionOutput = {
  suggested_reply:
    'Thank you for contacting us. We have received your request and a support agent will follow up with you shortly.',
  internal_note: 'Automated resolution unavailable — manual handling required.',
  resolution_steps: ['Assign to support queue for manual review'],
  requires_escalation: true,
  confidence: 0,
}
