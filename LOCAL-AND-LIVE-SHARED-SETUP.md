# Local and Live Shared Setup

## Official production websites

- **Public User + Backend API:** https://urbandanger.netlify.app/
- **Admin Dashboard:** https://urban-danger-admin.netlify.app/

The Public User Flutter app and backend Netlify Functions share the first
site. The Admin Dashboard is separate and proxies its API requests to that
same backend. Both applications use the existing Aiven MySQL database through
the shared backend. Do not start `backend/src/server.js`, configure MySQL
locally, or run database migrations for normal frontend use.

## API URLs

Flutter's `API_BASE_URL` is an origin only, without `/api`. The Flutter services resolve paths such as `/api/incidents`, `/api/categories`, and `/api/analytics/summary` against that origin. The existing default is `https://urbandanger.netlify.app`; the explicit run command below uses that same value.

The Admin app calls `/api/admin/...`. In local Vite development, those paths are proxied by `admin/vite.config.js` to `https://urbandanger.netlify.app`. The browser request is same-origin to port 5173; Vite forwards it to the shared live API. The Vite proxy preserves request methods and headers, including `Authorization: Bearer ...`.

## Start Both Apps on Windows

Open PowerShell Terminal 1 from the project directory and run:

```powershell
Set-Location C:\urban_danger
npm --prefix admin run dev
```

Open PowerShell Terminal 2 and run:

```powershell
Set-Location C:\urban_danger
flutter build web --release --no-wasm-dry-run --dart-define=API_BASE_URL=https://urbandanger.netlify.app
$env:LOCAL_PREVIEW_PORT = "5191"
node scripts/local-preview-proxy.js
```

Then open these URLs in Chrome:

- Public User app: http://localhost:5191
- Admin Dashboard: http://localhost:5173

Leave both terminals open while using the apps. Stop each process with `Ctrl+C` in its own terminal. No local backend or MySQL process is needed.

## Verify Read-Only API Access

The API can be checked directly from PowerShell:

```powershell
Invoke-RestMethod https://urbandanger.netlify.app/api/health
Invoke-RestMethod https://urbandanger.netlify.app/api/health/db
Invoke-RestMethod 'https://urbandanger.netlify.app/api/incidents?view=recent'
Invoke-RestMethod https://urbandanger.netlify.app/api/categories
Invoke-RestMethod https://urbandanger.netlify.app/api/analytics/summary
```

The local Admin Vite proxy can be checked through the same origin the Admin frontend uses:

```powershell
Invoke-RestMethod http://localhost:5173/api/health
Invoke-RestMethod 'http://localhost:5173/api/incidents?view=recent'
```

Admin dashboard and monitoring endpoints remain protected. Sign in only with an authorized administrator account. Do not use manual scan, candidate approval/rejection, or other write actions just to verify connectivity.

## Browser API Access

Flutter's release build uses `API_BASE_URL=https://urbandanger.netlify.app`.
The local preview proxy rewrites that origin only in the locally served
JavaScript and forwards `/api/*` to the production API. The browser then makes
same-origin requests to `http://localhost:5191/api/...`; no local Express
server or MySQL is involved.

The production health, database-health, incidents, categories, analytics, and
route endpoints have been checked on the Public User/API site. The Admin
site's `/api` proxy returns the same dataset through that backend.
