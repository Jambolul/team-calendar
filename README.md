# Team calendar

React + JSX calendar for Top, Jungle, Mid, ADC, and Supp.

## Local development

```sh
npm install
npm run dev
```

Open http://localhost:5173. Select your role and Available, Unavailable, or Clear. Click or drag across dates. Larger dots show the five roles in order; hover for details. Bright green borders and a 5/5 badge mark days when everyone is available.

Local development uses `data/availability.json`. Existing local data is preserved. Netlify uses its own persistent store; the local file is not automatically uploaded.

## Netlify

Connect this project through Git or deploy using the Netlify CLI so that the function is included. A manual drag-and-drop of `dist` alone only uploads the UI and will not include the saving API.

`netlify.toml` sets:

- Build command: `npm run build`
- Publish directory: `dist`
- Functions directory: `netlify/functions`

The `/api/availability` function uses Netlify Blobs with automatic platform credentials; no database account or client-side secret is needed. Production uses a site-wide store, which survives app deployments. Previews use a separate deploy-specific store. One small JSON blob holds each month. Conditional writes merge simultaneous changes without overwriting other players' edits.

The app has not been deployed by this change. This MVP has no sign-in or role permissions: anyone with access can edit every role. Origin checks block cross-origin browser calls but are not authentication.

## Usage optimizations

- No polling, streaming connections, scheduled jobs, or background refresh timers.
- Only the visible month is fetched, in one request.
- Month data is cached in memory for 60 seconds. Switching roles makes no request. Switching back to a fresh month uses its cache.
- Returning to the browser tab/window refreshes only if the month cache is at least 60 seconds old. The small refresh button forces one read. Leaving the calendar open does not fetch teammates' updates automatically; use Refresh to see them immediately.
- Dates update visually while painting. A held stroke makes no save requests until released. Changes are grouped by month and saved after 500 ms of inactivity, combining nearby clicks too.
- Repainting an unchanged status does not save anything.
- Save responses include updated month data, avoiding another fetch after saving.
- Failed saves retain pending edits in memory for explicit Retry; no automatic retry loop. Leaving with pending edits triggers the browser's unsaved-changes warning. Drafts do not survive a forced close/reload.
- Built JS/CSS have content hashes and a one-year immutable browser cache.

For example, painting 31 days with one stroke makes one save request instead of 31. Requests, compute, bandwidth, and deployments can still consume hosting credits. No AI services are used. Actual billed usage must be verified on Netlify after deployment.

## Production on a regular Node host

```sh
npm run build
npm start
```

`PORT` defaults to 5173. `DATA_FILE` can set an absolute data path. Keep that file persistent and backed up. Only run one local-file server instance per data file.

## Validation

```sh
npm test
npm run build
```

Tests cover batch saves, persistence, concurrent writes, request counts, caching, unchanged dates, failed-save retries, and read/save races. Netlify storage tests use a test double; a real deploy is still needed to verify platform integration.
