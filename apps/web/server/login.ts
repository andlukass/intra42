import { setTimeout as delay } from "node:timers/promises";
import { type BrowserContext, chromium, type Page } from "playwright";
import type { Plugin } from "vite";
import { watchPortalAvatar } from "./avatar.js";
import { isLocalPost, readIntra } from "./intra.js";
import { manageRefresh, observeRefreshGrant, retainRefreshGrant } from "./refresh.js";
import { manageSlots, retainSlotSession } from "./slots.js";

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

export function localLogin(): Plugin {
  let busy = false;
  return {
    name: "local-42-login",
    configureServer(server) {
      server.middlewares.use("/local-api/intra", readIntra);
      server.middlewares.use("/local-api/slots", manageSlots);
      server.middlewares.use("/local-api/session/refresh", manageRefresh);

      server.middlewares.use("/local-api/login", async (req, res) => {
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Type", "application/json");
        if (!isLocalPost(req)) {
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
        let failure = "Could not start the local Chrome session.";
        const deadline = setTimeout(() => {
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
            if (raw.length > 8192) throw new Error("Invalid request.");
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
          page.setDefaultTimeout(10_000);
          await page.goto("https://profile-v3.intra.42.fr/", { waitUntil: "domcontentloaded" });
          await page.locator('input[name="username"]').waitFor();
          if (new URL(page.url()).hostname !== "auth.42.fr") {
            throw new Error("Unexpected login destination.");
          }
          await page.locator('input[name="username"]').fill(username);
          await page.locator('input[name="password"]').fill(password);
          const dashboard: Partial<Record<"coalition" | "logtime", unknown>> = {};
          const dashboardRequests = (["coalition", "logtime"] as const).map((resource) =>
            readPortalData(page, resource).then((data) => {
              dashboard[resource] = data;
            }),
          );
          failure =
            "42 did not finish signing in. Check whether the official sign-in page asks for an extra verification step.";
          const refreshGrant = observeRefreshGrant(page);
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
                let value: { access_token?: unknown; expires_at?: unknown } | null;
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
                  };
                }
              }
              return null;
            },
            undefined,
            { polling: 250, timeout: 20_000 },
          );
          const token = await session.jsonValue();
          // The dashboard can fetch these resources if the portal has not returned them yet.
          const [avatar, , , grant] = await Promise.all([
            readAvatar(),
            Promise.race([Promise.all(dashboardRequests), delay(1_500)]),
            openSlotsSession(context).catch(() => {}),
            Promise.race([refreshGrant, delay(1_500, null)]),
          ]);
          if (res.writableEnded) return;
          let refresh: ReturnType<typeof retainRefreshGrant> | undefined;
          if (token) {
            const cookies = await context.cookies([
              "https://profile.intra.42.fr",
              "https://auth.42.fr",
              "https://signin.intra.42.fr",
            ]);
            if (res.writableEnded) return;
            refresh = grant ? retainRefreshGrant(grant) : undefined;
            retainSlotSession(
              refresh?.key ?? token.access_token,
              refresh?.expiresIn ?? token.expires_in,
              cookies,
            );
          }
          res.end(
            JSON.stringify({ ...token, ...dashboard, avatar, refresh_session: refresh?.key }),
          );
        } catch {
          if (!res.writableEnded) {
            res.statusCode = 502;
            res.end(JSON.stringify({ error: failure }));
          }
        } finally {
          clearTimeout(deadline);
          await browser?.close().catch(() => {});
          busy = false;
        }
      });
    },
  };
}
