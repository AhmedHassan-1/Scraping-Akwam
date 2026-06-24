<div align="center">

# 🎬 akwam-nest

**A NestJS-powered scraper for movies & TV-series metadata and download links from [ak.sv](https://ak.sv)**

[![NestJS](https://img.shields.io/badge/NestJS-10.x-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![BullMQ](https://img.shields.io/badge/BullMQ-5.x-FF6B35?logo=redis&logoColor=white)](https://docs.bullmq.io)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)](https://redis.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## ✨ Features

- 🔍 **Two-phase async search** — discover candidates first, then selectively process only what you need
- 📡 **Server-Sent Events** — real-time progress streaming (queue position, per-episode progress, partial results)
- 🧵 **BullMQ job queue** — fair per-user queuing with configurable concurrency & rate limiting
- 🛡️ **Per-IP rate limiting** — Redis-backed sliding window, fully configurable
- 🖼️ **Image proxy** — bypasses CORS / hotlink restrictions on poster images
- 📚 **Swagger UI** — interactive API docs at `/api/docs`
- 🐳 **Docker Compose** — one-command Redis setup for local dev
- 🔄 **Legacy sync endpoint** — single blocking call for simple integrations

---

## 📋 Requirements

| Tool | Version |
|------|---------|
| Node.js | ≥ 20 |
| npm | ≥ 9 |
| Redis | ≥ 7 |

---

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/YOUR_USERNAME/akwam-nest.git
cd akwam-nest
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env — the defaults work for local dev
```

Key variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | HTTP server port |
| `REDIS_HOST` | `127.0.0.1` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `REDIS_URL` | — | Redis URL (overrides host/port, use for managed Redis like Upstash) |
| `SCRAPE_REQUESTS_PER_SECOND` | `1` | Global scrape rate cap |
| `QUEUE_MAX_CONCURRENT_JOBS` | `1` | Parallel BullMQ workers |
| `RATE_LIMIT_PER_USER` | `10` | Max requests per IP per window |
| `RATE_LIMIT_WINDOW_SEC` | `60` | Rate-limit window in seconds |
| `QUEUE_BYPASS_COOKIE_NAME` | `access_queue` | Admin bypass cookie name |
| `QUEUE_BYPASS_COOKIE_VALUE` | — | Admin bypass cookie value (**change this!**) |

### 3. Start Redis

```bash
# Using Docker Compose (recommended for local dev)
npm run docker:redis

# Or if Redis is already running locally, skip this step
```

### 4. Run the Server

```bash
# Development (hot-reload)
npm run start:dev

# Production
npm run build
npm run start:prod
```

The server starts at **http://localhost:3000**
Interactive API docs at **http://localhost:3000/api/docs**

---

## 📖 API Reference

Full interactive docs are available at `/api/docs` (Swagger UI).

### Async Flow (Recommended)

The recommended integration pattern uses three steps:

```
POST /akwam/jobs          →  creates a job, returns { id }
GET  /akwam/jobs/:id/events  →  SSE stream (subscribe for live updates)
POST /akwam/jobs/:id/start  →  kick off processing for selected candidates
```

#### Step 1 — Create a Job

```http
POST /akwam/jobs
Content-Type: application/json

{ "search": "Breaking Bad" }
```

Response:
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "status": "queued",
  "search": "Breaking Bad",
  "queuePosition": 1,
  ...
}
```

#### Step 2 — Subscribe to Events (SSE)

```javascript
const es = new EventSource('/akwam/jobs/550e8400.../events');

es.onmessage = (e) => {
  const event = JSON.parse(e.data);
  // event.type: 'status' | 'progress' | 'candidates' | 'item' | 'complete' | 'error' | 'queue'
  console.log(event);
};
```

**Event types:**

| Type | When | Key fields |
|------|------|-----------|
| `queue` | While waiting | `position`, `waitingTotal`, `ahead` |
| `status` | On status change | `status` |
| `progress` | During scraping | `phase`, `message`, `current`, `total` |
| `candidates` | After discover | `candidates[]` — list of found results |
| `item` | Each item done | `results[]`, `kind`, `title` |
| `complete` | All done | `results[]`, `status: "completed"` |
| `error` | On failure | `message` |
| `cancelled` | After cancel | `status: "cancelled"` |

#### Step 3 — Start Processing

Once `status` becomes `awaiting_selection`, pick the candidates you want:

```http
POST /akwam/jobs/550e8400.../start
Content-Type: application/json

{ "selectedIds": [0, 1] }
```

#### Cancel a Job

```http
DELETE /akwam/jobs/550e8400...
```

---

### Other Endpoints

#### Get Job Snapshot

```http
GET /akwam/jobs/:id
```

Returns the current state of the job including candidates and results.

#### Image Proxy

```http
GET /akwam/proxy-image?url=https://ak.sv/uploads/poster/example.jpg
```

Fetches and re-serves the image, bypassing CORS/hotlink restrictions.
Cached for 24 hours (`Cache-Control: public, max-age=86400`).

#### Legacy Sync Search *(deprecated)*

```http
POST /akwam?search=كابتن أمريكا
```

Blocks until all results are ready. Useful for simple scripts; not recommended for UI integrations.

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────┐
│                   HTTP Client                   │
└───────────────┬────────────────┬────────────────┘
                │                │ SSE
    POST /jobs  │                │ GET /jobs/:id/events
                ▼                ▼
┌───────────────────────────────────────────────────┐
│               AkwamController                     │
│  (rate-limited via UserRateLimitGuard + Redis)     │
└───────────┬──────────────────────────────┬────────┘
            │                              │
            ▼                              ▼
┌─────────────────────┐      ┌─────────────────────────┐
│  AkwamJobsService   │      │   AkwamQueueService      │
│  (in-memory job     │◄────►│   (BullMQ workers)       │
│   state + SSE       │      │   discover / process     │
│   Subject streams)  │      └────────────┬────────────┘
└─────────┬───────────┘                   │
          │                               │
          ▼                               ▼
┌─────────────────────────────────────────────────┐
│                  AkwamService                    │
│   discoverCandidates() → processCandidates()     │
│   cheerio HTML scraping + axios HTTP client      │
│   (throttled via ScrapeRateLimiterService)       │
└─────────────────────────────────────────────────┘
```

### Module Structure

```
src/
├── app.module.ts
├── main.ts                      # Bootstrap + Swagger setup
├── config/
│   └── configuration.ts         # Typed config factory
├── akwam/
│   ├── akwam.module.ts
│   ├── akwam.controller.ts      # HTTP endpoints + Swagger decorators
│   ├── akwam.service.ts         # Core scraping logic
│   ├── akwam-jobs.service.ts    # Job lifecycle & SSE streams
│   ├── akwam-queue.service.ts   # BullMQ integration
│   └── interfaces/
│       ├── akwam.interfaces.ts  # Movie / Series / Episode types
│       ├── job.interfaces.ts    # Job status / snapshot types
│       └── queue.interfaces.ts  # Queue status types
├── queue/
│   ├── queue.module.ts
│   ├── queue-bypass.middleware.ts   # Admin cookie middleware
│   ├── scrape-rate-limiter.service.ts  # Token-bucket scrape limiter
│   └── user-rate-limit.guard.ts     # Per-IP API rate limiting
├── redis/
│   ├── redis.module.ts
│   └── redis.service.ts         # ioredis client wrapper
└── types/
    └── express.d.ts             # Request.queueBypass augmentation
public/                          # Static frontend (served at /)
```

---

## 🔒 Rate Limiting & Queue

### Per-User API Rate Limiting

Applied to `POST /akwam`, `POST /akwam/jobs`, and `POST /akwam/jobs/:id/start`.

- Redis key: `ratelimit:user:<ip>` (sliding window counter)
- Defaults: **10 requests / 60 seconds** per IP
- Returns `429 Too Many Requests` with retry seconds in the message

### BullMQ Job Queue

All scraping runs through BullMQ workers to:
- Prevent overloading ak.sv
- Enforce `SCRAPE_REQUESTS_PER_SECOND` globally
- Give all users a fair queue position

**Admin bypass:** Set the `QUEUE_BYPASS_COOKIE_NAME` cookie to `QUEUE_BYPASS_COOKIE_VALUE` to skip the queue (high-priority jobs). Change the default value in production.

---

## 🐳 Docker

Redis only (app runs locally):

```bash
docker compose up -d redis
```

---

## 🤝 Contributing

1. Fork the repo
2. Create a feature branch: `git checkout -b feat/my-feature`
3. Commit your changes: `git commit -m 'feat: add my feature'`
4. Push and open a Pull Request

Please keep commits conventional (`feat:`, `fix:`, `docs:`, `refactor:`).

---

## ⚠️ Disclaimer

This project is for **educational purposes only**. It scrapes a third-party website. Use responsibly, respect the site's terms of service, and do not use this tool to infringe on copyright.

---

## 📄 License

[MIT](LICENSE) © 2024
