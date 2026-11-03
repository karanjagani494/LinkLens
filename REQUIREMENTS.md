# LinkLens requirements

Decision status: proposed defaults for review. Delivery status: not implemented.

LinkLens helps a person understand suspicious HTTP(S) links and QR codes. It reports observable indicators, not whether a merchant or transaction is legitimate. Initial audience: individual users and recruiters reviewing a portfolio demo. English only; mobile and desktop web.

- REQ-1: Accept one explicit HTTP(S) URL, maximum 4,096 UTF-8 bytes, or one PNG/JPEG/WebP QR image, maximum 5 MB and 16 megapixels. No SVG, PDF, animated images, file URLs, payment URI schemes, or bulk input.
- REQ-2: Decode QR images locally in the browser. Show extracted text before submission; if several QR values exist, require selection. Never automatically visit a decoded link. Images never leave the device.
- REQ-3: Default to URL-only analysis. Separately offer consent to active inspection and to sending the exact URL to a reputation provider. Explain that a URL can contain private payment tokens and visiting it may trigger activity. Neither optional capability is selected by default.
- REQ-4: Display exactly one verdict: suspicious, no indicators found, or insufficient evidence. Show coverage separately. Never label a link safe, verified, or guaranteed fraudulent.
- REQ-5: Explain the scheme, Unicode and ASCII hostname, subdomain, registrable domain and suffix; highlight lookalike indicators and show redirect hops when inspected. URLs are inert text, never clickable links.
- REQ-6: Every finding has a stable rule ID, severity, observed evidence, explanation and limitation. Failed/skipped checks remain visible. Include rule-set, brand-catalogue, suffix-list and scan timestamps/versions.
- REQ-7: Active inspection cannot access internal networks, credentials, metadata endpoints or arbitrary protocols. It never runs JavaScript, submits forms, accepts cookies or downloads page bodies.
- REQ-8: AI may explain structured, redacted findings only. Verdicts and finding severity never depend on AI. Missing AI service must not prevent a report.
- REQ-9: Anonymous reports use an unguessable per-report capability, are excluded from indexing and public listings, and expire after 24 hours. No URL query values, fragments, credentials, QR images or raw target response bodies persist in reports/logs. Transient exact URLs expire on completion or within 5 minutes.
- REQ-10: Limit each client to 5 submissions/minute and 30/day; maximum 2 active jobs/client and 4 globally for the initial deployment. Display retry guidance on throttling. These are initial operating limits, not capacity claims.
- REQ-11: Provide reproducible security fixtures and an offline evaluation harness. Publish measured precision, recall, coverage and limitations without inventing performance numbers.
- REQ-12: Development and demo operate without external API keys using deterministic rules and conspicuously labelled fixtures. Live network/provider checks must never be simulated without a visible label.

Excluded: accounts, subscriptions, payment processing, merchant verification, browser extensions, business API keys, public scan search, screenshots, page-content classification, WHOIS/domain-age inference, machine-learning training, automatic blocking and mobile apps.
