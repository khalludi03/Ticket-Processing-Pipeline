import { Portkey } from 'portkey-ai'
import { config } from '../config.ts'
import { triageOutputSchema, type TriageOutput } from '../schemas/triage.ts'
import type { InferSelectModel } from 'drizzle-orm'
import type { tickets } from '../db/schema.ts'

export type TicketRow = InferSelectModel<typeof tickets>

const SYSTEM_PROMPT = `You are a customer support triage specialist. Analyze the ticket and respond with a JSON object only — no markdown, no explanation.

Required JSON shape:
{
  "category": "billing" | "technical" | "account" | "general",
  "priority": "low" | "medium" | "high" | "critical",
  "summary": "<1-2 sentence digest of the issue>",
  "sentiment": "positive" | "neutral" | "negative" | "frustrated",
  "suggested_tags": ["<tag>", ...],
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

const portkey = new Portkey({
  apiKey: config.PORTKEY_API_KEY,
  provider: "openrouter",
  authorization: `Bearer ${config.OPENROUTER_API_KEY}`,
  config: {
    retry: { attempts: 3, onStatusCodes: [[429, 500, 502, 503, 504]] },
    fallbacks: [{ id: 'triage-fallback', name: 'openai/gpt-4o-mini' }],
  }
})

export async function callTriageAI(ticket: TicketRow): Promise<TriageOutput> {
  const response = await portkey.chat.completions.create({
    model: config.OPENROUTER_MODEL_TRIAGE,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildPrompt(ticket) },
    ],
    max_tokens: 512,
    response_format: { type: 'json_object' },
  })

  // Log Portkey retry/fallback metadata from response headers
  const headers = response.headers as Record<string, string>
  console.log('Portkey metadata:', {
    retries: headers['x-portkey-retries'],
    fallback: headers['x-portkey-fallback'],
    model: headers['x-portkey-model'],
  })

  const text = response.choices[0]?.message?.content ?? ''
  try {
    const jsonString = text.replace(/```json\n?|```/g, '').trim()
    const parsed: unknown = JSON.parse(jsonString)
    return triageOutputSchema.parse(parsed)
  } catch (err) {
    console.error('Failed to parse triage AI response:', text)
    throw err
  }
}