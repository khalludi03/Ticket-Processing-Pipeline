import { test, expect, describe } from 'vitest'
import { sqsMessageSchema } from '../../src/queue/schema.ts'

describe('sqsMessageSchema', () => {
  test('accepts valid triage message', () => {
    const result = sqsMessageSchema.safeParse({
      ticket_id: '01234567-89ab-7def-8123-456789abcdef',
      phase: 'triage',
      retry_count: 0,
    })
    expect(result.success).toBe(true)
  })

  test('accepts valid resolution message', () => {
    const result = sqsMessageSchema.safeParse({
      ticket_id: '01234567-89ab-7def-8123-456789abcdef',
      phase: 'resolution',
      retry_count: 3,
    })
    expect(result.success).toBe(true)
  })

  test('rejects invalid uuid', () => {
    const result = sqsMessageSchema.safeParse({
      ticket_id: 'not-a-uuid',
      phase: 'triage',
      retry_count: 0,
    })
    expect(result.success).toBe(false)
  })

  test('rejects unknown phase', () => {
    const result = sqsMessageSchema.safeParse({
      ticket_id: '01234567-89ab-7def-8123-456789abcdef',
      phase: 'processing',
      retry_count: 0,
    })
    expect(result.success).toBe(false)
  })

  test('rejects negative retry_count', () => {
    const result = sqsMessageSchema.safeParse({
      ticket_id: '01234567-89ab-7def-8123-456789abcdef',
      phase: 'triage',
      retry_count: -1,
    })
    expect(result.success).toBe(false)
  })

  test('rejects missing fields', () => {
    const result = sqsMessageSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})
