-- Add new columns to tickets table
ALTER TABLE tickets ADD COLUMN triage_processing_time_ms INTEGER;
ALTER TABLE tickets ADD COLUMN triage_model_version TEXT;
ALTER TABLE tickets ADD COLUMN triage_fallback_used BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tickets ADD COLUMN triage_fallback_reason TEXT;
ALTER TABLE tickets ADD COLUMN resolution_processing_time_ms INTEGER;
ALTER TABLE tickets ADD COLUMN resolution_model_version TEXT;
ALTER TABLE tickets ADD COLUMN resolution_fallback_used BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE tickets ADD COLUMN resolution_fallback_reason TEXT;

-- Drop job_tasks table
DROP TABLE IF EXISTS job_tasks CASCADE;
