CREATE TABLE "resolution_drafts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ticket_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"output" jsonb NOT NULL,
	"processing_time_ms" integer NOT NULL,
	"model_version" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "resolution_drafts_ticket_id_version_unique" UNIQUE("ticket_id","version")
);
--> statement-breakpoint
ALTER TABLE "resolution_drafts" ADD CONSTRAINT "resolution_drafts_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE cascade ON UPDATE no action;