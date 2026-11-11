# Local and Live Shared Setup

The public Flutter app and Admin dashboard use the existing production API at `https://urbandanger.netlify.app`. The deployed API serves data from the existing production database. Do not start `backend/src/server.js`, configure MySQL locally, or run database migrations for normal frontend use.

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

Flutter's release build retains `API_BASE_URL=https://urbandanger.netlify.app`. Since the production API currently omits CORS headers for localhost, use the local preview proxy command above: it rewrites the API origin only in the locally served JavaScript, and forwards `/api/*` to the fixed production API origin. The browser then makes same-origin requests to `http://localhost:5191/api/...`; no local Express server or MySQL is involved.

The backend source also allows only `http://localhost:5191` and `http://localhost:5173` in its CORS origin list, without wildcard origins or credentialed CORS. The live API has not yet been verified to serve that change. Once the existing API site deploys the pushed `main` commit, the Flutter app can use direct browser requests to the production API if its CORS response is verified.
