CREATE TYPE "public"."ticket_phase" AS ENUM('triage', 'resolution');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('queued', 'processing', 'completed', 'failed', 'needs_manual_review');--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"status" "ticket_status" DEFAULT 'queued' NOT NULL,
	"last_completed_phase" "ticket_phase",
	"triage_output" jsonb,
	"resolution_output" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
