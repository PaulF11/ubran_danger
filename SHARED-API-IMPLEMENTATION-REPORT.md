# Shared API Implementation Report

## Architecture

- Flutter's `API_BASE_URL` is an origin without `/api`; `IncidentService`, `AnalyticsService`, and `RouteService` append `/api/...` endpoints.
- The API host is `https://urbandanger.netlify.app`, serving the existing Aiven-connected Express API.
- Local Public User: `http://localhost:5191`, served through `scripts/local-preview-proxy.js`; its `/api/*` requests are forwarded to the fixed API host.
- Local Admin: `http://localhost:5173`, with Vite `/api` proxy to the same API host. Authorization headers are preserved.
- No local backend or MySQL is required for either local app.

## Confirmed Causes and Fixes

- Local Flutter's direct browser requests originally failed because the deployed API had no CORS allow header for port 5191. Exact-origin CORS is now deployed for `http://localhost:5191`, `http://localhost:5173`, `https://urbandangerintel.netlify.app`, and the existing Admin origin `https://urban-danger-admin.netlify.app`. Credentials and wildcard access are not enabled.
- The expected production Public site has a separate problem: its current `main.dart.js` embeds `https://urbandangerintel.netlify.app` as its API origin. A cache-bypass fetch returned a 3,037,895-byte bundle with that host, without `https://urbandanger.netlify.app` or `localhost:3000`. Its own `/api/health` and `/.netlify/functions/api/health` both return 404.
- The current source and canonical `npm run build:web` script are configured with `https://urbandanger.netlify.app`; the new release bundle was verified to contain that host. Thus the Public site is serving an artifact/deployment that differs from the current source build, and the Public project’s routing/functions deployment is not the API-site deployment.
- The local preview proxy and the API site root both serve the corrected Flutter build successfully. The specified `urbandangerintel.netlify.app` site still needs its own verified deployment.

## Production API Verification

| Check                                       | Result after API deploy         |
| ------------------------------------------- | ------------------------------- |
| `/api/health`                               | HTTP 200                        |
| `/api/health/db`                            | HTTP 200, existing DB reachable |
| `/api/incidents?view=recent`                | HTTP 200, 5 records             |
| `/api/categories`                           | HTTP 200, 11 categories         |
| `/api/analytics/summary`                    | HTTP 200, 13 incidents          |
| `/api/admin/dashboard` without bearer token | HTTP 401, auth required         |

CORS GET responses return the exact `Access-Control-Allow-Origin` for each of the four approved origins. Admin bearer-token preflight returns 204 and allows `authorization`; `Access-Control-Allow-Credentials` is absent. An unlisted test origin receives no allow-origin header and its preflight is rejected.

The API deployment’s function set remains `api`, `ingest-background`, and `scheduled-ingestion`. Production variable names were checked without printing values; DB connection health remains good. No database writes or migrations were performed.

## Browser and Functional Results

- Local Public at `http://localhost:5191` displays live Home analytics (13 records, 8 High), 5 recent incidents, and 13 Map markers. Search, category/severity filters, incident details, car route analysis, and Photon place search were tested.
- Local Admin at `http://localhost:5173` loads its login page. Its proxy returns health 200, DB health 200, 5 recent incidents, 11 categories, and analytics 13. The protected dashboard endpoint returns 401 without auth.
- The deployed API site root, `https://urbandanger.netlify.app`, now serves the Flutter app and uses its own `/api` endpoints successfully. Home analytics, the Incidents feed, and 13 map markers rendered.
- The required Public site, `https://urbandangerintel.netlify.app`, still requests its own `/api` paths and those requests return 404. Its current bundle uses the wrong host. This site is not accessible to the authenticated Netlify account used for the API deployment, so its corrective deployment remains blocked.
- The live Admin login page still renders. No authorized administrator credentials or existing session were available; an Admin browser check showed the login form and no stored session token. No credential was guessed or submitted.
- The public Flutter app has no incident-submission flow in the inspected UI/source. No production record was created or changed.

## Netlify Account and Sites

- Netlify CLI 27.10.2 is authenticated locally. `netlify status` reports the `paul4nthonypagapulan` team and the linked API project `urbandanger`.
- The integrated browser page at `https://app.netlify.com` displays the Log in page; that browser context is not authenticated, despite the CLI’s stored authentication.
- `netlify sites:list` and authenticated `listSites` show five sites. They include:
  - API `urbandanger`, ID `95e85e86-ef4d-4fdd-8cc1-6e42dad4825b`, URL `https://urbandanger.netlify.app`.
  - Admin `urban-danger-admin`, ID `c602d0e9-46c6-479a-832b-9d34ee9c9fd4`, URL `https://urban-danger-admin.netlify.app`.
- `urbandangerintel` is absent from the account’s site list. `getSite` for the previously documented ID `69ea3ae6-40b9-4456-a261-df5634dadca9` and for slug `urbandangerintel` both return 404 to this authenticated CLI.
- API and Admin site records have empty build-settings/repository fields; their recent deployments have no branch or commit refs. The API site’s latest prior deploy was a manual CLI deployment from Nov 5, not a GitHub-linked deployment.
- API build configuration from root `netlify.toml`: `npm run build:web`, publish `build/web`, functions `netlify/functions`. Admin config: `npm run build`, publish `dist`, functions `admin/netlify/functions`.
- No Admin redeploy was made because its source was unchanged.

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
- Verified API deployment: `6af49d3ceaa28c5849e4a26b`, state `ready`, production context, URL `https://urbandanger.netlify.app`, published Nov 11, 2026. It deployed the validated Flutter build and the three existing functions to the verified API site ID.
- The pushed `main` commit did not automatically deploy the API; no Git branch/commit is attached to API deploy records. A manual deployment was required and completed.
- No deployment was attempted to the missing/unverified `urbandangerintel` project. The Admin site was not redeployed.
- The verified CORS source change is on GitHub `main` at `7afaf1d`; the final documentation commit will be verified separately.

## Exact Remaining Action

Grant the Netlify CLI account/team access to the existing `urbandangerintel` Public project, or authenticate the CLI with the account/team that owns it. Do not paste a token into chat. Once `netlify sites:list` shows that project and its site ID is verified against `https://urbandangerintel.netlify.app`, build with `npm run build:web` and deploy that build to that exact site ID with its existing Netlify configuration. Then confirm its bundle uses `https://urbandanger.netlify.app` and that `/api/incidents?view=recent` and `/api/analytics/summary` return 200. No replacement site should be created.
