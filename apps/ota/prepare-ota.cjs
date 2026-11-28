const { execFileSync } = require("node:child_process");
const { createHash, randomUUID } = require("node:crypto");
const { existsSync, mkdirSync, readFileSync, writeFileSync } = require("node:fs");
const { basename, extname, join, resolve } = require("node:path");

const [platform, output] = process.argv.slice(2);
if (!["ios", "android"].includes(platform) || !output) {
  throw new Error("Usage: node apps/ota/prepare-ota.cjs <ios|android> <output-directory>");
}

const otaEnv = resolve(__dirname, ".env");
if (existsSync(otaEnv)) process.loadEnvFile(otaEnv);
const bucket = process.env.OTA_STORAGE_BUCKET;
if (!bucket || !process.env.OTA_UPDATE_URL) {
  throw new Error("Set OTA_STORAGE_BUCKET and OTA_UPDATE_URL before preparing an update.");
}
const cwd = resolve(__dirname, "../mobile");
const outputDir = resolve(output, platform);
const exportDir = join(outputDir, "export");
const run = (bin, args) =>
  execFileSync("npx", ["--no-install", bin, ...args], {
    cwd,
    env: { ...process.env, CI: "1", EXPO_NO_TELEMETRY: "1" },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "inherit"],
  });

const config = JSON.parse(run("expo", ["config", "--type", "public", "--json"]));
const channel = config.updates.requestHeaders["expo-channel-name"];
const { runtimeVersion } = JSON.parse(
  run("expo-updates", ["runtimeversion:resolve", "--platform", platform, "--workflow", "managed"]),
);
if (!/^[a-f0-9]{40}$/.test(runtimeVersion ?? "")) {
  throw new Error("Expo did not resolve a fingerprint runtime.");
}

mkdirSync(outputDir, { recursive: true });
console.log(run("expo", ["export", "--platform", platform, "--output-dir", exportDir]));
const metadata = JSON.parse(readFileSync(join(exportDir, "metadata.json"), "utf8"));
const { bundle, assets } = metadata.fileMetadata[platform];
const id = randomUUID();
const prefix = `intra42-assets/${platform}/${channel}/${runtimeVersion}/${id}`;
const contentTypes = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  ttf: "font/ttf",
  otf: "font/otf",
};

function manifestAsset(path, ext) {
  const key = ext ? basename(path) : basename(path, extname(path));
  return {
    key,
    url: `https://storage.googleapis.com/${bucket}/${prefix}/${path.split("/").map(encodeURIComponent).join("/")}`,
    hash: createHash("sha256")
      .update(readFileSync(join(exportDir, path)))
      .digest("base64url"),
    contentType: ext ? (contentTypes[ext] ?? "application/octet-stream") : "application/javascript",
    ...(ext ? { fileExtension: `.${ext}` } : {}),
  };
}

const manifest = {
  id,
  createdAt: new Date().toISOString(),
  runtimeVersion,
  launchAsset: manifestAsset(bundle),
  assets: assets.map(({ path, ext }) => manifestAsset(path, ext)),
  metadata: { channel },
  extra: { expoClient: config, scopeKey: config.updates.url },
};
writeFileSync(join(outputDir, "manifest.json"), JSON.stringify(manifest));
writeFileSync(
  join(outputDir, "release.json"),
  JSON.stringify({
    bucket,
    prefix,
    active: `intra42-active/${platform}/${channel}/${runtimeVersion}.json`,
  }),
);
console.log(`Prepared ${platform} ${channel} update for runtime ${runtimeVersion}`);
