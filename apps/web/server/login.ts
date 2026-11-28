import { createLoginHandler } from "@intra42/portal-server/login";
import { manageRefresh } from "@intra42/portal-server/refresh";
import { manageSlots } from "@intra42/portal-server/slots";
import type { Plugin } from "vite";
import { readIntra } from "./intra.js";

export function localLogin(): Plugin {
  const login = createLoginHandler();
  return {
    name: "local-42-login",
    configureServer(server) {
      server.middlewares.use("/local-api/intra", readIntra);
      server.middlewares.use("/local-api/slots", manageSlots);
      server.middlewares.use("/local-api/session/refresh", manageRefresh);
      server.middlewares.use("/local-api/login", login);
    },
  };
}
