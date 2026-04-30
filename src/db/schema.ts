import { pgEnum, pgTable, uuid, text, integer, boolean, jsonb, timestamp, unique } from 'drizzle-orm/pg-core'

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

export const jobTaskStatus = pgEnum('job_task_status', [
  'queued',
  'processing',
  'completed',
  'failed',
])

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
  errorLog: text('error_log'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
})

export const jobTasks = pgTable(
  'job_tasks',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    phase: phaseEnum('phase').notNull(),
    status: jobTaskStatus('status').notNull().default('queued'),
    retryCount: integer('retry_count').notNull().default(0),
    errorDetails: text('error_details'),
    startedAt: timestamp('started_at'),
    completedAt: timestamp('completed_at'),
    modelVersion: text('model_version'),
    processingTimeMs: integer('processing_time_ms'),
    fallbackUsed: boolean('fallback_used').notNull().default(false),
    fallbackReason: text('fallback_reason'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [unique().on(t.ticketId, t.phase)],
)

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

export const resolutionDrafts = pgTable(
  'resolution_drafts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => tickets.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    output: jsonb('output').notNull(),
    processingTimeMs: integer('processing_time_ms').notNull(),
    modelVersion: text('model_version').notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [unique().on(t.ticketId, t.version)],
)

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


