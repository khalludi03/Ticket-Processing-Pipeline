import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { TriageOutput } from '../../src/schemas/triage.ts'

// ── Mock repository ──────────────────────────────────────────────────────────
vi.mock('../../src/repositories/tickets.repository.ts', () => ({
  getTicketForTriage: vi.fn(),
  setJobTaskProcessing: vi.fn(),
  setTriageCompleted: vi.fn(),
  setJobTaskFailed: vi.fn(),
  setNeedsManualReview: vi.fn(),
  setTriageFallback: vi.fn(),
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
    PORTKEY_API_KEY: 'test-portkey-key',
    OPENROUTER_API_KEY: 'test-key',
    OPENROUTER_MODEL_TRIAGE: 'gpt-4o-mini',
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
  getTicketForTriage,
  setJobTaskProcessing,
  setTriageCompleted,
  setJobTaskFailed,
  setNeedsManualReview,
  setTriageFallback,
} from '../../src/repositories/tickets.repository.ts'
import { processTriageMessage } from '../../src/handlers/triage.ts'
import { roomManager } from '../../src/realtime/room-manager.ts'

const mockRepo = {
  getTicketForTriage: vi.mocked(getTicketForTriage),
  setJobTaskProcessing: vi.mocked(setJobTaskProcessing),
  setTriageCompleted: vi.mocked(setTriageCompleted),
  setJobTaskFailed: vi.mocked(setJobTaskFailed),
  setNeedsManualReview: vi.mocked(setNeedsManualReview),
  setTriageFallback: vi.mocked(setTriageFallback),
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
  status: 'queued' as const,
  triageOutput: null,
  resolutionOutput: null,
  errorLog: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const fakeJobTask = {
  id: '22222222-2222-2222-2222-222222222222',
  ticketId: fakeTicket.id,
  phase: 'triage' as const,
  status: 'queued' as const,
  retryCount: 0,
  errorDetails: null,
  startedAt: null,
  completedAt: null,
  modelVersion: null,
  createdAt: new Date(),
  updatedAt: new Date(),
}

const fakeOutput: TriageOutput = {
  category: 'technical',
  priority: 'high',
  summary: 'User cannot log in on mobile.',
  sentiment: 'frustrated',
  suggested_tags: ['login', 'mobile'],
  confidence: 0.9,
}

const fakeMessage = { ticket_id: fakeTicket.id, phase: 'triage' as const }

const stubAI = vi.fn().mockResolvedValue(fakeOutput)

const mockRoom = {
  emit: vi.mocked(roomManager.emit),
  close: vi.mocked(roomManager.close),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSend.mockResolvedValue({})
  mockRepo.getTicketForTriage.mockResolvedValue({ ticket: fakeTicket, jobTask: fakeJobTask })
  mockRepo.setJobTaskProcessing.mockResolvedValue(undefined)
  mockRepo.setTriageCompleted.mockResolvedValue(undefined)
  mockRepo.setJobTaskFailed.mockResolvedValue(undefined)
  mockRepo.setNeedsManualReview.mockResolvedValue(undefined)
  mockRepo.setTriageFallback.mockResolvedValue(undefined)
  stubAI.mockResolvedValue(fakeOutput)
})

describe('processTriageMessage', () => {
  test('happy path — sets completed and enqueues resolution', async () => {
    await processTriageMessage(fakeMessage, stubAI)

    expect(mockRepo.setJobTaskProcessing).toHaveBeenCalledWith(fakeTicket.id, 'triage')
    expect(mockRoom.emit).toHaveBeenCalledWith(
      fakeTicket.id,
      expect.objectContaining({ type: 'ticket_started', ticket_id: fakeTicket.id, phase: 'triage' }),
    )
    expect(mockRepo.setTriageCompleted).toHaveBeenCalledWith(
      fakeTicket.id,
      fakeOutput,
      expect.any(Number),
      'gpt-4o-mini',
    )
    expect(mockSend).toHaveBeenCalledOnce()

    const sentBody = JSON.parse(mockSend.mock.calls[0][0].input.MessageBody as string) as unknown
    expect(sentBody).toMatchObject({ ticket_id: fakeTicket.id, phase: 'resolution' })
  })

  test('phase guard — skips if job_task already completed', async () => {
    mockRepo.getTicketForTriage.mockResolvedValue({
      ticket: fakeTicket,
      jobTask: { ...fakeJobTask, status: 'completed' },
    })

    await processTriageMessage(fakeMessage, stubAI)

    expect(mockRepo.setJobTaskProcessing).not.toHaveBeenCalled()
    expect(mockRepo.setTriageCompleted).not.toHaveBeenCalled()
    expect(mockSend).not.toHaveBeenCalled()
  })

  test('ticket not found — returns without error', async () => {
    mockRepo.getTicketForTriage.mockResolvedValue(null)

    await processTriageMessage(fakeMessage, stubAI)

    expect(mockRepo.setJobTaskProcessing).not.toHaveBeenCalled()
  })

  test('failure — applies fallback, sets needs_manual_review, sends to DLQ', async () => {
    stubAI.mockRejectedValue(new Error('Portkey exhausted'))

    await processTriageMessage(fakeMessage, stubAI)

    expect(mockRepo.setJobTaskFailed).toHaveBeenCalledWith(fakeTicket.id, 'triage', 'Portkey exhausted', 0)
    expect(mockRepo.setTriageFallback).toHaveBeenCalledWith(fakeTicket.id)
    expect(mockRepo.setNeedsManualReview).toHaveBeenCalledWith(fakeTicket.id, 'Portkey exhausted')
    expect(mockRoom.emit).toHaveBeenCalledWith(
      fakeTicket.id,
      expect.objectContaining({ type: 'ticket_failed', ticket_id: fakeTicket.id, reason: 'Portkey exhausted' }),
    )
    expect(mockRoom.close).toHaveBeenCalledWith(fakeTicket.id)

    // DLQ send
    expect(mockSend).toHaveBeenCalledOnce()
    const dlqBody = JSON.parse(mockSend.mock.calls[0][0].input.MessageBody as string) as Record<string, unknown>
    expect(dlqBody).toMatchObject({ ticket_id: fakeTicket.id, phase: 'triage', reason: 'Portkey exhausted' })
    expect(dlqBody.failed_at).toBeTruthy()
  })
})
