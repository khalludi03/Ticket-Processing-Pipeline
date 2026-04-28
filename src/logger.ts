import pino from 'pino'

const PII_PATHS = [
  'customerId', 'customer_id', 'attachments',
  '*.customerId', '*.customer_id', '*.attachments',
  '*.*.customerId', '*.*.customer_id', '*.*.attachments',
  '*.*.*.customerId', '*.*.*.customer_id', '*.*.*.attachments',
]

export const logger = pino({
  base: { service: 'ticket-pipeline' },
  redact: { paths: PII_PATHS, censor: '[REDACTED]' },
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
})
