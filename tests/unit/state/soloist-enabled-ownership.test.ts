// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * #1062 regression guard: `soloist.enabled` is `document`-owned (persisted,
 * shareable — see `songbook/state-ownership.ts`) and must be written ONLY by
 * the user's own manual toggle (`instrument-controller.ts`'s `togglePower`,
 * which dispatches a generic `SET_PARAM` keyed off a runtime `module`
 * variable, not a literal `'soloist'`/`'sb'` string, so it never matches the scan).
 * No runtime-derived mechanism — the old engine's soloist trade block chief among
 * them — may flip it: that was exactly the P0 bug (trading silently overwrote and
 * persisted the user's setting across reload and share links). The fix
 * routed trading through a separate `runtime-derived` field,
 * `soloist.tradeSilenced` (gone with the old engine's trade block, #1424;
 * the band engine's trading never touches `enabled` either).
 *
 * This test statically scans every dispatch of `ACTIONS.SET_PARAM` under
 * `public/` for a payload that would write `enabled` on a literal
 * `soloist`/`sb` module target, and fails if any new one shows up outside the
 * sanctioned manual-toggle site, which writes through a variable and never matches.
 * (`ACTIONS.UPDATE_SB`, the old multi-key batch form this test also used to scan,
 * was deleted in #1381 — nothing dispatched it, so that half of the guard was
 * permanently vacuous.) Limit: it sees literal module names under `public/` only.
 */

const PUBLIC_DIR = path.resolve(__dirname, '../../../public');

function getFiles(dir: string, files: string[] = []): string[] {
    for (const entry of fs.readdirSync(dir)) {
        const full = path.join(dir, entry);
        if (fs.statSync(full).isDirectory()) {
            getFiles(full, files);
        } else if (/\.(ts|tsx|js|jsx)$/.test(entry)) {
            files.push(full);
        }
    }
    return files;
}

describe('#1062 — soloist.enabled ownership guard', () => {
    it('no SET_PARAM dispatch targets a literal soloist/sb module with param "enabled"', () => {
        const files = getFiles(PUBLIC_DIR).filter((f) => !f.endsWith('types.ts'));
        const violations: string[] = [];
        // Matches `{ ...module: 'soloist'|'sb'... param: 'enabled'... }` in either
        // key order, scoped to one object literal (`[^{}]*` won't cross braces).
        const moduleThenParam =
            /SET_PARAM\s*,\s*\{[^{}]*module\s*:\s*['"](?:soloist|sb)['"][^{}]*param\s*:\s*['"]enabled['"][^{}]*\}/g;
        const paramThenModule =
            /SET_PARAM\s*,\s*\{[^{}]*param\s*:\s*['"]enabled['"][^{}]*module\s*:\s*['"](?:soloist|sb)['"][^{}]*\}/g;

        for (const file of files) {
            const content = fs.readFileSync(file, 'utf8');
            if (moduleThenParam.test(content) || paramThenModule.test(content)) {
                violations.push(path.relative(PUBLIC_DIR, file));
            }
            moduleThenParam.lastIndex = 0;
            paramThenModule.lastIndex = 0;
        }

        expect(violations, 'SET_PARAM dispatch(es) writing soloist/sb `enabled`').toEqual([]);
    });
});
