import { createHash } from "node:crypto";
import { createServer } from "node:http";

const {
  INTRA42_CLIENT_ID,
  INTRA42_CLIENT_SECRET,
  INTRA42_REDIRECT_URI,
  PORT = "8787",
} = process.env;
if (!INTRA42_CLIENT_ID || !INTRA42_CLIENT_SECRET || !INTRA42_REDIRECT_URI) {
  throw new Error("Configure INTRA42_CLIENT_ID, INTRA42_CLIENT_SECRET and INTRA42_REDIRECT_URI.");
}
const redirect = new URL(INTRA42_REDIRECT_URI);
if (
  redirect.protocol !== "https:" ||
  redirect.pathname !== "/callback" ||
  redirect.search ||
  redirect.hash
) {
  throw new Error("INTRA42_REDIRECT_URI must be an HTTPS URL ending in /callback.");
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

async function handle(req, res) {
  const url = new URL(req.url, redirect.origin);
  const state = url.searchParams.get("state");
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
      scope: "public projects",
      state,
    });
    return move(res, `${origin}/oauth/authorize?${query}`);
  }
  if (req.method === "GET" && url.pathname === "/callback") {
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
  const params = new URLSearchParams({
    client_id: INTRA42_CLIENT_ID,
    client_secret: INTRA42_CLIENT_SECRET,
  });
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
  const response = await fetch(`${origin}/oauth/token`, {
    method: "POST",
    body: params,
    signal: AbortSignal.timeout(15000),
  });
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
