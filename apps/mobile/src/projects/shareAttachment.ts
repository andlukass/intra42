import { CryptoDigestAlgorithm, digestStringAsync } from "expo-crypto";
import { Directory, File, Paths } from "expo-file-system";
import { isAvailableAsync, shareAsync } from "expo-sharing";
import { broker } from "../session";

export async function shareProjectAttachment(
  attachment: { name: string; url: string },
  accessToken: string,
) {
  const url = new URL(attachment.url);
  if (url.origin !== "https://cdn.intra.42.fr" || url.username || url.password) {
    throw new Error("Unsupported project attachment URL.");
  }
  if (!broker || !accessToken) throw new Error("Sign in to download project attachments.");
  if (!(await isAvailableAsync())) throw new Error("File sharing is unavailable on this device.");
  const key = await digestStringAsync(CryptoDigestAlgorithm.SHA256, url.href);
  const directory = new Directory(Paths.cache, "project-attachments", key);
  directory.create({ intermediates: true, idempotent: true });
  const sourceName = decodeURIComponent(url.pathname.split("/").at(-1) ?? "attachment");
  const name =
    (attachment.name.includes(".") ? attachment.name : sourceName)
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .replace(/^\.+/, "") || "attachment";
  const destination = new File(directory, name);
  let downloaded: File;
  try {
    downloaded = await File.downloadFileAsync(
      `${broker}/api/project-attachment?${new URLSearchParams({ source: url.href })}`,
      destination,
      { idempotent: true, headers: { Authorization: `Bearer ${accessToken}` } },
    );
    if (!downloaded.exists || downloaded.size === 0)
      throw new Error("The attachment download was empty.");
  } catch {
    if (destination.exists) destination.delete();
    throw new Error("Could not download the project attachment. Please try again.");
  }
  await shareAsync(downloaded.uri, {
    dialogTitle: attachment.name,
    ...(name.toLowerCase().endsWith(".pdf")
      ? { mimeType: "application/pdf", UTI: "com.adobe.pdf" }
      : {}),
  });
}
