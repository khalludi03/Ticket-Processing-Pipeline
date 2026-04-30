# AI-Powered Support Ticket Processing Pipeline

An automated backend service designed to process customer support tickets through a two-phase AI pipeline: **Triage** (classification and metadata) and **Resolution** (drafting responses).

Built with a production-first mindset using asynchronous queue-based processing, relational state tracking, and real-time status notifications.

## 🚀 Features

- **Automated Triage**: Classifies tickets by category, priority, and sentiment using AI.
- **Resolution Drafting**: Generates professional response drafts and internal notes.
- **Asynchronous Pipeline**: Uses AWS SQS for robust, multi-phase processing.
- **Real-time Updates**: Notifies clients of progress via WebSockets.
- **Resilient**: Implements exponential backoff retries, Dead Letter Queues (DLQ), and static fallbacks.
- **Observability**: Structured logging (Pino) and comprehensive health checks.

## 🛠️ Tech Stack

- **Runtime**: Node.js (v22+)
- **Framework**: [Hono](https://hono.dev/)
- **Database**: PostgreSQL with [Drizzle ORM](https://orm.drizzle.team/)
- **Queue**: AWS SQS (emulated via LocalStack for dev)
- **AI**: Portkey / OpenRouter (multi-LLM support)
- **Real-time**: WebSockets
- **Testing**: Vitest

## 📋 Prerequisites

- **Node.js** v22 or higher
- **Docker** and **Docker Compose**
- **AWS CLI** (optional, for manual SQS inspection)

## 🏗️ Getting Started

### 1. Installation
```bash
npm install
```

### 2. Environment Setup
```bash
cp .env.example .env
```
*Note: The defaults in `.env.example` are pre-configured to work with the local Docker setup.*

### 3. Start Infrastructure
Launch Postgres and LocalStack (SQS):
```bash
# Start Database
docker compose up -d

# Start SQS (LocalStack)
docker compose --profile localstack up -d
```

### 4. Database Initialization
```bash
# Run migrations
npm run db:migrate

# Seed default API key (local-dev-api-key)
npm run seed
```

### 5. Run the Application
```bash
# Start development server
npm run dev
```

## 🧪 Testing

The project includes unit and integration tests. Integration tests require the Docker infrastructure to be running.

```bash
# Run all tests
npm test

# Run tests in watch mode
npx vitest
```
See [TESTING.md](./TESTING.md) for detailed testing procedures.

## 📡 API Usage

The API requires an `x-api-key` header. The default local key is `local-dev-api-key`.

### Common Endpoints:
- `GET /health`: System health status.
- `POST /tickets`: Ingest a new support ticket.
- `GET /tickets/:id`: Check ticket processing status.
- `GET /tickets/:id/result`: Retrieve final AI outputs.

See [CURL_COMMANDS.md](./CURL_COMMANDS.md) for ready-to-use examples.

## 🔌 WebSocket Events

Connect to `ws://localhost:3000/ws` and join a ticket room:
```json
{ "type": "join", "ticket_id": "UUID_HERE" }
```
You will receive events like `ticket_started`, `ticket_success`, or `ticket_failed`.

## 📜 Documentation
- [PRD](./AI-Ticket-Pipeline-PRD%20.md): Product Requirements Document.
- [Architecture](./ticket-pipeline-architecture.md): Technical architecture and ADRs.
- [Testing Guide](./TESTING.md): Detailed testing and infrastructure guide.
- [cURL Examples](./CURL_COMMANDS.md): Manual API testing reference.
