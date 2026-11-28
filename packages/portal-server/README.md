# Portal server

Shared Chrome authentication, refresh grants, scoped calendar sessions, and
session persistence for the native service.

## Replacing session persistence

`session-store.ts` is the only provider selection point. Authentication modules
import its provider-independent read/write functions. They do not import the
file adapter or use filesystem APIs.

- `session-storage.ts` defines `SessionPersistence` and creates the session store.
  Providers implement asynchronous `load()` and `save(snapshot)` methods and a
  non-secret `description` for startup logging.
- `session-file.ts` implements that contract using the private temporary JSON
  file, including permissions, schema validation, atomic writes, and error handling.
- `session-store.ts` constructs the chosen provider and exports the configured store.

To use Firebase later, implement `SessionPersistence` in a Firebase adapter and
replace the provider construction in `session-store.ts`. Login, token rotation,
logout, and cookie handling require no provider-specific changes. The asynchronous
contract already lets those operations wait for durable storage before returning
success. The Firebase adapter owns its SDK configuration, serialization, and
remote error handling.

The store loads before the server starts accepting requests, serializes writes
across session collections, and publishes a new snapshot only after saving it.
A failed save rejects its caller while preserving the last committed snapshot;
later saves can retry. Session expiry and validation remain in the authentication
modules rather than the provider.

This is a single-process session store. Switching its persistence provider alone
does not add coordination or live invalidation between server replicas.

## Tests

From the repository root:

```sh
node --experimental-strip-types --test packages/portal-server/*.test.mjs
```

The provider contract tests use delayed and failing asynchronous storage. The
file regression tests exercise real process restarts, renewal, logout, expiry,
corrupt files, and private permissions using synthetic credentials.

## Official project catalog

`readPortalProjectList` reuses the connected account's calendar request context to
read the fixed `projects.intra.42.fr/projects/list` page. `projects.ts` parses its
project rows, preserving personalized recommendations, registration state,
results, estimated duration and XP. Search, course, sorting and pagination are
forwarded through the native broker's validated `GET /api/me/project-list` route.
Authentication pages and malformed project destinations fail explicitly.
