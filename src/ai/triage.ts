import { config } from '../config.ts'
import { triageOutputSchema, type TriageOutput } from '../schemas/triage.ts'
import type { TicketRow } from '../repositories/tickets.repository.ts'
import { createPortkeyClient, callAIAndValidate } from './portkey-client.ts'

export type { TicketRow }

const SYSTEM_PROMPT = `You are a customer support triage specialist. Analyze the ticket and respond with a JSON object only — no markdown, no explanation.

Required JSON shape:
{
  "category": "billing" | "technical" | "account" | "general",
  "priority": "low" | "medium" | "high" | "critical",
  "summary": "<1-2 sentence digest of the issue>",
  "sentiment": "positive" | "neutral" | "negative" | "frustrated",
  "suggested_tags": ["<tag>", ...],
  "escalation_need": <true|false>,
  "routing_target": "<team or queue name>",
  "confidence": <number 0-1>
}`

function buildPrompt(ticket: TicketRow): string {
  const lines = [
    `Title: ${ticket.title}`,
    `Description: ${ticket.description}`,
    `Channel: ${ticket.channel}`,
  ]
  if (ticket.priorityHint) lines.push(`Priority hint from customer: ${ticket.priorityHint}`)
  return lines.join('\n')
}

const portkey = createPortkeyClient('triage-fallback', 'openai/gpt-4o-mini')

export async function callTriageAI(ticket: TicketRow): Promise<TriageOutput> {
  return callAIAndValidate(
    portkey,
    {
      model: config.OPENROUTER_MODEL_TRIAGE,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildPrompt(ticket) },
      ],
      max_tokens: 512,
    },
    (parsed) => triageOutputSchema.parse(parsed),
    'triage'
  )
}
