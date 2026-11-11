# Shared API Implementation Report

## Cause and Fix

- Flutter's API base is an origin, without `/api`: `ApiConfig` defaults to `https://urbandanger.netlify.app`, while services construct `/api/incidents`, `/api/categories`, `/api/analytics/summary`, and `/api/routes/route`.
- The earlier localhost:3000 command was wrong, but the verified Flutter run already used the production host. Its browser requests failed because the deployed API did not return `Access-Control-Allow-Origin` for `http://localhost:5191`; Chrome logged a CORS block and the app stayed on its loader.
- Backend source now allows the exact development origins `http://localhost:5191` and `http://localhost:5173`, without wildcards or credentialed CORS. That change is on GitHub `main`, but the live API has not yet served the new headers.
- Until that deployment can be verified, the local preview proxy rewrites only the locally served Flutter bundle and forwards API traffic to the fixed host `https://urbandanger.netlify.app`. It supports `LOCAL_PREVIEW_PORT=5191`; no local backend or database is used.
- Admin remains unchanged: Vite proxies `/api/*` to `https://urbandanger.netlify.app`, preserving methods and authorization headers.

## Verified API Data

| Request | Result |
| --- | --- |
| Production `/api/health` | 200, API running |
| Production `/api/health/db` | 200, database connection OK |
| Production `/api/incidents?view=recent` | 200, 5 records |
| Production `/api/categories` | 200, 11 categories |
| Production `/api/analytics/summary` | 200, 13 total incidents |
| Admin dashboard without token | 401, authentication required |

The deployed Public site currently requests `https://urbandangerintel.netlify.app/api/incidents?view=recent` and `/api/analytics/summary`; both returned 404 in Chrome. The API host itself returned 200 for those routes. The live Admin site still renders its login interface.

## Local Browser Tests

- Flutter: `http://localhost:5191` renders the Home, Incidents, and Map tabs, verified records and map markers. Requests visible in Chrome use `http://localhost:5191/api/...`; the local preview proxy forwards them to `https://urbandanger.netlify.app/api/...` and responses returned 200.
- Home analytics displayed 13 verified incidents, including 8 High. The recent feed displayed 5 records. The map loaded 13 incident markers.
- Incident search for “Robbery” returned one record; category Robbery plus High severity also returned one record. Opening the incident showed its source, verification, location, severity, and details.
- Route analysis returned HTTP 200 for a car route and included incident comparison. Photon place search returned HTTP 200 with three Taguig results.
- No public incident-submission flow was found in the Flutter UI/source; no production record was created or changed.
- Admin: `http://localhost:5173` rendered the login interface. Its proxy returned API health 200, DB health 200, 5 recent incidents, 11 categories, and analytics total 13. Unauthenticated dashboard data returned 401 as intended. No authorized session or credentials were available, so protected dashboard data and admin actions were not tested.
- Before using the local proxy, direct Flutter browser requests produced the documented CORS error. After using the proxy, app API requests succeeded. OpenStreetMap tile requests were visible and the map rendered; canceled tile requests during navigation were `ERR_ABORTED`.

## Build and Test Results

- `flutter analyze lib test`: passed, no issues.
- `flutter test`: passed, 44 tests.
- `flutter build web --release --no-wasm-dry-run --dart-define=API_BASE_URL=https://urbandanger.netlify.app`: passed.
- `npm --prefix admin run build`: passed.
- Backend tests from `backend`: 161 passed, 0 failed, 1 opt-in Gemini integration skipped.
- Focused CORS test: exact local and configured production origins allowed; unlisted origins rejected; credentials header absent.
- Whole-workspace `flutter analyze` reports duplicate-type diagnostics under nested `admin/node_modules/.../urban_danger_netlify` copies. Analysis scoped to Flutter source and tests passes.

## GitHub and Deployment

- Existing implementation commit: `e971cc1` (`feat: connect local Urban Danger apps to shared live API`). It was fast-forwarded to `main` and pushed normally; `origin/main` matched `e971cc17e3254ad2f09bd5797b49804ffe0576b5` after push.
- Separate local Public User fix: `4e7bab3` (`fix: proxy local Flutter API requests on port 5191`) adds the port override and localhost-origin rewrite to the existing proxy.
- GitHub push: `origin/main` was verified to match `4e7bab307baf22d4ecb75c0a157d6981a02a68da`; the worktree was clean before this report update.
- Netlify status: the production API still omits localhost CORS headers after both main pushes. The CLI is installed but unauthenticated (`NETLIFY_AUTH_TOKEN` absent); Netlify site metadata requests returned 401. The ignored workspace root site ID `95e85e86-ef4d-4fdd-8cc1-6e42dad4825b` does not match the documented public API site ID `69ea3ae6-40b9-4456-a261-df5634dadca9`. No manual deployment was attempted because the target identity could not be verified.
- Production API health, database health, incidents, categories, and analytics remain HTTP 200. The live Public site’s `/api` requests currently return 404, so that deployed frontend is not displaying API data. Automatic deployment from `main` could not be confirmed; the production site has not reflected the pushed API CORS change.

## Data Safety

All production API calls used for this verification were reads, except the route-calculation POST, which computes a route and does not write data. No login attempt, scan, incident submission/edit, review decision, migration, seed, or database write was performed.
