# AI-Powered Support Ticket Processing Pipeline

# Product Requirements Document (PRD)

**Version:** 1.0
**Status:** Draft
**Method:** Kanban
**Language:** English

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Product Vision & Goals](#3-product-vision--goals)
4. [Story Point Reference](#4-story-point-reference)
5. [Epic Overview](#5-epic-overview)
6. [Kanban Board Structure](#6-kanban-board-structure)
7. [Global Definition of Done](#7-global-definition-of-done)
8. [Epic 1: Foundation & Infrastructure](#8-epic-1-foundation--infrastructure)
   - [Epic 1 MVP](#epic-1-mvp)
9. [Epic 2: Ticket Ingestion API](#9-epic-2-ticket-ingestion-api)
   - [Epic 2 MVP](#epic-2-mvp)
10. [Epic 3: Phase 1 — Triage Pipeline](#10-epic-3-phase-1--triage-pipeline)
    - [Epic 3 MVP](#epic-3-mvp)
11. [Epic 4: Phase 2 — Resolution Pipeline](#11-epic-4-phase-2--resolution-pipeline)
    - [Epic 4 MVP](#epic-4-mvp)
12. [Epic 5: Real-time Notifications](#12-epic-5-real-time-notifications)
    - [Epic 5 MVP](#epic-5-mvp)
13. [Epic 6: Failure Handling & Observability](#13-epic-6-failure-handling--observability)
    - [Epic 6 MVP](#epic-6-mvp)
14. [Non-Functional Requirements](#14-non-functional-requirements)
15. [Rollout Strategy](#15-rollout-strategy)
16. [Success Metrics](#16-success-metrics)
17. [Risk Assessment](#17-risk-assessment)
18. [Glossary](#18-glossary)
19. [Architecture Decision Records](#19-architecture-decision-records)
---

## 1. Executive Summary

The AI-Powered Support Ticket Processing Pipeline is a backend service designed for a SaaS support platform. It automatically processes customer support tickets through a two-phase AI pipeline — first triaging each ticket with structured metadata, then generating a resolution draft for support teams.

The system is engineered for production-like behavior: asynchronous queue-based processing, persistent state tracking in a relational database, real-time status delivery via a persistent connection, and structured observability through logging.

**One-Line Pitch:** "Automatically triage, classify, and draft responses for every customer ticket — at scale, in real time, with full observability."

---

## 2. Problem Statement

### Today's Reality

Support agents spend roughly 30–40% of their time on mechanical tasks before they can begin resolving a ticket:

- Reading and re-reading tickets to understand the issue
- Manually categorising tickets with no consistent criteria
- Assigning priority based on gut feel rather than structured signals
- Drafting replies from scratch every time, even for common issues
- Routing tickets to the wrong team on the first pass

### The Cost

| Problem | Business Impact |
| --- | --- |
| Slow triage | Customers wait longer than necessary |
| Inconsistent categorisation | Two agents classify the same ticket differently |
| Agent fatigue | Repetitive tasks reduce quality of complex work |
| Misrouting | Wrong team assignment wastes time for agents and customers |

### The Opportunity

AI can handle all of this mechanical work instantly and consistently — freeing agents to focus entirely on solving problems and building customer relationships. Every ticket arrives at the agent's desk pre-analysed, pre-prioritised, and with a draft response ready to review.

---

## 3. Product Vision & Goals

**Vision:** Deliver a production-ready backend pipeline that enables SaaS support platforms to process customer tickets faster, more consistently, and with full auditability — using AI at every stage of the workflow.

**Primary Goals:**

- Enable ticket submission via API authentication
- Process tickets asynchronously through a two-phase AI pipeline
- Guarantee phase-level retry without repeating successful phases
- Deliver real-time ticket status updates via a persistent connection
- Persist full ticket and job state in a relational database
- Implement graceful degradation with a static fallback on AI failure
- Provide structured, queryable logs for every pipeline event

**Target Users:**

| Role | Description |
| --- | --- |
| External Customer | Submits support tickets via the platform |
| Support Agent | Receives AI-generated triage metadata and resolution drafts |
| Platform Engineer | Monitors pipeline health via structured logs and task state |

---

## 4. Story Point Reference

| Points | Complexity | Typical Effort |
| --- | --- | --- |
| 1 | Trivial | < 2 hours |
| 2 | Simple | 2–4 hours |
| 3 | Moderate | 4–8 hours |
| 5 | Complex | 1–2 days |
| 8 | Very Complex | 2–3 days |
| 13 | Large | 3–5 days |

---

## 5. Epic Overview

| Epic | Title | Total Points | MVP Points |
| --- | --- | --- |
| E1 | Foundation & Infrastructure | 34 | 18 |
| E2 | Ticket Ingestion API | 31 | 19 |
| E3 | Phase 1 — Triage Pipeline | 42 | 31 |
| E4 | Phase 2 — Resolution Pipeline | 38 | 30 |
| E5 | Real-time Notifications | 28 | 16 |
| E6 | Failure Handling & Observability | 50 | 28 |
| **Total** | | **223** | **142** |

---

## 6. Kanban Board Structure

```
┌──────────┬──────────────┬─────────────┬─────────┬───────────┬──────┐
│ Backlog │ Prestage │ In Progress │ In Review │ Complete │
│ WIP: ∞ │ WIP: 2 │ WIP: 3 │ WIP:∞ │ WIP: 2 │ ∞ │
└──────────┴──────────────┴─────────────┴─────────┴───────────┴──────┘
```

| Column | Definition |
| --- | --- |
| Backlog | Task defined, not yet started |
| Prestage | Task being refined, dependencies checked, and ready to pull into active work |
| In Progress | Active development underway |
| In Review | Pull request open, awaiting code review |
| Complete | All Definition of Done criteria satisfied |

**WIP Limit Policy:** If In Progress reaches 3 tasks, no new task may be pulled until one moves to In Review. Prestage acts as a preparation buffer — tasks must be fully scoped before moving to In Progress.

---

## 7. Global Definition of Done

Every task across all epics must satisfy **all 5 criteria** before moving to Complete:

- [ ] Code written and committed to the correct branch
- [ ] Unit tests written and all passing
- [ ] Integration tests written and all passing
- [ ] Pull request opened, reviewed, and approved by at least one reviewer
- [ ] All Acceptance Criteria for the task confirmed and checked off

---

## 8. Epic 1: Foundation & Infrastructure

**Total Points: 34**

> **Goal:** Provision the foundational infrastructure — database schema, message queue setup, API key authentication, and environment configuration — so all subsequent epics have a stable, tested base to build upon.

---

### Feature 1.1: Database Schema

**Description:** Define and migrate the core database schema for ticket state persistence and job tracking.

---

**US-1.1:** As a platform engineer, I want a tickets table so that submitted ticket data is persistently stored with full metadata.

**Acceptance Criteria:**
- Tickets table exists with all required fields for ticket data and status tracking
- Ticket status supports all lifecycle states: queued, processing, completed, failed, and needs manual review
- Database migration runs cleanly on a fresh instance
- Rollback migration is defined

---

**US-1.2:** As a platform engineer, I want a job tasks table so that per-phase processing state is tracked independently from the ticket.

**Acceptance Criteria:**
- Job tasks table exists with fields to track which phase is being processed, its current status, retry count, and any error details
- One row per phase per ticket (maximum two rows per ticket)
- Relationship between job tasks and tickets is enforced at the database level
- Migration runs cleanly; rollback is defined

---

**US-1.3:** As a platform engineer, I want API key authentication configured so that only authorised clients can submit tickets.

**Acceptance Criteria:**
- An API key configuration exists with fields for the key value and active status
- API key is validated on each request
- Invalid API keys are rejected
- A seed script creates a test API key for local development

---

### Feature 1.2: Message Queue Setup

**Description:** Provision the processing queue and Dead Letter Queue for local development.

---

**US-1.4:** As a platform engineer, I want a main processing queue provisioned so that ticket processing messages can be enqueued and consumed.

**Acceptance Criteria:**
- Main queue is provisioned and accessible on startup
- Message payload includes ticket ID, current phase, and retry count
- Message send and receive verified via integration test

---

**US-1.5:** As a platform engineer, I want a Dead Letter Queue linked to the main queue so that permanently failed messages are captured and not lost.

**Acceptance Criteria:**
- Dead Letter Queue is provisioned and linked to the main queue
- Messages that exceed the maximum retry count are automatically routed to the Dead Letter Queue
- Integration test confirms the Dead Letter Queue receives a message after maximum failures are reached

---

**US-1.6:** As a platform engineer, I want environment configuration validated on server boot so that missing variables are caught before the service starts.

**Acceptance Criteria:**
- All required environment variables are documented in an example configuration file
- Server throws a descriptive error on boot if any required variable is missing
- No real secrets are committed to the repository

---

### Epic 1: Definition of Done

- [ ] Code written and committed
- [ ] Unit tests passing for database schema integrity and environment validation
- [ ] Integration tests passing: migrations run on a clean database instance; queue send and receive verified
- [ ] Pull request reviewed and approved
- [ ] All Acceptance Criteria above confirmed

### Epic 1: Checklist

```
Infrastructure Setup
 ├── [ ] Database is running locally
 ├── [ ] Tickets table created with correct fields
 ├── [ ] Job tasks table created with relationship to tickets
 ├── [ ] API key authentication configured
 ├── [ ] Seed script creates a test API key
 ├── [ ] Migrations run cleanly on a fresh instance
 ├── [ ] Rollback migrations defined
 ├── [ ] Queue service running and healthy
 ├── [ ] Main processing queue provisioned
 ├── [ ] Dead Letter Queue provisioned and linked
 ├── [ ] Queue message payload schema defined
 ├── [ ] Example environment config file committed
 └── [ ] Server boot validation for missing environment variables
```

### Epic 1: Subtasks (Kanban Cards)

| ID | Subtask | Points
| --- | --- | --- |
| F-01 | Create tickets table migration | 3 |
| F-02 | Create job tasks table migration | 3 |
| F-03 | Configure API key authentication | 2 |
| F-04 | Write rollback migrations for all tables | 2 |
| F-05 | Write seed script for test API key | 1 |
| F-06 | Provision main processing queue | 2 |
| F-07 | Provision Dead Letter Queue and link to main queue | 2 |
| F-08 | Define and validate queue message payload schema | 2 |
| F-09 | Implement environment config validation on boot | 2 |
| F-10 | Write integration tests for database migrations | 3 |
| F-11 | Write integration tests for queue send and receive | 3 |
| F-12 | Commit example environment config file | 1 |

---

### Epic 1 (MVP)

> **MVP Scope:** The minimum infrastructure needed to accept a ticket, store it, and send it to the processing queue. Multi-request authentication and environment safety are included from day one to avoid costly retrofits.

**Must-Have User Stories:**

| Story | Description |
| --- | --- |
| US-1.1 | Tickets table with all required fields and lifecycle statuses |
| US-1.2 | Job tasks table to track per-phase processing state |
| US-1.3 | API key authentication for authorised access only |
| US-1.4 | Main processing queue provisioned and operational |
| US-1.5 | Dead Letter Queue linked to the main queue |
| US-1.6 | Environment configuration validated on server boot |

**Not in MVP:** Advanced queue monitoring, multi-region setup, performance tuning.

**MVP Subtasks (Kanban Cards):**

| ID | Subtask | Points
| --- | --- | --- |
| F-01 | Create tickets table migration | 3 |
| F-02 | Create job tasks table migration | 3 |
| F-03 | Configure API key authentication | 2 |
| F-04 | Write rollback migrations for all tables | 2 |
| F-05 | Write seed script for test API key | 1 |
| F-06 | Provision main processing queue | 2 |
| F-07 | Provision Dead Letter Queue and link to main queue | 2 |
| F-09 | Implement environment config validation on boot | 2 |
| F-12 | Commit example environment config file | 1 |

**Deferred to Post-MVP:** Queue message payload schema unit tests (F-08), full integration test suite (F-10, F-11).

---

## 9. Epic 2: Ticket Ingestion API

**Total Points: 31**

> **Goal:** Build the public-facing API endpoint that accepts ticket submissions from external customers, validates the request, validates the API key, persists the ticket, enqueues the job, and returns an immediate acknowledgement response.

---

### Feature 2.1: Ticket Submission Endpoint

**Description:** The primary API endpoint for external customers to submit support tickets.

---

**US-2.1:** As an external customer, I want to submit a support ticket via API so that my issue is captured and processed automatically.

**Acceptance Criteria:**
- A ticket submission endpoint exists and is publicly accessible
- Request must include an API key header for authentication
- Request body accepts: title (required), description (required), customer ID (required), channel (required), attachments (optional), tags (optional), and a priority hint (optional)
- On success: returns an acknowledgement response with a ticket ID and queued status
- On missing required fields: returns a validation error with field-level detail
- On invalid or missing API key: returns an unauthorized error
- On invalid or revoked API key: returns an unauthorized error

---

**US-2.2:** As a platform engineer, I want request body validation enforced so that malformed tickets never reach the database or queue.

**Acceptance Criteria:**
- Title and description must be non-empty strings within allowed character limits
- Channel must be one of the accepted values: email, chat, or web
- Priority hint, if provided, must be one of: low, medium, or high
- Attachments, if provided, must follow the expected structure
- Validation errors return a structured list of field names and messages
- Invalid requests are rejected before any database write occurs

---

**US-2.3:** As a platform engineer, I want the ticket and job rows inserted atomically so that partial writes never create orphaned records.

**Acceptance Criteria:**
- Ticket record and job task record are inserted within a single database transaction
- If either insert fails, the full transaction is rolled back
- Queue message is only sent after a successful transaction commit
- If queue enqueue fails after database commit, the ticket status is updated to failed and the error is logged
- Integration test covers the rollback scenario

---

### Feature 2.2: Ticket Status Endpoint

**Description:** Allows clients to check the current processing status of a submitted ticket.

---

**US-2.4:** As an external customer, I want to check the status of my submitted ticket so that I know whether it has been processed.

**Acceptance Criteria:**
- A ticket status endpoint exists and requires a valid API key
- Returns the ticket ID, current status, current phase, retry count, and timestamps
- Requests with an invalid API key return an unauthorized error
- A non-existent ticket ID returns a not found error

---

**US-2.5:** As a platform engineer, I want rate limiting applied to the submission endpoint so that the system is protected from abuse.

**Acceptance Criteria:**
- Rate limit of 100 requests per minute is enforced
- Requests exceeding the limit return a rate limit error with a retry delay indicator
- Rate limit counter resets every 60 seconds

---

### Epic 2: Definition of Done

- [ ] Code written and committed
- [ ] Unit tests passing for validation logic and authentication middleware
- [ ] Integration tests passing: full submission flow, atomic database transaction, queue enqueue
- [ ] Pull request reviewed and approved
- [ ] All Acceptance Criteria above confirmed

### Epic 2: Checklist

```
Ticket Ingestion API
 ├── [ ] Ticket submission endpoint implemented
 ├── [ ] API key authentication middleware implemented
 ├── [ ] API key validation
 ├── [ ] Request body validation (all fields)
 ├── [ ] Atomic database transaction (ticket + job task)
 ├── [ ] Queue enqueue after database commit
 ├── [ ] Acknowledgement response with ticket ID returned
 ├── [ ] Ticket status endpoint implemented
 ├── [ ] API key authentication enforced
 ├── [ ] Rate limiting enforced
 └── [ ] Rate limit error returned with retry delay indicator
```

### Epic 2: Subtasks (Kanban Cards)

| ID | Subtask | Points
| --- | --- | --- |
| T-01 | Implement API key authentication middleware | 3 |
| T-02 | Build ticket submission endpoint | 5 |
| T-03 | Implement request body validation | 2 |
| T-04 | Implement atomic database transaction for ticket and job task | 3 |
| T-05 | Implement queue enqueue after database commit | 3 |
| T-06 | Build ticket status endpoint | 2 |
| T-07 | Implement rate limiting middleware | 3 |
| T-08 | Unit tests: validation and authentication middleware | 3 |
| T-09 | Integration test: full submission and queue enqueue | 3 |
| T-10 | Integration test: atomic rollback scenario | 2 |
| T-11 | Integration test: rate limit enforcement | 2 |

---

### Epic 2 (MVP)

> **MVP Scope:** A working ticket submission endpoint that validates the API key and the request, saves the ticket and job task atomically, and enqueues the job. The status endpoint and rate limiting are deferred.

**Must-Have User Stories:**

| Story | Description |
| --- | --- |
| US-2.1 | Ticket submission endpoint with API key auth and immediate acknowledgement response |
| US-2.2 | Request body validation enforced before any database write |
| US-2.3 | Atomic database transaction for ticket and job task insertion |

**Not in MVP:** Ticket status endpoint (US-2.4), rate limiting (US-2.5).

**MVP Subtasks (Kanban Cards):**

| ID | Subtask | Points
| --- | --- | --- |
| T-01 | Implement API key authentication middleware | 3 |
| T-02 | Build ticket submission endpoint | 5 |
| T-03 | Implement request body validation | 2 |
| T-04 | Implement atomic database transaction for ticket and job task | 3 |
| T-05 | Implement queue enqueue after database commit | 3 |
| T-08 | Unit tests: validation and authentication middleware | 3 |
| T-09 | Integration test: full submission and queue enqueue | 3 |

**Deferred to Post-MVP:** Ticket status endpoint (T-06), rate limiting middleware (T-07), atomic rollback integration test (T-10), rate limit test (T-11).

---

## 10. Epic 3: Phase 1 — Triage Pipeline

**Total Points: 42**

> **Goal:** Implement the async worker that consumes queue messages for the triage phase, calls the AI service to classify the ticket, persists structured triage output to the database, and emits real-time socket events at each milestone.

---

### Feature 3.1: Async Worker — Triage Consumer

**Description:** The queue message consumer that drives Phase 1 ticket triage.

---

**US-3.1:** As a platform engineer, I want an async worker that continuously polls the queue so that triage jobs are processed as soon as they are enqueued.

**Acceptance Criteria:**
- Worker runs as a long-running process polling the queue
- Worker reads the phase field from the message to route to the correct handler
- On receiving a triage phase message, worker updates the job task status to processing
- Worker emits a ticket started socket event immediately on job pickup
- Worker deletes the queue message only after successful processing

---

**US-3.2:** As a support team, I want each ticket classified with structured triage metadata so that agents can quickly understand priority and routing without reading the full ticket.

**Acceptance Criteria:**
- LangSmith is used to execute the triage AI call: a prompt template is populated with the full ticket context (title, description, channel, tags, priority hint, and attachments), the LLM is called, the response is parsed into a structured output, and the full trace is logged in LangSmith for observability
- AI response is validated and must include all of the following:
 - Category
 - Priority level
 - Sentiment
 - Escalation flag (yes or no)
 - Routing target
 - Concise summary
 - Processing time
 - Model version used
- Validated triage result is stored in the database
- Job task status is updated to completed after a successful save

---

**US-3.3:** As a platform engineer, I want the triage phase to enqueue the resolution phase upon completion so that Phase 2 starts automatically without manual intervention.

**Acceptance Criteria:**
- After the triage result is saved, a new queue message for the resolution phase is sent
- Queue enqueue happens only after the database write is confirmed
- Ticket status is updated to reflect triage completion
- A phase complete socket event is emitted with the triage result summary

---

### Feature 3.2: Triage Result Validation

**Description:** The data contract and validation rules for Phase 1 AI output.

---

**US-3.4:** As a platform engineer, I want the triage output schema enforced so that malformed AI responses never corrupt the database.

**Acceptance Criteria:**
- AI response is validated against a defined schema before any database write
- If the AI response is missing required fields, the phase is treated as a failure and not saved
- A validation failure triggers the retry flow

---

**US-3.5:** As a platform engineer, I want processing time and model version stored with every triage result so that AI performance can be tracked across model upgrades.

**Acceptance Criteria:**
- Processing time is recorded as elapsed time from AI call start to response receipt
- Model version is stored as a string identifier
- Both fields are required and cannot be empty

---

### Epic 3: Definition of Done

- [ ] Code written and committed
- [ ] Unit tests passing for triage schema validation and message routing
- [ ] Integration tests passing: full triage flow from queue message to database save to resolution phase enqueue
- [ ] Pull request reviewed and approved
- [ ] All Acceptance Criteria above confirmed

### Epic 3: Checklist

```
Phase 1 — Triage Pipeline
 ├── [ ] Queue consumer implemented with long polling
 ├── [ ] Phase router implemented (triage vs resolution)
 ├── [ ] Job task status updated to processing on pickup
 ├── [ ] Ticket started socket event emitted
 ├── [ ] AI triage service call implemented
 ├── [ ] AI response schema validation (all required fields)
 ├── [ ] Triage result persisted to database
 ├── [ ] Job task and ticket status updated on completion
 ├── [ ] Resolution phase message enqueued
 ├── [ ] Phase complete socket event emitted
 ├── [ ] Processing time recorded
 ├── [ ] Model version recorded
 └── [ ] Queue message deleted only after successful processing
```

### Epic 3: Subtasks (Kanban Cards)

| ID | Subtask | Points
| --- | --- | --- |
| P1-01 | Implement queue consumer worker loop | 5 |
| P1-02 | Implement phase router (triage and resolution handlers) | 3 |
| P1-03 | Implement AI triage service call | 5 |
| P1-04 | Implement triage output schema validator | 3 |
| P1-05 | Persist triage result to database | 3 |
| P1-06 | Update job task and ticket status fields | 2 |
| P1-07 | Enqueue resolution phase message | 2 |
| P1-08 | Emit phase complete socket event with triage result | 2 |
| P1-09 | Unit tests: schema validation and phase routing | 3 |
| P1-10 | Integration test: full triage flow end-to-end | 5 |

---

### Epic 3 (MVP)

> **MVP Scope:** A working async worker that picks up triage phase messages, calls the AI service, validates the response, saves the result, and enqueues the resolution phase. Socket events are deferred.

**Must-Have User Stories:**

| Story | Description |
| --- | --- |
| US-3.1 | Async worker polls the queue and routes triage phase messages |
| US-3.2 | AI triage call with full ticket context and validated output |
| US-3.3 | Resolution phase enqueued automatically after triage completes |
| US-3.4 | Triage output schema enforced before database write |
| US-3.5 | Processing time and model version stored with every result |

**Not in MVP:** Socket event emissions (ticket started, phase complete) — deferred to Epic 5.

**MVP Subtasks (Kanban Cards):**

| ID | Subtask | Points
| --- | --- | --- |
| P1-01 | Implement queue consumer worker loop | 5 |
| P1-02 | Implement phase router (triage and resolution handlers) | 3 |
| P1-03 | Implement AI triage service call | 5 |
| P1-04 | Implement triage output schema validator | 3 |
| P1-05 | Persist triage result to database | 3 |
| P1-06 | Update job task and ticket status fields | 2 |
| P1-07 | Enqueue resolution phase message | 2 |
| P1-09 | Unit tests: schema validation and phase routing | 3 |
| P1-10 | Integration test: full triage flow end-to-end | 5 |

**Deferred to Post-MVP:** Socket event emissions (P1-08) — covered in Epic 5 MVP.

---

## 11. Epic 4: Phase 2 — Resolution Pipeline

**Total Points: 38**

> **Goal:** Implement the resolution phase worker that reads triage output, calls the AI service to generate a customer-facing response draft, internal support note, and recommended next actions — then persists results with versioning support.

---

### Feature 4.1: Async Worker — Resolution Consumer

**Description:** The queue message consumer that drives Phase 2 resolution draft generation.

---

**US-4.1:** As a platform engineer, I want the worker to consume resolution phase messages and generate a complete resolution draft using both the original ticket and Phase 1 triage output.

**Acceptance Criteria:**
- Worker reads resolution phase messages from the queue
- Worker fetches the original ticket fields and triage result from the database to use as context
- LangSmith is used to execute the resolution AI call: a prompt template is populated with the combined context (original ticket fields and triage result), the LLM is called, the response is parsed into a structured output, and the full trace is logged in LangSmith for observability
- AI response is validated and must include all of the following:
 - Customer-facing response draft
 - Internal support note
 - Recommended next actions (list)
 - Processing time
 - Model version used
- Job task status is updated to processing on job pickup

---

**US-4.2:** As a support agent, I want the resolution draft persisted with a version number so that future edits are tracked and the original AI output is never lost.

**Acceptance Criteria:**
- Resolution result is stored with a draft version number starting at 1
- If a new draft is generated for the same ticket (e.g. after a manual retry), the version number increments
- All draft versions are preserved and not overwritten
- Ticket status is updated to completed after a successful save
- Job task status is updated to completed

---

**US-4.3:** As a support agent, I want to retrieve the full processed ticket result via API so that I can review and act on AI outputs.

**Acceptance Criteria:**
- A ticket result endpoint exists and requires a valid API key
- Returns the ticket ID, status, full triage output, and full resolution output including draft version
- Returns a conflict error if processing is not yet complete
- Returns a not found error if the ticket does not exist
- Requests with an invalid API key return an unauthorized error

---

### Feature 4.2: Resolution Result Validation

---

**US-4.4:** As a platform engineer, I want the resolution output schema enforced so that invalid AI responses trigger retry rather than corrupting stored data.

**Acceptance Criteria:**
- AI resolution response is validated before any database write
- Recommended next actions must be a non-empty list
- Customer response draft must be a non-empty string
- If validation fails, the phase is treated as a failure and the retry flow is triggered

---

**US-4.5:** As a platform engineer, I want processing time and model version stored with every resolution result so that AI performance is observable per phase.

**Acceptance Criteria:**
- Processing time is recorded as elapsed time from AI call start to response receipt
- Model version is stored as a string identifier
- Both fields are required and cannot be empty

---

### Epic 4: Definition of Done

- [ ] Code written and committed
- [ ] Unit tests passing for resolution schema validation and draft version logic
- [ ] Integration tests passing: full resolution flow from queue message to database save with versioning
- [ ] Pull request reviewed and approved
- [ ] All Acceptance Criteria above confirmed

### Epic 4: Checklist

```
Phase 2 — Resolution Pipeline
 ├── [ ] Resolution phase queue consumer implemented
 ├── [ ] Ticket and triage context fetched from database
 ├── [ ] Combined context passed to AI resolution service
 ├── [ ] AI resolution service call implemented
 ├── [ ] Resolution output schema validation (all required fields)
 ├── [ ] Draft version increment logic implemented
 ├── [ ] All draft versions preserved (no overwrite)
 ├── [ ] Resolution result persisted to database
 ├── [ ] Job task and ticket status updated to completed
 ├── [ ] Ticket result endpoint implemented
 ├── [ ] API key authentication enforced on result endpoint
 ├── [ ] Processing time recorded
 └── [ ] Model version recorded
```

### Epic 4: Subtasks (Kanban Cards)

| ID | Subtask | Points
| --- | --- | --- |
| P2-01 | Implement resolution phase handler in worker | 5 |
| P2-02 | Fetch ticket and triage context from database | 2 |
| P2-03 | Implement AI resolution service call | 5 |
| P2-04 | Implement resolution output schema validator | 3 |
| P2-05 | Implement draft version increment logic | 3 |
| P2-06 | Persist resolution result to database | 3 |
| P2-07 | Update job task and ticket status | 1 |
| P2-08 | Build ticket result retrieval endpoint | 3 |
| P2-09 | Unit tests: schema validation and draft versioning | 3 |
| P2-10 | Integration test: full resolution flow end-to-end | 5 |

---

### Epic 4 (MVP)

> **MVP Scope:** A working resolution phase worker that fetches context, calls the AI service, validates output, and saves the result with draft versioning. The result retrieval endpoint is deferred.

**Must-Have User Stories:**

| Story | Description |
| --- | --- |
| US-4.1 | Worker consumes resolution phase messages and generates draft using triage context |
| US-4.2 | Resolution draft persisted with draft version number |
| US-4.4 | Resolution output schema enforced before database write |
| US-4.5 | Processing time and model version stored with every result |

**Not in MVP:** Ticket result retrieval endpoint (US-4.3) — deferred to post-MVP.

**MVP Subtasks (Kanban Cards):**

| ID | Subtask | Points
| --- | --- | --- |
| P2-01 | Implement resolution phase handler in worker | 5 |
| P2-02 | Fetch ticket and triage context from database | 2 |
| P2-03 | Implement AI resolution service call | 5 |
| P2-04 | Implement resolution output schema validator | 3 |
| P2-05 | Implement draft version increment logic | 3 |
| P2-06 | Persist resolution result to database | 3 |
| P2-07 | Update job task and ticket status | 1 |
| P2-09 | Unit tests: schema validation and draft versioning | 3 |
| P2-10 | Integration test: full resolution flow end-to-end | 5 |

**Deferred to Post-MVP:** Ticket result retrieval endpoint (P2-08).

---

## 12. Epic 5: Real-time Notifications

**Total Points: 28**

> **Goal:** Implement real-time status delivery using per-ticket communication rooms. Clients join a room upon ticket submission and receive 5 distinct lifecycle events as the pipeline progresses.

---

### Feature 5.1: real-time connection Server & Room Management

**Description:** real-time connection server setup and per-ticket room lifecycle management.

---

**US-5.1:** As an external customer, I want to receive real-time status updates on my ticket so that I know exactly where in the pipeline my ticket is without polling.

**Acceptance Criteria:**
- Real-time server runs alongside the main server
- Client connects and joins a room identified by the ticket ID
- Only clients in the correct room receive events for that ticket
- Room is cleaned up after the ticket reaches a final state (success or failure)

---

**US-5.2:** As a platform engineer, I want 5 distinct socket events emitted at each pipeline milestone so that client interfaces can display granular progress.

**Acceptance Criteria:**

| Event | Trigger | Key Payload Fields |
| --- | --- | --- |
| Ticket Started | Worker picks up job from queue | Ticket ID, current phase, timestamp |
| Phase Progress | AI call is initiated for a phase | Ticket ID, phase, step description, timestamp |
| Phase Complete | Phase result saved to database | Ticket ID, phase, result summary, timestamp |
| Ticket Success | Phase 2 completed successfully | Ticket ID, final status, timestamp |
| Ticket Failed | All retries exhausted, fallback applied | Ticket ID, failure reason, timestamp |

- All 5 events are emitted to the correct per-ticket room only
- All events include a timestamp

---

### Feature 5.2: Client Connection Resilience

---

**US-5.3:** As a platform engineer, I want the real-time server to handle client disconnection gracefully so that stale rooms do not accumulate.

**Acceptance Criteria:**
- On client disconnect, the server removes the client from all joined rooms
- If no clients remain in a ticket room, the room is cleaned up
- A reconnecting client can rejoin the same ticket room and receive subsequent events
- Server does not crash on unexpected client disconnection

---

### Epic 5: Definition of Done

- [ ] Code written and committed
- [ ] Unit tests passing for room join and leave logic and event payload structure
- [ ] Integration tests passing: full pipeline run with all 5 socket events verified in correct order
- [ ] Pull request reviewed and approved
- [ ] All Acceptance Criteria above confirmed

### Epic 5: Checklist

```
Real-time Notifications
 ├── [ ] Real-time server initialized alongside main server
 ├── [ ] Room join handler implemented (keyed by ticket ID)
 ├── [ ] Ticket Started event emitted on worker pickup
 ├── [ ] Phase Progress event emitted on AI call start
 ├── [ ] Phase Complete event emitted after database save
 ├── [ ] Ticket Success event emitted on pipeline completion
 ├── [ ] Ticket Failed event emitted on retry exhaustion
 ├── [ ] Events scoped to correct per-ticket room only
 ├── [ ] Timestamp included in all event payloads
 ├── [ ] Client disconnect handled gracefully
 ├── [ ] Room cleanup on disconnect
 └── [ ] Reconnecting client can rejoin the same room
```

### Epic 5: Subtasks (Kanban Cards)

| ID | Subtask | Points
| --- | --- | --- |
| S-01 | Initialize real-time server alongside main server | 2 |
| S-02 | Implement room join handler keyed by ticket ID | 3 |
| S-03 | Emit Ticket Started event in worker on job pickup | 2 |
| S-04 | Emit Phase Progress event on AI call start | 2 |
| S-05 | Emit Phase Complete event after database save | 2 |
| S-06 | Emit Ticket Success event on pipeline completion | 2 |
| S-07 | Emit Ticket Failed event on retry exhaustion | 2 |
| S-08 | Implement client disconnect and room cleanup | 2 |
| S-09 | Unit tests: room logic and event payload structure | 3 |
| S-10 | Integration test: all 5 events received in correct order | 5 |

---

### Epic 5 (MVP)

> **MVP Scope:** A working real-time connection server with per-ticket rooms and the two most critical events — Ticket Started and Ticket Failed. Intermediate progress events are deferred.

**Must-Have User Stories:**

| Story | Description |
| --- | --- |
| US-5.1 | real-time connection server with per-ticket room join on submission |
| US-5.2 | Ticket Started and Ticket Failed events emitted (minimum viable events) |
| US-5.3 | Client disconnection handled gracefully without server crash |

**Not in MVP:** Phase Progress and Phase Complete intermediate events — deferred to post-MVP polish.

**MVP Subtasks (Kanban Cards):**

| ID | Subtask | Points
| --- | --- | --- |
| S-01 | Initialize real-time server alongside main server | 2 |
| S-02 | Implement room join handler keyed by ticket ID | 3 |
| S-03 | Emit Ticket Started event in worker on job pickup | 2 |
| S-06 | Emit Ticket Success event on pipeline completion | 2 |
| S-07 | Emit Ticket Failed event on retry exhaustion | 2 |
| S-08 | Implement client disconnect and room cleanup | 2 |
| S-09 | Unit tests: room logic and event payload structure | 3 |

**Deferred to Post-MVP:** Phase Progress (S-04), Phase Complete (S-05) events, full 5-event integration test (S-10).

---

## 13. Epic 6: Failure Handling & Observability

**Total Points: 50**

> **Goal:** Implement production-grade failure handling — exponential backoff retry, Dead Letter Queue routing, static fallback on exhausted retries, and structured logging for every pipeline event including phase execution, retries, fallback decisions, and final outcomes.

---

### Feature 6.1: Retry Logic

**Description:** Phase-level retry with exponential backoff. Successful phases are never repeated.

---

**US-6.1:** As a platform engineer, I want failed AI calls to be retried up to 3 times with exponential backoff so that transient failures are recovered automatically.

**Acceptance Criteria:**
- On AI call failure, the retry count is incremented and the error is recorded on the job task
- Message is requeued with an increasing delay between each retry attempt
- After 3 failed retries, the message is not requeued manually — the Dead Letter Queue handles it automatically
- Only the failed phase is retried; the successful phase is never re-executed

---

**US-6.2:** As a platform engineer, I want permanently failed messages captured in the Dead Letter Queue so that no ticket is silently lost.

**Acceptance Criteria:**
- After 3 failed retries, the queue automatically routes the message to the Dead Letter Queue
- The Dead Letter Queue message retains the original payload for debugging
- Integration test confirms the message appears in the Dead Letter Queue after 3 failures

---

### Feature 6.2: Fallback Handling

**Description:** Graceful degradation when AI fails permanently after all retries.

---

**US-6.3:** As a platform engineer, I want a static fallback applied when all retries are exhausted so that the ticket is not abandoned and the support team can still act on it.

**Acceptance Criteria:**
- When retries are exhausted, a pre-defined static fallback is applied before routing to the Dead Letter Queue
- Static fallback for triage sets the ticket as uncategorized, medium priority, unknown sentiment, escalation required, and routed to general support with a note that manual review is needed
- Static fallback for resolution includes a generic customer acknowledgement message, an internal note for manual handling, and a default set of recommended next actions
- Ticket status is updated to needs manual review
- A Ticket Failed socket event is emitted with the failure reason

---

### Feature 6.3: Structured Observability

**Description:** Structured logging for every pipeline event with a consistent field schema.

---

**US-6.4:** As a platform engineer, I want every pipeline event logged with a consistent structured schema so that logs are queryable and traceable across the full ticket lifecycle.

**Acceptance Criteria:**
- A structured logger is used throughout the service with no unstructured console output in production code
- Log levels are used correctly: info for normal pipeline events, warn for retries and fallback decisions, error for unhandled exceptions and infrastructure failures
- The following pipeline events are logged at minimum:

| Pipeline Event | Log Level |
| --- | --- |
| Ticket submission received | Info |
| Worker picks up a job | Info |
| Phase 1 triage completed | Info |
| Phase 2 resolution completed | Info |
| Phase retry initiated | Warn |
| Message routed to Dead Letter Queue | Warn |
| Static fallback applied | Warn |
| Socket event emitted | Info |
| Rate limit breached | Warn |
| AI response schema validation failed | Error |

---

**US-6.5:** As a platform engineer, I want sensitive customer data redacted from logs so that personally identifiable information is not exposed in log output.

**Acceptance Criteria:**
- Customer ID is redacted from all log output
- Attachment URLs are redacted from all log output
- Redaction is applied globally — not manually per log call
- A unit test confirms that redacted fields do not appear in raw form in log output

---

**US-6.6:** As a platform engineer, I want a health check endpoint so that infrastructure monitoring tools can verify the service is running.

**Acceptance Criteria:**
- A health check endpoint exists and returns an ok status with uptime and timestamp when the service is healthy
- If the database connection fails, the endpoint returns a degraded status with the reason
- If the queue connection fails, the endpoint returns a degraded status with the reason
- The health check endpoint does not require API key authentication

---

---

### Feature 6.4: Manual Replay

**Description:** When a ticket lands in the Dead Letter Queue after exhausting all automatic retries, an operator can manually trigger one more processing attempt. Only the failed phase is retried — any phase that already completed successfully is never repeated.

---

**US-6.7:** As a platform operator, I want to manually replay a failed ticket so that permanently failed tickets can be recovered without reprocessing work that already succeeded.

**Acceptance Criteria:**
- A manual replay action is available for any ticket in the needs manual review status
- Replay re-enqueues only the failed phase — the successful phase is preserved and never re-executed
- Replay is rejected if the ticket is not in a failed or needs manual review state, returning a clear error
- Replay is rejected if the ticket is currently being processed, preventing duplicate work
- After a successful replay, ticket status returns to completed
- After a failed replay, ticket remains in needs manual review with the retry count incremented
- A full history of all replay attempts is visible on the ticket status endpoint

### Epic 6: Definition of Done

- [ ] Code written and committed
- [ ] Unit tests passing for retry counter logic, fallback content, and log redaction
- [ ] Integration tests passing: 3-retry flow with Dead Letter Queue routing; fallback applied with ticket status set to needs manual review
- [ ] Integration test passing: manual replay retries only the failed phase, preserves the successful phase
- [ ] Pull request reviewed and approved
- [ ] All Acceptance Criteria above confirmed

### Epic 6: Checklist

```
Failure Handling & Observability
 ├── [ ] Retry count increment on failure implemented
 ├── [ ] Exponential backoff delay between retries implemented
 ├── [ ] Phase-level retry guard (successful phase not repeated)
 ├── [ ] Dead Letter Queue routing via queue redrive policy
 ├── [ ] Static fallback content defined for triage phase
 ├── [ ] Static fallback content defined for resolution phase
 ├── [ ] Ticket status set to needs manual review on fallback
 ├── [ ] Ticket Failed socket event emitted on fallback
 ├── [ ] Structured logger configured (no console output in production)
 ├── [ ] All pipeline events logged with correct log levels
 ├── [ ] PII redaction applied globally
 ├── [ ] Unit test for PII redaction
 ├── [ ] Health check endpoint implemented
 └── [ ] Health check verifies database and queue connectivity
 ├── [ ] Manual replay endpoint implemented
 ├── [ ] Replay guard rejects non-failed tickets
 ├── [ ] Replay preserves completed phase (no re-execution)
 └── [ ] Full replay history visible on ticket status endpoint
```

### Epic 6: Subtasks (Kanban Cards)

| ID | Subtask | Points
| --- | --- | --- |
| O-01 | Implement retry count and error recording on job task | 3 |
| O-02 | Implement exponential backoff delay per retry attempt | 3 |
| O-03 | Implement phase-level retry guard | 3 |
| O-04 | Define static fallback content for triage and resolution | 2 |
| O-05 | Implement fallback application on retry exhaustion | 3 |
| O-06 | Update ticket status to needs manual review on fallback | 1 |
| O-07 | Configure structured logger with required field defaults | 3 |
| O-08 | Implement PII redaction globally in logger | 3 |
| O-09 | Implement all required pipeline log events | 5 |
| O-10 | Build health check endpoint | 2 |
| O-11 | Unit tests: retry logic, fallback, PII redaction | 3 |
| O-12 | Integration test: 3-retry flow and Dead Letter Queue routing | 5 |
| O-13 | Integration test: fallback applied, status is needs manual review | 3 |
| O-14 | Build manual replay endpoint | 3 |
| O-15 | Implement replay guard (reject non-failed and in-progress tickets) | 2 |
| O-16 | Implement phase checkpoint preservation on replay | 3 |
| O-17 | Integration test: replay retries only failed phase | 3 |

---

### Epic 6 (MVP)

> **MVP Scope:** Basic retry logic with exponential backoff and Dead Letter Queue routing. Static fallback on exhaustion. Structured logging for critical pipeline events. Health check endpoint. PII redaction and full observability deferred.

**Must-Have User Stories:**

| Story | Description |
| --- | --- |
| US-6.1 | Failed AI calls retried up to 3 times with exponential backoff |
| US-6.2 | Permanently failed messages captured in the Dead Letter Queue |
| US-6.3 | Static fallback applied on retry exhaustion with manual review flag |
| US-6.4 | Critical pipeline events logged with structured output |
| US-6.6 | Health check endpoint verifying database and queue connectivity |

**Not in MVP:** Full PII redaction (US-6.5) — deferred to post-MVP hardening.

**MVP Subtasks (Kanban Cards):**

| ID | Subtask | Points
| --- | --- | --- |
| O-01 | Implement retry count and error recording on job task | 3 |
| O-02 | Implement exponential backoff delay per retry attempt | 3 |
| O-03 | Implement phase-level retry guard | 3 |
| O-04 | Define static fallback content for triage and resolution | 2 |
| O-05 | Implement fallback application on retry exhaustion | 3 |
| O-06 | Update ticket status to needs manual review on fallback | 1 |
| O-07 | Configure structured logger with required field defaults | 3 |
| O-10 | Build health check endpoint | 2 |
| O-11 | Unit tests: retry logic and fallback | 3 |
| O-12 | Integration test: 3-retry flow and Dead Letter Queue routing | 5 |

**Deferred to Post-MVP:** PII redaction (O-08), full log event coverage (O-09), fallback status integration test (O-13).

---

## 14. Non-Functional Requirements

### 13.1 Performance

| Metric | Target |
| --- | --- |
| Ticket submission acknowledgement response time | Under 200ms at 99th percentile |
| Triage phase processing time | Under 10 seconds per ticket |
| Resolution phase processing time | Under 15 seconds per ticket |
| Queue message processing lag | Under 5 seconds from enqueue to worker pickup |
| Database read query time | Under 50ms at 99th percentile |

### 13.2 Reliability

| Requirement | Target |
| --- | --- |
| Phase retry coverage | 100% of failed phases retried up to 3 times |
| No successful phase re-execution | Zero repeated successful phases |
| Dead Letter Queue capture rate | 100% of permanently failed messages |
| Fallback application rate | 100% of retry-exhausted tickets |

### 13.3 Scalability

- Worker is designed to run as multiple concurrent instances without message duplication
- Database schema uses globally unique IDs for distributed-safe primary keys
- The database schema is designed to support future scaling

### 13.4 Security

| Requirement | Detail |
| --- | --- |
| Authentication | API Key passed via request header |
| Key storage | API key is stored securely in environment configuration |
| Cross-request authentication | All requests are authenticated via API key |
| PII in logs | Customer ID and attachment URLs are redacted from all log output |
| Rate limiting | 100 requests per minute |

### 13.5 Observability

| Requirement | Detail |
| --- | --- |
| Log format | Structured, machine-readable output |
| Log destination | Standard output, compatible with any log aggregator |
| Mandatory log fields | Timestamp, log level, ticket ID, phase, event name |
| Health check | Dedicated endpoint that verifies database and queue connectivity |

---

## 15. Rollout Strategy

### Phases

| Phase | Trigger | What Happens |
| --- | --- | --- |
| **Internal Testing** | Epic 4 complete | Process a batch of historical tickets through the full pipeline. Support team rates output quality. Minimum 4 out of 5 satisfaction required before proceeding. |
| **Soft Launch** | Epic 5 complete | Enable for 10% of incoming tickets. Agents work normally but can view AI output. Gather feedback on draft quality and triage accuracy. |
| **Broad Rollout** | Epic 6 complete, all reliability checks passed | Enable for 100% of tickets. AI output surfaced by default on every ticket. Manual replay available for ops team. |

### Go / No-Go Criteria

Before broad rollout, all of the following must be confirmed:

- [ ] Triage pipeline success rate above 95% in soft launch
- [ ] Resolution draft quality rated 4 out of 5 or higher by support team
- [ ] End-to-end processing time under 30 seconds at 99th percentile
- [ ] Zero tickets lost in soft launch period
- [ ] Manual replay tested and verified by ops team
- [ ] Dead Letter Queue monitoring active and alerting configured

### What This Is NOT

- This does not replace agents — AI drafts are always reviewed before sending
- This does not make decisions about customer accounts — it advises, not decides
- This does not interact directly with customers — all responses go through agents first

---

## 16. Success Metrics

| Metric | Target | Measurement Method |
| --- | --- | --- |
| Triage pipeline success rate | Over 95% without fallback | Completed triage jobs divided by total tickets |
| Resolution pipeline success rate | Over 95% without fallback | Completed resolution jobs divided by total tickets |
| End-to-end pipeline latency | Under 30 seconds at 99th percentile | Time from ticket creation to completed status |
| Retry recovery rate | Over 70% of retried phases succeed | Successful retries divided by total retries |
| Fallback application rate | Under 5% of tickets | Tickets with needs manual review status divided by total |
| Real-time event delivery | All 5 events received per ticket | Integration test assertion |
| PII redaction coverage | 100% | Unit test confirms no raw customer ID in log output |
| Dead Letter Queue capture rate | 100% of permanently failed messages | Integration test message count assertion |
| Submission acknowledgement time | Under 200ms at 99th percentile | Load test measurement |
| Health check uptime | 100% during test window | Continuous polling |

---

## 17. Risk Assessment

| Risk | Probability | Impact | Mitigation |
| --- | --- | --- |
| AI service returns inconsistent response structure | High | High | Schema validation layer rejects invalid responses and triggers retry |
| Local queue emulator behaves differently from cloud queue service | Medium | Medium | Test against the real cloud queue service early; pin emulator version |
| Retry storms under high load | Medium | High | Queue visibility timeout prevents concurrent workers from picking the same message |
| Database transaction deadlocks under concurrent load | Low | High | Use row-level locking and keep transactions as short as possible |
| real-time connection room memory leak from stale connections | Medium | Medium | Implement room cleanup on disconnect and monitor active room count |
| PII leaks in logs before redaction is applied | Low | Critical | Redaction is applied globally at the logger level, not per individual log call |
| Static fallback content becomes outdated | Low | Medium | Store fallback content as configuration rather than hardcoded values; review quarterly |
| Dead Letter Queue messages accumulate with no alerting | Medium | Medium | Add queue depth monitoring and alert when message count exceeds threshold |
| Scope creep from adding more AI processing phases | Medium | High | Strict PRD adherence; additional phases require a new PRD revision |
| Draft versioning logic creates future migration complexity | Low | Medium | Version field added from day one and never retrofitted later |
| LangSmith version upgrade breaks chain or parser interface | Low | Medium | Pin LangSmith version; run integration tests before upgrading |
| LangSmith output parser fails on unexpected LLM response format | Medium | High | Schema validation layer acts as a secondary guard after LangSmith parsing |

---

## 18. Glossary

| Term | Definition |
| --- | --- |
| **Platform Operator** | The company that owns and operates this support platform |
| **Ticket** | A customer support request submitted via the API |
| **Phase** | One of two AI processing stages: triage or resolution |
| **Triage** | Phase 1 — AI classification producing category, priority, sentiment, escalation flag, routing target, and summary |
| **Resolution Draft** | Phase 2 — AI output producing a customer response, an internal note, and recommended actions |
| **Job Task** | A database record tracking the processing status of a single phase for a single ticket |
| **Worker** | The async background process that consumes queue messages and drives pipeline execution |
| **Dead Letter Queue** | A secondary queue that captures permanently failed messages after the maximum retry count is reached |
| **Fallback** | A static, pre-defined response applied when AI processing fails after all retries are exhausted |
| **Draft Version** | A number tracking how many times a resolution draft has been generated for a ticket |
| **Needs Manual Review** | A ticket status indicating that AI processing failed and a human support agent must handle the ticket |
| **Structured Logging** | A logging approach that outputs each log entry as a machine-readable structured object with consistent fields |
| **Exponential Backoff** | A retry strategy where the delay between attempts increases with each failed retry |
| **Visibility Timeout** | A queue mechanism that temporarily hides a message from other consumers while one worker is processing it |
| **LangSmith** | An AI observability and orchestration platform used in both pipeline phases to manage prompt templates, execute LLM calls, parse structured outputs, trace every LLM interaction, and support evaluation and debugging |
| **LLM Chain** | A LangSmith construct that sequences a prompt template, an LLM call, and an output parser into a single reusable unit |
| **Output Parser** | A LangSmith component that validates and transforms raw LLM responses into structured data before saving to the database |

---

## 19. Architecture Decision Records

### ADR-001: LangSmith as AI Orchestration and Observability Layer

**Status:** Accepted

**Context:** Both Phase 1 (Triage) and Phase 2 (Resolution) require calling an LLM with structured prompts, parsing the response into a defined schema, and handling failures gracefully. This logic could be written manually against the LLM provider SDK, but doing so would require building prompt management, output parsing, retry handling, and LLM observability from scratch in each phase.

**Decision:** Use LangSmith as the AI orchestration and observability layer for both pipeline phases. LangSmith provides prompt template management, LLM call execution, output parsing, built-in retry, and full trace logging — all used in both the triage and resolution workers.

**Consequences:**

| Aspect | Impact |
| --- | --- |
| Prompt management | Prompts defined as reusable templates, not hardcoded strings |
| Output parsing | Structured schema enforced at the LangSmith layer before database write |
| Retry handling | LangSmith built-in retry complements the queue-level exponential backoff |
| Model flexibility | Switching LLM providers requires changing only the LangSmith model configuration |
| Learning curve | Team must be familiar with LangSmith chain construction, output parser patterns, and tracing dashboard |

**Alternatives Considered:**

| Alternative | Reason Not Chosen |
| --- | --- |
| Direct Anthropic SDK | Would require manual prompt management and output parsing in every phase |
| Direct Anthropic/OpenAI SDK | Would require manual prompt management, output parsing, retry logic, and custom observability — LangSmith handles all of this out of the box |
| LiteLLM | Focuses on provider routing, not prompt orchestration or output parsing |

---

*End of Document*
