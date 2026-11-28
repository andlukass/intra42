import { spawn } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
mkdirSync(resolve(root, ".firebase"), { recursive: true, mode: 0o700 });
chmodSync(resolve(root, ".firebase"), 0o700);
// Reuse local credentials without copying them into source or the build output.
const source = resolve(root, "apps/mobile/.env");
if (existsSync(source)) {
  const secrets = readFileSync(source, "utf8")
    .split("\n")
    .filter((line) => /^INTRA42_CLIENT_(ID|SECRET)=/.test(line));
  writeFileSync(resolve(root, "apps/functions/.secret.local"), `${secrets.join("\n")}\n`, {
    mode: 0o600,
  });
  chmodSync(resolve(root, "apps/functions/.secret.local"), 0o600);
}
const run = (args) =>
  spawn(process.execPath, args, { cwd: root, stdio: "inherit", env: process.env });
const compiled = spawn("npm", ["run", "build", "--workspace", "@intra42/functions"], {
  cwd: root,
  stdio: "inherit",
});
compiled.once("exit", (code) => {
  if (code) {
    process.exitCode = code;
    return;
  }
  const watcher = spawn(process.execPath, ["build.mjs", "--watch"], {
    cwd: resolve(root, "apps/functions"),
    stdio: "inherit",
  });
  const child = run([
    "node_modules/firebase-tools/lib/bin/firebase.js",
    "emulators:start",
    "--only",
    "functions,firestore,hosting",
    "--export-on-exit",
    ".firebase/emulator-data",
    ...(existsSync(resolve(root, ".firebase/emulator-data/firebase-export-metadata.json"))
      ? ["--import", ".firebase/emulator-data"]
      : []),
    "--project",
    process.env.INTRA42_FIREBASE_PROJECT || "demo-intra42",
  ]);
  for (const signal of ["SIGINT", "SIGTERM"])
    process.once(signal, () => {
      watcher.kill(signal);
      child.kill(signal);
    });
  child.once("exit", (code) => {
    watcher.kill();
    process.exitCode = code || 0;
  });
});
