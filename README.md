# Shadow App Scanner

A TypeScript/Express service that discovers and catalogues applications from incoming network traffic metadata.

## Features

- **Traffic ingestion** — `POST /traffic` accepts traffic metadata records and automatically discovers new apps
- **App catalogue** — tracks auth types, user access, identity posture, and risk level per app
- **Identity posture** — flags apps using unauthenticated (`none`) access as high-risk
- **Rate limiting** — 100 req/s per source IP on the ingestion endpoint
- **Pagination** — all list endpoints support `?page=` and `?limit=` query params
- **TTL + capacity** — traffic records expire after 1 month; capped at 10,000 records (LRU eviction via `lru-cache`)

## Stack

- **Runtime** — Node.js + TypeScript
- **Framework** — Express
- **Validation** — Zod
- **Rate limiting** — express-rate-limit
- **Logging** — Winston
- **Testing** — Jest + Supertest

## Getting Started

```bash
npm install
npm run dev        # run with ts-node (no compile step)
npm run build      # compile to dist/
npm start          # run compiled output
```

## API

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/traffic` | Ingest a traffic record; auto-discovers new apps |
| `GET` | `/api/apps` | List all discovered apps with identity posture (paginated) |
| `GET` | `/api/apps/:name` | Get a single app profile by name |
| `GET` | `/api/apps/:id/users` | List users seen accessing an app (paginated) |
| `GET` | `/api/traffic` | List all ingested traffic records (paginated) |
| `GET` | `/api/stats` | Total traffic records and discovered app count |
| `GET` | `/health` | Health check |

### POST /api/traffic

```json
{
  "sourceIp": "192.168.1.10",
  "destinationApp": "slack",
  "authType": "oauth",
  "userId": "user-1",
  "timestamp": "2026-06-01T10:00:00.000Z"
}
```

`authType` must be one of: `none` | `basic` | `oauth` | `saml`

### Identity Posture Risk Levels

| Risk | Condition |
|------|-----------|
| `high` | `none` auth detected |
| `medium` | `basic` auth only |
| `low` | `oauth` or `saml` only |

## Running Tests

```bash
npm test
npm run test:watch
```
