import assert from "node:assert/strict";
import test from "node:test";
import { parseProjectStudentLinks, parseProjectStudents } from "./project-students.ts";

test("official team links retain only the two supported lists", () => {
  assert.deepEqual(
    parseProjectStudentLinks(
      `<p><a href="/projects/42cursus-minishell/all_users/without_team">Students looking for a team</a></p><a href="/projects/42cursus-minishell/all_users/can_register">Students who can subscribe and never did</a><a href="https://evil.example/projects/x/all_users/can_register">bad</a>`,
    ).map((x) => x.kind),
    ["without_team", "can_register"],
  );
});
test("students include safe photos, presence, closed status, count and server pagination", () => {
  const html = `<div>55 users can register to minishell</div><a class="student-item" data-tooltip-login="student-a" href="https://profile.intra.42.fr/users/student-a"><div class="student-image" style="background-image: url(https://cdn.intra.42.fr/users/hash/student-a.jpg)"></div><span class="student-location">●</span></a><div class="student-wrapper closed"><a class="student-item" data-tooltip-login="student-b" href="https://profile.intra.42.fr/users/student-b"><div class="student-image" style="background-image: url(https://evil.example/photo.jpg)"></div><span class="student-no-location">●</span></a></div><ul class="pagination"><li><a rel="next" href="/projects/42cursus-minishell/all_users/can_register?page=2">Next</a></li></ul>`;
  const result = parseProjectStudents(html, 1);
  assert.equal(result.total, 55);
  assert.equal(result.hasMore, true);
  assert.deepEqual(result.users, [
    {
      login: "student-a",
      cdn_uri: "https://cdn.intra.42.fr/users/hash/student-a.jpg",
      available: true,
      closed: false,
    },
    { login: "student-b", available: false, closed: true },
  ]);
  assert.equal(parseProjectStudents(html, 2).hasMore, false);
});
test("empty official lists remain valid but login pages and invalid profile links do not", () => {
  assert.deepEqual(
    parseProjectStudents("<div>0 users without a team registered to minishell</div>", 1),
    { users: [], total: 0, page: 1, hasMore: false },
  );
  assert.throws(() => parseProjectStudents("<form>Sign in</form>", 1), /did not load/);
  assert.equal(
    parseProjectStudents(
      '<div>1 users can register to minishell</div><a class="student-item" data-tooltip-login="student-a" href="https://evil.example/users/student-a">x</a>',
      1,
    ).users.length,
    0,
  );
});
