# Urban Danger Production Diagnostic Report

## Executive Result

The shared API and Aiven database are healthy. The local Public User and local Admin both retrieve the same live records through `https://urbandanger.netlify.app`. The exact-origin CORS change has been deployed to the verified API Netlify site. The API-site root now also serves the corrected Flutter app.

The requested Public domain, `https://urbandangerintel.netlify.app`, remains broken and could not be updated: the authenticated Netlify account available to the CLI does not list that site, and the documented site ID returns 404. Its current Flutter bundle embeds its own Public domain as the API host, while the site has neither the `/api` route nor the bundled API function. No deployment was attempted to an unverified or replacement site.

## Diagnostic Record

| Item | Evidence and test | Result / decision |
| --- | --- | --- |
| A. Flutter API base | `lib/core/api_config.dart` defaults to `https://urbandanger.netlify.app`; `scripts/build-web.js` builds with that HTTPS origin. Fresh production bundle was checked for the API origin and for `localhost:3000`. | Current source/build configuration is correct; no Flutter API URL change was needed. Live Public artifact differs from it. |
| B. Endpoint construction | Flutter services use `.resolve('/api/incidents')`, `/api/categories`, `/api/analytics/summary`, and `/api/routes/route`. The API host serves each route at HTTP 200. | No duplicate `/api/api` or incorrect endpoint suffix. Public-site 404s are host/deployment-specific. |
| C. Netlify configuration | Root `netlify.toml`: `npm run build:web`, publish `build/web`, functions `netlify/functions`, and `/api/*` rewrite to `/.netlify/functions/api/:splat`. Admin config builds `dist` and proxies `/api/*`. | Root/API configuration is correct and was deployed to the API site. The Public project's own settings could not be read because the project is not accessible to this account. |
| D. Deployment target | Authenticated API site ID `95e85e86-ef4d-4fdd-8cc1-6e42dad4825b` is `urbandanger.netlify.app`. Admin ID is `c602d0e9-46c6-479a-832b-9d34ee9c9fd4`. `urbandangerintel` is absent from the five-site inventory; `getSite` for the documented ID `69ea3ae6-40b9-4456-a261-df5634dadca9` and slug returns 404. | API target was verified and safely deployed. Public target is inaccessible and was not guessed. |
| E. API functions | API site’s published deployment includes `api`, `ingest-background`, and `scheduled-ingestion`; `/api/health` and `/.netlify/functions/api/health` return 200 on that host. Both equivalents return 404 on `urbandangerintel.netlify.app`. | Functions exist and work on the API site; the Public site deployment lacks the API function/redirect. |
| F. CORS | Before release, localhost and Public origins had no allow header. After release, each exact approved origin receives its own `Access-Control-Allow-Origin`; Admin auth preflight returns 204 with `authorization`, no credentials header. An unlisted origin gets no allow header and its preflight is denied. | CORS was a confirmed local browser failure and is now fixed on the API site. It does not explain the Public site’s same-origin 404. |
| G. Stale/cached assets | Requested Public `main.dart.js` with `Cache-Control: no-cache` and `Pragma: no-cache`; HTTP 200, 3,037,895 bytes. It contains `https://urbandangerintel.netlify.app`, not `https://urbandanger.netlify.app` or localhost. Response cache policy is `public, must-revalidate, max-age=0`. | Not just a browser cache issue: the current server artifact itself is compiled with the wrong API host. The accessible API-site deployment has the correct compiled host. |
| H. Admin/Public configuration difference | Admin Vite `/api` proxy targets the shared API origin and is same-origin to the browser. Local Flutter preview proxy rewrites only the locally served bundle and forwards to the fixed API host. Production Public bundle instead points at its own origin. | Admin and local Public paths are verified; the broken path is the inaccessible production Public deployment. |

## Netlify Access and Site Metadata

- Netlify CLI 27.10.2 is authenticated locally. `netlify login` reported an existing machine login; `netlify status` showed the linked API project and account.
- The browser context available to the agent showed the Netlify Log in page, not an authenticated dashboard. Browser login did not establish the CLI session; CLI authentication was independently confirmed.
- CLI inventory contains five sites and one team. It includes the API and Admin sites above, not the expected Public site. Current production account access to the Public site is therefore not verified.
- The API and Admin Netlify site records have no populated Git repository/build-settings metadata. Their recent deploys have no branch/commit references. The API site’s previous production deployment came from the CLI, so a GitHub auto-deploy was not assumed.
- Production API environment names were inspected without printing values. The reported names include `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, legacy Admin auth variables, `CORS_ORIGINS`, frontend origins, and provider settings. `/api/health/db` confirms the deployed database connection is healthy. The current variable list did not show `JWT_SECRET`; the Admin UI uses the existing legacy Admin login path, and protected access was not tested without an authorized account.
- No Public-site environment variable values or credentials were read or exposed.

## API Deployment

- Site: `urbandanger` (`95e85e86-ef4d-4fdd-8cc1-6e42dad4825b`), URL `https://urbandanger.netlify.app`.
- Deployment: `6af49d3ceaa28c5849e4a26b`, `ready`, production context, published Nov. 11, 2026.
- Deployed artifacts: validated `build/web` plus existing `netlify/functions` (API, scheduled ingestion, background ingestion).
- Command used: `netlify deploy --prod --no-build --dir build/web --functions netlify/functions --site 95e85e86-ef4d-4fdd-8cc1-6e42dad4825b`.
- API health, DB health, incidents, categories, analytics, CORS GETs, and preflight checks were verified after deployment.
- Admin was not redeployed because its source did not change; its current production login interface still loads.

## Live and Local Verification

- Local Public `http://localhost:5191`: Home showed 13 live incidents (8 High), recent feed 5, map 13 markers; search, category/severity filter, incident detail, route analysis, and Photon place search were exercised.
- Local Admin `http://localhost:5173`: login screen loads; Vite proxy returns health 200, DB health 200, incidents 5, categories 11, analytics 13. Protected dashboard returns 401 without auth.
- Live API `https://urbandanger.netlify.app`: health 200, DB health 200, incidents 5, categories 11, analytics 13.
- Live API-site root `https://urbandanger.netlify.app`: corrected Flutter Home displayed 13; its recent incident request to `/api/incidents?view=recent` returned 200; Map displayed 13 markers.
- Required live Public URL `https://urbandangerintel.netlify.app`: HTML shell returns 200, but recent incidents/analytics requests go to that same host and return 404; direct `/.netlify/functions/api/health` also returns 404. Not fixed because the site is absent from the authenticated account.
- Live Admin URL `https://urban-danger-admin.netlify.app`: login page renders. No authorized session was present in the browser (login form shown, session token absent), so protected admin data could not be tested.

## GitHub and Validation

- Production branch: `main`; existing implementation commits include `e971cc1` and `4e7bab3`.
- CORS change: `7afaf1d` (`fix: allow exact Public User CORS origin`) was pushed normally to `origin/main` before the API deploy.
- `flutter analyze lib test`: passed.
- `flutter test`: 44 passed.
- `npm run build:web`: passed.
- `npm --prefix admin run build`: passed.
- Backend suite: 161 passed, 0 failed, 1 opt-in Gemini test skipped.
- Whole-workspace Flutter analysis still finds duplicate type diagnostics in nested npm copies under `admin/node_modules`; the actual Flutter source/test trees pass.

## Remaining Blocker and Required Action

The production Public domain is the only major acceptance item still incomplete. The exact existing project ID documented for `urbandangerintel` is not present in the authenticated Netlify account, and `getSite` returns 404. The available browser context is also not logged in. Deploying the Public build to the API or Admin site would target the wrong project and risk replacing unrelated site content, so that was not attempted.

Required action: sign in to Netlify in the account/team that owns the existing `urbandangerintel` site, or grant the current CLI account access to that existing project. Then verify `netlify sites:list` shows the exact Public URL and ID. Deploy the validated `build/web` with the root config to that verified ID, and confirm the live bundle contains `https://urbandanger.netlify.app` and its API requests return 200. Do not create a replacement site or share an access token in chat.

## Data Protection

All production health/data checks were read-only. Route calculation used the existing non-persisting route endpoint. No incident write, scan, review action, migration, seed, or database change was performed.
