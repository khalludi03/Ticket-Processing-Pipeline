-- Add fallback tracking columns to job_tasks
ALTER TABLE "job_tasks" ADD COLUMN "fallback_used" boolean DEFAULT false NOT NULL;
ALTER TABLE "job_tasks" ADD COLUMN "fallback_reason" text;
