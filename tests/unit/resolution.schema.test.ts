import { describe, test, expect } from 'vitest'
import { resolutionOutputSchema } from '../../src/resolution/schema.ts'

const valid = {
  suggested_reply: 'Thank you for reaching out. We have identified the issue and are working on a fix.',
  internal_note: 'User affected by auth service degradation. Reset session tokens and monitor.',
  resolution_steps: ['Check auth service logs', 'Reset session tokens for affected user'],
  requires_escalation: false,
  confidence: 0.88,
}

describe('resolutionOutputSchema', () => {
  test('accepts a valid resolution output', () => {
    expect(resolutionOutputSchema.safeParse(valid).success).toBe(true)
  })

  test('accepts resolution with escalation_reason when requires_escalation is true', () => {
    expect(
      resolutionOutputSchema.safeParse({
        ...valid,
        requires_escalation: true,
        escalation_reason: 'Requires database access beyond L1 scope',
      }).success,
    ).toBe(true)
  })

  test('accepts escalation_reason as undefined when requires_escalation is false', () => {
    expect(resolutionOutputSchema.safeParse({ ...valid, escalation_reason: undefined }).success).toBe(true)
  })

  test('accepts empty resolution_steps array', () => {
    expect(resolutionOutputSchema.safeParse({ ...valid, resolution_steps: [] }).success).toBe(true)
  })

  test('accepts confidence = 0 and confidence = 1', () => {
    expect(resolutionOutputSchema.safeParse({ ...valid, confidence: 0 }).success).toBe(true)
    expect(resolutionOutputSchema.safeParse({ ...valid, confidence: 1 }).success).toBe(true)
  })

  test('rejects confidence below 0', () => {
    expect(resolutionOutputSchema.safeParse({ ...valid, confidence: -0.1 }).success).toBe(false)
  })

  test('rejects confidence above 1', () => {
    expect(resolutionOutputSchema.safeParse({ ...valid, confidence: 1.1 }).success).toBe(false)
  })

  test('rejects missing suggested_reply', () => {
    const { suggested_reply: _, ...rest } = valid
    expect(resolutionOutputSchema.safeParse(rest).success).toBe(false)
  })

  test('rejects missing resolution_steps', () => {
    const { resolution_steps: _, ...rest } = valid
    expect(resolutionOutputSchema.safeParse(rest).success).toBe(false)
  })

  test('rejects missing requires_escalation', () => {
    const { requires_escalation: _, ...rest } = valid
    expect(resolutionOutputSchema.safeParse(rest).success).toBe(false)
  })

  test('rejects missing internal_note', () => {
    const { internal_note: _, ...rest } = valid
    expect(resolutionOutputSchema.safeParse(rest).success).toBe(false)
  })

  test('rejects empty object', () => {
    expect(resolutionOutputSchema.safeParse({}).success).toBe(false)
  })
})
