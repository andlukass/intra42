import assert from "node:assert/strict";
import test from "node:test";
import {
  parseProjectOverview,
  parseProjectStats,
  parseRegistrationStats,
} from "./project-details.ts";

const html = `<div id="project-show"><div class="project-header"><h3>Ftl_quantum</h3></div><div class="project-summary"><div class="project-status-box" data-status="forbidden">forbidden</div><div class="project-summary-item">Solo – about 98 hours – 6500 XP</div><div class="project-summary-item"><div class="project-attachments-list"><a href="https://cdn.intra.42.fr/pdf/pdf/211194/en.subject.pdf">subject.pdf</a><a href="https://evil.example/test.pdf">unsafe</a><a href="https://cdn.intra.42.fr/project/resources.zip">resources.zip</a></div></div><div class="project-summary-item"><span class="text-danger">You must have validated common-core</span></div><div class="project-summary-item"><form>Register<input value="secret"></form></div></div><div><h4>Description</h4><p>Learn quantum programming.</p></div><div><h4>Keywords</h4><p class="skill-list">General<br>Quantum programming<br></p></div><div><h4>Skills</h4><p class="skill-list">Rigor<br>Algorithms &amp; AI</p></div><div id="projects_registrations_stats" project_id="2225" project_session_id="8351"></div></div>`;
test("official overview includes real permission, metadata, safe attachments, requirements, keywords and skills", () => {
  const data = parseProjectOverview(html);
  assert.equal(data.status, "forbidden");
  assert.equal(data.metadata, "Solo – about 98 hours – 6500 XP");
  assert.deepEqual(data.keywords, ["General", "Quantum programming"]);
  assert.deepEqual(data.skills, ["Rigor", "Algorithms & AI"]);
  assert.deepEqual(data.requirements, ["You must have validated common-core"]);
  assert.equal(data.attachments.length, 2);
  assert.equal(data.attachments[1].name, "resources.zip");
  assert.equal(data.projectId, 2225);
  assert.ok(!JSON.stringify(data).includes("secret"));
  assert.throws(() => parseProjectOverview("<form>Sign in</form>"), /did not load/);
});
test("registration counters preserve official numbers without duplicate nested paragraphs", () => {
  assert.deepEqual(
    parseRegistrationStats(
      '<p>146 attempts by 134 distinct students ever</p><p><span>Finished 52 times (12 retries)</span><p>92 students currently doing this project (0 retries)</p></p><p>2 teams waiting for evaluation</p><p><a href="/projects/test/all_users/can_register">Students who can subscribe and never did</a></p>',
    ),
    [
      "146 attempts by 134 distinct students ever",
      "Finished 52 times (12 retries)",
      "92 students currently doing this project (0 retries)",
      "2 teams waiting for evaluation",
    ],
  );
});
test("chart values retain official counts, fractional percentages and flags, rejecting malformed numbers", () => {
  const input = {
    success: { true: 45, false: 22, none: 198 },
    average_team_lifespan: { true: 49, false: 111 },
    final_mark_by_campus: [
      {
        name: "Paris",
        data: [
          [100, 33.3333],
          [120, 66.6667],
        ],
      },
    ],
    flags: [{ name: "Ok", y: 99 }],
  };
  assert.equal(parseProjectStats(input).success.true, 45);
  assert.equal(parseProjectStats(input).average_team_lifespan.none, 0);
  assert.equal(parseProjectStats(input).final_mark_by_campus[0].data[0][1], 33.3333);
  assert.throws(() => parseProjectStats({ ...input, success: { true: "45" } }));
  assert.throws(() => parseProjectStats({ ...input, flags: [{ name: "Ok", y: -1 }] }));
});

test("summary preserves XP notes, individual delivery links and personal page action without coloring them as restrictions", () => {
  const data = parseProjectOverview(
    html.replace(
      '<div class="project-summary-item"><form>',
      `<div class="project-summary-item"><span class="icon-business-chart-2">Awarded XP depends on duration.</span></div><div class="project-summary-item"><div class="project-list-item"><a href="/contract-upload/mine">Contract Upload</a></div><div class="project-list-item"><a href="/duration/mine">Duration</a></div></div><div class="project-summary-item"><a href="/work-experience-i/mine"><button>See my project page</button></a></div><div class="project-summary-item"><a data-method="delete" href="/projects/test/projects_users/123">Unregister</a></div><div class="project-summary-item"><form>`,
    ),
  );
  assert.deepEqual(data.notes, ["Awarded XP depends on duration."]);
  assert.deepEqual(data.steps, [
    { name: "Contract Upload", slug: "contract-upload" },
    { name: "Duration", slug: "duration" },
  ]);
  assert.equal(data.personalSlug, "work-experience-i");
  assert.deepEqual(data.requirements, ["You must have validated common-core"]);
});

test("personal teams retain active progress and completed evaluations without leaking forms", async () => {
  const { parseProjectTeams } = await import("./project-details.ts");
  const teams = parseProjectTeams(`<div id="teams-accordion">
    <div class="team-item"><span class="team-name">Active group</span><span class="team-mark"><small class="team-status-dot text-success" title="locked?">●</small><small class="team-status-dot" title="closed?">●</small></span><div class="team-lock-and-close">This team was locked 7 days ago</div><span data-clipboard-text="git@host:repo"></span><form><input value="secret"></form></div>
    <div class="team-item"><span class="team-name">Completed group</span><span class="team-mark"><small class="text-success">125%</small></span><div class="correction-item"><div class="corrected-header">Evaluated by <a data-tooltip-login="reviewer">reviewer</a><span data-long-date="date">28 May 2023</span><b class="pull-right text-success">125%</b></div><div class="correction-comment-item">Great work</div><div class="correction-comment-item">Thanks<div class="correction-comment-body"><span class="feedback-item" title="Interested">4 / 4</span></div></div></div></div>
  </div>`);
  assert.equal(teams[0].mark, "");
  assert.deepEqual(
    teams[0].progress.map((p) => p.complete),
    [true, false],
  );
  assert.equal(teams[0].repository, "git@host:repo");
  assert.equal(teams[1].mark, "125%");
  assert.equal(teams[1].evaluations[0].login, "reviewer");
  assert.equal(teams[1].evaluations[0].feedback, "Thanks");
  assert.deepEqual(teams[1].evaluations[0].ratings, [{ label: "Interested", value: "4 / 4" }]);
  assert.ok(!JSON.stringify(teams).includes("secret"));
});

test("Unregister availability follows the official delete action and never exposes its CSRF token", async () => {
  const { projectUnregistration } = await import("./project-details.ts");
  const source = `<meta name="csrf-token" content="private-csrf">${html.replace('<div class="project-summary-item"><form>', '<div class="project-summary-item"><a data-method="delete" href="/projects/ftl_quantum/projects_users/123">Unregister</a></div><div class="project-summary-item"><form>')}`;
  assert.equal(parseProjectOverview(source).unregisterSlug, "ftl_quantum");
  assert.ok(!JSON.stringify(parseProjectOverview(source)).includes("private-csrf"));
  assert.equal(projectUnregistration(source).path, "/projects/ftl_quantum/projects_users/123");
  assert.equal(
    projectUnregistration(
      source.replace(
        'href="/projects/ftl_quantum/projects_users/123"',
        'href="https://evil.example/delete"',
      ),
    ),
    null,
  );
  assert.equal(parseProjectOverview(html).unregisterSlug, null);
});

test("finish availability follows the official team action and rejects disabled, foreign and mismatched targets", async () => {
  const { projectFinishAction, parseProjectTeams } = await import("./project-details.ts");
  const html = `<meta name="csrf-token" content="private-csrf"><div id="teams-accordion"><div class="team-item"><span class="team-name">My team</span><div class="team-content" id="team-123"><div class="team-actions"><a data-method="put" href="/projects/test/teams/123/close">Set the project as finished</a></div></div></div></div>`;
  const action = projectFinishAction(html, "team-123");
  assert.equal(action.path, "/projects/test/teams/123/close");
  assert.equal(action.method, "put");
  assert.equal(parseProjectTeams(html)[0].canFinish, true);
  assert.ok(!JSON.stringify(parseProjectTeams(html)).includes("private-csrf"));
  for (const changed of [
    html.replace('data-method="put"', 'data-method="delete"'),
    html.replace('data-method="put"', 'disabled data-method="put"'),
    html.replace("/projects/test/teams/123/close", "https://evil.example/teams/123/close"),
    html.replace("/teams/123/close", "/teams/456/close"),
  ])
    assert.equal(projectFinishAction(changed, "team-123"), null);
  assert.equal(projectFinishAction(html, "team-456"), null);
});

test("negative campus grades from the official Libft statistics do not discard all charts", () => {
  const stats = {
    success: { true: 2, false: 1 },
    average_team_lifespan: { none: 12, true: 10, false: 14 },
    final_mark_by_campus: [
      {
        name: "Porto",
        data: [
          [-40, 0.09587727708533077],
          [0, 33],
          [100, 66],
        ],
      },
    ],
    flags: [{ name: "Ok", y: 71756 }],
  };
  const parsed = parseProjectStats(stats);
  assert.deepEqual(parsed.final_mark_by_campus[0].data[0], [-40, 0.09587727708533077]);
  assert.equal(parsed.success.true, 2);
  assert.equal(parsed.flags[0].y, 71756);
  for (const point of [
    [NaN, 1],
    [Infinity, 1],
    ["-40", 1],
    [-40, -1],
    [-40, Infinity],
  ]) {
    assert.throws(() =>
      parseProjectStats({ ...stats, final_mark_by_campus: [{ name: "Porto", data: [point] }] }),
    );
  }
  assert.throws(() => parseProjectStats({ ...stats, success: { true: -1 } }));
});
