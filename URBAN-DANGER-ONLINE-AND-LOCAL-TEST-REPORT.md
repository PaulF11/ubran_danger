# URBAN DANGER ONLINE AND LOCAL TEST REPORT

## A. Production Status

### Live production URLs tested
- Public app: https://urbandangerintel.netlify.app
- Public API: https://urbandanger.netlify.app
- Admin app: https://urban-danger-admin.netlify.app

### DNS and HTTPS
- DNS resolution succeeded for all three production hosts.
- HTTPS connectivity succeeded for all hosts.
- HTTP status checks returned successful 200 responses for the public app shell and API endpoints.

### Public application status
- URL: https://urbandangerintel.netlify.app
- Result: reachable over HTTPS, but the browser snapshot remained at the loading screen; the app did not render beyond the initial loader.
- Evidence: the page title loaded as "Urban Danger Intelligence" and the browser accessibility snapshot showed only the loading status indicator, not the app's home screen.
- Root cause indicators: the app shell loads, but runtime API/data flow is required to continue past the startup spinner.

### Admin dashboard status
- URL: https://urban-danger-admin.netlify.app
- Result: reachable over HTTPS and the login form rendered correctly.
- Evidence: the browser snapshot showed the login screen with "System access" and the sign-in form.

### Backend API status
- API base URL: https://urbandanger.netlify.app
- Health endpoint: GET /api/health -> HTTP 200
- Database health endpoint: GET /api/health/db -> HTTP 200
- Recent incident feed: GET /api/incidents?view=recent -> HTTP 200
- Analytics summary: GET /api/analytics/summary -> HTTP 200
- Conclusion: the production backend is still online and serving data.

### Map service status
- Not independently verified as a separate external service beyond the backend's API responses.
- The app relies on the backend route and incident APIs; map tiles and OSRM routing are handled through the project’s configured providers and were not directly tested as third-party services in this read-only pass.

### Database health status
- Production DB health endpoint returned HTTP 200.
- This confirms the live Aiven-compatible database path was reachable from the public backend during testing.

---

## B. Local Running Results

### Local backend
- URL: http://localhost:3000
- Result: backend server starts and responds to /api/health.
- Health response: HTTP 200, message: "Urban Danger API is running"
- Database health response: HTTP 500, message: "Database is unavailable."
- This means the local Express service is running, but it lacks the required local database configuration / credentials needed for full data operations.

### Local admin dashboard
- URL: http://localhost:5173
- Result: Vite dev server started successfully and served the login page.
- Browser snapshot showed the admin login form on the page.

### Local public app
- URL: http://localhost:5191
- Result: the Flutter web app started listening on the browser port, but the app never advanced beyond the loading screen.
- The backend API requests to /api/incidents, /api/analytics/summary, and /api/categories returned HTTP 500 while the local DB was unavailable.

### Ports used
- Backend: 3000
- Admin dashboard: 5173
- Public app: 5191

### Commands used
```powershell
cd C:\urban_danger
npm --prefix backend install
npm --prefix backend start

cd C:\urban_danger
npm --prefix admin install
npm --prefix admin run dev

cd C:\urban_danger
flutter run -d chrome --web-port 5191 --dart-define=API_BASE_URL=http://localhost:3000
```

### Simultaneous running status
- Backend and admin dashboard ran concurrently.
- Public Flutter app also started on port 5191 while the backend was active.
- However, the overall full local stack was not functionally complete because the configured database was not available locally and the backend returned HTTP 500 for data requests.

---

## C. Functional Testing

### Public application test results
- Initial page load: yes, the shell rendered.
- Loading screen beyond initial loader: no, in the browser it remained at the startup spinner.
- API reachability: the local backend was reachable on port 3000 but the database-backed endpoints returned HTTP 500.
- Incident list: not successfully rendered locally because data queries were failing.
- Map initialization: not verified as functional during the local run because the app did not progress beyond the startup loader.
- Browser console/network result: the public browser page reported a 404 resource fetch in the page log while the app remained in loading state.

### Admin dashboard test results
- Dashboard startup: yes, the login screen rendered.
- Login interface: yes, the login screen was displayed.
- Auth backend: without a configured JWT secret and database, the admin login API is not usable locally.
- Evidence: POST /api/auth/login returned HTTP 503 with message: "Admin JWT authentication is not configured."
- Protected admin routes were therefore not testable without the required backend secrets and database credentials.

### API testing results
- Production API:
  - /api/health -> 200
  - /api/health/db -> 200
  - /api/incidents?view=recent -> 200
  - /api/analytics/summary -> 200
- Local backend API:
  - /api/health -> 200
  - /api/health/db -> 500
  - /api/incidents?view=recent -> 500
  - /api/analytics/summary -> 500
  - /api/categories -> 500
- Conclusion: the local backend runs, but full data access is blocked by missing DB configuration.

### Browser console errors and failed network requests
- Public browser page: one resource fetch error was captured in the browser log: 404 Not Found.
- Local public app did not complete startup because backend response calls were failing with 500.
- Admin page loaded normally; no login was completed because local auth configuration was not present.

---

## D. Required Dependencies

### Flutter version
- Flutter 3.41.9
- Dart 3.11.5

### Node.js and npm
- Node.js runtime present; the backend and admin packages were installed successfully.
- Backend package scripts:
  - `npm --prefix backend start`
  - `npm --prefix backend test`
- Admin package scripts:
  - `npm --prefix admin run dev`
  - `npm --prefix admin run build`

### Required external services
- Netlify public site: https://urbandanger.netlify.app
- Netlify admin site: https://urban-danger-admin.netlify.app
- MySQL-compatible database (Aiven-compatible in production)
- App data is served through the public backend Express API and database-backed incident routes.

### Required environment variable names
These are the required names identified from the project configuration and README. Values were not disclosed in this report.
- `DB_HOST`
- `DB_PORT`
- `DB_USER`
- `DB_PASSWORD`
- `DB_NAME`
- `DB_SSL_CA`
- `DB_TLS`
- `PORT`
- `NODE_ENV`
- `CORS_ORIGINS`
- `FRONTEND_ORIGIN`
- `ADMIN_FRONTEND_ORIGIN`
- `ADMIN_USERNAME`
- `ADMIN_PASSWORD`
- `ADMIN_TOKEN_SECRET`
- `JWT_SECRET`
- `OSRM_BASE_URL`
- `OSRM_WALKING_BASE_URL`
- `OSRM_BICYCLE_BASE_URL`
- `ROUTE_MOTORCYCLE_ESTIMATED_SPEED_KMH`
- `ROUTE_TRUCK_ESTIMATED_SPEED_KMH`
- `TRUSTED_SOURCE_HOSTS`
- `SOURCE_COLLECTION_TARGET_URLS`
- `GEMINI_API_KEY`
- `GEMINI_MODEL`
- `INGESTION_INTERVAL_MINUTES`
- `INTERNAL_INGEST_KEY`
- `SCHEDULED_INGEST_KEY`
- `ROUTE_INCIDENT_PROXIMITY_METERS`
- `VITE_API_BASE_URL`

### Other necessary tools
- Flutter SDK
- Chrome web browser for Flutter web run
- Node.js + npm
- Netlify CLI is documented for build/deploy checks but was not used in this read-only test

---

## E. Exact Windows Instructions

### 1. Open the project folder
```powershell
cd C:\urban_danger
```

### 2. Open Terminal 1 for the backend
```powershell
cd C:\urban_danger
npm --prefix backend install
npm --prefix backend start
```
Open http://localhost:3000/api/health to verify the backend is alive.

### 3. Open Terminal 2 for the admin dashboard
```powershell
cd C:\urban_danger
npm --prefix admin install
npm --prefix admin run dev
```
Open http://localhost:5173 in Chrome.

### 4. Open Terminal 3 for the public app
```powershell
cd C:\urban_danger
flutter pub get
flutter run -d chrome --web-port 5191 --dart-define=API_BASE_URL=http://localhost:3000
```
Open http://localhost:5191 in Chrome.

### 5. Keep both apps running at the same time
- Leave the backend terminal open.
- Leave the admin dev-server terminal open.
- Leave the Flutter public app terminal open.
- Do not close those terminals while testing.

### 6. Shut them down safely
- In each terminal, press Ctrl+C to stop the process.
- The backend is the API on port 3000.
- The admin app is the Vite dev server on port 5173.
- The public app is the Flutter web app on port 5191.

### 7. Common startup errors to watch for
- `EADDRINUSE` on port 3000 or 5173 means another process is already using the port.
- `Admin JWT authentication is not configured.` means `JWT_SECRET` is missing.
- `Database is unavailable.` means `DB_HOST`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, or the database service itself is not configured.
- Public app stays on the loading spinner: this usually indicates the frontend is waiting on backend data or encountering runtime API failures.

---

## F. Remaining Issues

- Local backend started, but the database health endpoint failed without the configured MySQL environment.
- Local public Flutter app remained stuck on the loading screen because it was waiting on backend API responses that returned HTTP 500.
- Local admin login could not be fully validated because `JWT_SECRET` and database-backed auth data were not configured.
- Production public app only reached the startup loader and did not render the full app state in the browser snapshot; this was not a production outage, but a runtime startup issue requiring the real app environment to be present for a full browser-render verification.
- No direct production write or scan job was triggered.

---

## G. Git Status

### Git status before testing
- Initial check: `git status --short --branch` returned no output.

### Git status after testing
- After runtime validation, the repository was already showing a large set of tracked modifications and untracked files in the working tree.
- I did not edit or overwrite any tracked project files as part of the testing.
- The only file created in the workspace for this task is the report itself: `URBAN-DANGER-ONLINE-AND-LOCAL-TEST-REPORT.md`.
- The testing commands installed runtime dependencies and launched local dev servers; they did not modify tracked source files or configuration files.

### Final conclusion
- Live production systems are reachable and the backend responds successfully.
- The local stack can be started, but the local database credentials and backend auth secrets are not present, so the full data-driven experience cannot be completed without the required environment configuration.
- The public and admin apps do not currently both run in a fully functional local state in this environment because the backend database layer is unavailable locally.
