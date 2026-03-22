/* eslint-disable */

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('PWA Offline Asset Integrity', () => {
    it('should verify all assets listed in sw.js exist on disk', () => {
        const swPath = path.resolve(__dirname, '../../../public/sw.js');
        const swContent = fs.readFileSync(swPath, 'utf8');

        // Extract ASSETS array using regex
        const match = swContent.match(/const ASSETS = \[([\s\S]*?)\];/);
        expect(match).not.toBeNull();

        const assetsRaw = match[1];
        const assets = assetsRaw
            .split(',')
            .map((s) => s.trim().replace(/['"[\]]/g, ''))
            .filter((s) => s && s !== './' && !s.includes('ASSETS_PLACEHOLDER'));

        const publicDir = path.resolve(__dirname, '../../../public');

        const missingFiles = [];
        assets.forEach((asset) => {
            const filePath = path.join(publicDir, asset.replace('./', ''));
            if (!fs.existsSync(filePath)) {
                missingFiles.push(asset);
            }
        });

        expect(
            missingFiles,
            `Missing assets in public/ directory: ${missingFiles.join(', ')}`,
        ).toEqual([]);
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
