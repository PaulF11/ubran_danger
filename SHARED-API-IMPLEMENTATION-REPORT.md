# Shared API Implementation Report

## Architecture

- Flutter's `API_BASE_URL` is an origin without `/api`; `IncidentService`, `AnalyticsService`, and `RouteService` append `/api/...` endpoints.
- Official Public User + Backend API site: `https://urbandanger.netlify.app/`, Netlify site ID `95e85e86-ef4d-4fdd-8cc1-6e42dad4825b`. The Flutter app and Netlify Functions are deployed together; `/api/*` reaches the Express API.
- Official Admin Dashboard site: `https://urban-danger-admin.netlify.app/`, Netlify site ID `c602d0e9-46c6-479a-832b-9d34ee9c9fd4`. Its `/api/*` proxy targets the Public User site's backend.
- Both applications use that one backend and its existing Aiven MySQL connection.
- Local Public User: `http://localhost:5191`, served through `scripts/local-preview-proxy.js`; its `/api/*` requests are forwarded to the fixed API host.
- Local Admin: `http://localhost:5173`, with Vite `/api` proxy to the same API host. Authorization headers are preserved.
- No local backend or MySQL is required for either local app.

## Corrected Deployment Target

The two official production websites are the Public User/API site and the
separate Admin Dashboard listed above. The former deployment investigation
treated `urbandangerintel.netlify.app` as the Public target; that URL is not a
required target. It is not treated as a blocker, and no site/domain was
deleted, disconnected, or replaced.
The backend's old-origin CORS compatibility entry is retained; it does not
change the official production target.

## Production API Verification

| Check | Current result |
| --- | --- |
| Public User/API root | HTTP 200; Flutter app title and app UI load |
| `GET /api/health` | HTTP 200 |
| `GET /api/health/db` | HTTP 200, database connection OK |
| `GET /api/incidents?view=recent` | HTTP 200, 5 records; all 5 have coordinates |
| `GET /api/categories` | HTTP 200, 11 categories |
| `GET /api/analytics/summary` | HTTP 200, 13 incidents |
| `POST /api/routes/route` (read-only route analysis) | HTTP 200; route geometry and verified-incident analysis returned |
| Admin `/api` proxy, health/db/incidents/categories/analytics | HTTP 200; same 5 records, 11 categories, 13-incident summary |

The Public and Admin sites return the same recent records and analytics summary
through their shared API. The database-health endpoint confirms that the
backend's existing database connection is live. No database writes or
migrations were performed.

The API deployment’s function set remains `api`, `ingest-background`, and `scheduled-ingestion`. Production variable names were checked without printing values; DB connection health remains good. No database writes or migrations were performed.

## Browser and Functional Results

- Live Public User at `https://urbandanger.netlify.app/` loads the Flutter application. The current bundle contains the correct API origin, and direct read-only endpoint checks succeed as listed above.
- The Public app's incident view showed an unavailable/offline state during the browser pass, despite the API feed returning 5 records. Therefore live UI search, category/severity filters, incident details, and map markers were not certified in this pass. Route analysis was verified directly through its read-only API endpoint, not through the UI.
- Live Admin at `https://urban-danger-admin.netlify.app/` loads its restricted login page. Its `/api` proxy returned the same health, database-health, incident, category, and analytics results. No authorized credentials were available, so protected dashboard UI was not tested.
- Local Public at `http://localhost:5191` serves the Flutter app; its proxied health, DB health, and recent incidents endpoints return HTTP 200. The browser's Incidents view remained visually empty during this pass, so Public UI search, filters, details, and map markers are not certified.
- Local Admin at `http://localhost:5173` loads its restricted login page; its Vite proxy returns HTTP 200 for health, DB health, incidents (5), categories (11), and analytics (13). No credentials were submitted.
- The public Flutter app has no incident-submission flow in the inspected UI/source. No production record was created or changed.

## Netlify Site Identity and Deployment

The live Netlify-injected metadata in each site's HTML confirms the site IDs:
Public User/API `95e85e86-ef4d-4fdd-8cc1-6e42dad4825b`, Admin
`c602d0e9-46c6-479a-832b-9d34ee9c9fd4`. The root `netlify.toml` builds
`build/web` and deploys `netlify/functions`; the Admin config builds `admin/dist`
and proxies `/api/*` to the shared API origin.

The known successful Public User/API deployment is
`6af49d3ceaa28c5849e4a26b` (latest, ready, production; published Nov. 11,
2026), confirmed through the Netlify API. The latest Admin deployment is
`6aec1584fd8b5b5485b1ffe8` (ready, production; published Nov. 5, 2026).
Because the Public build and API endpoints are already live, no additional
deployment was made. The Admin source was unchanged, so it was not redeployed.

## Builds and Tests

- `flutter analyze lib test`: passed, no issues.
- `flutter test`: passed, 44 tests. Flutter Map emitted its normal OpenStreetMap usage warning; the route-mode widget test emitted hit-test warnings but passed.
- `npm run build:web`: passed; release bundle uses the production API origin.
- `npm --prefix admin run build`: passed.
- Backend suite: 161 passed, 0 failed, 1 opt-in live Gemini integration skipped.
- Focused production CORS test: passed for all exact configured origins, rejects an unlisted origin, and confirms credentials are not enabled.
- Whole-workspace `flutter analyze` still reports duplicate-type diagnostics under nested `admin/node_modules/.../urban_danger_netlify`; the actual Flutter `lib` and `test` trees analyze cleanly.

## GitHub and Netlify Deployment

- Production CORS fix commit: `7afaf1d` (`fix: allow exact Public User CORS origin`), pushed normally to `main`.
- Latest deployment: `6af49d3ceaa28c5849e4a26b`, state `ready`, production context, URL `https://urbandanger.netlify.app`, published Nov 11, 2026. It deployed the Flutter build and the three existing functions to the verified site ID.
- Latest Admin deployment: `6aec1584fd8b5b5485b1ffe8`, state `ready`, production context, URL `https://urban-danger-admin.netlify.app`, published Nov 5, 2026.
- The pushed `main` commit did not automatically deploy the API; no Git branch/commit is attached to API deploy records. A manual deployment was required and completed.
- No extra deployment was necessary for this documentation correction. The Admin site was not redeployed.
- The previously reported CORS source change is on GitHub `main` at `7afaf1d`. The current documentation changes still need to be committed and pushed.

## Remaining Verification

The Public/API and Admin site identities, local app shells, and shared backend
endpoints are confirmed. Still unverified: the Public User's rendered
incident/map/search/filter/detail interactions and protected Admin dashboard
after an authorized sign-in. No old domain/site was changed or removed.
