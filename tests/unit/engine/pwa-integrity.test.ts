// @ts-nocheck
/* eslint-disable */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('PWA Offline Asset Integrity', () => {
    it('should reference the Workbox precache manifest in sw.ts', () => {
        // The hand-maintained ASSETS array was replaced by vite-plugin-pwa's
        // injectManifest pass (May 2026): Workbox scans dist/ at build time
        // and rewrites `self.__WB_MANIFEST` with the real revisioned list.
        const swPath = path.resolve(__dirname, '../../../public/sw.ts');
        const swContent = fs.readFileSync(swPath, 'utf8');
        expect(swContent).toContain('self.__WB_MANIFEST');
        expect(swContent).toContain('precacheAndRoute');
    });

    it('should verify manifest.json points to valid icons', () => {
        const manifestPath = path.resolve(__dirname, '../../../public/manifest.json');
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const publicDir = path.resolve(__dirname, '../../../public');

        manifest.icons.forEach((icon) => {
            const iconPath = path.join(publicDir, icon.src);
            expect(fs.existsSync(iconPath), `Manifest icon not found: ${icon.src}`).toBe(true);
        });
    });
});
