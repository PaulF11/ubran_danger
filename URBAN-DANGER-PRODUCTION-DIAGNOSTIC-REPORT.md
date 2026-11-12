# Urban Danger Production Diagnostic Report

> Updated 2026-11-12. The only official production websites are
> `https://urbandanger.netlify.app/` (Public User + Backend API) and
> `https://urban-danger-admin.netlify.app/` (Admin Dashboard). The previously
> investigated `urbandangerintel.netlify.app` URL is not a deployment target
> or blocker.

## Executive Result

The two official Netlify sites are identified by their live Netlify site IDs.
Both websites use the same backend API and its healthy database connection.
Read-only health, incidents, categories, analytics, and route-analysis checks
passed. The Admin login page loads. The Public Flutter shell loads, but its
incident view showed an unavailable state during this browser pass. The local
ports were not running. Those UI/local checks remain unverified and are not
reported as passes. No deployment was necessary, and no site/domain or
database data was changed.

## Diagnostic Record

| Item | Evidence and result |
| --- | --- |
| Public User + API identity | `https://urbandanger.netlify.app/`; Netlify site ID `95e85e86-ef4d-4fdd-8cc1-6e42dad4825b`, confirmed in Netlify-injected live HTML metadata. |
| Admin identity | `https://urban-danger-admin.netlify.app/`; Netlify site ID `c602d0e9-46c6-479a-832b-9d34ee9c9fd4`, confirmed in Netlify-injected live HTML metadata. |
| Public Flutter API origin | `lib/core/api_config.dart` defaults to `https://urbandanger.netlify.app`; live `main.dart.js` contains this origin and not the earlier URL. |
| Netlify build/config | Root config builds `build/web`, bundles `netlify/functions`, and rewrites `/api/*` to the API function. Admin config builds `admin/dist` and proxies `/api/*` to the same API. |
| API/database | Public `/api/health` and `/api/health/db` both return HTTP 200. The latter reports `Database connection OK`. |
| Incidents/categories/analytics | Public API returns HTTP 200: 5 recent incidents (all 5 have coordinates), 11 categories, and analytics total 13. |
| Admin shared backend | Admin `/api` proxy returns HTTP 200 for health, DB health, incidents, categories, and analytics, with matching records and counts. |
| Route analysis | Read-only `POST /api/routes/route` returned HTTP 200 with route geometry and verified incident context. No data was written. |
| Public User UI | Root page and Flutter UI render. The incident view displayed an unavailable state even though direct API calls succeed; live search, filters, details, and map-marker rendering were not certified. |
| Admin UI | Restricted login page renders. No authorized credentials were available; protected dashboard functionality was not tested. |
| Local Public app | `http://localhost:5191/` loads the Flutter app. Its proxied health, DB health, and incidents endpoints return HTTP 200. The Incidents screen remained visually empty in this pass; interactive search/filter/detail/map UI is not certified. |
| Local Admin | `http://localhost:5173/` loads the restricted login page. Its Vite proxy returns HTTP 200 for health, DB health, incidents (5), categories (11), and analytics (13). No credentials were used. |

## Shared Database and Data Safety

Both frontends route requests to the same API site; neither accesses MySQL
directly. The live `/api/health/db` response confirms that backend's existing
database connection is healthy. Existing backend configuration uses the Aiven
MySQL TLS CA. No credentials were exposed, and no incident writes, migrations,
seeds, manual scans, or review actions were performed.

## Deployment

- Public User/API site ID: `95e85e86-ef4d-4fdd-8cc1-6e42dad4825b`.
- Latest production deployment: `6af49d3ceaa28c5849e4a26b`
  (`ready`, production; published Nov. 11, 2026), confirmed through the
  Netlify API.
- Latest Admin production deployment:
  `6aec1584fd8b5b5485b1ffe8` (`ready`, production; published Nov. 5, 2026).
- The live site currently serves the Flutter app and its `/api` routes. Since
  the required combined build and API endpoints are present, no new deployment
  was made.
- The Admin source did not need a change, so it was not redeployed.
- No old site/domain was deleted, disconnected, or replaced.

## Remaining Verification

The official site identities, local app shells, and shared backend are
confirmed. To close every acceptance item, rerun the Public User's
incident/search/filter/detail and map interactions after resolving the current
UI unavailable state, and test protected Admin features with an authorized
session. Local run instructions are in
[LOCAL-AND-LIVE-SHARED-SETUP.md](./LOCAL-AND-LIVE-SHARED-SETUP.md).
