# Ticket Processing Pipeline — Architecture

## Overview
A queue-based backend system for automated AI ticket triage and resolution. Tickets are ingested via an API, queued for processing, passed through two AI phases (triage → resolution) using AWS Bedrock, and clients are notified in real-time via WebSockets. Failed tickets retry with exponential backoff and fall back to partial output before escalating to manual review.

---

## Architecture Decisions

| Layer | Choice |
|---|---|
| Runtime | Node.js / TypeScript |
| HTTP Framework | Hono |
| ORM | Drizzle ORM |
| Database | PostgreSQL (Supabase — hosted, dev + staging) |
| Queue | AWS SQS + DLQ |
| Deployment | AWS Lambda |
| WebSockets | API Gateway WebSocket API + DynamoDB (connection store) |
| AI Execution | Direct AWS Bedrock calls wrapped in LangSmith `traceable` |
| API Auth | API Gateway API Keys |
| IaC | AWS CDK (TypeScript) |
| Env Config | Zod schema + `.env.example` (Supabase `DATABASE_URL`) |
| Logger | Pino with global `redact` config |
| Testing | Unit + integration (real DB + real SQS) |
| Project Structure | Modular monolith |

---

## Project Structure

```
/
├── src/
│   ├── ingestion/        # Epic 2: Hono HTTP handlers for ticket intake
│   ├── triage/           # Epic 3: Phase 1 AI triage via Bedrock + LangSmith
│   ├── resolution/       # Epic 4: Phase 2 AI resolution via Bedrock + LangSmith
│   ├── notifications/    # Epic 5: API Gateway WebSocket connection management
│   ├── observability/    # Epic 6: Pino logger, health check, retry/fallback logic
│   ├── db/               # Drizzle schema, migrations, client
│   └── config.ts         # Zod env validation, typed config export
├── infra/                # AWS CDK stack (Lambda, SQS, API GW, DynamoDB)
├── .env.example
└── tests/
    ├── unit/
    └── integration/
```

---

## Database Schema (PostgreSQL via Drizzle)

### `tickets` table

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `status` | enum | `queued`, `processing`, `completed`, `failed`, `needs_manual_review` |
| `last_completed_phase` | enum | `triage`, `resolution` — phase checkpoint for replay |
| `retry_count` | integer | incremented per phase failure |
| `triage_output` | jsonb | preserved even if resolution fails |
| `resolution_output` | jsonb | null until resolution completes |
| `error_log` | text | last error message |
| `created_at` | timestamp | |
| `updated_at` | timestamp | |

### `ws_connections` (DynamoDB)

| Attribute | Notes |
|---|---|
| `connection_id` | PK — API Gateway WebSocket connection ID |
| `ticket_id` | used to fan-out status updates to subscribed clients |
| `ttl` | auto-expire stale connections |

---

## Epic Implementation Plan

### Epic 1: Foundation & Infrastructure
- Drizzle migrations for `tickets` table
- Rollback migrations for all tables
- Zod env validation on Lambda boot (`config.ts`)
- API Gateway API Keys provisioned via CDK
- SQS main queue + DLQ provisioned via CDK, linked with `maxReceiveCount`
- Queue message payload schema (Zod)
- API key seed script for local/test use
- `.env.example` committed
- Integration tests: DB migrations up/down, SQS send/receive

### Epic 2: Ticket Ingestion API (Hono)
- `POST /tickets` — validate payload, write ticket to DB with `status: queued`, enqueue to SQS
- API Gateway API Key validated at gateway layer (before Lambda)
- Returns `{ ticket_id, status: "queued" }`

### Epic 3: Phase 1 — Triage Pipeline
- SQS → Lambda event source mapping (CDK)
- Lambda reads `last_completed_phase` — skips triage if already completed
- Calls AWS Bedrock wrapped in LangSmith `traceable`
- On success: writes `triage_output`, sets `last_completed_phase = triage`, enqueues resolution phase
- On failure: increments `retry_count`, applies exponential backoff, re-enqueues or triggers fallback

### Epic 4: Phase 2 — Resolution Pipeline
- Same SQS trigger pattern as triage
- Reads `last_completed_phase` — skips resolution if already completed
- Calls Bedrock + LangSmith `traceable`
- On success: writes `resolution_output`, sets `status = completed`, pushes WebSocket notification
- On failure: retry logic same as triage

### Epic 5: Real-time Notifications
- API Gateway WebSocket API (CDK): `$connect`, `$disconnect`, `message` routes
- `$connect`: stores `{ connection_id, ticket_id }` in DynamoDB with TTL
- `$disconnect`: removes connection from DynamoDB
- On ticket `completed`/`failed`/`needs_manual_review`: Lambda queries DynamoDB for `connection_id`s by `ticket_id`, posts to `@connections` API

### Epic 6: Failure Handling & Observability
- **Retry logic**: `retry_count` column, max 3 attempts, exponential backoff (`2^retry_count * 1000ms`)
- **Phase retry guard**: check `last_completed_phase` before retrying — never re-run a completed phase
- **Fallback**: on retry exhaustion, preserve last successful partial output; set `status = needs_manual_review`
- **Pino logger**: global `redact: ['ticket.email', 'ticket.phone', 'body.*.pii']`
- **Required log fields**: `{ timestamp, level, message, ticket_id, phase, retry_count, request_id }`
- **Health check** `GET /health`: `{ status: "ok"|"degraded"|"down", checks: { db, queue, ai } }`
- **Replay endpoint** `POST /tickets/:id/replay`: API Key auth, optional `{ from_phase: "triage"|"resolution" }`
- **Replay guard**: rejects if ticket is currently `processing`
- Unit tests: retry logic, fallback, PII redaction, phase guards
- Integration tests: 3-retry + DLQ routing, fallback applied, replay skips completed phase

---

## Database Setup

- **Dev / Staging**: Supabase hosted PostgreSQL — connection string via `DATABASE_URL` env var
- **Production**: AWS RDS PostgreSQL (provisioned via CDK)
- Drizzle ORM manages all schema migrations — no manual SQL in production paths
- `.env` is gitignored; `.env.example` documents all required variables

---

## Key Invariants

- A phase is never re-run if `last_completed_phase` already records it — unless `from_phase` override is passed
- `triage_output` is never overwritten by a failed resolution attempt
- All log statements go through Pino — no `console.log` in production paths
- PII redaction enforced at the logger serialization layer, not per-callsite

---

## Verification Checklist

1. Run Drizzle migrations — confirm `tickets` table schema matches spec
2. `POST /tickets` with valid API Key → ticket in DB with `status: queued`, message in SQS
3. SQS triggers triage Lambda → `triage_output` written, `last_completed_phase = triage`
4. Resolution Lambda runs → `resolution_output` written, `status = completed`
5. WebSocket client subscribed to `ticket_id` receives completion event
6. Force triage failure 3× → `retry_count = 3`, `status = needs_manual_review`, `triage_output` preserved
7. `POST /tickets/:id/replay` → ticket re-enqueued, checkpoint respected
8. `GET /health` → returns per-dependency status object
9. CloudWatch logs — no PII fields appear in any log line
