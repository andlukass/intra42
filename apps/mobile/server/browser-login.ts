import { createHash, randomBytes } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { json } from "@intra42/portal-server/http";
import { createLoginHandler, type PortalLogin } from "@intra42/portal-server/login";
import type { Token } from "../src/session-token.js";
import { signInAssets } from "./sign-in-assets.ts";
import { signInPage, signInScript } from "./sign-in-page.ts";

type Transaction = {
  state: string;
  challenge: string;
  csrf: string;
  expiresAt: number;
  timer: ReturnType<typeof setTimeout>;
  code?: string;
  session?: Token;
};
const hex = /^[a-f0-9]{64}$/;
const random = () => randomBytes(32).toString("hex");

function browserRequest(req: IncomingMessage) {
  try {
    const origin = new URL(req.headers.origin ?? "");
    return (
      req.method === "POST" &&
      origin.origin === req.headers.origin &&
      origin.host === req.headers.host &&
      (origin.protocol === "https:" ||
        (origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname))) &&
      ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.socket.remoteAddress ?? "")
    );
  } catch {
    return false;
  }
}

async function formBody(req: IncomingMessage, res: ServerResponse) {
  if (req.headers["content-type"]?.split(";")[0] !== "application/x-www-form-urlencoded") {
    json(res, 415, { error: "Use form-encoded requests." });
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
  return new URLSearchParams(raw);
}

export function createBrowserLogin(
  nativeRequest: (req: IncomingMessage) => boolean,
  createSession: (token: PortalLogin, signal: AbortSignal) => Promise<Token>,
  discardSession: (key: string) => Promise<void>,
) {
  const transactions = new Map<string, Transaction>();
  async function forget(id: string) {
    const entry = transactions.get(id);
    if (!entry) return;
    clearTimeout(entry.timer);
    transactions.delete(id);
    if (entry.session) await discardSession(entry.session.accessToken);
  }
  function expire(id: string) {
    void forget(id).catch(() => console.error("Could not release an expired sign-in session."));
  }
  function find(id: string) {
    const entry = transactions.get(id);
    if (entry && entry.expiresAt <= Date.now()) {
      void forget(id).catch(() => console.error("Could not release an expired sign-in session."));
      return;
    }
    return entry;
  }
  function fromRequest(req: IncomingMessage) {
    const url = new URL(req.url ?? "/", "http://localhost");
    const id = url.searchParams.get("transaction") ?? "";
    return { id, entry: find(id) };
  }
  const login = createLoginHandler(browserRequest, async (token, signal) => {
    const transaction = activeLogin;
    const session = await createSession(token, signal);
    if (!transaction || find(transaction.id) !== transaction.entry) {
      await discardSession(session.accessToken);
      throw new Error("Sign-in cancelled.");
    }
    const entry = transaction.entry;
    entry.session = session;
    entry.code = random();
    entry.expiresAt = Date.now() + 60_000;
    clearTimeout(entry.timer);
    entry.timer = setTimeout(() => expire(transaction.id), 60_000).unref();
    return {
      redirect: `intra42://oauth?${new URLSearchParams({ state: entry.state, code: entry.code })}`,
    };
  });
  let activeLogin: { id: string; entry: Transaction } | undefined;

  return async function handleBrowserLogin(req: IncomingMessage, res: ServerResponse, url: URL) {
    if (req.method === "GET" && Object.hasOwn(signInAssets, url.pathname)) {
      const asset = signInAssets[url.pathname];
      res.writeHead(200, {
        "Content-Type": asset.type,
        "Cache-Control": "public, max-age=86400",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(asset.body);
      return true;
    }
    if (url.pathname === "/sign-in.js" && req.method === "GET") {
      res.writeHead(200, {
        "Content-Type": "text/javascript; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(signInScript);
      return true;
    }
    if (url.pathname === "/sign-in") {
      const { id, entry } = fromRequest(req);
      res.setHeader("Referrer-Policy", "no-referrer");
      res.setHeader("X-Content-Type-Options", "nosniff");
      if (!entry || entry.code) {
        json(res, 400, { error: "Sign-in expired. Close this window and start again in the app." });
        return true;
      }
      if (req.method === "GET") {
        res.writeHead(200, {
          "Content-Type": "text/html; charset=utf-8",
          "Cache-Control": "no-store",
          "Content-Security-Policy":
            "default-src 'none'; script-src 'self'; style-src 'unsafe-inline' https://use.typekit.net https://p.typekit.net; font-src https://use.typekit.net; connect-src 'self'; img-src 'self' data:; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
        });
        res.end(signInPage(id, entry.csrf));
        return true;
      }
      if (!browserRequest(req) || req.headers["x-intra42-csrf"] !== entry.csrf) {
        json(res, 403, { error: "Start sign-in from the Intra42 app." });
        return true;
      }
      if (url.searchParams.get("action") === "cancel") {
        await forget(id);
        json(res, 200, {
          redirect: `intra42://oauth?${new URLSearchParams({ state: entry.state, error: "cancelled" })}`,
        });
        return true;
      }
      if (activeLogin) {
        json(res, 429, { error: "A login is already running. Try again shortly." });
        return true;
      }
      activeLogin = { id, entry };
      try {
        await login(req, res);
      } finally {
        activeLogin = undefined;
      }
      return true;
    }
    if (!["/session/start", "/session/exchange", "/session/cancel"].includes(url.pathname))
      return false;
    if (req.method !== "POST" || !nativeRequest(req)) {
      json(res, 403, { error: "Native app requests only." });
      return true;
    }
    const body = await formBody(req, res);
    if (!body) return true;
    const state = body.get("state") ?? "";
    if (url.pathname === "/session/start") {
      const challenge = body.get("challenge") ?? "";
      if (!hex.test(state) || !hex.test(challenge)) {
        json(res, 400, { error: "Invalid sign-in transaction." });
        return true;
      }
      if (
        transactions.size >= 1000 ||
        [...transactions.values()].some((entry) => entry.state === state)
      ) {
        json(res, 429, { error: "Try again shortly." });
        return true;
      }
      const id = random();
      transactions.set(id, {
        state,
        challenge,
        csrf: random(),
        expiresAt: Date.now() + 600_000,
        timer: setTimeout(() => expire(id), 600_000).unref(),
      });
      json(res, 200, { path: `/sign-in?transaction=${id}` });
      return true;
    }
    const id = body.get("transaction") ?? "";
    const entry = find(id);
    const verifier = body.get("verifier") ?? "";
    if (
      !entry ||
      entry.state !== state ||
      !hex.test(verifier) ||
      createHash("sha256").update(verifier).digest("hex") !== entry.challenge
    ) {
      json(res, 400, { error: "Sign-in expired or invalid. Start again." });
      return true;
    }
    if (url.pathname === "/session/cancel") {
      await forget(id);
      json(res, 200, { cancelled: true });
      return true;
    }
    if (!entry.session || !entry.code || entry.code !== body.get("code")) {
      json(res, 400, { error: "Sign-in expired or invalid. Start again." });
      return true;
    }
    const session = entry.session;
    entry.session = undefined;
    await forget(id);
    json(res, 200, session);
    return true;
  };
}
