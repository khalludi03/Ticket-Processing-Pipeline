import pino from 'pino'

export const logger = pino({
  base: { service: 'ticket-pipeline' },
  transport: process.env.NODE_ENV !== 'production'
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
})
