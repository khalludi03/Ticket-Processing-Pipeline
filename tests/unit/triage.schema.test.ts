import { describe, test, expect } from 'vitest'
import { triageOutputSchema } from '../../src/schemas/triage.ts'

const valid = {
  category: 'technical',
  priority: 'high',
  summary: 'User cannot log in on mobile devices.',
  sentiment: 'frustrated',
  suggested_tags: ['login', 'mobile'],
  confidence: 0.92,
}

describe('triageOutputSchema', () => {
  test('accepts a valid triage output', () => {
    expect(triageOutputSchema.safeParse(valid).success).toBe(true)
  })

  test('accepts all valid category values', () => {
    for (const category of ['billing', 'technical', 'account', 'general']) {
      expect(triageOutputSchema.safeParse({ ...valid, category }).success).toBe(true)
    }
  })

  test('accepts all valid priority values', () => {
    for (const priority of ['low', 'medium', 'high', 'critical']) {
      expect(triageOutputSchema.safeParse({ ...valid, priority }).success).toBe(true)
    }
  })

  test('accepts all valid sentiment values', () => {
    for (const sentiment of ['positive', 'neutral', 'negative', 'frustrated']) {
      expect(triageOutputSchema.safeParse({ ...valid, sentiment }).success).toBe(true)
    }
  })

  test('accepts empty suggested_tags array', () => {
    expect(triageOutputSchema.safeParse({ ...valid, suggested_tags: [] }).success).toBe(true)
  })

  test('accepts confidence = 0 and confidence = 1', () => {
    expect(triageOutputSchema.safeParse({ ...valid, confidence: 0 }).success).toBe(true)
    expect(triageOutputSchema.safeParse({ ...valid, confidence: 1 }).success).toBe(true)
  })

  test('rejects unknown category', () => {
    expect(triageOutputSchema.safeParse({ ...valid, category: 'refund' }).success).toBe(false)
  })

  test('rejects unknown priority', () => {
    expect(triageOutputSchema.safeParse({ ...valid, priority: 'urgent' }).success).toBe(false)
  })

  test('rejects unknown sentiment', () => {
    expect(triageOutputSchema.safeParse({ ...valid, sentiment: 'angry' }).success).toBe(false)
  })

  test('rejects confidence below 0', () => {
    expect(triageOutputSchema.safeParse({ ...valid, confidence: -0.1 }).success).toBe(false)
  })

  test('rejects confidence above 1', () => {
    expect(triageOutputSchema.safeParse({ ...valid, confidence: 1.1 }).success).toBe(false)
  })

  test('rejects missing fields', () => {
    expect(triageOutputSchema.safeParse({}).success).toBe(false)
  })
})
