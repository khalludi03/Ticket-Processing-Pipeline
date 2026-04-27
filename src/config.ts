import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  DATABASE_URL: z.string(),
  DATABASE_PASSWORD: z.string(),
  AWS_REGION: z.string(),
  SQS_QUEUE_URL: z.string(),
  SQS_DLQ_URL: z.string(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  SEED_API_KEY: z.string().optional(),
  PORT: z.coerce.number().default(3000),
  BEDROCK_MODEL_ID: z.string(),
  LANGSMITH_API_KEY: z.string().optional(),
  LANGSMITH_TRACING: z.string().optional(),
})

const result = envSchema.safeParse(process.env)

if (!result.success) {
  const missing = result.error.issues.map((e) => `  ${e.path.join('.')}: ${e.message}`).join('\n')
  throw new Error(`Missing or invalid environment variables:\n${missing}`)
}

export const config = result.data
