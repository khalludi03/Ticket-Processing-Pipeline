# Ticket Pipeline API — cURL Commands

Use these commands to manually test the API. Ensure the server is running (`npm run dev`) and you have the correct API key (default: `local-dev-api-key`).

## 1. Health Check
Verify the status of the database and SQS connections.

```bash
curl -s http://localhost:3000/health | jq
```

## 2. Ingest Ticket
Submit a new ticket to the pipeline.

### Happy Path
```bash
curl -s -X POST http://localhost:3000/tickets \
  -H "Content-Type: application/json" \
  -H "x-api-key: local-dev-api-key" \
  -d '{
    "title": "Login button broken",
    "description": "The login button does not respond on mobile.",
    "customer_id": "customer-001",
    "channel": "web",
    "priority_hint": "high",
    "tags": ["mobile", "frontend"]
  }' | jq
```

### Validation Error (Missing Fields)
```bash
curl -s -X POST http://localhost:3000/tickets \
  -H "Content-Type: application/json" \
  -H "x-api-key: local-dev-api-key" \
  -d '{"title": "Missing fields"}' | jq
```

## 3. Get Ticket Status
Check the current status, job tasks, and replay attempts of a ticket. Replace `<id>` with the `ticket_id` from the ingestion response.

```bash
curl -s http://localhost:3000/tickets/<id> \
  -H "x-api-key: local-dev-api-key" | jq
```

## 4. Get Ticket Result
Retrieve the final AI-generated triage and resolution output. Returns `409` if processing is incomplete.

```bash
curl -s http://localhost:3000/tickets/<id>/result \
  -H "x-api-key: local-dev-api-key" | jq
```

## 5. Replay Ticket
Trigger a retry for a ticket that has entered the `needs_manual_review` state after exhausting retries.

### Find Tickets in Manual Review
```bash
# Check for tickets ready to replay
docker exec demos-db-1 psql -U postgres -d ticket_pipeline -c \
  "SELECT id, status, error_log FROM tickets WHERE status = 'needs_manual_review';"
```

### Force a Ticket into Manual Review (For Testing)
If no tickets are in `needs_manual_review`, you can simulate the state:

```bash
# 1. Get an existing ticket ID
docker exec demos-db-1 psql -U postgres -d ticket_pipeline -c "SELECT id FROM tickets LIMIT 1;"

# 2. Update status (replace <TICKET_ID>)
docker exec demos-db-1 psql -U postgres -d ticket_pipeline -c \
  "UPDATE tickets SET status = 'needs_manual_review', error_log = 'Test failure for replay' WHERE id = '<TICKET_ID>';"
```

### Trigger Replay
```bash
curl -s -X POST http://localhost:3000/tickets/<id>/replay \
  -H "x-api-key: local-dev-api-key" | jq
```

### Check Replay Result
```bash
# Check replay attempts status
docker exec demos-db-1 psql -U postgres -d ticket_pipeline -c \
  "SELECT id, phase, status, result, error, created_at FROM replay_attempts WHERE ticket_id = '<TICKET_ID>' ORDER BY created_at;"

# Check updated ticket status
curl -s http://localhost:3000/tickets/<id> \
  -H "x-api-key: local-dev-api-key" | jq
```

## 6. Manual Reply (Manual Review)
Submit a manual reply for a ticket in `needs_manual_review` status. Requires `x-user-id` header.

```bash
curl -s -X POST http://localhost:3000/tickets/<id>/reply \
  -H "Content-Type: application/json" \
  -H "x-api-key: local-dev-api-key" \
  -H "x-user-id: agent123" \
  -d '{
    "reply": "Thank you for contacting us. We have resolved your issue by clearing your browser cache. Please try logging in again.",
    "internal_note": "Resolved by clearing browser cache"
  }' | jq
```

Verify the reply was saved:
```bash
curl -s http://localhost:3000/tickets/<id>/result \
  -H "x-api-key: local-dev-api-key" | jq
```

## 7. Authentication Error
Test access without a valid API key.

```bash
curl -s -X POST http://localhost:3000/tickets \
  -H "Content-Type: application/json" \
  -d '{"title": "No Auth"}' | jq
```

## 8. WebSocket Connection
Subscribe to real-time ticket updates. Replace `<id>` with a ticket ID.

```bash
# Using wscat (install: npm install -g wscat)
wscat -c "ws://localhost:3000/ws"

# After connecting, send join message:
# {"type":"join","ticket_id":"<id>"}
```

## 9. Database Commands
Direct PostgreSQL access to the database.

```bash
# Connect to the database
docker exec -it ticket-pipeline-db psql -U postgres -d ticket_pipeline

# List all tickets
docker exec ticket-pipeline-db psql -U postgres -d ticket_pipeline -c "SELECT id, status, created_at FROM tickets ORDER BY created_at DESC;"

# List all tables
docker exec ticket-pipeline-db psql -U postgres -d ticket_pipeline -c "\dt"

# Check API keys with metadata (name, created_by, last_used_at, expires_at)
docker exec ticket-pipeline-db psql -U postgres -d ticket_pipeline -c "SELECT id, name, created_by, is_active, last_used_at, expires_at FROM api_keys;"

# Check job tasks with fallback tracking
docker exec ticket-pipeline-db psql -U postgres -d ticket_pipeline -c "SELECT phase, status, retry_count, fallback_used, fallback_reason FROM job_tasks WHERE ticket_id = '<id>';"

# Check pipeline events (audit trail)
docker exec ticket-pipeline-db psql -U postgres -d ticket_pipeline -c "SELECT event_type, phase, payload, created_at FROM pipeline_events WHERE ticket_id = '<id>' ORDER BY created_at;"

# Check replay attempts with status tracking
docker exec ticket-pipeline-db psql -U postgres -d ticket_pipeline -c "SELECT id, phase, status, result, error, created_at FROM replay_attempts WHERE ticket_id = '<id>' ORDER BY created_at;"

# Check webhooks
docker exec ticket-pipeline-db psql -U postgres -d ticket_pipeline -c "SELECT id, url, is_active, created_at FROM webhooks;"
```

## 10. Docker Commands
Manage the local development environment.

```bash
# Start all services (in background)
docker compose up -d

# View logs
docker compose logs -f

# Stop all services
docker compose down

# Restart LocalStack
docker compose restart localstack-1

# Restart database
docker compose restart ticket-pipeline-db

# Run migrations
npm run db:migrate

# Push schema changes
npm run db:push

# Open Drizzle Studio
npm run db:studio

# Seed database
npm run seed
```

## 11. Server Management
Restart the server after config changes.

```bash
# Kill existing server
pkill -f "node.*index.ts"

# Start server
node --watch --strip-types src/index.ts

# Or with npm
npm run dev
```

## 12. OpenRouter (AI)
Test and debug OpenRouter AI integration.

```bash
# Check if server is running (shows if config loads)
curl -s http://localhost:3000/health | jq

# Create a ticket to test AI processing
curl -s -X POST http://localhost:3000/tickets \
  -H "Content-Type: application/json" \
  -H "x-api-key: local-dev-api-key" \
  -d '{
    "title": "Cannot reset password",
    "description": "When I click forgot password, nothing happens. I have tried clearing cache.",
    "customer_id": "customer-002",
    "channel": "web"
  }' | jq

# Check ticket status (wait ~10-15s for AI processing)
curl -s http://localhost:3000/tickets/<id>/result \
  -H "x-api-key: local-dev-api-key" | jq

# Check for AI errors in database
docker exec ticket-pipeline-db psql -U postgres -d ticket_pipeline -c "SELECT id, status, error_log FROM tickets ORDER BY created_at DESC LIMIT 5;"
```

## 13. Troubleshooting AI Issues
Common errors and fixes.

```bash
# Error: 401 Missing Authentication header
# → Check OPENROUTER_API_KEY in .env

# Error: fallback: true in result
# → Check docker logs: docker compose logs -f
# → Check error_log in database

# Restart server after .env changes
pkill -f "node.*index.ts" && node --watch --strip-types src/index.ts
```

## 14. Retry Count & Fallback Tracking
Check how many times a ticket has been retried per phase and whether fallback was used.

```bash
# Via API response (includes jobTasks with retryCount, fallbackUsed, fallbackReason)
curl -s http://localhost:3000/tickets/<id> \
  -H "x-api-key: local-dev-api-key" | jq '.jobTasks[] | {phase, status, retryCount, fallbackUsed, fallbackReason}'

# Direct database query
docker exec ticket-pipeline-db psql -U postgres -d ticket_pipeline -c \
  "SELECT phase, status, retry_count, fallback_used, fallback_reason FROM job_tasks WHERE ticket_id = '<id>';"
```

## 15. Audit Trail (Pipeline Events)
View the chronological event history for a ticket.

```bash
# Query all events for a ticket
docker exec ticket-pipeline-db psql -U postgres -d ticket_pipeline -c \
  "SELECT event_type, phase, payload, created_at FROM pipeline_events WHERE ticket_id = '<id>' ORDER BY created_at;"

# Query specific event types
docker exec ticket-pipeline-db psql -U postgres -d ticket_pipeline -c \
  "SELECT event_type, phase, payload, created_at FROM pipeline_events WHERE ticket_id = '<id>' AND event_type = 'fallback_triggered' ORDER BY created_at;"
```

## 16. Replay Status Tracking
Check the status and results of replay attempts.

```bash
# Query replay attempts with status
docker exec ticket-pipeline-db psql -U postgres -d ticket_pipeline -c \
  "SELECT id, phase, status, result, error, created_at, updated_at FROM replay_attempts WHERE ticket_id = '<id>' ORDER BY created_at;"
```
