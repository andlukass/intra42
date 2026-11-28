import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { load } from "cheerio";

const source = stripTypeScriptTypes(
  readFileSync(new URL("./http-login.ts", import.meta.url), "utf8"),
)
  .replace(/^import .*;\n/gm, "")
  .replaceAll("export ", "");
function fixture({ badState = false, badAction = false, badTokens = false } = {}) {
  const issuer = "https://auth.42.fr/auth/realms/students-42";
  let state,
    challenge,
    disposed = false;
  const calls = [];
  const response = (body, url = "https://auth.42.fr/auth", headers = {}) => ({
    json: async () => body,
    text: async () => body,
    url: () => url,
    ok: () => true,
    headers: () => headers,
  });
  const context = {
    get: async (url) => {
      calls.push(url);
      if (url.includes("openid-configuration"))
        return response({
          authorization_endpoint: `${issuer}/protocol/openid-connect/auth`,
          token_endpoint: `${issuer}/protocol/openid-connect/token`,
        });
      if (url.includes("/slots")) return response("slots", url);
      const parsed = new URL(url);
      state = parsed.searchParams.get("state");
      challenge = parsed.searchParams.get("code_challenge");
      return response(
        `<form id="kc-form-login" action="${badAction ? "https://example.com" : "https://auth.42.fr"}/authenticate"><input type="hidden" name="session_code" value="temporary"></form>`,
      );
    },
    post: async (url, { form }) => {
      calls.push(url);
      if (url.endsWith("/authenticate")) {
        assert.equal(form.username, "test-user");
        assert.equal(form.password, "test-password");
        assert.equal(form.session_code, "temporary");
        return response("", url, {
          location: `https://profile-v3.intra.42.fr?code=code&state=${badState ? "wrong" : state}`,
        });
      }
      assert.equal(createHash("sha256").update(form.code_verifier).digest("base64url"), challenge);
      return response(
        badTokens
          ? {}
          : { access_token: "access", refresh_token: "refresh", refresh_expires_in: 300 },
      );
    },
    storageState: async () => ({ cookies: [{ name: "session", value: "cookie" }] }),
    dispose: async () => {
      disposed = true;
    },
  };
  const api = {};
  runInNewContext(`${source}\napi.login=httpSignIn;`, {
    api,
    load,
    randomBytes,
    createHash,
    URL,
    URLSearchParams,
    request: { newContext: async () => context },
  });
  return { login: () => api.login("test-user", "test-password"), calls, disposed: () => disposed };
}
test("HTTP login exchanges a state-bound PKCE code and establishes legacy SSO cookies", async () => {
  const f = fixture();
  const result = await f.login();
  assert.equal(result.grant.refreshToken, "refresh");
  assert.equal(result.cookies.length, 1);
  assert.ok(f.calls.some((url) => url.endsWith("/slots")));
  assert.ok(f.disposed());
});
for (const [option, message] of [
  ["badState", "State mismatch"],
  ["badAction", "No supported login form"],
  ["badTokens", "Token exchange failed"],
])
  test(`HTTP login rejects ${option} and disposes credentials context`, async () => {
    const f = fixture({ [option]: true });
    await assert.rejects(f.login(), new RegExp(message));
    assert.ok(f.disposed());
    if (option !== "badTokens") assert.ok(!f.calls.some((url) => url.endsWith("/token")));
  });
