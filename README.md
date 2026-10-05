# Urban Danger

Urban Danger is a Taguig-only Flutter application backed by an Express API on
Netlify Functions and an Aiven-compatible MySQL database.

## Automated cloud ingestion

Netlify invokes `scheduled-ingestion` at **00:00, 06:00, 12:00, and 18:00 UTC**
(`0 */6 * * *`). This fixed UTC cron schedule runs independently of a user's
device. The scheduled function makes one authenticated request to the Netlify
`ingest-background` function. That background function validates its
server-side configuration, takes a MySQL advisory lock, and calls the existing
`runAutomatedIngestion` pipeline. It does not route production requests through
the development-only `/api/system/ingest` endpoint or duplicate Phase 3 logic.

Configure these values in Netlify's server-side environment settings for every
deploy context that should run ingestion:

- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, and `DB_NAME`
- `GEMINI_API_KEY` (and optionally `GEMINI_MODEL`)
- `SCHEDULED_INGEST_KEY`, a strong random secret shared only by the two
  Netlify functions; if it is unset, both functions use `INTERNAL_INGEST_KEY`
- `TRUSTED_SOURCE_HOSTS` and optional `TRUSTED_SOURCE_SEED_URLS`
- Netlify's built-in `URL`, used to address the background function

The database and Gemini credentials must never be included in Flutter
configuration. The production-only `/api/system/ingest` endpoint remains
disabled regardless of which key the scheduled functions use. Ingestion logs contain counts, duration, and error
categories only; they do not include credentials, source URLs, or exception
messages. Concurrent runs are skipped using a connection-scoped MySQL
`GET_LOCK`; existing transactional duplicate/conflict checks remain in charge
of incident idempotency. The existing pipeline continues to persist only
verified candidates.

Netlify Background Functions return promptly to the scheduled trigger and run
the ingestion work asynchronously. Their maximum execution duration depends on
the Netlify account plan; deployments should monitor duration and failure
categories, particularly if trusted sources or Gemini become slow.

## Route incident intelligence

The existing route endpoint validates both endpoints and every OSRM geometry
point against the configured Taguig map bounds. It then compares the actual
route geometry with database incidents that satisfy the public API's verified
provenance and Taguig scope filters. Incidents without valid coordinates are
excluded. The deterministic proximity threshold defaults to **500 meters** and
can be changed with the backend-only `ROUTE_INCIDENT_PROXIMITY_METERS`
environment setting (valid range: greater than 0 and at most 5,000 meters).

Distance is measured from each incident to every consecutive segment in the
OSRM GeoJSON route using a local equirectangular projection in meters. Each
incident is counted once, including incidents nearest the route's beginning,
middle, or destination. Route results report counts and available incident
details, not an official crime score or a claim about whether a route is safe.
The UI identifies the evidence as the currently verified, limited system
dataset.

## Local validation

From `backend`, run `npm test`. This suite does not call external providers.
The separate `gemini-taguig-extraction.test.js` test performs a read-only Aiven
query and sends stored public-source evidence to Gemini; run it only when
intentionally opted in with `RUN_LIVE_GEMINI_INTEGRATION=true`. From the project
root, run `flutter analyze` and `flutter test`. Netlify's build can be checked
with `npx netlify build` where the Netlify CLI is available.

## Phase 6: Admin dashboard

The separate React/Vite application in `admin/` provides a read-only operations
interface for authorized administrators. It calls the protected Express API;
the browser never connects to MySQL. The public Flutter application remains a
separate client of the same backend and database.

```text
admin/
  index.html
  netlify.toml
  package.json
  src/
    App.jsx
    main.jsx
    styles.css
```

The admin API is mounted under `/api/admin`:

- `POST /login` issues a 30-minute signed bearer token.
- `GET /dashboard` returns verified Taguig system statistics and the latest run.
- `GET /incidents` and `GET /incidents/:id` return verified records and provenance.
- `GET /ingestion-runs` and `GET /ingestion-runs/:id` return recorded run history.
- `GET /sources` returns the configured trusted-source allowlist.
- `GET /system-status` reports API, database, history, Gemini configuration, and scheduler configuration state.

All endpoints other than login require the bearer token. Set `ADMIN_USERNAME`,
`ADMIN_PASSWORD`, and `ADMIN_TOKEN_SECRET` only in the backend environment.
`ADMIN_TOKEN_SECRET` must contain at least 32 bytes of entropy. Set
`ADMIN_FRONTEND_ORIGIN` to the exact deployed admin origin and allow that origin
in `CORS_ORIGINS` (or the existing frontend-origin settings). Never put these
server-only values in Vite variables. The frontend only needs
`VITE_API_BASE_URL`, the public backend origin, such as
`https://urbandanger.netlify.app`.

### Local development

1. Copy `backend/.env.example` to `backend/.env` and configure the existing backend values plus the three admin server variables. Generate a unique signing secret locally, for example with `openssl rand -base64 48`; never commit its value.
2. Apply `backend/migrations/003_ingestion_runs.sql` to the development database. The append-only `ingestion_runs` table records counters, timestamps, terminal status, duration, and a sanitized failure category; it does not alter incident records.
3. Start the API with `npm --prefix backend start`.
4. In `admin/`, copy `.env.example` to `.env.local`, set `VITE_API_BASE_URL` to the local backend origin, then run `npm install` and `npm run dev`.
5. Sign in with the server-side admin credentials. Tokens remain in memory and expire after 30 minutes.

### Separate Netlify deployment

Create a separate Netlify site from this repository with the base directory set
to `admin`. Its build command is `npm run build`, publish directory is `dist`,
and its only required frontend variable is `VITE_API_BASE_URL` pointing at the
deployed public backend origin. Configure `ADMIN_USERNAME`, `ADMIN_PASSWORD`,
`ADMIN_TOKEN_SECRET`, and `ADMIN_FRONTEND_ORIGIN` only on the backend site; add
the admin origin to the backend CORS allowlist. Apply the migration to the
production database through the normal database-change procedure before
releasing code that records runs. No deployment is performed by this workflow.

The public and admin interfaces use the same backend and database but remain
separate applications. Incident endpoints are read-only and limited to
verified, provenance-backed Taguig records. Missing coordinates remain NULL.
Run history begins only after the migration and recorder are active; no past
runs are fabricated. Per-source collection counts are not stored and are shown
as unavailable. Gemini status indicates configuration only, not provider
connectivity. Dashboard figures are application statistics, not official crime
rates or safety scores. The in-memory login rate limiter is best-effort per
backend process; production edge-level rate limiting is recommended for
additional protection.
