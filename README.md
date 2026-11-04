# Urban Danger

Urban Danger is a Flutter application for Taguig City and Pateros, backed by an
Express API on Netlify Functions and an Aiven-compatible MySQL database.

For maintainers, see [architecture](docs/ARCHITECTURE.md),
[incident data](docs/INCIDENT-DATA.md), and [routing](docs/ROUTING.md).

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
- Netlify's built-in `URL`, used to address the background function

The default safe discovery set includes Google News RSS and approved original
publishers such as GMA, PNA, Philstar, and Manila Times when those sources are
explicitly allowed and still satisfy the same strict provenance checks. The
collector supports expanded publisher allowlists when those publishers are
configured with `TRUSTED_SOURCE_HOSTS` and `SOURCE_COLLECTION_TARGET_URLS`, but
it does not broaden the default discovery set beyond the approved, no-bypass
publishers. Discovery sources remain within a strict host allowlist and still
require source provenance before a candidate can be promoted to a verified
record.

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
point against the configured Taguig City and Pateros coverage bounds. It then
compares the actual route geometry with database incidents that satisfy the
public API's verified provenance and Taguig City/Pateros scope filters.
Incidents without valid coordinates are excluded. The deterministic proximity
threshold defaults to **500 meters** and can be changed with the backend-only
`ROUTE_INCIDENT_PROXIMITY_METERS` environment setting (valid range: greater
than 0 and at most 5,000 meters).

Distance is measured from each incident to every consecutive segment in the
OSRM GeoJSON route using a local equirectangular projection in meters. Each
incident is counted once, including incidents nearest the route's beginning,
middle, or destination. Route results report counts and available incident
details, not an official crime score or a claim about whether a route is safe.
The UI identifies the evidence as the currently verified, limited system
dataset.

OSRM-compatible providers are asked for alternative routes when available.
Each route's complete geometry is analyzed against the same verified,
geocoded Taguig/Pateros incidents. The recommendation compares
proximity-weighted, severity-weighted exposure with incident recency. It
suggests an alternative only when that exposure is lower and its distance and
duration are each no more than 20% above the first route. Missing incident data
or no meaningful alternative yields no recommendation. Risk comparisons are
not safety guarantees or travel-time comparisons.

Car routes use the configured driving profile; walking and bicycle routes use
separate pedestrian and cycling OSRM-compatible profiles. Motorcycle and truck
routes use the motor-vehicle road geometry, with a configurable speed-based
ETA (`ROUTE_MOTORCYCLE_ESTIMATED_SPEED_KMH` and
`ROUTE_TRUCK_ESTIMATED_SPEED_KMH`; defaults are 25 km/h and 20 km/h,
respectively). Those ETAs are explicitly estimates:
they are not motorcycle- or truck-specific routes, do not include live
traffic, and do not account for truck restrictions. The default pedestrian
and bicycle endpoints are community-operated services without availability
guarantees; configure approved, suitably provisioned providers for production.
Place search uses the Photon public demo API, is restricted to results
attributed to Taguig or Pateros and within the displayed map coverage, and is
also subject to that service's usage policy and availability.

## Geographic boundary limitations

The Flutter map uses a simplified OpenStreetMap polygon for Taguig and a
rectangular envelope for Pateros. Backend coordinate checks also use
rectangular envelopes for both cities rather than authoritative municipal
polygons. These are approximate coverage checks, not official boundary
validation; locations or route segments near the edges can be included even
when they fall outside the intended city. Incident publication should continue
to require validated city/barangay and provenance data, and the envelopes
should not be treated as proof of an incident's municipality.

## Foreground location and nearby alerts

The map can request foreground-only location access to show the current
position, use it as a route start, and compare it locally with the already
loaded verified incidents. Location is not sent to the backend, persisted, or
tracked in the background. The location and alert controls are independent; alerts check for verified,
geocoded Taguig City and Pateros incidents within **200 meters**.
Repeated updates are deduplicated in memory by incident ID, with a 50-meter
exit buffer and a 30-minute cooldown. Alert state is not persisted across app
restarts. Local notifications are available on Android and iOS; tapping one
opens its source link when present. Location and nearby alerts run only while
the map is open and the app is foregrounded; the location stream is canceled
when the app leaves the foreground. Manual map exploration and tapped-point
route analysis remain available without location permission.

Android declares coarse/fine foreground location and notification permissions.
iOS requests When-In-Use location permission. Flutter Web uses the browser
Geolocation and Notifications APIs and requires HTTPS, notification support,
and explicit browser permission; notification permission is requested from the
nearby-alert control before the location permission flow. Browser notifications
also require service-worker support. No background location permission or mode
is enabled. To change the nearby alert radius, build with
`--dart-define=NEARBY_ALERT_RADIUS_METERS=200` (the default is 200). The
backend route proximity warning remains configurable with
`ROUTE_INCIDENT_PROXIMITY_METERS` (default 500; maximum 5,000).

## Local validation

From `backend`, run `npm test`. This suite does not call external providers.
The separate `gemini-taguig-extraction.test.js` test performs a read-only Aiven
query and sends stored public-source evidence to Gemini; run it only when
intentionally opted in with `RUN_LIVE_GEMINI_INTEGRATION=true`. From the project
root, run `flutter analyze` and `flutter test`. Netlify's build can be checked
with `npx netlify build` where the Netlify CLI is available.

To preview the existing Flutter Web build with a same-origin local API proxy,
run `node scripts/local-preview-proxy.js` from the project root and open
`http://127.0.0.1:5190`. The proxy binds to loopback and forwards only `/api`
requests to the fixed public API origin. It rewrites the API origin only in the
JavaScript response served locally; it does not modify the build or production
configuration.

The public incident feed defaults to verified incidents from the last 90 days:
`GET /api/incidents?view=recent`. Historical verified records remain in MySQL
and are available through `view=historical`; `view=all` is used by the map for
route-risk context. Incident dates determine these scopes, while source
publication dates remain separate metadata.

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
- `POST /run-scan` starts an optional manual scan using the existing ingestion pipeline and shared MySQL lock.
- `GET /dashboard` returns verified Taguig City and Pateros statistics and the latest run.
- `GET /incidents` and `GET /incidents/:id` return verified records and provenance.
- `GET /ingestion-runs` and `GET /ingestion-runs/:id` return recorded run history.
- `GET /sources` returns the configured trusted-source allowlist.
- `GET /system-status` reports API, database, history, Gemini configuration, and scheduler configuration state.
- `GET /scan-candidates?runId=...` returns non-public candidates for an ingestion run.
- `POST /scan-candidates/:id/approve` and `/reject` record an explicit review decision.

All endpoints other than login require the bearer token. `POST /api/auth/login`
accepts an existing user's email and password, verifies the bcrypt password hash
and ADMIN role, and returns a 30-minute JWT. Set `JWT_SECRET` to a unique secret
with at least 32 bytes of entropy in the backend environment. Existing
`POST /api/admin/login` remains available and continues issuing its original
30-minute token. Set `ADMIN_USERNAME`, `ADMIN_PASSWORD`, and
`ADMIN_TOKEN_SECRET` only in the backend environment for that legacy login;
`ADMIN_TOKEN_SECRET` must contain at least 32 bytes of entropy. Set
`ADMIN_FRONTEND_ORIGIN` to the exact deployed admin origin and allow that origin
in `CORS_ORIGINS` (or the existing frontend-origin settings). Never put these
server-only values in Vite variables. The frontend only needs
`VITE_API_BASE_URL`, the admin site's own origin. The public site's `/api/*`
rewrite invokes its bundled Express API function and backend services directly.
The admin site's same-origin proxy forwards only to the fixed public origin,
`https://urbandangerintel.netlify.app/api/*`; it cannot form a proxy loop and
avoids browser CORS requirements.

### Local development

1. Copy `backend/.env.example` to `backend/.env` and configure the existing backend values plus `JWT_SECRET` and the legacy admin variables if that login is still needed. Generate unique signing secrets locally, for example with `openssl rand -base64 48`; never commit their values.
2. Apply `backend/migrations/003_ingestion_runs.sql`, then `backend/migrations/004_processed_sources_and_scan_metrics.sql`, then `backend/migrations/005_admin_scan_candidates.sql` to the development database. These additive migrations create run history, a hashed source-URL registry, scan metrics, and non-public review candidates; migration 004 safely skips columns that already exist and seeds only URLs from existing VERIFIED incidents without modifying incident rows. Apply them only after reviewing the target schema and taking the project's normal backup precautions.
3. Start the API with `npm --prefix backend start`.
4. In `admin/`, copy `.env.example` to `.env.local`, set `VITE_API_BASE_URL` to the local backend origin, then run `npm install` and `npm run dev`. Production builds use the public API URL in `.env.production`; it contains no server secret.
5. Admin clients can sign in with `POST /api/auth/login` using an existing ADMIN user's email and password, then send `Authorization: Bearer <token>` to `/api/admin` endpoints. Tokens expire after 30 minutes. The existing `/api/admin/login` remains supported.

### Two-site Netlify deployment

The public Flutter Netlify site publishes `build/web`; its `npm run build:web`
command passes `API_BASE_URL` using `--dart-define` and its production value is
`https://urbandangerintel.netlify.app`. The public site's `/api/*` rewrite
invokes `netlify/functions/api.js`, which runs the existing Express backend,
database services, authentication, and API routes on that same site. The
existing scheduled and background ingestion functions remain on this site.

The admin site uses `admin/`, runs `npm run build`, publishes `dist`, and sets
`VITE_API_BASE_URL` to `https://urbandangerinteladmin.netlify.app`. Its
same-origin `/api/*` function forwards requests to the fixed public origin;
there is no separate backend Netlify site and no upstream URL in client code.

Configure `JWT_SECRET`, `ADMIN_USERNAME`, `ADMIN_PASSWORD`,
`ADMIN_TOKEN_SECRET`, and `ADMIN_FRONTEND_ORIGIN` only on the public site's
server environment; add the admin origin to its backend CORS allowlist. Apply
migrations `003`, `004`, and `005` to the production database through the normal database-change
procedure before releasing backend code that reads/writes the new tables. Never put
backend secrets in either frontend site's build variables. The public site's
scheduled ingestion functions, if enabled, require their separate server-side
ingestion/database configuration. No database migration is performed by this
workflow.

The public Flutter and admin React interfaces share this two-site deployment
and database while remaining separate applications. Their visual identity uses
a monochrome location-and-route mark; editable SVG variants and install icons
are maintained in `assets/brand/`. Incident endpoints are read-only and limited
to verified, provenance-backed
Taguig City and Pateros records. Missing coordinates remain NULL.
run history begins only after the migrations and recorder are active; no past
runs are fabricated. Previously verified source URLs and articles handled by
the pipeline are skipped before Gemini; transient rate-limit, timeout, and
database failures remain retryable. The first 429 pauses remaining Gemini
requests for that scan. Per-source collection counts are not stored and are shown
as unavailable. Gemini status indicates configuration only, not provider
connectivity. Dashboard figures are application statistics, not official crime
rates or safety scores. The in-memory login rate limiter is best-effort per
backend process; production edge-level rate limiting is recommended for
additional protection.
