import { pgTable, uuid, timestamp, jsonb, pgEnum } from "drizzle-orm/pg-core";

export const ticketStatusEnum = pgEnum("ticket_status", [
  "queued",
  "processing",
  "completed",
  "failed",
  "needs_manual_review",
]);

export const ticketPhaseEnum = pgEnum("ticket_phase", ["triage", "resolution"]);

export const tickets = pgTable("tickets", {
  id:                 uuid("id").primaryKey().defaultRandom(),
  status:             ticketStatusEnum("status").notNull().default("queued"),
  lastCompletedPhase: ticketPhaseEnum("last_completed_phase"),
  triageOutput:       jsonb("triage_output"),
  resolutionOutput:   jsonb("resolution_output"),
  createdAt:          timestamp("created_at").notNull().defaultNow(),
  updatedAt:          timestamp("updated_at").notNull().defaultNow()
                        .$onUpdateFn(() => new Date()),
});

export type Ticket    = typeof tickets.$inferSelect;
export type NewTicket = typeof tickets.$inferInsert;
