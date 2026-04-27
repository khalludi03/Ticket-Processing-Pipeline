import { BedrockRuntimeClient, InvokeModelCommand } from '@aws-sdk/client-bedrock-runtime'
import { traceable } from 'langsmith/traceable'
import { config } from '../config.ts'
import { triageOutputSchema, type TriageOutput } from './schema.ts'
import type { InferSelectModel } from 'drizzle-orm'
import type { tickets } from '../db/schema.ts'

type TicketRow = InferSelectModel<typeof tickets>

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

async function _callTriageAI(ticket: TicketRow): Promise<TriageOutput> {
  const client = new BedrockRuntimeClient({ region: config.AWS_REGION })

  const payload = {
    anthropic_version: 'bedrock-2023-05-31',
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: buildPrompt(ticket) }],
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
  return triageOutputSchema.parse(parsed)
}

export const callTriageAI = traceable(_callTriageAI, {
  name: 'triage',
  run_type: 'llm',
})

export type { TicketRow }
