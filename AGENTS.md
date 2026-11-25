# Repository instructions

- Keep code changes on the local branch. Push or open a pull request only when explicitly requested.
- Discuss proposed changes when asked for an opinion or an approach. Edit files once implementation is requested.
- Read [the web README](apps/web/README.md) before editing the app. Update it when the behavior or commands it describes change.
- Keep web-specific code in `apps/web`. Introduce shared code when a second workspace needs it.
- Install dependencies from the repository root and keep the root `package-lock.json` in sync.
- Use English for code, UI text, and repository documentation.
- Run `npm run lint` and `npm run typecheck` from the root before finishing a code change. Run `npm run build:web` when changing the web app or its build configuration.
