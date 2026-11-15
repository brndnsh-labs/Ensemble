// A small web server for the audition page: the repo's files as they are, with
// TypeScript's types stripped on the way out so a browser can run the source
// directly. No bundler, no build step. It is for this machine and the home
// network, not for publishing.
//
//   node scripts/serve.ts [--port 8765] [--host 0.0.0.0]
//
// The page is at /tools/audition/.

import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import { stripTypeScriptTypes } from "node:module";
import { extname, join, normalize, resolve, sep } from "node:path";
import { parseArgs } from "node:util";

const ROOT = resolve(import.meta.dirname, "..");

const TYPES: Readonly<Record<string, string>> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".ts": "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".chart": "text/plain; charset=utf-8",
  ".webm": "audio/webm",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".md": "text/plain; charset=utf-8",
  ".mid": "audio/midi",
};

/** Folders a browser may read. Nothing else in the repo is served. */
const OPEN = ["packages", "tools", "library", "assets", "out"];

export interface ServeOptions {
  readonly port: number;
  readonly host: string;
  /** Called with each file a page on this machine sends back to be saved under `out/audio/`. */
  readonly saved?: (name: string, path: string) => void;
}

export function serve(options: ServeOptions): Promise<Server> {
  const server = createServer((request, response) => {
    const url = new URL(request.url ?? "/", "http://localhost");
    const path = decodeURIComponent(url.pathname);
    const send = (status: number, body: string | Uint8Array, type = "text/plain") => {
      response.writeHead(status, { "content-type": type, "cache-control": "no-store" });
      response.end(body);
    };

    // A rendered file coming back from a page, accepted from this machine only.
    if (request.method === "POST" && path.startsWith("/save/")) {
      const local = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
        request.socket.remoteAddress ?? "",
      );
      const name = path.slice("/save/".length);
      if (!local || !/^[\w.-]+\.(wav|json)$/.test(name)) return send(403, "no");
      const chunks: Buffer[] = [];
      request.on("data", (chunk: Buffer) => chunks.push(chunk));
      request.on("end", () => {
        const folder = join(ROOT, "out", "audio");
        mkdirSync(folder, { recursive: true });
        writeFileSync(join(folder, name), Buffer.concat(chunks));
        send(200, "saved");
        options.saved?.(name, join(folder, name));
      });
      return;
    }
    if (request.method !== "GET") return send(405, "no");

    if (path === "/api/library") {
      const charts = readdirSync(join(ROOT, "library")).filter((file) => file.endsWith(".chart"));
      return send(200, JSON.stringify(charts.sort()), TYPES[".json"]);
    }
    if (path === "/api/packs") {
      const folder = join(ROOT, "assets", "packs");
      let packs: string[] = [];
      try {
        packs = readdirSync(folder).filter((id) => statSync(join(folder, id)).isDirectory());
      } catch {
        // No packs have been cut yet.
      }
      return send(200, JSON.stringify(packs.sort()), TYPES[".json"]);
    }

    const file = normalize(join(ROOT, path.endsWith("/") ? `${path}index.html` : path));
    const top = file.slice(ROOT.length + 1).split(sep)[0] ?? "";
    if (!file.startsWith(ROOT + sep) || !OPEN.includes(top) || file.includes(`${sep}.`)) {
      return send(404, "not found");
    }
    try {
      const type = TYPES[extname(file)] ?? "application/octet-stream";
      if (extname(file) === ".ts") {
        return send(200, stripTypeScriptTypes(readFileSync(file, "utf8")), type);
      }
      return send(200, readFileSync(file), type);
    } catch {
      return send(404, "not found");
    }
  });
  return new Promise((done) => server.listen(options.port, options.host, () => done(server)));
}

if (import.meta.main) {
  const { values } = parseArgs({
    options: {
      port: { type: "string", default: "8765" },
      host: { type: "string", default: "127.0.0.1" },
    },
  });
  await serve({ port: Number(values.port), host: values.host });
  console.log(`http://${values.host}:${values.port}/tools/audition/`);
}
