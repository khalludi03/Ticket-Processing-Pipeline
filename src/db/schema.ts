import { pgEnum, pgTable, uuid, text, integer, boolean, jsonb, timestamp } from 'drizzle-orm/pg-core'

export const ticketStatus = pgEnum('ticket_status', [
  'queued',
  'processing',
  'completed',
  'failed',
  'needs_manual_review',
])

export const phaseEnum = pgEnum('phase', ['triage', 'resolution'])

export const channelEnum = pgEnum('channel', ['email', 'chat', 'web'])

export const priorityHintEnum = pgEnum('priority_hint', ['low', 'medium', 'high'])

export const eventTypeEnum = pgEnum('event_type', [
  'phase_started',
  'phase_completed',
  'retry_attempted',
  'fallback_triggered',
  'pipeline_completed',
  'ticket_created',
  'ticket_failed',
])

export const tickets = pgTable('tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  title: text('title').notNull(),
  description: text('description').notNull(),
  customerId: text('customer_id').notNull(),
  channel: channelEnum('channel').notNull(),
  attachments: jsonb('attachments'),
  tags: jsonb('tags'),
  priorityHint: priorityHintEnum('priority_hint'),
  status: ticketStatus('status').notNull().default('queued'),
  triageOutput: jsonb('triage_output'),
  resolutionOutput: jsonb('resolution_output'),
  triageProcessingTimeMs: integer('triage_processing_time_ms'),
  triageModelVersion: text('triage_model_version'),
  triageFallbackUsed: boolean('triage_fallback_used').notNull().default(false),
  triageFallbackReason: text('triage_fallback_reason'),
  resolutionProcessingTimeMs: integer('resolution_processing_time_ms'),
  resolutionModelVersion: text('resolution_model_version'),
  resolutionFallbackUsed: boolean('resolution_fallback_used').notNull().default(false),
  resolutionFallbackReason: text('resolution_fallback_reason'),
  errorLog: text('error_log'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const apiKeys = pgTable('api_keys', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  keyValue: text('key_value').notNull().unique(),
  createdBy: text('created_by'),
  isActive: boolean('is_active').notNull().default(true),
  lastUsedAt: timestamp('last_used_at'),
  expiresAt: timestamp('expires_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})

export const replayStatusEnum = pgEnum('replay_status', ['queued', 'processing', 'completed', 'failed'])

export const replayAttempts = pgTable('replay_attempts', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketId: uuid('ticket_id')
    .notNull()
    .references(() => tickets.id, { onDelete: 'cascade' }),
  phase: phaseEnum('phase').notNull(),
  status: replayStatusEnum('status').notNull().default('queued'),
  result: jsonb('result'),
  error: text('error'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const pipelineEvents = pgTable('pipeline_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  ticketId: uuid('ticket_id')
    .notNull()
    .references(() => tickets.id, { onDelete: 'cascade' }),
  phase: phaseEnum('phase'),
  eventType: eventTypeEnum('event_type').notNull(),
  payload: jsonb('payload'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
})


