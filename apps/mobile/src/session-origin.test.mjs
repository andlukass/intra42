import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("./session.tsx", import.meta.url), "utf8");
const helper = stripTypeScriptTypes(
  source.slice(source.indexOf("function serviceOrigin"), source.indexOf("export const broker")),
);
test("service URL preserves HTTPS proxy prefixes and rejects credentials or ambiguous URLs", () => {
  const api = {};
  runInNewContext(`${helper}\napi.origin = serviceOrigin;`, { api, URL, __DEV__: true });
  assert.equal(api.origin("https://login.example/intra42/"), "https://login.example/intra42");
  assert.equal(api.origin("https://login.example/"), "https://login.example");
  assert.equal(api.origin("http://localhost:3000/"), "http://localhost:3000");
  for (const invalid of [
    "http://remote.example",
    "https://user:password@login.example",
    "https://login.example/?token=secret",
    "https://login.example/#fragment",
  ])
    assert.equal(api.origin(invalid), undefined);
});
test("login resources remain under a reverse proxy prefix", () => {
  const pageSource = readFileSync(new URL("../server/sign-in-page.ts", import.meta.url), "utf8");
  const pageApi = {};
  runInNewContext(
    stripTypeScriptTypes(pageSource).replaceAll("export ", "") +
      "\napi.page=signInPage;api.script=signInScript;",
    { api: pageApi },
  );
  const page = pageApi.page("a".repeat(64), "b".repeat(64));
  for (const reference of [
    ...page.matchAll(/(?:src|action)="([^"]+)"/g),
    ...page.matchAll(/url\('([^']+)'\)/g),
  ]) {
    assert.ok(
      new URL(reference[1], "https://login.example/intra42/sign-in").pathname.startsWith(
        "/intra42/",
      ),
    );
  }
  assert.match(pageApi.script, /fetch\('sign-in\?/);
});
