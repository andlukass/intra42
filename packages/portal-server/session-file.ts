import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import type { SessionPersistence, SessionSnapshot } from "./session-storage.ts";

// shortcut: one local server process owns this file; replace with Firebase before running replicas.
const defaultSessionFile =
  process.env.INTRA42_SESSION_FILE ??
  join(
    tmpdir(),
    `intra42-sessions-${process.getuid?.() ?? "local"}-${createHash("sha256").update(process.cwd()).digest("hex").slice(0, 16)}`,
    "sessions.json",
  );
export function createFileSessionPersistence(sessionFile = defaultSessionFile): SessionPersistence {
  return {
    description: `Session file: ${sessionFile}`,
    async load() {
      const directory = dirname(sessionFile);
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      const stat = lstatSync(directory);
      if (!stat.isDirectory() || (process.getuid && stat.uid !== process.getuid()))
        throw new Error("The session directory must belong to the server user.");
      if ((stat.mode & 0o077) !== 0) throw new Error("Use a private session directory (0700).");
      const collections: SessionSnapshot = {};
      if (existsSync(sessionFile)) {
        const file = lstatSync(sessionFile);
        if (!file.isFile() || (process.getuid && file.uid !== process.getuid()))
          throw new Error("Invalid session file owner or file type.");
        chmodSync(sessionFile, 0o600);
        let saved: { version?: unknown; collections?: unknown } | null;
        try {
          saved = JSON.parse(readFileSync(sessionFile, "utf8"));
        } catch {
          throw new Error(
            "Could not read the session file. Move it aside to start a new session store.",
          );
        }
        if (
          saved?.version !== 1 ||
          !saved.collections ||
          typeof saved.collections !== "object" ||
          Array.isArray(saved.collections)
        )
          throw new Error("Invalid session file. Move it aside to start a new session store.");
        for (const name of ["native", "refresh", "calendar", "transactions"] as const) {
          const records = (saved.collections as Record<string, unknown>)[name];
          if (records === undefined) continue;
          if (!Array.isArray(records))
            throw new Error("Invalid session collection in the session file.");
          collections[name] = records;
        }
      }

      return collections;
    },
    async save(snapshot) {
      const temporary = `${sessionFile}.${randomBytes(8).toString("hex")}.tmp`;
      const descriptor = openSync(temporary, "wx", 0o600);
      try {
        writeFileSync(descriptor, JSON.stringify({ version: 1, collections: snapshot }));
        fsyncSync(descriptor);
        closeSync(descriptor);
        renameSync(temporary, sessionFile);
      } catch (error) {
        try {
          closeSync(descriptor);
        } catch {}
        if (existsSync(temporary)) unlinkSync(temporary);
        throw error;
      }
    },
  };
}
