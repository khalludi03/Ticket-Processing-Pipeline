-- Rollback: Remove pipeline_events audit trail table
DROP TABLE IF EXISTS "pipeline_events";
DROP TYPE IF EXISTS "event_type";
