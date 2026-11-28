import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const cwd = new URL("../", import.meta.url);
async function listen(server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  return `http://127.0.0.1:${server.address().port}`;
}
async function launch(origin, directory, { all = false, configured = origin } = {}) {
  const child = spawn(process.execPath, ["scripts/dev.mjs", ...(all ? ["--all"] : []), "--help"], {
    cwd,
    env: {
      ...process.env,
      EXPO_PUBLIC_INTRA42_OAUTH_URL: configured,
      PORT: new URL(origin).port,
      EXPO_PUBLIC_INTRA42_DEMO: "0",
      INTRA42_CLIENT_ID: "test-client",
      INTRA42_CLIENT_SECRET: "test-secret",
      INTRA42_SESSION_FILE: join(directory, "sessions.json"),
      INTRA42_REDIRECT_URI: `${origin}/callback`,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  let output = "";
  child.stdout.on("data", (data) => {
    output += data;
  });
  child.stderr.on("data", (data) => {
    output += data;
  });
  const timeout = setTimeout(() => child.kill("SIGKILL"), 15000);
  const [code] = await once(child, "exit");
  clearTimeout(timeout);
  return { code, output };
}

test("mobile start waits for its backend before Expo and stops its backend when Expo exits", async () => {
  const directory = await mkdtemp(join(tmpdir(), "intra42-dev-test-"));
  const reserve = createServer();
  const origin = await listen(reserve);
  await new Promise((resolve) => reserve.close(resolve));
  try {
    const { code, output } = await launch(origin, directory);
    assert.equal(code, 0, output);
    assert.ok(output.indexOf("Sign-in service ready") < output.indexOf("Usage"), output);
    await assert.rejects(fetch(`${origin}/health`));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test("mobile start reuses a healthy backend and leaves that independently started server running", async () => {
  const directory = await mkdtemp(join(tmpdir(), "intra42-dev-test-"));
  const server = createServer((_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ service: "intra42-sign-in" }));
  });
  const origin = await listen(server);
  try {
    const { code, output } = await launch(origin, directory);
    assert.equal(code, 0, output);
    assert.ok(!output.includes("Sign-in service listening"), output);
    assert.equal((await fetch(`${origin}/health`)).status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});

test("an occupied port that is not our backend fails before starting Metro", async () => {
  const directory = await mkdtemp(join(tmpdir(), "intra42-dev-test-"));
  const server = createServer((_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ service: "another-app" }));
  });
  const origin = await listen(server);
  try {
    const { code, output } = await launch(origin, directory);
    assert.equal(code, 1, output);
    assert.match(output, /Could not start the sign-in service/);
    assert.ok(!output.includes("Usage"), output);
    assert.equal((await fetch(`${origin}/health`)).status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});

test("dev:all starts and labels both services even behind an HTTPS proxy, then stops both", async () => {
  const directory = await mkdtemp(join(tmpdir(), "intra42-dev-all-test-"));
  const reserve = createServer();
  const origin = await listen(reserve);
  await new Promise((resolve) => reserve.close(resolve));
  try {
    const { code, output } = await launch(origin, directory, {
      all: true,
      configured: "https://example.test/intra42",
    });
    assert.equal(code, 0, output);
    assert.match(output, /\[Backend\] Sign-in service listening/);
    assert.match(output, /\[Metro\].*Usage/);
    assert.ok(output.indexOf("Sign-in service ready") < output.indexOf("Usage"), output);
    await assert.rejects(fetch(`${origin}/health`));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
test("dev:all refuses an independently running backend instead of hiding its output or stopping it", async () => {
  const directory = await mkdtemp(join(tmpdir(), "intra42-dev-all-test-"));
  const server = createServer((_req, res) => {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ service: "intra42-sign-in" }));
  });
  const origin = await listen(server);
  try {
    const { code, output } = await launch(origin, directory, { all: true });
    assert.equal(code, 1, output);
    assert.match(output, /Backend already running/);
    assert.ok(!output.includes("[Metro]"), output);
    assert.equal((await fetch(`${origin}/health`)).status, 200);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(directory, { recursive: true, force: true });
  }
});
