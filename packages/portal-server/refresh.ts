import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Page } from "playwright";
import { isLocalPost, json } from "./http.ts";
import { onSessionReload, setTimeout } from "./session-runtime.ts";
import { readSessionRecords, writeSessionRecords } from "./session-store.ts";
import { extendSlotSession, revokeSlotSession } from "./slots.ts";

type RefreshGrant = {
  endpoint: string;
  clientId: string;
  refreshToken: string;
  expiresIn?: number;
};

type AccessToken = { access_token: string; expires_in: number };
type RefreshEntry = RefreshGrant & {
  expiresAt: number;
  timer: ReturnType<typeof setTimeout>;
  pending?: Promise<AccessToken | null>;
};

const sessions = new Map<string, RefreshEntry>();

export function storedRefreshGrant(key: string, refreshToken: unknown): RefreshGrant | null {
  if (!key.startsWith("oidc.user:") || typeof refreshToken !== "string" || !refreshToken)
    return null;
  const separator = key.lastIndexOf(":");
  const authority = key.slice("oidc.user:".length, separator);
  const clientId = key.slice(separator + 1);
  if (!clientId || !URL.canParse(authority)) return null;
  const url = new URL(authority);
  if (
    url.origin !== "https://auth.42.fr" ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    !/^\/(?:auth\/)?realms\/[^/]+\/?$/.test(url.pathname)
  )
    return null;
  return {
    endpoint: `${url.origin}${url.pathname.replace(/\/$/, "")}/protocol/openid-connect/token`,
    clientId,
    refreshToken,
  };
}
await onSessionReload(async () => {
  for (const entry of sessions.values()) clearTimeout(entry.timer);
  sessions.clear();
  for (const record of readSessionRecords("refresh")) {
    const entry = record as RefreshGrant & { key: string; expiresAt: number };
    if (
      !entry ||
      typeof entry.key !== "string" ||
      typeof entry.refreshToken !== "string" ||
      !entry.refreshToken ||
      typeof entry.clientId !== "string" ||
      !Number.isFinite(entry.expiresAt) ||
      entry.expiresAt <= Date.now()
    )
      continue;
    if (typeof entry.endpoint !== "string" || !URL.canParse(entry.endpoint)) continue;
    const endpoint = new URL(entry.endpoint);
    if (
      endpoint.origin !== "https://auth.42.fr" ||
      endpoint.username ||
      endpoint.password ||
      !/^\/(?:auth\/)?realms\/[^/]+\/protocol\/openid-connect\/token$/.test(endpoint.pathname)
    )
      continue;
    sessions.set(entry.key, {
      ...entry,
      timer: setTimeout(() => expire(entry.key), entry.expiresAt - Date.now()).unref(),
    });
  }
});
function persist() {
  return writeSessionRecords(
    "refresh",
    [...sessions].map(([key, entry]) => ({
      key,
      endpoint: entry.endpoint,
      clientId: entry.clientId,
      refreshToken: entry.refreshToken,
      expiresAt: entry.expiresAt,
    })),
  );
}

export async function observeRefreshGrant(page: Page): Promise<RefreshGrant | null> {
  try {
    const response = await page.waitForResponse(
      (candidate) => {
        const url = new URL(candidate.url());
        if (
          url.origin !== "https://auth.42.fr" ||
          !/^\/(?:auth\/)?realms\/[^/]+\/protocol\/openid-connect\/token$/.test(url.pathname) ||
          !candidate.ok() ||
          candidate.request().method() !== "POST"
        )
          return false;
        return (
          new URLSearchParams(candidate.request().postData() ?? "").get("grant_type") ===
          "authorization_code"
        );
      },
      { timeout: 35_000 },
    );
    const body = await response.json();
    const clientId = new URLSearchParams(response.request().postData() ?? "").get("client_id");
    const refreshToken = typeof body?.refresh_token === "string" ? body.refresh_token : "";
    console.info("[42go] 42 issued a refresh token:", Boolean(refreshToken));
    if (!refreshToken || !clientId) return null;
    return { endpoint: response.url(), clientId, refreshToken, expiresIn: body.refresh_expires_in };
  } catch {
    return null;
  }
}

function lifetime(expiresIn?: number) {
  const limit = 86_400;
  return Number.isFinite(expiresIn) && expiresIn && expiresIn > 0
    ? Math.min(expiresIn, limit)
    : limit;
}

function expire(key: string) {
  void forget(key).catch(() => console.error("Could not persist refresh-session expiry."));
}

export async function forget(key: string) {
  const session = sessions.get(key);
  if (!session) return;
  clearTimeout(session.timer);
  sessions.delete(key);
  await persist();
  await revokeSlotSession(key);
}

export async function retainRefreshGrant(grant: RefreshGrant) {
  const key = randomUUID();
  const expiresIn = lifetime(grant.expiresIn);
  const timer = setTimeout(() => expire(key), expiresIn * 1_000).unref();
  sessions.set(key, { ...grant, timer, expiresAt: Date.now() + expiresIn * 1000 });
  await persist();
  return { key, expiresIn };
}

async function exchange(key: string, session: RefreshEntry): Promise<AccessToken | null> {
  const response = await fetch(session.endpoint, {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: session.clientId,
      refresh_token: session.refreshToken,
    }),
    redirect: "error",
    signal: AbortSignal.timeout(10_000),
  });
  const body = await response.json().catch(() => null);
  console.info("[42go] Token refresh HTTP", response.status);
  if (
    response.status === 401 ||
    (response.status === 400 && body?.error !== "temporarily_unavailable")
  ) {
    await forget(key);
    return null;
  }
  if (
    !response.ok ||
    typeof body?.access_token !== "string" ||
    !body.access_token ||
    !Number.isFinite(body.expires_in) ||
    body.expires_in <= 0
  )
    throw new Error("Invalid refresh response.");

  if (sessions.get(key) !== session) return null;
  if (typeof body.refresh_token === "string" && body.refresh_token) {
    session.refreshToken = body.refresh_token;
  }
  if (Number.isFinite(body.refresh_expires_in) && body.refresh_expires_in > 0) {
    const expiresIn = lifetime(body.refresh_expires_in);
    clearTimeout(session.timer);
    session.expiresAt = Date.now() + expiresIn * 1000;
    session.timer = setTimeout(() => expire(key), expiresIn * 1_000).unref();
    await extendSlotSession(key, expiresIn);
  }
  await persist();
  return { access_token: body.access_token, expires_in: body.expires_in };
}

export async function refreshSession(key: string) {
  const session = sessions.get(key);
  if (!session) return null;
  session.pending ??= exchange(key, session).finally(() => {
    session.pending = undefined;
  });
  return session.pending;
}

export async function manageRefresh(req: IncomingMessage, res: ServerResponse) {
  if (!isLocalPost(req)) {
    json(res, 403, { error: "Local browser requests only." });
    return;
  }
  const auth = req.headers.authorization;
  const key = auth?.startsWith("Bearer ") ? auth.slice(7) : "";
  const path = new URL(req.url ?? "/", "http://localhost").pathname;
  if (path === "/logout") {
    await forget(key);
    json(res, 200, { signedOut: true });
    return;
  }
  if (path !== "/") {
    json(res, 404, { error: "Unknown session action." });
    return;
  }
  const session = sessions.get(key);
  if (!session) {
    json(res, 401, { error: "Your 42 session expired. Sign in again." });
    return;
  }
  try {
    const token = await refreshSession(key);
    if (token) json(res, 200, token);
    else json(res, 401, { error: "Your 42 session expired. Sign in again." });
  } catch {
    json(res, 502, { error: "Could not renew your 42 session. Retrying shortly." });
  }
}
