<div align="center">

# 🎬 akwam-nest (Clean Architecture & Production-Ready)

**A modular NestJS scraper & REST API for movies & TV-series metadata and download links from [ak.sv](https://ak.sv)**

[![NestJS](https://img.shields.io/badge/NestJS-10.x-E0234E?logo=nestjs&logoColor=white)](https://nestjs.com)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![BullMQ](https://img.shields.io/badge/BullMQ-5.x-FF6B35?logo=redis&logoColor=white)](https://docs.bullmq.io)
[![Redis](https://img.shields.io/badge/Upstash_Redis-TLS_Enabled-00E599?logo=redis&logoColor=white)](https://upstash.com)
[![Swagger](https://img.shields.io/badge/Swagger-OpenAPI_3.0-85EA2D?logo=swagger&logoColor=black)](http://localhost:5000/api/docs)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

</div>

---

## ✨ Features

- 🏗️ **Clean Architecture** — decoupled Core Domain, Application Use Cases, Infrastructure, and Presentation layers.
- 🧩 **Split Micro-Services** — single-responsibility services (`SearchService`, `MediaService`, `DownloadResolver`, `ImageProxy`, `HttpClient`).
- 🔍 **Two-Phase Async Search** — discover candidates first, review posters/titles, then selectively process only what you need.
- 📡 **Server-Sent Events (SSE)** — real-time progress streaming with `ReplaySubject(10)` (queue position, per-episode progress, download resolution).
- 🧵 **BullMQ Queue Engine** — asynchronous job queuing powered by **Upstash Redis (TLS)** with rate limiting and concurrency tuning.
- 🛡️ **Hardened Security**:
  - **SSRF Protection:** strict allowlist for remote poster images (`ak.sv`, `img.downet.net`, `akwam.ss`) with disabled redirects and 5MB cap.
  - **Constant-Time Verification:** admin bypass cookie compared using `crypto.timingSafeEqual`.
  - **Spoof-Proof Rate Limiting:** uses Express-trusted `req.ip` with Redis sliding window.
  - **Security Headers:** HTTP headers secured via `helmet`.
- 🖼️ **Image Proxy & Cache** — bypasses CORS and hotlinking restrictions with Redis caching (24h TTL).
- 📚 **Interactive Swagger Docs** — detailed OpenAPI documentation at `/api/docs` with Arabic/English descriptions and models.
- 🩺 **Health Check** — `/health` endpoint reporting uptime and live Redis connection status.

---

## 📋 Requirements

| Requirement | Minimum Version |
|-------------|-----------------|
| **Node.js** | ≥ 20.x |
| **npm** | ≥ 9.x |
| **Redis** | Local Redis ≥ 7.x OR Upstash Cloud Redis (TLS / `rediss://`) |

---

## 🚀 Quick Start

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/YOUR_USERNAME/akwam-nest.git
cd akwam-nest
npm install
```

### 2. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```env
# Server
PORT=5000

# Redis (Production — Upstash Cloud Redis with TLS)
REDIS_URL=rediss://default:<password>@<host>:6379
REDIS_HOST=<host>
REDIS_PORT=6379
REDIS_USERNAME=default
REDIS_PASSWORD=<password>
REDIS_TLS=true

# Queue Tuning
SCRAPE_REQUESTS_PER_SECOND=1
QUEUE_MAX_CONCURRENT_JOBS=1
QUEUE_DEFAULT_PRIORITY=10
QUEUE_ADMIN_PRIORITY=1000000

# Per-User API Rate Limiting
RATE_LIMIT_PER_USER=10
RATE_LIMIT_WINDOW_SEC=60

# Admin Bypass Cookie (Required — 64-char random token)
QUEUE_BYPASS_COOKIE_NAME=access_queue
QUEUE_BYPASS_COOKIE_VALUE=f8e7d6c5b4a3928170e1d2c3b4a59687e8d7c6b5a493827160f1e2d3c4b5a697
```

### 3. Build & Run

```bash
# Build TypeScript
npm run build

# Start Production Server
npm run start:prod

# Or run Development Server (hot reload)
npm run start:dev
```

Server starts at: **http://localhost:5000**  
Interactive Swagger Docs at: **http://localhost:5000/api/docs**  
Health Check at: **http://localhost:5000/health**

---

## 🏛️ Clean Architecture & Project Structure

The project strictly follows Clean Architecture and Domain-Driven design principles:

```
src/
├── core/                               # 1. Core Domain Layer (Pure Domain)
│   ├── domain/entities/                # Entities: Movie, Series, Episode, Job, Quality
│   ├── errors/                         # Domain Exceptions: JobNotFound, ScrapingException
│   └── interfaces/                     # Core Interfaces (Ports & Contracts)
│       ├── scraper.interface.ts        # Scraper facade contract
│       ├── job-repository.interface.ts # Job persistence contract
│       ├── queue-provider.interface.ts # Queue provider contract
│       ├── rate-limiter.interface.ts   # Rate limiter contract
│       └── image-cache.interface.ts    # Cache contract
│
├── application/                        # 2. Application Layer (Use Cases & DTOs)
│   ├── dtos/                           # Validated DTOs with rich Swagger decorators
│   │   ├── create-job.dto.ts           # Input DTO with string length & sanitization
│   │   ├── start-job.dto.ts            # Selection DTO with max array size
│   │   ├── proxy-image.dto.ts          # Safe HTTPS image URL validation
│   │   ├── sync-search.dto.ts          # Legacy query DTO
│   │   ├── job-response.dto.ts         # Full JobSnapshotDto & MovieDto responses
│   │   ├── health-response.dto.ts      # Health status response
│   │   └── error-response.dto.ts       # Structured 4xx/5xx error schema
│   └── use-cases/                      # Single-responsibility business logic
│       ├── create-job.use-case.ts
│       ├── get-job-snapshot.use-case.ts
│       ├── start-processing.use-case.ts
│       ├── cancel-job.use-case.ts
│       ├── proxy-image.use-case.ts
│       └── sync-search.use-case.ts
│
├── infrastructure/                     # 3. Infrastructure Layer (Adapters & Integrations)
│   ├── scraping/                       # Split Scraping Services
│   │   ├── akwam-http-client.service.ts       # Axios client, Keep-Alive pools, rate limiting
│   │   ├── akwam-search.service.ts            # Discovers candidate titles from ak.sv
│   │   ├── akwam-download-resolver.service.ts # 3-step download redirect resolver
│   │   ├── akwam-media.service.ts             # Movie & TV series episode parser
│   │   ├── akwam-image-proxy.service.ts       # SSRF allowlist validator & binary fetcher
│   │   ├── legacy-response-formatter.service.ts# Formats results into legacy arrays
│   │   ├── akwam-html-scraper.service.ts      # Facade implementing IScraperService
│   │   └── parsers/                           # Pure Cheerio HTML parsers
│   ├── persistence/                    # Redis Job Repository & Image Cache (TTL: 2h/24h)
│   └── queue/                          # BullMQ Queue Service & Background Processor
│
├── presentation/                       # 4. Presentation Layer (HTTP & Web)
│   ├── controllers/                    # NestJS REST Controllers
│   │   ├── akwam-jobs.controller.ts    # Job lifecycle & SSE endpoints
│   │   ├── akwam-legacy.controller.ts  # Legacy synchronous search
│   │   ├── akwam-proxy.controller.ts   # Safe image proxy
│   │   └── health.controller.ts        # System & Redis ping health check
│   └── filters/                        # Global HTTP exception filter
│
├── queue/                              # Middlewares & Guards
│   ├── queue-bypass.middleware.ts      # Timing-safe admin cookie verification
│   └── user-rate-limit.guard.ts        # IP sliding window rate limit
│
├── redis/                              # ioredis module & TLS connection factory
├── config/                             # Typed configuration & URL parser
├── app.module.ts                       # Root application module
└── main.ts                             # Bootstrap, Helmet, CORS & Swagger setup
```

---

## 📖 API Reference

Complete interactive documentation with live execution is available at **`/api/docs`**.

### 1. Asynchronous Job Flow (Recommended)

```
POST /akwam/jobs ──► GET /akwam/jobs/:id/events (SSE) ──► POST /akwam/jobs/:id/start ──► GET /akwam/jobs/:id
(Create Job)         (Live Progress & Candidates)         (Pick Candidates)              (Final Results)
```

#### Step 1: Create a Job
```http
POST /akwam/jobs
Content-Type: application/json

{
  "search": "Inception"
}
```
**Response (`201 Created`):**
```json
{
  "id": "7c3ad391-0442-4118-ad7b-0d3dfe8851c5",
  "search": "Inception",
  "status": "queued",
  "candidates": [],
  "selectedIds": [],
  "progress": {
    "phase": "queue",
    "message": "جاري تسجيل طلبك في الطابور...",
    "current": 0,
    "total": 0
  },
  "queuePosition": 1,
  "priority": 10,
  "createdAt": 1792840455021
}
```

#### Step 2: Subscribe to Real-Time Events (SSE)
```javascript
const eventSource = new EventSource('http://localhost:5000/akwam/jobs/7c3ad391.../events');

eventSource.onmessage = (event) => {
  const payload = JSON.parse(event.data);
  console.log('Event Type:', payload.type, payload.data);
};
```

**Supported Event Types:**
| Event | Description |
|-------|-------------|
| `queue` | Real-time position update in BullMQ (`position`, `waitingTotal`, `ahead`) |
| `status` | State transitions (`discovering` ➔ `awaiting_selection` ➔ `processing` ➔ `completed`) |
| `progress` | Current phase message and completion numbers |
| `candidates` | Emitted when discovery finishes; contains list of matching titles |
| `item` | Emitted when an individual movie or episode completes with download links |
| `complete` | Final event when all selected items are scraped |
| `error` | Emitted if an unrecoverable scraping error occurs |
| `cancelled` | Emitted when the job is aborted via `DELETE` |

#### Step 3: Start Processing Selected Candidates
Once the job status reaches `awaiting_selection`, choose which IDs to process:
```http
POST /akwam/jobs/7c3ad391-0442-4118-ad7b-0d3dfe8851c5/start
Content-Type: application/json

{
  "selectedIds": [0]
}
```

#### Step 4: Get Job Snapshot
```http
GET /akwam/jobs/7c3ad391-0442-4118-ad7b-0d3dfe8851c5
```
**Response (`200 OK`):**
```json
{
  "id": "7c3ad391-0442-4118-ad7b-0d3dfe8851c5",
  "status": "completed",
  "movies": [
    {
      "title": "Inception",
      "image": "https://img.downet.net/uploads/ZMBmF.jpeg",
      "rating": "10 / 8.8 PG13 اشراف عائلي",
      "language": "اللغة : الإنجليزية",
      "quality": "جودة الفيلم : BluRay - 1080p",
      "year": "السنة :  2010",
      "country": "انتاج :  الولايات المتحدة الأمريكية",
      "duration": "مدة الفيلم : 152 دقيقة",
      "information": ["خيال علمي", "مغامرة", "اكشن"],
      "qualities": [
        {
          "quality": "1080p",
          "downloadUrl": "https://akwam.ss/download/7057/562/inception-1",
          "size": "2.7 GB"
        },
        {
          "quality": "720p",
          "downloadUrl": "https://akwam.ss/download/7056/562/inception-1",
          "size": "1.4 GB"
        },
        {
          "quality": "480p",
          "downloadUrl": "https://akwam.ss/download/7055/562/inception-1",
          "size": "727.2 MB"
        }
      ]
    }
  ],
  "results": [ ... ]
}
```

#### Cancel Job
```http
DELETE /akwam/jobs/7c3ad391-0442-4118-ad7b-0d3dfe8851c5
```

---

### 2. Utilities & Health

#### Safe Image Proxy (SSRF Protected)
```http
GET /akwam/proxy-image?url=https://img.downet.net/thumb/178x260/uploads/ZMBmF.jpeg
```
- Returns raw image binary (`image/jpeg`, `image/png`, etc.).
- Cached in Redis for 24 hours.
- Disallowed domains or malicious IPs return `400 Bad Request`.

#### Health Check
```http
GET /health
```
```json
{
  "status": "ok",
  "redis": "connected",
  "uptime": 125.45,
  "timestamp": "2026-10-24T12:00:00.000Z"
}
```

---

## 🔒 Security Summary

1. **Zero Hardcoded Secrets:** Admin bypass values and credentials are strictly loaded from `.env` and verified at bootstrap.
2. **Timing-Attack Resistance:** Cookie validation uses `crypto.timingSafeEqual` over buffers of matched length.
3. **SSRF Allowlist:** Remote image fetching is restricted to verified domains (`ak.sv`, `img.ak.sv`, `akwam.ss`, `img.downet.net`, `downet.net`), redirects are disabled (`maxRedirects: 0`), and response Content-Type is validated.
4. **Per-IP Rate Limiting:** Sliding-window rate limiter in Redis (10 requests/minute by default).
5. **Helmet Security:** Modern security headers enabled on all HTTP endpoints.

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
