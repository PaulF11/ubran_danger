# Urban Danger Compliance Audit and Safe Cleanup

> Historical audit record. Earlier production URL observations below are
> superseded by the current official targets documented in
> [URBAN-DANGER-PRODUCTION-DIAGNOSTIC-REPORT.md](../URBAN-DANGER-PRODUCTION-DIAGNOSTIC-REPORT.md):
> `https://urbandanger.netlify.app/` (Public User + API) and
> `https://urban-danger-admin.netlify.app/` (Admin Dashboard). Historical
> references are retained for context only, not as current deployment targets.

## Audit basis

This report records a source-level audit and local validation performed on 2026-11-06. The attached revised paper was available in the conversation, but `GROUP 7 NEW FORMAT (1).docx` is not present in the workspace, so exact paper page numbers and diagram labels could not be independently extracted. Requirements below are identified by the feature or paper topic named in the audit request; page-level compliance remains `UNVERIFIABLE` until the document is available as a local file or PDF.

The repository already contained uncommitted changes before cleanup. Those files were preserved and were not reset, reverted, or reformatted. No migration, production write, manual scan, deployment, or credentialed administrator action was performed.

## Executive summary

## Phase 2 corrections (2026-11-08)

### Public application loading issue — MATCH after correction

The production browser trace identified the root cause. The deployed Flutter
bundle at `https://urbandangerintel.netlify.app` was requesting
`/api/analytics/summary` and `/api/incidents` from the application host. Those
requests returned HTTP 404 because the canonical API function is hosted at
`https://urbandanger.netlify.app`; the application host did not have the
bundled function rewrite active. The Flutter shell therefore remained on its
initial loading state in the deployed build.

The correction is deliberately configuration-only: [api_config.dart](../lib/core/api_config.dart)
now defaults to the API host, the existing [build-web.js](../scripts/build-web.js)
production-origin guard continues to require that host, and the production
analytics test now asserts the canonical endpoint. No incident fallback data,
fake response, database migration, or loading-indicator bypass was added.
The existing route test's missing statement terminator was also corrected so
the requested Flutter test and analyzer validation can execute.
Analytics and incident requests already have bounded timeouts, explicit
failure messages, and retry actions; map tiles and route services remain
independent of the home analytics request.

The live API was read-only checked at `/api/health`, `/api/incidents?view=recent`,
and `/api/analytics/summary`, all of which returned HTTP 200. A new production
deployment is still required before the live Flutter bundle reflects this
correction; no deployment was performed in this phase.

### Canonical Netlify URLs — MATCH after correction

Evidence from read-only probes:

- Public application: `https://urbandangerintel.netlify.app`
- Public API: `https://urbandanger.netlify.app`
- Admin application: `https://urban-danger-admin.netlify.app`
- `https://urbandangeradmin.netlify.app` returned Netlify 404 and is obsolete.

The source configuration and README now describe these roles consistently.
The root and admin Netlify files were not converted into a new site and no
deployment architecture was changed. The public application's bundled
`/api` rewrite is retained for compatible deployments, but the Flutter
production build uses the canonical API origin directly.

The implementation is a real multi-part system, not a paper-only prototype. The public Flutter app, React/Vite admin dashboard, Express API, Netlify functions, MySQL schema/migrations, Gemini extraction provider, trusted-source collector, validation, deduplication, administrator review, OSRM routing, and route-exposure analysis are present.

The largest paper discrepancies are architectural:

- Route intelligence is computed per request in `routeIntelligenceService.js`; there are no `Route`, `RouteIncident`, or `RouteIntelligence` MySQL tables and no route-history persistence.
- `TrustedSource` is configuration/collector data, not a dedicated database entity.
- `RawArticle` is not a dedicated raw-article table. Processed URL state is stored in `ingestion_processed_sources`, while scan candidate results are stored in `admin_scan_candidates`.
- Automated Gemini extraction is not truth confirmation. The code extracts structured candidate fields, then deterministic validation, URL checking, duplicate/conflict checks, and, for manual scans, administrator review determine inclusion.
- Geographic scope in implementation is `Taguig City` plus `Pateros` for route/map validation, while public system status still says `Taguig City, Philippines`. This needs a paper/system wording decision.
- Production browser testing showed the admin login page. The public configured site stayed in its loading state, so live data, map, analytics, route, and API responses remain unverified in this audit.

The safe cleanup completed was one duplicate module import in [routesController.js](../backend/src/controllers/routesController.js). The focused route suite passed after the change. No behavior, endpoint, schema, UI, authentication, ingestion, verification, or deployment setting was changed.

## Existing architecture and execution flow

```text
Flutter public app
  -> /api redirect on public Netlify site
  -> Netlify api function
  -> Express app and controllers
  -> Aiven MySQL

React/Vite admin app
  -> admin same-origin /api proxy
  -> public Netlify API
  -> Express admin routes
  -> Aiven MySQL

Netlify scheduled-ingestion function
  -> authenticated ingest-background function
  -> scheduledIngestionService
  -> automatedIncidentPipeline
  -> trusted-source collector
  -> Gemini extraction
  -> validation, URL check, deduplication/conflict checks
  -> verified incident persistence or manual scan candidate review
```

Primary implementation surfaces:

- Public shell and navigation: `lib/main.dart`; public screens under `lib/screens/`.
- Public API clients: `lib/services/incident_service.dart`, `analytics_service.dart`, `route_service.dart`, and map/location services.
- Express registration: `backend/src/app.js`.
- Public endpoints: `/api/health`, `/api/categories`, `/api/incidents`, `/api/analytics/summary`, `/api/routes/route`, `/api/system/status`.
- Admin endpoints: `/api/admin/login`, `/api/admin/dashboard`, `/api/admin/incidents`, `/api/admin/incidents/:id`, `/api/admin/ingestion-runs`, `/api/admin/ingestion-runs/:id`, `/api/admin/sources`, `/api/admin/system-status`, `/api/admin/run-scan`, `/api/admin/scan-candidates`, and candidate approve/reject endpoints.
- Scheduled functions: `netlify/functions/scheduled-ingestion.js` and `netlify/functions/ingest-background.js`.
- Deployment: `netlify.toml`, `admin/netlify.toml`, and `netlify/lib/apiProxy.js`.

## Technology verification

| Paper technology | Evidence | Status |
|---|---|---|
| Flutter public app | `pubspec.yaml`, `lib/`, `build-web.js` | MATCH |
| Node.js backend | `backend/package.json`, CommonJS services | MATCH |
| Express | `backend/src/app.js` | MATCH |
| MySQL | `mysql2`, database pool, SQL schema/migrations | MATCH |
| Netlify | root/admin Netlify configuration and functions | MATCH |
| Aiven | `backend/src/config/database.js` and bundled CA configuration | MATCH, connection not production-tested |
| Google Gemini | `backend/src/services/extractionProviders/geminiProvider.js` | MATCH, key not exercised |
| OpenStreetMap/OSRM | `osrmRoutingService.js`; Photon location search in Flutter service | MATCH for configured providers |

The repository previously contained two URL families. Live read-only probes establish
the canonical application/API/admin roles above; `urbandangerinteladmin.netlify.app`
is an older still-serving admin alias and `urbandangeradmin.netlify.app` is obsolete.

## Public application compliance matrix

| Requirement | Actual implementation and evidence | Status | Test/evidence |
|---|---|---|---|
| View incident list | `IncidentsScreen` calls `IncidentService.fetchIncidents`; API is `/api/incidents` | MATCH | Source and Flutter tests; live data unverified |
| Search and filter incidents | Client-side search plus category/severity filters in `IncidentsScreen` | MATCH | Source and widget tests |
| Incident details | Incident cards open `incident_details_screen.dart` | MATCH | Source and widget tests |
| Incident map | `MapScreen` and map services load incident coordinates | PARTIALLY MATCHED | Source; public live app remained loading |
| Verified markers | Backend scope uses `VERIFIED_INCIDENT_SCOPE`; map receives verified feed | MATCH | Source and API tests |
| Analytics | `/api/analytics/summary` and home analytics widgets | MATCH | Source and analytics tests |
| By category | `analyticsController` groups category | MATCH | Source/API tests |
| By severity | `analyticsController` groups severity | MATCH | Source/API tests |
| By barangay | `analyticsController` groups location barangay | MATCH | Source/API tests |
| By month/time period | `analyticsController` groups `DATE_FORMAT(incident_date, '%Y-%m')` | MATCH | Source/API tests |
| Analyze route | `RouteService` posts to `/api/routes/route`; backend uses OSRM | MATCH | 26 route tests passed |
| Origin/destination | Map screen supplies validated coordinates | MATCH | Route controller/API tests |
| Generate route | OSRM-compatible routing service returns geometry, distance, duration | MATCH | Route controller/API tests |
| Nearby incidents | `analyzeRouteSafety` compares verified geocoded rows to route segments | MATCH | Route intelligence tests |
| Route intelligence | Structured `routeIntelligence` response with category, counts, incidents, score | MATCH | Route API tests |
| ETA | Provider duration for car/walking/bicycle; configured estimates for motorcycle/truck | PARTIALLY MATCHED | Source tests; not live-tested |
| Incident warnings | Flutter `RouteSafetySummary` shows nearby reports and severity counts | MATCH | Widget tests |
| Route recommendations | `recommendRoute` selects lower exposure alternatives within 20% distance/duration | MATCH | Route intelligence tests |
| System information | `ProfileScreen` and `/api/system/status` expose methodology/status information | PARTIALLY MATCHED | Source; live content unverified |
| Coverage/methodology | UI and docs state verified-data limitations and coverage | PARTIALLY MATCHED | Source; paper page unavailable |

The public API returns verified records only. Recent, historical, and all views are selected by `view`; the map uses `all`, while the home feed uses `recent`.

## Incident collection pipeline

| Stage | Actual behavior | Status |
|---|---|---|
| Trusted sources | `sourceCollectorService` normalizes configured trusted hosts/URLs and rejects unapproved hosts | MATCH, but configuration-based rather than a `TrustedSource` table |
| Collection | RSS/feed and article retrieval are performed by `collectTrustedSources` | MATCH |
| Raw article storage | Article content is passed through the run; processed URLs are tracked in `ingestion_processed_sources`; no raw article table was found | PARTIALLY MATCHED / paper correction needed |
| Gemini extraction | Sends article text to `generateContent`; asks for category, city, barangay, dates, description, severity, coordinates, location description, and source evidence; explicitly forbids inference | MATCH |
| Automated validation | `validateCandidate` checks required facts, Taguig/category/severity/date/source rules and normalizes fields | MATCH |
| Source verification | `checkSourceUrl` uses HEAD, GET fallback, status handling, and manual-review allowance for publisher HTTP 403 | MATCH as source availability checking, not truth confirmation |
| Duplicate detection | `incidentDeduplicationService` builds normalized category/city/barangay/date/location keys and detects conflicts by category/severity | MATCH |
| Automated persistence | Scheduled runs call `insertVerifiedCandidate`, which writes `VERIFIED` only after pipeline verification and database duplicate/conflict checks | MATCH |
| Administrator verification | Manual scans set `persistVerifiedCandidates: false`, save candidate reports, and require explicit approve/reject | MATCH |
| Failed/incomplete extraction | Null extraction becomes `NOT_AN_INCIDENT`; provider/network/database failures become retry or pending results; rate limits stop later extraction for that run | MATCH |
| Ingestion logging | `ingestion_runs` records source, collection, processing, Gemini, verification, duplicate, insertion, error, skip, and duration counts | MATCH |

Gemini does not independently confirm that an incident is true. It is an extraction/classification assistant. The code's source URL check, deterministic validation, duplicate/conflict logic, database persistence, and manual administrator approval are separate controls and must remain distinct in the paper.

## Admin dashboard compliance

The React app implements login, logout/session clearing, dashboard, verified incident listing, search/filter, incident detail, ingestion history, trusted-source display, system status, manual scan, scan result polling, candidate detail, and approve/reject actions. The corresponding backend is `backend/src/routes/admin.js`, `adminDataService.js`, `adminScanService.js`, and `adminScanReviewService.js`.

- Manual Run Scan does trigger the existing collection pipeline through the authenticated background function. It creates a `MANUAL` ingestion run, disables immediate persistence, saves `admin_scan_candidates`, and waits for review.
- Scheduled scanning is independent. The Netlify cron trigger calls the background function with `SCHEDULED`; scheduled runs can persist verified candidates directly.
- Counts are populated from pipeline results into `ingestion_runs`. They are meaningful for the implemented stages, but the paper should use the actual names: `pre-filtered`, `processed`, `Gemini requests`, `verification failures`, `duplicates`, `inserted`, and `errors` are not interchangeable.
- Source monitoring reads configured source data through `adminDataService`; there is no dedicated trusted-source table.
- Approving a candidate calls `insertVerifiedCandidate`, and only after successful insertion marks the candidate `APPROVED` with an `incident_id`. Rejection changes review status to `REJECTED`; it does not create a public incident.

## Route intelligence audit

Origin and destination are posted as latitude/longitude coordinates. The controller rejects points outside the configured Taguig map envelope, obtains OSRM-compatible routes, validates every returned coordinate, loads verified geocoded incidents from MySQL, and analyzes each route and alternative.

Exact implemented formula:

```text
severity weight:
  HIGH = 3
  MEDIUM = 2
  LOW = 1
  unknown = 1

recency weight:
  age <= 30 days = 1.5
  age <= 365 days = 1.25
  older or invalid/missing date = 1

proximity factor = max(0, 1 - distance_from_route / threshold)

incident exposure weight = severity weight * recency weight * proximity factor
route weighted exposure score = round(sum(nearby incident exposure weights), 2)
```

The default proximity threshold is 500 metres, configurable only by backend environment and bounded at 5,000 metres. A tiny comparison epsilon is used for exact-boundary inclusion. Incidents must have verification status `VERIFIED`, city `Taguig City` or `Pateros`, valid in-scope coordinates, and a unique ID. Unusable coordinates are excluded from comparison.

Alternatives are eligible only when exposure is lower and both distance and duration are no more than 20% above the primary route. A recommendation is suppressed when incident comparison is unavailable or no geocoded verified incidents exist. Motorcycle and truck durations are estimates, not live traffic or vehicle-specific provider durations.

There is no database persistence of `Route`, `RouteIncident`, or `RouteIntelligence` records. The ERD must either remove those entities or label them as conceptual/request-time objects. The UI explicitly says the result is based on currently verified incidents, is limited, is not a prediction, and is not a safety guarantee. This part matches the stated limitation.

## Database and ERD comparison

Actual base entities are `users`, `incident_categories`, `locations`, and `incidents` in `urban_danger_db.sql`. Migrations add `ingestion_runs`, `ingestion_processed_sources`, `admin_scan_candidates`, and `incident_source_references`. Existing keys and relationships include category-to-incident, optional location-to-incident, ingestion-run-to-scan-candidate, and scan-candidate-to-incident.

Differences from the eleven-entity paper ERD:

- `Admin`: represented by `users` plus environment-backed admin authentication; no table named `Admin`.
- `TrustedSource`: no table; configured allowlist/collector data is used.
- `IngestionRun`: implemented as `ingestion_runs`.
- `RawArticle`: no raw article table; URL processing and scan candidate data are separate.
- `IncidentCategory`: implemented as `incident_categories`.
- `Location`: implemented as `locations`, with nullable coordinates and source provenance.
- `Incident`: implemented as `incidents`, with verification, provenance, source publication date, and optional location.
- `IncidentSource`: implemented as `incident_source_references` only for supporting references; primary source fields remain on `incidents`.
- `Route`, `RouteIncident`, `RouteIntelligence`: not database entities; computed in the route request.

The schema includes primary keys, foreign keys, indexes, nullable location/provenance fields, uniqueness on category/source references, and a verified-provenance check. The production database was not inspected directly because no safe read-only database credential/session was provided; conclusions are from the checked-in schema and migrations.

## DFD, flowchart, and use-case findings

The implemented flow supports trusted-source collection, article retrieval, Gemini extraction, pre-filtering, validation, URL checking, deduplication/conflict checks, scheduled persistence, manual candidate storage, administrator review, and public verified feeds. Any paper diagram that shows Gemini directly verifying truth, raw articles as a persistent table, or route analysis writing route entities is inaccurate.

The paper should also show:

- separate scheduled and manual ingestion branches;
- `ingestion_processed_sources` and run metrics;
- the manual candidate review gate;
- the public/admin Netlify proxy boundaries;
- request-time route analysis and OSRM/Photon dependencies;
- no ordinary-user incident submission path;
- source URL and geographic provenance checks.

## Local literature and scope

PSA OpenSTAT and the PSCCS are supporting statistical/classification references. Their national aggregates must not be presented as individual Taguig records or coordinates. The Southern Police District January 2024 report is likewise supporting local literature unless an explicit importer uses it; no application importer or source registration for that PDF was found in the inspected code. Its 796 aggregate incidents, including 202 Peace and Order and 594 Public Safety, must not be converted into fabricated incident rows or map markers.

The implementation restricts public incident queries through `VERIFIED_INCIDENT_SCOPE`, uses Taguig barangay parameters, and route validation accepts Taguig City and Pateros. The paper's “Taguig only” limitation therefore needs clarification: either Pateros is an intentional adjacent coverage extension and must be documented, or the implementation must be narrowed in a separately approved requirements change. This cleanup did not alter coverage.

## Live production testing

Read-only browser checks performed:

- `https://urbandangerintel.netlify.app`: the deployed bundle rendered the shell but requested its API from the wrong origin; both API requests returned HTTP 404 and the home data state did not resolve.
- `https://urban-danger-admin.netlify.app`: administrator login page loaded. No credentials were used, so protected operations remain unverified.
- `https://urbandanger.netlify.app/api/health`, `/api/incidents?view=recent`, and `/api/analytics/summary` returned HTTP 200. No production writes were performed.
- `https://urbandangeradmin.netlify.app`: Netlify 404; obsolete URL.

No production records were created, changed, deleted, or scanned. Aiven connectivity, Gemini calls, API response status, map tile loading, and browser network/console behavior beyond the observed loading/404 states require an approved environment test with the canonical URLs and credentials.

## Cleanup completed

### Modified file

- `backend/src/controllers/routesController.js`: consolidated two imports of `osrmRoutingService` into one module import and one destructure. This removes redundant module resolution syntax without changing exports, calls, responses, routing behavior, or error handling.

### Deliberately not changed

- Exported but internally unused route helper `distanceFromRouteMeters`: retained because module exports can be consumed indirectly.
- Repeated analytics/admin SQL patterns: not consolidated because query shape, aliases, and response contracts are externally observable.
- Ingestion, Gemini, validation, deduplication, verification, authentication, map, route formula, schema, deployment URLs, and UI: left unchanged due to behavior and production risk.
- Dependencies and CSS: no confirmed unused dependency or safe dead-style removal was established.

## Baseline and regression results

- Backend baseline: `npm test` passed 161 of 161 executed tests, with 1 skipped, 0 failed; 162 tests were reported.
- Admin baseline: `npm run build` succeeded; Vite produced a 253.57 kB JavaScript asset and 19.61 kB CSS asset before gzip.
- Flutter baseline: `flutter analyze` was blocked by three duplicate-package type errors under `admin/node_modules/.../urban_danger_netlify`, outside the main source tree. This is a workspace dependency artifact and was not modified.
- Focused post-cleanup validation: `node --test tests/route-intelligence.test.js tests/routes-api.test.js` passed all 26 tests.
- Full post-cleanup backend rerun: passed 161 of 161 executed tests, with 1 skipped and 0 failed; the complete suite remains green after cleanup.
- Production database and Gemini: not exercised; no credentials or approved mutation-free integration harness was available.

### Phase 2 validation

- Backend full suite: `npm test` passed 161 of 162 tests, with 1
  intentional conditional skip and 0 failures.
- Route tests: `node --test tests/route-intelligence.test.js
  tests/routes-api.test.js` passed all 26 tests.
- Flutter diagnostics: `flutter analyze --no-pub lib test` reported no issues.
  Workspace-wide analysis still reports six pre-existing duplicate-package
  errors under `admin/node_modules/urban_danger_netlify`; those generated
  nested package files are outside the application source.
- Flutter tests: `flutter test --no-pub` passed all tests.
- Public Flutter build: `npm run build:web` succeeded. The generated
  `build/web/main.dart.js` contains `https://urbandanger.netlify.app` and no
  application-host API origin.
- Admin build: `admin/npm run build` succeeded.
- Production API checks: health, recent incidents, and analytics returned HTTP
  200 without credentials or writes.
- Production CORS check: the API currently allows the canonical admin origin
  but does not return `Access-Control-Allow-Origin` for
  `https://urbandangerintel.netlify.app`. The existing Netlify production
  environment must be updated to the values represented in
  [backend/.env.example](../backend/.env.example) before deploying the rebuilt
  public bundle; this cannot be changed safely without deployment access.
- Production route check: a read-only car route request returned HTTP 200 and
  a successful structured response; no incident data was created or changed.
- Map check: an OpenStreetMap tile HEAD request returned HTTP 200.
- Production-like browser check: the built web bundle served through
  `local-preview-proxy.js` removed the loading shell after API initialization
  and emitted no browser console errors. Direct static hosting intentionally
  fails CORS because it is not the configured preview proxy.
- Skipped test: `backend/tests/gemini-taguig-extraction.test.js` contains one
  conditional live integration test, skipped unless
  `RUN_LIVE_GEMINI_INTEGRATION=true`. It requires Gemini credentials and
  read-only database access to locate an existing verified fixture. This is a
  genuine external-integration coverage gap, not a failed test; the local
  provider and pipeline tests remain executable without credentials.

## Phase 2 architecture findings

### Geographic coverage — CONTRADICTION requiring a group decision

The application intentionally supports Taguig City and Pateros in
[verifiedIncidentScope.js](../backend/src/constants/verifiedIncidentScope.js),
the map bounds, route validation, public copy, and incident fixtures. The
implementation does not support Taguig-only coverage. Pateros data should not
be deleted or filtered out automatically. The research paper should either
document Pateros as an adjacent supported area or the group should approve a
separate requirements change to narrow the application.

### Route history persistence — MISSING

Route analysis is computed at request time by
`routeIntelligenceService.js` from OSRM geometry and verified incidents. The
schema has no `Route`, `RouteIncident`, or `RouteIntelligence` history tables,
and no route result is persisted. Recommendation A is to implement those
tables and retention/API behavior only after the group approves route-history
persistence. Recommendation B, if history is not a requirement, is to correct
the ERD and paper to describe request-time analysis. No migration was run.

### Trusted sources — PARTIALLY MATCHED

Trusted sources are configuration and collector allowlists
(`TRUSTED_SOURCE_HOSTS`, `SOURCE_COLLECTION_TARGET_URLS`, and approved host
constants). Processed URL state and scan candidates are stored in
`ingestion_processed_sources` and `admin_scan_candidates`; there is no
`TrustedSource` entity. Enabled sources are those permitted by the configured
allowlist and target URL validation. Administrators can manage scan/review
operations, but there is no CRUD source registry. The paper/ERD should describe
configuration-based source registration unless a source-management feature is
approved.

### Incident verification — MATCH

Gemini performs structured candidate extraction only. Deterministic validation
checks required fields, geography, dates, source provenance, and category/
severity. URL availability, duplicate detection, and conflict detection then
produce `VERIFIED`, `REJECTED`, or `PENDING_REVIEW`. Scheduled ingestion may
persist only verified candidates; manual scan candidates are stored for
administrator approval, and approval re-runs verification before persistence.
Gemini is not the final authority and ordinary users cannot publish incidents.

## Remaining decisions

1. Update the existing API site's CORS environment values, then deploy the
   corrected public Flutter build to the existing `urbandangerintel` site; do
   not create a site.
2. Decide whether Pateros is an intentional coverage extension.
3. Decide whether route-history persistence is an approved requirement.
4. Update the research paper/ERD to reflect configuration-based trusted
   sources and the actual verification/review workflow.
5. Provide an approved credentialed environment if live Gemini integration
   coverage is required.

## Overall conclusion

The system substantially implements the described public, administrative, ingestion, verification, mapping, routing, and deployment capabilities. It is `PARTIALLY MATCHED` overall because the paper's ERD and some architecture descriptions overstate persistence and source entities, while the actual system has additional manual-review and provenance controls that the paper must document. The most important defense corrections are to separate extraction from truth verification, represent manual versus scheduled ingestion accurately, remove or relabel non-persistent route entities, clarify Pateros coverage, and reconcile canonical Netlify URLs.

The code cleanup is complete for the confirmed safe candidate and remains intentionally small. No deployment should occur until the paper corrections, canonical deployment URLs, public loading failure, and Flutter duplicate-package analysis issue are reviewed.