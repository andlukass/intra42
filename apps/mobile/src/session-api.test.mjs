import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = stripTypeScriptTypes(
  readFileSync(new URL("./session-api.ts", import.meta.url), "utf8"),
).replaceAll("export ", "");

function fixture(status = 200) {
  const calls = [];
  const timers = new Set();
  const api = {};
  runInNewContext(`${source}\nObject.assign(api, { requestSession, SessionError });`, {
    api,
    AbortController,
    setTimeout(callback, milliseconds) {
      const timer = { callback, milliseconds };
      timers.add(timer);
      return timer;
    },
    clearTimeout(timer) {
      timers.delete(timer);
    },
    async fetch(url, options) {
      assert.equal(timers.size, 1);
      assert.equal(options.signal.aborted, false);
      calls.push({ url, ...options });
      return Response.json(status === 200 ? { signedOut: true } : { error: "Session expired." }, {
        status,
      });
    },
  });
  return { ...api, calls, timers };
}

test("native session requests work without AbortSignal.timeout and clear request timers", async () => {
  const client = fixture();
  const credentials = new URLSearchParams({ username: "student", password: "a+b& c" });
  await client.requestSession("https://login.example", "login", undefined, credentials);
  assert.equal(client.calls[0].body, "username=student&password=a%2Bb%26+c");
  assert.equal(client.calls[0].method, "POST");
  assert.equal(client.calls[0].headers.Origin, undefined);
  await client.requestSession("https://login.example", "logout", "portal_key");
  assert.equal(client.calls[1].headers.Authorization, "Bearer portal_key");
  assert.equal(client.timers.size, 0);
});

test("native session errors retain their HTTP status and leave no timer behind", async () => {
  const client = fixture(401);
  await assert.rejects(
    client.requestSession("https://login.example", "refresh", "portal_key"),
    (error) => error instanceof client.SessionError && error.status === 401,
  );
  assert.equal(client.timers.size, 0);
  await assert.rejects(client.requestSession(undefined, "login"), /Configure the HTTPS/);
});
