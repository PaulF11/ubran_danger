import { useEffect, useState } from "react";

const API_BASE = (
  import.meta.env.VITE_API_BASE_URL || "http://localhost:3000"
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
  const [token, setToken] = useState(null);
  const [view, setView] = useState("dashboard");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [incidentDetail, setIncidentDetail] = useState(null);
  const [filters, setFilters] = useState({
    category: "",
    severity: "",
    barangay: "",
    from: "",
    to: "",
    source: "",
    q: "",
  });
  const [login, setLogin] = useState({ username: "", password: "" });

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
        if (failure.message.includes("authentication")) setToken(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [token, view, filters]);

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
      setLogin({ username: "", password: "" });
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

  if (!token) {
    return (
      <main className="login-shell">
        <div className="login-art" aria-hidden="true">
          <span>UD</span>
          <small>TAGUIG · SYSTEMS</small>
        </div>
        <form className="login-panel" onSubmit={signIn}>
          <p className="eyebrow">URBAN DANGER / ADMIN</p>
          <h1>System access</h1>
          <p className="muted">Restricted to authorized administrators.</p>
          <label>
            Username
            <input
              autoComplete="username"
              value={login.username}
              onChange={(event) =>
                setLogin({ ...login, username: event.target.value })
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
                setLogin({ ...login, password: event.target.value })
              }
              required
            />
          </label>
          {error && <p className="notice error">{error}</p>}
          <button className="primary-button" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"} <span>→</span>
          </button>
          <p className="fine-print">
            Your session is short-lived and held only in memory.
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
          <span className="brand-mark">UD</span>
          <span>
            Urban Danger<small>ADMIN CONSOLE</small>
          </span>
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
            }}
          >
            Sign out
          </button>
        </div>
      </aside>
      <main className="main-area">
        <header className="topbar">
          <div>
            <p className="eyebrow">TAGUIG CITY / OPERATIONS</p>
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
            <Dashboard data={data} onNavigate={setView} />
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
    </div>
  );
}

function Dashboard({ data, onNavigate }) {
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
          foot="Current Taguig records"
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
      <div className="table-wrap">
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
                <td>
                  {item.sourceName}
                </td>
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
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Run</th>
              <th>Started</th>
              <th>Completed</th>
              <th>Status</th>
              <th>Sources</th>
              <th>Collected</th>
              <th>Prefiltered</th>
              <th>Processed</th>
              <th>Verified</th>
              <th>Rejected</th>
              <th>Duplicates</th>
              <th>Inserted</th>
              <th>Errors</th>
              <th>Duration</th>
            </tr>
          </thead>
          <tbody>
            {items.map((run) => (
              <tr key={run.id} onClick={() => inspect(run.id)}>
                <td className="mono">#{run.id}</td>
                <td>{formatDate(run.startedAt)}</td>
                <td>{formatDate(run.completedAt)}</td>
                <td>
                  <RunStatus value={run.status} />
                </td>
                <td>{run.sourcesChecked}</td>
                <td>{run.articlesCollected}</td>
                <td>{run.articlesPrefiltered}</td>
                <td>{run.articlesProcessed}</td>
                <td>{run.verifiedCount}</td>
                <td>{run.rejectedCount}</td>
                <td>{run.duplicateCount}</td>
                <td>{run.insertedCount}</td>
                <td>{run.errorCount}</td>
                <td>{formatDuration(run.durationMs)}</td>
              </tr>
            ))}
            {!items.length && (
              <tr>
                <td colSpan="14" className="empty-cell">
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
          <h2>Trusted source allowlist</h2>
          <p>
            Configured collection targets. Per-source run telemetry is not
            stored yet.
          </p>
        </div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Source</th>
              <th>Domain</th>
              <th>Seed URLs</th>
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
                  No trusted sources are configured.
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
