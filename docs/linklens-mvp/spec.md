# LinkLens MVP specification

Decision status: proposed defaults, ready for review. Delivery status: not implemented.

## Outcome and scope

Deliver the anonymous URL/QR analyser defined in [requirements](../../REQUIREMENTS.md), following [architecture](../../ARCHITECTURE.md). First usable release combines URL-only checks, domain visualisation, optional isolated redirect inspection, optional reputation lookup and evidence-grounded explanations. No accounts or billing in MVP. This is a security-analysis product prototype, not a payment authorisation service.

## User experience

1. Home: URL input / QR image tabs, brief explanation and examples using reserved `.test` fixtures. Live and fixture modes are visibly different.
2. QR tab: locally validate image signature, size and pixel count before decode; bound decoder runtime to 3 seconds in a worker. No QR: actionable error. Several codes: select one. Non-HTTP(S) payload: show inert text and unsupported message. Preview selected URL before submission; clear image buffers after decoding.
3. Submit: show two separate unchecked options: “Visit this link to inspect redirects” and “Send the exact link to Google Web Risk for reputation checking”. Explain privacy and possible side effects. AI uses redacted findings only. Disable unavailable options with explanation.
4. Progress: queued, analysing, completed or failed. Show individual checks without implying skipped checks passed. Poll every second with backoff after 10 seconds. On a transient polling failure keep the capability locally and offer retry; no automatic resubmission.
5. Report: verdict, coverage summary, plain-language explanation, domain breakdown, findings, redirect chain, check statuses, timestamps, limitations and JSON export. Findings use words/icons as well as colour. Domain parts are labelled, not just coloured. Show ASCII and Unicode for internationalised names. No automatic navigation or “pay now” action.
6. Report page includes delete and copy-private-report-link actions with a warning that possession of the link permits access until expiry. Keep capabilities in session storage only; explicitly copied share links carry the capability in the fragment. Use no analytics scripts on report pages and `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, `X-Robots-Tag: noindex, nofollow`.

## Parsing and inspection contract

Use one WHATWG-compatible parsing policy across services. Require explicit HTTP(S); do not silently prepend a scheme. Reject credentials, control characters, backslashes, malformed IDNA, numeric/noncanonical host encodings and single-label hosts. Valid canonical public IP literals may be analysed but get an informational finding and no registrable domain. Strip fragments before any outbound request. Preserve path and query bytes for transient inspection; do not rewrite query order or decode escaped paths. Redact path/query/fragment in stored display. Reject non-default ports for active inspection. Invalid input is distinct from an analysable URL whose network inspection is blocked.

Use a pinned Public Suffix List including its private section, recording the version. Never infer registrable domains by taking the last two labels. Unknown suffix: show hostname with domain boundaries unavailable and incomplete domain coverage. A hostname shaped like `paypal.com.attacker.test` must visually identify the attacker-controlled registrable domain under a pinned fixture suffix list, not `paypal.com`.

Active inspection follows only Location headers on 301/302/303/307/308. Resolve relative locations; reject unsupported schemes, credentials, invalid ports or malformed targets before connecting. Detect loops using canonical URL identities, never display exact secret-bearing locations. Do not follow HTML refresh, JavaScript, form actions or nested URL query parameters. HTTP 4xx/5xx may complete an observed header chain but must show the status and the absence of page-content inspection. DNS, TLS, blocked address and missing Location failures mark redirect coverage incomplete. All SSRF controls from INV-1/2 are launch requirements.

## Findings and verdict policy v1

No numerical safety score or probability. Initial catalogue is a reviewed versioned JSON file containing 10 brands, official domains and explicitly supported ASCII confusable substitutions; it is illustrative and not an exhaustive brand registry. Official-domain membership prevents only that brand's lookalike warning; it never suppresses reputation or other findings. A brand token alone in a path or query never proves impersonation.

| Rule | Level | Trigger |
|---|---|---|
| REP-001 | high | Opted-in provider reports a phishing/social-engineering, malware or unwanted-software list match; preserve returned category accurately |
| DOM-001 | high | Full official-domain token appears as hostname labels outside its official registrable domain, such as brand.com.other-domain.example |
| DOM-002 | medium | Registrable domain label is edit-distance 1 from a supported brand label of at least 5 characters, or matches its documented confusable skeleton; not an official domain |
| DOM-003 | informational | Internationalised/punycode hostname; IDN alone never raises verdict |
| URL-001 | medium | Plain HTTP appears on input or any observed hop |
| URL-002 | informational | Canonical IP-literal host |
| RED-001 | informational | Redirect crosses registrable-domain boundary; common legitimate behaviour, not independently suspicious |
| NET-001 | informational | Active inspection blocked by network safety policy; block is not evidence of fraud |

Any high/medium finding => `suspicious`, even if checks are incomplete. Otherwise `no_indicators_found` only when domain parsing, structural rules, opted-in reputation for input and every observed hop, and opted-in redirect inspection all complete. Otherwise `insufficient_evidence`. Thus URL-only scans without risk findings honestly report insufficient evidence while still providing useful structural analysis. Informational findings never independently make a verdict suspicious. Include `coverage: complete|partial` separately. Complete means this MVP's checks completed, never comprehensive safety verification. Reputation “no match” is not a clean bill of health. Provider failure or absence never becomes a no-match.

## Provider and AI contracts

Google Web Risk Lookup is the initial optional reputation adapter. Check documented threat lists; exact URLs leave the service only with consent. Never submit URLs for public crawling or threat-reporting. API key exists on server only. Configure fixed provider origins, timeout, response validation and call ceilings. Disabled/missing/quota-exhausted/failed responses produce explicit unavailable checks. No paid calls during development unless explicitly configured. Credential setup and deployment spending limits are operator prerequisites; exact current pricing is not assumed.

AI is behind a vendor-neutral adapter and defaults off. Default explanations use reviewed templates. Enabling a provider must be explicit configuration. Supply only rule IDs, severities, check statuses and already redacted bounded evidence; treat domain text as untrusted data. Never send page bodies, exact URLs or arbitrary target text. Require JSON `{summary, explanations:[{findingId,text}], limitations:[]}`. Validate size, allowed references, exact finding coverage and prohibited claims (`safe`, `verified`, guaranteed fraud). Unknown citations, schema failure, timeout or missing findings fall back to templates. Each accepted explanation has its supporting finding next to it; the original evidence is always visible. Automated checks cannot guarantee semantic fidelity, so manually evaluate misleading inference and retain template mode as the release default.

## API and persistence

- `POST /api/scans`: `{url,inputKind:"url"|"qr",inspectRedirects:false,checkReputation:false}`. QR is decoded before calling. Returns 202 `{id,capability,state:"queued",expiresAt}`. No capability in logs. Reject oversized bodies at 8 KB. Validation 400/413, throttling 429 with Retry-After, unavailable queue 503. No account API.
- `GET /api/scans/:id`: `Authorization: Bearer <capability>`; returns state or report. Unauthorized/nonexistent/expired => 404. No exact URL returned after completion.
- `DELETE /api/scans/:id`: same capability; atomically remove persisted report and transient payload, mark cancellation so active worker cannot republish, then return 204. Running network calls are aborted best effort. Retain a short-lived cancellation tombstone until worker deadline passes.
- Report JSON: `{id,state,createdAt,expiresAt,verdict,coverage,inputDisplay,domain,findings,checks,redirects,explanation,versions}`. Verdict null until completed. Error responses contain stable codes and friendly messages, never raw stack traces or target addresses containing secrets.

State transitions: queued -> running -> completed|failed; queued/running may be cancelled by deletion. Only infrastructure failure with no usable structural result is `failed`. Version report schema as v1. Browser download serialises the same redacted report to JSON. PostgreSQL and Redis lifecycle follow architecture; do not persist browser QR images. No automatic cross-user deduplication or shared report caching. Respect trusted reverse-proxy boundaries when deriving client IP; use rotating keyed hashes for counters, not raw logged IPs.

## Acceptance and proof

| ID | Done when | How to check |
|---|---|---|
| AC-1 | URL produces a report through UI/API/worker/storage | Local end-to-end scan, reload with capability, confirm same redacted result |
| AC-2 | QR decoding is local and requires preview | Valid, absent, multiple, oversized, decompression-heavy and non-URL QR fixtures; inspect browser network for image uploads |
| AC-3 | Domain boundaries and IDNA are accurate | co.uk, private suffix, unknown suffix, Unicode, mixed-script, nested official-domain and IP fixtures |
| AC-4 | Verdict policy handles missing checks honestly | Table-test every severity and coverage combination; no-match + provider timeout stays insufficient |
| AC-5 | Internal destinations cannot be contacted | Test direct/redirect private IPv4/IPv6, mapped addresses, mixed DNS answers, DNS rebinding, metadata, proxy env and encoded-host bypasses; observe zero internal connections |
| AC-6 | Redirects are bounded and evidence is correct | Fixture servers exercise relative redirects, loops, sixth redirect, malformed Location, TLS error, slow response and huge headers |
| AC-7 | Third-party consent is enforced | Provider/fetch spies receive no calls when toggles are off; exact URL only to opted-in services |
| AC-8 | AI cannot change verdict or invent accepted citations | Hostile domain text, fabricated IDs, missing findings, unsupported claims, malformed JSON, timeout and provider absence all fall back |
| AC-9 | Secrets and capabilities do not leak | Sentinel query/path/fragment and QR data absent from DB, job history, exports, app/proxy logs, telemetry and AI requests |
| AC-10 | Anonymous reports are private and expire | Wrong/missing capability => 404; expiry enforced at read; deletion during queued/running job cannot resurrect report |
| AC-11 | Abuse and failure recovery are bounded | Rate/concurrency limits, enqueue failure, duplicate delivery, worker death and provider quota fixtures |
| AC-12 | Product is usable on mobile and with keyboard | Check 360px viewport, focus order, labels, screen-reader status announcements, colour-independent evidence and escaped malicious text |
| AC-13 | Evaluation is reproducible and honest | Offline dataset manifest, grouped split, confusion matrix, per-class precision/recall, inconclusive coverage and versioned results; never claim synthetic accuracy as real-world accuracy |
| AC-14 | Deployment meets network trust boundary | Verify outbound firewall blocks internal networks independent of application validation before enabling active inspection |

No test commands exist yet. Implementation must add documented commands for lint, typecheck, unit, integration, end-to-end and offline evaluation; acceptance scenarios above define the required proof.

## Evaluation and release

Start with deterministic unit fixtures plus a separate labelled evaluation corpus. Keep adversarial synthetic fixtures separate from any real-world dataset. For real-world evaluation use legally reusable URL-only feeds with documented licence, collection time and independent label provenance; never browse threat samples merely to label them. “Popular” is not a reliable benign label. Until a reviewed corpus exists, publish synthetic-test results only. Group splits by registrable domain; if claiming unseen-domain detection, forbid domain overlap and disclose brand-catalogue membership. Add a temporal holdout when timestamps permit. Freeze rules before holdout evaluation; count insufficient results separately and report coverage alongside conditional metrics. Separate reputation-assisted results from heuristic-only results to expose label/feed leakage. No numerical detection-quality launch claim until measured.

Release gates: all security/behaviour acceptance checks pass, templates work with all providers disabled, live provider consent is verified, and production isolation is tested. Roll out URL-only/template mode first; enable network inspection only after AC-14; enable reputation after credentials and quota controls; enable AI only after manual explanation review. Any SSRF failure disables active inspection immediately.

## Open decisions

No blocking product decision for the local build: defaults above are concrete proposals. Hosting provider, paid provider credentials and a real-world evaluation corpus remain external prerequisites for those optional release capabilities. They do not block a local deterministic MVP. Human review may amend these proposals before implementation. No user approval or implementation is claimed.

## Primary references

- https://cheatsheetseries.owasp.org/cheatsheets/Server_Side_Request_Forgery_Prevention_Cheat_Sheet.html
- https://publicsuffix.org/list/
- https://docs.cloud.google.com/web-risk/docs/lookup-api
- https://cloud.google.com/security/products/web-risk
