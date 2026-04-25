import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import postgres from "postgres";
import { config } from "../../src/config";

const conn = postgres(config.DATABASE_URL, { max: 1 });

const migrationSql = await Bun.file(
  "src/db/migrations/0000_safe_havok.sql"
).text();

const rollbackSql = await Bun.file(
  "src/db/migrations/rollback/0000_rollback_tickets.sql"
).text();

// drizzle-kit uses --> statement-breakpoint comments to split statements;
// strip them so we can pass the whole file to conn.unsafe()
const cleanMigrationSql = migrationSql
  .split("--> statement-breakpoint")
  .join("");

afterAll(async () => conn.end());

const tableExists = async (): Promise<boolean> => {
  const [{ exists }] = await conn<[{ exists: boolean }]>`
    SELECT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'tickets'
    ) AS exists`;
  return exists;
};

const enumExists = async (name: string): Promise<boolean> => {
  const [{ exists }] = await conn<[{ exists: boolean }]>`
    SELECT EXISTS (
      SELECT 1 FROM pg_type WHERE typname = ${name} AND typtype = 'e'
    ) AS exists`;
  return exists;
};

describe("0000_create_tickets — forward migration", () => {
  beforeAll(async () => {
    await conn.unsafe(rollbackSql); // ensure clean slate
    await conn.unsafe(cleanMigrationSql);
  });

  afterAll(async () => {
    await conn.unsafe(rollbackSql);
  });

  it("creates the tickets table", async () => {
    expect(await tableExists()).toBe(true);
  });

  it("creates the ticket_status enum type", async () => {
    expect(await enumExists("ticket_status")).toBe(true);
  });

  it("creates the ticket_phase enum type", async () => {
    expect(await enumExists("ticket_phase")).toBe(true);
  });

  it("has all 7 columns with correct types and nullability", async () => {
    const rows = await conn<
      { column_name: string; data_type: string; is_nullable: string }[]
    >`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'tickets'
      ORDER BY ordinal_position`;

    expect(rows).toHaveLength(7);
    const col = Object.fromEntries(rows.map((r) => [r.column_name, r]));

    expect(col["id"]?.data_type).toBe("uuid");
    expect(col["id"]?.is_nullable).toBe("NO");

    expect(col["status"]?.data_type).toBe("USER-DEFINED");
    expect(col["status"]?.is_nullable).toBe("NO");

    expect(col["last_completed_phase"]?.data_type).toBe("USER-DEFINED");
    expect(col["last_completed_phase"]?.is_nullable).toBe("YES");

    expect(col["triage_output"]?.data_type).toBe("jsonb");
    expect(col["triage_output"]?.is_nullable).toBe("YES");

    expect(col["resolution_output"]?.data_type).toBe("jsonb");
    expect(col["resolution_output"]?.is_nullable).toBe("YES");

    expect(col["created_at"]?.data_type).toBe("timestamp without time zone");
    expect(col["created_at"]?.is_nullable).toBe("NO");

    expect(col["updated_at"]?.data_type).toBe("timestamp without time zone");
    expect(col["updated_at"]?.is_nullable).toBe("NO");
  });

  it("ticket_status has all 5 values in correct order", async () => {
    const rows = await conn<{ enumlabel: string }[]>`
      SELECT e.enumlabel
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'ticket_status'
      ORDER BY e.enumsortorder`;
    expect(rows.map((r) => r.enumlabel)).toEqual([
      "queued",
      "processing",
      "completed",
      "failed",
      "needs_manual_review",
    ]);
  });

  it("ticket_phase has triage and resolution in order", async () => {
    const rows = await conn<{ enumlabel: string }[]>`
      SELECT e.enumlabel
      FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'ticket_phase'
      ORDER BY e.enumsortorder`;
    expect(rows.map((r) => r.enumlabel)).toEqual(["triage", "resolution"]);
  });
});

describe("0000_rollback_tickets", () => {
  beforeAll(async () => {
    // apply migration first so rollback has something to drop
    await conn.unsafe(rollbackSql);
    await conn.unsafe(cleanMigrationSql);
    await conn.unsafe(rollbackSql);
  });

  it("drops the tickets table", async () => {
    expect(await tableExists()).toBe(false);
  });

  it("drops the ticket_status enum type", async () => {
    expect(await enumExists("ticket_status")).toBe(false);
  });

  it("drops the ticket_phase enum type", async () => {
    expect(await enumExists("ticket_phase")).toBe(false);
  });
});
