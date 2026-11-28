import assert from "node:assert/strict";
import test from "node:test";
import { attendanceHours, dateValue, profileProgress, progressDate } from "./profile-progress.ts";

const profile = {
  is_activated: true,
  deadline: "2027-01-08",
  cursus_begin_date: "2026-10-27",
  eta_end_of_cursus: "2028-04-28",
  probationary_period: false,
  milestones: [
    { level: 2, deadline: "2027-02-26", validated_at: null },
    { level: 0, deadline: "2026-11-20", validated_at: "2026-11-20" },
    { level: 1, deadline: "2027-01-08", validated_at: null },
  ],
};

test("matches the official elapsed days and milestone duration and sorts without mutating API data", () => {
  const data = profileProgress(profile, Date.parse("2026-11-26T15:00:00Z"));
  assert.equal(data.elapsed, 6);
  assert.equal(data.duration, 49);
  assert.deepEqual(
    data.segments.map((item) => item.level),
    [0, 1, 2],
  );
  assert.equal(data.segments[1].start, dateValue("2026-11-20"));
  assert.equal(profile.milestones[0].level, 2);
  assert.equal(progressDate(profile.eta_end_of_cursus), "28/04/2028");
});

test("completed and inactive profiles never get an invented deadline or ETA", () => {
  const now = Date.now();
  assert.equal(
    profileProgress({ ...profile, deadline: null, eta_end_of_cursus: null }, now),
    undefined,
  );
  assert.equal(profileProgress({ ...profile, is_activated: false }, now), undefined);
  assert.equal(profileProgress(null, now), undefined);
  assert.equal(profileProgress({ ...profile, cursus_begin_date: "invalid" }, now), undefined);
  assert.equal(profileProgress({ ...profile, deadline: null, milestones: [] }, now), undefined);
  assert.equal(profileProgress({ ...profile, eta_end_of_cursus: null }, now).eta, undefined);
});

test("rejects invalid calendar dates and parses the actual ISO attendance durations", () => {
  assert.equal(dateValue("2027-02-30"), undefined);
  assert.equal(dateValue(""), undefined);
  assert.equal(dateValue("2027-13-01"), undefined);
  assert.equal(progressDate(null), "-");
  assert.equal(attendanceHours("PT0S"), 0);
  assert.equal(attendanceHours("P0DT11H42M0.000000S"), 11.7);
  assert.equal(attendanceHours("P1DT2H30M"), 26.5);
  for (const value of ["P", "PT", "garbage", "-PT2H", "P2M"])
    assert.equal(attendanceHours(value), undefined);
});
