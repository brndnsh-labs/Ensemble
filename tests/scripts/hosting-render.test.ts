import { spawnSync } from 'node:child_process';
import path from 'node:path';
import process from 'node:process';
import { describe, expect, it } from 'vitest';

// render.mjs shells out to the real `docker compose config`; the two guarantees pinned here
// are the ones that silently break a deploy if they regress (#1217): the API image tag must
// stay an interpolation with the pinned default (so the on-box .env can override it), and the
// secret env_file reference must survive rendering instead of being inlined as nothing.
const RENDER = path.resolve(import.meta.dirname, '../../hosting/static/render.mjs');
const TAG = `sha-${'a'.repeat(40)}`;
const hasCompose = spawnSync('docker', ['compose', 'version'], { encoding: 'utf8' }).status === 0;

function render(environment: string, env: Record<string, string | undefined>) {
    return spawnSync(process.execPath, [RENDER, environment], {
        encoding: 'utf8',
        env: { ...process.env, ...env },
    });
}

describe.skipIf(!hasCompose)('hosting/static/render.mjs', () => {
    it.each([
        ['test', 'ensembletest', '8092'],
        ['prod', 'ensemble', '8093'],
    ])('%s keeps the tag interpolation and the on-box env file', (environment, stack, port) => {
        const result = render(environment, { ENSEMBLE_API_TAG: TAG });
        expect(result.status, result.stderr).toBe(0);
        const out = result.stdout;
        expect(out).toContain(`  ${stack}-api:\n`);
        expect(out).toContain(
            `image: ghcr.io/brndnsh-labs/ensemble-api:\${ENSEMBLE_API_TAG:-${TAG}}`,
        );
        expect(out).toContain(`- path: /var/lib/docker-data/${stack}/env/api.env`);
        expect(out).toContain(`published: "${port}"`);
        expect(out).toContain(`name: ${stack}-api-data`);
        expect(out).not.toMatch(/PLACEHOLDER|ensemble-render-/);
        // The secret never appears as an inlined environment entry.
        expect(out).not.toContain('ENSEMBLE_AUTH_IP_SECRET');
    });

    it('refuses to render without a full-sha tag to pin', () => {
        expect(render('prod', { ENSEMBLE_API_TAG: undefined }).status).not.toBe(0);
        expect(render('prod', { ENSEMBLE_API_TAG: 'main' }).status).not.toBe(0);
    });
});
