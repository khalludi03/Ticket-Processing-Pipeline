import type { MiddlewareHandler } from 'hono'
import { eq, and } from 'drizzle-orm'
import { db } from '../db/index.ts'
import { apiKeys } from '../db/schema.ts'

export const authMiddleware: MiddlewareHandler = async (c, next) => {
  const key = c.req.header('x-api-key')

  if (!key) {
    return c.json({ error: 'Missing API key' }, 401)
  }

  const rows = await db
    .select({ id: apiKeys.id })
    .from(apiKeys)
    .where(and(eq(apiKeys.keyValue, key), eq(apiKeys.isActive, true)))
    .limit(1)

  if (rows.length === 0) {
    return c.json({ error: 'Invalid or revoked API key' }, 401)
  }

  await next()
}
