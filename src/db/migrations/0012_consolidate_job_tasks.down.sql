-- Recreate job_tasks table
CREATE TABLE IF NOT EXISTS job_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id UUID NOT NULL REFERENCES tickets(id) ON DELETE CASCADE,
  phase TEXT NOT NULL CHECK (phase IN ('triage', 'resolution')),
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'processing', 'completed', 'failed')),
  retry_count INTEGER NOT NULL DEFAULT 0,
  error_details TEXT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  model_version TEXT,
  processing_time_ms INTEGER,
  fallback_used BOOLEAN NOT NULL DEFAULT FALSE,
  fallback_reason TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  UNIQUE(ticket_id, phase)
);

-- Remove columns from tickets table
ALTER TABLE tickets DROP COLUMN IF EXISTS triage_processing_time_ms;
ALTER TABLE tickets DROP COLUMN IF EXISTS triage_model_version;
ALTER TABLE tickets DROP COLUMN IF EXISTS triage_fallback_used;
ALTER TABLE tickets DROP COLUMN IF EXISTS triage_fallback_reason;
ALTER TABLE tickets DROP COLUMN IF EXISTS resolution_processing_time_ms;
ALTER TABLE tickets DROP COLUMN IF EXISTS resolution_model_version;
ALTER TABLE tickets DROP COLUMN IF EXISTS resolution_fallback_used;
ALTER TABLE tickets DROP COLUMN IF EXISTS resolution_fallback_reason;
