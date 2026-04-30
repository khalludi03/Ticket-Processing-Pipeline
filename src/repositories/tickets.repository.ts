import { eq, and, max, asc } from 'drizzle-orm'
import { db } from '../db/index.ts'
import { tickets, jobTasks, resolutionDrafts, replayAttempts, pipelineEvents } from '../db/schema.ts'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import type { TriageOutput } from '../schemas/triage.ts'
import type { ResolutionOutput } from '../schemas/resolution.ts'
import { TRIAGE_FALLBACK } from '../schemas/triage.ts'
import { RESOLUTION_FALLBACK } from '../schemas/resolution.ts'

export type TicketRow = InferSelectModel<typeof tickets>
export type JobTaskRow = InferSelectModel<typeof jobTasks>

export type NewTicket = Pick<
  InferInsertModel<typeof tickets>,
  'title' | 'description' | 'customerId' | 'channel' | 'attachments' | 'tags' | 'priorityHint'
>

export async function insertTicketWithJobTask(data: NewTicket) {
  return db.transaction(async (tx) => {
    const [ticket] = await tx.insert(tickets).values(data).returning()
    await tx.insert(jobTasks).values({
      ticketId: ticket!.id,
      phase: 'triage',
      status: 'queued',
    })
    await tx.insert(pipelineEvents).values({
      ticketId: ticket!.id,
      eventType: 'ticket_created',
      payload: { title: data.title, channel: data.channel },
    })
    return ticket!
  })
}

export async function setTicketFailed(ticketId: string, errorLog: string) {
  await db
    .update(tickets)
    .set({ status: 'failed', errorLog, updatedAt: new Date() })
    .where(eq(tickets.id, ticketId))
}

export async function getTicketForTriage(ticketId: string) {
  const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1)
  if (!ticket) return null

  const [jobTask] = await db
    .select()
    .from(jobTasks)
    .where(and(eq(jobTasks.ticketId, ticketId), eq(jobTasks.phase, 'triage')))
    .limit(1)

  if (!jobTask) return null
  return { ticket, jobTask }
}

export async function setJobTaskProcessing(ticketId: string, phase: 'triage' | 'resolution') {
  const now = new Date()
  await db.transaction(async (tx) => {
    await tx
      .update(jobTasks)
      .set({ status: 'processing', startedAt: now, updatedAt: now })
      .where(and(eq(jobTasks.ticketId, ticketId), eq(jobTasks.phase, phase)))
    await tx
      .update(tickets)
      .set({ status: 'processing', updatedAt: now })
      .where(eq(tickets.id, ticketId))
    await tx.insert(pipelineEvents).values({
      ticketId,
      phase,
      eventType: 'phase_started',
      payload: { timestamp: now.toISOString() },
    })
  })
}

export async function setTriageCompleted(
  ticketId: string,
  output: TriageOutput,
  processingTimeMs: number,
  modelVersion: string,
) {
  const now = new Date()
  await db.transaction(async (tx) => {
    await tx
      .update(tickets)
      .set({ triageOutput: output, updatedAt: now })
      .where(eq(tickets.id, ticketId))
    await tx
      .update(jobTasks)
      .set({ status: 'completed', completedAt: now, updatedAt: now, modelVersion, processingTimeMs })
      .where(and(eq(jobTasks.ticketId, ticketId), eq(jobTasks.phase, 'triage')))
    await tx.insert(pipelineEvents).values({
      ticketId,
      phase: 'triage',
      eventType: 'phase_completed',
      payload: { modelVersion, processingTimeMs },
    })
    await tx.insert(jobTasks).values({
      ticketId,
      phase: 'resolution',
      status: 'queued',
    })
  })
}

export async function getTicketForResolution(ticketId: string) {
  const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1)
  if (!ticket) return null

  const [jobTask] = await db
    .select()
    .from(jobTasks)
    .where(and(eq(jobTasks.ticketId, ticketId), eq(jobTasks.phase, 'resolution')))
    .limit(1)

  if (!jobTask) return null
  return { ticket, jobTask }
}

export async function insertResolutionDraft(
  ticketId: string,
  output: ResolutionOutput,
  processingTimeMs: number,
  modelVersion: string,
) {
  const now = new Date()
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ maxVersion: max(resolutionDrafts.version) })
      .from(resolutionDrafts)
      .where(eq(resolutionDrafts.ticketId, ticketId))
    const nextVersion = (rows[0]?.maxVersion ?? 0) + 1

    await tx.insert(resolutionDrafts).values({ ticketId, version: nextVersion, output, processingTimeMs, modelVersion })
    await tx
      .update(tickets)
      .set({ resolutionOutput: output, status: 'completed', updatedAt: now })
      .where(eq(tickets.id, ticketId))
    await tx
      .update(jobTasks)
      .set({ status: 'completed', completedAt: now, updatedAt: now })
      .where(and(eq(jobTasks.ticketId, ticketId), eq(jobTasks.phase, 'resolution')))
    await tx.insert(pipelineEvents).values({
      ticketId,
      phase: 'resolution',
      eventType: 'phase_completed',
      payload: { modelVersion, processingTimeMs, version: nextVersion },
    })
    await tx.insert(pipelineEvents).values({
      ticketId,
      eventType: 'pipeline_completed',
      payload: { modelVersion, totalProcessingTimeMs: processingTimeMs },
    })
  })
}

export async function setJobTaskFailed(
  ticketId: string,
  phase: 'triage' | 'resolution',
  error: string,
  retryCount: number,
) {
  const now = new Date()
  await db.transaction(async (tx) => {
    await tx
      .update(jobTasks)
      .set({ status: 'failed', errorDetails: error, retryCount, updatedAt: now })
      .where(and(eq(jobTasks.ticketId, ticketId), eq(jobTasks.phase, phase)))
    await tx.insert(pipelineEvents).values({
      ticketId,
      phase,
      eventType: 'ticket_failed',
      payload: { error, retryCount },
    })
  })
}

export async function setNeedsManualReview(ticketId: string, errorLog: string) {
  await db
    .update(tickets)
    .set({ status: 'needs_manual_review', errorLog, updatedAt: new Date() })
    .where(eq(tickets.id, ticketId))
}

export async function setTriageFallback(ticketId: string, reason: string) {
  const now = new Date()
  await db.transaction(async (tx) => {
    await tx
      .update(jobTasks)
      .set({ fallbackUsed: true, fallbackReason: reason, updatedAt: now })
      .where(and(eq(jobTasks.ticketId, ticketId), eq(jobTasks.phase, 'triage')))
    await tx.insert(pipelineEvents).values({
      ticketId,
      phase: 'triage',
      eventType: 'fallback_triggered',
      payload: { reason, phase: 'triage' },
    })
    await tx
      .update(tickets)
      .set({ triageOutput: TRIAGE_FALLBACK, updatedAt: now })
      .where(eq(tickets.id, ticketId))
  })
}

export async function getTicketStatus(ticketId: string) {
  const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1)
  if (!ticket) return null

  const tasks = await db.select().from(jobTasks).where(eq(jobTasks.ticketId, ticketId))
  const replays = await db.select().from(replayAttempts).where(eq(replayAttempts.ticketId, ticketId))
  const events = await db
    .select()
    .from(pipelineEvents)
    .where(eq(pipelineEvents.ticketId, ticketId))
    .orderBy(asc(pipelineEvents.createdAt))

  return {
    ticket_id: ticket.id,
    status: ticket.status,
    created_at: ticket.createdAt,
    updated_at: ticket.updatedAt,
    phases: tasks.map((t) => ({
      phase: t.phase,
      status: t.status,
      retry_count: t.retryCount,
      fallback_used: t.fallbackUsed,
      fallback_reason: t.fallbackReason,
    })),
    replays: replays.map((r) => ({
      phase: r.phase,
      status: r.status,
      result: r.result,
      error: r.error,
      initiated_at: r.createdAt,
      updated_at: r.updatedAt,
    })),
    events: events.map((e) => ({
      event_type: e.eventType,
      phase: e.phase,
      payload: e.payload,
      created_at: e.createdAt,
    })),
  }
}

export async function getTicketForReplay(ticketId: string) {
  const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1)
  if (!ticket) return null

  const tasks = await db.select().from(jobTasks).where(eq(jobTasks.ticketId, ticketId))
  return { ticket, tasks }
}

export async function resetJobTaskForReplay(ticketId: string, phase: 'triage' | 'resolution') {
  const now = new Date()
  return db.transaction(async (tx) => {
    await tx
      .update(jobTasks)
      .set({ status: 'queued', retryCount: 0, errorDetails: null, startedAt: null, completedAt: null, updatedAt: now })
      .where(and(eq(jobTasks.ticketId, ticketId), eq(jobTasks.phase, phase)))
    await tx
      .update(tickets)
      .set({ status: 'queued', errorLog: null, updatedAt: now })
      .where(eq(tickets.id, ticketId))
    const [replay] = await tx.insert(replayAttempts).values({ ticketId, phase, status: 'processing' }).returning()
    return replay!.id
  })
}

export async function setReplayCompleted(replayId: string, result: Record<string, unknown>) {
  await db
    .update(replayAttempts)
    .set({ status: 'completed', result, updatedAt: new Date() })
    .where(eq(replayAttempts.id, replayId))
}

export async function setReplayFailed(replayId: string, error: string) {
  await db
    .update(replayAttempts)
    .set({ status: 'failed', error, updatedAt: new Date() })
    .where(eq(replayAttempts.id, replayId))
}

export async function getTicketResult(ticketId: string) {
  const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1)
  if (!ticket) return null

  return {
    ticket_id: ticket.id,
    status: ticket.status,
    fallback: ticket.status === 'needs_manual_review',
    triage_output: ticket.triageOutput,
    resolution_output: ticket.resolutionOutput,
  }
}

export async function getTicketEvents(ticketId: string) {
  return db
    .select()
    .from(pipelineEvents)
    .where(eq(pipelineEvents.ticketId, ticketId))
    .orderBy(asc(pipelineEvents.createdAt))
}

export async function emitRetryAttempted(ticketId: string, phase: 'triage' | 'resolution', attempt: number) {
  await db.insert(pipelineEvents).values({
    ticketId,
    phase,
    eventType: 'retry_attempted',
    payload: { attempt },
  })
}

export async function setResolutionFallback(ticketId: string, reason: string) {
  const now = new Date()
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ maxVersion: max(resolutionDrafts.version) })
      .from(resolutionDrafts)
      .where(eq(resolutionDrafts.ticketId, ticketId))
    const nextVersion = (rows[0]?.maxVersion ?? 0) + 1
    await tx.insert(resolutionDrafts).values({
      ticketId,
      version: nextVersion,
      output: RESOLUTION_FALLBACK,
      processingTimeMs: 0,
      modelVersion: 'fallback',
    })
    await tx
      .update(jobTasks)
      .set({ fallbackUsed: true, fallbackReason: reason, updatedAt: now })
      .where(and(eq(jobTasks.ticketId, ticketId), eq(jobTasks.phase, 'resolution')))
    await tx.insert(pipelineEvents).values({
      ticketId,
      phase: 'resolution',
      eventType: 'fallback_triggered',
      payload: { reason, phase: 'resolution' },
    })
    await tx
      .update(tickets)
      .set({ resolutionOutput: RESOLUTION_FALLBACK, updatedAt: now })
      .where(eq(tickets.id, ticketId))
  })
}

export async function setManualReply(ticketId: string, reply: string, internalNote: string | null, userId: string) {
  const now = new Date()
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ maxVersion: max(resolutionDrafts.version) })
      .from(resolutionDrafts)
      .where(eq(resolutionDrafts.ticketId, ticketId))
    const nextVersion = (rows[0]?.maxVersion ?? 0) + 1
    const output = { suggested_reply: reply, internal_note: internalNote, resolution_steps: [], requires_escalation: false, confidence: 1 }
    await tx.insert(resolutionDrafts).values({
      ticketId,
      version: nextVersion,
      output,
      processingTimeMs: 0,
      modelVersion: `manual:${userId}`,
    })
    await tx
      .update(tickets)
      .set({ resolutionOutput: output, status: 'completed', updatedAt: now })
      .where(eq(tickets.id, ticketId))
    const tasks = await tx.select().from(jobTasks).where(eq(jobTasks.ticketId, ticketId))
    for (const task of tasks) {
      if (task.status !== 'completed') {
        await tx
          .update(jobTasks)
          .set({ status: 'completed', completedAt: now, updatedAt: now })
          .where(eq(jobTasks.id, task.id))
      }
    }
  })
}
