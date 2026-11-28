import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { markAge, markAttempts } from "./marks.ts";

test("marks expand attempts in descending occurrence order without changing the response", () => {
  const project = {
    project_name: "Libft",
    project_slug: "42cursus-libft",
    teams: [{ occurrence: 0 }, { occurrence: 3 }, { occurrence: 1 }],
    children: [{ occurrence: 5, project_name: "Child", project_slug: "child" }],
  };
  assert.deepEqual(
    markAttempts(project).map((item) => item.occurrence),
    [3, 1, 0],
  );
  assert.equal(markAttempts(project)[0].project_name, "Libft");
  assert.deepEqual(
    project.teams.map((item) => item.occurrence),
    [0, 3, 1],
  );
  assert.equal(markAttempts({ ...project, teams: [{ occurrence: 0 }] })[0].project_slug, "child");
  assert.deepEqual(markAttempts({ ...project, teams: [], children: [] }), []);
});
test("mark dates support official timestamps without a timezone and missing dates", () => {
  const now = Date.parse("2026-11-27T10:00:00Z");
  assert.equal(markAge("2026-11-20T20:45:16.776687", now), "7 days ago");
  assert.equal(markAge("2026-08-31T12:32:32.459648", now), "3 months ago");
  assert.equal(markAge("invalid", now), "");
});

test("mark dates render on Hermes without Intl.RelativeTimeFormat", () => {
  const source = stripTypeScriptTypes(
    readFileSync(new URL("./marks.ts", import.meta.url), "utf8"),
  ).replaceAll("export ", "");
  const format = runInNewContext(`${source}\nmarkAge`, { Intl: {} });
  assert.equal(format("2026-11-20T20:45:16Z", Date.parse("2026-11-27T10:00:00Z")), "7 days ago");
});

test("mark attempts keep the correct registration for parent teams and child projects", () => {
  const project = {
    projects_user_id: 123,
    project_name: "Parent",
    project_slug: "parent",
    teams: [{ occurrence: 0 }, { occurrence: 1 }],
    children: [{ projects_user_id: 456, project_slug: "child", occurrence: 0 }],
  };
  assert.ok(markAttempts(project).every((attempt) => attempt.projects_user_id === 123));
  assert.equal(markAttempts({ ...project, teams: [] })[0].projects_user_id, 456);
});
