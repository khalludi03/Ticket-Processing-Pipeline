import { config } from '../config.ts'
import { resolutionOutputSchema, type ResolutionOutput } from '../schemas/resolution.ts'
import type { TriageOutput } from '../schemas/triage.ts'
import type { InferSelectModel } from 'drizzle-orm'
import type { tickets } from '../db/schema.ts'
import { createPortkeyClient, callAIAndValidate } from './portkey-client.ts'

export type TicketRow = InferSelectModel<typeof tickets>

const SYSTEM_PROMPT = `You are a customer support resolution specialist. Given a support ticket and its triage analysis, generate a resolution plan and draft a customer reply. Respond with a JSON object only — no markdown, no explanation.

Required JSON shape:
{
  "suggested_reply": "<draft reply to send to the customer>",
  "internal_note": "<internal note for the support agent summarising the issue and approach>",
  "resolution_steps": ["<internal action step>", ...],
  "requires_escalation": true | false,
  "escalation_reason": "<reason, only present when requires_escalation is true>",
  "confidence": <number 0-1>
}`

function buildPrompt(ticket: TicketRow, triage: TriageOutput): string {
  const lines = [
    `Title: ${ticket.title}`,
    `Description: ${ticket.description}`,
    `Channel: ${ticket.channel}`,
    ``,
    `Triage Analysis:`,
    `  Category: ${triage.category}`,
    `  Priority: ${triage.priority}`,
    `  Summary: ${triage.summary}`,
    `  Sentiment: ${triage.sentiment}`,
    `  Tags: ${triage.suggested_tags.join(', ')}`,
  ]
  if (ticket.priorityHint) lines.push(`  Priority hint from customer: ${ticket.priorityHint}`)
  return lines.join('\n')
}

const portkey = createPortkeyClient('resolution-fallback', 'openai/gpt-4o-mini')

export async function callResolutionAI(ticket: TicketRow, triage: TriageOutput): Promise<ResolutionOutput> {
  return callAIAndValidate(
    portkey,
    {
      model: config.OPENROUTER_MODEL_RESOLUTION,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildPrompt(ticket, triage) },
      ],
      max_tokens: 1024,
    },
    (parsed) => resolutionOutputSchema.parse(parsed),
    'resolution'
  )
}
