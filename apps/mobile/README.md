# Intra42 mobile

The native app uses Expo Router and TanStack Query. On iOS it uses native system tabs. Android uses a standard React Navigation tab bar. Both show Home, Slots, and Config, with the signed-in user's avatar on Config.

## Run from the repository root

```sh
npm ci
npm run ios -- --device "iPhone 17"
npm run android
```

Use `npm run dev:mobile` to restart Metro for an existing development build. Set `EXPO_PUBLIC_INTRA42_DEMO=1` when starting Metro to test with simulated profile, events and slot data in a development build. Demo slot changes stay in memory.

## Sign in with the official 42 API

1. Register a 42 OAuth application with the `public` and `projects` scopes. Register the exact HTTPS callback URL ending in `/callback`.
2. Configure the OAuth service using the variables from [.env.example](.env.example). Set the server-side credentials in its environment and start it with `npm run oauth:mobile`. Run it behind an HTTPS reverse proxy forwarding the OAuth routes to its loopback port (8787 by default). Keep the server credentials on the host running the service.
3. Set `EXPO_PUBLIC_INTRA42_OAUTH_URL` to the HTTPS service origin in the Expo environment, restart Metro, and use **Sign in with 42**.

The app opens the official OAuth consent page in a system browser. The broker keeps the authorization code server-side and exchanges it after the app proves ownership of the transaction. The app keeps the resulting tokens in SecureStore and clears them on logout.

Home uses the official API for profile, campus agenda, evaluations, recent machine sessions, achievements, and ongoing projects. Slots shows the user's weekly availability and supports creating a slot with editable start and end. The 42 API enforces campus limits and may reject slot creation if the user or application lacks permission. Portal-only widgets and actions remain in the web experiment. The mobile agenda lists campus events, and Logtime shows recent sessions.
