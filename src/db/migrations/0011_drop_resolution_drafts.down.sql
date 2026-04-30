CREATE TABLE IF NOT EXISTS resolution_drafts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  output JSONB NOT NULL,
  processing_time_ms INTEGER NOT NULL,
  model_version TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(ticket_id, version)
);
