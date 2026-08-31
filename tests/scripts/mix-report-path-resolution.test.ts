import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

describe('mix:report repository root', () => {
    it('resolves from the script module instead of a checkout-specific path or cwd', () => {
        const alternateCwd = mkdtempSync(path.join(tmpdir(), 'ensemble-mix-report-cwd-'));
        const checkoutRoot = path.resolve(import.meta.dirname, '../..');
        const linkedRoot = path.join(alternateCwd, 'linked-checkout');
        symlinkSync(checkoutRoot, linkedRoot, 'dir');
        const moduleUrl = pathToFileURL(path.join(linkedRoot, 'scripts/mix-report.ts')).href;

        try {
            const result = spawnSync(
                process.execPath,
                [
                    '--preserve-symlinks',
                    '--import',
                    import.meta.resolve('tsx'),
                    '--input-type=module',
                    '--eval',
                    `const { REPO_ROOT } = await import(${JSON.stringify(moduleUrl)}); process.stdout.write(REPO_ROOT);`,
                ],
                { cwd: alternateCwd, encoding: 'utf8', timeout: 10_000 },
            );

            expect(result.error).toBeUndefined();
            expect(result.signal).toBeNull();
            expect(result.status, result.stderr).toBe(0);
            expect(result.stdout).toBe(linkedRoot);
            expect(result.stdout).not.toBe(alternateCwd);
            expect(result.stdout).not.toBe(checkoutRoot);
        } finally {
            rmSync(alternateCwd, { recursive: true });
        }
    });
});
