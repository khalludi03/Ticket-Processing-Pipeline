CREATE TABLE "replay_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "ticket_id" uuid NOT NULL REFERENCES "tickets"("id") ON DELETE CASCADE,
  "phase" "phase" NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL
);
