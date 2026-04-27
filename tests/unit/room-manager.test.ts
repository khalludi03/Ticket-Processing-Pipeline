import { describe, test, expect, vi, beforeEach } from 'vitest'
import { RoomManager } from '../../src/realtime/room-manager.ts'
import type { TicketEvent } from '../../src/realtime/events.ts'

function makeClient() {
  return { send: vi.fn(), close: vi.fn() }
}

const TICKET = '11111111-1111-1111-1111-111111111111'
const started: TicketEvent = { type: 'ticket_started', ticket_id: TICKET, phase: 'triage', timestamp: '2024-01-01T00:00:00.000Z' }
const success: TicketEvent = { type: 'ticket_success', ticket_id: TICKET, timestamp: '2024-01-01T00:00:00.000Z' }
const failed: TicketEvent = { type: 'ticket_failed', ticket_id: TICKET, reason: 'boom', timestamp: '2024-01-01T00:00:00.000Z' }

let rm: RoomManager

beforeEach(() => {
  rm = new RoomManager()
})

describe('RoomManager', () => {
  test('emit — sends JSON to all clients in the room', () => {
    const a = makeClient()
    const b = makeClient()
    rm.join(TICKET, a)
    rm.join(TICKET, b)

    rm.emit(TICKET, started)

    expect(a.send).toHaveBeenCalledWith(JSON.stringify(started))
    expect(b.send).toHaveBeenCalledWith(JSON.stringify(started))
  })

  test('emit — does nothing if no room exists', () => {
    const a = makeClient()
    rm.emit(TICKET, started)
    expect(a.send).not.toHaveBeenCalled()
  })

  test('emit — only sends to clients in the correct room', () => {
    const OTHER = '22222222-2222-2222-2222-222222222222'
    const a = makeClient()
    const b = makeClient()
    rm.join(TICKET, a)
    rm.join(OTHER, b)

    rm.emit(TICKET, started)

    expect(a.send).toHaveBeenCalledOnce()
    expect(b.send).not.toHaveBeenCalled()
  })

  test('leave — removes client from room', () => {
    const a = makeClient()
    rm.join(TICKET, a)
    rm.leave(TICKET, a)

    rm.emit(TICKET, started)

    expect(a.send).not.toHaveBeenCalled()
    expect(rm.size(TICKET)).toBe(0)
  })

  test('leave — deletes room when last client leaves', () => {
    const a = makeClient()
    rm.join(TICKET, a)
    rm.leave(TICKET, a)
    expect(rm.size(TICKET)).toBe(0)
  })

  test('disconnect — removes client using reverse lookup', () => {
    const a = makeClient()
    rm.join(TICKET, a)
    rm.disconnect(a)

    rm.emit(TICKET, started)

    expect(a.send).not.toHaveBeenCalled()
  })

  test('disconnect — does nothing for unknown client', () => {
    const a = makeClient()
    expect(() => rm.disconnect(a)).not.toThrow()
  })

  test('close — calls close on all clients and removes room', () => {
    const a = makeClient()
    const b = makeClient()
    rm.join(TICKET, a)
    rm.join(TICKET, b)

    rm.close(TICKET)

    expect(a.close).toHaveBeenCalledOnce()
    expect(b.close).toHaveBeenCalledOnce()
    expect(rm.size(TICKET)).toBe(0)
  })

  test('close — does nothing if room does not exist', () => {
    expect(() => rm.close(TICKET)).not.toThrow()
  })

  test('size — returns correct client count', () => {
    expect(rm.size(TICKET)).toBe(0)
    const a = makeClient()
    const b = makeClient()
    rm.join(TICKET, a)
    expect(rm.size(TICKET)).toBe(1)
    rm.join(TICKET, b)
    expect(rm.size(TICKET)).toBe(2)
    rm.leave(TICKET, a)
    expect(rm.size(TICKET)).toBe(1)
  })

  test('success event — emitted correctly', () => {
    const a = makeClient()
    rm.join(TICKET, a)
    rm.emit(TICKET, success)
    expect(a.send).toHaveBeenCalledWith(JSON.stringify(success))
  })

  test('failed event — emitted correctly', () => {
    const a = makeClient()
    rm.join(TICKET, a)
    rm.emit(TICKET, failed)
    expect(a.send).toHaveBeenCalledWith(JSON.stringify(failed))
  })
})
