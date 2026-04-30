# Testing Guide — Epic 1, 2, 3, 4, 5 & 6

## Infrastructure Setup

All integration tests require two local services running before `npm test`.

### 1. PostgreSQL (Docker)

```sh
docker compose up -d           # starts postgres on port 5432 + pgAdmin on port 8080
npm run db:migrate             # apply schema (creates tickets, job_tasks, api_keys, resolution_drafts tables + enums)
npm run seed                   # insert SEED_API_KEY from .env into api_keys
```

To tear down the schema:

```sh
npm run db:rollback            # drops all tables and enums
```

pgAdmin UI is available at `http://localhost:8080`.  
Connect with: host `localhost`, port `5432`, user `postgres`, password `testingpassword`, database `ticket_pipeline`.

### 2. LocalStack (SQS)

```sh
docker compose --profile localstack up -d
```

Starts LocalStack on port 4566. The `localstack/init-aws.sh` script auto-creates two queues on startup:
- `dev-tickets-queue` — main processing queue
- `dev-tickets-dlq` — dead-letter queue

Verify queues exist:

```sh
aws --profile localstack sqs list-queues
```

### 3. Environment

```sh
cp .env.example .env
```

The defaults in `.env.example` match the Docker Compose setup. Nothing to change unless your ports differ.

---

## Running Tests

### All tests

```sh
npm test
```

Runs `vitest run` — executes both unit and integration suites once and exits.

### Watch mode (re-runs on file save)

```sh
npx vitest
```

### Single file

```sh
npx vitest run tests/unit/queue.schema.test.ts
npx vitest run tests/integration/tickets.test.ts
npx vitest run tests/integration/triage.test.ts
```

### With verbose output

```sh
npx vitest run --reporter=verbose
```

---

## Epic 1 — Foundation & Infrastructure

### What is tested

| Area | How |
|---|---|
| DB migration up | `npm run db:migrate` — applies `0000_pale_sprite.sql` then `0001_nice_stick.sql` |
| DB schema | integration tests read/write `tickets`, `job_tasks`, `api_keys`, `resolution_drafts` tables |
| DB migration down | `npm run db:rollback` — runs `0000_pale_sprite.down.ts` (drops all tables) |
| SQS queue creation | `beforeAll` in `tickets.test.ts` calls `CreateQueueCommand` against LocalStack |
| SQS message send | `submitTicket` in service layer sends a message; integration test passes if no error thrown |
| Queue message schema (Zod) | `tests/unit/queue.schema.test.ts` |
| Env validation (`config.ts`) | throws on boot if any required variable is missing |
| API key seed | `npm run seed` inserts `SEED_API_KEY` into `api_keys` |

### Unit test — `tests/unit/queue.schema.test.ts`

Tests `sqsMessageSchema` in isolation — no infrastructure needed.

```sh
npx vitest run tests/unit/queue.schema.test.ts
```

Covers:
- valid triage message accepted
- valid resolution message accepted
- invalid UUID rejected
- unknown phase rejected
- negative `retry_count` rejected
- empty object rejected

### Manual — migration up/down round-trip

```sh
npm run db:migrate    # apply
npm run db:rollback   # roll back
npm run db:migrate    # re-apply to restore
```

### Manual — verify SQS queues (LocalStack)

```sh
# list all queues
aws --profile localstack sqs list-queues

# peek at a message after a test run
aws --profile localstack sqs receive-message \
  --queue-url http://localhost:4566/000000000000/dev-tickets-queue
```

---

## Epic 2 — Ticket Ingestion API

### What is tested

| Area | How |
|---|---|
| `POST /tickets` happy path | integration test — 201, ticket in DB, job_task created, SQS enqueued |
| Missing API key | integration test — 401 |
| Invalid API key | integration test — 401 |
| Missing required fields | integration test — 400 + `issues` array |
| Invalid enum value (`channel`) | integration test — 400 |

### Integration test — `tests/integration/tickets.test.ts`

Requires Docker postgres + LocalStack running.

```sh
npx vitest run tests/integration/tickets.test.ts
```

`beforeAll` creates the SQS queue and inserts a test API key into the DB.  
`afterAll` cleans up the API key row.  
Each passing test cleans up its own ticket row.

### Manual — curl against dev server

Start the server:

```sh
npm run dev
```

Happy path:

```sh
curl -s -X POST http://localhost:3000/tickets \
  -H "Content-Type: application/json" \
  -H "x-api-key: local-dev-api-key" \
  -d '{
    "title": "Login button broken",
    "description": "The login button does not respond on mobile.",
    "customer_id": "customer-001",
    "channel": "web"
  }' | jq
```

Expected response:

```json
{
  "ticket_id": "<uuid>",
  "status": "queued"
}
```

Missing API key (expect 401):

```sh
curl -s -X POST http://localhost:3000/tickets \
  -H "Content-Type: application/json" \
  -d '{"title":"Test","description":"Test","customer_id":"c1","channel":"email"}' | jq
```

Invalid payload (expect 400 + issues):

```sh
curl -s -X POST http://localhost:3000/tickets \
  -H "Content-Type: application/json" \
  -H "x-api-key: local-dev-api-key" \
  -d '{"title":"Only title"}' | jq
```

---

## Epic 3 — Triage Pipeline

### What is tested

| Area | How |
|---|---|
| Happy path — AI success | integration test — `triage_output` written, job_task completed, resolution message enqueued |
| Phase guard | integration test — skips processing if job_task already completed |
| Failure retry < 3 | integration test — job_task set to failed, message re-enqueued with delay |
| Retry exhausted | integration test — ticket set to `needs_manual_review`, no re-enqueue |

### Integration test — `tests/integration/triage.test.ts`

Requires Docker postgres + LocalStack running. Uses a stub AI function — no Bedrock calls made.

```sh
npx vitest run tests/integration/triage.test.ts
```

`beforeAll` creates the SQS queue and purges it.  
Each test inserts its own ticket + job_task row and cleans up afterwards.

---

## Epic 4 — Resolution Pipeline

### What is tested

| Area | How |
|---|---|
| Happy path — AI success | integration test — `resolution_drafts` row inserted (version=1), `tickets.resolution_output` cached, job_task completed, ticket status `completed` |
| Draft versioning | `resolution_drafts` unique constraint on `(ticket_id, version)`; version increments from MAX+1 per ticket |
| Phase guard | integration test — skips processing if job_task already completed |
| Failure retry < 3 | integration test — job_task set to failed, message re-enqueued with exponential delay |
| Retry exhausted (≥3) | integration test — ticket set to `needs_manual_review`, no re-enqueue |
| Resolution output schema (Zod) | `tests/unit/resolution.schema.test.ts` — validates all fields including `internal_note` |
| Handler logic | `tests/unit/resolution.handler.test.ts` — mocked repo and AI, verifies `insertResolutionDraft` called with correct args |
| Processing time | `processingTimeMs` stored on each `resolution_drafts` row; integration test asserts `>= 0` |
| Model version | `modelVersion` stored from `BEDROCK_MODEL_ID` config; integration test asserts truthy |

### Unit tests

```sh
npx vitest run tests/unit/resolution.schema.test.ts
npx vitest run tests/unit/resolution.handler.test.ts
```

No infrastructure required.

### Integration test — `tests/integration/resolution.test.ts`

Requires Docker postgres + LocalStack running. Uses a stub AI function — no Bedrock calls made.

```sh
npx vitest run tests/integration/resolution.test.ts
```

`beforeAll` creates the SQS queue and purges it.  
Each test inserts its own ticket + triage output + job_task row and cleans up afterwards (cascade delete removes `resolution_drafts` rows automatically).

---

## Epic 5 — Real-time Notifications (MVP)

### What is tested

| Area | How |
|---|---|
| RoomManager — emit to all room clients | `tests/unit/room-manager.test.ts` |
| RoomManager — only correct room receives | unit test — wrong room clients receive nothing |
| RoomManager — leave removes client | unit test — send not called after leave |
| RoomManager — disconnect via reverse map | unit test — disconnect uses client→room lookup |
| RoomManager — close calls ws.close on all | unit test — all clients in room receive close |
| RoomManager — size tracking | unit test — correct count through join/leave cycle |
| `ticket_started` emitted in triage handler | `tests/unit/triage.handler.test.ts` — happy path asserts `roomManager.emit` with `type: 'ticket_started'` |
| `ticket_failed` + close in triage handler | unit test — retry_count=2 asserts `ticket_failed` emit and `roomManager.close` |
| `ticket_started` emitted in resolution handler | `tests/unit/resolution.handler.test.ts` — happy path asserts `ticket_started` |
| `ticket_success` + close in resolution handler | unit test — happy path asserts `ticket_success` emit and `roomManager.close` |
| `ticket_failed` + close on resolution exhaustion | unit test — retry_count=2 asserts `ticket_failed` emit and `roomManager.close` |
| Integration — triage `ticket_started` delivered | `tests/integration/triage.test.ts` — real mock socket joins room, asserts `send` called with `ticket_started` JSON |
| Integration — triage `ticket_failed` + close | integration test — retry exhaustion test asserts `ticket_failed` and `ws.close` |
| Integration — resolution `ticket_started` + `ticket_success` + close | `tests/integration/resolution.test.ts` — mock socket asserts all three |
| Integration — resolution `ticket_failed` + close | integration test — retry exhaustion |

**Not in MVP (deferred):** Phase Progress and Phase Complete events (S-04, S-05).

### Unit tests

```sh
npx vitest run tests/unit/room-manager.test.ts
npx vitest run tests/unit/triage.handler.test.ts
npx vitest run tests/unit/resolution.handler.test.ts
```

No infrastructure required.

### Integration tests

```sh
npx vitest run tests/integration/triage.test.ts
npx vitest run tests/integration/resolution.test.ts
```

Requires Docker postgres + LocalStack running. Each test that checks real-time events creates a mock `{ send: vi.fn(), close: vi.fn() }` socket, joins the roomManager before calling the handler, and asserts the correct JSON strings were sent.

### Manual — WebSocket connection

Start the server:

```sh
npm run dev
```

Connect and join a ticket room (replace `<ticket_id>` with a real UUID from a submitted ticket):

```sh
# Using wscat (npm install -g wscat)
wscat -c ws://localhost:3000/ws
# then send:
{"type":"join","ticket_id":"<ticket_id>"}
```

After joining, events will arrive as JSON when the pipeline processes that ticket.

---

## Epic 6 — Failure Handling & Observability

### What is tested

| Area | How |
|---|---|
| Static triage fallback — schema valid | `tests/unit/triage.fallback.test.ts` — `TRIAGE_FALLBACK` satisfies `triageOutputSchema` |
| Static triage fallback — confidence=0, tags=[] | unit test — shape assertions |
| Static resolution fallback — schema valid | `tests/unit/resolution.fallback.test.ts` — `RESOLUTION_FALLBACK` satisfies `resolutionOutputSchema` |
| Static resolution fallback — confidence=0, requires_escalation=true | unit test — shape assertions |
| Triage exhaustion — fallback written to DB | `tests/integration/triage.test.ts` — `tickets.triage_output` matches `{ category:'general', priority:'medium', confidence:0 }` |
| Resolution exhaustion — fallback written to DB | `tests/integration/resolution.test.ts` — `resolution_drafts` row with `{ requires_escalation:true, confidence:0 }` |
| DLQ send on triage exhaustion | integration test — message received from `dev-tickets-dlq` with `{ ticket_id, phase:'triage', reason }` + `failed_at` |
| DLQ send on resolution exhaustion | integration test — same pattern for `phase:'resolution'` |
| DLQ payload enrichment | `tests/unit/triage.handler.test.ts` + `resolution.handler.test.ts` — asserts `retry_count`, `reason`, `failed_at` all present |
| No re-enqueue on exhaustion | integration tests — main queue asserts 0 messages after retry_count=2 |
| Structured logging — no `console.*` calls | logger mock in all handler unit tests (`logger.info`, `logger.warn`, `logger.error`, `logger.child`) |
| Health check — 200 ok | manual — `GET /health` returns `{ status:'ok', uptime, timestamp, checks:{ db:'ok', sqs:'ok' } }` |
| Health check — 503 degraded | manual — stop LocalStack; `checks.sqs` becomes `'error'`, response is 503 |

**Not in MVP (deferred):** PII redaction (O-08), manual replay (O-14–O-17).

### Unit tests

```sh
npx vitest run tests/unit/triage.fallback.test.ts
npx vitest run tests/unit/resolution.fallback.test.ts
npx vitest run tests/unit/triage.handler.test.ts
npx vitest run tests/unit/resolution.handler.test.ts
```

No infrastructure required. The handler tests mock the repository, SQS client, config, roomManager, and logger — DLQ behaviour is verified by inspecting `mockSend.mock.calls`.

### Integration tests

```sh
npx vitest run tests/integration/triage.test.ts
npx vitest run tests/integration/resolution.test.ts
```

Requires Docker postgres + LocalStack running. `beforeAll` creates both `dev-tickets-queue` and `dev-tickets-dlq` via `CreateQueueCommand` (LocalStack init scripts are not volume-mounted, so queues are created per test run).

Exhaustion tests (`retry_count=2`) assert:
1. Ticket status set to `needs_manual_review`
2. Main queue has 0 messages
3. DLQ contains an enriched failure record
4. Fallback content written to the database

### Manual — health check

Start the server:

```sh
npm run dev
```

```sh
curl -s http://localhost:3000/health | jq
```

Expected when both services are healthy:

```json
{
  "status": "ok",
  "uptime": 12.3,
  "timestamp": "2026-04-27T00:00:00.000Z",
  "checks": {
    "db": "ok",
    "sqs": "ok"
  }
}
```

To test the degraded path, stop LocalStack (`docker compose --profile localstack down`) and repeat the request — `checks.sqs` will be `"error"` and the response status will be `503`.

### Manual — observe structured logs

Start the server in dev mode — pino-pretty formats logs with colour and human-readable timestamps:

```sh
npm run dev
```

Submit a ticket and watch the terminal for structured log lines showing `phase`, `ticket_id`, and processing outcomes at each pipeline stage.

In production (`NODE_ENV=production`) pino emits newline-delimited JSON suitable for log aggregation pipelines.

---

## Full Reset

If you need a clean slate:

```sh
npm run db:rollback                                      # drop schema
npm run db:migrate                                       # recreate schema
npm run seed                                             # re-seed API key
docker compose --profile localstack down && docker compose --profile localstack up -d   # reset LocalStack queues
```
