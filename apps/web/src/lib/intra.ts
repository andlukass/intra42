const tokenEndpoint = "/local-api/login";
const refreshEndpoint = "/local-api/session/refresh";
const sessionStorageKey = "intra42.session.v1";

interface PortalData {
  id: string;
  cursus: string | null;
  data: unknown;
}

function portalData(value: unknown): PortalData | undefined {
  if (
    !value ||
    typeof value !== "object" ||
    !("id" in value) ||
    typeof value.id !== "string" ||
    !("cursus" in value) ||
    (value.cursus !== null && typeof value.cursus !== "string") ||
    !("data" in value)
  )
    return undefined;
  return { id: value.id, cursus: value.cursus, data: value.data };
}

export interface Session {
  accessToken: string;
  expiresAt: number;
  cacheKey: string;
  refreshSession?: string;
  avatar?: string;
  coalition?: PortalData;
  logtime?: PortalData;
}

function readAvatar(value: unknown): string | undefined {
  return typeof value === "string" && /^data:image\/(jpeg|png|webp|avif);base64,/.test(value)
    ? value
    : undefined;
}

export function restoreSession(): Session | null {
  try {
    const stored = window.sessionStorage.getItem(sessionStorageKey);
    if (!stored) return null;
    const value: unknown = JSON.parse(stored);
    const refreshSession =
      value &&
      typeof value === "object" &&
      "refreshSession" in value &&
      typeof value.refreshSession === "string" &&
      value.refreshSession
        ? value.refreshSession
        : undefined;
    if (
      !value ||
      typeof value !== "object" ||
      !("accessToken" in value) ||
      typeof value.accessToken !== "string" ||
      !value.accessToken ||
      !("expiresAt" in value) ||
      typeof value.expiresAt !== "number" ||
      !Number.isFinite(value.expiresAt) ||
      (value.expiresAt <= Date.now() && !refreshSession) ||
      !("cacheKey" in value) ||
      typeof value.cacheKey !== "string" ||
      !value.cacheKey
    ) {
      return null;
    }

    return {
      accessToken: value.accessToken,
      expiresAt: value.expiresAt,
      cacheKey: value.cacheKey,
      refreshSession,
      avatar: readAvatar("avatar" in value ? value.avatar : undefined),
      coalition: portalData("coalition" in value ? value.coalition : undefined),
      logtime: portalData("logtime" in value ? value.logtime : undefined),
    };
  } catch {
    return null;
  }
}

export function persistSession(session: Session | null) {
  try {
    if (!session) {
      window.sessionStorage.removeItem(sessionStorageKey);
      return;
    }

    const { accessToken, expiresAt, cacheKey, refreshSession } = session;
    try {
      window.sessionStorage.setItem(sessionStorageKey, JSON.stringify(session));
    } catch {
      window.sessionStorage.setItem(
        sessionStorageKey,
        JSON.stringify({ accessToken, expiresAt, cacheKey, refreshSession }),
      );
    }
  } catch {
    // The current page can still use React state when browser storage is unavailable.
  }
}

export async function signIn(username: string, password: string): Promise<Session> {
  const response = await fetch(tokenEndpoint, {
    method: "POST",
    credentials: "omit",
    signal: AbortSignal.timeout(45_000),
    body: new URLSearchParams({ username, password }),
  });

  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    const error = body && typeof body === "object" && "error" in body ? body.error : undefined;
    throw new Error(typeof error === "string" ? error : `Login returned HTTP ${response.status}.`);
  }

  const body = await response.json();
  return {
    ...readAccessToken(body),
    cacheKey: crypto.randomUUID(),
    refreshSession: typeof body.refresh_session === "string" ? body.refresh_session : undefined,
    avatar: readAvatar(body.avatar),
    coalition: portalData(body.coalition),
    logtime: portalData(body.logtime),
  };
}

function readAccessToken(body: unknown) {
  if (
    !body ||
    typeof body !== "object" ||
    !("access_token" in body) ||
    typeof body.access_token !== "string" ||
    !body.access_token ||
    !("expires_in" in body) ||
    typeof body.expires_in !== "number" ||
    !Number.isFinite(body.expires_in) ||
    body.expires_in <= 0
  ) {
    throw new Error("The server returned an unexpected token response.");
  }

  return {
    accessToken: body.access_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  };
}

export async function renewSession(session: Session): Promise<Session | null> {
  const response = await fetch(refreshEndpoint, {
    method: "POST",
    credentials: "omit",
    headers: { Authorization: `Bearer ${session.refreshSession}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("Could not renew your 42 session.");
  return { ...session, ...readAccessToken(await response.json()) };
}

export function releaseSession(session: Session) {
  const endpoint = session.refreshSession ? `${refreshEndpoint}/logout` : "/local-api/slots/logout";
  return fetch(endpoint, {
    method: "POST",
    credentials: "omit",
    headers: { Authorization: `Bearer ${session.refreshSession ?? session.accessToken}` },
    keepalive: true,
  }).catch(() => {});
}

export async function readIntra(
  session: Session,
  resource: string,
  params: Record<string, string>,
  signal: AbortSignal,
): Promise<unknown> {
  if (Date.now() >= session.expiresAt) {
    throw new Error("Your session expired. Sign in again.");
  }
  const query = new URLSearchParams(params);
  const response = await fetch(`/local-api/intra/${resource}?${query}`, {
    method: "POST",
    credentials: "omit",
    signal: AbortSignal.any([signal, AbortSignal.timeout(20_000)]),
    headers: { Authorization: `Bearer ${session.accessToken}` },
  });
  if (!response.ok) {
    throw new Error(`42 returned HTTP ${response.status}.`);
  }
  return response.json();
}

export function requestError(error: unknown): string {
  if (error instanceof TypeError) {
    return "The browser could not complete the request. Check Network for CORS or connection errors.";
  }
  if (error instanceof DOMException && error.name === "TimeoutError") {
    return "The request timed out.";
  }
  return error instanceof Error ? error.message : "The request failed.";
}
