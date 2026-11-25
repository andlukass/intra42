import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { Page } from "playwright";
import { isLocalPost, json } from "./intra.js";
import { extendSlotSession, revokeSlotSession } from "./slots.js";

type RefreshGrant = {
  endpoint: string;
  clientId: string;
  refreshToken: string;
  expiresIn?: number;
};

type AccessToken = { access_token: string; expires_in: number };
type RefreshEntry = RefreshGrant & {
  timer: ReturnType<typeof setTimeout>;
  pending?: Promise<AccessToken | null>;
};

const sessions = new Map<string, RefreshEntry>();

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
      { timeout: 18_000 },
    );
    const body = await response.json();
    const clientId = new URLSearchParams(response.request().postData() ?? "").get("client_id");
    const refreshToken = typeof body?.refresh_token === "string" ? body.refresh_token : "";
    console.info("[Intra42] 42 issued a refresh token:", Boolean(refreshToken));
    if (!refreshToken || !clientId) return null;
    return { endpoint: response.url(), clientId, refreshToken, expiresIn: body.refresh_expires_in };
  } catch {
    console.info("[Intra42] Could not verify refresh-token issuance for this login.");
    return null;
  }
}

function lifetime(expiresIn?: number) {
  const limit = 86_400;
  return Number.isFinite(expiresIn) && expiresIn && expiresIn > 0
    ? Math.min(expiresIn, limit)
    : limit;
}

function forget(key: string) {
  const session = sessions.get(key);
  if (!session) return;
  clearTimeout(session.timer);
  sessions.delete(key);
  revokeSlotSession(key);
}

export function retainRefreshGrant(grant: RefreshGrant) {
  const key = randomUUID();
  const expiresIn = lifetime(grant.expiresIn);
  const timer = setTimeout(() => forget(key), expiresIn * 1_000).unref();
  sessions.set(key, { ...grant, timer });
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
  console.info("[Intra42] Token refresh HTTP", response.status);
  if (
    response.status === 401 ||
    (response.status === 400 && body?.error !== "temporarily_unavailable")
  ) {
    forget(key);
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
    session.timer = setTimeout(() => forget(key), expiresIn * 1_000).unref();
    extendSlotSession(key, expiresIn);
  }
  return { access_token: body.access_token, expires_in: body.expires_in };
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
    forget(key);
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
    session.pending ??= exchange(key, session).finally(() => {
      session.pending = undefined;
    });
    const token = await session.pending;
    if (token) json(res, 200, token);
    else json(res, 401, { error: "Your 42 session expired. Sign in again." });
  } catch {
    json(res, 502, { error: "Could not renew your 42 session. Retrying shortly." });
  }
}
