import { test, expect } from 'vitest'
import { RESOLUTION_FALLBACK } from '../../src/resolution/fallback.ts'
import { resolutionOutputSchema } from '../../src/resolution/schema.ts'

test('RESOLUTION_FALLBACK satisfies resolutionOutputSchema', () => {
  const result = resolutionOutputSchema.safeParse(RESOLUTION_FALLBACK)
  expect(result.success).toBe(true)
})

test('RESOLUTION_FALLBACK has confidence=0', () => {
  expect(RESOLUTION_FALLBACK.confidence).toBe(0)
})

test('RESOLUTION_FALLBACK requires escalation', () => {
  expect(RESOLUTION_FALLBACK.requires_escalation).toBe(true)
})
