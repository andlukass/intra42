import assert from "node:assert/strict";
import test from "node:test";
import { parseProjectList as parse, parseProjectGraphStates } from "./projects.ts";

test("graph states use the project ID rather than the graph node ID", () => {
  const states = ["done", "in_progress", "available", "unavailable", "not_recommended", "fail"];
  assert.deepEqual(
    parseProjectGraphStates([
      ...states.map((state, index) => ({ id: index + 1, project_id: index + 100, state })),
      { id: 20, state: "done" },
      null,
    ]),
    states.map((state, index) => ({ id: index + 100, state })),
  );
  assert.throws(() => parseProjectGraphStates({ error: "Sign in" }), /invalid project graph data/);
});

test("graph states use the selected curriculum and keep completed alternate versions", () => {
  const data = [
    { project_id: 1471, slug: "42cursus-push_swap", state: "unavailable" },
    { project_id: 2687, slug: "42next-push_swap", state: "available" },
    { project_id: 1320, slug: "exam-rank-02", state: "done" },
    { project_id: 2708, slug: "42next-exam-rank-02", state: "unavailable" },
  ];
  const classic = parseProjectGraphStates(data);
  const next = parseProjectGraphStates(
    data,
    '<canvas class="graph-canvas" data-quest="42next"></canvas>',
  );
  assert.deepEqual(classic[0], { id: 1471, state: "unavailable" });
  assert.deepEqual(next[0], { id: 1471, state: "available" });
  assert.deepEqual(next[2], { id: 1320, state: "done" });
});
const html = `<div id="projects-list-container"><ul><li class="project-item" data-difficulty="0" data-registration="finished">
<div class="project-name" data-result="(failed with 0%)">C Piscine / <a href="/projects/c-piscine-rush-02">Rush &amp; review</a></div>
<div class="project-duration">about 4 hours</div><div class="project-recomendation"><span>Forbidden</span></div>
<div class="project-registration-container"><span class="project-registration">finished</span><span class="project-registration">finished</span></div>
</li></ul><ul class="pagination"><li><a href="?page=2">Next</a></li></ul></div>`;

test("official catalog preserves duration, zero XP and marks, personalized recommendation and registration", () => {
  const result = parse(html, 1);
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
  assert.equal(parse(html, 2).hasMore, false);
});

test("empty official results remain empty while authentication pages and unsafe project links fail", () => {
  assert.equal(parse('<div id="projects-list-container"></div>', 1).items.length, 0);
  assert.throws(() => parse("<form>Sign in</form>", 1), /did not load/);
  assert.throws(
    () => parse(html.replace("/projects/c-piscine-rush-02", "https://evil.test/project"), 1),
    /invalid project link/,
  );
});

test("graph layouts retain official coordinates and only valid nodes and links", async () => {
  const { parseProjectGraph } = await import("./projects.ts");
  const data = parseProjectGraph([
    { id: 1, project_id: 10, name: "Shell 00", slug: "shell-00", x: 20, y: 30, by: [] },
    { id: 2, project_id: 11, name: "Shell 01", slug: "shell-01", x: 50, y: 60, by: [1] },
    { project_id: 12, name: "Invalid", slug: "../bad", x: 0, y: 0 },
  ]);
  assert.equal(data.nodes.length, 2);
  assert.equal(data.nodes[1].id, 11);
  assert.deepEqual(data.edges, [[20, 30, 50, 60]]);
  assert.throws(() => parseProjectGraph({}), /invalid/);
});

test("the graph builds the chosen core and retains the campus connections to its outer ring", async () => {
  const { parseProjectGraph } = await import("./projects.ts");
  const projects = [
    { project_id: 1314, name: "Libft", slug: "42cursus-libft", x: 0, y: 0, state: "done" },
    {
      project_id: 1471,
      name: "push_swap",
      slug: "42cursus-push_swap",
      x: 2900,
      y: 2800,
      state: "unavailable",
    },
    {
      project_id: 2687,
      name: "push_swap",
      slug: "42next-push_swap",
      x: 0,
      y: 0,
      state: "available",
    },
    { project_id: 2690, name: "Python Module 00", slug: "python-module-00", x: 0, y: 0 },
    { project_id: 1341, name: "CPP Module 03", slug: "cpp-module-03", x: 3000, y: 3100 },
    {
      project_id: 1322,
      name: "Exam Rank 04",
      slug: "exam-rank-04",
      x: 0,
      y: 0,
      description: "  Exam instructions.  ",
      duration: "about 0 days",
      state: "done",
    },
    {
      project_id: 2710,
      name: "Exam Rank 04",
      slug: "42next-exam-rank-04",
      x: 0,
      y: 0,
      state: "unavailable",
    },
    {
      project_id: 999,
      name: "Outer",
      slug: "outer",
      x: 4200,
      y: 3000,
      by: [
        {
          points: [
            [4200, 3000],
            [3800, 3000],
          ],
        },
      ],
    },
  ];
  const graph = (variant) =>
    parseProjectGraph(
      projects,
      "21",
      `<canvas class="graph-canvas" data-quest="${variant}"></canvas>`,
    );
  const classic = graph("default");
  const next = graph("42next");
  assert.deepEqual(classic.nodes.map((node) => node.id).sort(), [1314, 1322, 1341, 1471, 999]);
  assert.deepEqual(next.nodes.map((node) => node.id).sort(), [1314, 1322, 2687, 2690, 999]);
  const exam = next.nodes.find((node) => node.id === 1322);
  assert.equal(exam.description, "Exam instructions.");
  assert.equal(exam.duration, "about 0 days");
  const push = next.nodes.find((node) => node.id === 2687);
  assert.ok(Math.abs(Math.hypot(push.x - 3000, push.y - 3000) - 1000 / 6) < 0.001);
  assert.deepEqual(next.nodes.find((node) => node.id === 1314).x, 3000);
  assert.deepEqual(next.edges, [[4200, 3000, 4000, 3000]]);
  assert.equal(next.rings.length, 6);
  assert.throws(() => parseProjectGraph(projects, "21", "<form>Login</form>"), /variant/);
});
