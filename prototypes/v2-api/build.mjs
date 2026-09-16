import { readFileSync, rmSync } from 'node:fs';
import { build } from 'esbuild';

/**
 * Bundle the service into one `dist/server.js` (#1202, rollout decision 7).
 *
 * Why a bundle and not `tsc --outDir`: the Save endpoint consumes the canonical request decoder
 * from `prototypes/v2/lib/sync/request.ts`, which pulls the shared songbook codecs out of the
 * repo-root `public/` tree. That graph is browser-free, but it lives outside this package, so
 * a per-file emit would need the whole tree copied into the image. Bundling keeps ONE decoder
 * and ONE codec (no re-implemented "minimal validator" in the API) and gives the container a
 * single self-contained entry. `tsc --noEmit` remains the typecheck; esbuild does no checking.
 *
 * Runtime dependencies stay external (installed by the image's `npm ci --omit=dev`); only the
 * repo's own TypeScript is inlined. Node builtins are external by `platform: 'node'`.
 */
const manifest = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));

rmSync(new URL('./dist', import.meta.url), { recursive: true, force: true });
await build({
    entryPoints: ['src/server.ts'],
    outfile: 'dist/server.js',
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node26',
    sourcemap: true,
    external: Object.keys(manifest.dependencies),
    logLevel: 'info',
});
