import { test, expect } from 'vitest'
import pino from 'pino'

const PII_PATHS = [
  'customerId', 'customer_id', 'attachments',
  '*.customerId', '*.customer_id', '*.attachments',
  '*.*.customerId', '*.*.customer_id', '*.*.attachments',
  '*.*.*.customerId', '*.*.*.customer_id', '*.*.*.attachments',
]

function makeTestLogger() {
  const lines: string[] = []
  const stream = new (require('stream').Writable)({
    write(chunk: Buffer, _: string, cb: () => void) {
      lines.push(chunk.toString())
      cb()
    },
  })
  const log = pino({ redact: { paths: PII_PATHS, censor: '[REDACTED]' } }, stream)
  return { log, lines }
}

test('redacts customerId at top level', () => {
  const { log, lines } = makeTestLogger()
  log.info({ customerId: 'customer-abc' }, 'test')
  expect(lines[0]).toContain('[REDACTED]')
  expect(lines[0]).not.toContain('customer-abc')
})

test('redacts customer_id at top level', () => {
  const { log, lines } = makeTestLogger()
  log.info({ customer_id: 'customer-xyz' }, 'test')
  expect(lines[0]).toContain('[REDACTED]')
  expect(lines[0]).not.toContain('customer-xyz')
})

test('redacts attachments at top level', () => {
  const { log, lines } = makeTestLogger()
  log.info({ attachments: ['https://example.com/file.pdf'] }, 'test')
  expect(lines[0]).toContain('[REDACTED]')
  expect(lines[0]).not.toContain('https://example.com/file.pdf')
})

test('redacts customerId nested one level deep', () => {
  const { log, lines } = makeTestLogger()
  log.info({ ticket: { customerId: 'nested-customer' } }, 'test')
  expect(lines[0]).toContain('[REDACTED]')
  expect(lines[0]).not.toContain('nested-customer')
})

test('redacts attachments nested one level deep', () => {
  const { log, lines } = makeTestLogger()
  log.info({ ticket: { attachments: ['https://s3.example.com/secret.pdf'] } }, 'test')
  expect(lines[0]).toContain('[REDACTED]')
  expect(lines[0]).not.toContain('secret.pdf')
})

test('does not redact unrelated fields', () => {
  const { log, lines } = makeTestLogger()
  log.info({ ticketId: 'abc-123', phase: 'triage' }, 'test')
  expect(lines[0]).toContain('abc-123')
  expect(lines[0]).toContain('triage')
})
