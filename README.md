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
