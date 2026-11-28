import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";

const day = 24 * 60 * 60_000;
const maxAge = 30 * day;
const nextCleanup = new Map<string, number>();

function isFresh(file: File, now: number) {
  const modified = file.modificationTime;
  return modified !== null && modified <= now && now - modified < maxAge;
}

export async function loadCachedImage({
  directoryName,
  source,
  signal,
  download,
  isValid,
}: {
  directoryName: string;
  source: string;
  signal: AbortSignal;
  download: () => Promise<string>;
  isValid: (uri: unknown) => uri is string;
}) {
  let file: File | undefined;
  try {
    const key = await digestStringAsync(CryptoDigestAlgorithm.SHA256, source);
    const directory = new Directory(Paths.cache, directoryName);
    directory.create({ idempotent: true });
    const now = Date.now();
    if (now >= (nextCleanup.get(directoryName) ?? 0)) {
      nextCleanup.set(directoryName, now + day);
      for (const entry of directory.list()) {
        if (entry instanceof File && !isFresh(entry, now)) entry.delete();
      }
    }

    file = new File(directory, `${key}.json`);
    if (isFresh(file, now)) {
      const cached: unknown = JSON.parse(await file.text());
      if (isValid(cached)) return cached;
    }
  } catch {
    // Storage failures and incomplete files fall back to the network.
  }

  if (signal.aborted) throw new Error("Image request canceled.");
  const uri = await download();
  if (!isValid(uri)) throw new Error("Invalid cached image response.");
  if (signal.aborted) throw new Error("Image request canceled.");
  try {
    file?.write(JSON.stringify(uri));
  } catch {
    // A cache write failure must not prevent displaying the image.
  }
  return uri;
}
