import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { signInAssets } from "./sign-in-assets.ts";
import { signInPage, signInScript } from "./sign-in-page.ts";

const source = stripTypeScriptTypes(
  readFileSync(new URL("./browser-login.ts", import.meta.url), "utf8"),
)
  .replace(/^import .*;\n/gm, "")
  .replaceAll("export ", "");
const state = "a".repeat(64);
const verifier = "b".repeat(64);
const challenge = createHash("sha256").update(verifier).digest("hex");

function fixture() {
  let now = Date.now();
  const discarded = [];
  const created = [];
  const control = {};
  const api = {};
  runInNewContext(`${source}\napi.createBrowserLogin = createBrowserLogin;`, {
    api,
    createHash,
    randomBytes,
    URL,
    URLSearchParams,
    signInPage,
    signInScript,
    signInAssets,
    Date: class extends Date {
      static now() {
        return now;
      }
    },
    setTimeout: () => ({
      unref() {
        return this;
      },
    }),
    clearTimeout() {},
    json(res, status, body) {
      res.writeHead(status, { "Cache-Control": "no-store" });
      res.end(JSON.stringify(body));
    },
    createLoginHandler(allowed, complete) {
      return async (req, res) => {
        assert.ok(allowed(req));
        if (control.wait) await control.wait;
        if (control.failure) {
          res.writeHead(401, {});
          res.end(JSON.stringify({ error: "Invalid credentials." }));
          return;
        }
        try {
          const result = await complete(
            { access_token: "upstream-secret", expires_in: 300 },
            new AbortController().signal,
          );
          res.writeHead(200, {});
          res.end(JSON.stringify(result));
        } catch {
          res.writeHead(502, {});
          res.end(JSON.stringify({ error: "Cancelled." }));
        }
      };
    },
  });
  const handle = api.createBrowserLogin(
    (req) =>
      !req.headers.origin &&
      !req.headers["sec-fetch-site"] &&
      req.socket.remoteAddress === "127.0.0.1",
    async () => {
      const token = { accessToken: `portal_${"c".repeat(64)}`, expiresAt: now + 300_000 };
      created.push(token);
      return token;
    },
    (key) => discarded.push(key),
  );
  return {
    discarded,
    created,
    control,
    advance(ms) {
      now += ms;
    },
    async request(path, { method = "POST", body = {}, headers = {}, remote = "127.0.0.1" } = {}) {
      const response = { status: 200, headers: {} };
      const req = {
        url: path,
        method,
        headers: {
          host: "login.example",
          "content-type": "application/x-www-form-urlencoded",
          ...headers,
        },
        socket: { remoteAddress: remote },
        async *[Symbol.asyncIterator]() {
          yield typeof body === "string" ? body : new URLSearchParams(body).toString();
        },
      };
      const res = {
        setHeader(key, value) {
          response.headers[key] = value;
        },
        writeHead(status, values) {
          response.status = status;
          Object.assign(response.headers, values);
          return this;
        },
        end(raw) {
          response.raw = raw;
          try {
            response.body = JSON.parse(raw);
          } catch {}
        },
      };
      response.handled = await handle(req, res, new URL(path, "https://login.example"));
      return response;
    },
    async start(transactionState = state) {
      const response = await this.request("/session/start", {
        body: { state: transactionState, challenge },
      });
      assert.equal(response.status, 200);
      const path = response.body.path;
      const page = await this.request(path, { method: "GET" });
      assert.equal(page.status, 200);
      const csrf = page.raw.match(/data-csrf="([a-f0-9]+)"/)[1];
      return {
        path,
        csrf,
        id: new URL(path, "https://login.example").searchParams.get("transaction"),
        page,
      };
    },
    browser(transaction, options = {}) {
      return this.request(transaction.path, {
        ...options,
        headers: {
          origin: "https://login.example",
          "x-intra42-csrf": transaction.csrf,
          ...options.headers,
        },
      });
    },
    async complete() {
      const transaction = await this.start();
      const result = await this.browser(transaction);
      assert.equal(result.status, 200);
      const callback = new URL(result.body.redirect);
      return { ...transaction, code: callback.searchParams.get("code"), callback };
    },
    exchange(transaction, extra = {}) {
      return this.request("/session/exchange", {
        body: { transaction: transaction.id, state, verifier, code: transaction.code, ...extra },
      });
    },
  };
}

test("browser sign-in returns a one-use code and requires the app's verifier to release the session", async () => {
  const server = fixture();
  const transaction = await server.complete();
  assert.equal(transaction.callback.protocol, "intra42:");
  assert.equal(transaction.callback.hostname, "oauth");
  assert.equal(transaction.callback.searchParams.get("state"), state);
  assert.ok(!transaction.callback.href.includes("portal_"));
  assert.ok(!transaction.callback.href.includes("upstream-secret"));
  assert.equal((await server.exchange(transaction, { verifier: "d".repeat(64) })).status, 400);
  assert.equal((await server.exchange(transaction, { state: "d".repeat(64) })).status, 400);
  assert.equal((await server.exchange(transaction, { code: "d".repeat(64) })).status, 400);
  const response = await server.exchange(transaction);
  assert.equal(response.status, 200);
  assert.equal(response.body.accessToken, server.created[0].accessToken);
  assert.equal((await server.exchange(transaction)).status, 400);
  assert.equal((await server.request(transaction.path, { method: "GET" })).status, 400);
  assert.deepEqual(server.discarded, []);
});

test("protects the browser form with Origin, CSRF, no-store, no-referrer, and a restrictive CSP", async () => {
  const server = fixture();
  const transaction = await server.start();
  assert.match(transaction.page.raw, /autocomplete="username"/);
  assert.match(transaction.page.raw, /name="rememberMe"/);
  assert.match(transaction.page.raw, /method="post"/);
  assert.match(transaction.page.raw, /id="logo"/);
  assert.match(transaction.page.raw, /autocomplete="current-password"/);
  assert.equal(transaction.page.headers["Cache-Control"], "no-store");
  assert.equal(transaction.page.headers["Referrer-Policy"], "no-referrer");
  assert.match(transaction.page.headers["Content-Security-Policy"], /frame-ancestors 'none'/);
  for (const headers of [
    { origin: "https://evil.example" },
    { "x-intra42-csrf": "wrong" },
    { origin: "null" },
    { origin: "http://login.example" },
    { origin: "" },
  ])
    assert.equal((await server.browser(transaction, { headers })).status, 403);
  assert.equal((await server.browser(transaction, { remote: "192.0.2.1" })).status, 403);
  assert.equal(server.created.length, 0);
  const script = await server.request("/sign-in.js", { method: "GET" });
  assert.equal(script.status, 200);
  assert.match(script.raw, /textContent = reason/);
  for (const [path, asset] of Object.entries(signInAssets)) {
    const image = await server.request(path, { method: "GET" });
    assert.equal(image.status, 200);
    assert.equal(image.headers["Content-Type"], asset.type);
    assert.deepEqual(image.raw, asset.body);
  }
  assert.equal(
    (await server.request("/sign-in-assets/unknown.jpg", { method: "GET" })).handled,
    false,
  );
});

test("native transaction endpoints reject browser requests, invalid payloads, and duplicate states", async () => {
  const server = fixture();
  assert.equal(
    (await server.request("/session/start", { headers: { origin: "https://login.example" } }))
      .status,
    403,
  );
  assert.equal((await server.request("/session/start", { method: "GET" })).status, 403);
  assert.equal(
    (await server.request("/session/start", { body: { state: "bad", challenge } })).status,
    400,
  );
  assert.equal(
    (await server.request("/session/start", { headers: { "content-type": "application/json" } }))
      .status,
    415,
  );
  assert.equal((await server.request("/session/start", { body: "x".repeat(8193) })).status, 413);
  await server.start();
  assert.equal(
    (await server.request("/session/start", { body: { state, challenge } })).status,
    429,
  );
});

test("cancelling or expiring an unclaimed code releases its session", async () => {
  const server = fixture();
  const transaction = await server.complete();
  assert.equal(
    (
      await server.request("/session/cancel", {
        body: { transaction: transaction.id, state, verifier },
      })
    ).status,
    200,
  );
  assert.deepEqual(server.discarded, [server.created[0].accessToken]);
  assert.equal((await server.exchange(transaction)).status, 400);
  const expired = await server.complete();
  server.advance(60_001);
  assert.equal((await server.exchange(expired)).status, 400);
  assert.equal(server.discarded.length, 2);
  const pending = await server.start();
  server.advance(600_001);
  assert.equal((await server.request(pending.path, { method: "GET" })).status, 400);
});

test("browser cancellation returns to the app and rejects any late login completion", async () => {
  const server = fixture();
  const transaction = await server.start();
  let release;
  server.control.wait = new Promise((resolve) => {
    release = resolve;
  });
  const signingIn = server.browser(transaction);
  const second = await server.start("e".repeat(64));
  assert.equal((await server.browser(second)).status, 429);
  const cancelled = await server.browser({
    ...transaction,
    path: `${transaction.path}&action=cancel`,
  });
  assert.equal(new URL(cancelled.body.redirect).searchParams.get("error"), "cancelled");
  release();
  assert.equal((await signingIn).status, 502);
  assert.equal(server.discarded.length, 1);
});

test("credential errors leave the transaction available for another attempt", async () => {
  const server = fixture();
  const transaction = await server.start();
  server.control.failure = true;
  assert.equal((await server.browser(transaction)).status, 401);
  server.control.failure = false;
  assert.equal((await server.browser(transaction)).status, 200);
});
