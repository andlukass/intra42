import { loadCachedImage } from "./imageCache";

export function isAvatarUri(uri: unknown): uri is string {
  return typeof uri === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(uri);
}

export function loadSmallAvatar(
  source: string,
  signal: AbortSignal,
  download: () => Promise<string>,
) {
  return loadCachedImage({
    directoryName: "small-avatars-v1",
    source,
    signal,
    download,
    isValid: isAvatarUri,
  });
}
