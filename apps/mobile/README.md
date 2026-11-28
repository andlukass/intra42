# Intra42 mobile

The native app uses Expo Router and TanStack Query. On iOS it uses native system tabs. Android uses a standard React Navigation tab bar. Both show Home, Projects, Slots, Clusters, and Search. The signed-in user's photo appears in the Home profile card and as the Home tab icon. Until the tab photo is ready, or if it fails, Home shows an avatar icon. Logout is at the end of Home.

Search uses the same student and project endpoints as the official portal:
`/searches/search.json` and `/searches/project.json`. Results update after 500 ms
without typing and appear in **Students** and **Projects** groups, with matching
text highlighted. Select a student to open their native profile or a project to
open its native details. Searches support up to 100 characters. Clear the field
to remove results; upstream failures show a retry action rather than an empty
result. Requests use the saved portal session through `GET /api/search?query=…`.
Profile links accept a validated login as well as a numeric ID; the backend
resolves logins through `GET /v2/users/:login` using its public application grant.
The iOS Search button uses the system search tab role.
With an empty search field, **Recently searched** lists up to twenty profiles
and projects opened from results, newest first. Reopening an entry moves it to
the top. Each row has a separate remove button. History persists in the app's
local documents file `recent-searches.json` on that phone and is never uploaded
or synchronized. Removing an entry also persists across app restarts. If local
storage is unavailable, the screen keeps the change in memory and reports that
it could not save it.
Student thumbnails use the exact `cdn_uri` returned by official search, without
profile lookups. The authenticated `/search-photo?source=…` proxy accepts only
official CDN user-image URLs. Downloads run in parallel outside the API request
queue and use the device image cache. Initials remain the fallback for unavailable photos.

Projects shows ungraded projects with an open status from the signed-in profile
and a fixed set of featured projects from the portal reference. Open teams and
recommendations use compact rows, with shortcuts to Holy Graph and Project list
near the top. Project list reads the signed-in official portal catalog in pages, with name search,
cursus filters, and alphabetical or newest-first sorting. Rows show XP, duration
when available for the selected cursus and campus, and your enrollment status.
The filter toolbar follows the official flat style: icon sorting by name, duration,
recommendation, registration, creation or XP; **None** or **Recommended projects**;
and a course selector. Active choices are turquoise with thin separators. All
choices are forwarded to the official catalog and have separate query caches.
Cards show the official duration, XP, personalized recommendation, registration
status, and completed result when present. Parent project labels are preserved,
and result/recommendation colors follow the portal. These values come from
`GET /api/me/project-list`; recommendations are not inferred from API data.
Tapping a project in Projects, Project list, or the Holy Graph opens its native
detail screen. The screen loads metadata and steps from `/v2/projects/:slug`
and the current team from `/v2/projects_users/:id` for enrolled projects.
Project attachments download and open the native file share sheet.

Holy Graph opens a native map with one-finger dragging in any direction, two-finger pinch zoom anchored between the fingers, zoom/reset controls, and project search. Gesture Handler and Reanimated update the camera and transform a vector group inside the SVG on the UI thread, so zoom redraws crisp vectors and text instead of enlarging a bitmap. The SVG fits its fixed overview viewBox to the canvas on the native side, including the first draw. Canvas measurements are used for gesture coordinates. Project names stay visible in white at every zoom level. React updates only when selection/progress changes or a gesture ends (for the zoom controls). Pinch zoom is limited to 1×–12×; after a pinch, lifting one finger does not move the camera through a residual pan, and dragging does not select projects. Selecting a project only highlights it; it does not recenter or change zoom. The details footer keeps a fixed height to avoid resizing the graph when selection changes. Only search results, zoom buttons, and Reset view explicitly move the camera. Its bundled
42cursus coordinates and connections come from the official `/v2/project_data`
and project session endpoints. The bundled layout uses the Lisboa geometry when
available and shared 42cursus geometry for the remaining nodes. The signed-in
profile supplies project progress through the authenticated broker. Campus-specific
availability and layout updates remain on the official graph linked in the map.

## Run from the repository root

```sh
npm ci
npm run ios -- --device "iPhone 17"
npm run android
```

Use `npm run dev:mobile` for an existing development build. With a local HTTP
`EXPO_PUBLIC_INTRA42_OAUTH_URL`, it starts the sign-in/API service first, waits
for `/health`, then starts Metro. It reuses an already healthy service; only a
service started by this command is stopped when Metro exits. A backend startup
failure prevents Metro from starting. Remote HTTPS services remain separately
managed. Keep this command running while testing; `expo start` by itself does
not start the backend. Pass Metro options normally, such as
`npm run dev:mobile -- --port 8084`.

When building or reinstalling with an already running development server, use
`npm run ios -- --device "iPhone 17" --no-bundler` in another terminal.
Set `EXPO_PUBLIC_INTRA42_DEMO=1` when starting Metro to test with simulated
profile, events and slot data. Demo mode does not start the local backend.
Demo slot changes stay in memory.

After adding a native dependency such as `expo-image` or `expo-blur`, rebuild and reinstall the
development app with `npm run ios -- --device "iPhone 17" --no-bundler` when Metro
is already running. Fast Refresh cannot add native modules to an installed app;
`Cannot find native module 'ExpoImage'` means the installed binary needs this rebuild.

For iOS 27, Expo SDK 57 enables the required scene life cycle through
`expo-build-properties`. If an existing local iOS build closes immediately on
launch, run `npm exec --workspace @intra42/mobile -- expo prebuild --platform ios`
to apply the native configuration, then rebuild and reinstall.

## Sign in through your own server

The mobile app now uses the username/password portal flow from `unofficial-login`.
The web and native services share the Chrome worker, refresh grants, and scoped
calendar cookies in `packages/portal-server`. The web app keeps its own local
browser endpoints and UI.

1. Use Node.js 22.12+ for the sign-in service and install Google Chrome on its host.
2. Copy [.env.example](.env.example) to `.env` in this workspace. Keep
   `INTRA42_CLIENT_ID` and `INTRA42_CLIENT_SECRET` on the server. They are used
   for allow-listed API reads with a `public` application grant; account sign-in
   itself uses the official portal form and does not open an OAuth consent page.
3. Set `EXPO_PUBLIC_INTRA42_OAUTH_URL` to your HTTPS service URL (an optional path prefix is supported). This existing
   variable name is retained for compatibility. Start `npm run login:mobile`
   from the repository root (`npm run oauth:mobile` remains an alias).
4. Restart Metro and select **Sign in with 42** on Home. The system authentication
   browser opens the Intra42 login page. Enter your **Login** and **Password**
   there; after sign-in the browser returns to the app automatically. Existing
   installations already include `expo-web-browser` and `expo-crypto`, so this
   change needs no new native dependencies.

For the iOS simulator, use `PORT=3000` and
`EXPO_PUBLIC_INTRA42_OAUTH_URL=http://localhost:3000`. HTTP is accepted only for
loopback hosts in a development build. Physical devices need a reachable HTTPS
service. The broker binds to loopback; an HTTPS reverse proxy should forward
`/session/*`, `/sign-in`, `/sign-in.js`, `/sign-in-assets/*`, `/api/*`, `/avatar`, `/profiles/*`,
`/search-photo`, and `/achievement-icon` to it. The proxy must preserve the public HTTP Host.
Do not add a browser Origin header to native requests.

The backend opens the official portal in an isolated headless Chrome context,
checks the `auth.42.fr` destination before filling credentials, reads the completed
portal session, then closes Chrome. Credentials pass through the server and are
never persisted by the app. MFA, CAPTCHA, or changes to the official login page
can require an interactive step that this automated flow does not support.

Sign-in requires a renewable session. The worker reads the official portal's
stored OIDC refresh token, with the observed token response as a fallback, and
verifies an exchange before returning to the app. The rotated grant is saved
server-side; the app receives only its opaque local session key. Missing or
rejected grants fail sign-in instead of silently logging out at access expiry.

### Authentication browser

The app shows one **Sign in with 42** button. It uses
`WebBrowser.openAuthSessionAsync` to open the real system authentication browser:
a modal session on iOS and a Custom Tab on Android. The visible domain belongs
to the Intra42 server. This remains the server-backed portal login, rather than
a registered OAuth authorization flow.

The hosted page matches the public 42 student login theme: its geometric
background, white 42 logo, Futura PT font, pale fields, Remember me checkbox,
teal uppercase Sign In button, and official account/legal links. Those links
navigate directly to 42 in the current authentication browser, without a popup. Background and
logo assets are served locally from `/sign-in-assets/*`; Futura PT uses the same
Adobe Fonts stylesheet as the reference, with a sans-serif fallback. The page
keeps disabled controls and inline errors while signing in. Closing the system
authentication browser cancels the attempt. Remember me is forwarded to the
official login form; it does not change the app's existing session lifetime.

`POST /session/start` creates a ten-minute transaction with the app's random state
and SHA-256 verifier challenge. It returns a relative `/sign-in?transaction=...`
URL. Browser submissions require a matching Origin/Host and a transaction CSRF
header. The page disallows framing and external scripts, permits only the reference
font stylesheet/font hosts in addition to its local assets, uses no-store responses,
and suppresses referrers. The form uses POST even when JavaScript is unavailable.

Successful sign-in returns to the fixed `intra42://oauth` callback with only the
state and a random one-use code. `POST /session/exchange` requires the matching
transaction, state, code, and private verifier before releasing the native session.
The code expires after one minute. `POST /session/cancel` accepts the transaction
proof and releases any unclaimed session. Expiry and browser cancellation also
release unclaimed sessions, including a login that finishes after cancellation.
No password or session key is included in the callback URL.

### Native sessions and API access

- `POST /session/exchange` returns the opaque session key after browser sign-in.
  The former native `POST /session/login` remains available for compatibility. Upstream access tokens, refresh grants, and cookies stay on the server and
  are checkpointed to its private temporary session file. The mobile app saves only its opaque key and expiry in SecureStore.
- `POST /session/restore` checks the SecureStore key on app startup. The broker
  restores that key and its upstream credentials from disk after a restart.
  Editing/reloading the native app therefore preserves an unexpired session.
  Previous OAuth sessions are not restored by this login flow.
- `POST /session/refresh` renews the upstream grant when available. The app renews
  30 seconds before expiry, checks again after returning from the background,
  retries temporary failures, and clears a rejected session and its query cache.
  Without a refresh grant, a new sign-in is required at access-token expiry.
- `POST /session/logout` releases the native key, refresh grant, and calendar
  cookies. Logout clears the device session and query cache. Native sessions
  have a maximum lifetime of 24 hours. Logout and rejected refresh grants are
  removed from the persisted store as well as memory.
- Authenticated `GET /api/*` routes expose only the data resources needed by the
  mobile screens. `/api/me` resolves the user ID verified with the portal token.
  The server reads `/v2/users/:id` and other allow-listed resources using its
  public application grant. It preserves upstream denials, pagination totals,
  and rate-limit headers. Other users' evaluations, quests and evaluation logs,
  arbitrary URLs, unknown queries, and arbitrary writes are rejected.
- `GET /api/me/slots` reads available and blocked intervals using the signed-in
  portal cookies. `POST /api/slots` creates availability for that account using
  the portal CSRF token. It shares the web calendar's validation and write lock.
  Cancellation reloads a wider calendar window before matching the exact slot,
  preserving the boundary quarters and all official IDs returned by 42.
- Native endpoints reject browser Origin/Fetch Metadata headers and direct
  non-loopback connections. A reverse proxy terminates HTTPS and connects to
  the local broker. Responses use `Cache-Control: no-store`.

### Temporary session file

The server saves native session keys, upstream access/refresh credentials, and
scoped calendar cookies in a versioned `sessions.json` file under the OS temporary
directory. Its private subdirectory is derived from the server user's ID and
working directory, so restarting `npm run login:mobile` reopens the same file.
The service prints the file path at startup without logging any token values.
Files use permissions `0600`, and the containing directory uses `0700`.
Passwords are never saved.

Writes use a flushed temporary file and atomic rename. Login, refresh-token
rotation, cookie updates, expiry, and logout checkpoint their state immediately;
no graceful shutdown is required. Timers, request contexts, and in-flight browser
authorization transactions are recreated or discarded rather than serialized.
Expired entries are excluded during restore. Corrupt files stop startup with an
error rather than silently discarding all saved sessions.

`INTRA42_SESSION_FILE` can select another file in a private directory. Run only
one server process per file. The provider is selected only in
`packages/portal-server/session-store.ts`; an asynchronous `SessionPersistence`
contract isolates the file implementation and supports a future Firebase adapter
without changing authentication handlers. See the
[storage architecture](../../packages/portal-server/README.md#replacing-session-persistence).
This local store is not a multi-process database. If the OS
clears temporary files or 42 expires/revokes the session, sign-in is required again.
One fresh sign-in is needed for sessions that were already lost before this
persistence change. Do not copy the file into the repository or share it.

Data screens show skeletons sized to approximate their loaded sections while
the initial requests are pending. Home reveals
its content once the initial requests and profile photo have settled. The photo
is decoded before Home opens. Missing or failed photos show initials.

Home uses the official API for profile, campus agenda, evaluations, recent machine sessions, achievements, and ongoing projects. Slots shows a daily schedule with a week picker and initially shows the first available time with up to one hour of unavailable times above it for context when you select a day. Tap an available cell to prefill a 30-minute slot, or hold and drag to select a longer range and save it immediately on release.
Holding and releasing without moving saves the selected 30-minute cell through
the same flow, without also opening the form. The drag action uses the same validation and server endpoint as the form, shows success or errors in a temporary toast above the tab bar, and blocks duplicate submissions until the calendar refreshes. While selecting, timeline scrolling, day paging, and page scrolling are locked until release or cancellation. The confirmation form has a native start date picker and a start-time dropdown with 15-minute steps, a duration selector from 30 minutes to 8 hours in 15-minute steps, and a calculated end with a next-day indicator. The slot form uses scrollable content and a fixed bottom footer, matching the event modal, with secondary Cancel and primary Open slot actions side by side. The slot form uses scrollable content and a fixed bottom footer with Close and Open slot side by side, matching the event sheet. Tapping a past time shows an invalid-time toast. Existing open slots appear as continuous turquoise blocks with their full time range and an Available label; their height and position follow the actual interval, including 15-minute starts. New slots appear optimistically in the weekly calendar while saving. Cancellation also removes the slot immediately from cached calendars. Rejected
creations or cancellations restore the previous calendar; successful writes refresh the official
slots before unlocking further changes. Screen toasts sit 8 points above the bottom navigation safe area, using the shared
Toast default; modal toasts retain their explicit position. Slot creation and cancellation use a turquoise toast with white text, rounded corners, and a subtle shadow; it disappears after three seconds. Tap × on an open slot to cancel it. Cancellation resolves the real slot IDs from the authenticated calendar, rejects reserved or closed slots, blocks duplicate writes, and refreshes the calendar after confirmation. Existing slots stay blocked. The official calendar enforces campus limits and may reject slot creation. Other portal-only widgets remain in the web experiment. The mobile agenda lists the signed-in account’s official events, and Logtime opens on the current month and snaps to one complete month at a time, retaining the selected month when the layout width changes, with active days highlighted. The arrows move between the latest four months and are disabled at the ends of that range. Tap a day to see its total in an anchored tooltip. Tap outside to dismiss it.

### Profile photos and icons

The service serves authenticated profile photos at `GET /avatar` or
`GET /avatar?userId=:id`, public profile data at `/profiles/:id`, and official
achievement badges at `/achievement-icon`. Native identities come from the
server-side session. The broker checks image origins and sizes and uses its
public application grant to download the official CDN assets. Tokens never
appear in image URLs. Restart the service after updating these routes.

The older registered OAuth `/authorize`, `/callback`, `/exchange`, and `/refresh`
endpoints remain available for compatibility when `INTRA42_REDIRECT_URI` is
configured. The native sign-in UI no longer uses them.

Last achievements shows up to three recent awards. See all achievements opens
the profile's earned collection followed by visible achievements from
`/v2/campus/:id/achievements` that the profile has yet to earn. The catalog uses
the viewed profile's primary campus, falling back to its first campus when no
primary enrollment is provided. Without a campus, only earned achievements are
shown. Earned achievements are preserved even if they belong to another campus.
Category filters apply to
both sections. Evolutive achievements with the same name and category are grouped
by their required `nbr_of_success`. Earned groups show the highest earned level;
unearned groups show the next available level. Stacked borders and a level count
indicate expandable cards. Tap to reveal each level in ascending order, with its
own description, badge, medal, and earned date, then use **Hide previous levels**
to collapse it. Expansion is preserved while scrolling and switching categories.
Expansion and collapse measure both states and animate the group's explicit
height with Reanimated over 320 ms, moving surrounding rows continuously.
The contents crossfade with a small vertical reveal. The expanded content stays
mounted after its first opening so collapse can animate, and hidden content is
excluded from touch handling and accessibility. System Reduce Motion disables
these transitions.
The header count still counts individual earned awards. Single achievements keep
their original names. Award dates come from `/v2/achievements_users` and badges use the
icon paths from the API. Forward `/achievement-icon` to the sign-in service
so authenticated clients can load the official CDN badges.
Restart the sign-in service after updating it.

Achievement badges download independently of the 550 ms API request queue, so
visible rows can load their icons in parallel. The device caches validated image
data for 30 days, keyed by the official image path, and reuses it after app
reloads or restarts. Changed paths, expired entries, corrupt files, or an OS cache
purge trigger a fresh download. Storage failures fall back to the network without
blocking display. Authentication and transient-error retries remain enabled.
Icons and small profile photos share `src/imageCache.ts` with separate cache
directories; session credentials are never written to this image cache.

### Validation

Run these checks from the repository root:

```sh
npm run lint
npm run typecheck
npm run build:web
node --experimental-strip-types --test \
  apps/mobile/server/*.test.mjs \
  apps/mobile/src/session-*.test.mjs \
  apps/mobile/src/imageCache.test.mjs \
  apps/mobile/src/achievements/*.test.mjs \
  apps/mobile/src/home/*.test.mjs \
  apps/mobile/src/clusters/maps.test.mjs \
  packages/portal-server/*.test.mjs
```

The synthetic tests cover the shared login worker, trusted credential destination,
credential errors, browser state/verifier binding, one-use codes, cancellation,
session isolation, renewal, expiration, logout, allowed data
routes, calendar adaptation, photo identity, and upstream error handling.
The user confirmed a successful real-account sign-in through the authentication
browser on November 26, 2026. Live grant permissions for every native screen and
creating real calendar availability remain unverified for this migration.

## Visual reference

Signed-in pages open directly on their content without a page title. Section
headings and tab labels remain visible; profile and feedback screens keep their
native back button without a navigation title.

The native screens use the responsive styles from the local `unofficial-login`
branch as their reference. Shared colors and spacing live in `src/theme.ts`.
`src/ui.tsx` applies the light background, white panels, uppercase section
headings, teal actions, and compact spacing across the app.

Home and `/profile/:id` share `src/home/ProfileScreen.tsx`. The profile route reads
`GET /v2/users/:id`, with the authenticated broker described
above, and uses that user's photo, projects, logtime, and achievements.
Pending evaluations, the campus agenda, and account actions remain exclusive to
Home; other profiles do not request pending evaluations or agenda data.
The Projects actions (**Evaluation logs**, **Feedback logs**, and **Quests**)
appear on both profiles. Each destination preserves the viewed user's ID and
loads that user's records, with separate query caches. Feedback logs use
`/v2/users/:id/scale_teams/as_corrector`.
The profile screen supports pull to refresh and the native back button.
Profiles with a valid alumnization deadline show an **Alumnization** panel below
the contact details, including other users. Identity, contact, alumnization,
and milestone progress share one continuous coalition-colored profile container;
their inner panels retain their own borders and spacing. The app starts these
queries in parallel with the other profile widgets as soon as the user's ID
is known. Alumnization, pace, and attendance each have an independent request
queue, separate from the public API's rate limit. The initial profile skeleton
stays visible until those applicable queries and the existing profile resources
have settled, so panels do not appear later and shift the content. A missing
record or failed query does not leave the profile stuck loading. Background
refreshes retain the already displayed content. The native service reads the viewed
user's `/api/v1/alumni_auto/:id` on `alumni-management.42.fr` with the portal
grant. Missing dates and banned countdowns do not display a panel. Existing
alumni show their alumnization date. The benefits button opens the official
`https://meta.intra.42.fr/articles/alumni` page. Pull to refresh updates the countdown.
Other users' profiles include a **Marks / Achievements** selector, initially on
Marks. The selector uses uppercase text tabs on white, with a teal label and
underline for the active tab and a thin divider below, adapting the official
portal's navigation to mobile. Marks use the official portal's `/api/v1/users/:id/projects/marked`
endpoint with the selected `cursus_id`, through the authenticated native service.
The profile previews up to four marks. **See all marks** opens a dedicated page
for the viewed user and selected course, with course selection and the complete
list. Both buttons use the same outlined style as **See all achievements**.
Rows show the project, relative date, validation status, and mark. Expand rows
with multiple attempts or child projects to see the history in descending
occurrence order. Opening and closing animate the height, fade, and vertical
reveal over 320 ms, matching achievements and respecting Reduce Motion. The
disclosure arrow rotates with the animation. Project names open the native project screen. Achievements
shows up to four recent awards and links to that user's complete achievement
collection. Pull to refresh also updates the active Marks query.
Profile marks retry failed requests twice after the initial attempt. If marks
remain unavailable and achievements loaded successfully, the profile results
card displays only Achievements. If achievements are still loading or also fail,
the marks error and retry action remain available. Cached marks stay visible
when a background refresh fails.

Ongoing project names are teal links. Selecting one opens the native project
page for the viewed profile, including that user's enrollment, team, and marks.
Project steps and the official project link preserve the same user context.
On iOS, profiles opened from other screens use a translucent, blurred native
header without a separator. The scroll view adjusts its inset beneath that
header once, avoiding a duplicated safe-area gap in loaded, loading, and error states.
Tap the profile photo on Home or another user's profile to open a full-screen
viewer. It shows the uncropped image on black, supports native iOS pinch zoom
(1–4x), respects safe areas, and has a 44-point close button. The existing photo
stays visible while the original loads; failures offer a retry. Original images
use the authenticated `/avatar?userId=:id&size=full` endpoint and a separate query
cache entry. The app verifies the response's `size: "full"` marker to reject
older thumbnail responses. The viewer has no zoom hint text. Restart the sign-in
service after updating this endpoint.

Home's `src/home/ProfileCard.tsx` renders the olive profile panel, availability,
avatar, selected title, level progress, account counters, and contact details.
The selected title appears below the name. On Home, tap it to select an earned
title or the plain login. The title and course share the same anchored white
selector, active-row highlight, checkmark, scrolling, and outside-tap dismissal.
Title changes update the profile immediately and disable the selector while saving.
The shared success toast appears after 42 confirms the change. Failed saves restore the previous selection
and show the shared error toast. Pending profile reads are cancelled before
the write and before updating the cache so an older read cannot undo the selection. Other users'
profiles display their title without an edit control.

`POST /api/me/title` accepts a numeric `titleId` (`0` clears the title). The broker
verifies the account and matches the requested definition ID against the portal
profile's `title_id` field, resolves its owned `title_user_id`, then
uses the official `/titles_users/:title_user_id/selected` GET or
`/titles_users/unselected` POST action, then reads the portal profile again to
confirm the requested selection before reporting success. Arbitrary title assignment IDs and target
users are excluded. Concurrent saves for one session are rejected. The server-side
portal token is used for writes; the public application grant is used only for
reads. Demo title changes remain in memory.

Email, campus, and data
erasure date have their own icons. Tap a contact row to show its field description
in a dark tooltip with a light border. The erasure date shows **Personal data
erasure date**. Tap outside the tooltip or on it to dismiss it.
Hidden or missing values display as `-`.
On 42cursus, compatible profiles also show **Milestone Deadline**, elapsed days
since the last validated milestone, and the four previous weeks of attendance.
**Common Core ETA** includes a horizontally scrollable milestone timeline, a red
current-date marker, and the shared Log time calendar tooltip (including its arrow) with begin and deadline dates
on milestone tap (end date for validated milestones). Tap outside or on the
tooltip to dismiss it. Both calendars use `src/home/CalendarTooltip.tsx`. The dates and eligibility come
from the official pace profile; completed profiles with no deadline or ETA show
neither block. Other courses do not show common-core progress. Attendance failure
has its own retry action and does not hide the available pace dates. Pull to
refresh reloads both resources for the viewed user.
The service proxies fixed read-only routes `/api/users/:id/pace` and
`/api/users/:id/attendance` to `pace-system.42.fr` and `edtrax.42.fr` using the
server-side portal token. These endpoints also support other users' profiles,
subject to the official service's access checks; no dates are inferred from the
public API profile. A missing official profile is treated as unavailable data.
Profiles open on 42cursus when the user has progressed in it. Otherwise they
open on the first enrollment with a coalition, or the first enrollment if no
coalition matches. Tap the course label to switch enrollment and its colors.
Home and profile cards match `/v2/users/:id/coalitions` to the course and campus
blocs from `/v2/blocs`. The official accent colors the avatar border and level
progress. The card, contact details, and loading skeleton use related shades.
Courses without a matching coalition use a neutral palette.

Pull down from the top of Home to refresh the profile, agenda, pending
evaluations, and logtime. Projects and achievements update with the profile.
On Home, content scrolls behind a blurred status bar. Android versions before
12 use a translucent tint in that area.

`src/home/EventCard.tsx` renders agenda items with white dates on a colored column,
the event category and name, a single-line exam summary, and matching colored
icons for duration, relative date, location, and capacity when limited. Metadata
wraps to fit narrow screens. These components use the existing official API data. The profile
uses the platform system font.

Pending evaluations appears on Home below the profile and above Agenda, and
refreshes when pulling down Home. Feedback logs opens the native feedback history; Manage slots opens the Slots tab. The card has no Hide action. It is not shown on other users’ profiles. It uses the same `/api/v1/users/me/scale_teams` portal
feed as the official frontend, through the native server's `/api/me/evaluations`
route. Rows distinguish evaluator and evaluated roles, link the peer profile,
show the project and relative time, and reveal the full date in the shared
calendar tooltip when the time is tapped.
When an evaluator's scheduled time arrives, **Begin Evaluation** opens the
official evaluation page. Cancellation and absence-report actions are not
implemented in the native client.
Feedback logs is available through the profile
project actions and shows the paginated history of completed evaluations you
performed. The history uses the official
`/v2/users/:id/scale_teams/as_corrector` endpoint and displays the available marks,
comments, and ratings. Entries use flat white rows with subtle separators, date
and time, and turquoise percentage and rating badges beside the comments.
Each entry links the evaluator and evaluated users to their profiles and resolves
the project name from the team project ID through the shared query cache.
The project name uses a skeleton while loading. Its row includes the evaluation
result badge and a **show** link to the evaluated user's project page. The badge
and **show** stay together on the right and wrap below the name when space is limited.
Its title, **Feedbacks you made**, appears in the native
navigation header, following Achievements. When viewing another user, the title
is **Feedbacks {login} made**. Use the back button to return to the profile.
See [design guidelines](../../design.md) for the screen title rule.

Agenda reads `/api/v1/users/me/events` from the official portal and shows the next three events. Load more reveals three more from the same cached response. Tap an event to open a native iOS sheet or Android modal with its description, schedule, location, attendance, and registration state. Subscribe and Unsubscribe use the official portal’s event or exam routes and show Subscribed or Unsubscribed in the same temporary turquoise toast used by Slots after success. Waiting-list actions also show a toast. Full events offer the official waiting list when available. The server rereads the account’s agenda before writing, resolves registration IDs itself, and checks capacity and cancellation deadlines. Buttons remain disabled while saving; the agenda is refreshed after every attempt. Event descriptions support paragraphs, headings, lists, emphasis, and HTTP(S) links. **Share event** at the end of the content opens the native share sheet with the official event or exam URL.

Ongoing projects links to Evaluation logs, Feedback logs, and Quests. Evaluation
logs uses the native navigation title and a white timeline grouped by date.
The chart shows the point balance with grid lines, date labels, and data markers.
Changes from `/v2/users/:id/correction_point_historics` use signed badges and show
the balance and timestamp. Evaluation details are loaded from `/v2/scale_teams/:id`
with skeleton placeholders, profile links for participants, and the project name.
Quests shows the quest
enrollments and their completion status from `/v2/users/:id/quests_users`.


Slots follows the responsive `apps/web/src/pages/slots.css` layout from
`unofficial-login`. The shared `styles.card` surface, matching Pending evaluations,
groups the compact toolbar, turquoise
seven-day picker, centered week title, and bordered daily schedule with a separate
time column. Hour labels use the official 12-hour am/pm format; half-hour rows
keep their grid lines and selection behavior without repeating a time label.
Only the selected day is displayed, and **New slot** remains in the toolbar.
Swipe left or right across the daily schedule to slide between days using native
horizontal paging, as in Log time. The selected day and week at the top update
only after the slide settles, including across week boundaries. Each request covers one calendar week; neighboring weeks load separately
when needed for accurate previews. Vertical scrolling stays independent;
holding to select a time range temporarily locks horizontal paging. The selected
interval is shaded and outlined in turquoise, with its start and end times shown
inside the highlight. Releasing opens the editable confirmation; no slot is saved
until confirmed. Selection stops at occupied or past cells.
**Today** is turquoise and enabled when another day is selected; selecting it
returns to the current day. It is disabled with a softer color on the current day. Each 30-point row keeps the same half-hour interval.
Available cells are pure white and contain no status text; occupied and past
cells retain their distinct colors. Full time ranges and status remain available
to screen readers. The creation sheet separates date and time
fields for the start and end, matching the reference's shaded time-range panel.
Tap and hold-and-drag selection continue to use the existing schedule behavior.
Pull down from the top of Slots to reload the displayed week's availability
while keeping the selected day.


The Logtime month title and calendar follow your finger and snap into place
together when released. Days with more recorded time get a darker teal shade.
Swipe right for the previous month or left for the next. Logtime uses the
paginated official locations API for sessions
beginning in the four displayed months. It sums multiple sessions per day and splits sessions at
local midnight. Ongoing sessions count up to the query's fetch time. Dates use
the device time zone. Sessions beginning before the displayed window are outside
the current query.


## Clusters

**Other campuses** at the bottom uses the paginated global `GET /v2/campus`
catalog with the signed-in user's token. It is not restricted to campuses linked
to the profile. Search or load more campuses, then expand one to fetch its maps
on demand. This avoids requesting every campus's maps at once. Map queries share
the same TanStack Query cache as the selector. Forbidden or failed catalogs show
an inline message and retry action.
Selecting a map changes the active campus, fetches that campus's occupancy, and
scrolls to the top. The horizontal cluster selector also scrolls to center the
selected tab, including maps chosen through the campus picker. Availability
counts align with the campus card content. The initial campus comes from the user's profile. Selection
is scoped to the signed-in user. Pull to refresh retries the global campus list
and mounted map catalogs. A campus being listed does not guarantee permission
to read its map catalog.

Map mounting waits for the selector's native scroll to settle, with a 350 ms
fallback when no scroll event occurs. A skeleton fills the map area during this
transition. Downloaded maps and parsed SVG artwork share the TanStack Query
cache; artwork is keyed by map URL and occupied seats and expires after the
default inactive-query retention period. Revisiting a cached map skips SVG
parsing, and the memoized background avoids rebuilding it when a seat tooltip
changes.

`src/clusters/official-maps.json` contains 151 public SVG URLs for 50 campuses,
read from `https://meta.intra.42.fr/campus/:id/clusters` in an authenticated browser
on November 25, 2026. All listed SVGs returned 200 and included parseable seat
coordinates. Two maps without seat positions were excluded. Runtime reads use
this metadata before the public API cluster catalog, which may be forbidden or
empty even when the Meta portal has maps. No portal cookies or tokens are stored
in this file. Updating it requires verifying the URLs against the official page
and checking the SVGs. Unknown campuses fall back to the API and explicitly report
missing metadata instead of claiming that the campus has no maps.

The cluster and campus controls stay above the map while it scrolls. Use
**Change campus** to open the searchable campus list from any point on the map.

Clusters selects the primary campus from the signed-in profile, lists its maps,
and trims leading SVG whitespace to an eight-unit margin before the first seats,
keeping the same zoom and matching photo/tap coordinates. Row labels remain visible.
It overlays active workstations from the paginated official campus locations
API. Occupancy refreshes every minute. Pull down from the top of the map to refresh
the map catalog, occupancy, and failed occupant photos; the indicator stops when
these requests finish. Pulling also retries native image rendering failures. Tap an
occupied seat to open an anchored tooltip with its occupant and host. Tap the
tooltip to open that user's profile, or outside it to dismiss. Drag the map
itself to scroll vertically and horizontally, including at the bottom. iOS
supports native pinch zoom (0.28–3 times the initial size). On iOS, a single native scroll view uses the full canvas dimensions for horizontal, vertical, and diagonal dragging at the current zoom. Photos that
cannot load fall back to initials.
Occupied seats use the same authenticated photo service as Home, with TanStack
Query caching per user. Small profile photos also use the device's app cache
for up to 30 days from download, keyed by user ID and thumbnail URL. The app
downloads them again if the URL changes, the cache expires, or the OS clears it.
Full-size profile photos continue to use a separate query. The map and its tooltip
reuse the same decoded image through Expo Image.
Photos fill and clip to the seat; the SVG rectangle and
number underneath occupied seats are removed, leaving labels on empty seats.
CDN application credentials stay on the sign-in service.
Temporary photo request failures retry twice with backoff. Invalid requests,
expired sessions, forbidden requests, and missing photos do not retry automatically.
Photo responses include the requested user's ID, which the app verifies before
displaying the image. The cache version excludes earlier unverified responses.
Restart that service after updating its photo endpoint.

Verified campuses, including Lisboa and Porto, use the official Meta map metadata
directly. Campuses missing from the bundled catalog use `GET /api/campus/:id/maps`. The server reads the authenticated Meta HTML and validates its official cluster CDN URLs. Missing SVGs produce an empty state rather than an access-denied error; Bangkok currently lists three zones without publishing their maps.
Map responses are normalized from `image_url`, a nested `image.url`, or the local
`image` string, using the selected campus when `campus_id` is omitted. Invalid
metadata and missing map URLs have separate errors. SVGs are fetched from the
official cluster CDN path.

The SVG reader removes comments before reading seat coordinates or rendering the
map, including stray comment endings found in Amsterdam's map. Commented examples
are not counted as workstations. Run
`node --test apps/mobile/src/clusters/maps.test.mjs` from the repository root for
the Amsterdam parser regression checks.

Occupancy comes from `GET /v2/campus/:id/locations?filter[active]=true` using the
signed-in user's token. The app matches each active session's `host` to a seat ID
in the SVG, shows occupied and available totals for the selected map, and reveals
the occupant's login when a seat is tapped. A live read on November 25, 2026
confirmed that both Lisboa SVGs load and all 29 active hosts match their seats.
Only workstations present in the selected map count toward its availability.

The bottom tab for the evaluation calendar is labeled **Slots** on iOS and
Android; its internal route remains `/slots`.

For physical-device testing over Tailscale, Metro can advertise the private Mac
hostname on port 8081. The sign-in/API service may be reverse-proxied under a
private HTTPS path such as `/intra42`; configure the full base URL in
`EXPO_PUBLIC_INTRA42_OAUTH_URL`. The login page uses relative asset and form URLs
so the same routes also work through a path prefix. Keep the underlying service
bound to loopback and retain existing Tailscale routes when adding this proxy.

Slot creation and event details share the same modal footer, with a secondary Close button and matching bottom spacing.

Slot creation is limited to the next 14 × 24 hours, including the entire duration. The date and time selectors respect this window; invalid duration changes keep the previous selection and show a red error toast above the modal footer. The server validates the deadline too.

Start-time options exclude past times and stop 30 minutes before the rolling 14-day deadline. Opening the dropdown refreshes the options against the current time. Changing dates adjusts the start time to an available option when necessary. Longer durations still require the full interval to fit the booking window.

The campus chooser follows the shared modal layout: white surface, sentence-case title, scrollable search and campus list, and a fixed ModalFooter with the secondary Close action.

Slots uses the primary campus `time_zone` from the signed-in profile for day boundaries,
calendar labels, date selection, and slot creation. It does not use the phone timezone.
For Lisboa, the official calendar returns UTC+00:00 in winter and UTC+01:00 in summer,
matching `Europe/Lisbon` in the campus profile. Dates are converted to UTC ISO strings
at the request boundary; the server receives the same instants shown in campus time.

Campus search and the project list reuse SearchField, with the same rectangular input and turquoise Search button. Campus filtering remains immediate while typing.

The campus chooser only lists campuses with map URLs in the verified official catalog. Campuses without published maps, such as Bangkok, are excluded from both browsing and search. Newly published campuses need to be added to this catalog before they appear in the chooser.

The campus chooser displays every matching campus at once in its scrollable list; there is no Load more step.

Tapping a campus immediately opens its first verified cluster and closes the chooser. Other clusters remain selectable on the Clusters screen; campus rows do not expand.

Campus rows display the country flag beside the name using the country returned by the API. Unknown or missing countries retain the campus name without a flag.

Cluster canvases preserve the complete SVG viewBox and any seat bounds outside it, with a proportional 2% white margin (at least 16 SVG units). They do not crop artwork to the first seat. The canvas and seat overlays use the same viewport so labels and rotated furniture remain visible while panning.

The horizontal cluster selector shows small non-interactive white gradient fades at its edges only in directions with hidden content; they disappear when that edge is reached or all tabs fit.

Maps initially scroll past oversized SVG margins to start near the first seats, leaving 48 horizontal and 32 vertical SVG units of context. The complete canvas remains reachable by panning back.

The Clusters loading skeleton mirrors the campus header and action, horizontal tabs, occupancy legend, and desk layout on a white canvas, instead of a single solid placeholder.

Slots skeletons mirror the toolbar order, centered week label, seven day columns, and 400-point calendar grid. Hour placeholders appear in the left time column, with neutral bars across the schedule rows to indicate that availability is still loading.


The Projects overview keeps a single-column list inspired by the official portal: turquoise open-team rows with lightning icons, gray recommended-project rows with stars, and turquoise Holy Graph / Project list shortcuts between Open teams and Recommended projects.

Project pages load the signed-in account's official project overview through
`GET /api/projects/:slug/overview`. The server reads the Projects page, its
`stats.json`, and its registration statistics using the saved portal session.
The native screen shows availability, duration/XP, official file attachments,
requirements, description, keywords, skills, activity counts, and SVG charts for
success rate, average team lifespan, grade distribution by campus, and evaluation
flags. Empty charts follow the official visibility rules. Campus chart filtering
and tappable chart points expose values on small screens. Failed chart requests
keep the overview visible and offer Retry charts. Existing owner-specific team,
mark, and project-step navigation is preserved. Viewing this screen does not change enrollment. The project page has no Open in 42 button; official attachments remain available through download and native sharing.

Project detail screens use the loaded project name as their native navigation title, without a duplicate heading in the page body.

Search focuses its input once after its first layout and navigation interactions finish, avoiding keyboard autofocus during the initial tab mount. Pending focus work is cancelled when the screen loses focus.

Project loading uses the same structured skeleton during both public details and official overview requests: status panel, metadata/PDF row, description, keyword/skill lists, activity counters, and chart/legend placeholders. It shares final card spacing to reduce layout shifts.

Project attachments download into the app cache and then open the native file share sheet. This applies to PDFs and other official CDN files. The active attachment keeps its filename and displays a simple animated ring beside it (respecting reduced motion), repeated taps are blocked, and failed downloads offer an error without opening a browser. Installing expo-sharing requires rebuilding the development client.

Attachment downloads use authenticated `GET /api/project-attachment?source=...`. The server only accepts official CDN URLs and uses its stored portal session, since direct unauthenticated CDN downloads can return 403. Cookies and upstream credentials stay on the server.

Project activity always offers Students who can subscribe and never did, including
solo projects. Students looking for a team appears when the official portal supplies it.
Both open native student-list screens with photos, presence indicators, links to
profiles, a total count, empty/error states, and paginated Load more. The lists
come from the same authenticated `/projects/:slug/all_users/without_team` and
`/projects/:slug/all_users/can_register` portal pages; the app does not infer
eligibility from project status. Local GET `/api/projects/:slug/students/:kind`
accepts only these two kinds and a positive page number (maximum 1000).

The project summary distinguishes neutral XP explanations, turquoise delivery-step
links, and red subscription restrictions. “See my project page” opens the native
personal view using `GET /api/projects/:slug/personal`, backed by the signed-in
account's official `/:slug/mine` page. This view includes all attempts, team
progress or final mark, repository text, automatic and peer evaluations, feedback,
and ratings when present. Delivery steps use the same personal view. Reading a
project never submits it or changes enrollment.

The summary uses consistent dividers and row padding. When the official personal
page offers Unregister, the app shows its red button and asks for confirmation.
`POST /api/projects/:slug/unregister` reloads the saved account's personal page,
validates the official action and CSRF token, performs the cancellation, and
checks the resulting overview before reporting success. The app refreshes cached
project and profile data after confirmation from 42.

Some project steps, including Contract Upload, redirect their personal `/mine`
page to their public project overview. The reader accepts only a redirect to the
same project's exact official URL, then loads its overview and charts normally.
Closed steps remain readable and display a red status panel with a lock.

Project links in a student's profile (ongoing projects and marks) open that
student's project directly. Their profile's project enrollment ID is used by
`GET /api/projects/:slug/registrations/:id` to read the official project-user page,
including its teams and evaluations. An explicit viewed owner never falls back
to the connected account's `/mine` page while their enrollment is loading.

Team cards show the green “Set the project as finished” action only when the
official page exposes an enabled finish control for that team. A native
confirmation precedes submission. `POST /api/projects/:slug/teams/:teamId/finish`
reloads the connected account's `/mine` page, validates the current team action,
submits its official method with server-held CSRF, and verifies closure before
reporting success. Cached project/profile data is refreshed after success.

Project attempts use an accordion: the most recent attempt (listed first by the
official portal) starts expanded. Opening another attempt closes the previous
one; tapping the expanded header closes it. Collapsed headers keep the team name
and mark or progress visible.

Marks links pass their `projects_user_id` directly to the project screen, including
child projects and previous attempts. Navigation does not depend on finding that
registration again in the user's profile or default to a general project page.

Attempt expansion animates measured content height over 320 ms, with the same
cubic easing, fade and slight vertical movement as achievements. Collapse keeps
visited content mounted for the closing animation; hidden details do not accept
touches or accessibility focus. Reduced Motion disables the transition duration.

Official chart data can include negative grade bins (for example `-40` for
Libft). These are valid grades and do not invalidate the other charts. Counters
and percentages must still be finite and nonnegative. The campus chart keeps
the official visible grade range of 0–125.
