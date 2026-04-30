import { db } from './index.ts'
import { apiKeys } from './schema.ts'
import { encrypt } from '../utils/encryption.ts'

const key = process.env.SEED_API_KEY
if (!key) throw new Error('SEED_API_KEY is not set in .env')

const encryptedKey = encrypt(key)

await db
  .insert(apiKeys)
  .values({ keyValue: encryptedKey, isActive: true, name: 'Local Dev Key' })
  .onConflictDoNothing({ target: apiKeys.keyValue })

console.log(`Seed complete — API key encrypted and stored`)
await process.exit(0)
