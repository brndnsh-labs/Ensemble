import { spawnSync } from 'node:child_process';
import {
    chmodSync,
    existsSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';

const DEPLOY_SCRIPT = path.resolve(import.meta.dirname, '../../scripts/deploy.sh');
const BUILT_REV = 'abcdef1';

type PostDeployResult = 'empty' | 'match' | 'mismatch' | 'unreachable';

function writeExecutable(target: string, lines: string[]) {
    writeFileSync(target, `${lines.join('\n')}\n`);
    chmodSync(target, 0o755);
}

function createFixture() {
    const root = mkdtempSync(path.join(tmpdir(), 'ensemble-deploy-verification-'));
    const bin = path.join(root, 'bin');
    const trace = path.join(root, 'trace.log');
    const urls = path.join(root, 'urls.log');
    const curlCount = path.join(root, 'curl-count');
    mkdirSync(bin);

    writeExecutable(path.join(bin, 'npx'), [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        'mkdir -p dist/assets',
        `printf '%s\n' '<script src="/assets/index.${BUILT_REV}.js"></script>' > dist/index.html`,
        `printf '%s\n' 'bundle' > 'dist/assets/index.${BUILT_REV}.js'`,
    ]);
    writeExecutable(path.join(bin, 'rsync'), [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        '[ -f dist/index.html ] || exit 91',
        `printf '%s\n' 'rsync:dist-present' >> "$DEPLOY_TEST_TRACE"`,
    ]);
    writeExecutable(path.join(bin, 'curl'), [
        '#!/usr/bin/env bash',
        'set -euo pipefail',
        'count=0',
        '[ ! -f "$DEPLOY_TEST_CURL_COUNT" ] || read -r count < "$DEPLOY_TEST_CURL_COUNT"',
        'count=$((count + 1))',
        'printf "%s\n" "$count" > "$DEPLOY_TEST_CURL_COUNT"',
        'printf "%s\n" "$*" >> "$DEPLOY_TEST_URLS"',
        'if [ "$count" -eq 1 ]; then',
        '    [ "$DEPLOY_TEST_PREFLIGHT" != unreachable ] || exit 22',
        `    printf '%s\n' '<script src="/assets/index.1111111.js"></script>'`,
        '    exit 0',
        'fi',
        '[ -f dist/index.html ] || exit 92',
        `printf '%s\n' 'curl-after:dist-present' >> "$DEPLOY_TEST_TRACE"`,
        'case "$DEPLOY_TEST_POST" in',
        '    empty) exit 0 ;;',
        `    match) printf '%s\n' '<script src="/assets/index.${BUILT_REV}.js"></script>' ;;`,
        "    mismatch) printf '%s\n' '<script src=\"/assets/index.deadbee.js\"></script>' ;;",
        '    unreachable) exit 22 ;;',
        '    *) exit 93 ;;',
        'esac',
    ]);

    return { bin, curlCount, root, trace, urls };
}

function runDeploy(post: PostDeployResult, preflight: 'available' | 'unreachable' = 'available') {
    const fixture = createFixture();
    const result = spawnSync('bash', [DEPLOY_SCRIPT, 'test'], {
        cwd: fixture.root,
        encoding: 'utf8',
        env: {
            ...process.env,
            DEPLOY_TEST_CURL_COUNT: fixture.curlCount,
            DEPLOY_TEST_POST: post,
            DEPLOY_TEST_PREFLIGHT: preflight,
            DEPLOY_TEST_TRACE: fixture.trace,
            DEPLOY_TEST_URLS: fixture.urls,
            PATH: `${fixture.bin}:${process.env.PATH}`,
        },
        timeout: 10_000,
    });

    return { fixture, result };
}

function cleanup(root: string) {
    rmSync(root, { recursive: true });
}

describe('deploy post-transfer verification', () => {
    it.each(['empty', 'unreachable'] as const)(
        'fails closed when the post-deploy origin is %s and retains dist',
        (post) => {
            const { fixture, result } = runDeploy(post);

            try {
                expect(result.error).toBeUndefined();
                expect(result.signal).toBeNull();
                expect(result.status).not.toBe(0);
                expect(`${result.stdout}${result.stderr}`).toContain(
                    '❌ Deployment verification failed:',
                );
                expect(`${result.stdout}${result.stderr}`).not.toContain('✅ Verified live');
                expect(existsSync(path.join(fixture.root, 'dist/index.html'))).toBe(true);
                expect(readFileSync(fixture.trace, 'utf8')).toContain('curl-after:dist-present');
            } finally {
                cleanup(fixture.root);
            }
        },
    );

    it('fails closed on a mismatched revision and retains dist', () => {
        const { fixture, result } = runDeploy('mismatch');

        try {
            expect(result.error).toBeUndefined();
            expect(result.signal).toBeNull();
            expect(result.status).not.toBe(0);
            expect(`${result.stdout}${result.stderr}`).toContain(
                `live rev (deadbee) != built rev (${BUILT_REV})`,
            );
            expect(`${result.stdout}${result.stderr}`).not.toContain('✅ Verified live');
            expect(existsSync(path.join(fixture.root, 'dist/index.html'))).toBe(true);
        } finally {
            cleanup(fixture.root);
        }
    });

    it('uses distinct phase-specific cache nonces and removes dist only after a match', () => {
        const { fixture, result } = runDeploy('match');

        try {
            expect(result.error).toBeUndefined();
            expect(result.signal).toBeNull();
            expect(result.status, result.stderr).toBe(0);
            expect(result.stdout).toContain(`✅ Verified live on TEST: ${BUILT_REV}`);
            expect(existsSync(path.join(fixture.root, 'dist'))).toBe(false);
            expect(readFileSync(fixture.trace, 'utf8').trim().split('\n')).toEqual([
                'rsync:dist-present',
                'curl-after:dist-present',
            ]);

            const verificationUrls = readFileSync(fixture.urls, 'utf8')
                .trim()
                .split('\n')
                .map((line) => line.split(' ').at(-1));
            expect(verificationUrls).toHaveLength(2);
            expect(verificationUrls[0]).toContain('?cb=before-');
            expect(verificationUrls[1]).toContain('?cb=after-');
            expect(verificationUrls[0]).not.toBe(verificationUrls[1]);
        } finally {
            cleanup(fixture.root);
        }
    });

    it('keeps an unavailable preflight best-effort when post-deploy verification matches', () => {
        const { fixture, result } = runDeploy('match', 'unreachable');

        try {
            expect(result.error).toBeUndefined();
            expect(result.signal).toBeNull();
            expect(result.status, result.stderr).toBe(0);
            expect(result.stdout).toContain(`✅ Verified live on TEST: ${BUILT_REV}`);
            expect(readFileSync(fixture.curlCount, 'utf8').trim()).toBe('2');
        } finally {
            cleanup(fixture.root);
        }
    });
});
