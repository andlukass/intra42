import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { setTimeout as delay } from "node:timers/promises";

const require = createRequire(import.meta.url);
const children = [];
let stopping = false;

function launch(args, env = process.env) {
  const child = spawn(process.execPath, args, { stdio: "inherit", env });
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
  for (const child of children) child.kill(signal);
}
process.once("SIGINT", () => stop("SIGINT"));
process.once("SIGTERM", () => stop());

async function run() {
  const configured = process.env.EXPO_PUBLIC_INTRA42_OAUTH_URL;
  if (configured && process.env.EXPO_PUBLIC_INTRA42_DEMO !== "1") {
    const origin = new URL(configured);
    if (origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname)) {
      if (!(await healthy(origin.origin))) {
        const service = launch(["--experimental-strip-types", "server/oauth.mjs"], {
          ...process.env,
          PORT: origin.port || "80",
        });
        for (let attempt = 0; !(await healthy(origin.origin)); attempt++) {
          if (stopping) return;
          if (service.exitCode !== null || service.signalCode !== null || attempt >= 50)
            throw new Error(`Could not start the sign-in service at ${origin.origin}.`);
          await delay(100);
        }
        service.once("exit", (code) => {
          if (!stopping) {
            console.error("The sign-in service stopped. Restart npm run dev:mobile.");
            process.exitCode = code || 1;
            stop();
          }
        });
      }
      console.log(`Sign-in service ready at ${origin.origin}`);
    }
  }
  if (stopping) return;
  const metro = launch([
    require.resolve("expo/bin/cli"),
    "start",
    "--dev-client",
    ...process.argv.slice(2),
  ]);
  metro.once("exit", (code) => {
    if (!stopping) process.exitCode = code || 0;
    stop();
  });
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
  stop();
});
