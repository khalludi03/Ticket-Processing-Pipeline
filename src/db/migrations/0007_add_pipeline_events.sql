-- Create pipeline_events audit trail table
CREATE TYPE "event_type" AS ENUM('phase_started', 'phase_completed', 'retry_attempted', 'fallback_triggered', 'pipeline_completed', 'ticket_created', 'ticket_failed');

CREATE TABLE "pipeline_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ticket_id" uuid NOT NULL REFERENCES "tickets"("id") ON DELETE CASCADE,
  "phase" "phase",
  "event_type" "event_type" NOT NULL,
  "payload" jsonb,
  "created_at" timestamp DEFAULT now() NOT NULL
);

-- Index for querying events by ticket
CREATE INDEX "pipeline_events_ticket_id_idx" ON "pipeline_events"("ticket_id");

-- Index for querying events by type
CREATE INDEX "pipeline_events_event_type_idx" ON "pipeline_events"("event_type");
