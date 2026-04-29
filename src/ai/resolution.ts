import { Portkey } from 'portkey-ai'
import { config } from '../config.ts'
import { resolutionOutputSchema, type ResolutionOutput } from '../schemas/resolution.ts'
import type { TriageOutput } from '../schemas/triage.ts'
import type { InferSelectModel } from 'drizzle-orm'
import type { tickets } from '../db/schema.ts'

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

const portkey = new Portkey({
  apiKey: config.PORTKEY_API_KEY,
  provider: "openrouter",
  authorization: `Bearer ${config.OPENROUTER_API_KEY}`,
  config: {
    retry: { attempts: 3, onStatusCodes: [[429, 500, 502, 503, 504]] },
    fallbacks: [{ id: 'resolution-fallback', name: 'openai/gpt-4o-mini' }],
  }
})

export async function callResolutionAI(ticket: TicketRow, triage: TriageOutput): Promise<ResolutionOutput> {
  const response = await portkey.chat.completions.create({
    model: config.OPENROUTER_MODEL_RESOLUTION,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: buildPrompt(ticket, triage) },
    ],
    max_tokens: 1024,
    response_format: { type: 'json_object' },
  })

  // Log Portkey retry/fallback metadata from response headers
  const headers = response.headers as Record<string, string>
  console.log('Portkey metadata:', {
    retries: headers['x-portkey-retry-attempt-count'],
    fallback: headers['x-portkey-fallback'],
    model: headers['x-portkey-model'],
  })

  const text = response.choices[0]?.message?.content ?? ''
  try {
    const jsonString = text.replace(/```json\n?|```/g, '').trim()
    const parsed: unknown = JSON.parse(jsonString)
    return resolutionOutputSchema.parse(parsed)
  } catch (err) {
    console.error('Failed to parse resolution AI response:', text)
    throw err
  }
}