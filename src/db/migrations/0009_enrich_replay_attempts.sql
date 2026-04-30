CREATE TYPE "replay_status" AS ENUM('queued', 'processing', 'completed', 'failed');

ALTER TABLE "replay_attempts" ADD COLUMN "status" "replay_status" DEFAULT 'queued' NOT NULL;
ALTER TABLE "replay_attempts" ADD COLUMN "result" jsonb;
ALTER TABLE "replay_attempts" ADD COLUMN "error" text;
ALTER TABLE "replay_attempts" ADD COLUMN "updated_at" timestamp DEFAULT now() NOT NULL;
