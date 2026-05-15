# Flow — Workflow Automation Platform

A production-grade workflow automation backend (n8n / Make clone) built as a capstone project for the Airtribe Backend Engineering Launchpad.

Flow lets you connect triggers and actions across services — HTTP calls, conditional branching, delays, email/Slack notifications — without writing custom integration code.

---

## Table of Contents

- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Quick Start (Docker)](#quick-start-docker)
- [Local Development](#local-development)
- [Environment Variables](#environment-variables)
- [API Reference](#api-reference)
- [Workflow Definition Format](#workflow-definition-format)
- [Node Types](#node-types)
- [Design Decisions](#design-decisions)
- [Testing](#testing)
- [Public Share API (for flow-frontend)](#public-share-api-for-flow-frontend)

---

## Architecture

```
                        ┌─────────────────────────────────┐
  External Caller ──▶   │  API Layer (Express)             │
  Cron Scheduler ──▶    │  Auth · Workflow CRUD · Triggers  │
  Authenticated User ──▶│  Rate Limiter · Validation (Zod) │
                        └──────────────┬──────────────────┘
                                       │ enqueueRun()
                                       ▼
                        ┌─────────────────────────────────┐
                        │  Queue  (Redis + BullMQ)          │
                        │  workflow-runs queue              │
                        │  · delayed jobs                   │
                        │  · stalled-job recovery           │
                        │  · exponential backoff (2s→8s→30s)│
                        └──────────────┬──────────────────┘
                                       │ pull job
                                       ▼
                        ┌─────────────────────────────────┐
                        │  Worker Process (× N)             │
                        │  Orchestrator walks DAG            │
                        │  Handler Registry                 │
                        │  · HTTP · Condition · Delay       │
                        │  · Notify (SMTP / Slack)          │
                        │  Idempotency guard                │
                        └──────────────────────────────────┘
                               │
                               ▼
                    PostgreSQL (Prisma ORM)
```

**Key invariant:** The API never executes nodes. All execution happens inside the Worker, decoupled by the queue. The API and Worker share no in-memory state — both are horizontally scalable.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript (strict mode) |
| API framework | Express 4 |
| Database | PostgreSQL 16 via Prisma ORM |
| Queue | Redis 7 + BullMQ |
| Scheduler | node-cron |
| Authentication | JWT (access + refresh tokens) + bcrypt |
| Validation | Zod (schema-first, every endpoint) |
| Logging | Pino (structured JSON logs) |
| HTTP client | Axios |
| Email | Nodemailer (SMTP) |
| Container | Docker + Docker Compose |
| Testing | Jest + ts-jest + Supertest |

---

## Project Structure

```
flow-backend/
├── src/
│   ├── api/                    # Express API server
│   │   ├── app.ts              # Express app factory
│   │   ├── index.ts            # Server entry point
│   │   ├── controllers/        # Route handlers
│   │   │   ├── auth.controller.ts
│   │   │   ├── workflow.controller.ts
│   │   │   ├── run.controller.ts
│   │   │   └── share.controller.ts
│   │   ├── middleware/
│   │   │   ├── auth.middleware.ts      # JWT verification
│   │   │   ├── validate.middleware.ts  # Zod validation factory
│   │   │   ├── rateLimiter.middleware.ts
│   │   │   └── error.middleware.ts
│   │   ├── routes/
│   │   │   ├── auth.routes.ts
│   │   │   ├── workflow.routes.ts
│   │   │   ├── run.routes.ts
│   │   │   ├── share.routes.ts
│   │   │   └── health.routes.ts
│   │   └── validators/         # Zod schemas (body, params, query)
│   │
│   ├── worker/                 # BullMQ worker process
│   │   ├── index.ts            # Worker entry point
│   │   ├── orchestrator.ts     # DAG walker + node executor
│   │   └── handlers/
│   │       ├── http.handler.ts
│   │       ├── condition.handler.ts
│   │       ├── delay.handler.ts
│   │       └── notify.handler.ts
│   │
│   ├── scheduler/
│   │   └── index.ts            # Cron scheduler (syncs per-workflow tasks)
│   │
│   └── lib/                    # Shared utilities
│       ├── config.ts           # Zod-validated env config
│       ├── db.ts               # Prisma client singleton
│       ├── queue.ts            # BullMQ queue + Redis connection
│       ├── logger.ts           # Pino logger
│       └── types.ts            # Shared TypeScript types + AppError
│
├── prisma/
│   └── schema.prisma           # Database schema
│
├── tests/
│   ├── unit/                   # No DB required
│   │   ├── handlers/           # All 4 node handlers tested in isolation
│   │   └── validators/         # Workflow definition + graph validation
│   ├── integration/            # Requires Postgres + Redis
│   │   ├── auth.test.ts
│   │   ├── workflow.test.ts
│   │   └── run.test.ts
│   ├── helpers.ts
│   ├── globalSetup.ts
│   └── globalTeardown.ts
│
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── jest.config.ts              # Integration test config
├── jest.unit.config.ts         # Unit test config (no DB)
├── tsconfig.json
└── package.json
```

---

## Quick Start (Docker)

The fastest way to run the entire stack — Postgres, Redis, API, Worker, and Scheduler — in one command.

### Prerequisites

- [Docker](https://www.docker.com/get-started) 24+
- [Docker Compose](https://docs.docker.com/compose/) v2

### Steps

**1. Clone and configure**

```bash
git clone <your-repo-url>
cd flow-backend
cp .env.example .env
```

Edit `.env` and set at minimum:

```env
JWT_SECRET=your-super-secret-at-least-32-chars
JWT_REFRESH_SECRET=another-long-secret-for-refresh-tokens
```

**2. Build and start all services**

```bash
docker-compose up --build
```

This starts:
- `flow_postgres` — PostgreSQL database (port 5432)
- `flow_redis` — Redis (port 6379)
- `flow_api` — REST API (port 3000)
- `flow_worker` — BullMQ worker
- `flow_scheduler` — Cron scheduler

**3. Run database migrations** (first time only)

```bash
docker-compose exec api npx prisma migrate deploy
```

**4. Verify the API is running**

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "ok",
  "checks": { "database": "ok", "queue": "ok" },
  "uptime": 12.4
}
```

### Stop the stack

```bash
docker-compose down
# To also remove volumes (wipes data):
docker-compose down -v
```

---

## Local Development

For a faster dev loop with hot-reload.

### Prerequisites

- Node.js 20+
- Docker (for Postgres and Redis only)

### Steps

**1. Start infrastructure**

```bash
docker-compose up postgres redis
```

**2. Install dependencies**

```bash
npm install
```

**3. Configure environment**

```bash
cp .env.example .env
# Edit .env — DATABASE_URL and REDIS_URL point to localhost by default
```

**4. Run migrations and generate Prisma client**

```bash
npm run db:migrate
npm run db:generate
```

**5. Start all three processes** (separate terminals)

```bash
# Terminal 1 — API
npm run dev:api

# Terminal 2 — Worker
npm run dev:worker

# Terminal 3 — Scheduler
npm run dev:scheduler
```

The API will be available at `http://localhost:3000`.

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATABASE_URL` | ✅ | — | PostgreSQL connection string |
| `REDIS_URL` | ✅ | `redis://localhost:6379` | Redis connection string |
| `JWT_SECRET` | ✅ | — | Secret for access tokens (min 16 chars) |
| `JWT_EXPIRES_IN` | | `15m` | Access token TTL |
| `JWT_REFRESH_SECRET` | ✅ | — | Secret for refresh tokens (min 16 chars) |
| `JWT_REFRESH_EXPIRES_IN` | | `7d` | Refresh token TTL |
| `PORT` | | `3000` | API server port |
| `NODE_ENV` | | `development` | `development` / `production` / `test` |
| `RATE_LIMIT_WINDOW_MS` | | `60000` | Rate limit window (ms) |
| `RATE_LIMIT_MAX_REQUESTS` | | `100` | Max requests per window |
| `EXEC_RATE_LIMIT_MAX` | | `10` | Max workflow executions per minute per user |
| `SMTP_HOST` | | — | SMTP host for email notifications |
| `SMTP_PORT` | | `587` | SMTP port |
| `SMTP_USER` | | — | SMTP username |
| `SMTP_PASS` | | — | SMTP password |
| `SMTP_FROM` | | `Flow <noreply@flow.app>` | From address |
| `SLACK_WEBHOOK_URL` | | — | Slack incoming webhook URL |
| `WORKER_CONCURRENCY` | | `5` | Parallel jobs per worker process |
| `MAX_RETRIES` | | `3` | Max node execution retries |

---

## API Reference

All endpoints (except auth and webhooks) require:
```
Authorization: Bearer <accessToken>
```

### Authentication

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/auth/signup` | Register a new user |
| `POST` | `/api/auth/login` | Login and get tokens |
| `POST` | `/api/auth/refresh` | Rotate access token |

**Signup**
```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{ "email": "you@example.com", "password": "Password123" }'
```
```json
{
  "userId": "uuid",
  "accessToken": "eyJ...",
  "refreshToken": "eyJ..."
}
```

**Login**
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{ "email": "you@example.com", "password": "Password123" }'
```

---

### Workflows

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/workflows` | List your workflows |
| `POST` | `/api/workflows` | Create a draft workflow |
| `GET` | `/api/workflows/:id` | Get workflow details |
| `PATCH` | `/api/workflows/:id` | Update draft (name, definition, cron) |
| `DELETE` | `/api/workflows/:id` | Delete workflow |
| `POST` | `/api/workflows/:id/publish` | Publish (freeze + version) |
| `POST` | `/api/workflows/:id/unpublish` | Revert to draft |
| `GET` | `/api/workflows/:id/runs` | Paginated run history |

**Create a workflow**
```bash
curl -X POST http://localhost:3000/api/workflows \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Daily Report",
    "definition": {
      "triggerNodeId": "fetch",
      "nodes": [
        {
          "id": "fetch",
          "type": "http_request",
          "name": "Fetch Report",
          "config": {
            "method": "GET",
            "url": "https://api.example.com/report"
          }
        },
        {
          "id": "notify",
          "type": "notify",
          "name": "Send to Slack",
          "config": {
            "channel": "slack",
            "message": "Daily report ready!"
          }
        }
      ],
      "edges": [{ "id": "e1", "from": "fetch", "to": "notify" }]
    },
    "cronExpression": "0 9 * * *"
  }'
```

**Publish a workflow**
```bash
curl -X POST http://localhost:3000/api/workflows/<id>/publish \
  -H "Authorization: Bearer $TOKEN"
```
```json
{ "version": { "id": "uuid", "versionNumber": 1, "publishedAt": "..." } }
```

---

### Runs

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/workflows/:id/run` | Manually trigger a run |
| `GET` | `/api/runs/:id` | Get run status + node timeline |
| `POST` | `/api/runs/:id/pause` | Pause a running run |
| `POST` | `/api/runs/:id/resume` | Resume a paused run |
| `POST` | `/api/runs/:id/cancel` | Cancel a run |

**Trigger a manual run**
```bash
curl -X POST http://localhost:3000/api/workflows/<id>/run \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "payload": { "source": "manual" } }'
```
```json
{ "runId": "uuid", "status": "queued" }
```

**Get run timeline**
```bash
curl http://localhost:3000/api/runs/<runId> \
  -H "Authorization: Bearer $TOKEN"
```
```json
{
  "run": {
    "id": "uuid",
    "status": "completed",
    "triggerType": "manual",
    "startedAt": "2024-01-01T09:00:00Z",
    "endedAt": "2024-01-01T09:00:02Z",
    "nodeExecutions": [
      {
        "nodeId": "fetch",
        "status": "success",
        "durationMs": 342,
        "output": { "statusCode": 200, "ok": true, "body": { ... } }
      },
      {
        "nodeId": "notify",
        "status": "success",
        "durationMs": 180,
        "output": { "channel": "slack", "sent": true }
      }
    ]
  }
}
```

---

### Webhook Trigger

No authentication — uses a secret header instead.

```
POST /api/hooks/:workflowId
Headers:
  X-Secret: <workflow.webhookSecret>
  X-Request-Id: <unique-id>   (optional, enables deduplication)
```

The `webhookSecret` is auto-generated when you create a workflow. Retrieve it via `GET /api/workflows/:id`.

```bash
curl -X POST http://localhost:3000/api/hooks/<workflowId> \
  -H "X-Secret: abc123..." \
  -H "X-Request-Id: req-001" \
  -H "Content-Type: application/json" \
  -d '{ "event": "order.created", "orderId": 42 }'
```

---

### Workflow Sharing (for flow-frontend)

Generates a public token so non-technical users can run workflows without an account.

| Method | Endpoint | Auth | Description |
|---|---|---|---|
| `POST` | `/api/workflows/:id/share` | Required | Generate share token |
| `DELETE` | `/api/workflows/:id/share` | Required | Revoke share token |
| `GET` | `/api/public/workflows/:shareToken` | None | Get public workflow info |
| `POST` | `/api/public/workflows/:shareToken/run` | None | Trigger run publicly |
| `GET` | `/api/public/runs/:runId` | None | Poll run status |

---

### Health Check

```bash
curl http://localhost:3000/health
```
```json
{
  "status": "ok",
  "checks": { "database": "ok", "queue": "ok" },
  "queue": { "waiting": 0, "active": 1, "failed": 0 },
  "uptime": 3600
}
```

---

## Workflow Definition Format

A workflow definition is a JSON object with three fields:

```json
{
  "triggerNodeId": "node-id-of-entry-point",
  "nodes": [ ...NodeObject ],
  "edges": [ ...EdgeObject ]
}
```

### Node object

```json
{
  "id": "unique-string",
  "type": "http_request | condition | delay | notify",
  "name": "Human-readable name",
  "config": { ...type-specific config }
}
```

### Edge object

```json
{
  "id": "unique-string",
  "from": "source-node-id",
  "to": "target-node-id",
  "condition": "true | false"   // only for edges leaving a condition node
}
```

**Validation on publish:**
- All edge `from`/`to` references must resolve to defined nodes
- `triggerNodeId` must reference a defined node
- No cycles allowed (DAG check via DFS)

---

## Node Types

### `http_request`

Makes an outbound HTTP call.

```json
{
  "method": "GET | POST | PUT | PATCH | DELETE",
  "url": "https://api.example.com/endpoint",
  "headers": { "Authorization": "Bearer token" },
  "body": { "key": "value" },
  "timeoutMs": 10000
}
```

Output available to downstream nodes:
```json
{ "statusCode": 200, "ok": true, "headers": {...}, "body": {...} }
```

Every request includes `X-Idempotency-Key: <runId>-<nodeId>-<attempt>` so retries are safe on supporting APIs.

---

### `condition`

Evaluates a JSONPath expression against the execution context and branches the workflow.

```json
{
  "jsonPath": "$.nodes.fetch.body.status",
  "operator": "eq | neq | gt | lt | contains | exists",
  "value": "active"
}
```

JSONPath context shape:
```json
{
  "trigger": { ...triggerPayload },
  "nodes": {
    "<nodeId>": { ...thatNodeOutput }
  }
}
```

Wire two edges out of a condition node with `"condition": "true"` and `"condition": "false"`.

---

### `delay`

Pauses execution without blocking the worker thread. The job is re-enqueued with a BullMQ delay.

```json
{
  "delaySeconds": 300
}
```

Range: 1 second – 86 400 seconds (24 hours).

---

### `notify`

Sends a notification via email or Slack.

**Email:**
```json
{
  "channel": "email",
  "to": "recipient@example.com",
  "subject": "Workflow notification",
  "message": "Your workflow completed successfully."
}
```

**Slack:**
```json
{
  "channel": "slack",
  "message": "Deployment completed ✅"
}
```

---

## Design Decisions

### 1. Runs reference immutable `workflow_versions`

When a workflow is published, its definition is frozen into a `workflow_versions` row. Every run references a version, never the live draft. This means:
- You can edit a workflow while previous runs are still in-flight
- Audit history is exact — you always know exactly what code ran

### 2. API never executes nodes

The API only enqueues jobs. All node execution happens in the Worker process via BullMQ. This separation means:
- Worker processes can be scaled horizontally with zero config changes
- A crashed worker is automatically recovered by BullMQ's stalled-job detector
- The API remains fast and stateless

### 3. Delay re-enqueues instead of sleeping

When a `delay` node runs, the worker doesn't `sleep()`. Instead it re-enqueues the run with BullMQ's built-in `delay` option and returns immediately. This keeps worker concurrency slots free for other runs.

### 4. Idempotency at every level

- **Node executions:** unique constraint on `(run_id, node_id, attempt)` — retries never double-write
- **Outbound HTTP calls:** every request carries `X-Idempotency-Key: <runId>-<nodeId>-<attempt>`
- **Webhook delivery:** `webhook_deliveries` table deduplicates by `X-Request-Id` within a 5-minute window

### 5. Zod for all validation

Every API endpoint validates its `body`, `params`, and `query` through a Zod schema before reaching the controller. Validation errors return `422` with field-level messages — no raw Zod output is ever leaked to the client.

### 6. Draft → Publish lifecycle

Workflows start in `draft` state (editable). Publishing freezes the definition and creates an immutable version. To edit a published workflow you must `unpublish` it first — this protects in-flight runs from seeing mid-edit definitions.

### 7. Pause / Resume / Cancel

The orchestrator checks `runs.status` before executing each node. Setting `status = 'paused'` or `'cancelled'` in the database is the signal — no message queues involved. Resume re-enqueues from `current_node_id` so no work is re-done.

---

## Testing

### Unit tests — no database required

Tests each node handler and validator in isolation with mocked dependencies.

```bash
npm run test:unit
```

Coverage:
- `httpHandler` — success, 4xx, idempotency key, network error
- `conditionHandler` — all 6 operators, unknown operator
- `delayHandler` — sentinel output, non-blocking
- `workflowDefinitionSchema` — valid/invalid shapes
- `validateDefinitionGraph` — valid DAG, missing nodes, cycle detection

### Integration tests — requires Postgres + Redis

Full API tests with a real database and mocked queue.

```bash
# Start infrastructure first
docker-compose up postgres redis

# Run migrations against the test DB
DATABASE_URL=postgresql://flow_user:flow_pass@localhost:5432/flow_test \
  npx prisma migrate deploy

npm run test:integration
```

Coverage:
- Auth: signup, duplicate email, weak password, login, refresh token
- Workflows: CRUD, publish, edit-after-publish guard, delete
- Runs: manual trigger, unpublished guard, get timeline, ownership check
- Runs: cancel, double-cancel guard, pause/resume state machine
- Webhooks: valid secret, wrong secret, deduplication

### Run everything

```bash
npm test           # integration tests
npm run test:unit  # unit tests only (CI-friendly, no DB)
```

---

## Public Share API (for flow-frontend)

Flow has a companion frontend repository (`flow-frontend`) where non-technical users can run pre-built workflows without understanding webhooks or APIs.

### Flow

1. Workflow owner publishes a workflow and generates a share link:
   ```bash
   POST /api/workflows/:id/share
   → { "shareToken": "abc...", "shareUrl": "/api/public/workflows/abc..." }
   ```

2. Owner shares the URL with end users (e.g. embeds it in a dashboard).

3. End user visits the frontend, which fetches workflow metadata:
   ```bash
   GET /api/public/workflows/:shareToken
   → { "name": "Daily Report", "steps": ["Fetch Data", "Send Slack"] }
   ```

4. User clicks **Run** — frontend calls:
   ```bash
   POST /api/public/workflows/:shareToken/run
   Body: { "payload": { "reportDate": "2024-01-15" } }
   → { "runId": "uuid", "status": "queued" }
   ```

5. Frontend polls status:
   ```bash
   GET /api/public/runs/:runId
   → { "run": { "status": "completed", "nodeExecutions": [...] } }
   ```

6. Owner can revoke the link at any time:
   ```bash
   DELETE /api/workflows/:id/share
   ```

All public endpoints are unauthenticated and only expose the minimum information needed.

---

## Scripts Reference

```bash
npm run dev:api          # Start API with hot-reload
npm run dev:worker       # Start Worker with hot-reload
npm run dev:scheduler    # Start Scheduler with hot-reload
npm run build            # Compile TypeScript
npm run test:unit        # Unit tests (no DB)
npm run test:integration # Integration tests
npm run test:coverage    # Coverage report
npm run db:generate      # Regenerate Prisma client
npm run db:migrate       # Run pending migrations
npm run db:migrate:deploy# Deploy migrations (production)
npm run db:studio        # Open Prisma Studio (DB GUI)
npm run lint             # ESLint
```
