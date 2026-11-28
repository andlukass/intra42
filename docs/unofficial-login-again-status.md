# `unoficial-login-again` status

The baseline sections below record the state inherited from `main`, the boundaries between
the mobile and web workspaces, and the simulator validation completed before
further authentication work.

## Search connection recovery — November 27, 2026

The reported search error was reproduced with no service listening on the
configured local backend port. Previously, `dev:mobile` started only Metro.
The development launcher now starts the configured loopback backend, verifies
its `/health` response, and then starts Metro. An independently started healthy
backend is reused and remains running when Metro exits. A backend launched by
the command is stopped with Metro; backend startup failures prevent a partial
development session. Remote HTTPS deployments and demo mode do not launch a
local backend.

API transport failures now produce a connection message instead of exposing
Expo/Swift exception details. Request cancellation remains distinguishable.
Regression tests cover failed connection followed by recovery, cancellation,
backend startup/shutdown, backend reuse, and an occupied port belonging to a
different service.

On the iOS simulator, the original failed search recovered through **Try again**
after startup. Searches for `llopes` and `libft` returned live results; selecting
the student loaded the profile, and selecting Libft loaded its validated project
details and final mark. Back navigation, an unmatched search, clearing the field,
and restoring the saved login after a full Expo reload were verified as well.
The new connection-message branch was tested with a simulated transport failure;
the additional outage UI test was limited by unavailable simulator coordinate
input after reloading. Android UI verification remains open.

## Native search tab — November 26, 2026

The bottom bar now includes Search on both platforms, using the system search
tab role on iOS. Chrome inspection confirmed that the official search debounces
input for 500 ms, groups students and projects, and calls the portal's
`/searches/search.json` and `/searches/project.json` endpoints. The native service
uses those same endpoints with the saved portal token, validates the query and
result destinations, and excludes upstream credentials from its response.
Results open native profile and project screens. Profile routes now accept
validated logins, resolved through the public profile API.

Live checks returned the expected student for `llopes`, the same two projects
as the official site for `libft`, and empty groups for an unmatched term.
Both profile resolution and project details returned HTTP 200. Root lint,
workspace type checks, and the server/session regression suite passed. Search
regressions cover query encoding, invalid input, upstream failures, safe result
destinations, and login resolution. The search button was visually confirmed
in the iOS simulator; simulator coordinate-input failures prevented completing
the result-tap UI test automatically. Android visual verification remains open.

## Achievement campus catalog — November 26, 2026

Unearned achievements now use `/v2/campus/:id/achievements`, selected from the
viewed profile's primary campus (or first campus if no primary enrollment is
provided). Earned achievements are preserved independently. Profiles without
a campus do not fall back to the global catalog.

The live Lisboa catalog contained 168 visible records versus 1,237 globally,
with no 42FC or 42Founders entries. The legacy official HTML contained 166
achievement cards; Progressive Overload (21) and ClubShowcase (1732) appeared
only in the campus API catalog. The extra eligibility rule behind those two
differences remains unconfirmed, so exact parity with the legacy list is not
claimed. The official `.json` page redirects to the portal home.

Root lint, workspace type checks, and the authentication/server regression
suite passed. The campus route test covers visibility, pagination, and rejection
of unsupported paths and query fields. Simulator verification was interrupted
by concurrent app navigation; the real API response was verified separately.

## Refresh capture fix — November 26, 2026

The previous worker could finish login without a refresh grant: it relied on a
single observed network response and stopped waiting 1.5 seconds after reading
the access token. The resulting persisted native session still expired after a
few minutes. The worker now reads the official portal's stored OIDC refresh
token and validated authority/client ID, with network capture as a fallback.
It requires and verifies renewal before completing sign-in and persists the
rotated grant. Raw refresh tokens remain server-side. Failed verification
discards the incomplete grant instead of returning a short-lived login.

A fresh account login verified a real HTTP 200 refresh. After restarting the
service, the same native key restored and renewed successfully, and the new
access token was accepted by the official profile API. Reloading the app through
the Expo menu in the iOS simulator restored the authenticated Home screen.
The app's next scheduled refresh also returned HTTP 200 and advanced the saved
access expiry without manual intervention. All 45 automated tests, root lint,
workspace type checks, and the web production build passed.
Regression coverage includes missed and delayed capture, missing/rejected grants,
rotation, concurrent refresh, transient failures, and persistence across processes.

## Title ownership field fix — November 26, 2026

The simulator reproduced a rejection when selecting an owned title. The native
profile uses title definition `id`, while the portal's available-title list uses
`title_id` and `title_user_id`. The broker incorrectly compared `id`; it now
matches `title_id` before resolving the owned assignment. Regression fixtures
use the confirmed portal response shape rather than an invented `id` field.

An earned title was selected in the iOS simulator and its persisted selection
was confirmed with a read from the official portal API. The original title was
then restored through the same selector. The existing authenticated session also
survived the backend restart used to apply this fix.

## Storage provider boundary — November 26, 2026

Authentication imports the provider-independent `session-store.ts` entry point.
`SessionPersistence` defines asynchronous load/save operations; the file adapter
owns all filesystem access, and `session-store.ts` is the single provider selection
point for a future Firebase adapter. Durable writes are awaited throughout login,
renewal, logout and cookie updates. Writes are serialized, failed saves preserve
the last committed snapshot, and the existing JSON file format remains compatible.
The adapter contract is tested with delayed and failing asynchronous providers.
See [the provider guide](../packages/portal-server/README.md).

## Session persistence — November 26, 2026

Native session keys, upstream tokens/refresh grants, and calendar cookies now
survive server restarts in a private temporary JSON file. The mobile SecureStore
key can be restored after Metro edits or backend restarts. Expiry and logout still
invalidate sessions, including their persisted records; passwords are excluded.
The service logs the file path at startup. Files use `0600`, with a `0700` parent.

The file store uses atomic writes and checkpoints refresh rotation and cookie
updates. It supports one process per file and is intended for replacement with
Firebase later. The OS can clear temporary storage; already-lost sessions cannot
be recovered and need one fresh sign-in.

A subprocess regression test seeds a synthetic login, starts fresh processes,
restores the native identity and calendar cookies, rotates the refresh grant,
then logs out and confirms the session remains absent after another restart.
Expired records, corrupt files, and file permissions are also checked. No real
credentials are used by these tests. Historical restart limitations in the
sections below describe the earlier in-memory implementation.

## Profile title selection — November 26, 2026

The title below the account name is now editable on Home. Title and course
selectors share the same anchored menu component and appearance. The title menu
includes the plain login to clear the selection; other users' titles remain
read-only. The current title is updated only after a successful save.

The native broker validates ownership against the signed-in portal profile and
uses the same selected/unselected title actions as the public portal frontend.
It accepts only the account's title definition ID, resolves its owned assignment
server-side, and serializes concurrent writes. Tests cover selection, clearing,
malformed requests, ownership/identity checks, authentication, and upstream errors.
Initial validation used synthetic titles. The subsequent simulator test and
real-account verification are recorded in the title ownership fix above.

## Authentication browser — November 26, 2026

Home now shows only **Sign in with 42**. The app opens the server-hosted
Login/Password page in the system authentication browser using the existing
`expo-web-browser` dependency. The user confirmed a successful login through
this flow on November 26, 2026.

The hosted page now follows the provided 42 login reference, using the public
geometric background, white logo, Futura PT, matching form measurements, pale
fields, Remember me checkbox, and official helper links. Background/logo assets
are local; the font uses the reference Adobe Fonts stylesheet. Remember me is
forwarded to the official form. Close the authentication browser to cancel.

The browser returns to `intra42://oauth` with a one-use code. State and a private
verifier bind the exchange to the initiating app. Codes expire after one minute;
transactions expire after ten minutes. Cancellation and expiry release unclaimed
sessions, including a sign-in that finishes after the user cancels.
Browser forms require same-origin requests and a transaction CSRF header;
responses use no-store, no-referrer, and restrictive content policies.

The existing session renewal, SecureStore persistence, data routes, and calendar
cookies remain in use. The native credential endpoint remains available for
compatibility, while the current app collects credentials only in the browser.
The service must be restarted after code updates; reloading Metro alone does not
reload server routes. Reverse proxies now also forward `/sign-in`, `/sign-in.js`, and `/sign-in-assets/*`.

The hosted page was rendered in Chrome at iPhone width; the font loaded and
local logo/background assets returned successfully. Lint, workspace type checks,
the web build, and all 31 tests passed. Synthetic checks cover successful code
exchange, replay, wrong state/verifier, foreign callbacks, expiry, credential
errors, and cancellation during login. The browser sign-in was subsequently
verified by the user. The earlier validation sections below describe the initial form-based
migration and the original baseline, respectively.

## Portal login restoration — November 26, 2026

The native application now uses the username/password portal login from the
`unofficial-login` branch. The original web implementation was already present;
the missing work was connecting it to the mobile session and data clients.

- `packages/portal-server` shares the original Chrome login worker, token renewal,
  avatar capture, and scoped calendar cookies between the two services.
- Home presents Login and Password fields. Native sessions use opaque keys in
  SecureStore; portal access/refresh tokens and cookies remain server-side.
- Restore, proactive renewal, foreground renewal, logout, expiry, and temporary
  refresh failures are handled. A service restart requires signing in again.
- The native API client uses allow-listed authenticated broker routes. Account
  identity comes from the portal, while `/v2` and CDN reads use the existing
  public application grant. This preserves the native data models without
  treating the portal token as a registered OAuth API token.
- Native slots use the same cookie and CSRF flow as the web calendar.
- The registered OAuth endpoints remain available for compatibility; the native
  UI no longer launches them. No mobile screens were removed.

Start the service with `npm run login:mobile` and restart Metro. The existing
`EXPO_PUBLIC_INTRA42_OAUTH_URL` variable now points to the sign-in/data service.
See [the native setup guide](../apps/mobile/README.md#sign-in-through-your-own-server)
for configuration, endpoints, session lifetime, and the test command.

Local lint, workspace type checks, web production build, and 22 synthetic tests
passed. The synthetic suite covers the shared worker and native session/data
boundaries. Live credential-bearing API checks were blocked by automatic
approval review; no fresh real-account login or real slot creation was performed.
The new Login/Password screen was also rendered in the iPhone 17 simulator.
A running local broker was checked with empty credentials, a browser Origin, and
invalid native keys: it returned the expected 400/403/401 responses with no-store
headers and made no external requests. Public application grant permissions for
every migrated screen still need live verification. The simulator audit below predates this authentication migration.

## Branch baseline

| Item | Value |
| --- | --- |
| Branch | `unoficial-login-again` |
| Base commit | `2a730db` (`Expand Intra42 mobile features`) |
| Source branch | `main` |
| Remote state at branch creation | `origin/main` at `2a730db` |
| Working tree after branch creation | Clean |

The branch contains the full mobile implementation already present on `main`.
No mobile files were changed while creating or auditing this branch.

## Workspace separation

| Area | Location | Responsibility |
| --- | --- | --- |
| Mobile application | `apps/mobile/app` and `apps/mobile/src` | Expo Router screens, TanStack Query data, native navigation, UI, and device caches |
| Mobile API client | `apps/mobile/src/api.ts` | Central access to the official 42 API and broker-backed public profile fallbacks |
| Mobile session | `apps/mobile/src/session.tsx` | OAuth transaction, SecureStore persistence, refresh, and logout |
| Mobile OAuth broker | `apps/mobile/server/oauth.mjs` | Registered 42 OAuth flow, token exchange, authenticated image delivery, and restricted public profile routes |
| Mobile broker tests | `apps/mobile/server/oauth.test.mjs` | OAuth transaction, callback, session verification, proxy allow-list, images, and upstream error handling |
| Web experiment | `apps/web` | Existing browser-oriented portal experiment and its separate login server |

The mobile application currently uses the registered OAuth broker. The web
experiment remains isolated in `apps/web`. No connection from the mobile app to
the web experiment's login flow was added during this audit.

## Simulator validation

The signed-in application was validated on November 26, 2026 using an iOS
simulator. Routes were opened directly through the `intra42` URL scheme and left
to settle before capture.

| Screen | Route or target | Result |
| --- | --- | --- |
| Home | `/` | Loaded the signed-in profile, profile photo, pending evaluations, and agenda |
| Projects | `/projects` | Loaded open teams, featured projects, and navigation shortcuts |
| Slots | `/slots` | Loaded the weekly selector and daily schedule |
| Clusters | `/clusters` | Loaded Lisboa maps, occupancy, and individual occupant photos |
| Achievements | `/achievements` | Loaded the achievements collection |
| Feedbacks | `/feedbacks` | Loaded successfully with the legitimate empty state `No completed evaluations.` |
| Evaluation logs | `/evaluation-logs` | Loaded the point history screen |
| Quests | `/quests` | Loaded the quest enrollment screen |
| Holy Graph | `/holy-graph` | Loaded the native project graph |
| Project list | `/project-list` | Loaded the searchable project catalog |
| Project details | `/project/work-experience-i` and `/project/42cursus-libft` | Loaded project metadata, teams, and records |
| Profile | `/profile/146577` | Loaded the selected user profile and photo |

An initial `libft` slug returned `Access Denied`. Repeating the check with the
actual `42cursus-libft` slug loaded the expected project.

## Captured evidence

The audit produced PNG captures under the temporary directory below.

```text
/private/tmp/intra42-route-audit.opSmnC
```

The capture set contains the following files.

```text
home.png
projects.png
slots.png
clusters.png
achievements.png
holy-graph.png
project-list.png
settled-project-list.png
project-libft.png
settled-project-libft.png
settled-42cursus-libft.png
settled-work-experience-i.png
evaluation-logs.png
settled-evaluation-logs.png
feedbacks.png
settled-feedbacks.png
quests.png
settled-quests.png
profile-146577.png
```

These PNG files are intentionally not copied into the repository because they
contain real profile information, email addresses, and user photos. The table
above preserves the verified outcome without placing personal data in a future
commit. The temporary files may disappear after the machine clears `/private/tmp`.

## Checks completed

The following checks passed against the branch baseline.

```sh
npm run lint
npm run typecheck
node --experimental-strip-types --test \
  apps/mobile/src/clusters/maps.test.mjs \
  apps/mobile/server/oauth.test.mjs
```

The Node test run completed all eight tests successfully.

The OAuth broker was also checked with a synthetic transaction. It redirected
to the registered official 42 authorization endpoint, preserved the callback,
returned cancellation to the `intra42://oauth` deep link, and invalidated the
used transaction. The existing signed-in simulator session was used for screen
validation, so a fresh end-to-end account login was not performed during this
audit.

## Baseline handoff

- The new branch is ready for isolated work without changing `main`.
- The mobile routes listed above are implemented and were rendered with real API data.
- Mobile authentication and the web experiment are still separate.
- The screenshots remain available locally only while the temporary directory exists.
