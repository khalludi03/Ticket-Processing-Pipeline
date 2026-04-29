import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string(),
  DATABASE_PASSWORD: z.string(),
  SQS_QUEUE_URL: z.string(),
  SQS_DLQ_URL: z.string(),
  SEED_API_KEY: z.string().optional(),
  PORT: z.coerce.number().default(3000),
  OPENROUTER_API_KEY: z.string(),
  PORTKEY_API_KEY: z.string().optional(),
  OPENROUTER_MODEL_TRIAGE: z.string().default('google/gemini-flash-1.5').transform(m => m.startsWith('claude') ? `anthropic/${m}` : m),
  OPENROUTER_MODEL_RESOLUTION: z.string().default('google/gemini-flash-1.5').transform(m => m.startsWith('claude') ? `anthropic/${m}` : m),
})

const result = envSchema.safeParse(process.env)

if (!result.success) {
  const missing = result.error.issues.map((e) => `  ${e.path.join('.')}: ${e.message}`).join('\n')
  throw new Error(`Missing or invalid environment variables:\n${missing}`)
}

export const config = result.data
