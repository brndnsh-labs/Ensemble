// Materialize the shared recipe for the config-as-code homelab mirror.
// stdout only: this command does not write files, contact hosts, or deploy.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const environment = process.argv[2];
if (!['test', 'prod'].includes(environment)) {
    throw new Error('Usage: render.mjs <test|prod>');
}
const name = environment === 'test' ? 'ensembletest' : 'ensemble';
// The API image tag is the one value that changes between config deploys: the
// forced-command release step (#1219) rewrites it in the stack's on-box .env. The
// rendered file keeps a `${ENSEMBLE_API_TAG:-<pinned>}` interpolation whose default
// is the tag pinned at render time, so `docker compose config` validates from a bare
// /tmp copy (bin/docker-deploy) while a live .env wins on the box.
const pinnedTag = process.env.ENSEMBLE_API_TAG;
if (!/^sha-[0-9a-f]{40}$/.test(pinnedTag ?? '')) {
    throw new Error('Set ENSEMBLE_API_TAG=sha-<full commit sha> to the tag to pin as the default');
}
const TAG_PLACEHOLDER = 'RENDER-API-TAG-PLACEHOLDER';
// The web image (#1356) is pinned and released the same way, through its own variable:
// the release step rewrites ONE service's line in .env and must never move the other.
const pinnedWebTag = process.env.ENSEMBLE_WEB_TAG;
if (!/^sha-[0-9a-f]{40}$/.test(pinnedWebTag ?? '')) {
    throw new Error(
        'Set ENSEMBLE_WEB_TAG=sha-<full commit sha> to the web image tag to pin as the default',
    );
}
const WEB_TAG_PLACEHOLDER = 'RENDER-WEB-TAG-PLACEHOLDER';
// Compose stats env_file at config time, so an empty stand-in satisfies the first pass.
// The reference itself is then dropped from the model and re-inserted into the rendered
// YAML by hand: whether `config` preserves env_file varies by Compose version (v5 keeps
// it under --no-env-resolution, v2.38 on the CI runner drops it), and a rendered stack
// that silently lost its secret file would start an API that refuses to boot.
const apiEnvFile = `/var/lib/docker-data/${name}/env/api.env`;
const scratch = mkdtempSync(path.join(tmpdir(), 'ensemble-render-'));
const apiEnvStandIn = path.join(scratch, 'api.env');
writeFileSync(apiEnvStandIn, '');
const env = {
    ...process.env,
    ENSEMBLE_STATIC_PORT: environment === 'test' ? '8090' : '8091',
    ENSEMBLE_STATIC_ROOT: `/srv/ensemble-${environment}/www`,
    ENSEMBLE_NGINX_CONFIG: `/srv/ensemble-${environment}/nginx.conf`,
    ENSEMBLE_API_PORT: environment === 'test' ? '8092' : '8093',
    ENSEMBLE_HOSTNAME: environment === 'test' ? 'ensembletest.brndn.zip' : 'ensemble.brndn.zip',
    ENSEMBLE_API_ENV_FILE: apiEnvStandIn,
    ENSEMBLE_API_VOLUME: `${name}-api-data`,
    // Test is open so the whole sign-up path can be exercised on a real origin; production
    // opens at the cutover (#1357) and not before — until then its account UI is a beta.
    ENSEMBLE_REGISTRATION: environment === 'test' ? 'open' : 'closed',
    ENSEMBLE_API_TAG: TAG_PLACEHOLDER,
    // Beside the static runtime, not instead of it, until the cutover (#1357).
    ENSEMBLE_WEB_PORT: environment === 'test' ? '8094' : '8095',
    ENSEMBLE_WEB_TAG: WEB_TAG_PLACEHOLDER,
};
let model;
try {
    model = JSON.parse(
        execFileSync(
            'docker',
            [
                'compose',
                '--project-name',
                name,
                '-f',
                path.resolve(import.meta.dirname, 'compose.yml'),
                'config',
                '--no-env-resolution',
                '--format',
                'json',
            ],
            { env, encoding: 'utf8' },
        ),
    );
} catch (error) {
    rmSync(scratch, { recursive: true, force: true });
    throw error;
}
// Preserve the live test stack's Compose identity, so it is replaced rather than
// left orphaned while a new service attempts to bind the same port.
model.services[name] = { ...model.services.static, container_name: name };
delete model.services.static;
model.services[`${name}-api`] = { ...model.services.api, container_name: `${name}-api` };
delete model.services.api;
// `<stack>-web` is the name the release script derives from its `web` argument.
model.services[`${name}-web`] = { ...model.services.web, container_name: `${name}-web` };
delete model.services.web;
delete model.services[`${name}-api`].env_file;
delete model.services[`${name}-api`].environment?.ENSEMBLE_AUTH_IP_SECRET;
const yaml = execFileSync(
    'docker',
    ['compose', '--project-name', name, '-f', '-', 'config', '--no-env-resolution'],
    {
        input: JSON.stringify(model),
        encoding: 'utf8',
    },
);
rmSync(scratch, { recursive: true, force: true });
const substitute = (text, from, to) => {
    const parts = text.split(from);
    if (parts.length !== 2) {
        throw new Error(`Expected exactly one occurrence of ${from} in the rendered stack`);
    }
    return parts.join(to);
};
const rendered = substitute(
    substitute(
        substitute(
            yaml.trim(),
            `ensemble-api:${TAG_PLACEHOLDER}`,
            `ensemble-api:\${ENSEMBLE_API_TAG:-${pinnedTag}}`,
        ),
        `ensemble-web:${WEB_TAG_PLACEHOLDER}`,
        `ensemble-web:\${ENSEMBLE_WEB_TAG:-${pinnedWebTag}}`,
    ),
    `    container_name: ${name}-api\n`,
    `    container_name: ${name}-api\n    env_file:\n      - path: ${apiEnvFile}\n        required: true\n`,
);
if (rendered.includes(apiEnvStandIn) || rendered.includes('ENSEMBLE_AUTH_IP_SECRET')) {
    throw new Error('Render-time stand-in leaked into the rendered stack');
}
console.log(
    `# Generated from Ensemble hosting/static/compose.yml via render.mjs ${environment}.\n# Do not edit independently; regenerate both environment recipes from the shared source.\n# The two image tags are the only interpolations here, by design: each default is the tag\n# pinned at render time and the on-box .env (written by the release step) overrides it.\n${rendered}`,
);
