import { test, expect } from 'vitest'
import { TRIAGE_FALLBACK } from '../../src/triage/fallback.ts'
import { triageOutputSchema } from '../../src/triage/schema.ts'

test('TRIAGE_FALLBACK satisfies triageOutputSchema', () => {
  const result = triageOutputSchema.safeParse(TRIAGE_FALLBACK)
  expect(result.success).toBe(true)
})

test('TRIAGE_FALLBACK has confidence=0', () => {
  expect(TRIAGE_FALLBACK.confidence).toBe(0)
})

test('TRIAGE_FALLBACK has empty suggested_tags', () => {
  expect(TRIAGE_FALLBACK.suggested_tags).toEqual([])
})
