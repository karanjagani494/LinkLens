# Server configuration guide

Hosting is deferred. Run the frontend/API locally while connecting to hosted Neon and, when configured, hosted Redis. Never paste connection strings or keys into chat, source code, or GitHub.

## 1. Database

Keep the Neon `DATABASE_URL` in the ignored `.env.api` file. The server verifies remote PostgreSQL TLS certificates. Apply schema updates:

```powershell
npm run db:migrate
```

## 2. Hosted queue

Use a TLS-enabled Redis endpoint compatible with BullMQ (Redis 6.2+ commands, standalone endpoint, no eviction). Upstash documents BullMQ support: https://upstash.com/docs/redis/integrations/bullmq. Its HTTPS REST endpoint is not suitable for this TCP client. Redis Cloud's free Essentials plan does not offer TLS; do not use a plain remote connection for exact payment URLs.

In `.env.api`:

```dotenv
REDIS_URL=rediss://default:YOUR_PASSWORD@YOUR_HOST:YOUR_PORT/0
```

Use the provider's exact URL and percent-encoding. Do not change `redis://` to `rediss://` unless the endpoint actually supports TLS. Leave eviction disabled. Review persistence/history retention before handling sensitive live links: Redis key expiry does not prove erasure of provider backups.

Generate internal server secrets once:

```powershell
npm run setup:server
```

This preserves existing configured values and writes `RATE_LIMIT_SECRET` and `FETCH_SERVICE_TOKEN` only to ignored `.env.api`. Restart the API after saving environment changes:

```powershell
npm run dev:api
```

The API runs its BullMQ worker in the same process for local development. Queue jobs contain scan IDs only; exact inputs have a five-minute Redis TTL, are claimed once, and are removed before provider processing. Processing is bounded to thirty seconds. No external operations are automatically retried. Stale jobs fail instead of replaying.

Admission limits are five submissions per minute, thirty per UTC day per hashed client, two active jobs per client, and four globally. All queued jobs count toward admission; counters are atomic Redis operations. Do not rotate `RATE_LIMIT_SECRET` while requests are active. BullMQ polls Redis even while idle; stop local workers when not in use and monitor the provider's command quota.

`/status` shows database and queue connectivity. With no Redis configured, non-production mode supports direct structural analysis with in-process limits. Production mode refuses to start without Redis, PostgreSQL and a server secret. Hosting remains deferred.

## 3. Google Safe Browsing

Structural scans work without Google credentials. To enable real reputation checks:

1. Open Google Cloud Console and create/select a project.
2. Enable **Safe Browsing API** (free, non-commercial use only).
3. Under **APIs & Services → Credentials**, create an API key and restrict its API access to Safe Browsing.
4. Review the non-commercial terms and configure API quotas: https://developers.google.com/safe-browsing/terms. This portfolio uses Safe Browsing, not the paid Web Risk service.
5. Add the key and explicit enable flag to `.env.api`:

```dotenv
GOOGLE_SAFE_BROWSING_API_KEY=YOUR_PRIVATE_API_KEY
ENABLE_REPUTATION=true
REPUTATION_DAILY_LIMIT=1000
```

6. Restart the API. The frontend enables the consent checkbox after reading server capabilities.

The server contacts only `https://safebrowsing.googleapis.com/v4/threatMatches:find`, using an API-key header. It does not submit URLs for crawling. Each opted-in report performs at most six lookups within a shared three-second budget. No consent means no calls. Unavailable, malformed, timed-out or quota-limited responses remain explicitly unavailable; matches already observed are retained. The daily application ceiling applies in queued mode. Templates explain the structured findings; no AI key is required.

The automated provider tests use mocked responses. They do not prove a particular Google Cloud project's credentials, restrictions or quota configuration. Live verification requires the operator-supplied key and explicit flag above.

## 4. Redirect inspection — isolated service only

The application contains an isolated headers-only inspection service. Keep it disabled until independent outbound network policies have been implemented and tested. Application validation alone is not the required network boundary.

The inspection process must have no route to PostgreSQL, Redis, internal services, private networks or metadata endpoints. Permit only public HTTP(S), and route DNS through a controlled resolver. Verify the egress policy independently of this application before setting the confirmation flag. Do not set it just to enable a checkbox.

When that work is complete, configure a private service origin and matching token on the API and inspection process:

```dotenv
ENABLE_REDIRECT_INSPECTION=true
NETWORK_ISOLATION_CONFIRMED=true
FETCH_SERVICE_URL=http://127.0.0.1:4010
FETCH_SERVICE_TOKEN=GENERATED_PRIVATE_TOKEN
INSPECTION_DAILY_LIMIT=500
```

The loopback origin illustrates local IPC only; a future split deployment needs a private authenticated connection. Start the separate process with:

```powershell
npm run start:inspection
```

Policy: all DNS answers must be globally classified; pin one validated address to the socket, verify the peer, retain hostname/TLS checks, repeat at every redirect, allow only default HTTP(S) ports, reject credentials and malformed URLs, cap five redirects, two-second DNS, three-second connection/header idle, fifteen-second total and 32 KB headers. Responses are aborted immediately after headers. No cookies, HTML, JavaScript, forms or downloads are used.

The deterministic tests cover address classes, mixed DNS answers, header transport pinning, peer mismatch, redirect loops, limits and redaction. They do not establish production firewall isolation or test a real hostile DNS environment. No actual user-selected site is contacted by the test suite.

## 5. Checks

```powershell
npm run typecheck
npm test
npm run test:db
npm run evaluate
npm run build
```

Queue integration tests require `REDIS_TEST_URL` and `DATABASE_URL`. They use isolated Redis key prefixes and temporary synthetic reports:

```powershell
$env:REDIS_TEST_URL="redis://127.0.0.1:6381"
npm run test:queue
```

For the real queued browser journey, run the API and set the frontend's API base URL, HTTP mode and test flags:

```powershell
$env:NEXT_PUBLIC_SCAN_ADAPTER="http"
$env:NEXT_PUBLIC_API_BASE_URL="http://127.0.0.1:4000"
$env:LINKLENS_REAL_TESTS="1"
$env:LINKLENS_EXPECT_QUEUE="1"
npm run test:e2e -- --grep "real structural scan"
```

Playwright uses port 3100 and a separate `.next-e2e` directory. Include `http://127.0.0.1:3100` in the API's `FRONTEND_ORIGINS` for these tests. Original fixture journeys require mock mode; the queue/status journeys are opt-in.

The frozen reserved-domain evaluation corpus reports policy conformance, indicator confusion counts, and inconclusive coverage in `docs/evaluation/synthetic-policy.json`. It makes no real-world detection-quality claim.

## Portfolio verification

Hosted Neon and TLS Redis integration tests passed. A complete queued API scan of example.com also completed with a real Google Safe Browsing no-match response. Run `npx tsx --env-file=.env.api scripts/verify-live.ts` to repeat this explicit hosted-service check; temporary records are removed. No-match does not establish safety. Google can miss threats and flag safe sites. Saved reports describe scan-time observations; rescan for current information.

Redirect inspection remains optional and disabled until its independent network boundary is verified. The portfolio demo works with structural rules and opted-in reputation lookup; partial coverage is shown honestly. Hosting is deferred.

Reports requesting Google reputation lookup expire after 30 minutes to avoid presenting outdated threat-list information. Other reports expire within 24 hours.
