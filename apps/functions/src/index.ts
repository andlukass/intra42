import "reflect-metadata";
import { randomUUID } from "node:crypto";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { ExpressAdapter } from "@nestjs/platform-express";
import express, { type Request, type Response } from "express";
import { defineSecret } from "firebase-functions/params";
import { onRequest } from "firebase-functions/v2/https";
import { sessionDatabase } from "../../../packages/portal-server/session-firestore.ts";

@Module({})
class ApiModule {}
const clientId = defineSecret("INTRA42_CLIENT_ID");
const clientSecret = defineSecret("INTRA42_CLIENT_SECRET");
let server: Promise<ReturnType<typeof express>> | undefined;
let queue = Promise.resolve();
const operations = new WeakMap<Response, Promise<void>>();

async function createApp() {
  process.env.INTRA42_FUNCTIONS = "1";
  const instance = express();
  const app = await NestFactory.create(ApiModule, new ExpressAdapter(instance), {
    bodyParser: false,
    logger: ["error", "warn"],
  });
  instance.use(async (req: Request, res: Response) => {
    const operation = queue
      .catch(() => {})
      .then(async () => {
        const db = sessionDatabase();
        const lock = db.doc("intra42_internal/runtime");
        const owner = randomUUID();
        const acquired = await db.runTransaction(async (tx) => {
          const current = await tx.get(lock);
          if ((current.data()?.until ?? 0) > Date.now()) return false;
          tx.set(lock, { owner, until: Date.now() + 180_000 });
          return true;
        });
        if (!acquired) {
          res.setHeader("Retry-After", "1");
          res.status(503).json({ error: "The service is busy. Try again shortly." });
          return;
        }
        try {
          // shortcut: Full snapshots require global serialization; use per-session storage before raising capacity.
          const store = await import("../../../packages/portal-server/session-store.ts");
          const runtime = await import("../../../packages/portal-server/session-runtime.ts");
          const { handle } = await import("../../mobile/server/oauth.mjs");
          await store.reloadSessionStore();
          await runtime.reloadSessionMaps();
          // Firebase consumed the body; existing handlers consume the IncomingMessage stream.
          const raw = (req as Request & { rawBody?: Buffer }).rawBody;
          if (raw)
            Object.defineProperty(req, Symbol.asyncIterator, {
              value: async function* () {
                yield raw;
              },
            });
          await handle(req, res);
        } finally {
          await db.runTransaction(async (tx) => {
            const current = await tx.get(lock);
            if (current.data()?.owner === owner) tx.delete(lock);
          });
        }
      });
    queue = operation.catch(() => {});
    operations.set(res, queue);
    try {
      await operation;
    } catch (error) {
      console.error("Backend request failed", {
        type: error instanceof Error ? error.name : "unknown",
      });
      if (!res.headersSent)
        res.status(502).json({ error: "Could not load data from 42. Try again shortly." });
    }
  });
  await app.init();
  return instance;
}
export const api = onRequest(
  {
    region: "europe-west1",
    timeoutSeconds: 120,
    memory: "512MiB",
    concurrency: 1,
    maxInstances: 1,
    secrets: [clientId, clientSecret],
    invoker: "public",
  },
  async (req, res) => {
    server ??= createApp().catch((error) => {
      server = undefined;
      throw error;
    });
    const handler = await server;
    handler(req, res);
    await operations.get(res);
    await new Promise<void>((resolve) => {
      if (res.writableEnded) resolve();
      else {
        res.once("finish", resolve);
        res.once("close", resolve);
      }
    });
  },
);
