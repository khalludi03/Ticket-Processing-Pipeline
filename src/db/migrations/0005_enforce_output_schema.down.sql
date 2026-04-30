-- Rollback: Remove JSONB key validation constraints
ALTER TABLE "tickets" DROP CONSTRAINT IF EXISTS "triage_output_keys";
ALTER TABLE "tickets" DROP CONSTRAINT IF EXISTS "resolution_output_keys";

-- Remove backfilled keys from existing rows
UPDATE "tickets" SET "triage_output" = "triage_output" - 'escalation_need' - 'routing_target'
WHERE "triage_output" IS NOT NULL;
