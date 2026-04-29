import { test, expect, describe } from 'vitest'
import { sqsMessageSchema } from '../../src/schemas/queue.ts'

describe('sqsMessageSchema', () => {
  test('accepts valid triage message', () => {
    const result = sqsMessageSchema.safeParse({
      ticket_id: '01234567-89ab-7def-8123-456789abcdef',
      phase: 'triage',
    })
    expect(result.success).toBe(true)
  })

  test('accepts valid resolution message', () => {
    const result = sqsMessageSchema.safeParse({
      ticket_id: '01234567-89ab-7def-8123-456789abcdef',
      phase: 'resolution',
    })
    expect(result.success).toBe(true)
  })

  test('rejects invalid uuid', () => {
    const result = sqsMessageSchema.safeParse({
      ticket_id: 'not-a-uuid',
      phase: 'triage',
    })
    expect(result.success).toBe(false)
  })

  test('rejects unknown phase', () => {
    const result = sqsMessageSchema.safeParse({
      ticket_id: '01234567-89ab-7def-8123-456789abcdef',
      phase: 'processing',
    })
    expect(result.success).toBe(false)
  })

  test('rejects missing fields', () => {
    const result = sqsMessageSchema.safeParse({})
    expect(result.success).toBe(false)
  })
})
