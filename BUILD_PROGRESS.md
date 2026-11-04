# LinkLens delivery tracker

Work proceeds one stage at a time. A completed stage does not imply the remaining production controls exist.

| Step | Feature | Status | What you need to supply |
| --- | --- | --- | --- |
| 0 | Frontend and local demo | ✅ Done | Nothing |
| 1 | Separate API, health check and visible connection status | ✅ Done | Nothing |
| 2 | Hosted PostgreSQL, private report capabilities, expiry and deletion | ✅ Done | Neon configured in server-side DATABASE_URL |
| 3 | Real URL validation, domain rules and report generation | ✅ Done | Nothing |
| 4 | Redis queue, worker, rate limits and recovery | Done: hosted integration verified | Configured |
| 5 | Google Safe Browsing with consent | Done: live API and browser verified | Configured; non-commercial use |
| 6 | Isolated redirect inspection and network safety tests | 🟡 Service and deterministic tests complete; kept off pending isolation proof | Verified egress isolation |
| 7 | Production deployment and operational checks | ⏸ Deferred by user | No hosting now |
| Optional | AI explanations | ⬜ Not required for launch | Provider API key only if requested |

Login and Google OAuth are outside the anonymous MVP. Report access will use private per-report capabilities. Never paste secrets into frontend code or commit them; setup instructions will identify a local environment file when needed.

## Step 1 — how to see it

Start two terminals in this project folder:

```powershell
npm run dev:api
```

```powershell
npm run dev
```

Open http://127.0.0.1:3000/status and press **Check API connection**. It should report **API connected · foundation**, with scans and providers shown as not implemented. Direct health endpoint: http://127.0.0.1:4000/api/health.

Optional API configuration: copy `.env.api.example` to `.env.api`; the API scripts load it. Both standard frontend origins on port 3000 are allowed by default. For a different frontend port, update FRONTEND_ORIGINS. A custom API origin also needs NEXT_PUBLIC_API_BASE_URL in `.env.local`, then restart Next.js. The default scan adapter remains mock; do not enable real scanning yet.

Implemented: Fastify startup/shutdown, explicit CORS origins, 8 KB request limit, redacted generic errors, no request logging, no-store/noindex headers, health endpoint and abortable frontend status check. The placeholder scan routes return 503 NOT_READY. No target URLs are visited; no scans are stored or analysed.

Verified: TypeScript passed; all 3 API tests passed; the Chromium frontend-to-API connection test passed. To rerun the connection test with both servers running: `$env:LINKLENS_API_TESTS="1"; npm run test:e2e -- --grep "backend foundation"`.


## Step 2 — hosted database connected

Neon PostgreSQL connected over TLS; migration 001 applied. All five integration tests passed against Neon, covering persistent reports, capability digests, indistinguishable missing/wrong/expired access, deletion and cancellation tombstones, rejected unredacted display URLs, and readiness with scan submission still disabled. Temporary test records were cleaned up. The frontend status page now checks database readiness separately from API liveness. Hosting the API itself remains step 7.

Required configuration: provider-supplied DATABASE_URL in ignored `.env.api` for setup, and subsequently in the backend host secret settings. Never use NEXT_PUBLIC_DATABASE_URL or put database passwords in chat/frontend code. No Google OAuth credentials are needed for anonymous report access. Frontend scanning remains mock and scan submissions stay disabled until analysis is implemented.


## Step 3 — structural URL analysis

POST /api/scans now validates the complete request, evaluates real structural rules and stores a redacted completed report in Neon. GET/DELETE use existing private capability access. The frontend local configuration now selects the HTTP adapter; mock fixtures remain available by setting NEXT_PUBLIC_SCAN_ADAPTER=mock and restarting Next.js. Optional redirect/reputation controls are disabled in real mode and server requests for them yield explicit unavailable checks without outbound calls. No credentials were needed for this step.

Rules: DOM-001 official-domain text outside the official domain; DOM-002 edit-distance-one or documented ASCII substitutions against a versioned ten-brand catalogue; informational IDN and IP-literal evidence; HTTP transport finding. Real domain parsing uses ICANN and private PSL boundaries with no .test override. Unknown suffixes stay incomplete. All reports remain partial; no-risk structural results are insufficient_evidence. This stage does not establish real-world detection accuracy.

Temporary API contract: synchronous structural analysis returns HTTP 201 with {id,capability,state:"completed",expiresAt}; it does not fabricate a queue state. The frontend accepts this and loads the completed report. Step 4 must add the specified 202 queued lifecycle and bounded processing, rate limits and recovery before public exposure. The API stays bound to loopback by default.

Verification: 49 unit/API checks passed, five Neon integration tests passed. Browser verification covers the real scan, reload, redacted export and deletion. Run it with both API and HTTP-mode frontend configured: `$env:LINKLENS_REAL_TESTS="1"; npm run test:e2e -- --grep "real structural scan"`. Original fixture browser journeys require mock mode.

Final step-3 checks: real HTTP-mode browser journey passed (including reload, redacted JSON export and deletion); production frontend build passed. Startup form controls now wait for client interactivity to prevent dropped pre-hydration input. Hosted backend deployment is still pending.


## Completion work — local application, hosting deferred

Added BullMQ queue/worker, atomic Redis admission, one-time transient payload claims, queue state migration, cancellation/recovery, provider-call budgets, explicit provider flags, capability discovery in the UI, Google Web Risk adapter, isolated pinned-address header transport, expanded tests, a synthetic offline evaluation and GitHub Actions checks.

Verified: five Redis/Neon integration tests, five PostgreSQL access tests, real queued browser submission/reload/export/deletion, 92 unit/API/provider/network checks, and a 12-case synthetic conformance corpus. Hosted Redis TLS connection and real Google credentials still need operator configuration. Redirect inspection stays disabled until independent egress isolation is proven. No hosting or deployment was performed. See docs/SERVER_SETUP.md for instructions and limitations.

## Portfolio completion verification

Safe Browsing replaces paid Web Risk. Consent labels, API response validation and Google advisory attribution are updated. All 92 unit/API/provider/network tests and all 11 hosted Redis/Neon integration tests passed. A real API submission queued in hosted Redis, completed Google Safe Browsing lookup of example.com, persisted in Neon, and was cleaned up. Redirect inspection remains optional and disabled pending independent network isolation; deployment remains deferred.

Final browser checks passed for structural analysis, redacted export, Safe Browsing lookup, persisted report reload and deletion. Reputation reports expire within 30 minutes; other reports within 24 hours.
