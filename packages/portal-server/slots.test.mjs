import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import {
  parseProjectOverview,
  parseProjectStats,
  parseProjectTeams,
  projectFinishAction,
  projectUnregistration,
} from "./project-details.ts";

const source = stripTypeScriptTypes(readFileSync(new URL("./slots.ts", import.meta.url), "utf8"))
  .replace(/^import[\s\S]*?from ["'][^"']+["'];?\n/gm, "")
  .replaceAll("export ", "");
async function fixture() {
  const api = {};
  const writes = [];
  const start = "2030-01-01T10:00:00.000Z",
    end = "2030-01-01T11:00:00.000Z";
  const state = {
    own: [{ id: 101, ids: [101, 102], start, end, className: ["available"] }],
    status: 200,
  };
  const response = (body, status = 200, headers = {}) => ({
    headers: () => headers,
    ok: () => status < 300,
    status: () => status,
    json: async () => body,
    text: async () => body,
  });
  const context = {
    storageState: async () => ({ cookies: [] }),
    dispose: async () => {},
    get: async (path, options) => {
      if (state.details) {
        state.reads.push(path);
        const result = state.details[path];
        assert.ok(result, `Unexpected request: ${path}`);
        return response(result.body, result.status ?? 200, result.headers);
      }
      if (state.project)
        return response(path.endsWith("/mine") ? state.project : state.updatedProject);
      if (path === "/slots") return response('<meta name="csrf-token" content="test-token">');
      if (state.clipBoundaries && options.params.start === start && options.params.end === end)
        return response([
          {
            id: 101,
            ids: [102],
            start: "2030-01-01T10:15:00.000Z",
            end: "2030-01-01T10:45:00.000Z",
          },
        ]);
      return response(state.own);
    },
    post: async (path, options) => {
      writes.push({ path, ...options });
      if (state.finishedProject) state.project = state.finishedProject;
      if (state.wait) await state.wait;
      return response({ status: state.status }, state.status);
    },
  };
  await runInNewContext(
    `(async()=>{${source}\nObject.assign(api,{ retainSlotSession,managePortalSlots,unregisterPortalProject,readPortalProjectDetails,finishPortalProject });})()`,
    {
      api,
      parseProjectOverview,
      parseProjectStats,
      parseProjectTeams,
      projectUnregistration,
      projectFinishAction,
      createHash,
      URL,
      Date,
      request: { newContext: async () => context },
      readSessionRecords: () => [],
      writeSessionRecords: async () => {},
      setTimeout: () => ({
        unref() {
          return 1;
        },
      }),
      clearTimeout() {},
      isLocalPost: () => true,
      json(res, status, body) {
        res.status = status;
        res.body = body;
      },
    },
  );
  await api.retainSlotSession("local", 3600, []);
  return {
    state,
    writes,
    details: (slug, enrollmentId) =>
      api.readPortalProjectDetails("local", slug, true, enrollmentId),
    finish: (slug, teamId) => api.finishPortalProject("local", slug, teamId),
    unregister: (slug) => api.unregisterPortalProject("local", slug),
    async cancel(query = {}) {
      const res = {};
      await api.managePortalSlots(
        {
          url: `/cancel?${new URLSearchParams({ start, end, ...query })}`,
          headers: { authorization: "Bearer local" },
        },
        res,
      );
      return res;
    },
  };
}

test("cancellation preserves all quarter IDs when the official calendar clips exact query boundaries", async () => {
  const f = await fixture();
  f.state.clipBoundaries = true;
  assert.equal((await f.cancel()).status, 200);
  assert.equal(f.writes[0].form.ids, "101,102");
});

test("cancels only the exact slot from the account's freshly loaded calendar with official CSRF and method override", async () => {
  const f = await fixture();
  assert.equal((await f.cancel()).status, 200);
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].path, "/slots/101.json");
  assert.equal(f.writes[0].form.ids, "101,102");
  assert.equal(f.writes[0].form._method, "delete");
  assert.equal(f.writes[0].form.confirm, "false");
  assert.equal(f.writes[0].headers["X-CSRF-Token"], "test-token");
});
test("rejects missing, reserved, closed and malformed slot identities without writing", async () => {
  for (const change of [
    { start: "2030-01-01T12:00:00.000Z" },
    { className: ["reserved"] },
    { className: "closed" },
    { id: "../users" },
    { ids: "101/../../" },
  ]) {
    const f = await fixture();
    Object.assign(f.state.own[0], change);
    assert.equal((await f.cancel()).status, 409);
    assert.equal(f.writes.length, 0);
  }
  const f = await fixture();
  f.state.own = [];
  assert.equal((await f.cancel()).status, 409);
  assert.equal(f.writes.length, 0);
});
test("cancellation validates intervals and unlocks after upstream failures without retrying", async () => {
  const f = await fixture();
  assert.equal((await f.cancel({ start: "invalid" })).status, 400);
  assert.equal(
    (await f.cancel({ start: "2000-01-01T10:00:00.000Z", end: "2000-01-01T11:00:00.000Z" })).status,
    400,
  );
  f.state.status = 422;
  assert.equal((await f.cancel()).status, 422);
  assert.equal(f.writes.length, 1);
  f.state.status = 200;
  assert.equal((await f.cancel()).status, 200);
});
test("serializes calendar writes so repeated cancellation cannot run concurrently", async () => {
  const f = await fixture();
  let release;
  f.state.wait = new Promise((resolve) => {
    release = resolve;
  });
  const first = f.cancel();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal((await f.cancel()).status, 409);
  release();
  assert.equal((await first).status, 200);
  assert.equal(f.writes.length, 1);
});

test("project unregister reloads the allowed action, submits CSRF and verifies completion", async () => {
  const f = await fixture();
  f.state.project = `<meta name="csrf-token" content="csrf-test"><div id="project-show"><div class="project-header"><h3>Test</h3></div><div class="project-summary-item">Solo</div><div class="project-summary-item"><a data-method="delete" href="/projects/test/projects_users/123">Unregister</a></div></div>`;
  f.state.updatedProject = `<div id="project-show"><div class="project-header"><h3>Test</h3></div><div class="project-status-box" data-status="allowed"></div><div class="project-summary-item">Solo</div></div>`;
  await f.unregister("test");
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].path, "https://projects.intra.42.fr/projects/test/projects_users/123");
  assert.equal(f.writes[0].form._method, "delete");
  assert.equal(f.writes[0].headers["X-CSRF-Token"], "csrf-test");
  f.state.updatedProject = f.state.project;
  await assert.rejects(f.unregister("test"), /did not confirm/);
});
test("project unregister refuses missing permissions, another slug and missing CSRF before writing", async () => {
  for (const html of [
    '<div id="project-show">No unregister action</div>',
    '<div id="project-show"><div class="project-summary-item"><a data-method="delete" href="/projects/another/projects_users/123">Unregister</a></div></div>',
    '<div id="project-show"><div class="project-summary-item"><a data-method="delete" href="/projects/test/projects_users/123">Unregister</a></div></div>',
  ]) {
    const f = await fixture();
    f.state.project = html;
    await assert.rejects(f.unregister("test"));
    assert.equal(f.writes.length, 0);
  }
});

test("personal project redirects to its exact public overview load closed steps and charts", async () => {
  const f = await fixture();
  const base = "https://projects.intra.42.fr";
  f.state.reads = [];
  f.state.details = {
    [`${base}/contract-upload/mine`]: {
      status: 302,
      headers: { location: `${base}/projects/contract-upload` },
    },
    [`${base}/projects/contract-upload`]: {
      body: `<div id="project-show"><div class="project-header"><h3>Contract Upload</h3></div><div class="project-status-box" data-status="closed"></div><div class="project-summary-item">Solo</div><div><h4>Skills</h4><p class="skill-list">Group &amp; interpersonal</p></div></div>`,
    },
    [`${base}/projects/contract-upload/stats.json`]: {
      body: {
        success: { true: 1 },
        average_team_lifespan: {},
        final_mark_by_campus: [],
        flags: [],
      },
    },
  };
  const data = await f.details("contract-upload");
  assert.equal(data.status, "closed");
  assert.equal(data.skills[0], "Group & interpersonal");
  assert.equal(data.statistics.success.true, 1);
  assert.equal(data.teams, undefined);
  assert.equal(f.writes.length, 0);
});
test("personal project reader never follows login, external or another project's redirect", async () => {
  for (const location of [
    "https://evil.example/projects/test",
    "/users/sign_in",
    "/projects/another",
  ]) {
    const f = await fixture();
    f.state.reads = [];
    f.state.details = {
      "https://projects.intra.42.fr/test/mine": { status: 302, headers: { location } },
    };
    await assert.rejects(f.details("test"), /HTTP 302/);
    assert.equal(f.state.reads.length, 1);
  }
});

test("viewed user's project reads their exact registration rather than mine", async () => {
  const f = await fixture();
  f.state.reads = [];
  f.state.details = {
    "https://projects.intra.42.fr/projects/test/projects_users/123": {
      body: `<div id="project-show"><div class="project-header"><h3>Student's project</h3></div><div class="project-summary-item">Solo</div><div id="teams-accordion"><div class="team-item"><span class="team-name">Student's team</span></div></div></div>`,
    },
  };
  const data = await f.details("test", 123);
  assert.equal(data.teams[0].name, "Student's team");
  assert.equal(f.state.reads.length, 1);
  await assert.rejects(f.details("test", 0), /Invalid/);
});

const finishHtml = `<meta name="csrf-token" content="csrf"><div id="teams-accordion"><div class="team-item"><span class="team-name">My team</span><div class="team-content" id="team-123"><div class="team-actions"><a data-method="put" href="/projects/test/teams/123/close">Set the project as finished</a></div></div></div></div>`;
test("finishing rechecks mine, submits the official method and only succeeds after confirmed closure", async () => {
  const f = await fixture();
  f.state.project = finishHtml;
  f.state.finishedProject = finishHtml.replace(
    '<div class="team-actions"><a data-method="put" href="/projects/test/teams/123/close">Set the project as finished</a></div>',
    '<div class="team-lock-and-close">This team was locked yesterday and closed today</div>',
  );
  await f.finish("test", "team-123");
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0].form._method, "put");
  assert.equal(f.writes[0].headers["X-CSRF-Token"], "csrf");
});
test("finishing never writes without eligibility and never reports success on an unchanged team", async () => {
  for (const html of [
    "<div>No permission</div>",
    finishHtml.replace('content="csrf"', 'content=""'),
    finishHtml.replace("/projects/test/", "/projects/another/"),
  ]) {
    const f = await fixture();
    f.state.project = html;
    await assert.rejects(f.finish("test", "team-123"));
    assert.equal(f.writes.length, 0);
  }
  const f = await fixture();
  f.state.project = finishHtml;
  await assert.rejects(f.finish("test", "team-123"), /did not confirm/);
});
