import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { test } from "node:test";

const base = "http://127.0.0.1:8791";
async function request(path, { token, form, data, headers } = {}) {
  const response = await fetch(base + path, {
    method: form || data ? "POST" : "GET",
    headers: {
      ...(token && { Authorization: `Bearer ${token}` }),
      ...(form && { "Content-Type": "application/x-www-form-urlencoded" }),
      ...(data && { "Content-Type": "application/json" }),
      ...headers,
    },
    body: form ? new URLSearchParams(form) : data ? JSON.stringify(data) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const body = response.headers.get("content-type")?.includes("json")
    ? await response.json()
    : await response.text();
  return { status: response.status, body };
}

test("review login, fictional graph, dated events, and transactional slots", async () => {
  assert.equal((await request("/health")).body.service, "intra42-review");
  assert.equal((await request("/api/me")).status, 401);
  const state = randomBytes(32).toString("hex");
  const verifier = randomBytes(32).toString("hex");
  const challenge = createHash("sha256").update(verifier).digest("hex");
  const started = await request("/session/start", { form: { state, challenge } });
  assert.equal(started.status, 200);
  const path = started.body.path;
  const transaction = new URL(base + path).searchParams.get("transaction");
  const page = await request(path);
  const csrf =
    /name="csrf-token" content="([a-f0-9]{64})"/.exec(page.body)?.[1] ??
    /name="csrf" value="([a-f0-9]{64})"/.exec(page.body)?.[1] ??
    /data-csrf="([a-f0-9]{64})"/.exec(page.body)?.[1];
  assert.ok(csrf);
  const headers = { Origin: base, "x-intra42-csrf": csrf };
  const username = process.env.REVIEW_USERNAME;
  const password = process.env.REVIEW_PASSWORD;
  assert.equal(
    (await request(path, { form: { username, password }, headers: { Origin: base } })).status,
    403,
  );
  assert.equal(
    (await request(path, { form: { username, password: "incorrect" }, headers })).status,
    401,
  );
  const signedIn = await request(path, { form: { username, password }, headers });
  assert.equal(signedIn.status, 200);
  const callback = new URL(signedIn.body.redirect);
  assert.equal(callback.searchParams.get("state"), state);
  const proof = { transaction, state, verifier, code: callback.searchParams.get("code") };
  const exchange = await request("/session/exchange", { form: proof });
  assert.equal(exchange.status, 200);
  const token = exchange.body.accessToken;
  assert.equal((await request("/session/exchange", { form: proof })).status, 400);
  const restored = await request("/session/restore", { token, data: {} });
  assert.equal(restored.status, 200);
  assert.deepEqual(restored.body, exchange.body);
  const api = (path, data) => request(`/api${path}`, { token, data });
  const profile = (await api("/me")).body;
  assert.equal(profile.login, username.toLowerCase());
  const projects = (await api("/me/project-list")).body.items;
  const graph = (await api("/holy-graph")).body;
  assert.deepEqual(
    graph.nodes.map(({ slug }) => slug),
    projects.map(({ slug }) => slug),
  );
  assert.ok(graph.edges.length > 0);
  assert.equal((await api(`/projects/${projects[0].slug}/overview`)).body.name, projects[0].name);

  const search = (await api("/search?query=alice")).body;
  assert.equal(search.users[0].login, "acourvai");
  const photo = await request(
    `/search-photo?${new URLSearchParams({ source: search.users[0].cdn_uri })}`,
    { token },
  );
  assert.equal(photo.status, 200);
  assert.match(photo.body.uri, /^data:image\/jpeg;base64,/);
  const peer = (await api("/users/by-login/acourvai")).body;
  assert.equal(peer.displayname, "Alice Courvaix");
  assert.equal((await api(`/users/${peer.id}`)).body.login, peer.login);
  const full = await request(`/avatar?userId=${peer.id}&size=full`, { token });
  assert.equal(full.status, 200);
  assert.ok(full.body.uri.length > photo.body.uri.length);
  const completedSets = await Promise.all(
    Array.from({ length: 10 }, async (_, index) => {
      const id = index + 2;
      const [{ body: student }, { body: marks }] = await Promise.all([
        api(`/users/${id}`),
        api(`/users/${id}/marks?cursus_id=21`),
      ]);
      assert.ok(student.projects_users.length > 0);
      assert.ok(
        student.projects_users.every((entry) => entry.marked && entry.status === "finished"),
      );
      const slugs = student.projects_users.map(({ project }) => project.slug).sort();
      assert.deepEqual(marks.map(({ project_slug }) => project_slug).sort(), slugs);
      return slugs.join(",");
    }),
  );
  assert.equal(new Set(completedSets).size, 10);

  const feedback = (await api(`/users/${profile.id}/scale_teams/as_corrector`)).body;
  assert.equal(feedback.length, 2);
  assert.equal(feedback[0].correcteds[0].login, peer.login);
  assert.equal((await api(`/scale_teams/${feedback[0].id}`)).body.team.project_id, projects[0].id);
  assert.equal(
    (await api(`/users/${peer.id}/scale_teams/as_corrector`)).body[0].correcteds[0].login,
    profile.login,
  );

  const rangeForLogtime = new URLSearchParams({
    "range[begin_at]": `${new Date(Date.now() - 14 * 86_400_000).toISOString()},${new Date().toISOString()}`,
  });
  const locations = (await api(`/users/${profile.id}/locations?${rangeForLogtime}`)).body;
  assert.ok(locations.length > 0);
  assert.ok(
    locations.every(
      ({ begin_at, end_at }) =>
        Date.parse(begin_at) < Date.parse(end_at) && Date.parse(end_at) <= Date.now(),
    ),
  );

  const peerLogtimePath = `/users/${peer.id}/locations?${rangeForLogtime}`;
  const peerLocations = (await api(peerLogtimePath)).body;
  assert.ok(peerLocations.length > 0);
  assert.notDeepEqual(peerLocations, locations);
  await api(`/users/by-login/${peer.login}`);
  assert.deepEqual((await api(peerLogtimePath)).body, peerLocations);

  const peerHistory = (await api(`/users/${peer.id}/correction_point_historics`)).body;
  assert.equal(peerHistory[0].total, peer.correction_point);
  const defense = peerHistory.find(({ scale_team_id }) => scale_team_id === feedback[0].id);
  assert.equal(defense.sum, -1);
  const ownHistory = (await api(`/users/${profile.id}/correction_point_historics`)).body;
  assert.equal(
    ownHistory.find(({ scale_team_id }) => scale_team_id === defense.scale_team_id).sum,
    1,
  );
  const quests = (await api(`/users/${peer.id}/quests_users`)).body;
  assert.deepEqual(
    quests.map(({ quest }) => quest.name).sort(),
    peer.projects_users.map(({ project }) => project.name).sort(),
  );

  const events = (await api("/me/events")).body;
  assert.equal(events.length, 7);
  assert.ok(events.every(({ begin_at }) => Date.parse(begin_at) > Date.now()));
  const event = events.find(({ is_subscribed }) => !is_subscribed);
  assert.ok(event);
  const eventPath = `/events/${event.id}/subscription`;
  try {
    assert.equal((await api(eventPath, { action: "subscribe" })).status, 200);
    const subscribed = (await api("/me/events")).body.find(({ id }) => id === event.id);
    assert.equal(subscribed.is_subscribed, true);
    assert.equal(subscribed.nbr_subscribers, event.nbr_subscribers + 1);
    assert.equal(subscribed.begin_at, event.begin_at);
  } finally {
    await api(eventPath, { action: "unsubscribe" });
  }

  const begin = Math.ceil((Date.now() + 8 * 86_400_000) / 900000) * 900000;
  const iso = (ms) => new Date(ms).toISOString();
  const slot = { user_id: profile.id, begin_at: iso(begin), end_at: iso(begin + 1800000) };
  const range = new URLSearchParams({
    "range[begin_at]": `${iso(begin - 3600000)},${iso(begin + 3600000)}`,
  });
  const week = `/me/slots?${range}`;
  try {
    const open = await Promise.all([api("/slots", { slot }), api("/slots", { slot })]);
    assert.ok(open.every(({ status }) => status === 200));
    assert.equal(open[0].body.id, open[1].body.id);
    assert.equal(
      (
        await api("/slots", {
          slot: { ...slot, begin_at: iso(begin + 900000), end_at: iso(begin + 2700000) },
        })
      ).status,
      409,
    );
    assert.equal((await api(week)).body.filter(({ id }) => id === open[0].body.id).length, 1);
    assert.equal((await api("/slots/cancel", { slot })).status, 200);
    assert.equal(
      (await api(week)).body.some(({ id }) => id === open[0].body.id),
      false,
    );
  } finally {
    await api("/slots/cancel", { slot });
    await request("/session/logout", { token, data: {} });
  }
  assert.equal((await api("/me")).status, 401);
});
