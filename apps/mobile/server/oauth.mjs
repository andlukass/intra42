import { createHash } from "node:crypto";
import { createServer } from "node:http";

const {
  INTRA42_CLIENT_ID,
  INTRA42_CLIENT_SECRET,
  INTRA42_REDIRECT_URI,
  INTRA42_SCOPES = "public projects",
  PORT = "8787",
} = process.env;
if (!INTRA42_CLIENT_ID || !INTRA42_CLIENT_SECRET || !INTRA42_REDIRECT_URI) {
  throw new Error("Configure INTRA42_CLIENT_ID, INTRA42_CLIENT_SECRET and INTRA42_REDIRECT_URI.");
}
const redirect = new URL(INTRA42_REDIRECT_URI);
const loopback =
  redirect.protocol === "http:" &&
  ["localhost", "127.0.0.1"].includes(redirect.hostname) &&
  Number(redirect.port || 80) === Number(PORT);
if (
  (redirect.protocol !== "https:" && !loopback) ||
  !redirect.pathname.endsWith("/callback") ||
  redirect.username ||
  redirect.password ||
  redirect.search ||
  redirect.hash
) {
  throw new Error("Use an HTTPS callback or a loopback callback on the broker port.");
}
const origin = "https://api.intra.42.fr";
const pending = new Map();

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}
function move(res, url) {
  res.writeHead(302, { Location: url, "Cache-Control": "no-store" }).end();
}

const avatarOrigin = "https://cdn.intra.42.fr";
const avatarTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxAvatarBytes = 1024 * 1024;
let applicationGrant;
let pendingApplicationGrant;

async function requestGrant(params) {
  params.set("client_id", INTRA42_CLIENT_ID);
  params.set("client_secret", INTRA42_CLIENT_SECRET);
  return fetch(`${origin}/oauth/token`, {
    method: "POST",
    body: params,
    redirect: "error",
    signal: AbortSignal.timeout(15000),
  });
}

async function getApplicationToken() {
  if (applicationGrant && applicationGrant.expiresAt > Date.now()) return applicationGrant.token;
  pendingApplicationGrant ??= (async () => {
    const response = await requestGrant(
      new URLSearchParams({
        grant_type: "client_credentials",
        scope: "public",
      }),
    );
    if (!response.ok) throw new Error("Could not authorize public profile reads.");
    const { access_token, expires_in } = await response.json();
    if (typeof access_token !== "string" || !access_token)
      throw new Error("Missing application access token.");
    applicationGrant = {
      token: access_token,
      expiresAt: Date.now() + Number(expires_in) * 1000 - 30_000,
    };
    return access_token;
  })().finally(() => {
    pendingApplicationGrant = undefined;
  });
  return pendingApplicationGrant;
}

const verifiedSessions = new Map();

function upstreamError(res, response, message) {
  const retryAfter = response.headers.get("retry-after");
  if (response.status === 429 && retryAfter) res.setHeader("Retry-After", retryAfter);
  return send(res, response.status, { error: message });
}

async function verifySession(req, res) {
  const authorization = req.headers.authorization;
  if (!/^Bearer [^\s,]+$/i.test(authorization ?? "")) {
    send(res, 401, { error: "Sign in to view profiles." });
    return;
  }
  const key = createHash("sha256").update(authorization).digest("hex");
  for (const [key, entry] of verifiedSessions) {
    if (entry.expiresAt <= Date.now()) verifiedSessions.delete(key);
  }
  const cached = verifiedSessions.get(key);
  if (cached) return cached.profile;
  const response = await fetch(`${origin}/v2/me`, {
    headers: { Authorization: authorization },
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    upstreamError(res, response, "Could not verify your 42 session.");
    return;
  }
  const profile = await response.json();
  if (!Number.isSafeInteger(profile.id) || profile.id <= 0) {
    send(res, 502, { error: "42 returned an invalid session profile." });
    return;
  }
  if (verifiedSessions.size >= 1000) verifiedSessions.delete(verifiedSessions.keys().next().value);
  // Briefly reuse session verification across the occupied seats in one map.
  verifiedSessions.set(key, { profile, expiresAt: Date.now() + 30_000 });
  return profile;
}

async function publicProfileResponse(path, search = "") {
  return fetch(`${origin}/v2/users/${path}${search}`, {
    headers: { Authorization: `Bearer ${await getApplicationToken()}` },
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  });
}

async function sendPublicProfile(req, res, path, search) {
  if (!(await verifySession(req, res))) return;
  const response = await publicProfileResponse(path, search);
  if (!response.ok) return upstreamError(res, response, "42 could not serve this public profile.");
  const profile = await response.json();
  if (!path.includes("/") && profile.id !== Number(path)) {
    return send(res, 502, { error: "42 returned a different public profile." });
  }
  return send(res, 200, profile);
}

async function sendAvatar(req, res, userId, size) {
  if (userId !== null && !/^[1-9]\d{0,9}$/.test(userId)) {
    return send(res, 400, { error: "Invalid user ID." });
  }
  if (size !== null && !["small", "full"].includes(size)) {
    return send(res, 400, { error: "Invalid photo size." });
  }
  const caller = await verifySession(req, res);
  if (!caller) return;
  let profile = caller;
  if (userId !== null && Number(userId) !== caller.id) {
    const response = await publicProfileResponse(userId);
    if (!response.ok)
      return upstreamError(res, response, "42 could not serve this public profile.");
    profile = await response.json();
  }
  const { id, image } = profile;
  if (typeof id !== "number" || (userId !== null && id !== Number(userId))) {
    return send(res, 502, { error: "42 returned a different user for this photo." });
  }
  const source = size === "full" ? image?.link : image?.versions?.small || image?.link;
  if (typeof source !== "string") return send(res, 404, { error: "No profile photo." });
  const photo = new URL(source);
  if (
    photo.origin !== avatarOrigin ||
    !photo.pathname.startsWith("/users/") ||
    photo.username ||
    photo.password
  ) {
    return send(res, 404, { error: "Unsupported profile photo URL." });
  }

  const response = await fetch(photo, {
    headers: { Authorization: `Bearer ${await getApplicationToken()}` },
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  });
  const type = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (
    !response.ok ||
    !avatarTypes.has(type) ||
    !response.body ||
    Number(response.headers.get("content-length")) > maxAvatarBytes
  ) {
    await response.body?.cancel();
    return send(res, 502, { error: "42 could not serve the profile photo." });
  }

  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.byteLength;
    if (bytes > maxAvatarBytes) return send(res, 502, { error: "Profile photo is too large." });
    chunks.push(chunk);
  }
  if (!bytes) return send(res, 502, { error: "Profile photo is empty." });
  return send(res, 200, {
    userId: id,
    size: size ?? "small",
    uri: `data:${type};base64,${Buffer.concat(chunks, bytes).toString("base64")}`,
  });
}

async function sendAchievementIcon(req, res, path) {
  if (!(await verifySession(req, res))) return;
  const response = await fetch(`${avatarOrigin}${path}`, {
    headers: { Authorization: `Bearer ${await getApplicationToken()}` },
    redirect: "error",
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    return upstreamError(res, response, "42 could not serve this achievement icon.");
  }
  const type = response.headers.get("content-type")?.split(";")[0]?.trim().toLowerCase();
  if (!(type === "image/svg+xml" || avatarTypes.has(type)) || !response.body) {
    await response.body?.cancel();
    return send(res, 502, { error: "42 returned an unsupported achievement icon." });
  }
  const chunks = [];
  let bytes = 0;
  for await (const chunk of response.body) {
    bytes += chunk.byteLength;
    if (bytes > maxAvatarBytes) return send(res, 502, { error: "Achievement icon is too large." });
    chunks.push(chunk);
  }
  if (!bytes) return send(res, 502, { error: "Achievement icon is empty." });
  return send(res, 200, { uri: `data:${type};base64,${Buffer.concat(chunks).toString("base64")}` });
}

async function handle(req, res) {
  const url = new URL(req.url, redirect.origin);
  const state = url.searchParams.get("state");
  if (req.method === "GET" && url.pathname === "/achievement-icon") {
    const path = url.searchParams.get("path");
    if (
      !/^\/achievement\/image\/[1-9]\d{0,9}\/[a-z\d_.-]+\.(?:svg|png|jpe?g|webp)$/i.test(path ?? "")
    ) {
      return send(res, 400, { error: "Invalid achievement icon path." });
    }
    return sendAchievementIcon(req, res, path);
  }
  const publicProfile = /^\/profiles\/([1-9]\d{0,9}(?:\/(?:coalitions|locations))?)$/.exec(
    url.pathname,
  );
  if (req.method === "GET" && publicProfile) {
    const allowed = new Set(["page[size]", "page[number]", "sort", "range[begin_at]"]);
    for (const key of url.searchParams.keys()) {
      if (!allowed.has(key)) return send(res, 400, { error: "Unsupported profile query." });
    }
    return sendPublicProfile(req, res, publicProfile[1], url.search);
  }

  if (req.method === "GET" && url.pathname === "/avatar")
    return sendAvatar(req, res, url.searchParams.get("userId"), url.searchParams.get("size"));
  if (req.method === "GET" && url.pathname === "/authorize") {
    const challenge = url.searchParams.get("challenge");
    if (!/^[a-f0-9]{64}$/.test(state ?? "") || !/^[a-f0-9]{64}$/.test(challenge ?? "")) {
      return send(res, 400, { error: "Invalid authorization request." });
    }
    for (const [key, value] of pending) {
      if (value.expires <= Date.now()) pending.delete(key);
    }
    if (pending.size >= 1000 || pending.has(state))
      return send(res, 429, { error: "Try again shortly." });
    pending.set(state, { challenge, expires: Date.now() + 600_000 });
    const query = new URLSearchParams({
      client_id: INTRA42_CLIENT_ID,
      redirect_uri: redirect.href,
      response_type: "code",
      scope: INTRA42_SCOPES,
      state,
    });
    return move(res, `${origin}/oauth/authorize?${query}`);
  }
  if (req.method === "GET" && url.pathname === redirect.pathname) {
    const entry = pending.get(state);
    const code = url.searchParams.get("code");
    if (!entry || entry.expires <= Date.now() || entry.code) {
      return send(res, 400, { error: "Authorization expired. Start again in the app." });
    }
    if (code) entry.code = code;
    else pending.delete(state);
    return move(res, `intra42://oauth?state=${state}&status=${code ? "ok" : "denied"}`);
  }
  if (req.method !== "POST" || !["/exchange", "/refresh"].includes(url.pathname)) {
    return send(res, 404, { error: "Not found." });
  }
  let raw = "";
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 8192) return send(res, 413, { error: "Request too large." });
  }
  const payload = JSON.parse(raw);
  const params = new URLSearchParams();
  if (url.pathname === "/exchange") {
    const entry = pending.get(payload.state);
    const verifier = payload.verifier;
    if (
      !entry?.code ||
      entry.expires <= Date.now() ||
      typeof verifier !== "string" ||
      createHash("sha256").update(verifier).digest("hex") !== entry.challenge
    )
      return send(res, 400, { error: "Authorization expired or invalid." });
    pending.delete(payload.state);
    params.set("grant_type", "authorization_code");
    params.set("code", entry.code);
    params.set("redirect_uri", redirect.href);
  } else {
    if (typeof payload.refreshToken !== "string" || !payload.refreshToken) {
      return send(res, 400, { error: "Missing refresh token." });
    }
    params.set("grant_type", "refresh_token");
    params.set("refresh_token", payload.refreshToken);
  }
  const response = await requestGrant(params);
  if (!response.ok) {
    return send(res, response.status < 500 ? 401 : 502, {
      error: "42 could not authorize this session.",
    });
  }
  const token = await response.json();
  return send(res, 200, {
    accessToken: token.access_token,
    refreshToken: token.refresh_token ?? payload.refreshToken,
    expiresAt: Date.now() + Number(token.expires_in) * 1000,
  });
}

createServer((req, res) => {
  void handle(req, res).catch(() => {
    if (!res.headersSent)
      send(res, 502, { error: "The OAuth service could not complete the request." });
  });
}).listen(Number(PORT), "127.0.0.1", () => console.log(`OAuth broker listening on ${PORT}`));
