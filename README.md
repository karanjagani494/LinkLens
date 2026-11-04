<div align="center">

![LinkLens — Check the link. Before you pay.](docs/assets/banner.svg)

**A closer look at suspicious payment links and QR codes.**

Evidence you can read. Domain boundaries you can understand. Limitations you can see.

![Next.js](https://img.shields.io/badge/Next.js-16-191918?style=flat-square&logo=nextdotjs&logoColor=white)
![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?style=flat-square&logo=typescript&logoColor=white)
![Fastify](https://img.shields.io/badge/Fastify-191918?style=flat-square&logo=fastify&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-4169E1?style=flat-square&logo=postgresql&logoColor=white)
![Neon](https://img.shields.io/badge/Hosted_on-Neon-3A8066?style=flat-square)
![Status](https://img.shields.io/badge/Status-In_development-ED650F?style=flat-square)
![Checks](https://github.com/karanjagani494/LinkLens/actions/workflows/checks.yml/badge.svg)

[Features](#-what-linklens-does) · [Quick start](#-quick-start) · [Progress](#-build-progress) · [Architecture](ARCHITECTURE.md) · [Specification](docs/linklens-mvp/spec.md)

</div>

---

## 🔎 Why LinkLens?

A familiar brand name in a link is not the same as a familiar domain.

```text
https://paypal.com.account-review.example/...
        └─ brand-looking text ─┘
```

LinkLens helps you inspect URL structure and distinguish observable indicators from assumptions. It explains each finding, its evidence, and what it does **not** prove.

> **Current scope:** real structural URL analysis with private reports stored in hosted PostgreSQL. The queue, consent-based reputation adapter and isolated redirect service are implemented. External checks require server credentials and enable flags; redirect inspection additionally requires independently verified network isolation. LinkLens does not verify merchants, approve payments, or guarantee that a link is safe.

## ✨ What LinkLens does

| Feature | What you get |
| :--- | :--- |
| 🔗 **URL analysis** | Explicit HTTP(S) validation and server-side structural checks |
| 📷 **Local QR decoding** | PNG, JPEG and WebP decoding in a browser worker; select a value when multiple codes are found |
| 🌐 **Domain breakdown** | Scheme, subdomain, registrable domain, public suffix, Unicode and ASCII hostnames |
| 🧩 **Explainable findings** | Stable rule IDs, severity, observed evidence, explanation and limitations |
| 🔐 **Private reports** | Per-report bearer capabilities, server-enforced expiry and deletion |
| 📦 **Redacted export** | Download report JSON without target paths, query values or fragments |
| 🎨 **Responsive interface** | Orange, ink and lilac styling; keyboard support and reduced-motion handling |
| 🧪 **Demo scenarios** | Clearly labelled synthetic fixtures for optional checks and failure states |

### Three verdicts. No made-up safety score.

- **Suspicious** — at least one medium or high indicator was observed.
- **No indicators found** — the required checks completed without a risk indicator; this verdict is available in complete-coverage demo fixtures.
- **Insufficient evidence** — the available checks do not support a complete assessment.

**Coverage is separate from the verdict.** Structural-only reports have partial coverage. Complete coverage requires all domain/structural checks and explicitly opted-in redirect and reputation checks to complete. A clean-looking URL alone never becomes a complete assessment.

## 🛠️ Tech stack

| Layer | Technology |
| :--- | :--- |
| Interface | Next.js App Router, React, TypeScript, Tailwind CSS, Lucide |
| API | Fastify, explicit-origin CORS, PostgreSQL driver |
| Database | Hosted PostgreSQL on Neon |
| Jobs and limits | BullMQ, Redis, atomic admission counters |
| Optional services | Google Safe Browsing lookup; isolated pinned-address HTTP header inspector |
| Domain parsing | `tldts`, including the Public Suffix List's private section |
| QR decoding | Bundled ZXing worker with a three-second decode limit |
| Checks | Vitest and Playwright Chromium |

## 🚀 Quick start

**Requirements:** Node.js 22+, npm, and a PostgreSQL database for real scans. No Google or AI credentials are needed for structural analysis.

```bash
npm ci
```

### 1. Choose a mode

| Mode | Configuration | Database needed? |
| :--- | :--- | :--- |
| **Demo** | `NEXT_PUBLIC_SCAN_ADAPTER=mock` | No |
| **Real structural analysis** | `NEXT_PUBLIC_SCAN_ADAPTER=http` | Yes |

Create `.env.local`:

```dotenv
NEXT_PUBLIC_SCAN_ADAPTER=http
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:4000
```

Create `.env.api` from `.env.api.example` and set your provider-supplied connection string:

```dotenv
API_HOST=127.0.0.1
API_PORT=4000
FRONTEND_ORIGINS=http://127.0.0.1:3000,http://localhost:3000
DATABASE_URL=postgresql://USER:PASSWORD@HOST/DATABASE?sslmode=verify-full
```

**Keep `.env.local` and `.env.api` private.** Database credentials belong on the backend, never in `NEXT_PUBLIC_*` variables. Use your provider's actual TLS connection settings.

### 2. Prepare the server and database

```bash
npm run setup:server
npm run db:migrate
```

Skip backend setup in demo mode. Migrations are versioned and use a transaction and advisory lock. For queue mode, add a TLS `REDIS_URL` to `.env.api`; the API starts its worker and returns queued scan receipts. Without Redis, only non-production direct structural analysis is available. Follow [the server setup guide](docs/SERVER_SETUP.md) for Redis, Google credentials and inspection isolation.

### 3. Start the app

```bash
# Terminal 1 — required for real scans
npm run dev:api

# Terminal 2 — frontend
npm run dev
```

- Frontend: **http://127.0.0.1:3000**
- Connection status: **http://127.0.0.1:3000/status**
- API liveness: **http://127.0.0.1:4000/api/health**
- Database readiness: **http://127.0.0.1:4000/api/ready**

Restart Next.js after changing frontend environment variables. In demo mode, the backend is optional and results are explicitly labelled simulated.

## ✅ Build progress

| Stage | Status |
| :--- | :---: |
| Frontend, local QR decoding and demo scenarios | ✅ |
| Separate API and connection-status page | ✅ |
| Hosted PostgreSQL, report capabilities, expiry and deletion | ✅ |
| Real URL validation, structural rules and saved reports | ✅ |
| Redis queue, worker, rate limits and recovery | Verified with hosted Redis and Neon |
| Consent-based Google Safe Browsing integration | Live queued API and browser scans verified |
| Isolated redirect inspection and network-safety verification | 🟡 Service tested; independent egress isolation remains a release gate |
| Production hosting and operational release checks | ⏸ Deferred |

See [the delivery tracker](BUILD_PROGRESS.md) for implementation details. The database is hosted; the complete application is **not deployed for public use yet**.

## 🧪 Verification

```bash
npm run typecheck
npm test
npm run test:api
npm run test:db
npm run evaluate
npm run build
```

Database tests require the backend environment and create temporary synthetic records. They remove their test records afterward. Do not point test commands at a database without permission to write test data.

<details>
<summary><strong>Browser checks</strong></summary>

Install Chromium once:

```bash
npx playwright install chromium
```

For the real scan journey, run the API and use HTTP mode. In PowerShell:

```powershell
$env:LINKLENS_REAL_TESTS="1"
npm run test:e2e -- --grep "real structural scan"
```

For the backend status check:

```powershell
$env:LINKLENS_API_TESTS="1"
npm run test:e2e -- --grep "backend foundation"
```

The original demo scenario journeys require mock mode. Playwright uses port 3100 and a separate `.next-e2e` directory. Add that origin to the API allowlist. For a queued backend also set `LINKLENS_EXPECT_QUEUE=1`; the direct development backend returns 201 instead of 202.

</details>

**Last verified implementation:** 92 unit/API/provider/network checks, six Neon integration tests, five hosted-Redis/Neon queue integration tests, the real queued browser journey, TypeScript and the production build passed. A 12-case reserved-domain policy corpus also matched its expected verdicts. Hosted Redis and live Google credentials are verified separately during configuration. These results describe synthetic software checks—not measured real-world phishing detection accuracy or an external security audit.

## 🔒 Privacy boundaries

- Submitted URLs and evidence render as inert, escaped text. No target previews, favicons or target hyperlinks.
- QR images stay in the browser; only the selected decoded URL is submitted.
- Structural analysis makes no target requests. Google lookups require explicit consent and enablement; target inspection runs only in the separate gated network service. AI remains disabled.
- Stored URL displays redact paths, queries and fragments. Reports require capability access and expire within 24 hours (30 minutes when reputation lookup is requested).
- Capability digests are stored server-side. Browser capabilities use session storage; explicitly copied private links carry them in the URL fragment.
- Anyone possessing a private report link can access the report until expiry or deletion. There are no user accounts in the anonymous MVP.
- Provider backups/history may retain data beyond application deletion. Retention must be reviewed before sensitive production use.

Dense or overlapping QR images may need cropping. Domain similarity is heuristic and the ten-brand catalogue is illustrative. Skipped, blocked and unavailable checks remain visible and reduce coverage.

## 🧭 Project map

```text
app/                  Next.js pages and global styling
src/features/         Scan form, progress and report interface
src/lib/              Shared types, validation, adapters and local QR decoding
server/analysis/      Structural rules and versioned brand catalogue
server/jobs/          Queue, worker, atomic rate limits and recovery
server/providers/     Consent-aware reputation and inspection pipeline
server/inspection/    Isolated header transport and network policy
server/db/            PostgreSQL storage and migrations
server/app.ts         Fastify API
server/index.ts       API startup and cleanup
scripts/              Optional local database setup helpers
tests/                Unit, integration and browser checks
docs/                 Specification and project assets
```

Read [REQUIREMENTS.md](REQUIREMENTS.md), [ARCHITECTURE.md](ARCHITECTURE.md), and [the MVP specification](docs/linklens-mvp/spec.md) for the intended system. Provider configuration, independent outbound network isolation, provider retention review and deployment validation remain release prerequisites. See [SERVER_SETUP.md](docs/SERVER_SETUP.md) for instructions. Hosting is deferred.

---

<div align="center">

**Check the link. Read the evidence. Verify the payment request independently.**

</div>

Portfolio verification: live Safe Browsing lookup, queued API scan and both browser journeys passed. Safe Browsing is used for this non-commercial portfolio. Protection is imperfect: safe sites can be flagged and new threats missed. Optional redirect inspection is disabled pending network isolation.

## Current scope and future enhancements

The released portfolio checks only the submitted URL: domain boundaries, structural impersonation rules and consent-based Google Safe Browsing lookup. When these checks complete with no indicators, the verdict is **No indicators found**; missing domain or reputation coverage remains **Insufficient evidence**. Neither verdict guarantees payment safety.

**Future: redirect inspection.** Follow shortened links and inspect each destination using a separately isolated service with independently verified outbound network restrictions. Redirect inspection is excluded from the current UI and public API. Existing inspector code is retained for future development; keep its enable flags false.
