import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

// Usage: node scripts/deploy.mjs <test|prod>
//
// Publishes the built `out/` directory as an immutable release beside the root
// app and swaps one symlink so nginx serves it at /v2/ (the shared
// hosting/static/nginx.conf serves `location /v2/` from `/site/v2` in both
// environments). Static-only: no database, no API, no root-app change.
//
// Targets are fixed here on purpose — no arbitrary host/path argument. Prod is
// published by the CI `deploy` job after the root release, over the same scoped
// `ensemble-admin` alias and deploy key that job materializes; the workstation
// alias of that name is not that account, so a manual prod run fails to connect
// rather than publishing from a laptop.
const run = promisify(execFile);
const targets = {
    test: {
        label: 'TEST',
        origin: 'https://ensembletest.brndn.zip',
        host: 'docker04-admin',
        // Host-side bind mount of the nginx container, not a path inside it.
        webRoot: '/srv/ensemble-test/www',
        releases: '.v2-previews',
        cleanHeadOnly: false,
    },
    prod: {
        label: 'PROD',
        origin: 'https://ensemble.brndn.zip',
        host: 'ensemble-admin',
        webRoot: '/srv/ensemble-prod/www',
        releases: '.v2-releases',
        cleanHeadOnly: true,
    },
};
const target = targets[process.argv[2]];
if (!target) {
    console.error('Usage: node scripts/deploy.mjs <test|prod>');
    process.exit(64);
}
const { label, origin, host, webRoot, releases } = target;
const root = path.resolve('out');
const manifest = JSON.parse(await readFile(path.join(root, 'build.json'), 'utf8'));
const hash = manifest.fingerprint;
if (!/^[a-f0-9]{64}$/.test(hash)) {
    throw new Error('Invalid artifact fingerprint');
}
// This publisher is the `/v2` rsync+symlink release and nothing else: every path below it
// (`webRoot/v2`, `.v2-releases`, the verification URLs) is that layout, and it retires at the
// cutover, when decision 1 of docs/design/ensemble-v2-rollout.md replaces it with the
// `ensemble-web` image. So refuse an artifact built for another base (`ENSEMBLE_V2_BASE`,
// #1354) rather than publishing a root build under `/v2/` — the manifest's own asset keys are
// the evidence, since CI downloads this artifact instead of rebuilding it.
const foreign = Object.keys(manifest.assets).find((url) => !url.startsWith('/v2/'));
if (foreign) {
    throw new Error(
        `This artifact was not built for /v2 (asset ${foreign}); scripts/deploy.mjs only publishes the /v2 release. Rebuild with ENSEMBLE_V2_BASE=/v2, or publish the root build through its own image.`,
    );
}
if (target.cleanHeadOnly) {
    // PROD must never serve an uncommitted or off-HEAD tree — the same rule
    // scripts/deploy.sh applies to the root app. build.json records the source
    // revision the offline recipe ran against; a dirty audition build is test-only.
    const head = (await run('git', ['rev-parse', 'HEAD'])).stdout.trim();
    const dirty = (await run('git', ['status', '--porcelain'])).stdout.trim();
    if (manifest.sourceRevision !== head || dirty) {
        throw new Error(
            `Refusing to publish ${label} from a build that is not a clean HEAD (built ${manifest.sourceRevision}, HEAD ${head}${dirty ? ', tree dirty' : ''})`,
        );
    }
}
for (const [url, expected] of Object.entries(manifest.assets)) {
    const file = path.resolve(root, url.slice('/v2/'.length));
    if (!url.startsWith('/v2/') || !file.startsWith(`${root}/`)) {
        throw new Error('Invalid asset path');
    }
    if (
        createHash('sha256')
            .update(await readFile(file))
            .digest('hex') !== expected
    ) {
        throw new Error(`Rebuild required: ${url}`);
    }
}
const oldRoot = await (await fetch(`${origin}/`, { cache: 'no-store' })).text();
const releaseId = `${hash}-${randomUUID()}`;
const release = `${webRoot}/${releases}/${releaseId}`;
console.log(`Uploading ${label} v2 artifact ${hash} (root app stays in place)`);
// The v2 path must be absent or already our symlink — never a real directory.
await run('ssh', [host, `test ! -e ${webRoot}/v2 -o -L ${webRoot}/v2 && mkdir -p ${release}`]);
const copied = await run('rsync', ['-az', '--delete', `${root}/`, `${host}:${release}/`]);
if (copied.stdout) {
    console.log(copied.stdout);
}
// Switch one symlink atomically only after the complete release is present.
// Old releases are retained; rollback is repointing `v2` the same way.
await run('ssh', [
    host,
    `ln -sfn ${releases}/${releaseId} ${webRoot}/.v2-next && mv -Tf ${webRoot}/.v2-next ${webRoot}/v2`,
]);
const live = await fetch(`${origin}/v2/build.json?verify=${hash}`, { cache: 'no-store' });
if (!live.ok || (await live.json()).fingerprint !== hash) {
    throw new Error('Live manifest does not match');
}
for (const [url, expected] of Object.entries(manifest.assets)) {
    const response = await fetch(`${origin}${url}?verify=${hash}`, { cache: 'no-store' });
    if (
        !response.ok ||
        createHash('sha256')
            .update(Buffer.from(await response.arrayBuffer()))
            .digest('hex') !== expected
    ) {
        throw new Error(`Live asset mismatch: ${url}`);
    }
}
const sw = await fetch(`${origin}/v2/sw.js?verify=${hash}`, { cache: 'no-store' });
if (!sw.ok || (await sw.text()) !== (await readFile(path.join(root, 'sw.js'), 'utf8'))) {
    throw new Error('Live service worker mismatch');
}
const canonicalWorker = await fetch(`${origin}/v2/sw.js`, { cache: 'no-store' });
if (
    !canonicalWorker.ok ||
    (await canonicalWorker.text()) !== (await readFile(path.join(root, 'sw.js'), 'utf8'))
) {
    throw new Error(
        'The edge still serves an older canonical service worker. An authorized operator must purge that URL or configure no-cache before this deployment is ready. Do not report success from the cache-busted verification alone.',
    );
}
const newRoot = await (await fetch(`${origin}/`, { cache: 'no-store' })).text();
if (newRoot !== oldRoot) {
    throw new Error(
        `Existing ${label} root changed during deployment; investigate before reporting success`,
    );
}
console.log(
    `Verified all ${Object.keys(manifest.assets).length} assets + worker, manifest and unchanged ${label} root. ${origin}/v2/`,
);
