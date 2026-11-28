import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = ["../src/events.ts", "./events.ts", "./portal.ts"]
  .map((file) =>
    stripTypeScriptTypes(readFileSync(new URL(file, import.meta.url), "utf8"))
      .replace(/^import [\s\S]*?;\n/gm, "")
      .replaceAll("export ", ""),
  )
  .join("\n");

function service({ renewable = true, identity = 42 } = {}) {
  let now = Date.now();
  const calls = [];
  const released = [];
  const state = {
    refresh: { access_token: "renewed-portal-token", expires_in: 300 },
    status: 200,
    searchStatus: 200,
    searchUsers: [{ login: "llopes-d", cdn_uri: "https://cdn.intra.42.fr/users/photo.jpg" }],
    searchProjects: [
      {
        id: 1314,
        name: "Libft",
        slug: "42cursus-libft",
        url: "https://projects.intra.42.fr/42cursus-libft/mine",
      },
    ],
    eventStatus: 200,
    events: [
      {
        id: 32819,
        name: "Student Exam",
        kind: "exam",
        begin_at: new Date(now + 5 * 86_400_000).toISOString(),
        end_at: new Date(now + 5 * 86_400_000 + 10_800_000).toISOString(),
        nbr_subscribers: 7,
        max_subscribers: 40,
        is_subscribed: false,
        waitlist_id: 26437,
        events_user_id: null,
        users_waitlist_id: null,
      },
    ],
    titleStatus: 200,
    titles: [
      { title_id: 11, title_user_id: 101, name: "Mastermind %login", selected: true },
      { title_id: 12, title_user_id: 102, name: "%login the Explorer", selected: false },
    ],
  };
  const api = {};
  runInNewContext(`${source}\nObject.assign(api, { handlePortal, portalIdentity });`, {
    process: { env: {} },
    api,
    onSessionReload: (callback) => callback(),
    readSessionRecords: () => [],
    writeSessionRecords() {},
    randomBytes,
    URL,
    URLSearchParams,
    AbortSignal,
    Date: class extends Date {
      static now() {
        return now;
      }
    },
    createBrowserLogin: () => async () => false,
    createLoginHandler(allowed, complete) {
      return async (req, res) => {
        assert.ok(allowed(req));
        const result = await complete(
          {
            access_token: "private-portal-token",
            expires_in: 300,
            refresh_session: renewable ? "private-refresh-key" : undefined,
          },
          new AbortController().signal,
        );
        res.writeHead(200, {});
        res.end(JSON.stringify(result));
      };
    },
    json(res, status, body) {
      res.writeHead(status, { "Cache-Control": "no-store" });
      res.end(JSON.stringify(body));
    },
    forget: (key) => released.push(key),
    revokeSlotSession: (key) => released.push(key),
    async refreshSession(key) {
      assert.equal(key, "private-refresh-key");
      if (state.refresh instanceof Error) throw state.refresh;
      return state.refresh;
    },
    async readPortalClusterMaps(key, campusId) {
      calls.push({ metaCampusId: campusId, sessionKey: key });
      return [];
    },
    async finishPortalProject(key, slug, teamId) {
      calls.push({ finishProject: slug, teamId, sessionKey: key });
      return { finished: true };
    },
    async unregisterPortalProject(key, slug) {
      calls.push({ unregisterProject: slug, sessionKey: key });
      return { unregistered: true };
    },
    async readPortalAttachment(_key, source) {
      calls.push({ attachmentSource: source });
      return { body: Buffer.from("%PDF-test-file"), contentType: "application/pdf" };
    },
    async readPortalProjectStudents(key, slug, kind, page) {
      calls.push({ projectStudents: { slug, kind, page }, sessionKey: key });
      return { users: [{ login: "student-a", available: false }], total: 1, page, hasMore: false };
    },
    async readPortalProjectDetails(key, slug, personal, enrollmentId) {
      calls.push({ personal, enrollmentId, projectSlug: slug, sessionKey: key });
      return { name: "Ftl_quantum", statistics: { success: { true: 45, false: 22, none: 198 } } };
    },
    async readPortalProjectList(key, params) {
      assert.equal(key, "private-refresh-key");
      calls.push({ projectList: params.toString() });
      return {
        items: [{ id: "libft", slug: "libft", name: "Libft", recommendation: "Forbidden" }],
        hasMore: false,
      };
    },
    async readPortalProjectGraphStates(key, login, campus, cursus, layout) {
      if (layout) calls.push({ graphCourse: cursus, graphLayout: layout });
      calls.push({ graph: { key, login, campus } });
      return [{ id: 1314, state: "done" }];
    },
    async managePortalSlots(req, res, allowed, calendar) {
      assert.ok(allowed(req));
      assert.equal(
        req.headers.authorization,
        `Bearer ${renewable ? "private-refresh-key" : "private-portal-token"}`,
      );
      calls.push({ slots: req.url });
      const result = req.url.startsWith("/create")
        ? { saved: true }
        : calendar({
            slots: [{ start: "2027-01-04T12:00:00Z", end: "2027-01-04T12:30:00Z" }],
            unavailable: [{ start: "2027-01-04T13:00:00Z", end: "2027-01-04T14:00:00Z" }],
          });
      res.writeHead(200, {});
      res.end(JSON.stringify(result));
    },
    async fetch(url, options) {
      calls.push({
        url,
        authorization: options.headers.Authorization,
        method: options.method ?? "GET",
        body: options.body,
      });
      if (url === "https://intrapy.intra.42.fr/api/v1/users/me/scale_teams") {
        assert.equal(options.headers.Authorization, "Bearer private-portal-token");
        return Response.json(state.pendingEvaluations ?? [], {
          status: state.pendingStatus ?? 200,
        });
      }
      if (url === "https://intrapy.intra.42.fr/api/v1/users/me/events") {
        if (state.eventWait) await state.eventWait;
        assert.equal(options.headers.Authorization, "Bearer private-portal-token");
        return Response.json(state.events, { status: state.eventReadStatus ?? 200 });
      }
      if (/^https:\/\/profile\.intra\.42\.fr\/(exams|events|waitlist)\//.test(url)) {
        assert.equal(options.headers.Authorization, "Bearer private-portal-token");
        assert.equal(options.redirect, "error");
        if (state.eventFailure) throw new Error("Request timed out");
        return new Response(null, { status: state.eventStatus });
      }
      if (url === "https://intrapy.intra.42.fr/api/v1/users/me") {
        assert.ok(
          ["Bearer private-portal-token", "Bearer renewed-portal-token"].includes(
            options.headers.Authorization,
          ),
        );
        if (state.profileWait) await state.profileWait;
        return Response.json({ id: state.profileId ?? identity, titles: state.titles });
      }
      if (url.startsWith("https://profile.intra.42.fr/titles_users/")) {
        assert.equal(options.headers.Authorization, "Bearer private-portal-token");
        if (state.titleStatus === 200 && !state.ignoreTitleWrite) {
          state.titles = state.titles.map((title) => ({
            ...title,
            selected: url.endsWith(`/${title.title_user_id}/selected`),
          }));
        }
        return new Response(null, { status: state.titleStatus });
      }
      if (/^https:\/\/intrapy.intra.42.fr\/api\/v1\/users\/\d+\/projects\/marked\?/.test(url)) {
        assert.equal(options.headers.Authorization, "Bearer private-portal-token");
        assert.equal(options.redirect, "error");
        return Response.json(
          [
            {
              projects_user_id: 10,
              project_name: "Libft",
              final_mark: 100,
              teams: [],
              children: [],
            },
          ],
          { status: state.status },
        );
      }
      if (url.startsWith("https://profile.intra.42.fr/searches/")) {
        assert.equal(options.headers.Authorization, "Bearer private-portal-token");
        assert.equal(options.redirect, "error");
        return Response.json(
          new URL(url).pathname.endsWith("/search.json") ? state.searchUsers : state.searchProjects,
          { status: state.searchStatus },
        );
      }
      if (
        url.startsWith("https://pace-system.42.fr/") ||
        url.startsWith("https://edtrax.42.fr/") ||
        url.startsWith("https://alumni-management.42.fr/")
      ) {
        assert.equal(options.headers.Authorization, "Bearer private-portal-token");
        return Response.json({ is_activated: true }, { status: state.status });
      }
      assert.equal(options.headers.Authorization, "Bearer server-app-token");
      assert.ok(url.startsWith("https://api.intra.42.fr/v2/"));
      return Response.json(
        { id: 42 },
        { status: state.status, headers: { "X-Total": "60", "Retry-After": "7" } },
      );
    },
  });
  return {
    calls,
    released,
    state,
    advance(ms) {
      now += ms;
    },
    identity(key) {
      return api.portalIdentity({ headers: { authorization: `Bearer ${key}` } });
    },
    async request(
      path,
      { key = "", method = "GET", headers = {}, remote = "127.0.0.1", body = "" } = {},
    ) {
      const result = { headers: {} };
      const req = {
        method,
        url: path,
        headers: { authorization: `Bearer ${key}`, ...headers },
        socket: { remoteAddress: remote },
        async *[Symbol.asyncIterator]() {
          yield body;
        },
      };
      const res = {
        setHeader(name, value) {
          result.headers[name] = value;
        },
        writeHead(status, values) {
          result.status = status;
          Object.assign(result.headers, values);
          return this;
        },
        end(raw) {
          result.body = Buffer.isBuffer(raw) ? raw : JSON.parse(raw);
        },
      };
      try {
        result.handled = await api.handlePortal(
          req,
          res,
          new URL(path, "http://localhost"),
          async () => "server-app-token",
        );
      } catch {
        result.status = 502;
      }
      return result;
    },
    async login() {
      const response = await this.request("/session/login", { method: "POST" });
      assert.equal(response.status, 200);
      return response.body;
    },
  };
}

test("native login keeps upstream credentials private, restores and revokes the local key", async () => {
  const broker = service();
  const token = await broker.login();
  assert.match(token.accessToken, /^portal_[a-f0-9]{64}$/);
  assert.equal(token.refreshToken, token.accessToken);
  assert.ok(!JSON.stringify(token).includes("private-"));
  assert.equal(broker.identity(token.accessToken).id, 42);
  assert.equal(
    (await broker.request("/session/restore", { key: token.accessToken, method: "POST" })).status,
    200,
  );
  assert.equal((await broker.request("/api/me", { key: token.accessToken })).status, 200);
  assert.equal(broker.calls.at(-1).url, "https://api.intra.42.fr/v2/users/42");
  assert.equal(
    (await broker.request("/session/logout", { key: token.accessToken, method: "POST" })).status,
    200,
  );
  assert.equal(broker.identity(token.accessToken), undefined);
  assert.deepEqual(broker.released, ["private-refresh-key"]);
  assert.equal((await broker.request("/api/me", { key: token.accessToken })).status, 401);
});

test("requires native loopback requests and authenticated sessions", async () => {
  const broker = service();
  for (const options of [
    { headers: { origin: "http://evil.example" } },
    { headers: { "sec-fetch-site": "cross-site" } },
    { remote: "192.0.2.1" },
  ])
    assert.equal(
      (await broker.request("/session/login", { method: "POST", ...options })).status,
      403,
    );
  assert.equal((await broker.request("/api/me")).status, 401);
  assert.equal((await broker.request("/session/login")).status, 401);
  assert.equal(broker.calls.length, 0);
});

test("reads marks for the viewed account and selected course with the portal session", async () => {
  const broker = service();
  const token = await broker.login();
  const result = await broker.request("/api/users/99/marks?cursus_id=21", {
    key: token.accessToken,
  });
  assert.equal(result.status, 200);
  assert.equal(result.body[0].final_mark, 100);
  assert.equal(
    broker.calls.at(-1).url,
    "https://intrapy.intra.42.fr/api/v1/users/99/projects/marked?cursus_id=21",
  );
  for (const path of [
    "/api/users/99/marks",
    "/api/users/99/marks?cursus_id=0",
    "/api/users/99/marks?cursus_id=21&cursus_id=9",
    "/api/users/99/marks?cursus_id=21&staff=true",
  ]) {
    const before = broker.calls.length;
    assert.equal((await broker.request(path, { key: token.accessToken })).status, 400);
    assert.equal(broker.calls.length, before);
  }
  broker.state.status = 503;
  assert.equal(
    (await broker.request("/api/users/99/marks?cursus_id=21", { key: token.accessToken })).status,
    503,
  );
});

test("portal search uses both official endpoints and returns only safe native destinations", async () => {
  const broker = service();
  const token = await broker.login();
  broker.state.searchUsers.push({ login: "../private", cdn_uri: "https://evil.example/photo" });
  broker.state.searchUsers.push({ login: "campus-peer", cdn_uri: "https://evil.example/photo" });
  broker.state.searchProjects.push({ id: 2, name: "Unsafe project", slug: "../../private" });
  const query = "libft & #é";
  const response = await broker.request(`/api/search?${new URLSearchParams({ query })}`, {
    key: token.accessToken,
  });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    users: [
      { login: "llopes-d", cdn_uri: "https://cdn.intra.42.fr/users/photo.jpg" },
      { login: "campus-peer" },
    ],
    projects: [{ id: 1314, name: "Libft", slug: "42cursus-libft" }],
  });
  assert.deepEqual(
    broker.calls
      .slice(-2)
      .map(({ url }) => new URL(url).pathname)
      .sort(),
    ["/searches/project.json", "/searches/search.json"],
  );
  for (const call of broker.calls.slice(-2))
    assert.equal(new URL(call.url).searchParams.get("query"), query);
  assert.ok(!JSON.stringify(response.body).includes("private-portal-token"));
});

test("search rejects invalid queries before contacting 42 and reports upstream failures", async () => {
  const broker = service();
  const token = await broker.login();
  for (const path of [
    "/api/search",
    "/api/search?query=%20",
    "/api/search?query=a&query=b",
    "/api/search?query=a&host=evil",
    `/api/search?query=${"a".repeat(101)}`,
  ]) {
    const calls = broker.calls.length;
    assert.equal((await broker.request(path, { key: token.accessToken })).status, 400);
    assert.equal(broker.calls.length, calls);
  }
  broker.state.searchStatus = 503;
  assert.equal(
    (await broker.request("/api/search?query=libft", { key: token.accessToken })).status,
    502,
  );
  broker.state.searchStatus = 200;
  broker.state.searchUsers = { error: "invalid data" };
  assert.equal(
    (await broker.request("/api/search?query=libft", { key: token.accessToken })).status,
    502,
  );
  broker.state.searchUsers = [];
  broker.state.searchProjects = [];
  assert.deepEqual(
    (await broker.request("/api/search?query=absent", { key: token.accessToken })).body,
    { users: [], projects: [] },
  );
});

test("resolves a student login through the public profile API without allowing arbitrary user subresources", async () => {
  const broker = service();
  const token = await broker.login();
  assert.equal(
    (await broker.request("/api/users/by-login/llopes-d", { key: token.accessToken })).status,
    200,
  );
  assert.equal(broker.calls.at(-1).url, "https://api.intra.42.fr/v2/users/llopes-d");
  for (const path of [
    "/api/users/by-login/llopes-d/private",
    "/api/users/by-login/llopes-d?filter[visible]=true",
    "/api/users/by-login/https%3A%2F%2Fevil.example",
  ]) {
    const calls = broker.calls.length;
    assert.equal((await broker.request(path, { key: token.accessToken })).status, 404);
    assert.equal(broker.calls.length, calls);
  }
});

test("forwards the campus achievement catalog with pagination and visibility filters", async () => {
  const broker = service();
  const token = await broker.login();
  const path =
    "/api/campus/38/achievements?filter[visible]=true&sort=id&page[size]=100&page[number]=2";
  assert.equal((await broker.request(path, { key: token.accessToken })).status, 200);
  assert.equal(broker.calls.at(-1).url, `https://api.intra.42.fr/v2${path.slice(4)}`);
  for (const invalid of [
    "/api/campus/0/achievements",
    "/api/campus/38/achievements/private",
    "/api/campus/38/achievements?filter[secret]=true",
  ]) {
    const before = broker.calls.length;
    assert.equal((await broker.request(invalid, { key: token.accessToken })).status, 404);
    assert.equal(broker.calls.length, before);
  }
});

test("allows all native read resources while restricting upstream URLs, methods and private user IDs", async () => {
  const broker = service();
  const { accessToken: key } = await broker.login();
  for (const path of [
    "/me",
    "/users/2",
    "/users/2/coalitions",
    "/users/2/locations?range[begin_at]=a,b&page[size]=100",
    "/users/42/scale_teams?sort=-begin_at&page[size]=30",
    "/me/scale_teams/as_corrector?filter[filled]=true",
    "/users/42/correction_point_historics",
    "/users/42/quests_users",
    "/users/2/quests_users",
    "/users/2/correction_point_historics",
    "/users/2/scale_teams/as_corrector?filter[filled]=true",
    "/scale_teams/9753130",
    "/projects/42cursus-libft",
    "/projects_users/9",
    "/cursus/21/projects?filter[visible]=true&search[name]=libft",
    "/projects?page[size]=20&page[number]=2",
    "/campus?sort=name",
    "/campus/38/events?filter[future]=true",
    "/campus/38/locations?filter[active]=true",
    "/blocs?filter[campus_id]=38",
    "/clusters",
    "/achievements?filter[visible]=true",
    "/achievements_users?filter[user_id]=42&filter[rewarded]=true",
  ])
    assert.equal((await broker.request(`/api${path}`, { key })).status, 200, path);
  for (const path of [
    "/users/2/scale_teams",
    "/scale_teams/0",
    "/scale_teams/9753130/private",
    "/oauth/token",
    "/users/2/slots",
    "/users/0",
    "/me?url=https://evil.example",
    "/me?include=secret",
    "/https://evil.example",
    "/%2f%2fevil.example",
  ])
    assert.equal((await broker.request(`/api${path}`, { key })).status, 404, path);
  assert.equal((await broker.request("/api/me", { key, method: "POST" })).status, 404);
  broker.state.status = 429;
  const limited = await broker.request("/api/me", { key });
  assert.equal(limited.status, 429);
  assert.equal(limited.headers["retry-after"], "7");
  assert.equal(limited.headers["x-total"], "60");
});

test("renews expired sessions, retries upstream failures and refuses revoked grants", async () => {
  const broker = service();
  const { accessToken: key } = await broker.login();
  broker.advance(301_000);
  assert.equal((await broker.request("/api/me", { key })).status, 401);
  assert.equal((await broker.request("/session/refresh", { key, method: "POST" })).status, 200);
  assert.equal((await broker.request("/api/me", { key })).status, 200);
  broker.state.refresh = new Error("Network unavailable");
  assert.equal((await broker.request("/session/refresh", { key, method: "POST" })).status, 502);
  assert.ok(broker.identity(key));
  broker.state.refresh = null;
  assert.equal((await broker.request("/session/refresh", { key, method: "POST" })).status, 401);
  assert.equal(broker.identity(key), undefined);
});

test("expires unrenewable and absolute-lifetime sessions and rejects invalid identities", async () => {
  const broker = service({ renewable: false });
  const token = await broker.login();
  assert.equal(token.refreshToken, undefined);
  broker.advance(301_000);
  assert.equal(
    (await broker.request("/session/restore", { key: token.accessToken, method: "POST" })).status,
    401,
  );
  assert.deepEqual(broker.released, ["private-portal-token"]);
  const renewable = service();
  const session = await renewable.login();
  renewable.advance(86_400_001);
  assert.equal(
    (await renewable.request("/session/refresh", { key: session.accessToken, method: "POST" }))
      .status,
    401,
  );
  const invalid = service({ identity: "42" });
  assert.equal((await invalid.request("/session/login", { method: "POST" })).status, 502);
  assert.deepEqual(invalid.released, ["private-refresh-key"]);
});

test("uses scoped portal cookies for slots and prevents writing another user's availability", async () => {
  const broker = service();
  const { accessToken: key } = await broker.login();
  const calendar = await broker.request(
    "/api/me/slots?range[begin_at]=2027-01-04T00:00:00.000Z,2027-01-11T00:00:00.000Z",
    { key },
  );
  assert.equal(calendar.status, 200);
  assert.equal(calendar.body.length, 2);
  assert.equal(calendar.body[0].begin_at, "2027-01-04T12:00:00Z");
  assert.equal(calendar.body[1].scale_team_id, -1);
  assert.equal(
    (await broker.request("/api/slots", { key, method: "POST", body: "{" })).status,
    400,
  );
  assert.equal(
    (await broker.request("/api/slots", { key, method: "POST", body: "x".repeat(8193) })).status,
    413,
  );
  assert.equal(
    (
      await broker.request("/api/slots", {
        key,
        method: "POST",
        body: JSON.stringify({ slot: { user_id: 2 } }),
      })
    ).status,
    403,
  );
  const created = await broker.request("/api/slots", {
    key,
    method: "POST",
    body: JSON.stringify({
      slot: {
        user_id: 42,
        begin_at: "2027-01-04T12:00:00.000Z",
        end_at: "2027-01-04T12:30:00.000Z",
      },
    }),
  });
  assert.equal(created.status, 200);
  assert.deepEqual(created.body, { saved: true });
});

test("selects an owned title with the portal token and resets it with the official unselected action", async () => {
  const broker = service();
  const { accessToken: key } = await broker.login();
  for (const [titleId, path, method] of [
    [12, "102/selected", "GET"],
    [0, "unselected", "POST"],
  ]) {
    const response = await broker.request("/api/me/title", {
      key,
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ titleId }),
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.titleId, titleId);
    assert.equal(broker.calls.at(-2).url, `https://profile.intra.42.fr/titles_users/${path}`);
    assert.equal(broker.calls.at(-2).method, method);
    assert.ok(
      !broker.calls.some(({ authorization }) => authorization === "Bearer server-app-token"),
    );
  }
});

test("does not report a title saved when the portal accepts the action without changing it", async () => {
  const broker = service();
  const { accessToken: key } = await broker.login();
  broker.state.ignoreTitleWrite = true;
  const response = await broker.request("/api/me/title", {
    key,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: '{"titleId":12}',
  });
  assert.equal(response.status, 502);
  assert.match(response.body.error, /did not confirm/);
});

test("rejects malformed title requests and prevents selecting unowned titles or another user's profile", async () => {
  const broker = service();
  const { accessToken: key } = await broker.login();
  const write = (body, headers = { "content-type": "application/json" }) =>
    broker.request("/api/me/title", { key, method: "POST", headers, body });
  for (const body of ["{", "null", "{}", '{"titleId":-1}', '{"titleId":"12"}', '{"titleId":1.5}']) {
    assert.equal((await write(body)).status, 400);
  }
  assert.equal((await write("x".repeat(8193))).status, 413);
  assert.equal((await write('{"titleId":12}', {})).status, 415);
  assert.equal((await write('{"titleId":999}')).status, 403);
  broker.state.titles = [{ title_id: 12, title_user_id: "../../other-user", name: "Invalid" }];
  assert.equal((await write('{"titleId":12}')).status, 403);
  broker.state.profileId = 99;
  assert.equal((await write('{"titleId":0}')).status, 502);
  assert.ok(!broker.calls.some(({ url }) => url.includes("/titles_users/")));
  assert.equal(
    (await broker.request("/api/users/99/title", { key, method: "POST", body: '{"titleId":12}' }))
      .status,
    404,
  );
  assert.equal((await broker.request("/api/me/title", { key })).status, 404);
});

test("keeps title writes authenticated, serialized and retryable after an upstream rejection", async () => {
  const broker = service();
  const { accessToken: key } = await broker.login();
  const options = {
    key,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: '{"titleId":12}',
  };
  assert.equal((await broker.request("/api/me/title", { ...options, key: "" })).status, 401);
  assert.equal(
    (
      await broker.request("/api/me/title", {
        ...options,
        headers: { ...options.headers, origin: "https://evil.example" },
      })
    ).status,
    403,
  );
  broker.state.titleStatus = 403;
  assert.equal((await broker.request("/api/me/title", options)).status, 403);
  broker.state.titleStatus = 200;
  let release;
  broker.state.profileWait = new Promise((resolve) => {
    release = resolve;
  });
  const pending = broker.request("/api/me/title", options);
  while (!broker.calls.at(-1).url.endsWith("/users/me")) await Promise.resolve();
  assert.equal((await broker.request("/api/me/title", options)).status, 409);
  release();
  assert.equal((await pending).status, 200);
});

test("pace and attendance use the portal grant for a fixed official host and viewed user", async () => {
  const broker = service();
  const token = await broker.login();
  const key = token.accessToken;
  for (const resource of ["pace", "attendance", "alumnization"]) {
    assert.equal((await broker.request(`/api/users/274800/${resource}`, { key })).status, 200);
  }
  assert.ok(
    broker.calls.some(
      (call) =>
        call.url === "https://pace-system.42.fr/api/v1/users/274800/profile" &&
        call.authorization === "Bearer private-portal-token",
    ),
  );
  assert.ok(
    broker.calls.some(
      (call) =>
        call.url === "https://alumni-management.42.fr/api/v1/alumni_auto/274800" &&
        call.authorization === "Bearer private-portal-token",
    ),
  );
  assert.ok(
    broker.calls.some(
      (call) =>
        call.url === "https://edtrax.42.fr/api/v1/attendance/274800/summary" &&
        call.authorization === "Bearer private-portal-token",
    ),
  );
  for (const path of [
    "/api/users/274800/pace?url=https://evil.example",
    "/api/users/pprates/pace",
    "/api/users/274800/attendance/extra",
    "/api/users/274800/alumnization?url=https://evil.example",
  ])
    assert.equal((await broker.request(path, { key })).status, 404);
  assert.equal(
    (await broker.request("/api/users/274800/pace", { key, method: "POST" })).status,
    404,
  );
  assert.equal((await broker.request("/api/users/274800/pace")).status, 401);
  broker.state.status = 404;
  const absent = await broker.request("/api/users/274800/pace", { key });
  assert.equal(absent.status, 200);
  assert.equal(absent.body, null);
  const noAlumnization = await broker.request("/api/users/274800/alumnization", { key });
  assert.equal(noAlumnization.status, 200);
  assert.equal(noAlumnization.body, null);
});

function eventRequest(s, key, action, extra = {}) {
  return s.request("/api/events/32819/subscription", {
    key,
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, ...extra }),
  });
}
const writes = (s) => s.calls.filter((call) => ["POST", "DELETE"].includes(call.method));

test("native agenda uses the official account agenda and keeps private tokens on the server", async () => {
  const s = service();
  const { accessToken: key } = await s.login();
  const result = await s.request("/api/me/events", { key });
  assert.equal(result.status, 200);
  assert.equal(result.body[0].kind, "exam");
  assert.equal(result.body[0].nbr_subscribers, 7);
  assert.ok(!JSON.stringify(result).includes("private-portal-token"));
  assert.equal((await s.request("/api/me/events")).status, 401);
  assert.equal((await s.request("/api/me/events?user_id=99", { key })).status, 404);
});

test("subscribes exams and regular events through their distinct official routes", async () => {
  for (const kind of ["exam", "workshop"]) {
    const s = service();
    const { accessToken: key } = await s.login();
    s.state.events[0].kind = kind;
    assert.equal((await eventRequest(s, key, "subscribe")).status, 200);
    assert.equal(writes(s).length, 1);
    assert.equal(
      writes(s)[0].url,
      `https://profile.intra.42.fr/${kind === "exam" ? "exams/32819/exams_users" : "events/32819/events_users"}.json`,
    );
    assert.equal(writes(s)[0].method, "POST");
    assert.equal(writes(s)[0].body, undefined);
  }
});

test("cancels only the registration resolved from the connected account, ignoring injected IDs", async () => {
  for (const kind of ["exam", "event"]) {
    const s = service();
    const { accessToken: key } = await s.login();
    Object.assign(s.state.events[0], { kind, is_subscribed: true, events_user_id: 101 });
    const result = await eventRequest(s, key, "unsubscribe", { user_id: 99, events_user_id: 999 });
    assert.equal(result.status, 200);
    assert.equal(writes(s)[0].method, "DELETE");
    assert.equal(
      writes(s)[0].url,
      `https://profile.intra.42.fr/${kind === "exam" ? "exams/32819/exams_users" : "events/32819/events_users"}/101.json`,
    );
  }
});

test("rejects closed, full, already subscribed, unavailable and missing-registration writes", async () => {
  for (const [patch, action, status] of [
    [{ begin_at: new Date(Date.now() - 1000).toISOString() }, "subscribe", 409],
    [{ nbr_subscribers: 40 }, "subscribe", 409],
    [{ is_subscribed: true }, "subscribe", 409],
    [{ is_subscribed: true, events_user_id: null }, "unsubscribe", 409],
    [{ is_subscribed: true, events_user_id: 101, unsubscription_delay: 144 }, "unsubscribe", 409],
    [{ id: 99 }, "subscribe", 404],
  ]) {
    const s = service();
    const { accessToken: key } = await s.login();
    Object.assign(s.state.events[0], patch);
    assert.equal((await eventRequest(s, key, action)).status, status);
    assert.equal(writes(s).length, 0);
  }
});

test("waitlists use the session owner and cancel the account's own waiting-list entry", async () => {
  const s = service();
  const { accessToken: key } = await s.login();
  s.state.events[0].nbr_subscribers = 40;
  assert.equal((await eventRequest(s, key, "join-waitlist", { user_id: 999 })).status, 200);
  assert.equal(writes(s)[0].url, "https://profile.intra.42.fr/waitlist/26437/users_waitlists.json");
  assert.deepEqual(JSON.parse(writes(s)[0].body), { users_waitlist: { user_id: 42 } });
  Object.assign(s.state.events[0], { is_waitlisted: true, users_waitlist_id: 71 });
  assert.equal((await eventRequest(s, key, "leave-waitlist")).status, 200);
  assert.equal(
    writes(s)[1].url,
    "https://profile.intra.42.fr/waitlist/26437/users_waitlists/71.json",
  );
  assert.equal(writes(s)[1].method, "DELETE");
});

test("failed or uncertain writes are never retried and release the server lock", async () => {
  const s = service();
  const { accessToken: key } = await s.login();
  s.state.eventStatus = 422;
  assert.equal((await eventRequest(s, key, "subscribe")).status, 409);
  assert.equal(writes(s).length, 1);
  s.state.eventFailure = true;
  assert.equal((await eventRequest(s, key, "subscribe")).status, 502);
  assert.equal(writes(s).length, 2);
  s.state.eventFailure = false;
  s.state.eventStatus = 204;
  assert.equal((await eventRequest(s, key, "subscribe")).status, 200);
});

test("event writes validate input before accessing the upstream and block overlapping writes", async () => {
  const s = service();
  const { accessToken: key } = await s.login();
  for (const body of ["{", '{"action":"delete"}', "null", "x".repeat(1025)]) {
    const result = await s.request("/api/events/32819/subscription", {
      key,
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    assert.ok([400, 413].includes(result.status));
  }
  assert.equal(writes(s).length, 0);
  let release;
  s.state.eventWait = new Promise((resolve) => {
    release = resolve;
  });
  const first = eventRequest(s, key, "subscribe");
  // Let the first request enter the official agenda read while it owns the lock.
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await eventRequest(s, key, "subscribe")).status, 409);
  release();
  assert.equal((await first).status, 200);
  assert.equal(writes(s).length, 1);
});

test("native cancellation is scoped to the session owner and forwarded to the calendar adapter", async () => {
  const s = service();
  const { accessToken: key } = await s.login();
  const request = {
    method: "POST",
    key,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      slot: {
        user_id: 42,
        begin_at: "2030-01-01T10:00:00.000Z",
        end_at: "2030-01-01T11:00:00.000Z",
      },
    }),
  };
  assert.equal((await s.request("/api/slots/cancel", request)).status, 200);
  assert.ok(s.calls.some((call) => call.slots?.startsWith("/cancel?")));
  request.body = JSON.stringify({ slot: { user_id: 99 } });
  assert.equal((await s.request("/api/slots/cancel", request)).status, 403);
});

test("pending evaluations use the official portal feed and reject malformed or unscoped requests", async () => {
  const broker = service();
  const { accessToken: key } = await broker.login();
  const row = {
    id: 15,
    kind: "evaluator",
    user: "campus-peer",
    project_name: "ft_printf",
    begin_at: "2026-11-28T16:00:00Z",
    can_cancel: true,
  };
  broker.state.pendingEvaluations = [row];
  const response = await broker.request("/api/me/evaluations", { key });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, [
    {
      id: 15,
      kind: "evaluator",
      user: "campus-peer",
      project_name: "ft_printf",
      begin_at: "2026-11-28T16:00:00Z",
    },
  ]);
  assert.equal(broker.calls.at(-1).url, "https://intrapy.intra.42.fr/api/v1/users/me/scale_teams");
  for (const invalid of [
    { ...row, id: 0 },
    { ...row, user: "../me" },
    { ...row, begin_at: "invalid" },
  ]) {
    broker.state.pendingEvaluations = [invalid];
    assert.equal((await broker.request("/api/me/evaluations", { key })).status, 502);
  }
  broker.state.pendingStatus = 503;
  assert.equal((await broker.request("/api/me/evaluations", { key })).status, 502);
  for (const path of ["/api/me/evaluations?user=2", "/api/users/2/evaluations"]) {
    const before = broker.calls.length;
    assert.equal((await broker.request(path, { key })).status, 404);
    assert.equal(broker.calls.length, before);
  }
});

test("Holy Graph reads project states through the authenticated portal session", async () => {
  const s = service();
  const { accessToken: key } = await s.login();
  const path = "/api/holy-graph?login=student-a&campus=38";
  assert.equal((await s.request(path)).status, 401);
  assert.equal(
    (await s.request("/api/holy-graph?login=student-a&campus=invalid", { key })).status,
    400,
  );
  const result = await s.request(path, { key });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, [{ id: 1314, state: "done" }]);
  assert.deepEqual(s.calls.at(-1).graph, {
    key: "private-refresh-key",
    login: "student-a",
    campus: "38",
  });
});

test("project catalog uses the signed-in portal session and validates official filters", async () => {
  const s = service();
  const { accessToken: key } = await s.login();
  const result = await s.request(
    "/api/me/project-list?page=2&sort=recent&search=lib&cursus=42cursus",
    { key },
  );
  assert.equal(result.status, 200);
  assert.equal(result.body.items[0].recommendation, "Forbidden");
  const forwarded = new URLSearchParams(s.calls.find((call) => call.projectList).projectList);
  assert.equal(forwarded.get("sort"), "project-creation");
  assert.equal(forwarded.get("search"), "lib");
  assert.equal(forwarded.get("page"), "2");
  for (const query of [
    "page=0",
    "page=1&url=https://evil.test",
    "sort=private",
    `search=${"a".repeat(101)}`,
  ]) {
    const before = s.calls.length;
    assert.equal((await s.request(`/api/me/project-list?${query}`, { key })).status, 400);
    assert.equal(s.calls.length, before);
  }
});

test("project sorting and recommended-only filtering use the official catalog options", async () => {
  const s = service();
  const { accessToken: key } = await s.login();
  for (const [sort, expected] of [
    ["name", "project-name"],
    ["duration", "project-duration"],
    ["recommendation", "project-recommendation"],
    ["registration", "project-registration"],
    ["recent", "project-creation"],
    ["xp", "project-xp"],
  ]) {
    assert.equal(
      (await s.request(`/api/me/project-list?sort=${sort}&recommended=true`, { key })).status,
      200,
    );
    const params = new URLSearchParams(s.calls.at(-1).projectList);
    assert.equal(params.get("sort"), expected);
    assert.equal(params.get("filters"), "recommended-projects");
  }
  assert.equal((await s.request("/api/me/project-list?recommended=false", { key })).status, 200);
  assert.equal(new URLSearchParams(s.calls.at(-1).projectList).has("filters"), false);
  assert.equal((await s.request("/api/me/project-list?recommended=anything", { key })).status, 400);
});

test("campus maps use the saved portal session and accept missing SVGs as an empty result", async () => {
  const broker = service();
  const token = await broker.login();
  const response = await broker.request("/api/campus/33/maps", { key: token.accessToken });
  assert.equal(response.status, 200);
  assert.deepEqual(response.body, []);
  assert.equal(broker.calls.at(-1).metaCampusId, 33);
  assert.ok(!JSON.stringify(response.body).includes("private-"));
  assert.equal(
    (await broker.request("/api/campus/9007199254740992/maps", { key: token.accessToken })).status,
    400,
  );
  assert.equal((await broker.request("/api/campus/33/maps")).status, 401);
});

test("official project overview reads the saved session without exposing credentials", async () => {
  const broker = service();
  const token = await broker.login();
  const response = await broker.request("/api/projects/ftl_quantum/overview", {
    key: token.accessToken,
  });
  assert.equal(response.status, 200);
  assert.equal(response.body.statistics.success.true, 45);
  assert.equal(broker.calls.at(-1).projectSlug, "ftl_quantum");
  assert.ok(!JSON.stringify(response.body).includes("private-"));
  assert.equal((await broker.request("/api/projects/ftl_quantum/overview")).status, 401);
});

test("attachment proxy streams files using the saved session and rejects untrusted URLs", async () => {
  const broker = service();
  const token = await broker.login();
  const source = "https://cdn.intra.42.fr/pdf/pdf/42/subject.pdf";
  const path = `/api/project-attachment?${new URLSearchParams({ source })}`;
  const response = await broker.request(path, { key: token.accessToken });
  assert.equal(response.status, 200);
  assert.equal(response.headers["Content-Type"], "application/pdf");
  assert.equal(response.body.toString(), "%PDF-test-file");
  assert.equal(broker.calls.at(-1).attachmentSource, source);
  assert.equal((await broker.request(path)).status, 401);
  for (const invalid of [
    "http://cdn.intra.42.fr/test.pdf",
    "https://example.com/test.pdf",
    "https://user:password@cdn.intra.42.fr/test.pdf",
  ]) {
    assert.equal(
      (
        await broker.request(
          `/api/project-attachment?${new URLSearchParams({ source: invalid })}`,
          { key: token.accessToken },
        )
      ).status,
      400,
    );
  }
});

test("project student routes restrict list kind and page and use the saved session", async () => {
  const broker = service();
  const token = await broker.login();
  const path = "/api/projects/42cursus-minishell/students/without_team";
  const response = await broker.request(`${path}?page=2`, { key: token.accessToken });
  assert.equal(response.status, 200);
  assert.deepEqual(broker.calls.at(-1).projectStudents, {
    slug: "42cursus-minishell",
    kind: "without_team",
    page: 2,
  });
  assert.ok(!JSON.stringify(response.body).includes("private-"));
  for (const query of [
    "page=0",
    "page=1.5",
    "page=1&page=2",
    "page=1001",
    "url=https://evil.example",
  ]) {
    assert.equal(
      (await broker.request(`${path}?${query}`, { key: token.accessToken })).status,
      400,
    );
  }
  assert.equal((await broker.request(path)).status, 401);
});

test("personal project details use the saved account and reject query overrides", async () => {
  const broker = service();
  const token = await broker.login();
  assert.equal(
    (await broker.request("/api/projects/work-experience-i/personal", { key: token.accessToken }))
      .status,
    200,
  );
  assert.equal(broker.calls.at(-1).projectSlug, "work-experience-i");
  assert.equal(broker.calls.at(-1).personal, true);
  assert.equal((await broker.request("/api/projects/work-experience-i/personal")).status, 401);
  assert.notEqual(
    (
      await broker.request("/api/projects/work-experience-i/personal?user=another", {
        key: token.accessToken,
      })
    ).status,
    200,
  );
});

test("project unregistration uses the saved session and requires authentication", async () => {
  const broker = service();
  const token = await broker.login();
  const path = "/api/projects/work-experience-i/unregister";
  const result = await broker.request(path, { method: "POST", key: token.accessToken });
  assert.equal(result.status, 200);
  assert.equal(result.body.unregistered, true);
  assert.equal(broker.calls.at(-1).unregisterProject, "work-experience-i");
  assert.equal((await broker.request(path, { method: "POST" })).status, 401);
  assert.notEqual(
    (await broker.request(`${path}?id=123`, { method: "POST", key: token.accessToken })).status,
    200,
  );
});

test("viewed project registrations preserve the enrollment ID without using mine", async () => {
  const broker = service();
  const token = await broker.login();
  const result = await broker.request("/api/projects/42cursus-ft_printf/registrations/123", {
    key: token.accessToken,
  });
  assert.equal(result.status, 200);
  assert.equal(broker.calls.at(-1).enrollmentId, 123);
  assert.equal(broker.calls.at(-1).personal, true);
  assert.equal(
    (await broker.request("/api/projects/42cursus-ft_printf/registrations/123")).status,
    401,
  );
  assert.equal(
    (
      await broker.request("/api/projects/42cursus-ft_printf/registrations/9007199254740992", {
        key: token.accessToken,
      })
    ).status,
    400,
  );
});

test("finishing a project requires the saved session and preserves the requested team", async () => {
  const broker = service();
  const token = await broker.login();
  const path = "/api/projects/test/teams/team-123/finish";
  assert.equal(
    (await broker.request(path, { method: "POST", key: token.accessToken })).status,
    200,
  );
  assert.equal(broker.calls.at(-1).teamId, "team-123");
  assert.equal(broker.calls.at(-1).finishProject, "test");
  assert.equal((await broker.request(path, { method: "POST" })).status, 401);
  assert.notEqual(
    (await broker.request(`${path}?team=456`, { method: "POST", key: token.accessToken })).status,
    200,
  );
});

test("graph cursus selection forwards the requested official layout and rejects invalid courses", async () => {
  const s = service();
  const token = await s.login();
  assert.equal(
    (
      await s.request("/api/holy-graph?login=student-a&campus=38&cursus_id=9&layout=1", {
        key: token.accessToken,
      })
    ).status,
    200,
  );
  assert.ok(s.calls.some((call) => call.graphCourse === "9" && call.graphLayout));
  assert.equal(
    (
      await s.request("/api/holy-graph?login=student-a&campus=38&cursus_id=invalid&layout=1", {
        key: token.accessToken,
      })
    ).status,
    400,
  );
});
