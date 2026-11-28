const { execFileSync } = require("node:child_process");
const { createHash, randomUUID } = require("node:crypto");
const { existsSync, readFileSync } = require("node:fs");
const { join, resolve, sep } = require("node:path");

async function publishOta(root) {
  if (!root) throw new Error("Usage: node apps/ota/upload-ota.cjs <prepared-updates-directory>");
  const releases = ["ios", "android"]
    .filter((platform) => existsSync(join(root, platform)))
    .map((platform) => {
      const dir = join(root, platform);
      const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8"));
      const release = JSON.parse(readFileSync(join(dir, "release.json"), "utf8"));
      const channel = manifest.metadata.channel;
      const expected = `${platform}/${channel}/${manifest.runtimeVersion}`;
      if (
        !["preview", "production"].includes(channel) ||
        release.prefix !== `intra42-assets/${expected}/${manifest.id}` ||
        release.active !== `intra42-active/${expected}.json`
      )
        throw new Error(`Invalid ${platform} release paths.`);
      return { platform, dir, manifest, release };
    });
  if (!releases.length) throw new Error("No prepared iOS or Android updates found.");
  const token = execFileSync("gcloud", ["auth", "print-access-token"], { encoding: "utf8" }).trim();

  async function upload(bucket, name, bytes, contentType, immutable) {
    const boundary = randomUUID();
    const metadata = {
      name,
      contentType,
      cacheControl: immutable ? "public,max-age=31536000,immutable" : "private,no-store",
    };
    const body = Buffer.concat([
      Buffer.from(
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${contentType}\r\n\r\n`,
      ),
      bytes,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    // Direct insertion avoids gcloud storage cp's metadata read permission requirement.
    const url = new URL(
      `https://storage.googleapis.com/upload/storage/v1/b/${encodeURIComponent(bucket)}/o`,
    );
    url.searchParams.set("uploadType", "multipart");
    if (immutable) url.searchParams.set("ifGenerationMatch", "0");
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body,
      signal: AbortSignal.timeout(120_000),
    });
    // A resumed upload may already exist; its public bytes must still pass hash verification.
    if (!response.ok && !(immutable && response.status === 412))
      throw new Error(`Upload ${name} failed: HTTP ${response.status}`);
    await response.arrayBuffer();
  }

  for (const { dir, manifest, release } of releases) {
    const assets = [manifest.launchAsset, ...manifest.assets];
    for (let start = 0; start < assets.length; start += 4) {
      await Promise.all(
        assets.slice(start, start + 4).map(async (asset) => {
          const url = new URL(asset.url);
          const base = `https://storage.googleapis.com/${release.bucket}/`;
          const object = decodeURIComponent(url.pathname.slice(release.bucket.length + 2));
          if (!url.href.startsWith(base) || !object.startsWith(`${release.prefix}/`))
            throw new Error("Invalid OTA asset URL.");
          const exportDir = resolve(dir, "export");
          const file = resolve(exportDir, object.slice(release.prefix.length + 1));
          if (!file.startsWith(exportDir + sep)) throw new Error("Invalid OTA asset path.");
          const bytes = readFileSync(file);
          const hash = (value) => createHash("sha256").update(value).digest("base64url");
          if (hash(bytes) !== asset.hash) throw new Error(`Local asset hash mismatch: ${object}`);
          await upload(release.bucket, object, bytes, asset.contentType, true);
          const response = await fetch(url, { signal: AbortSignal.timeout(120_000) });
          if (!response.ok) throw new Error(`Asset verification failed: HTTP ${response.status}`);
          if (hash(Buffer.from(await response.arrayBuffer())) !== asset.hash)
            throw new Error(`Published asset hash mismatch: ${object}`);
        }),
      );
    }
  }
  console.log("All OTA bundles and assets uploaded and verified.");
  for (const { platform, dir, manifest, release } of releases) {
    await upload(
      release.bucket,
      release.active,
      readFileSync(join(dir, "manifest.json")),
      "application/json",
      false,
    );
    const response = await fetch(manifest.extra.scopeKey, {
      headers: {
        "expo-platform": platform,
        "expo-runtime-version": manifest.runtimeVersion,
        "expo-channel-name": manifest.metadata.channel,
        "expo-protocol-version": "1",
      },
      signal: AbortSignal.timeout(60_000),
    });
    if (!response.ok)
      throw new Error(`${platform} manifest verification failed: HTTP ${response.status}`);
    const active = await response.json();
    if (active.id !== manifest.id || active.runtimeVersion !== manifest.runtimeVersion)
      throw new Error(`${platform} active manifest mismatch.`);
    console.log(`Published ${platform} ${manifest.metadata.channel} update ${manifest.id}.`);
  }
}

module.exports = { publishOta };
if (require.main === module)
  publishOta(process.argv[2]).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
