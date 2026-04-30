import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { ResolutionOutput } from '../../src/schemas/resolution.ts'
import type { TriageOutput } from '../../src/schemas/triage.ts'
import type { InferSelectModel } from 'drizzle-orm'
import type { tickets, jobTasks } from '../../src/db/schema.ts'

type TicketRow = InferSelectModel<typeof tickets>
type JobTaskRow = InferSelectModel<typeof jobTasks>

// ── Mock repository ──────────────────────────────────────────────────
vi.mock('../../src/repositories/tickets.repository.ts', () => ({
  getTicketForResolution: vi.fn(),
  setJobTaskProcessing: vi.fn(),
  insertResolutionDraft: vi.fn(),
  setJobTaskFailed: vi.fn(),
  setNeedsManualReview: vi.fn(),
  setResolutionFallback: vi.fn(),
}))

// ── Mock SQS client ────────────────────────────────────────────────
const mockSend = vi.fn()
vi.mock('../../src/queue/client.ts', () => ({
  createSQSClient: () => ({ send: mockSend }),
}))

// ── Mock config ────────────────────────────────────────────────────
vi.mock('../../src/config.ts', () => ({
  config: {
    SQS_QUEUE_URL: 'http://localhost:4566/000000000000/dev-tickets-queue',
    SQS_DLQ_URL: 'http://localhost:4566/000000000000/dev-tickets-dlq',
    PORTKEY_API_KEY: 'test-portkey-key',
    OPENROUTER_API_KEY: 'test-key',
    OPENROUTER_MODEL_RESOLUTION: 'openai/gpt-4o-2024-05-13',
  },
}))

// ── Mock room manager ────────────────────────────────────────────────
vi.mock('../../src/realtime/room-manager.ts', () => ({
  roomManager: { emit: vi.fn(), close: vi.fn() },
}))

// ── Mock logger ────────────────────────────────────────────────────
vi.mock('../../src/logger.ts', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn().mockReturnThis() },
}))

import {
  getTicketForResolution,
  setJobTaskProcessing,
  insertResolutionDraft,
  setJobTaskFailed,
  setNeedsManualReview,
  setResolutionFallback,
} from '../../src/repositories/tickets.repository.ts'
import { processResolutionMessage } from '../../src/handlers/resolution.ts'
import { roomManager } from '../../src/realtime/room-manager.ts'

const mockRepo = {
  getTicketForResolution: vi.mocked(getTicketForResolution),
  setJobTaskProcessing: vi.mocked(setJobTaskProcessing),
  insertResolutionDraft: vi.mocked(insertResolutionDraft),
  setJobTaskFailed: vi.mocked(setJobTaskFailed),
  setNeedsManualReview: vi.mocked(setNeedsManualReview),
  setResolutionFallback: vi.mocked(setResolutionFallback),
}

const fakeTriage: TriageOutput = {
  category: 'technical',
  priority: 'high',
  summary: 'User cannot log in on mobile.',
  sentiment: 'frustrated',
  suggested_tags: ['login', 'mobile'],
  escalation_need: false,
  routing_target: 'engineering',
  confidence: 0.92,
}

const fakeTicket: TicketRow = {
  id: '11111111-1111-1111-1111-111111111111',
  title: 'Login broken',
  description: 'Cannot log in on mobile.',
  customerId: 'c1',
  channel: 'web',
  attachments: null,
  tags: null,
  priorityHint: null,
  status: 'processing',
  triageOutput: fakeTriage,
  resolutionOutput: null,
  errorLog: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const fakeJobTask: JobTaskRow = {
  id: '33333333-3333-3333-3333-333333333333',
  ticketId: fakeTicket.id,
  phase: 'resolution',
  status: 'queued',
  retryCount: 0,
  errorDetails: null,
  startedAt: null,
  completedAt: null,
  processingTimeMs: null,
  modelVersion: null,
  fallbackUsed: false,
  fallbackReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const fakeOutput: ResolutionOutput = {
  suggested_reply: 'We have identified the issue and are applying a fix.',
  internal_note: 'Session token expiry bug confirmed. Reset tokens for affected user.',
  resolution_steps: ['Reset session tokens', 'Notify user'],
  requires_escalation: false,
  confidence: 0.9,
}

const fakeMessage = { ticket_id: fakeTicket.id, phase: 'resolution' as const }

const stubAI = vi.fn<(ticket: TicketRow, triage: TriageOutput) => Promise<ResolutionOutput>>()

const mockRoom = {
  emit: vi.mocked(roomManager.emit),
  close: vi.mocked(roomManager.close),
}

interface SQSSendCall {
  input: { MessageBody: string }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSend.mockResolvedValue({})
  mockRepo.getTicketForResolution.mockResolvedValue({ ticket: fakeTicket, jobTask: fakeJobTask })
  mockRepo.setJobTaskProcessing.mockResolvedValue(undefined)
  mockRepo.insertResolutionDraft.mockResolvedValue(undefined)
  mockRepo.setJobTaskFailed.mockResolvedValue(undefined)
  mockRepo.setNeedsManualReview.mockResolvedValue(undefined)
  mockRepo.setResolutionFallback.mockResolvedValue(undefined)
  stubAI.mockResolvedValue(fakeOutput)
})

describe('processResolutionMessage', () => {
  test('happy path — sets resolution_output and marks ticket completed', async () => {
    await processResolutionMessage(fakeMessage, stubAI)

    expect(mockRepo.setJobTaskProcessing).toHaveBeenCalledWith(fakeTicket.id, 'resolution')
    expect(mockRoom.emit).toHaveBeenCalledWith(
      fakeTicket.id,
      expect.objectContaining({ type: 'ticket_started', ticket_id: fakeTicket.id, phase: 'resolution' }),
    )
    expect(stubAI).toHaveBeenCalledWith(fakeTicket, fakeTriage)
    expect(mockRepo.insertResolutionDraft).toHaveBeenCalledWith(
      fakeTicket.id,
      fakeOutput,
      expect.any(Number),
      'openai/gpt-4o-2024-05-13',
    )
    expect(mockRoom.emit).toHaveBeenCalledWith(
      fakeTicket.id,
      expect.objectContaining({ type: 'ticket_success', ticket_id: fakeTicket.id }),
    )
    expect(mockRoom.close).toHaveBeenCalledWith(fakeTicket.id)
    expect(mockSend).not.toHaveBeenCalled()
  })

  test('phase guard — skips if job_task already completed', async () => {
    mockRepo.getTicketForResolution.mockResolvedValue({
      ticket: fakeTicket,
      jobTask: { ...fakeJobTask, status: 'completed' },
    })

    await processResolutionMessage(fakeMessage, stubAI)

    expect(mockRepo.setJobTaskProcessing).not.toHaveBeenCalled()
    expect(stubAI).not.toHaveBeenCalled()
  })

  test('ticket not found — returns without error', async () => {
    mockRepo.getTicketForResolution.mockResolvedValue(null)

    await processResolutionMessage(fakeMessage, stubAI)

    expect(mockRepo.setJobTaskProcessing).not.toHaveBeenCalled()
  })

  test('failure — applies fallback, sets needs_manual_review, sends to DLQ', async () => {
    stubAI.mockRejectedValue(new Error('Portkey exhausted'))
    mockRepo.getTicketForResolution.mockResolvedValue({
      ticket: fakeTicket,
      jobTask: { ...fakeJobTask, retryCount: 2 },
    })

    await processResolutionMessage(fakeMessage, stubAI)

    expect(mockRepo.setJobTaskFailed).toHaveBeenCalledWith(fakeTicket.id, 'resolution', 'Portkey exhausted', 3)
    expect(mockRepo.setResolutionFallback).toHaveBeenCalledWith(fakeTicket.id, 'Portkey exhausted')
    expect(mockRepo.setNeedsManualReview).toHaveBeenCalledWith(fakeTicket.id, 'Portkey exhausted')
    expect(mockRoom.emit).toHaveBeenCalledWith(
      fakeTicket.id,
      expect.objectContaining({ type: 'ticket_failed', ticket_id: fakeTicket.id, reason: 'Portkey exhausted' }),
    )
    expect(mockRoom.close).toHaveBeenCalledWith(fakeTicket.id)

    // DLQ send
    expect(mockSend).toHaveBeenCalledOnce()
    const calls = mockSend.mock.calls as unknown as [SQSSendCall][]
    const dlqBody = JSON.parse(calls[0]![0]!.input.MessageBody) as Record<string, unknown>
    expect(dlqBody).toMatchObject({ ticket_id: fakeTicket.id, phase: 'resolution', reason: 'Portkey exhausted' })
    expect(dlqBody.failed_at).toBeTruthy()
  })
})
