import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';

const CHECKOUT_ROOT = path.resolve(import.meta.dirname, '../..');
const CHECKER = path.join(CHECKOUT_ROOT, 'scripts/check-mutations.ts');

function runMutationCheck(source: string) {
    const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'ensemble-check-mutations-'));
    const fixture = path.join(fixtureRoot, 'fixture.ts');
    writeFileSync(fixture, source);

    try {
        return spawnSync(process.execPath, [CHECKER, fixture], {
            cwd: CHECKOUT_ROOT,
            encoding: 'utf8',
            timeout: 10_000,
        });
    } finally {
        rmSync(fixtureRoot, { recursive: true });
    }
}

describe('direct-mutation annotation scope', () => {
    it('rejects an unannotated mutation after a separately annotated mutation', () => {
        const result = runMutationCheck(
            ['playback.step = 1; // @direct-mutation', 'playback.currentLoopCount = 2;', ''].join(
                '\n',
            ),
        );

        expect(result.error).toBeUndefined();
        expect(result.signal).toBeNull();
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('fixture.ts:2');
        expect(result.stderr).not.toContain('fixture.ts:1');
    });

    it.each(['// @direct-mutation', '/* @direct-mutation */'])(
        'accepts a standalone comment-above annotation: %s',
        (annotation) => {
            const result = runMutationCheck(`${annotation}\nplayback.step = 1;\n`);

            expect(result.error).toBeUndefined();
            expect(result.signal).toBeNull();
            expect(result.status, result.stderr).toBe(0);
        },
    );

    it('no longer accepts the retired worker marker', () => {
        const result = runMutationCheck('playback.step = 1; // @worker-mutation\n');

        expect(result.error).toBeUndefined();
        expect(result.signal).toBeNull();
        expect(result.status).toBe(1);
        expect(result.stderr).toContain('fixture.ts:1');
    });

    it('accepts same-line and multiline-statement annotations', () => {
        const result = runMutationCheck(
            [
                'playback.step = 1; // @direct-mutation',
                '(playback as Mutable<typeof playback>).bpm = Math.floor(',
                '    240 / 2,',
                '); // @direct-mutation',
                '',
            ].join('\n'),
        );

        expect(result.error).toBeUndefined();
        expect(result.signal).toBeNull();
        expect(result.status, result.stderr).toBe(0);
    });
});
