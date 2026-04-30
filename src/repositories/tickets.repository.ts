import { eq, asc } from 'drizzle-orm'
import { db } from '../db/index.ts'
import { tickets, replayAttempts, pipelineEvents } from '../db/schema.ts'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import type { TriageOutput } from '../schemas/triage.ts'
import type { ResolutionOutput } from '../schemas/resolution.ts'
import { TRIAGE_FALLBACK } from '../schemas/triage.ts'
import { RESOLUTION_FALLBACK } from '../schemas/resolution.ts'

export type TicketRow = InferSelectModel<typeof tickets>

export type NewTicket = Pick<
  InferInsertModel<typeof tickets>,
  'title' | 'description' | 'customerId' | 'channel' | 'attachments' | 'tags' | 'priorityHint'
>

export async function insertTicketWithJobTask(data: NewTicket) {
  return db.transaction(async (tx) => {
    const [ticket] = await tx.insert(tickets).values(data).returning()
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

export async function getTicket(ticketId: string) {
  const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1)
  return ticket ?? null
}

export async function setJobTaskProcessing(ticketId: string, phase: 'triage' | 'resolution') {
  const now = new Date()
  await db.transaction(async (tx) => {
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
      .set({
        triageOutput: output,
        triageProcessingTimeMs: processingTimeMs,
        triageModelVersion: modelVersion,
        updatedAt: now,
      })
      .where(eq(tickets.id, ticketId))
    await tx.insert(pipelineEvents).values({
      ticketId,
      phase: 'triage',
      eventType: 'phase_completed',
      payload: { modelVersion, processingTimeMs },
    })
  })
}

export async function insertResolutionDraft(
  ticketId: string,
  output: ResolutionOutput,
  processingTimeMs: number,
  modelVersion: string,
) {
  const now = new Date()
  await db.transaction(async (tx) => {
    await tx
      .update(tickets)
      .set({
        resolutionOutput: output,
        status: 'completed',
        resolutionProcessingTimeMs: processingTimeMs,
        resolutionModelVersion: modelVersion,
        updatedAt: now,
      })
      .where(eq(tickets.id, ticketId))
    await tx.insert(pipelineEvents).values({
      ticketId,
      phase: 'resolution',
      eventType: 'phase_completed',
      payload: { modelVersion, processingTimeMs },
    })
    await tx.insert(pipelineEvents).values({
      ticketId,
      eventType: 'pipeline_completed',
      payload: { modelVersion, totalProcessingTimeMs: processingTimeMs },
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
      .update(tickets)
      .set({
        triageOutput: TRIAGE_FALLBACK,
        triageFallbackUsed: true,
        triageFallbackReason: reason,
        updatedAt: now,
      })
      .where(eq(tickets.id, ticketId))
    await tx.insert(pipelineEvents).values({
      ticketId,
      phase: 'triage',
      eventType: 'fallback_triggered',
      payload: { reason, phase: 'triage' },
    })
  })
}

export async function getTicketStatus(ticketId: string) {
  const [ticket] = await db.select().from(tickets).where(eq(tickets.id, ticketId)).limit(1)
  if (!ticket) return null

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
    phases: [
      {
        phase: 'triage',
        status: ticket.triageOutput ? 'completed' : 'pending',
        processing_time_ms: ticket.triageProcessingTimeMs,
        model_version: ticket.triageModelVersion,
        fallback_used: ticket.triageFallbackUsed,
        fallback_reason: ticket.triageFallbackReason,
      },
      {
        phase: 'resolution',
        status: ticket.resolutionOutput ? 'completed' : 'pending',
        processing_time_ms: ticket.resolutionProcessingTimeMs,
        model_version: ticket.resolutionModelVersion,
        fallback_used: ticket.resolutionFallbackUsed,
        fallback_reason: ticket.resolutionFallbackReason,
      },
    ],
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

export async function resetJobTaskForReplay(ticketId: string, phase: 'triage' | 'resolution') {
  const now = new Date()
  const clearFields =
    phase === 'triage'
      ? {
          status: 'queued' as const,
          errorLog: null,
          updatedAt: now,
          triageOutput: null,
          triageFallbackUsed: false,
          triageFallbackReason: null,
          resolutionOutput: null,
          resolutionFallbackUsed: false,
          resolutionFallbackReason: null,
        }
      : {
          status: 'queued' as const,
          errorLog: null,
          updatedAt: now,
          resolutionOutput: null,
          resolutionFallbackUsed: false,
          resolutionFallbackReason: null,
        }
  return db.transaction(async (tx) => {
    await tx.update(tickets).set(clearFields).where(eq(tickets.id, ticketId))
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

export async function setResolutionFallback(ticketId: string, reason: string) {
  const now = new Date()
  await db.transaction(async (tx) => {
    await tx
      .update(tickets)
      .set({
        resolutionOutput: RESOLUTION_FALLBACK,
        resolutionFallbackUsed: true,
        resolutionFallbackReason: reason,
        updatedAt: now,
      })
      .where(eq(tickets.id, ticketId))
    await tx.insert(pipelineEvents).values({
      ticketId,
      phase: 'resolution',
      eventType: 'fallback_triggered',
      payload: { reason, phase: 'resolution' },
    })
  })
}

export async function setManualReply(ticketId: string, reply: string, internalNote: string | null, userId: string) {
  const now = new Date()
  const output = { suggested_reply: reply, internal_note: internalNote, resolution_steps: [], requires_escalation: false, confidence: 1 }
  await db
    .update(tickets)
    .set({ resolutionOutput: output, status: 'completed', updatedAt: now })
    .where(eq(tickets.id, ticketId))
}
