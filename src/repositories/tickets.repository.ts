import { eq, and, max } from 'drizzle-orm'
import { db } from '../db/index.ts'
import { tickets, jobTasks, resolutionDrafts } from '../db/schema.ts'
import type { InferInsertModel, InferSelectModel } from 'drizzle-orm'
import type { TriageOutput } from '../triage/schema.ts'
import type { ResolutionOutput } from '../resolution/schema.ts'
import { TRIAGE_FALLBACK } from '../triage/fallback.ts'
import { RESOLUTION_FALLBACK } from '../resolution/fallback.ts'

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
  })
}

export async function setJobTaskFailed(
  ticketId: string,
  phase: 'triage' | 'resolution',
  error: string,
  retryCount: number,
) {
  const now = new Date()
  await db
    .update(jobTasks)
    .set({ status: 'failed', errorDetails: error, retryCount, updatedAt: now })
    .where(and(eq(jobTasks.ticketId, ticketId), eq(jobTasks.phase, phase)))
}

export async function setNeedsManualReview(ticketId: string, errorLog: string) {
  await db
    .update(tickets)
    .set({ status: 'needs_manual_review', errorLog, updatedAt: new Date() })
    .where(eq(tickets.id, ticketId))
}

export async function setTriageFallback(ticketId: string) {
  await db
    .update(tickets)
    .set({ triageOutput: TRIAGE_FALLBACK, updatedAt: new Date() })
    .where(eq(tickets.id, ticketId))
}

export async function setResolutionFallback(ticketId: string) {
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
      .update(tickets)
      .set({ resolutionOutput: RESOLUTION_FALLBACK, updatedAt: now })
      .where(eq(tickets.id, ticketId))
  })
}
