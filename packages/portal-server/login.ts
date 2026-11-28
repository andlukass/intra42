import type { IncomingMessage, ServerResponse } from "node:http";
import { isLocalPost } from "./http.ts";
import { httpSignIn } from "./http-login.ts";
import { forget, refreshSession, retainRefreshGrant } from "./refresh.ts";
import { retainSlotSession } from "./slots.ts";

export type PortalLogin = {
  access_token: string;
  expires_in: number;
  refresh_session?: string;
};

let busy = false;

export function createLoginHandler(
  allowRequest = isLocalPost,
  complete: (session: PortalLogin, signal: AbortSignal) => Promise<unknown> = async (session) =>
    session,
) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json");
    if (!allowRequest(req)) {
      res.statusCode = 403;
      res.end(JSON.stringify({ error: "Local browser requests only." }));
      return;
    }
    if (busy) {
      res.statusCode = 429;
      res.end(JSON.stringify({ error: "A login is already running." }));
      return;
    }
    busy = true;

    let refreshKey: string | undefined;
    let completedLogin = false;
    let failure = "Could not sign in to 42.";
    const cancellation = new AbortController();
    const deadline = setTimeout(() => {
      cancellation.abort();
      if (!res.writableEnded) {
        res.statusCode = 504;
        res.end(JSON.stringify({ error: failure }));
      }
      if (!req.complete) req.destroy();
    }, 40_000);
    try {
      let raw = "";
      for await (const chunk of req) {
        raw += chunk.toString();
        if (raw.length > 8192) {
          res.statusCode = 413;
          res.end(JSON.stringify({ error: "Request too large." }));
          return;
        }
      }
      if (res.writableEnded) return;
      const body = new URLSearchParams(raw);
      const username = body.get("username");
      const password = body.get("password");
      if (!username || !password) {
        res.statusCode = 400;
        res.end(JSON.stringify({ error: "Enter your login and password." }));
        return;
      }
      failure =
        "42 could not sign you in. Check your credentials or any additional verification required by 42.";
      const { grant, cookies } = await httpSignIn(
        username,
        password,
        body.get("rememberMe") === "on",
        cancellation.signal,
      );
      cancellation.signal.throwIfAborted();
      const refresh = await retainRefreshGrant(grant);
      refreshKey = refresh.key;
      // Verify renewal now so a successful login cannot silently expire a few minutes later.
      const renewed = await refreshSession(refresh.key);
      if (!renewed || cancellation.signal.aborted) throw new Error("Could not renew session.");
      await retainSlotSession(refresh.key, refresh.expiresIn, cookies);
      failure = "42 could not verify the completed session. Try signing in again.";
      const result = { ...renewed, refresh_session: refresh.key };
      const completed = await complete(result, cancellation.signal);
      if (!res.writableEnded) {
        res.end(JSON.stringify(completed));
        completedLogin = true;
      }
    } catch {
      if (!res.writableEnded) {
        res.statusCode = 502;
        res.end(JSON.stringify({ error: failure }));
      }
    } finally {
      clearTimeout(deadline);

      busy = false;
      if (refreshKey && !completedLogin)
        await forget(refreshKey).catch(() =>
          console.error("Could not discard the incomplete login."),
        );
    }
  };
}
