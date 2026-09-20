import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';

// render.mjs shells out to the real `docker compose config`; the two guarantees pinned here
// are the ones that silently break a deploy if they regress (#1217): the API image tag must
// stay an interpolation with the pinned default (so the on-box .env can override it), and the
// secret env_file reference must survive rendering instead of being inlined as nothing.
// Since #1356 the web image is pinned and released the same way, through its OWN variable —
// the release step rewrites one service's line in .env and must never move the other.
const RENDER = path.resolve(import.meta.dirname, '../../hosting/static/render.mjs');
const TAG = `sha-${'a'.repeat(40)}`;
const WEB_TAG = `sha-${'b'.repeat(40)}`;
const hasCompose = spawnSync('docker', ['compose', 'version'], { encoding: 'utf8' }).status === 0;

function render(environment: string, env: Record<string, string | undefined>) {
    return spawnSync(process.execPath, [RENDER, environment], {
        encoding: 'utf8',
        env: { ...process.env, ...env },
    });
}

describe.skipIf(!hasCompose)('hosting/static/render.mjs', () => {
    it.each([
        ['test', 'ensembletest', '8092', '8094'],
        ['prod', 'ensemble', '8093', '8095'],
    ])(
        '%s keeps both tag interpolations and the on-box env file',
        (environment, stack, port, webPort) => {
            const result = render(environment, {
                ENSEMBLE_API_TAG: TAG,
                ENSEMBLE_WEB_TAG: WEB_TAG,
            });
            expect(result.status, result.stderr).toBe(0);
            const out = result.stdout;
            expect(out).toContain(`  ${stack}-api:\n`);
            expect(out).toContain(
                `image: ghcr.io/brndnsh-labs/ensemble-api:\${ENSEMBLE_API_TAG:-${TAG}}`,
            );
            expect(out).toContain(`- path: /var/lib/docker-data/${stack}/env/api.env`);
            expect(out).toContain(`published: "${port}"`);
            expect(out).toContain(`name: ${stack}-api-data`);
            // `<stack>-web` is the name the release script derives from its `web` argument, and
            // the tag is the web image's own — never the API's.
            expect(out).toContain(`  ${stack}-web:\n`);
            expect(out).toContain(`container_name: ${stack}-web\n`);
            expect(out).toContain(
                `image: ghcr.io/brndnsh-labs/ensemble-web:\${ENSEMBLE_WEB_TAG:-${WEB_TAG}}`,
            );
            expect(out).toContain(`published: "${webPort}"`);
            // The image runs under the same posture as `static`, with nothing mounted into it.
            const web = out.slice(out.indexOf(`  ${stack}-web:\n`)).split(/\n {2}\S/)[0];
            expect(web).toContain('read_only: true');
            expect(web).toContain('user: 101:101');
            expect(web).toMatch(/cap_drop:\n\s+- ALL/);
            expect(web).toContain('no-new-privileges:true');
            expect(web).not.toContain('volumes:');
            expect(web).not.toContain('env_file');
            expect(out).not.toMatch(/PLACEHOLDER|ensemble-render-/);
            // The secret never appears as an inlined environment entry.
            expect(out).not.toContain('ENSEMBLE_AUTH_IP_SECRET');
        },
    );

    it('refuses to render without a full-sha tag to pin', () => {
        const ok = { ENSEMBLE_API_TAG: TAG, ENSEMBLE_WEB_TAG: WEB_TAG };
        expect(render('prod', { ...ok, ENSEMBLE_API_TAG: undefined }).status).not.toBe(0);
        expect(render('prod', { ...ok, ENSEMBLE_API_TAG: 'main' }).status).not.toBe(0);
        expect(render('prod', { ...ok, ENSEMBLE_WEB_TAG: undefined }).status).not.toBe(0);
        expect(render('prod', { ...ok, ENSEMBLE_WEB_TAG: 'main' }).status).not.toBe(0);
    });
});
