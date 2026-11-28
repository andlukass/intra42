async function serveManifest(request, response, readManifest) {
  response.set({
    "Cache-Control": "private, no-store",
    "expo-protocol-version": "1",
    "expo-sfv-version": "0",
  });
  response.vary("expo-platform");
  response.vary("expo-runtime-version");
  response.vary("expo-channel-name");

  if (request.method !== "GET") {
    return response.set("Allow", "GET").status(405).end();
  }

  const platform = request.get("expo-platform");
  const runtime = request.get("expo-runtime-version");
  const channel = request.get("expo-channel-name") ?? "production";
  if (
    !["ios", "android"].includes(platform) ||
    !["preview", "production"].includes(channel) ||
    !/^[a-f0-9]{40}$/.test(runtime ?? "")
  ) {
    return response.status(400).end();
  }
  if (request.get("expo-protocol-version") !== "1" || request.get("expo-expect-signature")) {
    return response.status(406).end();
  }

  const manifest = await readManifest(`intra42-active/${platform}/${channel}/${runtime}.json`);
  if (!manifest) return response.status(204).end();
  return response.status(200).type("application/expo+json").send(manifest);
}

module.exports = { serveManifest };
