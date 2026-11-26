import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";

const day = 24 * 60 * 60_000;
const maxAge = 30 * day;
let nextCleanup = 0;

export function isAvatarUri(uri: unknown): uri is string {
  return typeof uri === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(uri);
}

function isFresh(file: File, now: number) {
  const modified = file.modificationTime;
  return modified !== null && modified <= now && now - modified < maxAge;
}

export async function loadSmallAvatar(
  source: string,
  signal: AbortSignal,
  download: () => Promise<string>,
) {
  let file: File | undefined;
  try {
    const key = await digestStringAsync(CryptoDigestAlgorithm.SHA256, source);
    const directory = new Directory(Paths.cache, "small-avatars-v1");
    directory.create({ idempotent: true });
    const now = Date.now();
    if (now >= nextCleanup) {
      nextCleanup = now + day;
      for (const entry of directory.list()) {
        if (entry instanceof File && !isFresh(entry, now)) entry.delete();
      }
    }

    file = new File(directory, `${key}.json`);
    if (isFresh(file, now)) {
      const cached: unknown = JSON.parse(await file.text());
      if (isAvatarUri(cached)) return cached;
    }
  } catch {
    // Storage failures and incomplete files fall back to the network.
  }

  if (signal.aborted) throw new Error("Photo request canceled.");
  const uri = await download();
  if (signal.aborted) throw new Error("Photo request canceled.");
  try {
    file?.write(JSON.stringify(uri));
  } catch {
    // A cache write failure must not prevent displaying the photo.
  }
  return uri;
}
