-- Enforce required keys on triage_output and resolution_output JSONB columns

-- Backfill missing keys for existing rows
UPDATE "tickets" SET "triage_output" = jsonb_set(
  jsonb_set(
    COALESCE("triage_output", '{}'::jsonb),
    '{escalation_need}',
    'false'
  ),
  '{routing_target}',
  '"general"'
) WHERE "triage_output" IS NOT NULL AND NOT ("triage_output" ? 'escalation_need');

UPDATE "tickets" SET "triage_output" = jsonb_set(
  jsonb_set(
    COALESCE("triage_output", '{}'::jsonb),
    '{escalation_need}',
    'true'
  ),
  '{routing_target}',
  '"manual_review"'
) WHERE "triage_output" IS NOT NULL AND "triage_output" ? 'confidence' AND ("triage_output"->>'confidence')::float = 0;

-- Triage output must contain: category, priority, summary, sentiment, suggested_tags, escalation_need, routing_target, confidence
ALTER TABLE "tickets" ADD CONSTRAINT "triage_output_keys" CHECK (
  "triage_output" IS NULL OR (
    "triage_output" ? 'category' AND
    "triage_output" ? 'priority' AND
    "triage_output" ? 'summary' AND
    "triage_output" ? 'sentiment' AND
    "triage_output" ? 'suggested_tags' AND
    "triage_output" ? 'escalation_need' AND
    "triage_output" ? 'routing_target' AND
    "triage_output" ? 'confidence'
  )
);

-- Resolution output must contain: suggested_reply, internal_note, resolution_steps, requires_escalation, confidence
ALTER TABLE "tickets" ADD CONSTRAINT "resolution_output_keys" CHECK (
  "resolution_output" IS NULL OR (
    "resolution_output" ? 'suggested_reply' AND
    "resolution_output" ? 'internal_note' AND
    "resolution_output" ? 'resolution_steps' AND
    "resolution_output" ? 'requires_escalation' AND
    "resolution_output" ? 'confidence'
  )
);
