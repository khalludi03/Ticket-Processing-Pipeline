export type TicketStartedEvent = {
  type: 'ticket_started'
  ticket_id: string
  phase: 'triage' | 'resolution'
  timestamp: string
}

export type TicketSuccessEvent = {
  type: 'ticket_success'
  ticket_id: string
  timestamp: string
}

export type TicketFailedEvent = {
  type: 'ticket_failed'
  ticket_id: string
  reason: string
  timestamp: string
}

export type TicketEvent = TicketStartedEvent | TicketSuccessEvent | TicketFailedEvent
