import { useQueryClient } from "@tanstack/react-query";
import * as Crypto from "expo-crypto";
import * as SecureStore from "expo-secure-store";
import * as WebBrowser from "expo-web-browser";
import { createContext, type ReactNode, useContext, useEffect, useRef, useState } from "react";

type Token = { accessToken: string; refreshToken?: string; expiresAt: number };
type Session = {
  token: Token | null;
  signIn: () => Promise<void>;
  logout: () => Promise<void>;
  loading: boolean;
};
const context = createContext<Session | null>(null);
const storageKey = "intra42.oauth.v1";
function oauthOrigin(value: string | undefined) {
  if (!value) return;
  const url = new URL(value);
  const local =
    __DEV__ && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
  if ((url.protocol === "https:" || local) && !url.username && !url.password) return url.origin;
}
export const broker = oauthOrigin(process.env.EXPO_PUBLIC_INTRA42_OAUTH_URL);
export const demo = __DEV__ && process.env.EXPO_PUBLIC_INTRA42_DEMO === "1";
const demoToken = { accessToken: "demo", expiresAt: Infinity };

async function exchange(path: string, payload: object): Promise<Token> {
  if (!broker) throw new Error("Configure the HTTPS OAuth service URL.");
  const response = await fetch(broker + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`42 sign-in returned HTTP ${response.status}.`);
  const token = await response.json();
  if (typeof token.accessToken !== "string" || !Number.isFinite(token.expiresAt)) {
    throw new Error("Invalid OAuth response.");
  }
  return token;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<Token | null>(demo ? demoToken : null);
  const [loading, setLoading] = useState(!demo);
  const client = useQueryClient();
  const signingOut = useRef(false);
  useEffect(() => {
    if (demo) return;
    let alive = true;
    async function restore() {
      try {
        const saved = await SecureStore.getItemAsync(storageKey);
        if (!saved || !alive) return;
        const previous: Token = JSON.parse(saved);
        const next =
          previous.expiresAt > Date.now()
            ? previous
            : previous.refreshToken
              ? await exchange("/refresh", { refreshToken: previous.refreshToken })
              : null;
        if (alive && next) {
          await SecureStore.setItemAsync(storageKey, JSON.stringify(next));
          if (alive) setToken(next);
        }
      } catch {
        if (alive) setToken(null);
      } finally {
        if (alive) setLoading(false);
      }
    }
    void restore();
    return () => {
      alive = false;
    };
  }, []);

  async function logout() {
    signingOut.current = true;
    setToken(null);
    client.clear();
    await SecureStore.deleteItemAsync(storageKey);
  }

  useEffect(() => {
    if (!token || token === demoToken) return;
    let active = true;
    const current = token;
    const timer = setTimeout(
      async () => {
        try {
          if (!current.refreshToken) throw new Error("Session expired.");
          const next = await exchange("/refresh", { refreshToken: current.refreshToken });
          if (!active || signingOut.current) return;
          await SecureStore.setItemAsync(storageKey, JSON.stringify(next));
          if (active && !signingOut.current) setToken(next);
        } catch {
          if (active) {
            setToken(null);
            client.clear();
          }
        }
      },
      Math.max(0, current.expiresAt - Date.now()),
    );
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [client, token]);

  async function signIn() {
    signingOut.current = false;
    if (demo) {
      setToken(demoToken);
      return;
    }
    if (!broker) throw new Error("Configure the HTTPS OAuth service URL.");
    const state = (await Crypto.getRandomBytesAsync(32)).reduce(
      (s, byte) => s + byte.toString(16).padStart(2, "0"),
      "",
    );
    const verifier = (await Crypto.getRandomBytesAsync(32)).reduce(
      (s, byte) => s + byte.toString(16).padStart(2, "0"),
      "",
    );
    const challenge = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier);
    const callback = "intra42://oauth";
    const result = await WebBrowser.openAuthSessionAsync(
      `${broker}/authorize?${new URLSearchParams({ state, challenge })}`,
      callback,
    );
    if (result.type !== "success") return;
    const url = new URL(result.url);
    if (
      url.protocol !== "intra42:" ||
      url.hostname !== "oauth" ||
      url.searchParams.get("state") !== state
    ) {
      throw new Error("The OAuth callback was invalid.");
    }
    if (url.searchParams.get("status") !== "ok") throw new Error("42 declined authorization.");
    const next = await exchange("/exchange", { state, verifier });
    await SecureStore.setItemAsync(storageKey, JSON.stringify(next));
    setToken(next);
  }

  return <context.Provider value={{ token, loading, signIn, logout }}>{children}</context.Provider>;
}

export function useSession() {
  const value = useContext(context);
  if (!value) throw new Error("Missing session provider.");
  return value;
}
