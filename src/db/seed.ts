import { db } from './index'
import { apiKeys } from './schema'

const key = process.env.SEED_API_KEY
if (!key) throw new Error('SEED_API_KEY is not set in .env')

await db
  .insert(apiKeys)
  .values({ keyValue: key, isActive: true })
  .onConflictDoNothing({ target: apiKeys.keyValue })

console.log(`Seed complete — API key: ${key}`)
await process.exit(0)
