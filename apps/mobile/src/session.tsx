import { useQueryClient } from "@tanstack/react-query";
import * as SecureStore from "expo-secure-store";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { AppState } from "react-native";
import { requestSession, SessionError } from "./session-api";
import { browserSignIn } from "./session-browser";
import { type Token, validToken } from "./session-token";

type Session = {
  token: Token | null;
  signIn: () => Promise<void>;
  logout: () => Promise<void>;
  loading: boolean;
};
const context = createContext<Session | null>(null);
export const review = __DEV__ && process.env.EXPO_PUBLIC_INTRA42_REVIEW === "1";
const storageKey = review ? "intra42.review.v1" : "intra42.portal.v1";
function serviceOrigin(value: string | undefined) {
  if (!value) return;
  try {
    const url = new URL(value);
    const local =
      __DEV__ && url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
    if (
      (url.protocol === "https:" || local) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    )
      return url.origin + url.pathname.replace(/\/+$/, "");
  } catch {
    return undefined;
  }
}
export const broker = serviceOrigin(process.env.EXPO_PUBLIC_INTRA42_OAUTH_URL);
export const demo = __DEV__ && process.env.EXPO_PUBLIC_INTRA42_DEMO === "1";
const demoToken = { accessToken: "demo", expiresAt: Infinity };

async function exchange(
  path: string,
  token?: string,
  credentials?: URLSearchParams,
): Promise<Token> {
  const data = await requestSession(broker, path, token, credentials);
  if (!validToken(data)) throw new Error("Invalid sign-in response.");
  return data;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<Token | null>(demo ? demoToken : null);
  const [loading, setLoading] = useState(!demo);
  const client = useQueryClient();
  const revision = useRef(0);
  const storage = useRef(Promise.resolve());

  const save = useCallback((next: Token | null) => {
    const operation = storage.current
      .catch(() => {})
      .then(() =>
        next
          ? SecureStore.setItemAsync(storageKey, JSON.stringify(next))
          : SecureStore.deleteItemAsync(storageKey),
      );
    storage.current = operation;
    return operation;
  }, []);

  useEffect(() => {
    if (demo) return;
    let alive = true;
    const version = revision.current;
    async function restore() {
      try {
        const saved = await SecureStore.getItemAsync(storageKey);
        if (!saved || !alive || version !== revision.current) return;
        const previous: unknown = JSON.parse(saved);
        if (!validToken(previous)) {
          await save(null);
          return;
        }
        let next = previous;
        try {
          next = await exchange("restore", previous.accessToken);
        } catch (error) {
          if (error instanceof SessionError && [400, 401, 403].includes(error.status)) {
            if (alive && version === revision.current) await save(null);
            return;
          }
        }
        // The refresh effect retries expired sessions after a temporary network failure.
        if (alive && version === revision.current) setToken(next);
      } catch {
        if (alive && version === revision.current) setToken(null);
      } finally {
        if (alive) setLoading(false);
      }
    }
    void restore();
    return () => {
      alive = false;
    };
  }, [save]);

  async function logout() {
    revision.current++;
    const current = token;
    setToken(null);
    client.clear();
    await save(null);
    if (broker && current && current !== demoToken) {
      await requestSession(broker, "logout", current.accessToken).catch(() => {});
    }
  }

  useEffect(() => {
    if (!token || token === demoToken) return;
    let active = true;
    let pending = false;
    let timer: ReturnType<typeof setTimeout>;
    const current = token;
    const version = revision.current;
    async function renew() {
      if (pending) return;
      pending = true;
      try {
        if (!current.refreshToken) throw new SessionError("Session expired.", 401);
        const next = await exchange("refresh", current.refreshToken);
        if (!active || version !== revision.current) return;
        await save(next);
        if (active && version === revision.current) setToken(next);
      } catch (error) {
        if (!active || version !== revision.current) return;
        if (error instanceof SessionError && [400, 401, 403].includes(error.status)) {
          setToken(null);
          client.clear();
          await save(null).catch(() => {});
        } else timer = setTimeout(() => void renew(), 15_000);
      } finally {
        pending = false;
      }
    }
    const lead = current.refreshToken ? 30_000 : 0;
    timer = setTimeout(() => void renew(), Math.max(0, current.expiresAt - Date.now() - lead));
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active" && current.expiresAt - Date.now() <= lead) {
        clearTimeout(timer);
        void renew();
      }
    });
    return () => {
      active = false;
      clearTimeout(timer);
      subscription.remove();
    };
  }, [client, token, save]);

  async function signIn() {
    const version = ++revision.current;
    const next = demo ? demoToken : await browserSignIn(broker);
    if (!next) return;
    if (version !== revision.current) return;
    await save(next);
    if (version !== revision.current) return;
    client.clear();
    setToken(next);
  }

  return <context.Provider value={{ token, loading, signIn, logout }}>{children}</context.Provider>;
}

export function useSession() {
  const value = useContext(context);
  if (!value) throw new Error("Missing session provider.");
  return value;
}
