// File note: This file handles App.jsx.

import { useEffect, useState } from "react";

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL ||
  (import.meta.env.PROD
    ? window.location.origin
    : "http://localhost:3000")
).replace(/\/$/, "");
const NAVIGATION = [
  ["dashboard", "Overview", "01"],
  ["incidents", "Verified incidents", "02"],
  ["ingestion-runs", "Ingestion history", "03"],
  ["sources", "Trusted sources", "04"],
  ["system-status", "System status", "05"],
];

async function request(path, token, options = {}) {
  const response = await fetch(`${API_BASE}/api/admin${path}`, {
    ...options,
    headers: {
      ...(options.body ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || payload?.success !== true) {
    throw new Error(
      payload?.message || "The admin API could not complete this request.",
    );
  }
  return payload.data;
}

function App() {
  const [token, setToken] = useState(() => {
    try {
      return window.sessionStorage.getItem("urban-danger-admin-token");
    } catch {
      return null;
    }
  });
  const [view, setView] = useState("dashboard");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [incidentDetail, setIncidentDetail] = useState(null);
  const [scanStatus, setScanStatus] = useState("IDLE");
  const [scanAfterRunId, setScanAfterRunId] = useState(null);
  const [scanRunId, setScanRunId] = useState(null);
  const [scanCandidates, setScanCandidates] = useState([]);
  const [scanStats, setScanStats] = useState(null);
  const [scanMessage, setScanMessage] = useState("");
  const [scanCandidateDetail, setScanCandidateDetail] = useState(null);
  const [approvalCandidate, setApprovalCandidate] = useState(null);
  const [reviewingCandidateId, setReviewingCandidateId] = useState(null);
  const [filters, setFilters] = useState({
    category: "",
    severity: "",
    barangay: "",
    from: "",
    to: "",
    source: "",
    q: "",
  });
  const [login, setLogin] = useState({ email: "", password: "" });

  useEffect(() => {
    if (!token) return undefined;
    let active = true;
    setLoading(true);
    setError("");
    const query =
      view === "incidents"
        ? `?${new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([, value]) => value)))}&limit=100`
        : "";
    request(`/${view}${query}`, token)
      .then((result) => {
        if (active) setData(result);
      })
      .catch((failure) => {
        if (!active) return;
        setError(failure.message);
        if (failure.message.includes("authentication")) {
          setToken(null);
          window.sessionStorage.removeItem("urban-danger-admin-token");
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, view, filters]);

  useEffect(() => {
    if (!token || scanStatus !== "RUNNING" || scanAfterRunId === null) {
      return undefined;
    }
    let active = true;
    let timeoutId;
    const deadline = Date.now() + 15 * 60 * 1000;

    async function pollRun() {
      try {
        const history = await request(
          `/ingestion-runs?source=MANUAL&afterId=${encodeURIComponent(scanAfterRunId)}&limit=1`,
          token,
        );
        const run = history.items?.[0];
        if (run && run.status !== "RUNNING") {
          let reports = [];
          let reportError = "";
          try {
            reports = await request(
              `/scan-candidates?runId=${encodeURIComponent(run.id)}`,
              token,
            );
          } catch (failure) {
            reportError = `Scan completed, but reports could not be loaded: ${failure.message}`;
          }
          if (!active) return;
          setScanStats(run);
          setScanRunId(Number(run.id));
          setScanCandidates(reports);
          setScanStatus(
            run.status === "FAILED" || run.status === "SKIPPED"
              ? "FAILED"
              : "COMPLETED",
          );
          setScanMessage(
            run.status === "SKIPPED"
              ? "Another ingestion run already held the shared lock."
              : run.errorMessage || reportError,
          );
          if (view === "dashboard") {
            const dashboard = await request("/dashboard", token);
            if (active) setData(dashboard);
          }
          return;
        }
        if (Date.now() >= deadline) {
          if (active) {
            setScanStatus("FAILED");
            setScanMessage(
              "No completed manual run was recorded before timeout.",
            );
          }
          return;
        }
      } catch (failure) {
        if (active) {
          setScanStatus("FAILED");
          setScanMessage(failure.message);
        }
        return;
      }
      if (active) timeoutId = window.setTimeout(pollRun, 2000);
    }

    pollRun();
    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [token, scanStatus, scanAfterRunId, view]);

  useEffect(() => {
    if (!token || scanStatus === "RUNNING" || scanRunId !== null) {
      return undefined;
    }
    let active = true;

    async function restoreLatestManualScan() {
      try {
        const history = await request(
          "/ingestion-runs?source=MANUAL&limit=1",
          token,
        );
        const run = history.items?.[0];
        if (!run) return;
        if (run.status === "RUNNING") {
          setScanAfterRunId(Number(run.id) - 1);
          setScanStatus("RUNNING");
          return;
        }

        const reports =
          run.status === "SKIPPED"
            ? []
            : await request(
                `/scan-candidates?runId=${encodeURIComponent(run.id)}`,
                token,
              );
        if (!active) return;
        setScanStats(run);
        setScanRunId(Number(run.id));
        setScanCandidates(reports);
        setScanStatus(
          run.status === "FAILED" || run.status === "SKIPPED"
            ? "FAILED"
            : "COMPLETED",
        );
        setScanMessage(run.errorMessage || "");
      } catch (failure) {
        if (active) setError(failure.message);
      }
    }

    restoreLatestManualScan();
    return () => {
      active = false;
    };
  }, [token, scanStatus, scanRunId]);

  async function signIn(event) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await request("/login", null, {
        method: "POST",
        body: JSON.stringify(login),
      });
      setToken(result.token);
      window.sessionStorage.setItem("urban-danger-admin-token", result.token);
      setLogin({ email: "", password: "" });
    } catch (failure) {
      setError(failure.message);
    } finally {
      setLoading(false);
    }
  }

  async function openIncident(id) {
    try {
      setIncidentDetail(await request(`/incidents/${id}`, token));
    } catch (failure) {
      setError(failure.message);
    }
  }

  async function runScan() {
    setScanAfterRunId(null);
    setScanRunId(null);
    setScanCandidates([]);
    setScanStatus("RUNNING");
    setScanStats(null);
    setScanMessage("");
    try {
      const result = await request("/run-scan", token, { method: "POST" });
      if (result.status === "RUNNING") {
        setScanAfterRunId(result.afterRunId);
        return;
      }
      setScanStats(result.summary || null);
      setScanStatus(result.status === "COMPLETED" ? "COMPLETED" : "FAILED");
      setScanMessage(
        result.category === "already_running"
          ? "Another ingestion run already held the shared lock."
          : result.category
            ? `Scan failed (${result.category}).`
            : "",
      );
      if (result.status === "COMPLETED" && result.runId) {
        setScanRunId(Number(result.runId));
        setScanCandidates(
          await request(
            `/scan-candidates?runId=${encodeURIComponent(result.runId)}`,
            token,
          ),
        );
      }
      if (result.status === "COMPLETED" && view === "dashboard") {
        setData(await request("/dashboard", token));
      }
    } catch (failure) {
      setScanStatus("FAILED");
      setScanMessage(failure.message);
    }
  }

  async function rejectScanCandidate(candidate) {
    setReviewingCandidateId(candidate.id);
    setError("");
    try {
      await request(`/scan-candidates/${candidate.id}/reject`, token, {
        method: "POST",
      });
      const reports = await request(
        `/scan-candidates?runId=${encodeURIComponent(candidate.runId)}`,
        token,
      );
      setScanCandidates(reports);
    } catch (failure) {
      setError(failure.message);
    } finally {
      setReviewingCandidateId(null);
    }
  }

  async function confirmScanCandidateApproval() {
    if (!approvalCandidate) return;
    const candidate = approvalCandidate;
    setReviewingCandidateId(candidate.id);
    setError("");
    try {
      const result = await request(
        `/scan-candidates/${candidate.id}/approve`,
        token,
        {
          method: "POST",
          body: JSON.stringify({ confirmed: true }),
        },
      );
      const reports = await request(
        `/scan-candidates?runId=${encodeURIComponent(candidate.runId)}`,
        token,
      );
      setScanCandidates(reports);
      setApprovalCandidate(null);
      setScanMessage(
        result.reviewStatus === "APPROVED"
          ? `Verified incident added to Urban Danger as #${result.incidentId}.`
          : `Not added: ${result.verificationStatus || result.reviewStatus}. Review the updated report details.`,
      );
      if (result.reviewStatus === "APPROVED" && view === "dashboard") {
        setData(await request("/dashboard", token));
      }
    } catch (failure) {
      setError(failure.message);
    } finally {
      setReviewingCandidateId(null);
    }
  }

  if (!token) {
    return (
      <main className="login-shell">
        <div className="login-art" aria-hidden="true">
          <img
            className="login-logo"
            src="/brand/urban-danger-horizontal-black.svg"
            alt=""
          />
          <small>PUBLIC SAFETY INTELLIGENCE</small>
        </div>
        <form className="login-panel" onSubmit={signIn}>
          <p className="eyebrow">URBAN DANGER / ADMIN</p>
          <h1>System access</h1>
          <p className="muted">Restricted to authorized administrators.</p>
          <label>
            Username or email
            <input
              type="text"
              autoComplete="username"
              value={login.email}
              onChange={(event) =>
                setLogin((current) => ({
                  ...current,
                  email: event.target.value,
                }))
              }
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={login.password}
              onChange={(event) =>
                setLogin((current) => ({
                  ...current,
                  password: event.target.value,
                }))
              }
              required
            />
          </label>
          {error && <p className="notice error">{error}</p>}
          <button className="primary-button" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"} <span>→</span>
          </button>
          <p className="fine-print">
            Your session is short-lived and held only for this browser tab.
          </p>
        </form>
      </main>
    );
  }

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a
          className="brand"
          href="#dashboard"
          onClick={() => setView("dashboard")}
        >
          <img
            className="brand-logo"
            src="/brand/urban-danger-horizontal-black.svg"
            alt="Urban Danger Intelligence"
          />
        </a>
        <p className="nav-label">WORKSPACE</p>
        <nav>
          {NAVIGATION.map(([key, label, number]) => (
            <button
              key={key}
              className={view === key ? "nav-item active" : "nav-item"}
              onClick={() => {
                setView(key);
                setData(null);
              }}
            >
              <span>{number}</span>
              {label}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="status-dot" /> Admin session active
          <button
            className="text-button"
            onClick={() => {
              setToken(null);
              setData(null);
              window.sessionStorage.removeItem("urban-danger-admin-token");
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div>
            <p className="eyebrow">TAGUIG CITY + PATEROS / OPERATIONS</p>
            <h1>{NAVIGATION.find(([key]) => key === view)?.[1]}</h1>
          </div>
          <div className="topbar-meta">
            <span className="status-dot" /> API session
            <span className="avatar">A</span>
          </div>
        </header>
        <div className="content-area">
          {error && (
            <div className="notice error" role="alert">
              {error}
            </div>
          )}
          {loading && (
            <div className="loading-line">
              <span /> Loading system data
            </div>
          )}
          {!loading && view === "dashboard" && (
            <Dashboard
              data={data}
              onNavigate={setView}
              onRunScan={runScan}
              scanRunId={scanRunId}
              scanStatus={scanStatus}
              scanStats={scanStats}
              scanMessage={scanMessage}
              scanCandidates={scanCandidates}
              reviewingCandidateId={reviewingCandidateId}
              onViewCandidate={setScanCandidateDetail}
              onApproveCandidate={setApprovalCandidate}
              onRejectCandidate={rejectScanCandidate}
            />
          )}
          {!loading && view === "incidents" && (
            <Incidents
              data={data}
              filters={filters}
              setFilters={setFilters}
              onOpen={openIncident}
            />
          )}
          {!loading && view === "ingestion-runs" && (
            <Runs data={data} token={token} />
          )}
          {!loading && view === "sources" && <Sources data={data} />}
          {!loading && view === "system-status" && <SystemStatus data={data} />}
        </div>
      </main>
      {incidentDetail && (
        <IncidentDialog
          incident={incidentDetail}
          onClose={() => setIncidentDetail(null)}
        />
      )}
      {scanCandidateDetail && (
        <ScanCandidateDialog
          item={scanCandidateDetail}
          onClose={() => setScanCandidateDetail(null)}
        />
      )}
      {approvalCandidate && (
        <ApprovalDialog
          item={approvalCandidate}
          busy={reviewingCandidateId === approvalCandidate.id}
          onCancel={() => setApprovalCandidate(null)}
          onConfirm={confirmScanCandidateApproval}
        />
      )}
    </div>
  );
}

function Dashboard({
  data,
  onNavigate,
  onRunScan,
  scanRunId,
  scanStatus,
  scanStats,
  scanMessage,
  scanCandidates,
  reviewingCandidateId,
  onViewCandidate,
  onApproveCandidate,
  onRejectCandidate,
}) {
  if (!data)
    return (
      <EmptyState
        title="System statistics"
        text="Dashboard data is not available yet."
      />
    );
  const run = data.lastRun;
  return (
    <>
      <div className="data-note">
        <span className="note-mark">i</span>
        {data.statisticsLabel}
      </div>
      <section className="metric-grid">
        <Metric
          label="Verified incidents"
          value={data.totalVerifiedIncidents}
          foot="Current verified records"
        />
        <Metric
          label="Added in 7 days"
          value={data.incidentsAddedRecently}
          foot="By record creation date"
        />
        <Metric
          label="Latest run"
          value={run?.status || "No run"}
          foot={run?.completedAt || "No history recorded"}
          status={run?.status}
        />
        <Metric
          label="Articles processed"
          value={run?.articlesProcessed ?? "—"}
          foot="Most recent recorded run"
        />
        <Metric
          label="Scheduler"
          value={data.scheduler?.status || "UNKNOWN"}
          foot={data.scheduler?.schedule || "Schedule unavailable"}
          status={data.scheduler?.status}
        />
      </section>
      <section className="panel scan-panel">
        <div className="scan-heading">
          <div>
            <h3>Optional manual source scan</h3>
            <p>
              Uses the existing trusted-source pipeline and shared ingestion
              lock.
            </p>
          </div>
          <RunStatus value={scanStatus} />
          <button
            className="primary-button scan-button"
            disabled={scanStatus === "RUNNING"}
            onClick={onRunScan}
          >
            {scanStatus === "RUNNING" ? "Scan running" : "Run Scan"}
          </button>
        </div>
        {scanMessage && (
          <p
            className={
              scanStatus === "FAILED" ? "scan-message error" : "scan-message"
            }
          >
            {scanMessage}
          </p>
        )}
        {scanStats && (
          <dl className="scan-stat-list">
            <Detail
              label="Articles scanned"
              value={scanStats.articlesScanned ?? scanStats.articlesCollected}
            />
            <Detail
              label="Articles skipped"
              value={scanStats.articlesSkipped}
            />
            <Detail label="Gemini requests" value={scanStats.geminiRequests} />
            <Detail
              label="Candidates extracted"
              value={scanStats.candidatesExtracted ?? scanStats.candidatesFound}
            />
            <Detail
              label="Verified incidents"
              value={scanStats.verifiedCandidates ?? scanStats.verifiedCount}
            />
            <Detail
              label="Rejected"
              value={scanStats.candidatesRejected ?? scanStats.rejectedCount}
            />
            <Detail
              label="Errors"
              value={
                scanStats.errorCount ??
                Number(scanStats.sourcesFailed || 0) +
                  Number(scanStats.verificationFailures || 0)
              }
            />
            <Detail label="Rate limits" value={scanStats.rateLimitCount} />
          </dl>
        )}
        {scanRunId !== null && (
          <ScanCandidateList
            items={scanCandidates}
            reviewingCandidateId={reviewingCandidateId}
            onView={onViewCandidate}
            onApprove={onApproveCandidate}
            onReject={onRejectCandidate}
          />
        )}
      </section>
      <section className="dashboard-grid">
        <Breakdown title="Verified by category" rows={data.byCategory} />
        <Breakdown title="Verified by severity" rows={data.bySeverity} />
        <Breakdown title="Verified by barangay" rows={data.byBarangay} />
        <section className="panel latest-panel">
          <PanelTitle
            title="Latest ingestion"
            action="View history"
            onClick={() => onNavigate("ingestion-runs")}
          />
          {run ? (
            <dl className="detail-list">
              <Detail label="Verified" value={run.verifiedCount} />
              <Detail label="Rejected" value={run.rejectedCount} />
              <Detail label="Duplicates" value={run.duplicateCount} />
              <Detail label="Inserted" value={run.insertedCount} />
              <Detail label="Errors" value={run.errorCount} />
              <Detail label="Duration" value={formatDuration(run.durationMs)} />
            </dl>
          ) : (
            <p className="muted">
              No history is recorded until a run executes after migration.
            </p>
          )}
        </section>
      </section>
    </>
  );
}

function ScanCandidateList({
  items,
  reviewingCandidateId,
  onView,
  onApprove,
  onReject,
}) {
  function reportOutcome(item) {
    const reasons = Array.isArray(item.reasons) ? item.reasons : [];
    const reasonText = reasons.join(" ");
    const status = String(item.verificationStatus || item.scanStatus || "")
      .trim()
      .toUpperCase();

    if (status === "VERIFIED") return { label: "Verified", className: "verified" };
    if (status === "REJECTED") return { label: "Rejected", className: "rejected" };
    if (
      status === "NOT_AN_INCIDENT" ||
      status === "SKIPPED_PROCESSED" ||
      status === "SKIPPED"
    ) {
      return { label: "Skipped", className: "skipped" };
    }
    if (/\b429\b|rate.?limit/i.test(reasonText)) {
      return { label: "Rate Limited", className: "rate-limited" };
    }
    if (/\b408\b|\b5\d{2}\b|timeout|timed out|abort|database|mysql|connection/i.test(reasonText)) {
      return { label: "Retry", className: "retry" };
    }
    if (item.candidate && status === "PENDING_REVIEW") {
      return { label: "Candidate", className: "candidate" };
    }
    if (status === "PENDING_REVIEW") {
      return { label: "Error", className: "error" };
    }
    return {
      label: status ? status.replaceAll("_", " ") : "Unavailable",
      className: "unavailable",
    };
  }

  function extractionAttempt(item) {
    const reasons = Array.isArray(item.reasons) ? item.reasons.join(" ") : "";
    if (item.candidate) return "Yes";
    if (
      /already processed|already seen|pre-filter|prefilter|skipped before extraction|extraction paused/i.test(
        reasons,
      )
    ) {
      return "No";
    }
    if (
      /article does not describe an individual incident|extraction provider|gemini|HTTP\s+(?:408|429|5\d{2})|timed out|timeout|aborted/i.test(reasons)
    ) {
      if (/extraction provider|gemini|extraction could not be completed/i.test(reasons)) {
        return "Yes";
      }
    }
    if (item.scanStatus === "NOT_AN_INCIDENT") {
      return /article does not describe an individual incident/i.test(reasons)
        ? "Yes"
        : "No";
    }
    return "Unavailable";
  }

  function extractionResult(item, attempted) {
    if (item.candidate) return "Candidate data extracted (shown below).";
    const reason = Array.isArray(item.reasons) ? item.reasons[0] : null;
    if (reason) return reason;
    if (attempted === "No") return "Extraction was not attempted.";
    return "Unavailable";
  }

  function validationResult(item) {
    if (!item.candidate) return "Unavailable";
    if (item.verificationStatus === "VERIFIED") return "Passed.";

    const reasons = Array.isArray(item.reasons) ? item.reasons : [];
    const validationReasons = reasons.filter((reason) =>
      /category must|city must|barangay must|location description is required|latitude and longitude|coordinates are|description is too short|incident date is invalid|source name is required|source URL must|source hostname is not|source URL is malformed|source publication date is invalid|reviewed source evidence|source evidence|severity must|coordinate source/i.test(
        reason,
      ),
    );
    if (validationReasons.length > 0) {
      return `Failed: ${validationReasons.join(" ")}`;
    }
    return "Not separately recorded.";
  }

  function verificationResult(item) {
    const status = String(item.verificationStatus || "")
      .trim()
      .toUpperCase();
    const labels = {
      VERIFIED: "Verified",
      REJECTED: "Rejected",
      PENDING_REVIEW: "Pending review",
      NOT_AN_INCIDENT: "Not an incident",
      SKIPPED_PROCESSED: "Skipped (already processed)",
    };
    return labels[status] || "Unavailable";
  }

  return (
    <div className="scan-results">
      <div className="scan-results-heading">
        <h4>Scan Results</h4>
        <span className="count-chip">{items.length} results</span>
      </div>
      {items.length === 0 ? (
        <p className="scan-message">No article reports were returned for this scan.</p>
      ) : items.map((item) => {
        const candidate = item.candidate || {};
        const outcome = reportOutcome(item);
        const attempted = extractionAttempt(item);
        const canApprove =
          item.reviewStatus === "PENDING" &&
          item.verificationStatus === "VERIFIED" &&
          Boolean(item.candidate);
        const canReject = item.reviewStatus === "PENDING";
        return (
          <article className="scan-result" key={item.id}>
            <div className="scan-result-top">
              <div className="scan-result-copy">
                <p className="eyebrow">ARTICLE REPORT</p>
                <h5>{item.title || "Unavailable"}</h5>
                <p className="scan-source-line">
                  {item.sourceName || "Source unavailable"}
                </p>
              </div>
              <div className="scan-status-stack">
                <span className={`run-status status-${outcome.className}`}>
                  {outcome.label}
                </span>
                <RunStatus value={item.reviewStatus} />
              </div>
            </div>
            <dl className="scan-result-facts">
              <Detail
                label="Source name"
                value={item.sourceName || "Unavailable"}
              />
              <Detail
                label="Published date"
                value={
                  item.sourcePublishedAt
                    ? formatDate(item.sourcePublishedAt)
                    : "Unavailable"
                }
              />
              <div className="scan-result-url">
                <dt>Source URL</dt>
                <dd>
                  {item.sourceUrl ? (
                    <a
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {item.sourceUrl}
                    </a>
                  ) : (
                    "Unavailable"
                  )}
                </dd>
              </div>
              <Detail
                label="Processing status"
                value={item.scanStatus || "Unavailable"}
              />
              <Detail
                label="Reason / status explanation"
                value={
                  item.reasons?.length
                    ? item.reasons.join(" ")
                    : "Unavailable"
                }
              />
              <Detail label="Gemini extraction attempted" value={attempted} />
              <Detail
                label="Gemini extraction result"
                value={extractionResult(item, attempted)}
              />
              <Detail
                label="Validation result"
                value={validationResult(item)}
              />
              <Detail
                label="Verification result"
                value={verificationResult(item)}
              />
              <Detail
                label="Category"
                value={
                  candidate.category ||
                  candidate.categoryName ||
                  "Unavailable"
                }
              />
              <Detail
                label="Location"
                value={candidate.locationDescription || "Unavailable"}
              />
              <Detail
                label="Barangay"
                value={candidate.barangay || "Unavailable"}
              />
              <Detail label="City" value={candidate.city || "Unavailable"} />
              <Detail
                label="Incident date"
                value={
                  candidate.incidentDate
                    ? formatDate(candidate.incidentDate)
                    : "Unavailable"
                }
              />
              <Detail
                label="Incident time"
                value={
                  candidate.incidentTimeKnown === true
                    ? candidate.incidentTime || "Known; exact time unavailable"
                    : candidate.incidentTimeKnown === false
                      ? "Not reported"
                      : "Unavailable"
                }
              />
              <Detail
                label="Severity"
                value={candidate.severity || "Unavailable"}
              />
              <Detail
                label="Description"
                value={candidate.description || "Unavailable"}
              />
              <Detail
                label="Candidate source"
                value={
                  candidate.sourceName || item.sourceName || "Unavailable"
                }
              />
              <Detail
                label="Candidate source URL"
                value={candidate.sourceUrl || item.sourceUrl || "Unavailable"}
              />
            </dl>
            <div className="scan-result-actions">
              <button className="secondary-button" onClick={() => onView(item)}>
                View Details
              </button>
              {canApprove && (
                <button
                  className="primary-button"
                  disabled={reviewingCandidateId === item.id}
                  onClick={() => onApprove(item)}
                >
                  Add to Urban Danger
                </button>
              )}
              {canReject && (
                <button
                  className="danger-button"
                  disabled={reviewingCandidateId === item.id}
                  onClick={() => onReject(item)}
                >
                  Reject
                </button>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}

function ScanCandidateDialog({ item, onClose }) {
  const candidate = item.candidate || {};
  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="scan-candidate-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dialog-head">
          <div>
            <p className="eyebrow">SCAN REPORT · #{item.id}</p>
            <h2 id="scan-candidate-title">{item.title || "Article details"}</h2>
          </div>
          <button className="close-button" onClick={onClose} aria-label="Close report details">
            ×
          </button>
        </div>
        <dl className="detail-list">
          <Detail label="Source" value={item.sourceName} />
          <Detail label="Source URL" value={item.sourceUrl} />
          <Detail label="Location" value={candidate.locationDescription} />
          <Detail label="Barangay" value={candidate.barangay} />
          <Detail label="City" value={candidate.city} />
          <Detail label="Category" value={candidate.category || candidate.categoryName} />
          <Detail label="Severity" value={candidate.severity} />
          <Detail label="Incident date/time" value={candidate.incidentDate ? `${formatDate(candidate.incidentDate)}${candidate.incidentTimeKnown ? "" : " · time not reported"}` : null} />
          <Detail label="Published" value={formatDate(item.sourcePublishedAt)} />
          <Detail label="Verification status" value={item.verificationStatus || item.scanStatus} />
          <Detail label="Review status" value={item.reviewStatus} />
          <Detail label="Verification method" value={candidate.verificationMethod} />
          <Detail label="Source event facts" value={candidate.sourceEvidence?.eventFacts} />
          <Detail
            label="Coordinates"
            value={candidate.latitude == null || candidate.longitude == null ? "Not available; remain NULL." : `${candidate.latitude}, ${candidate.longitude}`}
          />
        </dl>
        <p className="incident-description">
          {candidate.description || "No incident description was extracted."}
        </p>
        {item.reasons?.length > 0 && (
          <p className="scan-result-reasons">{item.reasons.join(" ")}</p>
        )}
        {item.sourceUrl && (
          <a className="source-link" href={item.sourceUrl} target="_blank" rel="noopener noreferrer">
            View original source ↗
          </a>
        )}
      </section>
    </div>
  );
}

function ApprovalDialog({ item, busy, onCancel, onConfirm }) {
  const candidate = item.candidate || {};
  return (
    <div className="dialog-backdrop" role="presentation" onClick={onCancel}>
      <section
        className="dialog approval-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="approval-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dialog-head">
          <div>
            <p className="eyebrow">ADMIN REVIEW</p>
            <h2 id="approval-title">Add verified incident?</h2>
          </div>
          <button className="close-button" onClick={onCancel} aria-label="Cancel approval">
            ×
          </button>
        </div>
        <p className="muted">
          Review the extracted information. It will be added to Urban Danger only after you confirm.
        </p>
        <dl className="detail-list">
          <Detail label="Title" value={item.title} />
          <Detail label="Source" value={item.sourceName} />
          <Detail label="Source URL" value={item.sourceUrl} />
          <Detail label="Location" value={candidate.locationDescription || candidate.barangay} />
          <Detail label="Category / severity" value={[candidate.category || candidate.categoryName, candidate.severity].filter(Boolean).join(" · ")} />
          <Detail label="Incident date" value={formatDate(candidate.incidentDate)} />
        </dl>
        <p className="incident-description">{candidate.description || "No description extracted."}</p>
        <div className="scan-result-actions">
          <button className="secondary-button" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button className="primary-button" disabled={busy} onClick={onConfirm}>
            {busy ? "Verifying…" : "Confirm Add to Urban Danger"}
          </button>
        </div>
      </section>
    </div>
  );
}

function Incidents({ data, filters, setFilters, onOpen }) {
  const items = data?.items || [];
  const update = (key, value) => setFilters({ ...filters, [key]: value });
  return (
    <>
      <div className="page-intro">
        <div>
          <h2>Verified incident register</h2>
          <p>Source-backed Taguig records. Provenance is read-only.</p>
        </div>
        <span className="count-chip">{data?.total ?? "—"} records</span>
      </div>
      <section className="filter-bar">
        <input
          placeholder="Search source, location, description"
          value={filters.q}
          onChange={(event) => update("q", event.target.value)}
        />
        <input
          placeholder="Category"
          value={filters.category}
          onChange={(event) => update("category", event.target.value)}
        />
        <select
          value={filters.severity}
          onChange={(event) => update("severity", event.target.value)}
        >
          <option value="">All severities</option>
          <option>HIGH</option>
          <option>MEDIUM</option>
          <option>LOW</option>
        </select>
        <input
          placeholder="Barangay"
          value={filters.barangay}
          onChange={(event) => update("barangay", event.target.value)}
        />
        <input
          type="date"
          aria-label="From date"
          value={filters.from}
          onChange={(event) => update("from", event.target.value)}
        />
        <input
          type="date"
          aria-label="To date"
          value={filters.to}
          onChange={(event) => update("to", event.target.value)}
        />
        <input
          placeholder="Source"
          value={filters.source}
          onChange={(event) => update("source", event.target.value)}
        />
      </section>
      <div
        className="table-wrap"
        tabIndex={0}
        role="region"
        aria-label="Verified incident records"
      >
        <table>
          <thead>
            <tr>
              <th>ID</th>
              <th>Incident</th>
              <th>Location</th>
              <th>Severity</th>
              <th>Incident date</th>
              <th>Source</th>
              <th>Published</th>
              <th>Verification</th>
              <th>Coordinates</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.id} onClick={() => onOpen(item.id)}>
                <td className="mono">{item.id}</td>
                <td>
                  <strong>{item.category}</strong>
                  <small>{item.city}</small>
                </td>
                <td>
                  {item.locationDescription ||
                    item.barangay ||
                    "Location not reported"}
                  <small>{item.barangay || "Barangay not reported"}</small>
                </td>
                <td>
                  <Severity value={item.severity} />
                </td>
                <td>{formatDate(item.incidentDate)}</td>
                <td>{item.sourceName}</td>
                <td>{formatDate(item.sourcePublishedAt)}</td>
                <td>{item.verificationStatus}</td>
                <td>
                  {item.latitude == null || item.longitude == null
                    ? "Not available"
                    : `${item.latitude}, ${item.longitude}`}
                </td>
                <td>
                  <span className="arrow">↗</span>
                </td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td colSpan="10" className="empty-cell">
                  No verified incidents match these filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="fine-print">
        Incident data are limited to records currently verified by the system.
        Missing coordinates remain unreported.
      </p>
    </>
  );
}

function Runs({ data, token }) {
  const items = data?.items || [];
  const [selected, setSelected] = useState(null);
  async function inspect(id) {
    try {
      setSelected(await request(`/ingestion-runs/${id}`, token));
    } catch {
      setSelected(null);
    }
  }
  return (
    <>
      <div className="page-intro">
        <div>
          <h2>Automated pipeline activity</h2>
          <p>
            History begins when run recording is deployed and executions start.
          </p>
        </div>
        <span className="count-chip">{data?.total ?? 0} recorded runs</span>
      </div>
      <div
        className="table-wrap"
        tabIndex={0}
        role="region"
        aria-label="Ingestion run history"
      >
        <table>
          <thead>
            <tr>
              <th>Run</th>
              <th>Source</th>
              <th>Started</th>
              <th>Completed</th>
              <th>Status</th>
              <th>Sources</th>
              <th>Collected</th>
              <th>Skipped</th>
              <th>Prefiltered</th>
              <th>Processed</th>
              <th>Gemini calls</th>
              <th>Candidates</th>
              <th>Verified</th>
              <th>Rejected</th>
              <th>Duplicates</th>
              <th>Inserted</th>
              <th>Errors</th>
              <th>Rate limits</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            {items.map((run) => (
              <tr key={run.id} onClick={() => inspect(run.id)}>
                <td className="mono">#{run.id}</td>
                <td>{run.runSource || "SCHEDULED"}</td>
                <td>{formatDate(run.startedAt)}</td>
                <td>{formatDate(run.completedAt)}</td>
                <td>
                  <RunStatus value={run.status} />
                </td>
                <td>{run.sourcesChecked}</td>
                <td>{run.articlesCollected}</td>
                <td>{run.articlesSkipped}</td>
                <td>{run.articlesPrefiltered}</td>
                <td>{run.articlesProcessed}</td>
                <td>{run.geminiRequests}</td>
                <td>{run.candidatesFound}</td>
                <td>{run.verifiedCount}</td>
                <td>{run.rejectedCount}</td>
                <td>{run.duplicateCount}</td>
                <td>{run.insertedCount}</td>
                <td>{run.errorCount}</td>
                <td>{run.rateLimitCount}</td>
                <td>{formatDuration(run.durationMs)}</td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td colSpan="18" className="empty-cell">
                  No ingestion runs have been recorded.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {selected && (
        <section className="panel run-detail">
          <PanelTitle
            title={`Run #${selected.id}`}
            action="Close"
            onClick={() => setSelected(null)}
          />
          <dl className="detail-list">
            <Detail label="Status" value={selected.status} />
            <Detail label="Candidates found" value={selected.candidatesFound} />
            <Detail label="Error count" value={selected.errorCount} />
            <Detail
              label="Failure summary"
              value={selected.errorMessage || "No failure recorded"}
            />
          </dl>
        </section>
      )}
    </>
  );
}

function Sources({ data }) {
  return (
    <>
      <div className="page-intro">
        <div>
          <h2>Collection targets</h2>
          <p>
            Active collection targets. Verification trusted-host allowlist is
            managed separately.
          </p>
        </div>
      </div>
      <div
        className="table-wrap"
        tabIndex={0}
        role="region"
        aria-label="Collection targets"
      >
        <table>
          <thead>
            <tr>
              <th>Source</th>
              <th>Domain</th>
              <th>Collection URL</th>
              <th>Enabled</th>
              <th>Latest activity</th>
              <th>Articles collected</th>
            </tr>
          </thead>
          <tbody>
            {(data || []).map((source) => (
              <tr key={source.domain}>
                <td>
                  <strong>{source.name}</strong>
                </td>
                <td>{source.domain}</td>
                <td>
                  {source.seedUrls.length
                    ? source.seedUrls.join(", ")
                    : "Domain root"}
                </td>
                <td>
                  <RunStatus value={source.enabled ? "ENABLED" : "DISABLED"} />
                </td>
                <td>Not recorded</td>
                <td>Not recorded</td>
              </tr>
            ))}
            {!data?.length && (
              <tr>
                <td colSpan="6" className="empty-cell">
                  No collection targets are configured.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="data-note">
        <span className="note-mark">i</span>Collection counts are aggregate run
        data only; individual source counts are not available and are not
        inferred.
      </div>
    </>
  );
}

function SystemStatus({ data }) {
  if (!data)
    return (
      <EmptyState title="System status" text="Status checks are unavailable." />
    );
  const services = [
    ["Express API", data.api],
    ["MySQL / Aiven", data.database],
    ["Ingestion history", { status: data.ingestion.historyStatus }],
    ["Gemini extraction", data.gemini],
    ["Scheduled ingestion", data.scheduler],
  ];
  return (
    <>
      <div className="page-intro">
        <div>
          <h2>Service checks</h2>
          <p>
            Configuration and database checks, not a guarantee of provider
            availability.
          </p>
        </div>
        <span className="muted">Checked {formatDate(data.checkedAt)}</span>
      </div>
      <section className="status-list">
        {services.map(([label, value]) => (
          <article className="status-row" key={label}>
            <div>
              <span className="status-glyph">
                {value?.status === "OPERATIONAL" ||
                value?.status === "CONFIGURED"
                  ? "✓"
                  : "!"}
              </span>
              <div>
                <strong>{label}</strong>
                <small>
                  {value?.check || value?.schedule || "Latest recorded state"}
                </small>
              </div>
            </div>
            <RunStatus value={value?.status || "UNKNOWN"} />
          </article>
        ))}
      </section>
      <div className="data-note">
        <span className="note-mark">i</span>Gemini state indicates configuration
        only; provider connectivity is not probed. Scheduler status reflects
        required configuration and the latest recorded run.
      </div>
    </>
  );
}

function IncidentDialog({ incident, onClose }) {
  return (
    <div className="dialog-backdrop" role="presentation" onClick={onClose}>
      <section
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="incident-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="dialog-head">
          <div>
            <p className="eyebrow">VERIFIED RECORD · #{incident.id}</p>
            <h2 id="incident-title">{incident.category}</h2>
          </div>
          <button
            className="close-button"
            onClick={onClose}
            aria-label="Close details"
          >
            ×
          </button>
        </div>
        <dl className="detail-list">
          <Detail label="Verification" value={incident.verificationStatus} />
          <Detail
            label="Severity"
            value={`${incident.severity} · system-assigned`}
          />
          <Detail
            label="City / barangay"
            value={`${incident.city} / ${incident.barangay || "Not reported"}`}
          />
          <Detail
            label="Location"
            value={incident.locationDescription || "Not reported"}
          />
          <Detail
            label="Incident date"
            value={formatDate(incident.incidentDate)}
          />
          <Detail label="Source" value={incident.sourceName} />
          <Detail
            label="Source published"
            value={formatDate(incident.sourcePublishedAt)}
          />
          <Detail
            label="Verification method"
            value={incident.verificationMethod}
          />
          <Detail
            label="Last verified"
            value={formatDate(incident.lastVerifiedAt)}
          />
          <Detail
            label="Coordinates"
            value={
              incident.latitude == null || incident.longitude == null
                ? "Not available; coordinates remain NULL."
                : `${incident.latitude}, ${incident.longitude}`
            }
          />
          <Detail
            label="Location provenance"
            value={incident.locationSourceName || "Not recorded"}
          />
        </dl>
        <p className="incident-description">{incident.description}</p>
        <a
          className="source-link"
          href={incident.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          Open source ↗
        </a>
      </section>
    </div>
  );
}

function Metric({ label, value, foot, status }) {
  return (
    <article className="metric">
      <div className="metric-top">
        <span>{label}</span>
        {status && <RunStatus value={status} />}
      </div>
      <strong>{value ?? "—"}</strong>
      <small>{foot}</small>
    </article>
  );
}
function Breakdown({ title, rows = [] }) {
  const max = Math.max(1, ...rows.map(({ count }) => count));
  return (
    <section className="panel">
      <PanelTitle title={title} />
      {rows.length ? (
        <div className="breakdown">
          {rows.slice(0, 8).map((row) => (
            <div className="breakdown-row" key={row.label}>
              <div>
                <span>{row.label}</span>
                <strong>{row.count}</strong>
              </div>
              <div className="bar-track">
                <span
                  style={{ width: `${Math.max(4, (row.count / max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="muted">No records available.</p>
      )}
    </section>
  );
}
function PanelTitle({ title, action, onClick }) {
  return (
    <div className="panel-title">
      <h3>{title}</h3>
      {action && (
        <button className="text-button" onClick={onClick}>
          {action} →
        </button>
      )}
    </div>
  );
}
function Detail({ label, value }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value ?? "—"}</dd>
    </div>
  );
}
function Severity({ value }) {
  return (
    <span className={`severity severity-${String(value).toLowerCase()}`}>
      {value}
    </span>
  );
}
function RunStatus({ value }) {
  return (
    <span className={`run-status status-${String(value || "").toLowerCase()}`}>
      {String(value || "UNKNOWN").replaceAll("_", " ")}
    </span>
  );
}
function EmptyState({ title, text }) {
  return (
    <section className="empty-state">
      <span>—</span>
      <h2>{title}</h2>
      <p>{text}</p>
    </section>
  );
}
function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleString();
}
function formatDuration(value) {
  if (value == null) return "—";
  return value < 1000 ? `${value} ms` : `${(value / 1000).toFixed(1)} s`;
}

export default App;
