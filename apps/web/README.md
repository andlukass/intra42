# Intra42 web

The web app uses React, TypeScript, Vite, Tailwind CSS, React Router, and TanStack Query. The `/` route renders the authenticated portal home. **Manage slots** opens a weekly calendar at `/slots`. **Settings** at `/settings` shows the signed-in account's login and email when available. Other secondary routes display a centered page title.

Select the account name or avatar to open the account menu. It links to the
slots calendar, your profile on the home page, and Settings. Select **Logout**
in the menu or on the Settings page to return to the sign-in screen.

On screens up to 700 pixels wide, the header menu opens a navigation drawer.
Selecting a link, tapping outside the drawer, or pressing Escape closes it.

- `src/main.tsx` mounts React, the Query client provider, and the browser router.
- `src/App.tsx` declares routes.
- `src/pages/` contains route components.
- `src/styles/index.css` loads Tailwind CSS.

Install dependencies with `npm ci` at the repository root. Start the app with `npm run dev:web` or use `npm run dev --workspace web` to run its script directly.

Run `npm run build:web` from the root to generate `apps/web/dist/`. Use `npm run preview` to verify the build locally.

## Official portal login

The local experiment signs in through the official 42 portal and obtains an access
token accepted by its internal API. A real account login and a subsequent read of
the agenda succeeded on November 25, 2026. The same test verified that the 42
portal issued a refresh token, accepted its exchange, and served the agenda
using the renewed access token.

The Vite adapter lives in [server/login.ts](server/login.ts), registered in
[vite.config.ts](vite.config.ts). The Chrome worker, refresh grants, calendar
cookies, and request validation live in the shared
[`packages/portal-server`](../../packages/portal-server) workspace, also used by
the native sign-in service. The web endpoints retain their same-origin,
loopback-only browser checks. The browser-side
requests and token expiry checks live in [src/lib/intra.ts](src/lib/intra.ts).
The form lives in [src/pages/SignIn.tsx](src/pages/SignIn.tsx). The app holds the current session in [src/App.tsx](src/App.tsx).

### Run the test

Install Google Chrome on the machine running Vite, then run these commands from
the repository root.

```sh
npm ci
npm run dev:web -- --host 127.0.0.1 --port 5173 --strictPort
```

Open http://127.0.0.1:5173/, enter your 42 login and password, and select **Sign in**. The dashboard loads automatically.

Playwright launches the installed Google Chrome with `channel: "chrome"`. The
server needs network access to the official authentication, profile, and internal
API hosts.

### Login flow

1. The form sends a URL-encoded POST to the same-origin endpoint
   `/local-api/login`. The local backend reads `username` and `password`.
2. The backend launches headless Chrome with a fresh, isolated browser context
   and opens `https://profile-v3.intra.42.fr/`.
3. The official portal redirects to `auth.42.fr`. The backend checks that hostname,
   fills the official username and password fields, and submits `#kc-login`.
4. The official site completes its OpenID Connect flow and redirects back to
   `profile-v3.intra.42.fr`.
5. After the profile document loads, the backend waits up to 20 seconds, within
   the overall login deadline, for an `oidc.user:*` entry in the portal's
   `sessionStorage`. It reads `access_token` and `expires_at`, verifies that the
   token has time remaining, and reads the stored refresh token and OIDC
   authority/client ID. The official token response is a fallback if storage
   does not include a refresh token. The backend requires a refresh grant and
   verifies one exchange before completing sign-in. It keeps the rotated grant
   server-side and returns the renewed access token and a random local session
   ID to the Intra42 tab. Raw refresh tokens never reach the Intra42 client.
6. The backend gives the official account avatar up to four seconds to load in
   the authenticated browser. It copies the image response from the 42 CDN into
   the login response. The dashboard uses that image for both avatars and keeps
   it in the current tab's session. If the CDN image is unavailable, the
   profile shows the default icon.
7. The backend closes the isolated browser in a `finally` block after the attempt.
   The frontend keeps the token and its calculated expiry in React state and
   saves the session in the current tab's `sessionStorage`.

### Dashboard data

[The React Query module](src/features/dashboard/queries.ts) defines the query keys
and cache settings. [The browser client](src/lib/intra.ts) sends same-origin POST
requests with the session token to `/local-api/intra/:resource`. The server module
[server/intra.ts](server/intra.ts) maps those resource names to a fixed list of
upstream GET requests.

| Section | Upstream resource |
| --- | --- |
| Profile and notifications | `intrapy.intra.42.fr/api/v1/users/me`, `/summary`, `/notifications/unread`, and the user's `/campus` and `/cursus` |
| Agenda | `intrapy.intra.42.fr/api/v1/users/me/events` |
| Pending evaluations | `intrapy.intra.42.fr/api/v1/users/me/scale_teams` and `/events/unfeedbacked` |
| Achievements and projects | The user's `/achievements` and `/projects/ongoing` resources on `intrapy.intra.42.fr` |
| Alumnization | `alumni-management.42.fr/api/v1/alumni_auto/:id` |
| Coalition | `profile.intra.42.fr/users/:id/coalitions?cursus=:slug` |
| Logtime | `translate.intra.42.fr/users/:id/locations_stats/` |

When the official page returns coalition and logtime data during the isolated
login, the server includes those responses alongside the token. React Query uses
that data for the matching profile and cursus slug. The dashboard opens the
first cursus returned by 42, matching the official portal. Other reads go through the server
module. Query cache keys use a random ID for each login. Signing out or losing
the ability to renew an expired session clears that login's queries.

### Why requests go through the local backend

The initial direct login experiment returned these responses.

| Attempt | Observed response |
| --- | --- |
| Password grant with the portal client and local Origin | HTTP 403, `Invalid origin` |
| Password grant with the portal client and no Origin | HTTP 400, `Client not allowed for direct access grants` |
| Authorization redirect to `http://127.0.0.1:5173/` | `Invalid parameter: redirect_uri` |

An OPTIONS preflight accepted a local origin, but the actual token request was
rejected. Realm discovery advertising the password grant also proved
insufficient to establish permission for the portal client.

A direct agenda request from the Intra42 browser failed with a browser network
error. Routing the request through the local backend succeeded. This keeps the
browser-facing calls on the Intra42 origin while the isolated login uses the
portal's configured callback.

### Evaluation slots

**Manage slots** opens a weekly calendar on desktop and a day picker on mobile.
Drag across available cells in a day column to prefill the dialog with a time
range. Click or tap an available cell, or use **New slot**, to start with a
30-minute range. Blocked and past cells are shaded. Set the start and end dates
and times in 15-minute increments. Changing the start moves the end by the same
amount. The summary shows the duration and the browser's time zone.
The dialog slides in and out from the bottom on mobile and fades in and out on
desktop. Click or tap outside the dialog to dismiss it. Submitting **Open slot**
sends the requested interval to 42, closes
the dialog, and refreshes the calendar on success.

The local server reads `/slots.json` and `/slots/unavailable.json` from the
official profile. It submits new availability to `/slots.json` with the
official calendar's CSRF token. The server holds the scoped portal cookies in
memory. For a renewable session, successive access tokens share the same
calendar session. The official calendar cookies have their own lifetime.

### Session lifecycle and current limits

- During sign-in, the submit button shows progress and both input fields keep
  their values while disabled. Credentials pass through the local server to the
  official login form.
- The login response saves the access token and, when present, the local
  session ID in the current tab's `sessionStorage`. Reloading that tab restores
  the saved session. The password, 42 refresh token, and isolated browser
  cookies are excluded from browser storage.
- The app refreshes before access token expiry and attempts immediate renewal
  when a reload finds an expired token with a local session ID. The backend
  exchanges the refresh token and keeps any replacement returned by 42. The
  app retries temporary failures and asks for sign-in if 42 rejects the grant
  or the local server no longer has it.
- **Logout** clears the saved session and its cached queries and requests that
  the local backend release its session.
- If browser storage cannot fit the optional dashboard data, the app tries to
  save the session without those fields. If storage is unavailable, the
  session lasts until the current document is unloaded.
- Existing logins without a local session ID require one fresh sign-in.
  Refresh grants and calendar cookies now survive Vite restarts through the
  shared server's private temporary session file. The file uses `0600`
  permissions inside a `0700` directory, and passwords are excluded. Logout and
  renewal update it immediately. Each working directory uses its own file by
  default; `INTRA42_SESSION_FILE` can select a file in a private directory.
  Use one server process per file. Clearing the OS temporary directory still
  requires signing in again.
- The local endpoints require POST, an Origin matching the HTTP Host, and a
  loopback remote address. Responses use `Cache-Control: no-store`.
- The backend permits one login at a time. A concurrent attempt receives HTTP 429.
- Missing credentials receive HTTP 400. An error shown on the official sign-in
  form receives HTTP 401. Other failures report the last login stage reached.
  The server allows at most 40 seconds for an attempt. Once the token is ready,
  optional dashboard data has up to 1.5 seconds to finish loading.
- MFA, CAPTCHA, other interactive requirements, or changes to the portal DOM can
  interrupt the automated flow.
- The backend runs through Vite's `configureServer` hook. A static production
  build or `vite preview` needs a separately implemented backend to provide these
  endpoints. The current local checks would also need adaptation for deployment.
- The slots workflow can be tested with simulated responses. Creating a slot on
  the live portal and booking project evaluations remain unverified.
