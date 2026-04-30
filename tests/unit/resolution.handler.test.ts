import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { ResolutionOutput } from '../../src/schemas/resolution.ts'
import type { TriageOutput } from '../../src/schemas/triage.ts'
import type { TicketRow } from '../../src/repositories/tickets.repository.ts'

vi.mock('../../src/repositories/tickets.repository.ts', () => ({
  getTicket: vi.fn(),
  setJobTaskProcessing: vi.fn(),
  insertResolutionDraft: vi.fn(),
  setNeedsManualReview: vi.fn(),
  setResolutionFallback: vi.fn(),
}))

vi.mock('../../src/queue/client.ts', () => ({
  sendToDLQ: vi.fn(),
}))

vi.mock('../../src/config.ts', () => ({
  config: {
    SQS_QUEUE_URL: 'http://localhost:4566/000000000000/dev-tickets-queue',
    SQS_DLQ_URL: 'http://localhost:4566/000000000000/dev-tickets-dlq',
    PORTKEY_API_KEY: 'test-portkey-key',
    OPENROUTER_API_KEY: 'test-key',
    OPENROUTER_MODEL_RESOLUTION: 'openai/gpt-4o-2024-05-13',
  },
}))

vi.mock('../../src/realtime/room-manager.ts', () => ({
  roomManager: { emit: vi.fn(), close: vi.fn() },
}))

vi.mock('../../src/logger.ts', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), child: vi.fn().mockReturnThis() },
}))

import {
  getTicket,
  setJobTaskProcessing,
  insertResolutionDraft,
  setNeedsManualReview,
  setResolutionFallback,
} from '../../src/repositories/tickets.repository.ts'
import { sendToDLQ } from '../../src/queue/client.ts'
import { processResolutionMessage } from '../../src/handlers/resolution.ts'
import { roomManager } from '../../src/realtime/room-manager.ts'

const mockRepo = {
  getTicket: vi.mocked(getTicket),
  setJobTaskProcessing: vi.mocked(setJobTaskProcessing),
  insertResolutionDraft: vi.mocked(insertResolutionDraft),
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
  triageProcessingTimeMs: null,
  triageModelVersion: null,
  triageFallbackUsed: false,
  triageFallbackReason: null,
  resolutionProcessingTimeMs: null,
  resolutionModelVersion: null,
  resolutionFallbackUsed: false,
  resolutionFallbackReason: null,
  errorLog: null,
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

const mockSendToDLQ = vi.mocked(sendToDLQ)

const mockRoom = {
  emit: vi.mocked(roomManager.emit),
  close: vi.mocked(roomManager.close),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSendToDLQ.mockResolvedValue(undefined)
  mockRepo.getTicket.mockResolvedValue(fakeTicket)
  mockRepo.setJobTaskProcessing.mockResolvedValue(undefined)
  mockRepo.insertResolutionDraft.mockResolvedValue(undefined)
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
    expect(mockSendToDLQ).not.toHaveBeenCalled()
  })

  test('phase guard — skips if already resolved', async () => {
    mockRepo.getTicket.mockResolvedValue({ ...fakeTicket, resolutionOutput: fakeOutput })

    await processResolutionMessage(fakeMessage, stubAI)

    expect(mockRepo.setJobTaskProcessing).not.toHaveBeenCalled()
    expect(stubAI).not.toHaveBeenCalled()
  })

  test('ticket not found — returns without error', async () => {
    mockRepo.getTicket.mockResolvedValue(null)

    await processResolutionMessage(fakeMessage, stubAI)

    expect(mockRepo.setJobTaskProcessing).not.toHaveBeenCalled()
  })

  test('failure — applies fallback, sets needs_manual_review, sends to DLQ', async () => {
    stubAI.mockRejectedValue(new Error('Portkey exhausted'))

    await processResolutionMessage(fakeMessage, stubAI)

    expect(mockRepo.setResolutionFallback).toHaveBeenCalledWith(fakeTicket.id, 'Portkey exhausted')
    expect(mockRepo.setNeedsManualReview).toHaveBeenCalledWith(fakeTicket.id, 'Portkey exhausted')
    expect(mockRoom.emit).toHaveBeenCalledWith(
      fakeTicket.id,
      expect.objectContaining({ type: 'ticket_failed', ticket_id: fakeTicket.id, reason: 'Portkey exhausted' }),
    )
    expect(mockRoom.close).toHaveBeenCalledWith(fakeTicket.id)
    expect(mockSendToDLQ).toHaveBeenCalledOnce()
    expect(mockSendToDLQ).toHaveBeenCalledWith(
      'http://localhost:4566/000000000000/dev-tickets-dlq',
      fakeTicket.id,
      'resolution',
      'Portkey exhausted',
    )
  })
})
