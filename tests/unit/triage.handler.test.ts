import { describe, test, expect, vi, beforeEach } from 'vitest'
import type { TriageOutput } from '../../src/schemas/triage.ts'
import type { TicketRow } from '../../src/repositories/tickets.repository.ts'

vi.mock('../../src/repositories/tickets.repository.ts', () => ({
  getTicket: vi.fn(),
  setJobTaskProcessing: vi.fn(),
  setTriageCompleted: vi.fn(),
  setNeedsManualReview: vi.fn(),
  setTriageFallback: vi.fn(),
}))

vi.mock('../../src/queue/client.ts', () => ({
  sendToQueue: vi.fn(),
  sendToDLQ: vi.fn(),
}))

vi.mock('../../src/config.ts', () => ({
  config: {
    SQS_QUEUE_URL: 'http://localhost:4566/000000000000/dev-tickets-queue',
    SQS_DLQ_URL: 'http://localhost:4566/000000000000/dev-tickets-dlq',
    PORTKEY_API_KEY: 'test-portkey-key',
    OPENROUTER_API_KEY: 'test-key',
    OPENROUTER_MODEL_TRIAGE: 'gpt-4o-mini',
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
  setTriageCompleted,
  setNeedsManualReview,
  setTriageFallback,
} from '../../src/repositories/tickets.repository.ts'
import { sendToQueue, sendToDLQ } from '../../src/queue/client.ts'
import { processTriageMessage } from '../../src/handlers/triage.ts'
import { roomManager } from '../../src/realtime/room-manager.ts'

const mockRepo = {
  getTicket: vi.mocked(getTicket),
  setJobTaskProcessing: vi.mocked(setJobTaskProcessing),
  setTriageCompleted: vi.mocked(setTriageCompleted),
  setNeedsManualReview: vi.mocked(setNeedsManualReview),
  setTriageFallback: vi.mocked(setTriageFallback),
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
  status: 'queued',
  triageOutput: null,
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

const fakeOutput: TriageOutput = {
  category: 'technical',
  priority: 'high',
  summary: 'User cannot log in on mobile.',
  sentiment: 'frustrated',
  suggested_tags: ['login', 'mobile'],
  escalation_need: false,
  routing_target: 'engineering',
  confidence: 0.9,
}

const fakeMessage = { ticket_id: fakeTicket.id, phase: 'triage' as const }

const stubAI = vi.fn<(ticket: TicketRow) => Promise<TriageOutput>>()

const mockSendToQueue = vi.mocked(sendToQueue)
const mockSendToDLQ = vi.mocked(sendToDLQ)

const mockRoom = {
  emit: vi.mocked(roomManager.emit),
  close: vi.mocked(roomManager.close),
}

beforeEach(() => {
  vi.clearAllMocks()
  mockSendToQueue.mockResolvedValue(undefined)
  mockSendToDLQ.mockResolvedValue(undefined)
  mockRepo.getTicket.mockResolvedValue(fakeTicket)
  mockRepo.setJobTaskProcessing.mockResolvedValue(undefined)
  mockRepo.setTriageCompleted.mockResolvedValue(undefined)
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
    expect(mockSendToQueue).toHaveBeenCalledOnce()
    expect(mockSendToQueue).toHaveBeenCalledWith(
      'http://localhost:4566/000000000000/dev-tickets-queue',
      expect.objectContaining({ ticket_id: fakeTicket.id, phase: 'resolution' }),
    )
  })

  test('phase guard — skips if already triaged', async () => {
    mockRepo.getTicket.mockResolvedValue({ ...fakeTicket, triageOutput: fakeOutput })

    await processTriageMessage(fakeMessage, stubAI)

    expect(mockRepo.setJobTaskProcessing).not.toHaveBeenCalled()
    expect(mockRepo.setTriageCompleted).not.toHaveBeenCalled()
    expect(mockSendToQueue).not.toHaveBeenCalled()
  })

  test('ticket not found — returns without error', async () => {
    mockRepo.getTicket.mockResolvedValue(null)

    await processTriageMessage(fakeMessage, stubAI)

    expect(mockRepo.setJobTaskProcessing).not.toHaveBeenCalled()
  })

  test('failure — applies fallback, sets needs_manual_review, sends to DLQ', async () => {
    stubAI.mockRejectedValue(new Error('Portkey exhausted'))

    await processTriageMessage(fakeMessage, stubAI)

    expect(mockRepo.setTriageFallback).toHaveBeenCalledWith(fakeTicket.id, 'Portkey exhausted')
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
      'triage',
      'Portkey exhausted',
    )
  })
})
