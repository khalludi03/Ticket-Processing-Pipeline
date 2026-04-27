import type { TicketEvent } from './events.ts'

export interface WSClient {
  send(data: string): void
  close(): void
}

export class RoomManager {
  private rooms = new Map<string, Set<WSClient>>()
  private clients = new Map<WSClient, string>()

  join(ticketId: string, ws: WSClient): void {
    if (!this.rooms.has(ticketId)) this.rooms.set(ticketId, new Set())
    this.rooms.get(ticketId)!.add(ws)
    this.clients.set(ws, ticketId)
  }

  disconnect(ws: WSClient): void {
    const ticketId = this.clients.get(ws)
    if (!ticketId) return
    this.leave(ticketId, ws)
  }

  leave(ticketId: string, ws: WSClient): void {
    const room = this.rooms.get(ticketId)
    if (!room) return
    room.delete(ws)
    this.clients.delete(ws)
    if (room.size === 0) this.rooms.delete(ticketId)
  }

  emit(ticketId: string, event: TicketEvent): void {
    const room = this.rooms.get(ticketId)
    if (!room) return
    const data = JSON.stringify(event)
    for (const ws of room) ws.send(data)
  }

  close(ticketId: string): void {
    const room = this.rooms.get(ticketId)
    if (!room) return
    for (const ws of room) {
      ws.close()
      this.clients.delete(ws)
    }
    this.rooms.delete(ticketId)
  }

  size(ticketId: string): number {
    return this.rooms.get(ticketId)?.size ?? 0
  }
}

export const roomManager = new RoomManager()
