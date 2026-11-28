import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";
import { load } from "cheerio";

const source = stripTypeScriptTypes(readFileSync(new URL("./projects.ts", import.meta.url), "utf8"))
  .replace(/^import .*;\n/gm, "")
  .replace("export function", "function");
const api = {};
runInNewContext(`${source}\napi.parse = parseProjectList;`, { api, load, URL });
const html = `<div id="projects-list-container"><ul><li class="project-item" data-difficulty="0" data-registration="finished">
<div class="project-name" data-result="(failed with 0%)">C Piscine / <a href="/projects/c-piscine-rush-02">Rush &amp; review</a></div>
<div class="project-duration">about 4 hours</div><div class="project-recomendation"><span>Forbidden</span></div>
<div class="project-registration-container"><span class="project-registration">finished</span><span class="project-registration">finished</span></div>
</li></ul><ul class="pagination"><li><a href="?page=2">Next</a></li></ul></div>`;

test("official catalog preserves duration, zero XP and marks, personalized recommendation and registration", () => {
  const result = api.parse(html, 1);
  const project = result.items[0];
  assert.equal(project.slug, "c-piscine-rush-02");
  assert.equal(project.name, "Rush & review");
  assert.equal(project.parent, "C Piscine");
  assert.equal(project.duration, "about 4 hours");
  assert.equal(project.xp, 0);
  assert.equal(project.recommendation, "Forbidden");
  assert.equal(project.registration, "finished");
  assert.equal(project.result, "(failed with 0%)");
  assert.equal(project.resultSuccess, false);
  assert.equal(result.hasMore, true);
  assert.equal(api.parse(html, 2).hasMore, false);
});

test("empty official results remain empty while authentication pages and unsafe project links fail", () => {
  assert.equal(api.parse('<div id="projects-list-container"></div>', 1).items.length, 0);
  assert.throws(() => api.parse("<form>Sign in</form>", 1), /did not load/);
  assert.throws(
    () => api.parse(html.replace("/projects/c-piscine-rush-02", "https://evil.test/project"), 1),
    /invalid project link/,
  );
});
