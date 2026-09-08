import { execFile } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

// Intentionally no production target or arbitrary host/path argument.
const run = promisify(execFile);
const origin = 'https://ensembletest.brndn.zip';
const host = 'ensembletest-admin';
const root = path.resolve('out');
const manifest = JSON.parse(await readFile(path.join(root, 'build.json'), 'utf8'));
const hash = manifest.fingerprint;
if (!/^[a-f0-9]{64}$/.test(hash)) {
    throw new Error('Invalid artifact fingerprint');
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
const release = `/var/www/html/.v2-previews/${releaseId}`;
console.log(`Uploading TEST-only v2 artifact ${hash} (existing app stays in place)`);
await run('ssh', [
    host,
    `test ! -e /var/www/html/v2 -o -L /var/www/html/v2 && mkdir -p ${release}`,
]);
const copied = await run('rsync', ['-az', '--delete', `${root}/`, `${host}:${release}/`]);
if (copied.stdout) {
    console.log(copied.stdout);
}
// Switch one symlink atomically only after the complete release is present.
await run('ssh', [
    host,
    `ln -sfn .v2-previews/${releaseId} /var/www/html/.v2-next && mv -Tf /var/www/html/.v2-next /var/www/html/v2`,
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
        'Existing test root changed during deployment; investigate before reporting success',
    );
}
console.log(
    `Verified all ${Object.keys(manifest.assets).length} assets + worker, manifest and unchanged test root. ${origin}/v2/`,
);
