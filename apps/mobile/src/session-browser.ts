import * as Crypto from "expo-crypto";
import * as WebBrowser from "expo-web-browser";
import { requestSession } from "./session-api";
import { validToken } from "./session-token";

async function random() {
  return (await Crypto.getRandomBytesAsync(32)).reduce(
    (value, byte) => value + byte.toString(16).padStart(2, "0"),
    "",
  );
}

export async function browserSignIn(broker: string | undefined) {
  if (!broker) throw new Error("Configure the HTTPS sign-in service URL.");
  const [state, verifier] = await Promise.all([random(), random()]);
  const challenge = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, verifier);
  const started = await requestSession(
    broker,
    "start",
    undefined,
    new URLSearchParams({ state, challenge }),
  );
  if (
    !started ||
    typeof started !== "object" ||
    !("path" in started) ||
    typeof started.path !== "string" ||
    !/^\/sign-in\?transaction=[a-f0-9]{64}$/.test(started.path)
  )
    throw new Error("Invalid sign-in transaction.");
  const transaction = new URL(broker + started.path).searchParams.get("transaction") as string;
  const proof = { transaction, state, verifier };
  let completed = false;
  try {
    const result = await WebBrowser.openAuthSessionAsync(broker + started.path, "intra42://oauth");
    if (result.type !== "success") return null;
    const callback = new URL(result.url);
    if (
      callback.protocol !== "intra42:" ||
      callback.hostname !== "oauth" ||
      callback.pathname !== "" ||
      callback.port ||
      callback.username ||
      callback.password ||
      callback.searchParams.get("state") !== state
    )
      throw new Error("The sign-in callback was invalid. Try again.");
    if (callback.searchParams.get("error") === "cancelled") return null;
    const code = callback.searchParams.get("code") ?? "";
    if (!/^[a-f0-9]{64}$/.test(code))
      throw new Error("The sign-in callback was invalid. Try again.");
    const session = await requestSession(
      broker,
      "exchange",
      undefined,
      new URLSearchParams({ ...proof, code }),
    );
    if (!validToken(session)) throw new Error("Invalid sign-in response.");
    completed = true;
    return session;
  } finally {
    if (!completed) {
      void requestSession(broker, "cancel", undefined, new URLSearchParams(proof)).catch(() => {});
    }
  }
}
