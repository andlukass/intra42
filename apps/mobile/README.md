# Intra42 mobile

The native app uses Expo Router and TanStack Query. On iOS it uses native system tabs. Android uses a standard React Navigation tab bar. Both show Home, Projects, Slots, and Clusters. The signed-in user's photo appears in the Home profile card and as the Home tab icon. Logout is at the end of Home.

Projects shows ungraded projects with an open status from the signed-in profile
and a fixed set of featured projects from the portal reference. Open teams and
recommendations use compact rows, with shortcuts to Holy Graph and Project list
near the top. Project list loads the official catalog in pages, with name search,
cursus filters, and alphabetical or newest-first sorting. Rows show XP, duration
when available for the selected cursus and campus, and your enrollment status.
Tapping a project in Projects, Project list, or the Holy Graph opens its native
detail screen. The screen loads metadata and steps from `/v2/projects/:slug`
and the current team from `/v2/projects_users/:id` for enrolled projects.
Open in 42 leads to the official page for documents and registration actions.

Holy Graph opens a native map with pan, zoom, and project search. Its bundled
42cursus coordinates and connections come from the official `/v2/project_data`
and project session endpoints. The bundled layout uses the Lisboa geometry when
available and shared 42cursus geometry for the remaining nodes. The signed-in
profile from `/v2/me` supplies project progress through OAuth. Campus-specific
availability and layout updates remain on the official graph linked in the map.

## Run from the repository root

```sh
npm ci
npm run ios -- --device "iPhone 17"
npm run android
```

Use `npm run dev:mobile` to restart Metro for an existing development build. Set `EXPO_PUBLIC_INTRA42_DEMO=1` when starting Metro to test with simulated profile, events and slot data in a development build. Demo slot changes stay in memory.

After adding a native dependency such as `expo-image` or `expo-blur`, rebuild and reinstall the
development app with `npm run ios -- --device "iPhone 17" --no-bundler` when Metro
is already running. Fast Refresh cannot add native modules to an installed app;
`Cannot find native module 'ExpoImage'` means the installed binary needs this rebuild.

For iOS 27, Expo SDK 57 enables the required scene life cycle through
`expo-build-properties`. If an existing local iOS build closes immediately on
launch, run `npm exec --workspace @intra42/mobile -- expo prebuild --platform ios`
to apply the native configuration, then rebuild and reinstall.

## Sign in with the official 42 API

1. Register a 42 OAuth application with the `public` and `projects` scopes. Register the exact HTTPS callback URL ending in `/callback`.
2. Configure the OAuth service using the variables from [.env.example](.env.example). Set the server-side credentials in its environment and start it with `npm run oauth:mobile`. Run it behind an HTTPS reverse proxy forwarding the OAuth routes to its loopback port (8787 by default). Keep the server credentials on the host running the service.
3. Set `EXPO_PUBLIC_INTRA42_OAUTH_URL` to the HTTPS service origin in the Expo environment, restart Metro, and use **Sign in with 42**.

The app opens the official OAuth consent page in a system browser. The broker keeps the authorization code server-side and exchanges it after the app proves ownership of the transaction. The app keeps the resulting tokens in SecureStore and clears them on logout.

Data screens show skeletons sized to approximate their loaded sections while
the initial requests are pending. Home reveals
its content once the initial requests and profile photo have settled. The photo
is decoded before Home opens. Missing or failed photos show initials.

Home uses the official API for profile, campus agenda, evaluations, recent machine sessions, achievements, and ongoing projects. Slots shows a daily schedule with a week picker and scrolls to the first available time when you select a day. Tap an available cell to prefill a 30-minute slot, or hold and drag to select a longer range. Both start and end are editable. Tapping a past time shows an invalid-time toast. Existing slots stay blocked. The 42 API enforces campus limits and may reject slot creation if the user or application lacks permission. Portal-only widgets and actions remain in the web experiment. The mobile agenda lists campus events, and Logtime opens on the current month and shows one calendar at a time, with active days highlighted. The arrows move between the latest four months and are disabled at the ends of that range. Tap a day to see its total in an anchored tooltip. Tap outside to dismiss it.

For iOS simulator development, a registered loopback callback such as
`http://localhost:3000/oauth/callback` works with `PORT=3000` and
`EXPO_PUBLIC_INTRA42_OAUTH_URL=http://localhost:3000`. Set
`INTRA42_SCOPES=public` for a client that can only read account data. Creating
evaluation slots requires the `projects` scope.


The OAuth service serves profile photos at `GET /avatar` (the signed-in user) or
`GET /avatar?userId=:id` (another user's public photo).
It validates the caller against `/v2/me`, then reads the target's public profile
and downloads its image from the official 42 CDN with a server-side application
grant scoped to `public`. Session verification is reused for 30 seconds across
map photos; its cache is bounded and keyed by a hash of the bearer token. The
application token stays on the server.

User OAuth grants can deny profiles outside the account's campus even when the
same profiles are readable with the application's public grant. For a GET denied
with HTTP 403, the central API client retries only `/users/:id`,
`/users/:id/coalitions`, and `/users/:id/locations` through matching
`/profiles/:id` broker routes. These routes require a verified user session and
use the public application grant; 42's remaining denials are preserved. Writes,
agenda, evaluations, and arbitrary API paths are excluded. Forward `/avatar`
and `/profiles/*` alongside the OAuth routes in your HTTPS reverse proxy.

Last achievements shows up to three recent awards. See all achievements opens
the profile's earned collection followed by visible achievements from
`/v2/achievements` that the profile has yet to earn. Category filters apply to
both sections. Award dates come from `/v2/achievements_users` and badges use the
icon paths from the API. Forward `/achievement-icon` to the OAuth service
so authenticated clients can load the official CDN badges.
Restart the OAuth service after updating it.

On November 25, 2026, a real simulator session returned 200 for `/me` and 403 for
a Porto user's profile. The authenticated broker returned 200 for that user's
public profile, coalitions, locations, and photo with the expected user ID.
The same simulator rendered that profile with its photo and logtime calendar,
and displayed different occupants' photos on the Porto cluster map.
Run `node --test apps/mobile/server/oauth.test.mjs` from the repository root to
check session validation, allowed routes, public-grant reads, photo identity,
image origin checks, and upstream denial/rate-limit handling.


## Visual reference

Signed-in pages open directly on their content without a page title. Section
headings and tab labels remain visible; profile and feedback screens keep their
native back button without a navigation title.

The native screens use the responsive styles from the local `unofficial-login`
branch as their reference. Shared colors and spacing live in `src/theme.ts`.
`src/ui.tsx` applies the light background, white panels, uppercase section
headings, teal actions, and compact spacing across the app.

Home and `/profile/:id` share `src/home/ProfileScreen.tsx`. The profile route reads
`GET /v2/users/:id`, with the authenticated public-profile fallback described
above, and uses that user's photo, projects, logtime, and achievements.
Pending evaluations, the campus agenda, and account actions remain exclusive to
Home; other profiles do not request evaluations or agenda data.
The profile screen supports pull to refresh and the native back button.
Tap the profile photo on Home or another user's profile to open a full-screen
viewer. It shows the uncropped image on black, supports native iOS pinch zoom
(1–4x), respects safe areas, and has a 44-point close button. The existing photo
stays visible while the original loads; failures offer a retry. Original images
use the authenticated `/avatar?userId=:id&size=full` endpoint and a separate query
cache entry. The app verifies the response's `size: "full"` marker to reject
older thumbnail responses. The viewer has no zoom hint text. Restart the OAuth
service after updating this endpoint.

Home's `src/home/ProfileCard.tsx` renders the olive profile panel, availability,
avatar, selected title, level progress, account counters, and contact details.
The selected title appears below the name. Phone, email, campus, and data
erasure date have their own icons.
Hidden or missing values display as `-`.
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

`src/home/EventCard.tsx` renders agenda items with a colored date column and
event details. These components use the existing official API data. The profile
uses the platform system font.

Pending evaluations appears below the profile on Home. Manage slots opens the Slots tab, and Feedback logs opens the paginated history of
completed evaluations you performed. The history uses the official
`/v2/me/scale_teams/as_corrector` endpoint and displays the available marks,
comments, and ratings. Use the back button to return to Home.

Agenda shows the next three campus events. Load more adds up to three more.

Ongoing projects links to Evaluation logs, Feedback logs, and Quests. Evaluation
logs charts your point balance over time and lists the changes and reasons
reported by `/v2/users/:id/correction_point_historics`. Quests shows the quest
enrollments and their completion status from `/v2/users/:id/quests_users`.


Slots follows the responsive `apps/web/src/pages/slots.css` layout from
`unofficial-login`. A single white panel groups the compact toolbar, outlined
seven-day picker, and bordered daily schedule. Each 46-point row contains the
time range and availability status. The creation sheet separates date and time
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
scrolls to the top. The initial campus comes from the user's profile. Selection
is scoped to the signed-in user. Pull to refresh retries the global campus list
and mounted map catalogs. A campus being listed does not guarantee permission
to read its map catalog.

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
supports native pinch zoom (0.28–3 times the initial size). Photos that
cannot load fall back to initials.
Occupied seats use the same authenticated photo service as Home, with TanStack
Query caching per user. Small profile photos also use the device's app cache
for up to 30 days from download, keyed by user ID and thumbnail URL. The app
downloads them again if the URL changes, the cache expires, or the OS clears it.
Full-size profile photos continue to use a separate query. The map and its tooltip
reuse the same decoded image through Expo Image.
Photos fill and clip to the seat; the SVG rectangle and
number underneath occupied seats are removed, leaving labels on empty seats.
CDN application credentials stay on the OAuth service.
Temporary photo request failures retry twice with backoff. Invalid requests,
expired sessions, forbidden requests, and missing photos do not retry automatically.
Photo responses include the requested user's ID, which the app verifies before
displaying the image. The cache version excludes earlier unverified responses.
Restart that service after updating its photo endpoint.

Verified campuses, including Lisboa and Porto, use the official Meta map metadata
directly. Other campuses use `GET /v2/clusters?filter[campus_id]=:id`, which requires
Basic staff access.
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
