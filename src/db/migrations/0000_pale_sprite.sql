CREATE TYPE "public"."channel" AS ENUM('email', 'chat', 'web');--> statement-breakpoint
CREATE TYPE "public"."job_task_status" AS ENUM('queued', 'processing', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."phase" AS ENUM('triage', 'resolution');--> statement-breakpoint
CREATE TYPE "public"."priority_hint" AS ENUM('low', 'medium', 'high');--> statement-breakpoint
CREATE TYPE "public"."ticket_status" AS ENUM('queued', 'processing', 'completed', 'failed', 'needs_manual_review');--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"key_value" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "api_keys_key_value_unique" UNIQUE("key_value")
);
--> statement-breakpoint
CREATE TABLE "job_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"phase" "phase" NOT NULL,
	"status" "job_task_status" DEFAULT 'queued' NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"error_details" text,
	"started_at" timestamp,
	"completed_at" timestamp,
	"model_version" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "job_tasks_ticket_id_phase_unique" UNIQUE("ticket_id","phase")
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"customer_id" text NOT NULL,
	"channel" "channel" NOT NULL,
	"attachments" jsonb,
	"tags" jsonb,
	"priority_hint" "priority_hint",
	"status" "ticket_status" DEFAULT 'queued' NOT NULL,
	"triage_output" jsonb,
	"resolution_output" jsonb,
	"error_log" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_tasks" ADD CONSTRAINT "job_tasks_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;