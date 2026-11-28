import { readFileSync } from "node:fs";

export const signInAssets: Record<string, { type: string; body: Buffer }> = {
  "/sign-in-assets/login-background.jpg": {
    type: "image/jpeg",
    body: readFileSync(new URL("./assets/login-background.jpg", import.meta.url)),
  },
  "/sign-in-assets/42-logo.svg": {
    type: "image/svg+xml",
    body: readFileSync(new URL("./assets/42-logo.svg", import.meta.url)),
  },
};
