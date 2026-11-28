# Intra42 OTA infrastructure

The `intra42Updates` Firebase HTTPS function serves Expo Updates v1 manifests
by platform, channel, and runtime fingerprint. A lookup without a matching
manifest returns HTTP 204. A dedicated Cloud Storage bucket in the Firebase
project stores public release bundles and assets under the `intra42-assets/`
managed folder and private active manifests under `intra42-active/`.

Configure `OTA_FIREBASE_PROJECT`, `OTA_STORAGE_BUCKET` (without `gs://`),
`OTA_UPDATE_URL` (the function's public HTTPS URL), `OTA_SERVICE_ACCOUNT`, and
`OTA_FUNCTION_REGION` in `apps/ota/.env`. The project needs billing enabled. Use uniform bucket-level
access, grant anonymous object reads on the asset folder, and grant the function's
service account object reads on the active manifest prefix. The publishing account
needs Storage object create access and delete access to replace active manifests.
Only publish files intended for public download. Signed manifests are outside the
current setup.

Deploy the dedicated function from the repository root:

```sh
set -a
. ./apps/ota/.env
set +a
npm ci --prefix apps/ota
firebase deploy --project "$OTA_FIREBASE_PROJECT" --only functions:intra42-ota:intra42Updates
```

`npm run update:ota` prepares iOS and Android updates before uploading them, uses
create-only writes for immutable release assets, verifies their public SHA-256
hashes, and then activates and checks each platform independently. Use
`--platform ios|android|both`, `--channel preview|production`, or `--prepare-only`
to select the target and operation. Prepare updates after the native build, using
the same dependency installation and channel. The prepare step prints the runtime
fingerprint for each platform so it can be compared with
`EXUpdates.bundle/fingerprint` in the iOS app or `assets/fingerprint` in the APK.
For a failed upload, rerun
`node apps/ota/upload-ota.cjs output/ota-DIRECTORY` for the prepared release.
To recover from a faulty OTA, publish the last known good source for the same
runtime and channel. Keep old release assets available for clients downloading
existing manifests.
