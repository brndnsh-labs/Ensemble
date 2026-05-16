import { execSync } from 'node:child_process';
import {
    copyFileSync,
    existsSync,
    readdirSync,
    readFileSync,
    unlinkSync,
    writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import preact from '@preact/preset-vite';
import { defineConfig, type Plugin } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

const REV = execSync('git rev-parse --short HEAD').toString().trim();

// Files that must ship to dist/ verbatim (no hashing, no transformation):
// - manifest.json references icons by their unhashed names
// - icon-512.png is only referenced from manifest.json (not HTML), so Vite would skip it
// - MANUAL.md is fetched at runtime
const STATIC_ASSETS = ['manifest.json', 'icon-192.png', 'icon-512.png', 'icon.svg', 'MANUAL.md'];

function copyStaticAssets(): Plugin {
    return {
        name: 'ensemble:copy-static-assets',
        apply: 'build',
        // Rewrite hashed manifest/icon links in the rendered HTML to point at
        // the verbatim copies we drop alongside them. Otherwise the browser
        // loads /assets/manifest-HASH.json, which still references unhashed
        // icon filenames, and the icon lookups 404.
        closeBundle() {
            // Drop hashed duplicates that Vite emitted for files we ship verbatim
            // (e.g. manifest.<rev>.json, icon-192.<rev>.png). Keeps the precache list lean.
            const hashedRe = new RegExp(`\\.${REV}\\.(json|png|svg|md)$`);
            for (const entry of readdirSync('dist')) {
                if (hashedRe.test(entry)) {
                    unlinkSync(resolve('dist', entry));
                }
            }
            for (const file of STATIC_ASSETS) {
                const src = resolve('public', file);
                const dest = resolve('dist', file);
                if (existsSync(src)) {
                    copyFileSync(src, dest);
                }
            }
            const htmlPath = resolve('dist', 'index.html');
            if (existsSync(htmlPath)) {
                const html = readFileSync(htmlPath, 'utf8')
                    .replace(/href="[^"]*manifest[^"]*\.json"/, 'href="/manifest.json"')
                    .replace(/href="[^"]*icon-192[^"]*\.png"/, 'href="/icon-192.png"')
                    .replace(/href="[^"]*icon[^"]*\.svg"/, 'href="/icon.svg"');
                writeFileSync(htmlPath, html);
            }
        },
    };
}

export default defineConfig({
    root: 'public',
    publicDir: false,
    build: {
        outDir: '../dist',
        emptyOutDir: true,
        sourcemap: true,
        rollupOptions: {
            output: {
                entryFileNames: `[name].${REV}.js`,
                chunkFileNames: `chunk-[hash].js`,
                assetFileNames: `[name].${REV}.[ext]`,
            },
        },
    },
    worker: {
        format: 'es',
        rollupOptions: {
            output: {
                entryFileNames: `[name].${REV}.js`,
                chunkFileNames: `chunk-[hash].js`,
            },
        },
    },
    plugins: [
        preact(),
        copyStaticAssets(),
        VitePWA({
            strategies: 'injectManifest',
            srcDir: '.',
            filename: 'sw.ts',
            injectRegister: false,
            manifest: false,
            injectManifest: {
                globPatterns: ['**/*.{js,css,html,svg,png,json,md}'],
            },
            devOptions: {
                enabled: false,
            },
        }),
    ],
    server: { port: 5173 },
});
