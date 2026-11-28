export type SessionCollection = "native" | "refresh" | "calendar";
export type SessionSnapshot = Partial<Record<SessionCollection, unknown[]>>;

export interface SessionPersistence {
  readonly description: string;
  load(): Promise<SessionSnapshot>;
  save(snapshot: SessionSnapshot): Promise<void>;
}

export async function createSessionStore(persistence: SessionPersistence) {
  let snapshot = await persistence.load();
  let pending = Promise.resolve();
  return {
    description: persistence.description,
    read(name: SessionCollection): readonly unknown[] {
      return snapshot[name] ?? [];
    },
    write(name: SessionCollection, records: unknown[]): Promise<void> {
      const operation = pending
        .catch(() => {})
        .then(async () => {
          const next = { ...snapshot, [name]: records };
          await persistence.save(next);
          snapshot = next;
        });
      pending = operation;
      return operation;
    },
  };
}
