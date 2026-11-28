import { createHash, randomBytes } from "node:crypto";
import { load } from "cheerio";
import { request } from "playwright";

function assert(ok: unknown, message: string): asserts ok {
  if (!ok) throw new Error(message);
}
export async function httpSignIn(
  username: string,
  password: string,
  remember = false,
  signal?: AbortSignal,
) {
  const c = await request.newContext({ timeout: 10000 });
  const abort = () => {
    void c.dispose().catch(() => {});
  };
  signal?.addEventListener("abort", abort, { once: true });
  try {
    signal?.throwIfAborted();
    const issuer = "https://auth.42.fr/auth/realms/students-42";
    const discovery = await (await c.get(`${issuer}/.well-known/openid-configuration`)).json();
    const verifier = randomBytes(32).toString("base64url"),
      state = randomBytes(16).toString("hex");
    const redirect = "https://profile-v3.intra.42.fr";
    const url = new URL(discovery.authorization_endpoint);
    url.search = new URLSearchParams({
      client_id: "frontend-react",
      redirect_uri: redirect,
      response_type: "code",
      scope: "openid profile email",
      state,
      code_challenge: createHash("sha256").update(verifier).digest("base64url"),
      code_challenge_method: "S256",
    }).toString();
    const login = await c.get(url.toString());
    const $ = load(await login.text());
    const action = $("#kc-form-login").attr("action");
    assert(action && new URL(action).origin === "https://auth.42.fr", "No supported login form");

    const credentials = { username, password, ...(remember ? { rememberMe: "on" } : {}) };
    const form: Record<string, string> = {};
    $("#kc-form-login input[type=hidden]").each((_, el) => {
      const name = $(el).attr("name");
      if (name) form[name] = $(el).attr("value") ?? "";
    });
    Object.assign(form, credentials);
    let response = await c.post(action, { form, maxRedirects: 0 });
    delete form.password;
    let callback: URL | undefined;
    for (let i = 0; i < 15; i++) {
      const loc = response.headers().location;

      if (!loc) break;
      const next = new URL(loc, response.url());
      if (next.origin === new URL(redirect).origin && next.searchParams.has("code")) {
        callback = next;
        break;
      }
      assert(
        next.protocol === "https:" &&
          (next.hostname === "42.fr" || next.hostname.endsWith(".42.fr")),
        "Unexpected redirect",
      );
      response = await c.get(next.toString(), { maxRedirects: 0 });
    }
    assert(callback, "Login did not produce authorization code");
    assert(callback.searchParams.get("state") === state, "State mismatch");
    const tokenResponse = await c.post(discovery.token_endpoint, {
      form: {
        grant_type: "authorization_code",
        client_id: "frontend-react",
        redirect_uri: redirect,
        code: callback.searchParams.get("code") ?? "",
        code_verifier: verifier,
      },
      maxRedirects: 0,
    });
    const tokens = await tokenResponse.json();
    assert(
      tokenResponse.ok() && tokens.access_token && tokens.refresh_token,
      "Token exchange failed",
    );

    // Follow the legacy portal SSO flow to establish its own cookies.
    const portal = await c.get("https://profile.intra.42.fr/slots");
    assert(
      portal.ok() && new URL(portal.url()).origin === "https://profile.intra.42.fr",
      "Portal SSO failed",
    );
    const { cookies } = await c.storageState();
    return {
      grant: {
        endpoint: discovery.token_endpoint as string,
        clientId: "frontend-react",
        refreshToken: tokens.refresh_token as string,
        expiresIn: tokens.refresh_expires_in as number,
      },
      cookies,
    };
  } finally {
    signal?.removeEventListener("abort", abort);
    await c.dispose();
  }
}
