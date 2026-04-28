import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'
import { traceable } from 'langsmith/traceable'
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

async function _callResolutionAI(ticket: TicketRow, triage: TriageOutput): Promise<ResolutionOutput> {
  const client = new BedrockRuntimeClient({ region: config.AWS_REGION })

  const payload = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildPrompt(ticket, triage) }],
  }

  const command = new InvokeModelCommand({
    modelId: config.BEDROCK_MODEL_ID,
    contentType: 'application/json',
    accept: 'application/json',
    body: JSON.stringify(payload),
  })

  const response = await client.send(command)
  const body = JSON.parse(Buffer.from(response.body).toString('utf-8')) as {
    content: { type: string; text: string }[]
  }

  const text = body.content.find((c) => c.type === 'text')?.text ?? ''
  const parsed: unknown = JSON.parse(text)
  return resolutionOutputSchema.parse(parsed)
}

export const callResolutionAI = traceable(_callResolutionAI, {
  name: 'resolution',
  run_type: 'llm',
})
