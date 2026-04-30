-- Enrich api_keys with production metadata columns
ALTER TABLE "api_keys" ADD COLUMN "name" text;
ALTER TABLE "api_keys" ADD COLUMN "created_by" text;
ALTER TABLE "api_keys" ADD COLUMN "last_used_at" timestamp;
ALTER TABLE "api_keys" ADD COLUMN "expires_at" timestamp;

-- Backfill existing rows with default name
UPDATE "api_keys" SET "name" = 'default-key' WHERE "name" IS NULL;

-- Now enforce NOT NULL on name
ALTER TABLE "api_keys" ALTER COLUMN "name" SET NOT NULL;
