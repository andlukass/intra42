import { randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { json } from "@intra42/portal-server/http";
import { createLoginHandler, type PortalLogin } from "@intra42/portal-server/login";
import { forget, refreshSession } from "@intra42/portal-server/refresh";
import { readSessionRecords, writeSessionRecords } from "@intra42/portal-server/session-store";
import {
  finishPortalProject,
  managePortalSlots,
  readPortalAttachment,
  readPortalClusterMaps,
  readPortalProjectDetails,
  readPortalProjectList,
  readPortalProjectStudents,
  revokeSlotSession,
  unregisterPortalProject,
} from "@intra42/portal-server/slots";
import { createBrowserLogin } from "./browser-login.ts";
import { changeEvent, readEvents } from "./events.ts";

type Session = PortalLogin & {
  userId: number;
  expiresAt: number;
  deadline: number;
  savingTitle?: boolean;
  savingEvent?: boolean;
  savingProject?: boolean;
};
const sessions = new Map<string, Session>();
for (const record of readSessionRecords("native")) {
  const entry = record as Session & { key: string };
  if (
    !entry ||
    !/^portal_[a-f0-9]{64}$/.test(entry.key) ||
    typeof entry.access_token !== "string" ||
    !entry.access_token ||
    !Number.isSafeInteger(entry.userId) ||
    entry.userId <= 0 ||
    !Number.isFinite(entry.expiresAt) ||
    !Number.isFinite(entry.deadline) ||
    entry.deadline <= Date.now() ||
    !Number.isFinite(entry.expires_in) ||
    (entry.refresh_session !== undefined && typeof entry.refresh_session !== "string")
  )
    continue;
  sessions.set(entry.key, entry);
}
function persist() {
  return writeSessionRecords(
    "native",
    [...sessions].map(([key, entry]) => ({
      key,
      access_token: entry.access_token,
      expires_in: entry.expires_in,
      refresh_session: entry.refresh_session,
      userId: entry.userId,
      expiresAt: entry.expiresAt,
      deadline: entry.deadline,
    })),
  );
}

function nativeRequest(req: IncomingMessage) {
  return (
    !req.headers.origin &&
    !req.headers["sec-fetch-site"] &&
    ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress ?? "")
  );
}
async function remove(key: string) {
  const session = sessions.get(key);
  sessions.delete(key);
  await persist();
  if (session?.refresh_session) await forget(session.refresh_session);
  else if (session) await revokeSlotSession(session.access_token);
}
function keyFor(req: IncomingMessage) {
  const auth = req.headers.authorization ?? "";
  return auth.startsWith("Bearer portal_") ? auth.slice(7) : "";
}
function find(key: string) {
  const session = sessions.get(key);
  if (session && session.deadline <= Date.now()) {
    void remove(key).catch(() => console.error("Could not persist native-session expiry."));
    return undefined;
  }
  return session;
}
export function portalIdentity(req: IncomingMessage) {
  const session = find(keyFor(req));
  return session && session.expiresAt > Date.now() ? { id: session.userId } : undefined;
}
function clientToken(key: string, session: Session) {
  return {
    accessToken: key,
    refreshToken: session.refresh_session ? key : undefined,
    expiresAt: session.expiresAt,
  };
}

async function createSession(token: PortalLogin, signal: AbortSignal) {
  try {
    const response = await fetch("https://intrapy.intra.42.fr/api/v1/users/me", {
      headers: { Authorization: `Bearer ${token.access_token}` },
      redirect: "error",
      signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]),
    });
    if (!response.ok) throw new Error("Could not verify your 42 identity.");
    const profile = await response.json();
    if (!Number.isSafeInteger(profile.id) || profile.id <= 0) throw new Error("Invalid profile.");
    for (const [key, session] of sessions) {
      if (session.deadline <= Date.now()) await remove(key);
    }
    if (sessions.size >= 1000) throw new Error("Too many sessions.");
    signal.throwIfAborted();
    const key = `portal_${randomBytes(32).toString("hex")}`;
    const session = {
      access_token: token.access_token,
      expires_in: token.expires_in,
      refresh_session: token.refresh_session,
      userId: profile.id,
      expiresAt: Date.now() + token.expires_in * 1000,
      deadline: Date.now() + (token.refresh_session ? 86_400_000 : token.expires_in * 1000),
    };
    sessions.set(key, session);
    await persist();
    return clientToken(key, session);
  } catch (error) {
    if (token.refresh_session) await forget(token.refresh_session);
    else await revokeSlotSession(token.access_token);
    throw error;
  }
}
const login = createLoginHandler(nativeRequest, createSession);
const browserLogin = createBrowserLogin(nativeRequest, createSession, remove);

async function saveTitle(req: IncomingMessage, res: ServerResponse, session: Session) {
  if (req.headers["content-type"]?.split(";")[0] !== "application/json") {
    json(res, 415, { error: "Use a JSON title request." });
    return;
  }
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 8192) {
      json(res, 413, { error: "Request too large." });
      return;
    }
  }
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    json(res, 400, { error: "Invalid title request." });
    return;
  }
  const titleId = body && typeof body === "object" && "titleId" in body ? body.titleId : undefined;
  if (typeof titleId !== "number" || !Number.isSafeInteger(titleId) || titleId < 0) {
    json(res, 400, { error: "Choose an available title." });
    return;
  }
  if (session.savingTitle) {
    json(res, 409, { error: "Another title is being saved." });
    return;
  }
  session.savingTitle = true;
  try {
    const headers = {
      Authorization: `Bearer ${session.access_token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    };
    const profileResponse = await fetch("https://intrapy.intra.42.fr/api/v1/users/me", {
      headers,
      redirect: "error",
      signal: AbortSignal.timeout(8000),
    });
    if (!profileResponse.ok) {
      json(res, profileResponse.status, { error: "42 could not load your available titles." });
      return;
    }
    const profile = await profileResponse.json();
    if (profile.id !== session.userId || !Array.isArray(profile.titles)) {
      json(res, 502, { error: "42 returned an invalid title list." });
      return;
    }
    const title = profile.titles.find((item: { title_id?: unknown }) => item?.title_id === titleId);
    if (
      titleId !== 0 &&
      (!Number.isSafeInteger(title?.title_user_id) || title.title_user_id <= 0)
    ) {
      json(res, 403, { error: "You can only select one of your own titles." });
      return;
    }
    const response = await fetch(
      `https://profile.intra.42.fr/titles_users/${titleId === 0 ? "unselected" : `${title.title_user_id}/selected`}`,
      {
        method: titleId === 0 ? "POST" : "GET",
        headers,
        redirect: "error",
        signal: AbortSignal.timeout(10000),
      },
    );
    await response.body?.cancel();
    if (!response.ok) {
      json(res, response.status, {
        error: `42 did not save your title (HTTP ${response.status}).`,
      });
      return;
    }
    const confirmation = await fetch("https://intrapy.intra.42.fr/api/v1/users/me", {
      headers,
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const confirmed = confirmation.ok ? await confirmation.json() : undefined;
    if (
      confirmed?.id !== session.userId ||
      !Array.isArray(confirmed.titles) ||
      (confirmed.titles.find((item: { selected?: boolean }) => item.selected)?.title_id ?? 0) !==
        titleId
    ) {
      json(res, 502, { error: "42 did not confirm your title change. Refresh and try again." });
      return;
    }
    json(res, 200, { titleId });
  } catch {
    json(res, 502, { error: "42 did not respond. Refresh your profile before trying again." });
  } finally {
    session.savingTitle = false;
  }
}

// Only resources used by the native screens are exposed with the public app grant.
function apiPath(url: URL, userId: number) {
  const login = /^\/api\/users\/by-login\/([a-z0-9][a-z0-9_-]{0,31})$/.exec(url.pathname);
  if (login) return url.search ? undefined : `/users/${login[1]}`;
  const path = url.pathname.slice("/api".length).replace(/^\/me(?=\/|$)/, `/users/${userId}`);
  if (
    !/^\/(?:users\/[1-9]\d*(?:\/(?:coalitions|locations|quests_users|correction_point_historics|scale_teams(?:\/as_corrector)?))?|scale_teams\/[1-9]\d*|projects(?:\/[a-z0-9_-]+)?|projects_users\/[1-9]\d*|cursus\/[1-9]\d*\/projects|campus(?:\/[1-9]\d*\/(?:locations|events|achievements))?|achievements|achievements_users|blocs|clusters)$/.test(
      path,
    )
  )
    return;
  const privateUser = /^\/users\/([1-9]\d*)\/scale_teams$/.exec(path);
  if (privateUser && Number(privateUser[1]) !== userId) return;
  const allowed = new Set([
    "page[size]",
    "page[number]",
    "sort",
    "range[begin_at]",
    "filter[visible]",
    "filter[rewarded]",
    "filter[user_id]",
    "filter[campus_id]",
    "filter[active]",
    "filter[future]",
    "filter[filled]",
    "search[name]",
  ]);
  if ([...url.searchParams.keys()].some((key) => !allowed.has(key))) return;
  return path + url.search;
}

export async function handlePortal(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  applicationToken: () => Promise<string>,
) {
  if (await browserLogin(req, res, url)) return true;
  if (!url.pathname.startsWith("/session/") && !url.pathname.startsWith("/api/")) return false;
  if (!nativeRequest(req)) {
    json(res, 403, { error: "Native app requests only." });
    return true;
  }
  if (req.method === "POST" && url.pathname === "/session/login") {
    await login(req, res);
    return true;
  }
  const key = keyFor(req);
  const session = find(key);
  if (!session) {
    json(res, 401, { error: "Your 42 session expired. Sign in again." });
    return true;
  }
  if (req.method === "POST" && url.pathname === "/session/restore") {
    json(res, 200, clientToken(key, session));
    return true;
  }
  if (req.method === "POST" && url.pathname === "/session/logout") {
    await remove(key);
    json(res, 200, { signedOut: true });
    return true;
  }
  if (req.method === "POST" && url.pathname === "/session/refresh") {
    const renewed = session.refresh_session ? await refreshSession(session.refresh_session) : null;
    if (!renewed || sessions.get(key) !== session) {
      await remove(key);
      json(res, 401, { error: "Your 42 session expired. Sign in again." });
    } else {
      Object.assign(session, renewed, { expiresAt: Date.now() + renewed.expires_in * 1000 });
      await persist();
      json(res, 200, clientToken(key, session));
    }
    return true;
  }
  if (session.expiresAt <= Date.now()) {
    json(res, 401, { error: "Renew your 42 session before continuing." });
    return true;
  }
  const projectStudents =
    /^\/api\/projects\/([a-z0-9_-]{1,100})\/students\/(without_team|can_register)$/i.exec(
      url.pathname,
    );
  if (req.method === "GET" && projectStudents) {
    const page = Number(url.searchParams.get("page") ?? 1);
    if (
      !Number.isSafeInteger(page) ||
      page < 1 ||
      page > 1000 ||
      [...url.searchParams.keys()].some((key) => key !== "page") ||
      url.searchParams.getAll("page").length > 1
    ) {
      json(res, 400, { error: "Invalid student list page." });
      return true;
    }
    try {
      json(
        res,
        200,
        await readPortalProjectStudents(
          session.refresh_session ?? session.access_token,
          projectStudents[1],
          projectStudents[2] as "without_team" | "can_register",
          page,
        ),
      );
    } catch (error) {
      json(res, 502, {
        error: error instanceof Error ? error.message : "42 could not load project students.",
      });
    }
    return true;
  }
  if (req.method === "GET" && url.pathname === "/api/project-attachment") {
    const source = url.searchParams.get("source") ?? "";
    let attachmentUrl: URL;
    try {
      attachmentUrl = new URL(source);
      if (
        [...url.searchParams.keys()].some((key) => key !== "source") ||
        attachmentUrl.origin !== "https://cdn.intra.42.fr" ||
        attachmentUrl.username ||
        attachmentUrl.password
      )
        throw new Error();
    } catch {
      json(res, 400, { error: "Unsupported project attachment URL." });
      return true;
    }
    try {
      const file = await readPortalAttachment(
        session.refresh_session ?? session.access_token,
        attachmentUrl.href,
      );
      res.writeHead(200, {
        "Content-Type": file.contentType,
        "Content-Length": file.body.length,
        "Cache-Control": "private, no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(file.body);
    } catch (error) {
      json(res, 502, {
        error: error instanceof Error ? error.message : "42 could not download the attachment.",
      });
    }
    return true;
  }
  const finishProject = /^\/api\/projects\/([a-z0-9_-]+)\/teams\/(team-[1-9]\d*)\/finish$/i.exec(
    url.pathname,
  );
  if (req.method === "POST" && finishProject && !url.search) {
    if (session.savingProject) {
      json(res, 409, { error: "A project change is already in progress." });
      return true;
    }
    session.savingProject = true;
    try {
      json(
        res,
        200,
        await finishPortalProject(
          session.refresh_session ?? session.access_token,
          finishProject[1],
          finishProject[2],
        ),
      );
    } catch (error) {
      json(res, 502, {
        error: error instanceof Error ? error.message : "Could not finish this project.",
      });
    } finally {
      session.savingProject = false;
    }
    return true;
  }
  const unregisterProject = /^\/api\/projects\/([a-z0-9_-]+)\/unregister$/i.exec(url.pathname);
  if (req.method === "POST" && unregisterProject && !url.search) {
    if (session.savingProject) {
      json(res, 409, { error: "A project change is already in progress." });
      return true;
    }
    session.savingProject = true;
    try {
      json(
        res,
        200,
        await unregisterPortalProject(
          session.refresh_session ?? session.access_token,
          unregisterProject[1],
        ),
      );
    } catch (error) {
      json(res, 502, {
        error: error instanceof Error ? error.message : "Could not unregister from this project.",
      });
    } finally {
      session.savingProject = false;
    }
    return true;
  }
  const projectRegistration = /^\/api\/projects\/([a-z0-9_-]+)\/registrations\/([1-9]\d*)$/i.exec(
    url.pathname,
  );
  if (req.method === "GET" && projectRegistration && !url.search) {
    const enrollmentId = Number(projectRegistration[2]);
    if (!Number.isSafeInteger(enrollmentId)) {
      json(res, 400, { error: "Invalid project registration." });
      return true;
    }
    try {
      json(
        res,
        200,
        await readPortalProjectDetails(
          session.refresh_session ?? session.access_token,
          projectRegistration[1],
          true,
          enrollmentId,
        ),
      );
    } catch (error) {
      json(res, 502, {
        error: error instanceof Error ? error.message : "Could not load this user's project.",
      });
    }
    return true;
  }
  const projectDetails = /^\/api\/projects\/([a-z0-9_-]+)\/(overview|personal)$/i.exec(
    url.pathname,
  );
  if (req.method === "GET" && projectDetails && !url.search) {
    try {
      json(
        res,
        200,
        await readPortalProjectDetails(
          session.refresh_session ?? session.access_token,
          projectDetails[1],
          projectDetails[2] === "personal",
        ),
      );
    } catch (error) {
      json(res, 502, {
        error: error instanceof Error ? error.message : "42 could not load the project.",
      });
    }
    return true;
  }
  const campusMaps = /^\/api\/campus\/([1-9]\d*)\/maps$/.exec(url.pathname);
  if (req.method === "GET" && campusMaps && !url.search) {
    const campusId = Number(campusMaps[1]);
    if (!Number.isSafeInteger(campusId)) {
      json(res, 400, { error: "Invalid campus ID." });
      return true;
    }
    try {
      json(
        res,
        200,
        await readPortalClusterMaps(session.refresh_session ?? session.access_token, campusId),
      );
    } catch (error) {
      json(res, 502, {
        error: error instanceof Error ? error.message : "42 Meta could not load campus maps.",
      });
    }
    return true;
  }
  if (req.method === "GET" && url.pathname === "/api/me/project-list") {
    const allowed = new Set(["page", "sort", "search", "cursus", "recommended"]);
    const page = url.searchParams.get("page") ?? "1";
    const sort = url.searchParams.get("sort") ?? "name";
    const recommended = url.searchParams.get("recommended") ?? "false";
    const sorts: Record<string, string> = {
      name: "project-name",
      duration: "project-duration",
      recommendation: "project-recommendation",
      registration: "project-registration",
      recent: "project-creation",
      xp: "project-xp",
    };
    const search = url.searchParams.get("search") ?? "";
    const cursus = url.searchParams.get("cursus") ?? "";
    if (
      [...url.searchParams.keys()].some((key) => !allowed.has(key)) ||
      !/^[1-9]\d{0,3}$/.test(page) ||
      !Object.hasOwn(sorts, sort) ||
      !["true", "false"].includes(recommended) ||
      search.length > 100 ||
      cursus.length > 80
    ) {
      json(res, 400, { error: "Invalid project list filters." });
      return true;
    }
    const params = new URLSearchParams({
      page,
      sort: sorts[sort],
    });
    if (recommended === "true") params.set("filters", "recommended-projects");
    if (search.trim()) params.set("search", search.trim());
    if (cursus) params.set("cursus", cursus);
    try {
      json(
        res,
        200,
        await readPortalProjectList(session.refresh_session ?? session.access_token, params),
      );
    } catch {
      json(res, 502, {
        error: "Could not load your official project list. Try again or sign in again.",
      });
    }
    return true;
  }
  if (req.method === "GET" && url.pathname === "/api/me/evaluations" && !url.search) {
    try {
      const response = await fetch("https://intrapy.intra.42.fr/api/v1/users/me/scale_teams", {
        headers: { Authorization: `Bearer ${session.access_token}` },
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error("Could not load pending evaluations.");
      const entries = await response.json();
      if (
        !Array.isArray(entries) ||
        entries.some(
          (entry) =>
            !entry ||
            !Number.isSafeInteger(entry.id) ||
            entry.id <= 0 ||
            typeof entry.kind !== "string" ||
            typeof entry.project_name !== "string" ||
            typeof entry.begin_at !== "string" ||
            !Number.isFinite(Date.parse(entry.begin_at)) ||
            (entry.user != null &&
              (typeof entry.user !== "string" || !/^[a-z0-9][a-z0-9_-]{0,31}$/.test(entry.user))),
        )
      )
        throw new Error("Invalid pending evaluations.");
      json(
        res,
        200,
        entries.map(({ id, user, kind, project_name, begin_at }) => ({
          id,
          user,
          kind,
          project_name,
          begin_at,
        })),
      );
    } catch {
      json(res, 502, { error: "42 could not load your pending evaluations. Try again." });
    }
    return true;
  }
  if (req.method === "GET" && url.pathname === "/api/me/events" && !url.search) {
    try {
      json(res, 200, await readEvents(session));
    } catch {
      json(res, 502, { error: "42 could not load your agenda. Try again." });
    }
    return true;
  }
  const event = /^\/api\/events\/([1-9]\d*)\/subscription$/.exec(url.pathname);
  if (req.method === "POST" && event && !url.search && Number.isSafeInteger(Number(event[1]))) {
    await changeEvent(req, res, session, Number(event[1]));
    return true;
  }
  if (req.method === "GET" && url.pathname === "/api/search") {
    const queries = url.searchParams.getAll("query");
    const query = queries[0]?.trim();
    if (
      queries.length !== 1 ||
      !query ||
      query.length > 100 ||
      [...url.searchParams.keys()].some((key) => key !== "query")
    ) {
      json(res, 400, { error: "Enter a search of 1 to 100 characters." });
      return true;
    }
    try {
      const [users, projects] = await Promise.all(
        ["search", "project"].map(async (resource) => {
          const response = await fetch(
            `https://profile.intra.42.fr/searches/${resource}.json?${new URLSearchParams({ query })}`,
            {
              headers: { Authorization: `Bearer ${session.access_token}` },
              redirect: "error",
              signal: AbortSignal.timeout(10000),
            },
          );
          if (!response.ok) throw new Error("Search unavailable.");
          const results: unknown = await response.json();
          if (!Array.isArray(results)) throw new Error("Invalid search response.");
          return results;
        }),
      );
      json(res, 200, {
        users: users
          .filter(
            (user) =>
              typeof user?.login === "string" && /^[a-z0-9][a-z0-9_-]{0,31}$/.test(user.login),
          )
          .map((user) => ({
            login: user.login,
            cdn_uri:
              typeof user.cdn_uri === "string" &&
              /^https:\/\/cdn\.intra\.42\.fr\/users\//.test(user.cdn_uri)
                ? user.cdn_uri
                : undefined,
          })),
        projects: projects
          .filter(
            (project) =>
              Number.isSafeInteger(project?.id) &&
              project.id > 0 &&
              typeof project.name === "string" &&
              project.name.trim() &&
              typeof project.slug === "string" &&
              /^[a-z0-9_-]+$/.test(project.slug),
          )
          .map((project) => ({ id: project.id, name: project.name, slug: project.slug })),
      });
    } catch {
      json(res, 502, { error: "42 could not load search results. Try again." });
    }
    return true;
  }
  if (req.method === "POST" && url.pathname === "/api/me/title") {
    await saveTitle(req, res, session);
    return true;
  }
  const slotsRead = req.method === "GET" && url.pathname === "/api/me/slots";
  const slotsWrite = req.method === "POST" && url.pathname === "/api/slots";
  const slotsCancel = req.method === "POST" && url.pathname === "/api/slots/cancel";
  if (slotsRead || slotsWrite || slotsCancel) {
    let start: string | undefined;
    let end: string | undefined;
    if (slotsRead) [start, end] = (url.searchParams.get("range[begin_at]") ?? "").split(",");
    else {
      let raw = "";
      for await (const chunk of req) {
        raw += chunk;
        if (raw.length > 8192) {
          json(res, 413, { error: "Request too large." });
          return true;
        }
      }
      let payload: { slot?: { user_id?: unknown; begin_at?: unknown; end_at?: unknown } } | null;
      try {
        payload = JSON.parse(raw);
      } catch {
        json(res, 400, { error: "Invalid slot request." });
        return true;
      }
      if (payload?.slot?.user_id !== session.userId) {
        json(res, 403, { error: "You can only manage your own slots." });
        return true;
      }
      start = typeof payload.slot.begin_at === "string" ? payload.slot.begin_at : undefined;
      end = typeof payload.slot.end_at === "string" ? payload.slot.end_at : undefined;
    }
    const slotReq = Object.assign(Object.create(req), {
      url: `${slotsCancel ? "/cancel" : slotsWrite ? "/create" : "/"}?${new URLSearchParams({ start: start ?? "", end: end ?? "" })}`,
      headers: {
        ...req.headers,
        authorization: `Bearer ${session.refresh_session ?? session.access_token}`,
      },
    });
    await managePortalSlots(slotReq, res, nativeRequest, ({ slots, unavailable }) =>
      [...slots, ...unavailable].map((value, index) => {
        if (
          !value ||
          typeof value !== "object" ||
          !("start" in value) ||
          !("end" in value) ||
          typeof value.start !== "string" ||
          typeof value.end !== "string" ||
          !Number.isFinite(Date.parse(value.start)) ||
          !Number.isFinite(Date.parse(value.end))
        ) {
          throw new Error("Invalid portal slot.");
        }
        return {
          id:
            "id" in value && Number.isSafeInteger(value.id) && Number(value.id) > 0
              ? Number(value.id)
              : index + 1,
          begin_at: value.start,
          end_at: value.end,
          scale_team_id:
            index >= slots.length ||
            ("className" in value &&
              (Array.isArray(value.className)
                ? value.className
                : String(value.className).split(/\s+/)
              ).some((name) => name === "reserved" || name === "closed"))
              ? -1
              : null,
        };
      }),
    );
    return true;
  }
  const marks = /^\/api\/users\/([1-9]\d*)\/marks$/.exec(url.pathname);
  if (req.method === "GET" && marks) {
    const cursus = url.searchParams.getAll("cursus_id");
    if (
      cursus.length !== 1 ||
      !/^[1-9]\d*$/.test(cursus[0]) ||
      [...url.searchParams.keys()].some((key) => key !== "cursus_id")
    ) {
      json(res, 400, { error: "Choose a valid course for marks." });
      return true;
    }
    const response = await fetch(
      `https://intrapy.intra.42.fr/api/v1/users/${marks[1]}/projects/marked?${new URLSearchParams({ cursus_id: cursus[0] })}`,
      {
        headers: { Authorization: `Bearer ${session.access_token}` },
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      },
    );
    json(
      res,
      response.status,
      response.ok ? await response.json() : { error: "42 could not load marks. Try again." },
    );
    return true;
  }
  const progress = /^\/api\/users\/([1-9]\d*)\/(pace|attendance|alumnization)$/.exec(url.pathname);
  if (req.method === "GET" && progress && !url.search) {
    const [, userId, resource] = progress;
    const upstream =
      resource === "pace"
        ? `https://pace-system.42.fr/api/v1/users/${userId}/profile`
        : resource === "attendance"
          ? `https://edtrax.42.fr/api/v1/attendance/${userId}/summary`
          : `https://alumni-management.42.fr/api/v1/alumni_auto/${userId}`;
    const response = await fetch(upstream, {
      headers: { Authorization: `Bearer ${session.access_token}` },
      redirect: "error",
      signal: AbortSignal.timeout(15000),
    });
    if (response.status === 404) json(res, 200, null);
    else
      json(
        res,
        response.status,
        response.ok
          ? await response.json()
          : {
              error: `42 could not load ${resource} (HTTP ${response.status}).`,
            },
      );
    return true;
  }
  const path = apiPath(url, session.userId);
  if (req.method !== "GET" || !path) {
    json(res, 404, { error: "Unsupported mobile resource." });
    return true;
  }
  const response = await fetch(`https://api.intra.42.fr/v2${path}`, {
    headers: { Authorization: `Bearer ${await applicationToken()}` },
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
  for (const name of ["x-total", "retry-after"]) {
    const value = response.headers.get(name);
    if (value) res.setHeader(name, value);
  }
  json(
    res,
    response.status,
    response.ok ? await response.json() : { error: `42 returned HTTP ${response.status}.` },
  );
  return true;
}
