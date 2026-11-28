import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { validToken } from "./session-token.ts";

const source = stripTypeScriptTypes(
  readFileSync(new URL("./session-browser.ts", import.meta.url), "utf8"),
)
  .replace(/^import .*;\n/gm, "")
  .replaceAll("export ", "");

function fixture({ result = "success", callback, exchangeFails = false } = {}) {
  const calls = [];
  const transaction = "a".repeat(64);
  const code = "b".repeat(64);
  const token = { accessToken: `portal_${"c".repeat(64)}`, expiresAt: Date.now() + 300_000 };
  let started;
  let random = 0;
  const api = {};
  runInNewContext(`${source}\napi.browserSignIn = browserSignIn;`, {
    api,
    validToken,
    URL,
    URLSearchParams,
    Crypto: {
      getRandomBytesAsync: async () => new Uint8Array(32).fill(++random),
      CryptoDigestAlgorithm: { SHA256: "SHA256" },
      digestStringAsync: async (_, text) => createHash("sha256").update(text).digest("hex"),
    },
    WebBrowser: {
      async openAuthSessionAsync(url, redirect) {
        assert.equal(url, `https://login.example/sign-in?transaction=${transaction}`);
        assert.equal(redirect, "intra42://oauth");
        if (result !== "success") return { type: result };
        return {
          type: "success",
          url: callback
            ? callback(started)
            : `intra42://oauth?state=${started.get("state")}&code=${code}`,
        };
      },
    },
    async requestSession(broker, path, auth, body) {
      assert.equal(broker, "https://login.example");
      assert.equal(auth, undefined);
      calls.push({ path, body });
      if (path === "start") {
        started = body;
        return { path: `/sign-in?transaction=${transaction}` };
      }
      assert.equal(body.get("transaction"), transaction);
      assert.equal(body.get("state"), started.get("state"));
      assert.equal(
        createHash("sha256").update(body.get("verifier")).digest("hex"),
        started.get("challenge"),
      );
      if (path === "exchange") {
        assert.equal(body.get("code"), code);
        if (exchangeFails) throw new Error("Exchange failed.");
        return token;
      }
      assert.equal(path, "cancel");
      return { cancelled: true };
    },
  });
  return { ...api, calls, token };
}

test("the native browser flow exchanges the one-use code with its private verifier", async () => {
  const client = fixture();
  assert.deepEqual(await client.browserSignIn("https://login.example"), client.token);
  assert.deepEqual(
    client.calls.map(({ path }) => path),
    ["start", "exchange"],
  );
});

test("closing the browser or using Cancel cleans up the transaction without signing in", async () => {
  for (const options of [
    { result: "cancel" },
    { callback: (started) => `intra42://oauth?state=${started.get("state")}&error=cancelled` },
  ]) {
    const client = fixture(options);
    assert.equal(await client.browserSignIn("https://login.example"), null);
    assert.deepEqual(
      client.calls.map(({ path }) => path),
      ["start", "cancel"],
    );
  }
});

test("rejects foreign callbacks, wrong states and missing codes and cleans up failed exchanges", async () => {
  for (const callback of [
    () => `intra42://oauth?state=wrong&code=${"b".repeat(64)}`,
    (started) => `https://evil.example?state=${started.get("state")}&code=${"b".repeat(64)}`,
    (started) => `intra42://oauth/other?state=${started.get("state")}&code=${"b".repeat(64)}`,
    (started) => `intra42://oauth?state=${started.get("state")}`,
  ]) {
    const client = fixture({ callback });
    await assert.rejects(client.browserSignIn("https://login.example"), /callback was invalid/);
    assert.deepEqual(
      client.calls.map(({ path }) => path),
      ["start", "cancel"],
    );
  }
  const client = fixture({ exchangeFails: true });
  await assert.rejects(client.browserSignIn("https://login.example"), /Exchange failed/);
  assert.equal(client.calls.at(-1).path, "cancel");
});
