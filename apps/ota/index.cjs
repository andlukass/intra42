const { initializeApp } = require("firebase-admin/app");
const { getStorage } = require("firebase-admin/storage");
const { defineString } = require("firebase-functions/params");
const { onRequest } = require("firebase-functions/v2/https");
const { serveManifest } = require("./manifest.cjs");

const storageBucket = defineString("OTA_STORAGE_BUCKET");
const serviceAccount = defineString("OTA_SERVICE_ACCOUNT");
const region = defineString("OTA_FUNCTION_REGION");
initializeApp();

exports.intra42Updates = onRequest(
  {
    region,
    maxInstances: 5,
    invoker: "public",
    serviceAccount,
  },
  (request, response) =>
    serveManifest(request, response, async (key) => {
      try {
        const [manifest] = await getStorage().bucket(storageBucket.value()).file(key).download();
        return manifest;
      } catch (error) {
        if (error.code === 404) return null;
        throw error;
      }
    }),
);
