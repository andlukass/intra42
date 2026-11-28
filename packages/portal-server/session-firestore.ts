import { createHash } from "node:crypto";
import { getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import type { SessionPersistence, SessionSnapshot } from "./session-storage.ts";
export function sessionDatabase() {
  if (!getApps().length) initializeApp();
  return getFirestore();
}
export function createFirestoreSessionPersistence(): SessionPersistence {
  const records = sessionDatabase().collection("intra42_sessions");
  let previous = new Set<string>();
  return {
    description: "Private Firestore sessions",
    async load() {
      const snapshot: SessionSnapshot = {};
      const docs = await records.get();
      previous = new Set(docs.docs.map((doc) => doc.id));
      for (const doc of docs.docs) {
        const { collection, payload } = doc.data();
        if (!["native", "refresh", "calendar", "transactions"].includes(collection)) continue;
        const record = JSON.parse(payload);
        const name = collection as keyof SessionSnapshot;
        snapshot[name] ??= [];
        snapshot[name].push(record);
      }
      return snapshot;
    },
    async save(snapshot) {
      const next = new Set<string>();
      const writer = sessionDatabase().bulkWriter();
      const writes: Promise<unknown>[] = [];
      for (const [collection, entries] of Object.entries(snapshot)) {
        for (const entry of entries) {
          const record = entry as { key?: string; id?: string };
          const id = createHash("sha256")
            .update(`${collection}:${record.key ?? record.id}`)
            .digest("hex");
          next.add(id);
          writes.push(writer.set(records.doc(id), { collection, payload: JSON.stringify(entry) }));
        }
      }
      for (const id of previous) if (!next.has(id)) writes.push(writer.delete(records.doc(id)));
      const completed = Promise.all(writes);
      await writer.close();
      await completed;
      previous = next;
    },
  };
}
