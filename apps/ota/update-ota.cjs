const { execFileSync } = require("node:child_process");
const { mkdirSync, mkdtempSync } = require("node:fs");
const { join, relative, resolve } = require("node:path");
const { parseArgs } = require("node:util");

const usage =
  "Usage: npm run update:ota -- [--platform ios|android|both] [--channel preview|production] [--prepare-only]";

function main() {
  const { values } = parseArgs({
    options: {
      platform: { type: "string", default: "both" },
      channel: { type: "string", default: "production" },
      "prepare-only": { type: "boolean" },
      help: { type: "boolean", short: "h" },
    },
  });
  if (values.help) {
    console.log(usage);
    return;
  }
  const { platform, channel } = values;
  if (!["ios", "android", "both"].includes(platform)) throw new Error("Invalid OTA platform.");
  if (!["preview", "production"].includes(channel)) throw new Error("Invalid OTA channel.");

  const cwd = resolve(__dirname, "../..");
  const env = { ...process.env, OTA_CHANNEL: channel };
  const run = (bin, args) => execFileSync(bin, args, { cwd, env, stdio: "inherit" });
  const prepareOnly = values["prepare-only"];
  console.log(`${prepareOnly ? "Preparing" : "Publishing"} ${platform} OTA for ${channel}.`);
  if (!prepareOnly) {
    run("gcloud", ["--version"]);
  }

  const artifacts = join(cwd, "output");
  mkdirSync(artifacts, { recursive: true });
  const output = mkdtempSync(join(artifacts, "ota-"));
  console.log(`OTA files: ${relative(cwd, output)}`);
  for (const target of platform === "both" ? ["ios", "android"] : [platform]) {
    run(process.execPath, ["apps/ota/prepare-ota.cjs", target, output]);
  }
  if (!prepareOnly) run(process.execPath, ["apps/ota/upload-ota.cjs", output]);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  console.error(usage);
  process.exitCode = 1;
}
