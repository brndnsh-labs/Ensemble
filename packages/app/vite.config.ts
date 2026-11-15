import { cpSync, createReadStream, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import react from "@vitejs/plugin-react";
import type { Plugin } from "vite";
import { defineConfig } from "vite";

/** The instrument packs, kept outside the app because the audition page and the cutter use them too. */
const PACKS = resolve(import.meta.dirname, "../../assets/packs");

const TYPES: Readonly<Record<string, string>> = {
  ".json": "application/json",
  ".webm": "audio/webm",
};

/** Serve the packs at `packs/` while developing, and copy them beside the app when it is built. */
function instrumentPacks(): Plugin {
  let out = "";
  return {
    name: "ensemble-instrument-packs",
    configResolved(config) {
      out = resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use("/packs", (request, response, next) => {
        const path = normalize(decodeURIComponent((request.url ?? "").split("?")[0]!));
        const file = join(PACKS, path);
        try {
          if (!file.startsWith(PACKS) || !statSync(file).isFile()) return next();
        } catch {
          return next();
        }
        response.setHeader("Content-Type", TYPES[extname(file)] ?? "text/plain; charset=utf-8");
        createReadStream(file).pipe(response);
      });
    },
    closeBundle() {
      if (this.meta.watchMode) return;
      cpSync(PACKS, join(out, "packs"), { recursive: true });
    },
  };
}

export default defineConfig({
  // Relative, so the built app works from any folder of any static host.
  base: "./",
  plugins: [react(), instrumentPacks()],
  build: { target: "es2024" },
  server: { port: 8766 },
  preview: { port: 8766 },
});
