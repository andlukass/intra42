import type { IncomingMessage, ServerResponse } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { type BrowserContext, chromium, type Page } from "playwright";
import { watchPortalAvatar } from "./avatar.ts";
import { isLocalPost } from "./http.ts";
import {
  forget,
  observeRefreshGrant,
  refreshSession,
  retainRefreshGrant,
  storedRefreshGrant,
} from "./refresh.ts";
import { retainSlotSession } from "./slots.ts";

function readPortalData(page: Page, resource: "coalition" | "logtime") {
  return page
    .waitForResponse(
      (response) => {
        const url = new URL(response.url());
        if (!response.ok() || response.request().method() !== "GET") return false;
        if (resource === "coalition") {
          return (
            url.origin === "https://profile.intra.42.fr" &&
            /^\/users\/\d+\/coalitions$/.test(url.pathname)
          );
        }
        return (
          url.origin === "https://translate.intra.42.fr" &&
          /^\/users\/\d+\/locations_stats\/$/.test(url.pathname)
        );
      },
      { timeout: 12_000 },
    )
    .then(async (response) => {
      const url = new URL(response.url());
      return {
        id: url.pathname.split("/")[2],
        cursus: url.searchParams.get("cursus"),
        data: (await response.json()) as unknown,
      };
    })
    .catch(() => undefined);
}

async function openSlotsSession(context: BrowserContext) {
  const slotsPage = await context.newPage();
  try {
    await slotsPage.goto("https://profile.intra.42.fr/slots", {
      waitUntil: "domcontentloaded",
      timeout: 4_000,
    });
  } finally {
    await slotsPage.close();
  }
}

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
    let browser: Awaited<ReturnType<typeof chromium.launch>> | undefined;
    let refreshKey: string | undefined;
    let completedLogin = false;
    let failure = "Could not start the local Chrome session.";
    const cancellation = new AbortController();
    const deadline = setTimeout(() => {
      cancellation.abort();
      if (!res.writableEnded) {
        res.statusCode = 504;
        res.end(JSON.stringify({ error: failure }));
      }
      if (!req.complete) req.destroy();
      void browser?.close().catch(() => {});
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
      browser = await chromium.launch({ channel: "chrome", headless: true, timeout: 10_000 });
      failure = "The 42 sign-in page did not load. Check your connection and try again.";
      const context = await browser.newContext();
      const page = await context.newPage();
      const readAvatar = watchPortalAvatar(page);
      const refreshGrant = observeRefreshGrant(page);
      page.setDefaultTimeout(10_000);
      await page.goto("https://profile-v3.intra.42.fr/", { waitUntil: "domcontentloaded" });
      await page.locator('input[name="username"]').waitFor();
      if (new URL(page.url()).origin !== "https://auth.42.fr") {
        throw new Error("Unexpected login destination.");
      }
      await page.locator('input[name="username"]').fill(username);
      await page.locator('input[name="password"]').fill(password);
      if (body.get("rememberMe") === "on") {
        const remember = page.locator('input[name="rememberMe"]');
        if (await remember.count()) await remember.check();
      }
      const dashboard: Partial<Record<"coalition" | "logtime", unknown>> = {};
      const dashboardRequests = (["coalition", "logtime"] as const).map((resource) =>
        readPortalData(page, resource).then((data) => {
          dashboard[resource] = data;
        }),
      );
      failure =
        "42 did not finish signing in. Check whether the official sign-in page asks for an extra verification step.";
      await page.locator("#kc-login").click({ noWaitAfter: true });
      const formError = page
        .locator(
          ":is(#input-error, #input-error-username, #input-error-password, [data-kc-msg-error], .alert-error):visible",
        )
        .filter({ hasText: /\S/ })
        .first();
      const errorText = await Promise.race([
        page
          .waitForURL("https://profile-v3.intra.42.fr/**", {
            waitUntil: "domcontentloaded",
            timeout: 18_000,
          })
          .then(() => undefined),
        formError
          .waitFor({ state: "visible", timeout: 18_000 })
          .then(() => formError.innerText({ timeout: 1_000 })),
      ]);
      if (res.writableEnded) return;
      if (errorText !== undefined && new URL(page.url()).hostname === "auth.42.fr") {
        res.statusCode = 401;
        const detail = errorText.trim().replaceAll(password, "[redacted]").slice(0, 300);
        res.end(JSON.stringify({ error: detail || "42 reported a sign-in error." }));
        return;
      }
      failure =
        "Intra42 could not read the session token after 42 opened the profile. Try signing in again.";
      const session = await page.waitForFunction(
        () => {
          if (location.origin !== "https://profile-v3.intra.42.fr") return null;
          for (let index = 0; index < sessionStorage.length; index++) {
            const key = sessionStorage.key(index);
            if (!key?.startsWith("oidc.user:")) continue;
            let value: {
              access_token?: unknown;
              expires_at?: unknown;
              refresh_token?: unknown;
            } | null;
            try {
              value = JSON.parse(sessionStorage.getItem(key) ?? "null");
            } catch {
              continue;
            }
            if (
              typeof value?.access_token === "string" &&
              typeof value.expires_at === "number" &&
              value.expires_at * 1000 - Date.now() >= 1000
            ) {
              return {
                access_token: value.access_token,
                expires_in: Math.floor(value.expires_at - Date.now() / 1000),
                storage_key: key,
                refresh_token: value.refresh_token,
              };
            }
          }
          return null;
        },
        undefined,
        { polling: 250, timeout: 20_000 },
      );
      const token = await session.jsonValue();
      if (!token) throw new Error("Missing session token.");
      // The dashboard can fetch these resources if the portal has not returned them yet.
      const [avatar] = await Promise.all([
        readAvatar(),
        Promise.race([Promise.all(dashboardRequests), delay(1_500)]),
        openSlotsSession(context).catch(() => {}),
      ]);
      if (res.writableEnded) return;
      const cookies = await context.cookies([
        "https://profile.intra.42.fr",
        "https://auth.42.fr",
        "https://signin.intra.42.fr",
      ]);
      if (res.writableEnded) return;
      failure = "42 did not provide a renewable session. Try signing in again.";
      const grant =
        storedRefreshGrant(token.storage_key, token.refresh_token) ?? (await refreshGrant);
      if (!grant || cancellation.signal.aborted) throw new Error("Missing refresh grant.");
      const refresh = await retainRefreshGrant(grant);
      refreshKey = refresh.key;
      // Verify renewal now so a successful login cannot silently expire a few minutes later.
      const renewed = await refreshSession(refresh.key);
      if (!renewed || cancellation.signal.aborted) throw new Error("Could not renew session.");
      await retainSlotSession(refresh.key, refresh.expiresIn, cookies);
      failure = "42 could not verify the completed session. Try signing in again.";
      const result = { ...renewed, ...dashboard, avatar, refresh_session: refresh.key };
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
      await browser?.close().catch(() => {});
      busy = false;
      if (refreshKey && !completedLogin)
        await forget(refreshKey).catch(() =>
          console.error("Could not discard the incomplete login."),
        );
    }
  };
}
