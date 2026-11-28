import { cp, mkdir } from "node:fs/promises";
import { build, context } from "esbuild";

const options = {
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  outfile: "dist/index.js",
  external: [
    "@nestjs/*",
    "express",
    "firebase-admin/*",
    "firebase-functions/*",
    "reflect-metadata",
    "rxjs",
    "playwright",
    "cheerio",
  ],
  banner: {
    js: 'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  },
  tsconfig: "tsconfig.json",
};
if (process.argv.includes("--watch")) {
  const builder = await context(options);
  await builder.watch();
} else await build(options);

await mkdir("dist/assets", { recursive: true });
await cp("../mobile/server/assets", "dist/assets", { recursive: true });
