import { Portkey } from 'portkey-ai'
import { config } from '../config.ts'
import { logger } from '../logger.ts'

export function createPortkeyClient(fallbackId: string, fallbackModel: string) {
  return new Portkey({
    apiKey: config.PORTKEY_API_KEY,
    provider: 'openrouter',
    authorization: `Bearer ${config.OPENROUTER_API_KEY}`,
    config: {
      retry: { attempts: 3, onStatusCodes: [[429, 500, 502, 503, 504]] },
      fallbacks: [{ id: fallbackId, name: fallbackModel }],
    },
  })
}

export async function callAIAndValidate<T>(
  portkeyClient: Portkey,
  params: {
    model: string
    messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
    max_tokens: number
  },
  validate: (parsed: unknown) => T,
  errorContext: string
): Promise<T> {
  const response = await portkeyClient.chat.completions.create({
    model: params.model,
    messages: params.messages,
    max_tokens: params.max_tokens,
    response_format: { type: 'json_object' },
  })

  const text = response.choices[0]?.message?.content ?? ''
  const textStr = Array.isArray(text) ? text.join('') : text
  try {
    const jsonString = textStr.replace(/```json\n?|```/g, '').trim()
    const parsed: unknown = JSON.parse(jsonString)
    return validate(parsed)
  } catch (err) {
    logger.error({ err, text }, `Failed to parse ${errorContext} AI response`)
    throw err
  }
}
