const { existsSync } = require("node:fs");
const { resolve } = require("node:path");

const otaEnv = resolve(__dirname, "../ota/.env");
if (existsSync(otaEnv)) process.loadEnvFile(otaEnv);

module.exports = ({ config }) => {
  const channel = process.env.OTA_CHANNEL ?? "production";
  if (!["preview", "production"].includes(channel)) {
    throw new Error("OTA_CHANNEL must be preview or production.");
  }
  return {
    ...config,
    updates: {
      ...config.updates,
      url: process.env.OTA_UPDATE_URL || undefined,
      enabled: Boolean(process.env.OTA_UPDATE_URL),
      requestHeaders: { ...config.updates.requestHeaders, "expo-channel-name": channel },
    },
  };
};
