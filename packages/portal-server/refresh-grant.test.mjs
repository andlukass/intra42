import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = stripTypeScriptTypes(readFileSync(new URL("./refresh.ts", import.meta.url), "utf8"))
  .replace(/^import .*;\n/gm, "")
  .replaceAll("export ", "");
const api = {};
runInNewContext(`${source}\napi.storedRefreshGrant = storedRefreshGrant;`, {
  api,
  URL,
  readSessionRecords: () => [],
});

test("reads OIDC storage keys for the official realm and keeps the refresh token server-side", () => {
  for (const authority of [
    "https://auth.42.fr/auth/realms/students-42",
    "https://auth.42.fr/realms/students-42/",
  ]) {
    const grant = api.storedRefreshGrant(`oidc.user:${authority}:profile`, "test-refresh");
    assert.equal(grant.endpoint, `${authority.replace(/\/$/, "")}/protocol/openid-connect/token`);
    assert.equal(grant.clientId, "profile");
    assert.equal(grant.refreshToken, "test-refresh");
  }
});

test("refuses missing tokens and keys that could send the refresh token to another destination", () => {
  for (const key of [
    "other:https://auth.42.fr/realms/students-42:profile",
    "oidc.user:https://evil.example/realms/students-42:profile",
    "oidc.user:http://auth.42.fr/realms/students-42:profile",
    "oidc.user:https://user@auth.42.fr/realms/students-42:profile",
    "oidc.user:https://auth.42.fr/realms/students-42?target=evil:profile",
    "oidc.user:https://auth.42.fr/realms/students-42#fragment:profile",
    "oidc.user:https://auth.42.fr/unexpected:profile",
    "oidc.user:https://auth.42.fr/realms/students-42:",
  ])
    assert.equal(api.storedRefreshGrant(key, "test-refresh"), null);
  for (const token of [undefined, null, "", 42])
    assert.equal(
      api.storedRefreshGrant("oidc.user:https://auth.42.fr/realms/students-42:profile", token),
      null,
    );
});
