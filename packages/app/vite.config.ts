import { createHash } from "node:crypto";
import {
  cpSync,
  createReadStream,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { extname, join, normalize, relative, resolve, sep } from "node:path";
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
          if (!file.startsWith(PACKS + sep) || !statSync(file).isFile()) return next();
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

/** Every file under a folder, as paths from it. */
function filesIn(folder: string): string[] {
  return readdirSync(folder, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => relative(folder, join(entry.parentPath, entry.name)).replaceAll("\\", "/"))
    .sort();
}

/**
 * Write the service worker beside the built app: the list of the app's own
 * files to keep, named for their contents so a new build is a new cache, and a
 * name for the instruments' cache that changes only when a pack does.
 */
function serviceWorker(): Plugin {
  let out = "";
  return {
    name: "ensemble-service-worker",
    // After the packs have been copied in.
    enforce: "post",
    configResolved(config) {
      out = resolve(config.root, config.build.outDir);
    },
    closeBundle() {
      if (this.meta.watchMode) return;
      const digest = (parts: readonly (string | Buffer)[]) => {
        const hash = createHash("sha256");
        for (const part of parts) hash.update(part);
        return hash.digest("hex").slice(0, 12);
      };
      const all = filesIn(out).filter((file) => file !== "sw.js");
      // The type's Latin letters are all the app sets; its other alphabets stay on the network.
      const shell = all.filter(
        (file) => !file.startsWith("packs/") && !/-(latin-ext|vietnamese)-/.test(file),
      );
      const shellName = digest(shell.flatMap((file) => [file, readFileSync(join(out, file))]));
      const packsName = digest(
        all
          .filter((file) => /^packs\/[^/]+\/pack\.json$/.test(file))
          .flatMap((file) => [file, readFileSync(join(out, file))]),
      );
      // The page itself is kept under the folder's address.
      const files = ["./", ...shell.filter((file) => file !== "index.html")];
      const worker = readFileSync(resolve(import.meta.dirname, "service-worker.js"), "utf8")
        .replace("__SHELL__", shellName)
        .replace("__PACKS__", packsName)
        .replace("__FILES__", JSON.stringify(files));
      writeFileSync(join(out, "sw.js"), worker);
    },
  };
}

export default defineConfig({
  // Relative, so the built app works from any folder of any static host.
  base: "./",
  plugins: [react(), instrumentPacks(), serviceWorker()],
  // One file of script is the whole app; splitting it would only add requests.
  build: { target: "es2024", chunkSizeWarningLimit: 800 },
  server: { port: 8766 },
  preview: { port: 8766 },
});
