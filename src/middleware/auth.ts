import type { MiddlewareHandler } from 'hono'
import { eq, and } from 'drizzle-orm'
import { db } from '../db/index.ts'
import { apiKeys } from '../db/schema.ts'
import { decrypt } from '../utils/encryption.ts'

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const key = c.req.header('x-api-key')

  if (!key) {
    return c.json({ error: 'Missing API key' }, 401)
  }

  // Fetch all active keys and compare after decryption
  const rows = await db
    .select({ id: apiKeys.id, keyValue: apiKeys.keyValue })
    .from(apiKeys)
    .where(eq(apiKeys.isActive, true))

  const matchedKey = rows.find((row) => {
    try {
      const decrypted = decrypt(row.keyValue)
      return decrypted === key
    } catch {
      return false
    }
  })

  if (!matchedKey) {
    return c.json({ error: 'Invalid or revoked API key' }, 401)
  }

  await next()
}
