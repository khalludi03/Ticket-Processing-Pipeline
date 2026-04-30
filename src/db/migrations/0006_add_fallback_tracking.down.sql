-- Rollback: Remove fallback tracking columns from job_tasks
ALTER TABLE "job_tasks" DROP COLUMN IF EXISTS "fallback_used";
ALTER TABLE "job_tasks" DROP COLUMN IF EXISTS "fallback_reason";
