import { createFileSessionPersistence } from "./session-file.ts";
import { createSessionStore } from "./session-storage.ts";

// Replace this provider to use Firebase; authentication depends only on the store contract.
const persistence =
  process.env.INTRA42_FUNCTIONS === "1"
    ? (await import("./session-firestore.ts")).createFirestoreSessionPersistence()
    : createFileSessionPersistence();
const store = await createSessionStore(persistence);
export const reloadSessionStore = store.reload;
export const readSessionRecords = store.read;
export const writeSessionRecords = store.write;
export const sessionStoreDescription = store.description;
