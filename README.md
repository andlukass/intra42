# Intra42

Intra42 contains an Expo [mobile app](apps/mobile/README.md) using a server-backed 42 portal login and a [web experiment](apps/web/README.md).

The [`unoficial-login-again` branch status](docs/unofficial-login-again-status.md)
records the current workspace separation, simulator route audit, and local
screenshot inventory.

## Run locally

Use Node.js 20.19+ on the 20.x line or Node.js 22.12+, with npm.

```sh
npm ci
npm run dev:web
```

Open the local URL printed by Vite. The default is http://localhost:5173.

The [official portal login guide](apps/web/README.md#official-portal-login) describes
the validated flow, local endpoints, session lifecycle, and current limits.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev:web`, `npm run dev`, `npm run web` | Start the Vite development server |
| `npm run build:web`, `npm run build` | Type-check and build the web app |
| `npm run ios`, `npm run android` | Build and run the native app |
| `npm run dev:all` | Start Metro plus Firebase Functions, Firestore and Hosting emulators |
| `npm run dev:functions` | Start the Nest API and Firebase emulators; see [backend setup](apps/functions/README.md) |
| `npm run dev:mobile` | Start Metro for the native development build |
| `npm run login:mobile` (`oauth:mobile` alias) | Start the native portal sign-in and data service |
| `npm run preview` | Serve the production build locally |
| `npm run typecheck` | Check TypeScript across the workspace |
| `npm run lint` | Check formatting and lint rules |
| `npm run lint:fix` | Apply automatic formatting and lint fixes |
| `npm run format` | Format the repository |
