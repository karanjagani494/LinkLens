"use client";
import { useEffect, useRef, useState } from "react";
import {
  ShieldCheck,
  Link as LinkIcon,
  QrCode,
  ArrowRight,
  ArrowUpRight,
  LockKeyhole,
  Info,
  ScanLine,
  Check,
  TriangleAlert,
  Clock,
  Download,
  Copy,
  Trash2,
  X,
  LoaderCircle,
  Search,
  Globe,
  ChevronRight,
  Shield,
  FileSearch,
} from "lucide-react";
import { service, mockMode, scenarios } from "../lib/service";
import { validateUrl } from "../lib/validation";
import { captureCapability, privateLink, statusLabel } from "../lib/privacy";
import { decodeQr } from "../lib/qr";
import { ServiceError, type Report } from "../lib/types";
const labels = {
  suspicious: "Suspicious",
  no_indicators_found: "No indicators found",
  insufficient_evidence: "Insufficient evidence",
};
export default function LinkLens({
  reportPage = false,
}: {
  reportPage?: boolean;
}) {
  const [capabilities,setCapabilities]=useState({redirects:false,reputation:false});
  useEffect(()=>{if(mockMode)return;const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),4000);fetch(`${process.env.NEXT_PUBLIC_API_BASE_URL||''}/api/health`,{signal:controller.signal,cache:'no-store',referrerPolicy:'no-referrer'}).then(r=>r.ok?r.json():Promise.reject()).then(data=>{if(!controller.signal.aborted)setCapabilities({redirects:data.capabilities?.redirects===true,reputation:data.capabilities?.reputation===true})}).catch(()=>{}).finally(()=>clearTimeout(timer));return()=>{controller.abort();clearTimeout(timer)}},[]);
  const [interactive, setInteractive] = useState(false);
  useEffect(() => setInteractive(true), []);
  const [tab, setTab] = useState<"url" | "qr">("url"),
    [url, setUrl] = useState(""),
    [inspect, setInspect] = useState(false),
    [reputation, setReputation] = useState(false),
    [scenario, setScenario] = useState("standard");
  const [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [qrBusy, setQrBusy] = useState(false),
    [values, setValues] = useState<string[]>([]),
    [fileName, setFileName] = useState("");
  const [id, setId] = useState<string | null>(null),
    [report, setReport] = useState<Report | null>(null),
    [retry, setRetry] = useState(0),
    [pollError, setPollError] = useState(false),
    [missing, setMissing] = useState(false),
    [deleted, setDeleted] = useState(false),
    [confirm, setConfirm] = useState(false),
    [deleting, setDeleting] = useState(false),
    [rateUntil, setRateUntil] = useState(0);
  const request = useRef<AbortController | null>(null),
    qrRequest = useRef<AbortController | null>(null),
    fileInput = useRef<HTMLInputElement>(null),
    dialog = useRef<HTMLDialogElement>(null),
    resultHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (reportPage) {
      const scanId = new URLSearchParams(location.search).get("id");
      if (scanId) {
        captureCapability(scanId);
        setId(scanId);
      } else setMissing(true);
    }
    return () => {
      request.current?.abort();
      qrRequest.current?.abort();
    };
  }, [reportPage]);
  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const started = Date.now();
    setPollError(false);
    setError("");
    const cap = captureCapability(id);
    if (!cap) {
      setMissing(true);
      return;
    }
    const poll = async () => {
      try {
        const result = await service.get(id, cap, controller.signal);
        if (controller.signal.aborted) return;
        setReport(result);
        setBusy(false);
        if (result.state === "queued" || result.state === "running") {
          if (Date.now() - started > 45000) {
            setError("Polling time limit reached. Retry to resume this scan.");
            setPollError(true);
            return;
          }
          timer = setTimeout(poll, Date.now() - started > 10000 ? 2500 : 1000);
        } else resultHeading.current?.focus();
      } catch (e) {
        if (controller.signal.aborted) return;
        setBusy(false);
        if (e instanceof ServiceError && e.code === "NOT_FOUND")
          setMissing(true);
        else {
          setError(e instanceof Error ? e.message : "Could not load the scan.");
          setPollError(true);
        }
      }
    };
    poll();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [id, retry]);
  useEffect(() => {
    if (confirm) dialog.current?.showModal();
    else dialog.current?.close();
  }, [confirm]);
  useEffect(() => {
    if (!rateUntil) return;
    const timer = setTimeout(() => setRateUntil(0), Math.max(0, rateUntil - Date.now()));
    return () => clearTimeout(timer);
  }, [rateUntil]);
  useEffect(() => {
    const onBack = () => {
      request.current?.abort();
      const next = new URLSearchParams(location.search).get('id');
      setId(next); setReport(null); setMissing(false); setDeleted(false); setError(''); setBusy(false);
      if (next) captureCapability(next);
    };
    addEventListener('popstate', onBack);
    return () => removeEventListener('popstate', onBack);
  }, []);
  function reset() {
    request.current?.abort();
    qrRequest.current?.abort();
    setId(null);
    setReport(null);
    setMissing(false);
    setDeleted(false);
    setError("");
    setMessage("");
    setBusy(false);
    history.pushState(null, "", "/");
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const problem = validateUrl(url);
    if (problem) {
      setError(problem);
      return;
    }
    if (tab === "qr" && !values.length) {
      setError("Choose and decode a QR image first.");
      return;
    }
    setError("");
    setMessage("");
    setBusy(true);
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    try {
      const receipt = await service.create(
        {
          url,
          inputKind: tab,
          inspectRedirects: inspect,
          checkReputation: reputation,
        },
        controller.signal,
        scenario,
      );
      sessionStorage.setItem(`linklens:cap:${receipt.id}`, receipt.capability);
      history.pushState(null, "", `/report?id=${receipt.id}`);
      setId(receipt.id);
      setMissing(false);
      setDeleted(false);
    } catch (e) {
      if (controller.signal.aborted) return;
      setError(e instanceof Error ? e.message : "The service is unavailable.");
      if (e instanceof ServiceError && e.retryAfter)
        setRateUntil(Date.now() + e.retryAfter * 1000);
      setBusy(false);
    }
  }
  async function upload(file?: File) {
    if (!file) return;
    qrRequest.current?.abort();
    const controller = new AbortController();
    qrRequest.current = controller;
    setValues([]);
    setUrl("");
    setFileName(file.name);
    setError("");
    setQrBusy(true);
    try {
      const results = await decodeQr(file, controller.signal);
      if (controller.signal.aborted) return;
      setValues(results);
      if (results.length === 1) setUrl(results[0]);
    } catch (e) {
      if (!controller.signal.aborted)
        setError(e instanceof Error ? e.message : "Invalid image.");
    } finally {
      if (!controller.signal.aborted) setQrBusy(false);
    }
  }
  function removeImage() {
    qrRequest.current?.abort();
    setQrBusy(false);
    setValues([]);
    setFileName("");
    setUrl("");
    setError("");
    if (fileInput.current) fileInput.current.value = "";
  }
  function demo(value: string) {
    setScenario(value);
    setUrl(
      value === "lookalike"
        ? "https://paypal.com.account-review.test/checkout"
        : value === "blocked"
          ? "https://internal.example.test/"
          : "https://checkout.example.test/payment",
    );
    setInspect(!["standard", "skipped"].includes(value));
    setReputation(!["standard", "skipped"].includes(value));
    setTab("url");
    setError("");
  }
  async function copy() {
    if (!id) return;
    try {
      const cap = captureCapability(id);
      if (!cap) throw Error();
      await navigator.clipboard.writeText(privateLink(id, cap));
      setMessage(
        "Private report link copied. Anyone with this link can access the report until expiry.",
      );
    } catch {
      setMessage(
        "Clipboard unavailable. Check your browser clipboard permission.",
      );
    }
  }
  function download() {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], {
      type: "application/json",
    });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `linklens-${report.id}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(href), 1000);
  }
  async function deleteReport() {
    if (!id) return;
    setDeleting(true);
    const controller = new AbortController();
    request.current = controller;
    try {
      await service.delete(id, captureCapability(id) || "", controller.signal);
      sessionStorage.removeItem(`linklens:cap:${id}`);
      setConfirm(false);
      setId(null);
      setReport(null);
      setDeleted(true);
      setError("");
      history.replaceState(null, "", "/report");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Deletion failed.");
      setConfirm(false);
    } finally {
      setDeleting(false);
    }
  }
  const inProgress =
    report && (report.state === "queued" || report.state === "running");
  const completed = report?.state === "completed";
  return (
    <>
      <header className="topbar">
        <div className="shell nav">
          <a className="brand" href="/" aria-label="LinkLens home">
            <span className="brand-mark">
              <ScanLine size={23} />
            </span>
            LinkLens
          </a>
          <nav aria-label="Main navigation">
            <a href="/" className="nav-active">
              Analyse a link
            </a>
            <a href="/#how-it-works">
              How it works <ArrowUpRight size={13} />
            </a>
          </nav>
          <span className="privacy-note">
            <LockKeyhole size={14} /> Private by design
          </span>
        </div>
      </header>
      {mockMode && (
        <div className="demo-banner">
          <span className="demo-dot" />
          <strong>Demo mode</strong>
          <span className="banner-dash">—</span> simulated results. No links are
          visited or sent to providers.
          
        </div>
      )}
      {!mockMode && <div className="demo-banner"><Shield size={13}/><strong>Link analysis</strong><span>· Only the optional checks you select are performed.</span></div>}
      <main className="shell">
        <div className="breadcrumb">
          <Shield size={13} /> WORKSPACE <ChevronRight size={12} />
          <span>{id ? "Analysis report" : "New analysis"}</span>
        </div>
        {!id && !missing && !deleted && (
          <>
            <section className="intro">
              <span className="eyebrow"><span className="intro-dot" /> PAYMENT LINK + QR ANALYSIS</span>
              <h1>CHECK THE LINK.<br /><span>BEFORE YOU PAY.</span></h1>
              <p>
                A payment link deserves a second look. Unpack the domain, check the indicators, and read the evidence before you make your next move.
              </p>
              <div className="hero-art" aria-hidden="true"><div className="art-grid" /><div className="art-lens"><ScanLine size={65} strokeWidth={1.3}/></div><div className="art-label">LINKS. QR CODES. EVIDENCE.</div><span className="art-star">✳</span></div>
            </section>
            <div className="workspace">
              <section className="scan-card" aria-labelledby="scan-title">
                <div className="card-heading">
                  <div className="heading-icon">
                    <Search size={21} />
                  </div>
                  <div>
                    <h2 id="scan-title">What would you like to inspect?</h2>
                    <p>Start with a link or a QR code image.</p>
                  </div>
                  <span className="input-badge"><LockKeyhole size={12} /> Private input</span>
                </div>
                <div className="tabs" role="tablist" aria-label="Input type">
                  <button
                    role="tab"
                    id="url-tab"
                    aria-controls="input-panel"
                    aria-selected={tab === "url"}
                    tabIndex={tab === "url" ? 0 : -1}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                        setTab("qr");
                        setUrl("");
                        document.getElementById("qr-tab")?.focus();
                      }
                    }}
                    onClick={() => {
                      setTab("url");
                      setUrl("");
                      setError("");
                    }}
                  >
                    <LinkIcon size={17} /> Paste a link
                  </button>
                  <button
                    role="tab"
                    id="qr-tab"
                    aria-controls="input-panel"
                    aria-selected={tab === "qr"}
                    tabIndex={tab === "qr" ? 0 : -1}
                    onKeyDown={(e) => {
                      if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                        setTab("url");
                        setUrl("");
                        document.getElementById("url-tab")?.focus();
                      }
                    }}
                    onClick={() => {
                      setTab("qr");
                      setUrl(values.length === 1 ? values[0] : "");
                      setError("");
                    }}
                  >
                    <QrCode size={18} /> Upload QR code
                  </button>
                </div>
                <form onSubmit={submit} noValidate>
                  <div
                    role="tabpanel"
                    id="input-panel"
                    aria-labelledby={`${tab}-tab`}
                  >
                    {tab === "url" ? (
                      <div className="input-area">
                        <label htmlFor="target">
                          Payment link or website URL
                        </label>
                        <div className={`url-field ${error ? "invalid" : ""}`}>
                          <LinkIcon size={19} />
                          <input
                            id="target"
                            disabled={!interactive}
                            type="text"
                            inputMode="url"
                            autoComplete="off"
                            spellCheck={false}
                            placeholder="https://example.com/payment"
                            value={url}
                            onChange={(e) => {
                              setUrl(e.target.value);
                              setError("");
                            }}
                            aria-describedby="url-help input-error"
                            aria-invalid={!!error}
                          />
                        </div>
                        <p className="field-help" id="url-help">
                          Include https:// or http://. Your link is never opened
                          automatically.
                        </p>
                      </div>
                    ) : (
                      <div className="input-area">
                        <label className="upload-zone">
                          <QrCode size={32} />
                          <strong>
                            {qrBusy
                              ? "Decoding on your device…"
                              : "Choose a QR code image"}
                          </strong>
                          <span>PNG, JPEG or WebP · up to 5 MB · 16 MP</span>
                          <input
                            ref={fileInput}
                            aria-label="QR code image"
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={(e) => upload(e.target.files?.[0])}
                          />
                        </label>
                        {fileName && (
                          <div className="file-line">
                            <span>{fileName}</span>
                            <button
                              type="button"
                              onClick={removeImage}
                              aria-label="Remove QR image"
                            >
                              <X size={16} />
                            </button>
                          </div>
                        )}
                        {values.length > 0 && (
                          <div className="qr-preview">
                            <label htmlFor="decoded">
                              {values.length > 1
                                ? "Multiple codes found — select one"
                                : "Decoded value — review before submitting"}
                            </label>
                            {values.length > 1 ? (
                              <select
                                id="decoded"
                                value={url}
                                onChange={(e) => setUrl(e.target.value)}
                              >
                                <option value="">Choose a QR value</option>
                                {values.map((v) => (
                                  <option value={v} key={v}>
                                    {v}
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <code id="decoded">{values[0]}</code>
                            )}
                            {url && validateUrl(url) && (
                              <p className="error">
                                Unsupported payload: {validateUrl(url)}
                              </p>
                            )}
                            <p className="field-help">
                              The image stays on your device. Nothing is opened
                              automatically.
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="consent-area">
                    <div className="section-label">
                      OPTIONAL CHECKS <span>YOU’RE IN CONTROL</span>
                    </div>
                    <label className="consent">
                      <input
                        type="checkbox"
                        disabled={!mockMode&&!capabilities.redirects}
                        checked={inspect}
                        onChange={(e) => setInspect(e.target.checked)}
                      />
                      <span>
                        <strong>Visit this link to inspect redirects</strong>
                        <small>
                          {mockMode || capabilities.redirects ? 'Observe where the link leads. Visiting may trigger activity.' : 'Unavailable on this server. This link will not be visited.'}
                        </small>
                      </span>
                      <Globe size={18} />
                    </label>
                    <label className="consent">
                      <input
                        type="checkbox"
                        disabled={!mockMode&&!capabilities.reputation}
                        checked={reputation}
                        onChange={(e) => setReputation(e.target.checked)}
                      />
                      <span>
                        <strong>
                          Check the link with Google Safe Browsing
                        </strong>
                        <small>
                          {mockMode || capabilities.reputation ? 'Sends the exact URL to Google. May miss threats or flag safe sites.' : 'Unavailable on this server. No URL is sent to Google.'}
                        </small>
                      </span>
                      <ShieldCheck size={18} />
                    </label>
                    <div className="privacy-callout">
                      <Info size={16} />
                      <p>
                        Links can contain private payment tokens. Optional
                        checks share or visit the exact link only with your
                        consent.
                        {mockMode &&
                          " In demo mode, these checks are simulated."}
                      </p>
                    </div>
                  </div>
                  {error && (
                    <p
                      className="error form-error"
                      role="alert"
                      id="input-error"
                    >
                      <TriangleAlert size={17} />
                      {error}
                    </p>
                  )}
                  <div className="submit-area">
                    <button
                      className="primary"
                      type="submit"
                      disabled={!interactive || busy || qrBusy || Date.now() < rateUntil}
                    >
                      {busy ? (
                        <LoaderCircle className="spin" size={18} />
                      ) : (
                        <ScanLine size={18} />
                      )}{" "}
                      {busy ? "Creating analysis…" : "Analyse link"}
                      <ArrowRight size={18} />
                    </button>
                    <p>
                      <LockKeyhole size={12} /> No account needed. Reports
                      expire within 24 hours (30 minutes with reputation checks).
                    </p>
                  </div>
                </form>
              </section>
              <aside className="side-panel">
                <div className="side-panel-header"><Globe size={18} /><span>Reading a domain</span></div>
                <h2>The name that matters<br />isn’t always the familiar one.</h2>
                <p>Brand names can appear anywhere in a link. Start with the registrable domain.</p>
                <div className="domain-example" aria-label="Illustrative domain example, not a scan result">
                  <span className="example-label">ILLUSTRATIVE EXAMPLE</span>
                  <div className="example-host"><span>paypal.com.</span><strong>account-review.test</strong></div>
                  <div className="domain-annotation"><span /><p>Actual registrable domain</p></div>
                  <div className="example-key"><span>Subdomain</span><span>Domain + suffix</span></div>
                </div>
                <div className="side-checklist">
                  <div><Search size={16} /><p><strong>Look beyond the brand name</strong><span>A familiar subdomain does not establish ownership.</span></p></div>
                  <div><FileSearch size={16} /><p><strong>Read findings with their limits</strong><span>Indicators explain what was observed and what it does not prove.</span></p></div>
                  <div><LockKeyhole size={16} /><p><strong>Choose what leaves your device</strong><span>QR images stay local. Optional checks require your consent.</span></p></div>
                </div>
                <div className="side-foot"><Info size={16}/><p>LinkLens does not verify merchants or authorise payments.</p></div>
              </aside>
            </div>
            {mockMode && (
              <details className="demo-controls">
                <summary>
                  <span>
                    <ScanLine size={16} /> Explore a simulated scenario
                  </span>
                  <span>Sample reports <ChevronRight size={13} /></span>
                </summary>
                <div>
                  <label htmlFor="scenario">
                    Fixture scenario (separate from real analysis)
                  </label>
                  <select
                    id="scenario"
                    value={scenario}
                    onChange={(e) => demo(e.target.value)}
                  >
                    {scenarios.map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <p>
                    Selecting a fixture fills a reserved example URL and
                    explicitly sets the optional demo checks. Review before
                    submitting.
                  </p>
                </div>
              </details>
            )}
            <section id="how-it-works" className="how">
              <div>
                <span className="eyebrow">HOW IT WORKS</span>
                <h2>From link to evidence.</h2>
              </div>
              <div className="how-step">
                <span>1</span>
                <h3>Share the input</h3>
                <p>Paste a URL or decode a QR image locally.</p>
              </div>
              <div className="how-step">
                <span>2</span>
                <h3>Choose your checks</h3>
                <p>
                  Structural analysis first. Optional visits and reputation
                  checks need your consent.
                </p>
              </div>
              <div className="how-step">
                <span>3</span>
                <h3>Read the evidence</h3>
                <p>
                  Review findings and coverage, then decide what to do next.
                </p>
              </div>
            </section>
          </>
        )}
        {id && !missing && (
          <section className="report-wrap">
            <div className="report-title">
              <div>
                <span className="eyebrow">LINK ANALYSIS</span>
                <h1>{completed ? "Analysis report" : "Link analysis"}</h1>
              </div>
              <button className="secondary" onClick={reset}>
                New analysis <ArrowRight size={16} />
              </button>
            </div>
            {error && (
              <div className="error-box" role="alert">
                <TriangleAlert size={22} />
                <div>
                  <strong>
                    {pollError
                      ? "Analysis connection interrupted"
                      : "Action could not complete"}
                  </strong>
                  <p>{error}</p>
                  {pollError && (
                    <button
                      className="secondary"
                      onClick={() => setRetry((r) => r + 1)}
                    >
                      Retry status check
                    </button>
                  )}
                  <small>
                    Retry resumes this report; it does not submit another scan.
                  </small>
                </div>
              </div>
            )}
            {!report && !error && (
              <div className="empty" role="status">
                <LoaderCircle size={32} className="spin" />
                <h2>Loading your private report…</h2>
              </div>
            )}
            {inProgress && (
              <section className="panel progress" aria-live="polite">
                <div className="progress-icon">
                  <LoaderCircle size={30} className="spin" />
                </div>
                <span className="eyebrow">
                  {report.state === "queued" ? "QUEUED" : "ANALYSING"}
                </span>
                <h2 ref={resultHeading} tabIndex={-1}>
                  {report.state === "queued"
                    ? "Your scan is in the queue."
                    : "Putting the evidence together."}
                </h2>
                <p>
                  {mockMode
                    ? "Simulating analysis of the reserved fixture."
                    : "The service is analysing the URL with your selected checks."}
                </p>
                <div className="progress-track">
                  <span
                    className={report.state === "running" ? "running" : ""}
                  />
                </div>
                <div className="checks">
                  {report.checks.map((c, i) => (
                    <div className="check-row" key={c.name}>
                      <span>{c.name}</span>
                      <span className="status pending">
                        {c.status === "skipped"
                          ? "Skipped"
                          : report.state === "queued"
                            ? "Queued"
                            : i < 2
                              ? "Analysing"
                              : "Waiting"}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {report?.state === "failed" && (
              <div className="empty">
                <TriangleAlert size={36} />
                <h2>Processing could not complete.</h2>
                <p>
                  No usable report was produced. You can explicitly start a
                  fresh analysis.
                </p>
                <button className="primary" onClick={reset}>
                  Start again <ArrowRight size={16} />
                </button>
              </div>
            )}
            {completed && (
              <>
                <section className={`verdict-card ${report.verdict}`}>
                  <div className="verdict-icon">
                    {report.verdict === "suspicious" ? (
                      <TriangleAlert size={30} />
                    ) : report.verdict === "no_indicators_found" ? (
                      <Check size={30} />
                    ) : (
                      <Info size={30} />
                    )}
                  </div>
                  <div>
                    <span className="eyebrow">
                      {mockMode ? "SIMULATED VERDICT" : "ANALYSIS VERDICT"}
                    </span>
                    <h2 ref={resultHeading} tabIndex={-1}>
                      {report.verdict ? labels[report.verdict] : ""}
                    </h2>
                    <p>{report.explanation.summary}</p>
                  </div>
                  <span className="coverage">
                    {report.coverage === "complete" ? (
                      <Check size={14} />
                    ) : (
                      <Info size={14} />
                    )}{" "}
                    {report.coverage} coverage
                  </span>
                </section>
                <div className="report-grid">
                  <div>
                    <section className="panel">
                      <div className="panel-title">
                        <h3>
                          <Globe size={18} /> The domain, decoded
                        </h3>
                        <span>STRUCTURAL ANALYSIS</span>
                      </div>
                      <code className="inert-url">{report.inputDisplay}</code>
                      <div className="domain-focus">
                        <small>ACTUAL REGISTRABLE DOMAIN</small>
                        <strong>
                          {report.domain.registrableDomain ||
                            "Domain boundaries unavailable"}
                        </strong>
                      </div>
                      <dl className="domain-parts">
                        <div>
                          <dt>Scheme</dt>
                          <dd>{report.domain.scheme}</dd>
                        </div>
                        <div>
                          <dt>Subdomain</dt>
                          <dd>{report.domain.subdomain || "None"}</dd>
                        </div>
                        <div>
                          <dt>Registrable domain</dt>
                          <dd>
                            {report.domain.registrableDomain ||
                              "Unavailable / IP literal"}
                          </dd>
                        </div>
                        <div>
                          <dt>Public suffix</dt>
                          <dd>{report.domain.publicSuffix || "Unknown"}</dd>
                        </div>
                        <div>
                          <dt>ASCII hostname</dt>
                          <dd>{report.domain.hostname}</dd>
                        </div>
                        <div>
                          <dt>Unicode hostname</dt>
                          <dd>{report.domain.unicode}</dd>
                        </div>
                      </dl>
                      <p className="note">
                        <Info size={15} /> A brand name in a subdomain does not
                        establish ownership. Read the registrable domain first.
                      </p>
                    </section>
                    <section className="panel">
                      <div className="panel-title">
                        <h3>
                          <FileSearch size={18} /> Findings & evidence
                        </h3>
                        <span>{report.findings.length} FINDINGS</span>
                      </div>
                      {!report.findings.length ? (
                        <div className="no-findings">
                          <Search size={25} />
                          <p>No indicators detected by the available checks.</p>
                          <small>
                            Review coverage; incomplete checks have not passed.
                          </small>
                        </div>
                      ) : (
                        report.findings.map((f) => (
                          <article
                            key={`${f.id}:${f.observed}`}
                            className={`finding ${f.severity}`}
                          >
                            <div className="finding-top">
                              <span>
                                {f.severity === "informational" ? (
                                  <Info size={15} />
                                ) : (
                                  <TriangleAlert size={15} />
                                )}{" "}
                                {f.severity}
                              </span>
                              <code>{f.id}</code>
                            </div>
                            <h4>{f.observed}</h4>
{f.id === "REP-001" && <p><a href="https://developers.google.com/safe-browsing/v4/advisory" target="_blank" rel="noreferrer">Advisory provided by Google</a>. Possible threat observed at scan time. This saved report is a historical snapshot; rescan for current information. Safe sites may be flagged and threats may be missed. <a href="https://developers.google.com/search/docs/monitor-debug/security/social-engineering" target="_blank" rel="noreferrer">About threats</a>.</p>}
                            <p>
                              <strong>Why it matters</strong>
                              {f.why}
                            </p>
                            <p>
                              <strong>What it does not prove</strong>
                              {f.limitation}
                            </p>
                          </article>
                        ))
                      )}
                    </section>
                    {report.redirects.length > 0 && (
                      <section className="panel">
                        <h3>Observed redirect chain</h3>
                        <ol className="redirects">
                          {report.redirects.map((r, i) => (
                            <li key={i}>
                              <span className="status">HTTP {r.status}</span>
                              <code>{r.url}</code>
                              <p>{r.outcome}</p>
                            </li>
                          ))}
                        </ol>
                      </section>
                    )}
                  </div>
                  <aside>
                    <section className="panel">
                      <h3>Check coverage</h3>
                      <p className="muted">
                        {report.coverage === "complete"
                          ? "This MVP’s checks completed. Coverage is not comprehensive safety verification."
                          : "Skipped, blocked or unavailable checks limit this report."}
                      </p>
                      <div className="checks">
                        {report.checks.map((c) => (
                          <div className="report-check" key={c.name}>
                            <div>
                              <strong>{c.name}</strong>
                              <span className={`status ${c.status}`}>
                                {c.status === "passed" ? (
                                  <Check size={12} />
                                ) : c.status === "finding" ? (
                                  <TriangleAlert size={12} />
                                ) : (
                                  <Info size={12} />
                                )}{" "}
                                {statusLabel[c.status]}
                              </span>
                            </div>
                            <p>{c.reason}</p>
                          </div>
                        ))}
                      </div>
                    </section>
                    <section className="panel report-actions">
                      <h3>Your private report</h3>
                      <button className="secondary" onClick={download}>
                        <Download size={16} /> Download redacted JSON
                      </button>
                      <button className="secondary" onClick={copy}>
                        <Copy size={16} /> Copy private report link
                      </button>
                      <p className="muted">
                        Anyone possessing a private link can access the report
                        until expiry. Demo sharing works only within this
                        browser session.
                      </p>
                      <button
                        className="delete-button"
                        onClick={() => setConfirm(true)}
                      >
                        <Trash2 size={15} /> Delete this report
                      </button>
                    </section>
                    <section className="panel metadata">
                      <h3>Report details</h3>
                      <dl>
                        <dt>Scanned</dt>
                        <dd>{new Date(report.createdAt).toLocaleString()}</dd>
                        <dt>Expires</dt>
                        <dd>{new Date(report.expiresAt).toLocaleString()}</dd>
                        {Object.entries(report.versions).map(([k, v]) => (
                          <div key={k}>
                            <dt>{k} version</dt>
                            <dd>{v}</dd>
                          </div>
                        ))}
                        <dt>Explanation</dt>
                        <dd>{report.explanation.source}</dd>
                      </dl>
                    </section>
                  </aside>
                </div>
                <section className="limitations">
                  <Info size={21} />
                  <div>
                    <h3>Every analysis has limits.</h3>
                    {report.explanation.limitations.map((l) => (
                      <p key={l}>{l}</p>
                    ))}
                    <p>
                      Report access control, expiry, deletion and network
                      isolation require backend and deployment enforcement.
                      Browser demo controls simulate these behaviours.
                    </p>
                  </div>
                </section>
              </>
            )}
          </section>
        )}
        {(missing || deleted) && (
          <section className="empty">
            <div className="heading-icon">
              {deleted ? <Trash2 size={30} /> : <LockKeyhole size={30} />}
            </div>
            <h1>{deleted ? "Report deleted." : "Report unavailable."}</h1>
            <p>
              {deleted
                ? "The simulated report and its session capability have been removed."
                : "This report may be expired, deleted, or unavailable. Open the original private link in a session that has access."}
            </p>
            <button className="primary" onClick={reset}>
              Start a new analysis <ArrowRight size={17} />
            </button>
          </section>
        )}
        {message && (
          <div className="toast" role="status">
            <Info size={17} />
            {message}
            <button aria-label="Dismiss message" onClick={() => setMessage("")}>
              <X size={16} />
            </button>
          </div>
        )}
      </main>
      <footer className="shell footer">
        <span className="footer-brand">
          <ScanLine size={16} /> LinkLens
        </span>
        <p>
          Verify payment requests independently before sending money.
        </p>
        <span>
          <LockKeyhole size={12} /> No tracking. No accounts.
        </span>
      </footer>
      <dialog
        ref={dialog}
        onCancel={() => setConfirm(false)}
        onClose={() => setConfirm(false)}
        aria-labelledby="delete-title"
      >
        <div className="dialog-icon">
          <Trash2 size={25} />
        </div>
        <h2 id="delete-title">Delete this report?</h2>
        <p>
          This removes the report and its private access link. This action
          cannot be undone.
        </p>
        <div className="dialog-actions">
          <button
            autoFocus
            className="secondary"
            onClick={() => setConfirm(false)}
            disabled={deleting}
          >
            Keep report
          </button>
          <button className="danger" onClick={deleteReport} disabled={deleting}>
            {deleting ? "Deleting…" : "Delete report"}
          </button>
        </div>
      </dialog>
    </>
  );
}
