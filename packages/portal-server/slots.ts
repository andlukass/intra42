import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { type APIRequestContext, type BrowserContext, request } from "playwright";
import { parseMetaClusterMaps } from "./cluster-maps.ts";
import { isLocalPost, json } from "./http.ts";
import {
  parseProjectOverview,
  parseProjectStats,
  parseProjectTeams,
  parseRegistrationStats,
  projectFinishAction,
  projectUnregistration,
} from "./project-details.ts";
import {
  type ProjectStudentKind,
  parseProjectStudentLinks,
  parseProjectStudents,
} from "./project-students.ts";
import { parseProjectGraph, parseProjectGraphStates, parseProjectList } from "./projects.ts";
import { onSessionReload, setTimeout } from "./session-runtime.ts";
import { readSessionRecords, writeSessionRecords } from "./session-store.ts";

const portal = "https://profile.intra.42.fr";
const quarterHour = 15 * 60_000;
type Cookies = Awaited<ReturnType<BrowserContext["cookies"]>>;
type SlotSession = {
  cookies: Cookies;
  expiresAt: number;
  context: Promise<APIRequestContext>;
  writing: boolean;
  expires: ReturnType<typeof setTimeout>;
};
const sessions = new Map<string, SlotSession>();

function keyFor(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function expire(key: string, session: SlotSession) {
  void releaseSlotSession(key, session).catch(() =>
    console.error("Could not persist calendar-session expiry."),
  );
}

async function releaseSlotSession(key: string, session: SlotSession) {
  if (sessions.get(key) === session) {
    sessions.delete(key);
    await persist();
  }
  clearTimeout(session.expires);
  void session.context.then((context) => context.dispose()).catch(() => {});
}

async function installSlotSession(
  key: string,
  expiresIn: number,
  cookies: Cookies,
  restoring = false,
) {
  const previous = sessions.get(key);
  if (previous) await releaseSlotSession(key, previous);
  const entry: SlotSession = {
    cookies,
    expiresAt: Date.now() + expiresIn * 1000,
    context: request.newContext({
      baseURL: portal,
      storageState: { cookies, origins: [] },
      timeout: 10_000,
      extraHTTPHeaders: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
    }),
    writing: false,
    expires: setTimeout(() => expire(key, entry), expiresIn * 1000).unref(),
  };
  sessions.set(key, entry);
  if (!restoring) await persist();
  void entry.context.catch(() => expire(key, entry));
}

function persist() {
  return writeSessionRecords(
    "calendar",
    [...sessions].map(([key, entry]) => ({
      key,
      cookies: entry.cookies,
      expiresAt: entry.expiresAt,
    })),
  );
}
await onSessionReload(async () => {
  for (const entry of sessions.values()) {
    clearTimeout(entry.expires);
    await (await entry.context).dispose();
  }
  sessions.clear();
  for (const record of readSessionRecords("calendar")) {
    const entry = record as { key: string; cookies: Cookies; expiresAt: number };
    if (
      !entry ||
      !/^[a-f0-9]{64}$/.test(entry.key) ||
      !Array.isArray(entry.cookies) ||
      !Number.isFinite(entry.expiresAt) ||
      entry.expiresAt <= Date.now()
    )
      continue;
    await installSlotSession(entry.key, (entry.expiresAt - Date.now()) / 1000, entry.cookies, true);
  }
});
export async function retainSlotSession(token: string, expiresIn: number, cookies: Cookies) {
  await installSlotSession(keyFor(token), expiresIn, cookies);
}
async function saveCookies(key: string, session: SlotSession) {
  const { cookies } = await (await session.context).storageState();
  if (sessions.get(key) !== session) return;
  session.cookies = cookies;
  await persist();
}

export async function extendSlotSession(token: string, expiresIn: number) {
  const key = keyFor(token);
  const session = sessions.get(key);
  if (!session) return;
  clearTimeout(session.expires);
  session.expiresAt = Date.now() + expiresIn * 1000;
  session.expires = setTimeout(() => expire(key, session), expiresIn * 1_000).unref();
  await persist();
}

export async function revokeSlotSession(token: string) {
  const key = keyFor(token);
  const session = sessions.get(key);
  if (session) await releaseSlotSession(key, session);
}

function utcTime(value: string | null) {
  if (!value || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) return NaN;
  const time = Date.parse(value);
  return Number.isFinite(time) && new Date(time).toISOString() === value ? time : NaN;
}

function errorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  for (const field of ["message", "error", "errors", "data"] as const) {
    if (!(field in body)) continue;
    const value = (body as Record<string, unknown>)[field];
    if (typeof value === "string" && value.trim()) return value.slice(0, 250);
  }
  return fallback;
}

export async function managePortalSlots(
  req: IncomingMessage,
  res: ServerResponse,
  allowRequest = isLocalPost,
  calendar: (data: { slots: unknown[]; unavailable: unknown[] }) => unknown = (data) => data,
) {
  if (!allowRequest(req)) {
    json(res, 403, { error: "Local browser requests only." });
    return;
  }
  const auth = req.headers.authorization;
  const key = auth?.startsWith("Bearer ") ? keyFor(auth.slice(7)) : "";
  const session = sessions.get(key);
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/logout") {
    if (session) await releaseSlotSession(key, session);
    json(res, 200, { signedOut: true });
    return;
  }
  if (!session) {
    json(res, 401, { error: "Sign out and sign in again to start a 42 slots session." });
    return;
  }
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  const beginAt = utcTime(start);
  const endAt = utcTime(end);
  if (!start || !end || !Number.isFinite(beginAt) || !Number.isFinite(endAt) || beginAt >= endAt) {
    json(res, 400, { error: "Choose a valid start and end time." });
    return;
  }

  try {
    const context = await session.context;
    if (url.pathname === "/") {
      if (endAt - beginAt > 8 * 86_400_000) {
        json(res, 400, { error: "Select a single calendar week." });
        return;
      }
      const params = {
        start: new Date(beginAt - 2 * 3_600_000).toISOString(),
        end: new Date(endAt + 2 * 3_600_000).toISOString(),
      };
      const [own, blocked] = await Promise.all([
        context.get("/slots.json", { params, maxRedirects: 0 }),
        context.get("/slots/unavailable.json", { params, maxRedirects: 0 }),
      ]);
      if (!own.ok() || !blocked.ok()) {
        const status = !own.ok() ? own.status() : blocked.status();
        json(res, status >= 300 && status < 400 ? 401 : 502, {
          error:
            status >= 300 && status < 400
              ? "Your 42 slots session expired. Sign in again."
              : `42 could not load slots (HTTP ${status}).`,
        });
        return;
      }
      const [slots, unavailable] = await Promise.all([own.json(), blocked.json()]);
      if (!Array.isArray(slots) || !Array.isArray(unavailable?.data)) {
        json(res, 502, { error: "42 returned an unexpected calendar response." });
        return;
      }
      await saveCookies(key, session);
      json(res, 200, calendar({ slots, unavailable: unavailable.data }));
      return;
    }

    const cancel = url.pathname === "/cancel";
    if (url.pathname !== "/create" && !cancel) {
      json(res, 404, { error: "Unknown slots action." });
      return;
    }
    if (
      (cancel ? endAt : beginAt) <= Date.now() ||
      beginAt % quarterHour !== 0 ||
      endAt % quarterHour !== 0
    ) {
      json(res, 400, { error: "Choose a future slot in 15-minute increments." });
      return;
    }
    if (!cancel && endAt > Date.now() + 14 * 24 * 60 * 60 * 1000) {
      json(res, 400, {
        error:
          "Slots must end within 14 days from now, including the time. Choose an earlier start or a shorter duration.",
      });
      return;
    }
    if (session.writing) {
      json(res, 409, { error: "Another slot is being saved." });
      return;
    }

    session.writing = true;
    try {
      let cancelId = "";
      let cancelIds = "";
      if (cancel) {
        const ownResponse = await context.get("/slots.json", {
          // The calendar excludes boundary quarters when given the exact slot interval.
          params: {
            start: new Date(beginAt - 2 * 3_600_000).toISOString(),
            end: new Date(endAt + 2 * 3_600_000).toISOString(),
          },
          maxRedirects: 0,
        });
        if (!ownResponse.ok()) {
          json(res, 502, { error: "42 could not verify your slot. Refresh the calendar." });
          return;
        }
        const own: unknown = await ownResponse.json();
        const slot = Array.isArray(own)
          ? own.find(
              (item) =>
                item && Date.parse(item.start) === beginAt && Date.parse(item.end) === endAt,
            )
          : undefined;
        const classes = Array.isArray(slot?.className)
          ? slot.className
          : String(slot?.className ?? "").split(/\s+/);
        cancelId = String(slot?.id ?? "");
        cancelIds = Array.isArray(slot?.ids)
          ? slot.ids.join(",")
          : String(slot?.ids ?? slot?.id ?? "");
        if (
          !slot ||
          classes.includes("reserved") ||
          classes.includes("closed") ||
          !/^[1-9]\d*$/.test(cancelId) ||
          !/^[1-9]\d*(?:,[1-9]\d*)*$/.test(cancelIds) ||
          cancelIds.length > 4000
        ) {
          json(res, 409, {
            error: "This slot is no longer available to cancel. Refresh the calendar.",
          });
          return;
        }
      }
      const calendar = await context.get("/slots", {
        headers: { Accept: "text/html", "X-Requested-With": "" },
        maxRedirects: 0,
      });
      const csrfMeta = calendar.ok()
        ? (await calendar.text()).match(/<meta\b[^>]*\bname=["']csrf-token["'][^>]*>/i)?.[0]
        : undefined;
      const csrf = csrfMeta?.match(/\bcontent=["']([a-z0-9_+/=-]+)["']/i)?.[1];
      if (!csrf) {
        json(res, 401, { error: "Could not open the 42 slots session. Sign in again." });
        return;
      }
      const result = await context.post(cancel ? `/slots/${cancelId}.json` : "/slots.json", {
        headers: { "X-CSRF-Token": csrf, Referer: `${portal}/slots`, Origin: portal },
        form: cancel
          ? { ids: cancelIds, _method: "delete", confirm: "false" }
          : { "slot[begin_at]": start, "slot[end_at]": end },
        maxRedirects: 0,
      });
      const data: unknown = await result.json().catch(() => null);
      if (
        !result.ok() ||
        !data ||
        typeof data !== "object" ||
        !("status" in data) ||
        Number(data.status) !== 200
      ) {
        const status = result.status();
        json(res, status >= 300 && status < 400 ? 401 : 422, {
          error: errorMessage(data, `42 did not save the slot (HTTP ${status}).`),
        });
        return;
      }
      await saveCookies(key, session);
      json(res, 200, { saved: true });
    } finally {
      session.writing = false;
    }
  } catch {
    json(res, 502, { error: "42 did not respond. Refresh the calendar before retrying." });
  }
}

export async function manageSlots(req: IncomingMessage, res: ServerResponse) {
  return managePortalSlots(req, res);
}

export async function readPortalProjectList(token: string, params: URLSearchParams) {
  const session = sessions.get(keyFor(token));
  if (!session) throw new Error("Sign in again to load your official project list.");
  const context = await session.context;
  const response = await context.get(`https://projects.intra.42.fr/projects/list?${params}`, {
    headers: { Accept: "text/html", "X-Requested-With": "" },
    maxRedirects: 0,
  });
  if (!response.ok()) throw new Error("42 could not load your project list. Sign in again.");
  return parseProjectList(await response.text(), Number(params.get("page")) || 1);
}

export async function readPortalProjectGraphStates(
  token: string,
  login: string,
  campus: string,
  cursus = "21",
  layout = false,
) {
  const session = sessions.get(keyFor(token));
  if (!session) throw new Error("Sign in again to load your project states.");
  const context = await session.context;
  const params = new URLSearchParams({ cursus_id: cursus, campus_id: campus, login });
  const [response, page] = await Promise.all([
    context.get(`https://projects.intra.42.fr/project_data.json?${params}`, {
      headers: { Accept: "application/json" },
      maxRedirects: 0,
      timeout: 10000,
    }),
    context
      .get(`https://projects.intra.42.fr/projects/graph?${new URLSearchParams({ login })}`, {
        headers: { Accept: "text/html", "X-Requested-With": "" },
        maxRedirects: 0,
        timeout: 10000,
      })
      .then((page) => (page.ok() ? page.text() : ""))
      .catch(() => ""),
  ]);
  if (!response.ok()) throw new Error("42 could not load your project states.");
  const data = await response.json();
  return layout ? parseProjectGraph(data, cursus, page) : parseProjectGraphStates(data, page);
}

export async function readPortalClusterMaps(token: string, campusId: number) {
  const session = sessions.get(keyFor(token));
  if (!session) throw new Error("Sign in again to load official campus maps.");
  const context = await session.context;
  const response = await context.get(`https://meta.intra.42.fr/campus/${campusId}/clusters`, {
    headers: { Accept: "text/html", "X-Requested-With": "" },
    maxRedirects: 0,
  });
  if (!response.ok())
    throw new Error(`42 Meta could not load campus maps (HTTP ${response.status()}).`);
  const maps = parseMetaClusterMaps(await response.text(), campusId);
  await saveCookies(keyFor(token), session);
  return maps;
}

export async function readPortalProjectDetails(
  token: string,
  slug: string,
  personal = false,
  enrollmentId?: number,
) {
  if (enrollmentId !== undefined && (!Number.isSafeInteger(enrollmentId) || enrollmentId <= 0))
    throw new Error("Invalid project registration.");
  const session = sessions.get(keyFor(token));
  if (!session) throw new Error("Sign in again to load the official project page.");
  const context = await session.context;
  let personalPage = personal;
  const publicPage = `https://projects.intra.42.fr/projects/${encodeURIComponent(slug)}`;
  let response = await context.get(
    enrollmentId
      ? `${publicPage}/projects_users/${enrollmentId}`
      : `https://projects.intra.42.fr/${personal ? "" : "projects/"}${encodeURIComponent(slug)}${personal ? "/mine" : ""}`,
    {
      headers: { Accept: "text/html", "X-Requested-With": "" },
      maxRedirects: 0,
    },
  );
  if (personal && [302, 303].includes(response.status())) {
    const location = response.headers().location;
    if (location && new URL(location, publicPage).href === publicPage) {
      response = await context.get(publicPage, {
        headers: { Accept: "text/html", "X-Requested-With": "" },
        maxRedirects: 0,
      });
      personalPage = false;
    }
  }
  if (!response.ok()) throw new Error(`42 could not load the project (HTTP ${response.status()}).`);
  const html = await response.text();
  const overview = parseProjectOverview(html);
  if (personalPage)
    return {
      ...overview,
      teams: parseProjectTeams(html),
      statistics: null,
      statisticsError: null,
      registrations: [],
      studentLists: [],
      registrationsError: null,
    };
  const [charts, registration] = await Promise.allSettled([
    (async () => {
      const result = await context.get(
        `https://projects.intra.42.fr/projects/${encodeURIComponent(slug)}/stats.json`,
        { maxRedirects: 0 },
      );
      if (!result.ok()) throw new Error("42 could not load project charts.");
      return parseProjectStats(await result.json());
    })(),
    (async () => {
      if (!overview.projectId || !overview.sessionId)
        return { registrations: [], studentLists: [] };
      const params = new URLSearchParams({
        project_id: String(overview.projectId),
        project_session_id: String(overview.sessionId),
      });
      const result = await context.get(
        `https://projects.intra.42.fr/projects/${overview.projectId}/registration_stats?${params}`,
        { headers: { Accept: "text/html" }, maxRedirects: 0 },
      );
      if (!result.ok()) throw new Error("42 could not load registration statistics.");
      const html = await result.text();
      return {
        registrations: parseRegistrationStats(html),
        studentLists: parseProjectStudentLinks(html),
      };
    })(),
  ]);
  return {
    ...overview,
    statistics: charts.status === "fulfilled" ? charts.value : null,
    statisticsError: charts.status === "rejected" ? "42 could not load project charts." : null,
    registrations: registration.status === "fulfilled" ? registration.value.registrations : [],
    studentLists: registration.status === "fulfilled" ? registration.value.studentLists : [],
    registrationsError:
      registration.status === "rejected" ? "42 could not load registration statistics." : null,
  };
}

export async function readPortalProjectStudents(
  token: string,
  slug: string,
  kind: ProjectStudentKind,
  page: number,
) {
  if (
    !/^[a-z0-9_-]{1,100}$/i.test(slug) ||
    !["without_team", "can_register"].includes(kind) ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 1000
  )
    throw new Error("Invalid project student list.");
  const session = sessions.get(keyFor(token));
  if (!session) throw new Error("Sign in again to load project students.");
  const context = await session.context;
  const response = await context.get(
    `https://projects.intra.42.fr/projects/${encodeURIComponent(slug)}/all_users/${kind}?page=${page}`,
    {
      headers: { Accept: "text/html", "X-Requested-With": "" },
      maxRedirects: 0,
    },
  );
  if (!response.ok())
    throw new Error(`42 could not load project students (HTTP ${response.status()}).`);
  return parseProjectStudents(await response.text(), page);
}

export async function readPortalAttachment(token: string, source: string) {
  const url = new URL(source);
  if (url.origin !== "https://cdn.intra.42.fr" || url.username || url.password)
    throw new Error("Unsupported project attachment URL.");
  const session = sessions.get(keyFor(token));
  if (!session) throw new Error("Sign in again to download project attachments.");
  const context = await session.context;
  const response = await context.get(url.href, {
    headers: { Accept: "*/*", Referer: "https://projects.intra.42.fr/", "X-Requested-With": "" },
    maxRedirects: 0,
  });
  if (!response.ok())
    throw new Error(`42 could not download the attachment (HTTP ${response.status()}).`);
  return {
    body: await response.body(),
    contentType: response.headers()["content-type"] ?? "application/octet-stream",
  };
}

export async function unregisterPortalProject(token: string, slug: string) {
  if (!/^[a-z0-9_-]+$/i.test(slug)) throw new Error("Invalid project.");
  const session = sessions.get(keyFor(token));
  if (!session) throw new Error("Sign in again to manage your project.");
  const context = await session.context;
  const page = `https://projects.intra.42.fr/${encodeURIComponent(slug)}/mine`;
  const current = await context.get(page, {
    headers: { Accept: "text/html", "X-Requested-With": "" },
    maxRedirects: 0,
  });
  if (!current.ok()) throw new Error("42 could not load your project registration.");
  const action = projectUnregistration(await current.text());
  if (!action || action.slug !== slug)
    throw new Error("42 does not allow unregistering from this project.");
  if (!action.csrf) throw new Error("Your project session expired. Sign in again.");
  const result = await context.post(`https://projects.intra.42.fr${action.path}`, {
    headers: {
      Accept: "text/html",
      "X-Requested-With": "",
      "X-CSRF-Token": action.csrf,
      Origin: "https://projects.intra.42.fr",
      Referer: page,
    },
    form: { _method: "delete", authenticity_token: action.csrf },
    maxRedirects: 0,
  });
  if (![200, 302, 303].includes(result.status()))
    throw new Error("42 could not unregister you from this project.");
  const overview = await context.get(
    `https://projects.intra.42.fr/projects/${encodeURIComponent(slug)}`,
    { headers: { Accept: "text/html", "X-Requested-With": "" }, maxRedirects: 0 },
  );
  if (!overview.ok()) throw new Error("Could not verify your registration. Refresh the project.");
  const updated = parseProjectOverview(await overview.text());
  if (updated.personalSlug || updated.unregisterSlug || updated.status === "subscribed")
    throw new Error("42 did not confirm unregistration. Refresh the project.");
  await saveCookies(keyFor(token), session);
  return { unregistered: true };
}

export async function finishPortalProject(token: string, slug: string, teamId: string) {
  if (!/^[a-z0-9_-]+$/i.test(slug) || !/^team-[1-9]\d*$/.test(teamId))
    throw new Error("Invalid project team.");
  const session = sessions.get(keyFor(token));
  if (!session) throw new Error("Sign in again to manage your project.");
  const context = await session.context;
  const page = `https://projects.intra.42.fr/${encodeURIComponent(slug)}/mine`;
  const options = { headers: { Accept: "text/html", "X-Requested-With": "" }, maxRedirects: 0 };
  const current = await context.get(page, options);
  if (!current.ok()) throw new Error("42 could not load your project team.");
  const action = projectFinishAction(await current.text(), teamId);
  if (!action || (action.slug && action.slug !== slug))
    throw new Error("42 does not allow finishing this project team.");
  if (!action.csrf) throw new Error("Your project session expired. Sign in again.");
  const result = await context.post(`https://projects.intra.42.fr${action.path}`, {
    headers: {
      ...options.headers,
      "X-CSRF-Token": action.csrf,
      Origin: "https://projects.intra.42.fr",
      Referer: page,
    },
    form: {
      authenticity_token: action.csrf,
      ...(action.method === "post" ? {} : { _method: action.method }),
    },
    maxRedirects: 0,
  });
  if (![200, 302, 303].includes(result.status()))
    throw new Error("42 could not finish this project.");
  const updated = await context.get(page, options);
  if (!updated.ok())
    throw new Error("Could not verify the delivery. Refresh the project before trying again.");
  const team = parseProjectTeams(await updated.text()).find((team) => team.id === teamId);
  if (!team || team.canFinish || (!team.closed && !team.mark))
    throw new Error("42 did not confirm the delivery. Refresh the project before trying again.");
  await saveCookies(keyFor(token), session);
  return { finished: true };
}
