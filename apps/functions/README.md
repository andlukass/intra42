# Intra42 API

Nest hosts the existing allow-listed portal API as Firebase HTTPS Function `api`
(2nd generation, Node 22, europe-west1). Firebase Hosting site `api-intra` rewrites
requests to that Function: the intended production base URL is
`https://api-intra.web.app`. The site must be created in the selected Firebase
project before deployment; no cloud resources are created by local development.

## Local development

From the repository root:

```sh
npm ci
npm run dev:functions
# Or start Metro and the emulators together:
npm run dev:all
```

Install Java 21+ for Firestore. The script builds the backend and starts Functions
on 5001, Firestore on 8080, Hosting/API on 8787 and Emulator UI on 4000. It uses
`demo-intra42` by default; `INTRA42_FIREBASE_PROJECT` overrides the project ID.
Stop an existing emulator suite before starting `dev:all`.

`dev:all` sets `EXPO_PUBLIC_INTRA42_OAUTH_URL=http://127.0.0.1:8787` for the iOS
simulator. Physical devices require an HTTPS proxy, a reachable address and
`INTRA42_PUBLIC_ORIGIN` matching that browser-facing origin. The standalone mobile
broker remains available through `npm run login:mobile`.

Local application credentials `INTRA42_CLIENT_ID` and `INTRA42_CLIENT_SECRET` are
copied from `apps/mobile/.env` to the ignored, private `.secret.local`. You may also
create that file manually. Account passwords are transient and never persisted.
Production uses Firebase Secret Manager for these two application credentials.

Emulator data is exported on graceful shutdown to ignored `.firebase/emulator-data`
and imported on the next start. It contains sensitive authentication records;
do not publish or commit it. Backend source edits are rebuilt automatically and the emulator reloads the Function.

## Sessions and concurrency

Native keys, rotating refresh grants, legacy portal cookies and one-use browser
login transactions are stored as separate private documents in `intra42_sessions`.
Client Firestore reads/writes are denied by `firestore.rules`; only the Admin SDK
accesses them. Each request reloads the persisted snapshot and reconstructs runtime
maps. Expiry is checked on reads rather than relying on background timers.

The initial deployment deliberately uses one concurrent request and one instance.
A Firestore transaction lease also serializes instances during restarts/deployments,
so refresh rotation and one-use exchanges cannot race. The function waits for
persistence and lease release before returning. The lease expires after 180 seconds
if the process crashes (the request deadline is 120 seconds).

`shortcut:` This first adapter reloads the full session collection and serializes
all requests. Before increasing capacity, replace snapshots with per-session reads
and per-session distributed locks; do not simply raise concurrency/maxInstances.

## Deployment preparation

Build with `npm run build --workspace @intra42/functions`. The bundle includes
shared source, copies login assets and installs only the declared runtime packages;
no Chrome binary is needed. Configure the Firebase project, create Hosting site
`api-intra`, set both secrets and deploy Functions, Firestore rules and Hosting when
explicitly authorized. Production login from Google infrastructure still needs an
end-to-end test after deployment.
