// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * #1062 regression guard: `soloist.enabled` is `document`-owned (persisted,
 * shareable — see `songbook/state-ownership.ts`) and must be written ONLY by
 * the user's own manual toggle (`instrument-controller.ts`'s `togglePower`,
 * which dispatches a generic `SET_PARAM` keyed off a runtime `moduleName`
 * variable, not a literal `'soloist'`/`'sb'` string). No runtime-derived
 * mechanism — the soloist trade block in `conductor.ts` chief among them —
 * may flip it: that was exactly the P0 bug (trading silently overwrote and
 * persisted the user's setting across reload and share links). The fix
 * routes trading through the separate `runtime-derived` field
 * `soloist.tradeSilenced` instead (composed at READ time by
 * `isInstrumentActiveAtStep` in `section-overrides.ts`).
 *
 * This test statically scans every dispatch of `ACTIONS.UPDATE_SB` and
 * `ACTIONS.SET_PARAM` under `public/` for a payload that would write
 * `enabled` on a literal `soloist`/`sb` module target, and fails if any new
 * one shows up outside the sanctioned manual-toggle site.
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

// The one sanctioned write site: the user's manual power toggle. It dispatches
// SET_PARAM with a runtime `moduleName` variable (shared across every
// instrument lane), never a literal 'soloist'/'sb' string, so it never
// matches the literal-module scans below — this allowlist exists purely so a
// failure message can point at "the sanctioned site" by name if that ever
// changes shape.
const MANUAL_TOGGLE_FILE = 'controllers/instrument-controller.ts';

/** Extract the balanced `{...}` or bare-identifier argument text following a marker. */
function extractCallArg(content: string, callStart: number): string | null {
    // callStart points at the character right after the marker's trailing comma,
    // i.e. the start of the argument expression.
    let i = callStart;
    while (i < content.length && /\s/.test(content[i])) {
        i++;
    }
    if (content[i] === '{') {
        let depth = 0;
        const start = i;
        for (; i < content.length; i++) {
            if (content[i] === '{') {
                depth++;
            } else if (content[i] === '}') {
                depth--;
                if (depth === 0) {
                    return content.slice(start, i + 1);
                }
            }
        }
        return null;
    }
    // Bare identifier: read up to the closing `)`.
    const end = content.indexOf(')', i);
    return end === -1 ? null : content.slice(i, end).trim();
}

/** Resolve a bare identifier to its declaration's initializer text (brace/paren-aware, stops at a depth-0 `;`). */
function resolveIdentifierInit(content: string, identifier: string): string | null {
    const declRegex = new RegExp(`\\b(?:const|let)\\s+${identifier}\\s*(?::[^=]+)?=`);
    const match = declRegex.exec(content);
    if (!match) {
        return null;
    }
    let i = match.index + match[0].length;
    const start = i;
    let depth = 0;
    for (; i < content.length; i++) {
        const c = content[i];
        if (c === '{' || c === '(' || c === '[') {
            depth++;
        } else if (c === '}' || c === ')' || c === ']') {
            depth--;
        } else if (c === ';' && depth <= 0) {
            break;
        }
    }
    return content.slice(start, i);
}

describe('#1062 — soloist.enabled ownership guard', () => {
    it('no UPDATE_SB dispatch payload writes `enabled`', () => {
        const files = getFiles(PUBLIC_DIR).filter((f) => !f.endsWith('types.ts'));
        const violations: string[] = [];

        for (const file of files) {
            const content = fs.readFileSync(file, 'utf8');
            const marker = /dispatch\(\s*ACTIONS\.UPDATE_SB\s*,/g;
            for (let m = marker.exec(content); m !== null; m = marker.exec(content)) {
                const argText = extractCallArg(content, m.index + m[0].length);
                if (!argText) {
                    continue;
                }
                let payloadText = argText;
                if (/^[A-Za-z_$][\w$]*$/.test(argText)) {
                    // Bare identifier — resolve its declaration in the same file.
                    payloadText = resolveIdentifierInit(content, argText) ?? '';
                }
                if (/\benabled\s*:/.test(payloadText)) {
                    violations.push(`${path.relative(PUBLIC_DIR, file)}: ${argText}`);
                }
            }
        }

        expect(violations, 'UPDATE_SB payload(s) writing `enabled`').toEqual([]);
    });

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
            if (file.endsWith(MANUAL_TOGGLE_FILE)) {
                // The manual toggle uses a runtime `moduleName` variable, never a
                // literal 'soloist'/'sb' — it structurally can't match either
                // regex above. No exemption is actually needed, but scanning it
                // too costs nothing and keeps this allowlist honest if that ever
                // changes shape.
            }
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
