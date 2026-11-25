import { createHash } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { type APIRequestContext, type BrowserContext, request } from "playwright";
import { isLocalPost, json } from "./intra.js";

const portal = "https://profile.intra.42.fr";
const quarterHour = 15 * 60_000;
type Cookies = Awaited<ReturnType<BrowserContext["cookies"]>>;
type SlotSession = {
  context: Promise<APIRequestContext>;
  writing: boolean;
  expires: ReturnType<typeof setTimeout>;
};
const sessions = new Map<string, SlotSession>();

function keyFor(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function releaseSlotSession(key: string, session: SlotSession) {
  if (sessions.get(key) === session) sessions.delete(key);
  clearTimeout(session.expires);
  void session.context.then((context) => context.dispose()).catch(() => {});
}

export function retainSlotSession(token: string, expiresIn: number, cookies: Cookies) {
  const key = keyFor(token);
  const previous = sessions.get(key);
  if (previous) releaseSlotSession(key, previous);
  const entry: SlotSession = {
    context: request.newContext({
      baseURL: portal,
      storageState: { cookies, origins: [] },
      timeout: 10_000,
      extraHTTPHeaders: { Accept: "application/json", "X-Requested-With": "XMLHttpRequest" },
    }),
    writing: false,
    expires: setTimeout(() => releaseSlotSession(key, entry), expiresIn * 1000).unref(),
  };
  sessions.set(key, entry);
  void entry.context.catch(() => releaseSlotSession(key, entry));
}

export function extendSlotSession(token: string, expiresIn: number) {
  const key = keyFor(token);
  const session = sessions.get(key);
  if (!session) return;
  clearTimeout(session.expires);
  session.expires = setTimeout(() => releaseSlotSession(key, session), expiresIn * 1_000).unref();
}

export function revokeSlotSession(token: string) {
  const key = keyFor(token);
  const session = sessions.get(key);
  if (session) releaseSlotSession(key, session);
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

export async function manageSlots(req: IncomingMessage, res: ServerResponse) {
  if (!isLocalPost(req)) {
    json(res, 403, { error: "Local browser requests only." });
    return;
  }
  const auth = req.headers.authorization;
  const key = auth?.startsWith("Bearer ") ? keyFor(auth.slice(7)) : "";
  const session = sessions.get(key);
  const url = new URL(req.url ?? "/", "http://localhost");
  if (url.pathname === "/logout") {
    if (session) releaseSlotSession(key, session);
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
      json(res, 200, { slots, unavailable: unavailable.data });
      return;
    }

    if (url.pathname !== "/create") {
      json(res, 404, { error: "Unknown slots action." });
      return;
    }
    if (beginAt <= Date.now() || beginAt % quarterHour !== 0 || endAt % quarterHour !== 0) {
      json(res, 400, { error: "Choose a future slot in 15-minute increments." });
      return;
    }
    if (session.writing) {
      json(res, 409, { error: "Another slot is being saved." });
      return;
    }

    session.writing = true;
    try {
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
      const result = await context.post("/slots.json", {
        headers: { "X-CSRF-Token": csrf, Referer: `${portal}/slots`, Origin: portal },
        form: { "slot[begin_at]": start, "slot[end_at]": end },
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
      json(res, 200, { saved: true });
    } finally {
      session.writing = false;
    }
  } catch {
    json(res, 502, { error: "42 did not respond. Refresh the calendar before retrying." });
  }
}
