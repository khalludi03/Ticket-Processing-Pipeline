-- Rollback for 0000_safe_havok — drop table before enum types (order matters)
DROP TABLE IF EXISTS "tickets";
DROP TYPE IF EXISTS "public"."ticket_status";
DROP TYPE IF EXISTS "public"."ticket_phase";
