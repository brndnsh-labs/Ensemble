import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    readlinkSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

const artifactScript = path.resolve('scripts/static-artifact.mjs');
const publisher = path.resolve('scripts/publish-static.sh');
const roots: string[] = [];
const commit = 'a'.repeat(40);
const first = `aaaaaaa-${'1'.repeat(8)}-1111-1111-1111-${'1'.repeat(12)}`;
const second = `aaaaaaa-${'2'.repeat(8)}-2222-2222-2222-${'2'.repeat(12)}`;

function fixture() {
    const root = mkdtempSync(path.join(tmpdir(), 'ensemble-static-release-'));
    roots.push(root);
    const artifact = path.join(root, 'artifact');
    const bin = path.join(root, 'bin');
    mkdirSync(artifact);
    mkdirSync(bin);
    writeFileSync(
        path.join(bin, 'git'),
        `#!/bin/sh\nif [ "$1" = rev-parse ]; then echo "$FIXTURE_COMMIT"; else printf '%s' "$FIXTURE_DIRTY"; fi\n`,
        { mode: 0o755 },
    );
    writeFileSync(path.join(artifact, 'index.html'), '<script src="/index.aaaaaaa.js"></script>');
    writeFileSync(path.join(artifact, 'index.aaaaaaa.js'), 'app');
    writeFileSync(path.join(artifact, 'sw.js'), 'worker');
    writeFileSync(
        path.join(artifact, '.ensemble-build.json'),
        JSON.stringify({
            schema: 1,
            commit,
            revision: 'aaaaaaa',
            mode: 'production',
            e2eBridge: false,
        }),
    );
    const env = {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        FIXTURE_COMMIT: commit,
        FIXTURE_DIRTY: '',
        VITE_E2E_BRIDGE: '',
    };
    const run = (command: string, target: string, overrides = {}) =>
        spawnSync(process.execPath, [artifactScript, command, artifact, target], {
            cwd: root,
            env: { ...env, ...overrides },
            encoding: 'utf8',
        });
    return { root, artifact, run };
}

function publish(root: string, action: string, id: string, expected = '-') {
    return spawnSync('bash', [publisher, action, root, id, expected], { encoding: 'utf8' });
}

function upload(root: string, id: string) {
    const release = path.join(root, '.releases', id);
    for (const [name, contents] of Object.entries({ 'index.html': id, 'sw.js': `worker-${id}` })) {
        writeFileSync(path.join(release, name), contents);
    }
    const sums = ['index.html', 'sw.js']
        .map(
            (file) =>
                `${createHash('sha256')
                    .update(readFileSync(path.join(release, file)))
                    .digest('hex')}  ${file}\n`,
        )
        .join('');
    writeFileSync(path.join(release, '.ensemble-checksums'), sums);
}

afterEach(() => {
    for (const root of roots.splice(0)) {
        rmSync(root, { recursive: true, force: true });
    }
});

describe('static artifact provenance', () => {
    it('verifies the exact clean production artifact without rebuilding', () => {
        const { run } = fixture();
        expect(run('seal', 'production').status).toBe(0);
        expect(run('verify', 'prod').status).toBe(0);
        expect(run('verify', 'test').status).toBe(0);
    });

    it.each(['test-mode', 'dirty', 'another-commit', 'e2e-bridge'])(
        'rejects an unsuitable production artifact: %s',
        (reason) => {
            const { artifact, run } = fixture();
            if (reason === 'test-mode') {
                writeFileSync(
                    path.join(artifact, '.ensemble-build.json'),
                    JSON.stringify({
                        schema: 1,
                        commit,
                        revision: 'aaaaaaa',
                        mode: 'test',
                        e2eBridge: false,
                    }),
                );
            }
            const seal = run('seal', reason === 'test-mode' ? 'test' : 'production', {
                FIXTURE_DIRTY: reason === 'dirty' ? ' M source.ts' : '',
                VITE_E2E_BRIDGE: reason === 'e2e-bridge' ? '1' : '',
            });
            if (reason === 'e2e-bridge') {
                expect(seal.status).not.toBe(0);
            } else {
                expect(seal.status, seal.stderr).toBe(0);
                expect(
                    run('verify', 'prod', {
                        FIXTURE_COMMIT: reason === 'another-commit' ? 'b'.repeat(40) : commit,
                    }).status,
                ).not.toBe(0);
            }
        },
    );

    it.each(['test-mode', 'e2e-bridge'])(
        'cannot relabel earlier %s output after build env is cleared',
        (reason) => {
            const { artifact, run } = fixture();
            writeFileSync(
                path.join(artifact, '.ensemble-build.json'),
                JSON.stringify({
                    schema: 1,
                    commit,
                    revision: 'aaaaaaa',
                    mode: reason === 'test-mode' ? 'test' : 'production',
                    e2eBridge: reason === 'e2e-bridge',
                }),
            );
            expect(run('seal', 'production').status).not.toBe(0);
        },
    );

    it.each(['changed', 'extra', 'symlink', 'checksums'])(
        'rejects artifact tampering: %s',
        (reason) => {
            const { artifact, run } = fixture();
            expect(run('seal', 'production').status).toBe(0);
            if (reason === 'changed') {
                writeFileSync(path.join(artifact, 'sw.js'), 'changed');
            }
            if (reason === 'extra') {
                writeFileSync(path.join(artifact, 'extra.js'), 'unrecorded');
            }
            if (reason === 'symlink') {
                symlinkSync('/etc/passwd', path.join(artifact, 'secret'));
            }
            if (reason === 'checksums') {
                writeFileSync(path.join(artifact, '.ensemble-checksums'), '');
            }
            expect(run('verify', 'prod').status).not.toBe(0);
        },
    );

    it.each(['v2', 'api', '.env'])('does not package reserved/private content: %s', (name) => {
        const { artifact, run } = fixture();
        writeFileSync(path.join(artifact, name), 'not public');
        expect(run('seal', 'production').status).not.toBe(0);
    });
});

describe('atomic static publisher', () => {
    it('requires explicit provisioning and rejects broad or injected targets', () => {
        const { root } = fixture();
        expect(publish(root, 'prepare', first).status).not.toBe(0);
        expect(publish('/', 'prepare', first).status).not.toBe(0);
        expect(publish(root, 'prepare', '../escape').status).not.toBe(0);
        expect(existsSync(path.join(root, '.releases'))).toBe(false);
    });

    it('switches only complete verified releases and preserves preview + old bytes', () => {
        const { root } = fixture();
        writeFileSync(path.join(root, '.ensemble-static-root'), 'ensemble-static-v1\n');
        writeFileSync(path.join(root, 'v2'), 'preview sentinel');
        expect(publish(root, 'prepare', first).stdout.trim()).toBe('-');
        upload(root, first);
        expect(publish(root, 'activate', first).status).toBe(0);
        expect(publish(root, 'prepare', second).stdout.trim()).toBe(`.releases/${first}`);
        upload(root, second);
        writeFileSync(path.join(root, '.releases', second, 'sw.js'), 'corrupted transfer');
        expect(publish(root, 'activate', second, `.releases/${first}`).status).not.toBe(0);
        expect(readlinkSync(path.join(root, 'current'))).toBe(`.releases/${first}`);
        upload(root, second);
        expect(publish(root, 'activate', second, `.releases/${first}`).status).toBe(0);
        expect(readFileSync(path.join(root, 'current', 'index.html'), 'utf8')).toBe(second);
        expect(readFileSync(path.join(root, 'v2'), 'utf8')).toBe('preview sentinel');
        expect(readFileSync(path.join(root, '.releases', first, 'index.html'), 'utf8')).toBe(first);
        // Repointing an existing verified release is the same checked operation.
        expect(publish(root, 'activate', first, `.releases/${second}`).status).toBe(0);
    });

    it('rejects a concurrent loser instead of overwriting the successful deploy', () => {
        const { root } = fixture();
        writeFileSync(path.join(root, '.ensemble-static-root'), 'ensemble-static-v1\n');
        expect(publish(root, 'prepare', first).status).toBe(0);
        expect(publish(root, 'prepare', second).status).toBe(0);
        upload(root, first);
        upload(root, second);
        expect(publish(root, 'activate', second).status).toBe(0);
        expect(publish(root, 'activate', first).status).toBe(75);
        expect(readlinkSync(path.join(root, 'current'))).toBe(`.releases/${second}`);
    });
});
