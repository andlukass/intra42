import assert from "node:assert/strict";
import test from "node:test";
import { achievementLevelName, groupAchievements } from "./groups.ts";

const attendee = (id, count, tier = "none") => ({
  id,
  name: "Attendee",
  kind: "scolarity",
  description: `Attended ${count} events.`,
  nbr_of_success: count,
  tier,
});
const catalog = [
  attendee(54, 1),
  attendee(55, 3),
  attendee(56, 10, "easy"),
  attendee(57, 21, "medium"),
  attendee(58, 42, "hard"),
];
const entry = (achievement, earnedAt = "2026-10-21") => ({ achievement, earnedAt });

test("summarizes the highest earned level and expands earlier levels in official threshold order", () => {
  const entries = [entry(catalog[2]), entry(catalog[0], "2026-11-20"), entry(catalog[1])];
  const before = JSON.stringify(entries);
  const [group] = groupAchievements(entries, catalog);
  assert.equal(group.summary.achievement.id, 56);
  assert.equal(achievementLevelName(group.summary), "Attendee 3");
  assert.deepEqual(
    group.levels.map((item) => item.level),
    [1, 2, 3],
  );
  assert.deepEqual(
    group.levels.map((item) => item.achievement.id),
    [54, 55, 56],
  );
  assert.equal(group.levels[0].earnedAt, "2026-11-20");
  assert.equal(JSON.stringify(entries), before);
});

test("unearned groups retain their real level numbers without including earned levels", () => {
  const [group] = groupAchievements(
    catalog.slice(3).map((achievement) => ({ achievement })),
    catalog,
    "unearned",
  );
  assert.deepEqual(
    group.levels.map((item) => item.level),
    [4, 5],
  );
  assert.equal(achievementLevelName(group.summary), "Attendee 4");
  assert.ok(group.levels.every((item) => item.earnedAt === undefined));
});

test("keeps static awards and different categories separate and never rewrites existing numbered names", () => {
  const staticAward = {
    id: 1,
    name: "Ducking Duck Rank 6",
    description: "Rank 6",
    nbr_of_success: 1,
  };
  const duplicates = [
    { id: 2, name: "Same name", description: "A" },
    { id: 3, name: "Same name", description: "B" },
  ];
  const groups = groupAchievements([
    entry(staticAward),
    ...duplicates.map((item) => entry(item)),
    entry(attendee(54, 1)),
    entry({ ...attendee(99, 3), kind: "social" }),
  ]);
  assert.equal(groups.length, 5);
  assert.equal(achievementLevelName(groups[0].summary), "Ducking Duck Rank 6");
});

test("deduplicates records and preserves list ordering and available earned levels without a campus catalog", () => {
  const entries = [
    entry(catalog[3]),
    entry({ id: 1, name: "Welcome", description: "Welcome" }),
    entry(catalog[0]),
    entry(catalog[3]),
  ];
  const groups = groupAchievements(entries);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].summary.achievement.id, 57);
  assert.equal(groups[0].levels.length, 2);
  assert.equal(groups[1].summary.achievement.name, "Welcome");
});
