import { spawn } from "node:child_process";
import { existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

const project = process.env.REVIEW_FIREBASE_PROJECT ?? "";
if (!/^demo-[a-z0-9-]+$/.test(project)) throw new Error("Use a demo- Firebase project.");
if (!process.env.REVIEW_USERNAME || !process.env.REVIEW_PASSWORD)
  throw new Error("Configure the local review credentials in apps/mobile/.env.review.");

const state = "output/review-firestore";
const sessionDir = resolve("output/review-session");
mkdirSync(sessionDir, { mode: 0o700, recursive: true });
const firebase = spawn(
  "firebase",
  [
    "emulators:exec",
    "--config",
    "firebase.review.json",
    "--project",
    project,
    "--only",
    "firestore",
    ...(existsSync(`${state}/firebase-export-metadata.json`) ? ["--import", state] : []),
    "--export-on-exit",
    state,
    "npm run dev:mobile -- --localhost --port 8094",
  ],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      EXPO_PUBLIC_INTRA42_DEMO: "0",
      EXPO_PUBLIC_INTRA42_REVIEW: "1",
      EXPO_PUBLIC_INTRA42_OAUTH_URL: "http://127.0.0.1:8791",
      INTRA42_FUNCTIONS: "0",
      INTRA42_SESSION_FILE: resolve(sessionDir, "sessions.json"),
    },
  },
);
firebase.once("error", (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
process.once("SIGTERM", () => firebase.kill("SIGINT"));
firebase.once("exit", (code, signal) => {
  process.exitCode = code ?? (signal ? 1 : 0);
});
