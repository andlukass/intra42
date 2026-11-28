import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { isLocalPost } from "./http.ts";

const source = stripTypeScriptTypes(readFileSync(new URL("./login.ts", import.meta.url), "utf8"))
  .replace(/^import [\s\S]*?;\n/gm, "")
  .replaceAll("export ", "");

function fixture({
  officialError,
  destination = "https://auth.42.fr/login",
  storageGrant = true,
  observedGrant = true,
  renewal = true,
  observedDelay = 0,
} = {}) {
  const fields = {};
  const retained = [];
  const forgotten = [];
  let closed = 0;
  let launched = 0;
  const api = {};
  function page() {
    let url = destination;
    const locator = (selector) => ({
      count: async () => 1,
      check: async () => {
        fields[selector] = true;
      },
      waitFor: () =>
        selector === 'input[name="username"]' || officialError
          ? Promise.resolve()
          : new Promise(() => {}),
      fill: async (value) => {
        fields[selector] = value;
      },
      async click() {
        if (!officialError) url = "https://profile-v3.intra.42.fr/";
      },
      filter() {
        return this;
      },
      first() {
        return this;
      },
      innerText: async () => officialError,
    });
    return {
      setDefaultTimeout() {},
      goto: async () => {},
      url: () => url,
      locator,
      waitForURL: () => (officialError ? new Promise(() => {}) : Promise.resolve()),
      waitForResponse: () => Promise.reject(new Error("No optional data")),
      waitForFunction: async (readToken) => ({
        jsonValue: async () =>
          runInNewContext(`(${readToken.toString()})()`, {
            location: { origin: "https://profile-v3.intra.42.fr" },
            sessionStorage: {
              length: 1,
              key: () => "oidc.user:https://auth.42.fr/auth/realms/students-42:profile",
              getItem: () =>
                JSON.stringify({
                  access_token: "portal-token",
                  expires_at: Date.now() / 1000 + 300,
                  refresh_token: storageGrant ? "stored-secret-refresh-token" : undefined,
                }),
            },
          }),
      }),
      close: async () => {},
    };
  }
  runInNewContext(`${source}\napi.createLoginHandler = createLoginHandler;`, {
    api,
    readSessionRecords: () => [],
    writeSessionRecords() {},
    isLocalPost,
    URL,
    URLSearchParams,
    setTimeout,
    clearTimeout,
    AbortController,
    delay: () => new Promise(() => {}),
    watchPortalAvatar: () => async () => undefined,
    observeRefreshGrant: async () => {
      if (observedDelay) await new Promise((resolve) => setTimeout(resolve, observedDelay));
      return observedGrant ? { refreshToken: "secret-refresh-token" } : null;
    },
    storedRefreshGrant: (_key, token) => (token ? { refreshToken: token } : null),
    refreshSession: async () =>
      renewal ? { access_token: "renewed-token", expires_in: 300 } : null,
    forget: async (key) => {
      forgotten.push(key);
    },
    retainRefreshGrant(grant) {
      retained.push(grant);
      return { key: "local-refresh-key", expiresIn: 300 };
    },
    retainSlotSession(...args) {
      retained.push(args);
    },
    chromium: {
      async launch() {
        launched++;
        return {
          async newContext() {
            return { newPage: async () => page(), cookies: async () => [] };
          },
          async close() {
            closed++;
          },
        };
      },
    },
  });
  const handler = api.createLoginHandler();
  return {
    fields,
    retained,
    forgotten,
    get closed() {
      return closed;
    },
    get launched() {
      return launched;
    },
    async request(body, headers = { origin: "http://localhost:5173", host: "localhost:5173" }) {
      const result = { headers: {} };
      const req = {
        method: "POST",
        headers,
        socket: { remoteAddress: "127.0.0.1" },
        complete: true,
        async *[Symbol.asyncIterator]() {
          yield body;
        },
      };
      const res = {
        statusCode: 200,
        writableEnded: false,
        setHeader(key, value) {
          result.headers[key] = value;
        },
        end(raw) {
          this.writableEnded = true;
          result.status = this.statusCode;
          result.body = JSON.parse(raw);
        },
      };
      await handler(req, res);
      return result;
    },
  };
}

test("shared portal login submits credentials only at the official auth host and closes Chrome", async () => {
  const login = fixture();
  const response = await login.request("username=test-user&password=test-password&rememberMe=on");
  assert.equal(response.status, 200);
  assert.equal(response.body.access_token, "renewed-token");
  assert.equal(response.body.refresh_session, "local-refresh-key");
  assert.equal(response.headers["Cache-Control"], "no-store");
  assert.equal(login.fields['input[name="username"]'], "test-user");
  assert.equal(login.fields['input[name="password"]'], "test-password");
  assert.equal(login.fields['input[name="rememberMe"]'], true);
  assert.ok(!JSON.stringify(response.body).includes("test-password"));
  assert.ok(!JSON.stringify(response.body).includes("secret-refresh-token"));
  assert.ok(!JSON.stringify(response.body).includes("storage_key"));
  assert.equal(login.closed, 1);
  assert.equal(login.retained.length, 2);
});

test("uses the persisted OIDC refresh token when the network observer misses the response", async () => {
  const login = fixture({ observedGrant: false });
  assert.equal((await login.request("username=student&password=test")).status, 200);
  assert.equal(login.retained[0].refreshToken, "stored-secret-refresh-token");
});

test("falls back to the observed grant and refuses successful logins without renewable credentials", async () => {
  const fallback = fixture({ storageGrant: false });
  assert.equal((await fallback.request("username=student&password=test")).status, 200);
  assert.equal(fallback.retained[0].refreshToken, "secret-refresh-token");
  const missing = fixture({ storageGrant: false, observedGrant: false });
  assert.equal((await missing.request("username=student&password=test")).status, 502);
  assert.equal(missing.retained.length, 0);
});

test("discards a captured grant if 42 rejects its initial renewal", async () => {
  const login = fixture({ renewal: false });
  for (let attempt = 0; attempt < 2; attempt++) {
    assert.equal((await login.request("username=student&password=test")).status, 502);
  }
  assert.deepEqual(login.forgotten, ["local-refresh-key", "local-refresh-key"]);
  assert.equal(login.closed, 2);
});

test("waits for refresh capture even when it arrives after the former 1.5-second cutoff", async () => {
  const login = fixture({ storageGrant: false, observedDelay: 1700 });
  const response = await login.request("username=student&password=test");
  assert.equal(response.status, 200);
  assert.equal(response.body.refresh_session, "local-refresh-key");
});

test("rejects missing credentials and browser requests from another origin before launching Chrome", async () => {
  const login = fixture();
  assert.equal((await login.request("username=student")).status, 400);
  assert.equal(
    (
      await login.request("username=student&password=test", {
        origin: "http://evil.example",
        host: "localhost:5173",
      })
    ).status,
    403,
  );
  assert.equal((await login.request("x".repeat(8193))).status, 413);
  assert.equal(login.launched, 0);
});

test("never fills credentials at an unexpected destination", async () => {
  for (const destination of ["https://evil.example/login", "http://auth.42.fr/login"]) {
    const login = fixture({ destination });
    assert.equal((await login.request("username=student&password=test")).status, 502);
    assert.deepEqual(login.fields, {});
    assert.equal(login.closed, 1);
  }
});

test("returns official credential errors without echoing the password and releases the login lock", async () => {
  const login = fixture({ officialError: "Password test-password was rejected." });
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await login.request("username=student&password=test-password");
    assert.equal(response.status, 401);
    assert.ok(!response.body.error.includes("test-password"));
  }
  assert.equal(login.closed, 2);
  assert.equal(login.retained.length, 0);
});
