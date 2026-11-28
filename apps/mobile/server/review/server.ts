import { execFile } from "node:child_process";
import { createHash, randomBytes, randomInt } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createServer, type IncomingMessage } from "node:http";
import { promisify } from "node:util";
import { json } from "@intra42/portal-server/http";
import type { CompletedEvaluation, EvaluationPoint, Profile, Slot } from "../../src/api.js";
import type { MarkedProject } from "../../src/home/marks.js";
import type { OfficialProjectOverview } from "../../src/projects/overview.js";
import type { Token } from "../../src/session-token.js";
import { createBrowserLogin } from "../browser-login.ts";
import { reviewAgenda, timeZone } from "./agenda.ts";
import { fillReviewLogtime, readReviewLogtime } from "./logtime.ts";
import { catalog, type ReviewFixtures, type ReviewProject, seedCatalog } from "./seed.ts";
import { db } from "./store.ts";

const { REVIEW_USERNAME, REVIEW_PASSWORD, PORT = "8791" } = process.env;
if (!REVIEW_USERNAME || !REVIEW_PASSWORD)
  throw new Error("Configure the local review credentials.");
const userId = 1;
const campus = { id: 38, name: "Lisboa", time_zone: timeZone };
const slotsDoc = db.doc("review/slots");
function sessionDoc(key: string) {
  return db.collection("reviewSessions").doc(createHash("sha256").update(key).digest("hex"));
}
const nativeRequest = (req: IncomingMessage) =>
  !req.headers.origin && !req.headers["sec-fetch-site"] && req.socket.remoteAddress === "127.0.0.1";
const discard = async (key: string) => {
  await sessionDoc(key).delete();
};
const signIn = createBrowserLogin(
  nativeRequest,
  async () => {
    throw new Error("Review uses local authentication.");
  },
  discard,
  async (body) => {
    if (
      body.get("username")?.trim() !== REVIEW_USERNAME ||
      body.get("password") !== REVIEW_PASSWORD
    )
      return null;
    await Promise.all([reviewAgenda(), fillReviewLogtime(userId)]);
    const accessToken = `portal_${randomBytes(32).toString("hex")}`;
    const token = { accessToken, expiresAt: Date.now() + 86_400_000 };
    await sessionDoc(accessToken).create({ expiresAt: token.expiresAt });
    return token;
  },
);

class RequestError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function readBody(req: IncomingMessage) {
  if (req.headers["content-type"]?.split(";")[0] !== "application/json")
    throw new RequestError(415, "Use JSON for this request.");
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 8192) throw new RequestError(413, "Request too large.");
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    throw new RequestError(400, "Invalid JSON.");
  }
  if (!body || typeof body !== "object" || Array.isArray(body))
    throw new RequestError(400, "Invalid request.");
  return body as Record<string, unknown>;
}

async function changeSlot(req: IncomingMessage, cancel: boolean) {
  const { slot } = await readBody(req);
  if (!slot || typeof slot !== "object" || !("user_id" in slot) || slot.user_id !== userId)
    throw new RequestError(403, "You can only manage your own slots.");
  const begin =
    "begin_at" in slot && typeof slot.begin_at === "string" ? Date.parse(slot.begin_at) : NaN;
  const end = "end_at" in slot && typeof slot.end_at === "string" ? Date.parse(slot.end_at) : NaN;
  const duration = (end - begin) / 60000;
  const now = Date.now();
  if (
    !Number.isFinite(begin) ||
    !Number.isFinite(end) ||
    end <= now ||
    (!cancel &&
      (begin <= now ||
        end > now + 14 * 86_400_000 ||
        begin % 900_000 !== 0 ||
        duration % 15 !== 0 ||
        duration < 30 ||
        duration > 480))
  )
    throw new RequestError(
      400,
      "Choose a future interval of 30 minutes to 8 hours within the next 14 days.",
    );

  const begin_at = new Date(begin).toISOString();
  const end_at = new Date(end).toISOString();
  return db.runTransaction(async (transaction) => {
    const saved = ((await transaction.get(slotsDoc)).get("items") ?? []) as Slot[];
    if (cancel) {
      const next = saved.filter((item) => item.begin_at !== begin_at || item.end_at !== end_at);
      if (next.length !== saved.length) transaction.set(slotsDoc, { items: next });
      return { saved: true };
    }
    const existing = saved.find((item) => item.begin_at === begin_at && item.end_at === end_at);
    if (existing) return existing;
    if (saved.some((item) => Date.parse(item.begin_at) < end && Date.parse(item.end_at) > begin))
      throw new RequestError(409, "This interval overlaps an existing slot.");
    const recent = saved.filter((item) => Date.parse(item.end_at) > now - 30 * 86_400_000);
    if (recent.length >= 500) throw new RequestError(409, "Review slot limit reached.");
    let id = randomInt(1, 2 ** 40);
    while (recent.some((item) => item.id === id)) id = randomInt(1, 2 ** 40);
    const created = { id, begin_at, end_at, scale_team_id: null };
    transaction.set(slotsDoc, { items: [...recent, created] });
    return created;
  });
}

function toProject(project: ReviewProject) {
  const { id, name, slug, xp, hours, state, description } = project;
  return {
    id,
    name,
    slug,
    difficulty: xp,
    xp,
    duration: `${hours} hours`,
    recommendation:
      state === "available"
        ? "Recommended"
        : state === "unavailable"
          ? "Forbidden"
          : "Not recommended",
    registration:
      state === "done" ? "finished" : state === "in_progress" ? "In progress" : "Not registered",
    ...(state === "done" ? { result: "100%", resultSuccess: true } : {}),
    project_sessions: [
      {
        id,
        campus_id: campus.id,
        cursus_id: 21,
        solo: true,
        description,
        estimate_time: `${hours} hours`,
      },
    ],
  };
}

const emptyLists =
  /^\/(?:me\/evaluations|achievements_users|blocs|campus\/38\/(?:achievements|locations)|users\/\d+\/(?:coalitions|scale_teams))$/;

const portraitBucket = process.env.REVIEW_PORTRAITS_BUCKET;
const run = promisify(execFile);
const photos = new Map<string, Promise<string>>();

function portraitSource(login: string) {
  return `review-portrait-v1:${login}`;
}

async function portrait(login: string, size: "small" | "full") {
  const file = `${size}/${login}.jpg`;
  let pending = photos.get(file);
  if (!pending) {
    const local = new URL(`./portraits/${file}`, import.meta.url);
    const bytes = portraitBucket
      ? run("gcloud", ["storage", "cat", `gs://${portraitBucket}/review-portraits-v1/${file}`], {
          encoding: "buffer",
          timeout: 8000,
          maxBuffer: 1024 * 1024,
        })
          .then(({ stdout }) => stdout)
          .catch(() => readFile(local))
      : readFile(local);
    pending = bytes.then((value) => `data:image/jpeg;base64,${value.toString("base64")}`);
    photos.set(file, pending);
  }
  try {
    return await pending;
  } catch (error) {
    photos.delete(file);
    throw error;
  }
}

async function readApi(path: string, query: URLSearchParams) {
  if (path === "/me/events") return reviewAgenda();
  if (path === "/me/slots") {
    const [begin, end] = (query.get("range[begin_at]") ?? "").split(",").map(Date.parse);
    if (!Number.isFinite(begin) || !Number.isFinite(end) || end <= begin)
      throw new RequestError(400, "Choose a valid calendar week.");
    const slots = ((await slotsDoc.get()).get("items") ?? []) as Slot[];
    return slots
      .filter((slot) => Date.parse(slot.begin_at) < end && Date.parse(slot.end_at) > begin)
      .sort((a, b) => a.begin_at.localeCompare(b.begin_at));
  }
  if (emptyLists.test(path)) return [];
  if (/^\/users\/\d+\/(?:alumnization|pace|attendance)$/.test(path)) return null;
  if (path === "/campus") return [campus];
  const { projects, students, evaluations } = (await catalog.get()).data() as ReviewFixtures & {
    projects: ReviewProject[];
  };
  const login = REVIEW_USERNAME?.toLowerCase() ?? "test";
  const people = [
    { id: userId, login, displayname: "Test Student", level: 3.7, location: undefined },
    ...students,
  ];
  const locations = /^\/users\/(\d+)\/locations$/.exec(path);
  if (locations && people.some(({ id }) => id === Number(locations[1])))
    return readReviewLogtime(Number(locations[1]), query);
  function pointHistory(id: number): EvaluationPoint[] {
    let total = 5;
    return evaluations
      .filter((entry) => entry.student === id || entry.evaluator === id)
      .map((entry) => {
        const earns = entry.evaluator === id;
        return {
          id: entry.id * 2 + Number(earns),
          scale_team_id: entry.id,
          reason: earns ? "Earning after defense" : "Defense planification",
          sum: earns ? 1 : -1,
          created_at: new Date(
            Date.parse(entry.begin_at) + (earns ? 30 : -60) * 60_000,
          ).toISOString(),
        };
      })
      .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id - b.id)
      .map((entry) => {
        total += entry.sum;
        return { ...entry, total };
      })
      .reverse();
  }

  const history = /^\/users\/(\d+)\/correction_point_historics$/.exec(path);
  if (history) return pointHistory(Number(history[1]));
  const quests = /^\/users\/(\d+)\/quests_users$/.exec(path);
  if (quests) {
    const id = Number(quests[1]);
    return evaluations
      .filter((entry) => entry.student === id)
      .sort((a, b) => b.begin_at.localeCompare(a.begin_at))
      .flatMap((entry) => {
        const project = projects.find(({ id }) => id === entry.project);
        if (!project) return [];
        return [
          {
            id: entry.id,
            validated_at: entry.begin_at,
            end_at: null,
            quest: { name: project.name, description: `Pass the evaluation for ${project.name}.` },
          },
        ];
      });
  }
  const marks = /^\/users\/(\d+)\/marks$/.exec(path);
  if (marks) {
    const student = students.find(({ id }) => id === Number(marks[1]));
    if (!student || ![null, "21"].includes(query.get("cursus_id"))) return [];
    return projects
      .filter(({ id }) => student.completedProjectIds.includes(id))
      .map(
        ({ id, name, slug }) =>
          ({
            projects_user_id: id,
            project_name: name,
            project_slug: slug,
            occurrence: 1,
            final_mark:
              evaluations.find((entry) => entry.student === student.id && entry.project === id)
                ?.mark ?? 100,
            is_validated: true,
            last_event_date:
              evaluations.find((entry) => entry.student === student.id && entry.project === id)
                ?.begin_at ?? student.completedAt,
            teams: [],
            children: [],
          }) satisfies MarkedProject,
      );
  }
  const person = people.find(
    ({ id, login }) =>
      path === `/users/${id}` ||
      path === `/users/by-login/${encodeURIComponent(login)}` ||
      (id === userId && path === "/me"),
  );
  if (person) {
    if (person.id !== userId) await fillReviewLogtime(person.id);
    const peer = students.find(({ id }) => id === person.id);
    return {
      ...person,
      ...(person.id !== userId
        ? {
            image: {
              link: `${portraitSource(person.login)}:full`,
              versions: { small: portraitSource(person.login) },
            },
          }
        : {}),
      email: `${person.login}@example.test`,
      wallet: 240,
      correction_point: pointHistory(person.id)[0]?.total ?? 5,
      campus: [campus],
      cursus_users: [
        {
          level: person.level,
          grade: "Cadet",
          cursus: { id: 21, name: "42cursus", slug: "42cursus" },
        },
      ],
      projects_users: projects
        .filter(({ id, state }) =>
          peer
            ? peer.completedProjectIds.includes(id)
            : state === "done" || state === "in_progress",
        )
        .map(({ id, name, slug, state }) => {
          const marked = !!peer || state === "done";
          const finalMark =
            evaluations.find((entry) => entry.student === person.id && entry.project === id)
              ?.mark ?? 100;
          return {
            id,
            status: marked ? "finished" : state,
            marked,
            ...(marked ? { "validated?": true, final_mark: finalMark } : {}),
            project: { id, name, slug },
          };
        }),
    } satisfies Profile;
  }
  if (path === "/search") {
    const search = (query.get("query") ?? "").toLowerCase();
    return {
      users: people
        .filter(
          ({ login, displayname }) =>
            login.includes(search) || displayname.toLowerCase().includes(search),
        )
        .map(({ login, id }) => ({
          login,
          ...(id !== userId ? { cdn_uri: portraitSource(login) } : {}),
        })),
      projects: projects.filter(({ name }) => name.toLowerCase().includes(search)).map(toProject),
    };
  }
  const corrector = /^\/users\/(\d+)\/scale_teams\/as_corrector$/.exec(path);
  const detail = /^\/scale_teams\/(\d+)$/.exec(path);
  if (corrector || detail) {
    const matches = evaluations
      .filter((entry) =>
        corrector ? entry.evaluator === Number(corrector[1]) : entry.id === Number(detail?.[1]),
      )
      .sort((a, b) => b.begin_at.localeCompare(a.begin_at))
      .flatMap((entry) => {
        const evaluator = people.find(({ id }) => id === entry.evaluator);
        const student = people.find(({ id }) => id === entry.student);
        const project = projects.find(({ id }) => id === entry.project);
        if (!evaluator || !student || !project) return [];
        const participant = { id: student.id, login: student.login, leader: true };
        return [
          {
            id: entry.id,
            begin_at: entry.begin_at,
            filled_at: new Date(Date.parse(entry.begin_at) + 30 * 60_000).toISOString(),
            scale: { name: project.name },
            flag: { name: "ok", positive: true },
            corrector: { id: evaluator.id, login: evaluator.login },
            correcteds: [participant],
            team: {
              name: `${student.login}'s group`,
              project_id: project.id,
              users: [participant],
            },
            final_mark: entry.mark,
            comment: entry.comment,
            feedbacks: [{ id: entry.id, comment: entry.feedback, rating: entry.rating }],
          } satisfies CompletedEvaluation,
        ];
      });
    if (corrector) return Number(query.get("page[number]") ?? "1") === 1 ? matches : [];
    if (matches[0]) return matches[0];
    throw new RequestError(404, "Evaluation not found.");
  }
  if (path === "/holy-graph") {
    return {
      variant: "default",
      rings: [153, 287].map((radius) => ({ x: 360, y: 360, radius, state: "" })),
      nodes: projects.map(({ id, name, slug, x, y, description, hours }) => ({
        id,
        name,
        slug,
        x,
        y,
        description,
        kind: "project",
        duration: `${hours} hours`,
      })),
      states: projects.map(({ id, state }) => ({ id, state })),
      edges: projects.flatMap(({ x, y, prerequisites }) =>
        projects
          .filter(({ id }) => (prerequisites as readonly number[]).includes(id))
          .map((parent) => [parent.x, parent.y, x, y]),
      ),
    };
  }
  if (path === "/me/project-list") {
    const search = (query.get("search") ?? "").toLowerCase();
    const items = projects
      .filter(
        ({ name, state }) =>
          name.toLowerCase().includes(search) &&
          (!query.has("recommended") || state === "available"),
      )
      .map(toProject);
    switch (query.get("sort")) {
      case "name":
        items.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "xp":
        items.sort((a, b) => b.xp - a.xp);
        break;
      case "duration":
        items.sort((a, b) => parseInt(a.duration, 10) - parseInt(b.duration, 10));
        break;
      case "recommendation":
        items.sort(
          (a, b) =>
            Number(b.recommendation === "Recommended") - Number(a.recommendation === "Recommended"),
        );
        break;
      case "registration":
        items.sort((a, b) => a.registration.localeCompare(b.registration));
        break;
      case "recent":
        items.reverse();
        break;
    }
    return {
      items: query.has("cursus") && query.get("cursus") !== "42cursus" ? [] : items,
      hasMore: false,
    };
  }
  const match = /^\/projects\/([a-z0-9-]+)(?:\/(overview|personal|registrations\/\d+))?$/.exec(
    path,
  );
  const project =
    match && projects.find(({ slug, id }) => slug === match[1] || String(id) === match[1]);
  if (project) {
    const details = toProject(project);
    if (!match[2]) return details;
    return {
      name: project.name,
      status: details.registration,
      metadata: `${details.duration} · ${details.xp} XP`,
      description: project.description,
      keywords: ["Programming"],
      skills: ["Problem solving"],
      requirements: projects
        .filter(({ id }) => (project.prerequisites as readonly number[]).includes(id))
        .map(({ name }) => name),
      attachments: [],
      registrations: [],
      registrationsError: null,
      statistics: null,
      statisticsError: null,
    } satisfies OfficialProjectOverview;
  }
  throw new RequestError(404, "This resource is unavailable in the review environment.");
}

await seedCatalog();

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${PORT}`);
    const path = url.pathname;
    if (req.method === "GET" && path === "/health")
      return json(res, 200, { service: "intra42-review" });
    if (await signIn(req, res, url)) return;
    if (!nativeRequest(req)) throw new RequestError(403, "Native app requests only.");
    const key = req.headers.authorization?.slice(7) ?? "";
    const expiresAt =
      req.headers.authorization?.startsWith("Bearer ") && /^portal_[a-f0-9]{64}$/.test(key)
        ? (await sessionDoc(key).get()).get("expiresAt")
        : undefined;
    if (typeof expiresAt !== "number" || expiresAt <= Date.now())
      throw new RequestError(401, "Sign in to the review account.");
    const session: Token = { accessToken: key, expiresAt };
    if (req.method === "POST" && path === "/session/restore") return json(res, 200, session);
    if (req.method === "POST" && path === "/session/logout") {
      await discard(key);
      return json(res, 200, { signedOut: true });
    }
    if (req.method === "GET" && (path === "/avatar" || path === "/search-photo")) {
      const students = (await catalog.get()).get("students") as ReviewFixtures["students"];
      const source = url.searchParams.get("source");
      const size = path === "/avatar" ? url.searchParams.get("size") : "small";
      const student = students.find(({ id, login }) =>
        path === "/avatar"
          ? String(id) === url.searchParams.get("userId")
          : source === portraitSource(login),
      );
      if (!student || (size !== "small" && size !== "full"))
        throw new RequestError(404, "Photo not found.");
      const uri = await portrait(student.login, size);
      return json(
        res,
        200,
        path === "/avatar" ? { uri, userId: student.id, size } : { uri, source },
      );
    }
    if (req.method === "GET" && path.startsWith("/api/"))
      return json(res, 200, await readApi(path.slice(4), url.searchParams));
    if (req.method === "POST" && ["/api/slots", "/api/slots/cancel"].includes(path))
      return json(res, 200, await changeSlot(req, path.endsWith("/cancel")));
    const registration = /^\/api\/events\/(\d+)\/subscription$/.exec(path);
    if (req.method === "POST" && registration) {
      const { action } = await readBody(req);
      if (action !== "subscribe" && action !== "unsubscribe")
        throw new RequestError(400, "Invalid event action.");
      const items = await reviewAgenda({ id: Number(registration[1]), name: action });
      if (!items) throw new RequestError(409, "This event can no longer be changed.");
      return json(res, 200, { saved: true });
    }
    throw new RequestError(404, "This action is unavailable in the review environment.");
  } catch (error) {
    if (res.headersSent) return;
    if (error instanceof RequestError) return json(res, error.status, { error: error.message });
    console.error("Review request failed", error);
    json(res, 503, { error: "The review data service is unavailable." });
  }
}).listen(Number(PORT), "127.0.0.1", () => console.log(`Review service listening on ${PORT}`));
