import { createFileSessionPersistence } from "./session-file.ts";
import { createSessionStore } from "./session-storage.ts";

// Replace this provider to use Firebase; authentication depends only on the store contract.
const store = await createSessionStore(createFileSessionPersistence());
export const readSessionRecords = store.read;
export const writeSessionRecords = store.write;
export const sessionStoreDescription = store.description;
