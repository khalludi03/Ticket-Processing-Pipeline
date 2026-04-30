import { describe, test, expect, beforeAll, afterAll } from 'vitest'
import { CreateQueueCommand, SQSClient } from '@aws-sdk/client-sqs'
import { eq } from 'drizzle-orm'
import { db } from '../../src/db/index.ts'
import { apiKeys, tickets } from '../../src/db/schema.ts'
import app from '../../src/index.ts'
import { submitTicket } from '../../src/services/tickets.service.ts'

const TEST_API_KEY = 'integration-test-key'

beforeAll(async () => {
  const endpoint = process.env.SQS_ENDPOINT ?? 'http://localhost:4566'

  const setup = new SQSClient({
    region: 'us-east-1',
    endpoint,
    credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
  })
  const { QueueUrl } = await setup.send(
    new CreateQueueCommand({ QueueName: 'dev-tickets-queue' })
  )
  process.env.SQS_QUEUE_URL = QueueUrl!
  setup.destroy()

  await db
    .insert(apiKeys)
    .values({ name: 'test-key', keyValue: TEST_API_KEY, isActive: true })
    .onConflictDoNothing({ target: apiKeys.keyValue })
})

afterAll(async () => {
  await db.delete(apiKeys).where(eq(apiKeys.keyValue, TEST_API_KEY))
})

describe('POST /tickets', () => {
  test('creates ticket, returns 201', async () => {
    const res = await app.request('/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': TEST_API_KEY },
      body: JSON.stringify({
        title: 'Login button broken',
        description: 'The login button does not respond on mobile.',
        customer_id: 'customer-001',
        channel: 'web',
      }),
    })

    expect(res.status).toBe(201)
    const body = await res.json() as { ticket_id: string; status: string }
    expect(body.ticket_id).toBeDefined()
    expect(body.status).toBe('queued')

    const [ticket] = await db.select().from(tickets).where(eq(tickets.id, body.ticket_id))
    expect(ticket?.status).toBe('queued')

    await db.delete(tickets).where(eq(tickets.id, body.ticket_id))
  })

  test('returns 401 with missing API key', async () => {
    const res = await app.request('/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Test', description: 'Test', customer_id: 'c1', channel: 'email' }),
    })
    expect(res.status).toBe(401)
  })

  test('returns 401 with invalid API key', async () => {
    const res = await app.request('/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': 'wrong-key' },
      body: JSON.stringify({ title: 'Test', description: 'Test', customer_id: 'c1', channel: 'email' }),
    })
    expect(res.status).toBe(401)
  })

  test('returns 400 with missing required fields', async () => {
    const res = await app.request('/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': TEST_API_KEY },
      body: JSON.stringify({ title: 'Only title' }),
    })
    expect(res.status).toBe(400)
    const body = await res.json() as { error: string; issues: unknown[] }
    expect(body.error).toBe('Validation failed')
    expect(Array.isArray(body.issues)).toBe(true)
  })

  test('returns 400 with invalid channel', async () => {
    const res = await app.request('/tickets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': TEST_API_KEY },
      body: JSON.stringify({ title: 'Test', description: 'Test', customer_id: 'c1', channel: 'fax' }),
    })
    expect(res.status).toBe(400)
  })
})

describe('submitTicket — SQS enqueue failure', () => {
  test('sets ticket to failed with error log when SQS is unreachable', async () => {
    const originalUrl = process.env.SQS_QUEUE_URL
    process.env.SQS_QUEUE_URL = 'http://localhost:9999/000000000000/non-existent-queue'

    let ticketId: string | undefined

    try {
      await expect(
        submitTicket({
          title: 'Rollback test',
          description: 'Testing SQS failure handling.',
          customerId: 'rollback-test-customer',
          channel: 'web',
          attachments: null,
          tags: null,
          priorityHint: null,
        }),
      ).rejects.toThrow()

      const [ticket] = await db
        .select()
        .from(tickets)
        .where(eq(tickets.customerId, 'rollback-test-customer'))
        .orderBy(tickets.createdAt)
        .limit(1)

      ticketId = ticket?.id
      expect(ticket?.status).toBe('failed')
      expect(ticket?.errorLog).toBeTruthy()
    } finally {
      process.env.SQS_QUEUE_URL = originalUrl
      if (ticketId) await db.delete(tickets).where(eq(tickets.id, ticketId))
    }
  })
})
