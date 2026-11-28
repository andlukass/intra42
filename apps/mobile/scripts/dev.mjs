import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";
import { createDevTerminal } from "./dev-terminal.mjs";

const require = createRequire(import.meta.url);
const all = process.argv.includes("--all");
const metroArgs = process.argv.slice(2).filter((arg) => arg !== "--all");
const portIndex = metroArgs.indexOf("--port");
const metroPort = portIndex >= 0 ? metroArgs[portIndex + 1] : "8081";
const detached = all && process.platform !== "win32";
const children = [];
let stopping = false;

const backendOrigin = `http://127.0.0.1:${process.env.PORT || "8787"}`;
const terminal = all
  ? createDevTerminal(
      `Intra42 local development
  1  Metro     http://localhost:${metroPort}
  2  Backend   ${backendOrigin}
     App API   ${process.env.EXPO_PUBLIC_INTRA42_OAUTH_URL || backendOrigin}`,
      ["Metro", "Backend"],
      () => stop("SIGINT"),
    )
  : undefined;

function launch(args, env = process.env, name) {
  const child = spawn(process.execPath, args, {
    stdio: all ? ["ignore", "pipe", "pipe"] : "inherit",
    env,
    detached,
  });
  if (terminal) terminal.watch(name, child);
  child.once("error", (error) => {
    process.exitCode = 1;
    stop();
    console.error(`${name || "Service"}: ${error.message}`);
  });
  children.push(child);
  return child;
}

async function healthy(origin) {
  try {
    const response = await fetch(`${origin}/health`, { signal: AbortSignal.timeout(1000) });
    return response.ok && (await response.json()).service === "intra42-sign-in";
  } catch {
    return false;
  }
}

function stop(signal = "SIGTERM") {
  stopping = true;
  terminal?.close();
  for (const child of children) {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null) continue;
    try {
      if (detached) process.kill(-child.pid, signal);
      else child.kill(signal);
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  }
}
process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop());

async function run() {
  const configured = process.env.EXPO_PUBLIC_INTRA42_OAUTH_URL;
  if (all || (configured && process.env.EXPO_PUBLIC_INTRA42_DEMO !== "1")) {
    const origin = new URL(all ? backendOrigin : configured);
    if (origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname)) {
      const ready = await healthy(origin.origin);
      if (all && ready)
        throw new Error(
          `Backend already running at ${origin.origin}. Stop login:mobile or the existing dev session before running dev:all.`,
        );
      if (!ready) {
        const service = launch(
          ["--experimental-strip-types", "server/oauth.mjs"],
          {
            ...process.env,
            PORT: origin.port || "80",
          },
          "Backend",
        );
        for (let attempt = 0; !(await healthy(origin.origin)); attempt++) {
          if (stopping) return;
          if (service.exitCode !== null || service.signalCode !== null || attempt >= 50)
            throw new Error(`Could not start the sign-in service at ${origin.origin}.`);
          await delay(100);
        }
        service.once("exit", (code) => {
          if (!stopping) {
            process.exitCode = code || 1;
            stop();
            console.error(
              `The sign-in service stopped. Restart npm run ${all ? "dev:all" : "dev:mobile"}.`,
            );
            if (terminal) console.error(terminal.recent("Backend"));
          }
        });
      }
      console.log(`Sign-in service ready at ${origin.origin}`);
    }
  }
  if (stopping) return;
  const metro = launch(
    [require.resolve("expo/bin/cli"), "start", "--dev-client", ...metroArgs],
    process.env,
    "Metro",
  );
  metro.once("exit", (code) => {
    if (!stopping) {
      process.exitCode = code || 0;
      stop();
      if (code && terminal) console.error(terminal.recent("Metro"));
    }
  });
}

run().catch((error) => {
  process.exitCode = 1;
  stop();
  console.error(error.message);
  if (terminal) console.error(terminal.recent("All"));
});
