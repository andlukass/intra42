import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("./oauth.mjs", import.meta.url), "utf8").replace(
  /^import .*;\n/gm,
  "",
);
const peer = {
  id: 2,
  login: "other-campus-peer",
  image: { link: "https://cdn.intra.42.fr/users/peer.jpg" },
};

function broker({ sessionStatus = 200, profile = peer, publicStatus = 200 } = {}) {
  const calls = [];
  let handle;
  runInNewContext(source, {
    process: {
      env: {
        INTRA42_CLIENT_ID: "test-client",
        INTRA42_CLIENT_SECRET: "test-secret",
        INTRA42_REDIRECT_URI: "http://localhost:8787/callback",
      },
    },
    console: { log() {} },
    createHash,
    createServer(callback) {
      handle = callback;
      return { listen() {} };
    },
    URL,
    URLSearchParams,
    AbortSignal,
    Buffer,
    fetch: async (input, options) => {
      const url = String(input);
      calls.push({ url, authorization: options.headers?.Authorization });
      if (url.endsWith("/v2/me")) {
        assert.equal(options.headers.Authorization, "Bearer user-session");
        return Response.json({ id: 1 }, { status: sessionStatus });
      }
      if (url.endsWith("/oauth/token")) {
        assert.equal(options.body.get("grant_type"), "client_credentials");
        assert.equal(options.body.get("scope"), "public");
        return Response.json({ access_token: "public-app-grant", expires_in: 7200 });
      }
      assert.equal(options.headers.Authorization, "Bearer public-app-grant");
      if (url === "https://cdn.intra.42.fr/achievement/image/1/badge.svg") {
        return new Response("<svg/>", { headers: { "Content-Type": "image/svg+xml" } });
      }
      if (url.startsWith("https://cdn.intra.42.fr/")) {
        return new Response(new Uint8Array([1, 2, 3]), {
          headers: { "Content-Type": "image/jpeg" },
        });
      }
      assert.match(url, /^https:\/\/api\.intra\.42\.fr\/v2\/users\/2(?:[/?]|$)/);
      return Response.json(url.includes("/locations") ? [] : profile, {
        status: publicStatus,
        headers: publicStatus === 429 ? { "Retry-After": "7" } : {},
      });
    },
  });
  return {
    calls,
    request(url, authorization = "Bearer user-session", method = "GET") {
      return new Promise((resolve) => {
        const result = { headers: {} };
        handle(
          { url, method, headers: { authorization } },
          {
            headersSent: false,
            setHeader(key, value) {
              result.headers[key] = value;
            },
            writeHead(status, headers) {
              this.headersSent = true;
              result.status = status;
              Object.assign(result.headers, headers);
              return this;
            },
            end(raw) {
              resolve({ ...result, body: JSON.parse(raw) });
            },
          },
        );
      });
    },
  };
}

test("requires a valid user session before public reads or downloads", async () => {
  const service = broker({ sessionStatus: 401 });
  assert.equal((await service.request("/profiles/2", "")).status, 401);
  assert.equal(service.calls.length, 0);
  assert.equal((await service.request("/avatar?userId=2")).status, 401);
  assert.equal(service.calls.length, 1);
});

test("reads another campus profile and photo using the public app grant", async () => {
  const service = broker();
  const profile = await service.request("/profiles/2");
  assert.equal(profile.status, 200);
  assert.equal(profile.body.id, 2);
  const photo = await service.request("/avatar?userId=2&size=full");
  assert.equal(photo.status, 200);
  assert.deepEqual(photo.body, { userId: 2, size: "full", uri: "data:image/jpeg;base64,AQID" });
  assert.equal(service.calls.filter(({ url }) => url.endsWith("/v2/me")).length, 1);
  assert.equal(service.calls.filter(({ url }) => url.endsWith("/oauth/token")).length, 1);
});

test("restricts routes, methods, IDs and query parameters", async () => {
  const service = broker();
  for (const url of [
    "/profiles/2/slots",
    "/profiles/2/events",
    "/profiles/0",
    "/profiles/2/anything",
  ]) {
    assert.equal((await service.request(url)).status, 404);
  }
  assert.equal((await service.request("/profiles/2", "Bearer user-session", "POST")).status, 404);
  assert.equal((await service.request("/profiles/2?url=https://example.com")).status, 400);
  assert.equal((await service.request("/avatar?userId=bad")).status, 400);
  assert.equal(service.calls.length, 0);
  assert.equal(
    (await service.request("/profiles/2/locations?page[size]=100&page[number]=2&sort=id")).status,
    200,
  );
  assert.match(service.calls.at(-1).url, /\/locations\?page\[size\]=100&page\[number\]=2&sort=id$/);
});

test("rejects wrong identities and untrusted image origins", async () => {
  assert.equal((await broker({ profile: { ...peer, id: 3 } }).request("/profiles/2")).status, 502);
  assert.equal(
    (await broker({ profile: { ...peer, id: 3 } }).request("/avatar?userId=2")).status,
    502,
  );
  const service = broker({
    profile: { ...peer, image: { link: "https://example.com/users/peer.jpg" } },
  });
  assert.equal((await service.request("/avatar?userId=2")).status, 404);
  assert.ok(service.calls.every(({ url }) => !url.includes("example.com")));
});

test("preserves upstream denial and rate-limit responses", async () => {
  assert.equal((await broker({ publicStatus: 403 }).request("/profiles/2")).status, 403);
  const limited = await broker({ publicStatus: 429 }).request("/profiles/2");
  assert.equal(limited.status, 429);
  assert.equal(limited.headers["Retry-After"], "7");
});

test("serves only official achievement images to a verified user", async () => {
  const service = broker();
  const route = "/achievement-icon?path=/achievement/image/1/badge.svg";
  assert.equal((await service.request(route, "")).status, 401);
  assert.equal(
    (await service.request("/achievement-icon?path=https://example.com/badge.svg")).status,
    400,
  );
  assert.equal(service.calls.length, 0);
  const icon = await service.request(route);
  assert.equal(icon.status, 200);
  assert.equal(
    icon.body.uri,
    `data:image/svg+xml;base64,${Buffer.from("<svg/>").toString("base64")}`,
  );
  assert.deepEqual(service.calls.at(-1), {
    url: "https://cdn.intra.42.fr/achievement/image/1/badge.svg",
    authorization: "Bearer public-app-grant",
  });
});
