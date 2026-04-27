import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { ResolutionOutput } from '../../src/resolution/schema.ts'
import type { TriageOutput } from '../../src/triage/schema.ts'

// ── Mock repository ──────────────────────────────────────────────────────────
vi.mock('../../src/repositories/tickets.repository.ts', () => ({
  getTicketForResolution: vi.fn(),
  setJobTaskProcessing: vi.fn(),
  insertResolutionDraft: vi.fn(),
  setJobTaskFailed: vi.fn(),
  setNeedsManualReview: vi.fn(),
  setResolutionFallback: vi.fn(),
}))

// ── Mock SQS client ──────────────────────────────────────────────────────────
const mockSend = vi.fn()
vi.mock('../../src/queue/client.ts', () => ({
  createSQSClient: () => ({ send: mockSend }),
}))

// ── Mock config ──────────────────────────────────────────────────────────────
vi.mock('../../src/config.ts', () => ({
  config: {
    SQS_QUEUE_URL: 'http://localhost:4566/000000000000/dev-tickets-queue',
    SQS_DLQ_URL: 'http://localhost:4566/000000000000/dev-tickets-dlq',
    BEDROCK_MODEL_ID: 'anthropic.claude-3-haiku-20240307-v1:0',
  },
}))

// ── Mock room manager ────────────────────────────────────────────────────────
vi.mock('../../src/realtime/room-manager.ts', () => ({
  roomManager: { emit: vi.fn(), close: vi.fn() },
}))

// ── Mock logger ──────────────────────────────────────────────────────────────
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
import { processResolutionMessage } from '../../src/resolution/handler.ts'
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
  confidence: 0.92,
}

const fakeTicket = {
  id: '11111111-1111-1111-1111-111111111111',
  title: 'Login broken',
  description: 'Cannot log in on mobile.',
  customerId: 'c1',
  channel: 'web' as const,
  attachments: null,
  tags: null,
  priorityHint: null,
  status: 'processing' as const,
  triageOutput: fakeTriage,
  resolutionOutput: null,
  errorLog: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const fakeJobTask = {
  id: '33333333-3333-3333-3333-333333333333',
  ticketId: fakeTicket.id,
  phase: 'resolution' as const,
  status: 'queued' as const,
  retryCount: 0,
  errorDetails: null,
  startedAt: null,
  completedAt: null,
  modelVersion: null,
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

const fakeMessage = { ticket_id: fakeTicket.id, phase: 'resolution' as const, retry_count: 0 }

const stubAI = vi.fn().mockResolvedValue(fakeOutput)

const mockRoom = {
  emit: vi.mocked(roomManager.emit),
  close: vi.mocked(roomManager.close),
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
      'anthropic.claude-3-haiku-20240307-v1:0',
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

  test('failure retry_count=0 — sets failed and re-enqueues with DelaySeconds=2', async () => {
    stubAI.mockRejectedValue(new Error('Bedrock timeout'))

    await processResolutionMessage(fakeMessage, stubAI)

    expect(mockRepo.setJobTaskFailed).toHaveBeenCalledWith(fakeTicket.id, 'resolution', 'Bedrock timeout', 1)
    expect(mockRepo.setNeedsManualReview).not.toHaveBeenCalled()
    expect(mockSend).toHaveBeenCalledOnce()

    const call = mockSend.mock.calls[0][0].input as { DelaySeconds: number; MessageBody: string }
    expect(call.DelaySeconds).toBe(2)
    const body = JSON.parse(call.MessageBody) as unknown
    expect(body).toMatchObject({ ticket_id: fakeTicket.id, phase: 'resolution', retry_count: 1 })
  })

  test('failure retry_count=1 — re-enqueues with DelaySeconds=4', async () => {
    stubAI.mockRejectedValue(new Error('fail'))

    await processResolutionMessage({ ...fakeMessage, retry_count: 1 }, stubAI)

    const call = mockSend.mock.calls[0][0].input as { DelaySeconds: number }
    expect(call.DelaySeconds).toBe(4)
    expect(mockRepo.setJobTaskFailed).toHaveBeenCalledWith(fakeTicket.id, 'resolution', 'fail', 2)
  })

  test('failure retry_count=2 — applies fallback, sets needs_manual_review, sends to DLQ', async () => {
    stubAI.mockRejectedValue(new Error('exhausted'))

    await processResolutionMessage({ ...fakeMessage, retry_count: 2 }, stubAI)

    expect(mockRepo.setJobTaskFailed).toHaveBeenCalledWith(fakeTicket.id, 'resolution', 'exhausted', 3)
    expect(mockRepo.setResolutionFallback).toHaveBeenCalledWith(fakeTicket.id)
    expect(mockRepo.setNeedsManualReview).toHaveBeenCalledWith(fakeTicket.id, 'exhausted')
    expect(mockRoom.emit).toHaveBeenCalledWith(
      fakeTicket.id,
      expect.objectContaining({ type: 'ticket_failed', ticket_id: fakeTicket.id, reason: 'exhausted' }),
    )
    expect(mockRoom.close).toHaveBeenCalledWith(fakeTicket.id)

    // DLQ send
    expect(mockSend).toHaveBeenCalledOnce()
    const dlqBody = JSON.parse(mockSend.mock.calls[0][0].input.MessageBody as string) as Record<string, unknown>
    expect(dlqBody).toMatchObject({ ticket_id: fakeTicket.id, phase: 'resolution', retry_count: 3, reason: 'exhausted' })
    expect(dlqBody.failed_at).toBeTruthy()
  })
})
