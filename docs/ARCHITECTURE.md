# Architecture

Urban Danger uses two Netlify sites and one backend data path:

```text
Public Flutter Web app
        |
        v
Public Netlify /api redirect -> Netlify Functions -> Express API -> Aiven MySQL

Admin React/Vite app
        |
        v
Admin same-origin /api proxy -> Public Netlify /api -> Express API -> Aiven MySQL
```

The public site publishes `build/web`, includes the API, scheduled ingestion,
and background ingestion functions, and keeps database credentials in Netlify
server-side environment settings. The admin site publishes `admin/dist` and
contains only the fixed-origin proxy function; it never connects directly to
MySQL.

## Repository layout

- `lib/`: Flutter public application.
- `backend/`: Express controllers, services, migrations, and tests.
- `netlify/functions/`: public API and ingestion functions.
- `admin/`: React/Vite administration application and proxy function.
- `scripts/`: release build and local preview tooling.
- `assets/brand/`: editable branding assets.

## Local development

```powershell
npm install
npm run build:web
node scripts/local-preview-proxy.js
```

Open `http://127.0.0.1:5190` for the public preview. The preview forwards
only `/api/*` to `https://urbandangerintel.netlify.app/api/*` and rewrites the
compiled API origin in the locally served JavaScript response; it does not
change production configuration.

For the admin app:

```powershell
npm --prefix admin install
npm --prefix admin run dev
```

## Deployment

The public site is linked to site ID `69ea3ae6-40b9-4456-a261-df5634dadca9`
and deploys with the root `netlify.toml`. The admin site uses
`admin/netlify.toml` and its existing authenticated site link. Deploy each
site from its own publish directory and never share frontend bundles between
the two sites.
