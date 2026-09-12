import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const metadata = '.ensemble-release.json';
const checksums = '.ensemble-checksums';

async function filesIn(root, prefix = '') {
    const files = [];
    for (const name of (await readdir(path.join(root, prefix))).sort()) {
        const relative = prefix ? `${prefix}/${name}` : name;
        if (!prefix && [metadata, checksums].includes(name)) continue;
        // A release is anonymous static output, never a preview, DB or hidden file.
        if (relative !== '.ensemble-build.json' &&
            (!/^[a-zA-Z0-9_][a-zA-Z0-9_.@/-]*$/.test(relative) || name.startsWith('.'))) {
            throw new Error(`Unsafe artifact path: ${relative}`);
        }
        if (!prefix && ['v2', 'api', 'current'].includes(name)) {
            throw new Error(`Reserved artifact path: ${relative}`);
        }
        const stat = await lstat(path.join(root, relative));
        if (stat.isDirectory()) files.push(...(await filesIn(root, relative)));
        else if (stat.isFile()) files.push(relative);
        else throw new Error(`Artifact must contain regular files: ${relative}`);
    }
    return files;
}

async function inventory(root) {
    const result = Object.create(null);
    for (const file of await filesIn(root)) {
        result[file] = createHash('sha256').update(await readFile(path.join(root, file))).digest('hex');
    }
    return result;
}

function git(...args) {
    return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

async function sealArtifact(root, mode) {
    if (!['test', 'production'].includes(mode)) throw new Error('Invalid build mode');
    if (process.env.VITE_E2E_BRIDGE) throw new Error('Never release an E2E bridge build');
    const html = await readFile(path.join(root, 'index.html'), 'utf8');
    const revision = html.match(/index\.([a-f0-9]{7,40}(?:-[a-f0-9]+)?)\.js/)?.[1];
    const commit = git('rev-parse', 'HEAD');
    if (!revision || !commit.startsWith(revision.split('-')[0])) {
        throw new Error('Build revision does not match the checkout; rebuild first');
    }
    const build = JSON.parse(await readFile(path.join(root, '.ensemble-build.json'), 'utf8'));
    if (build.schema !== 1 || build.commit !== commit || build.revision !== revision ||
        build.mode !== mode || build.e2eBridge !== false) {
        throw new Error('Build-time provenance mismatch or E2E bridge present; rebuild first');
    }
    const files = await inventory(root);
    if (!files['sw.js']) throw new Error('Missing service worker');
    const manifest = {
        schema: 1,
        commit,
        revision,
        mode,
        dirty: git('status', '--porcelain').length > 0 || revision.includes('-'),
        files,
    };
    await writeFile(path.join(root, metadata), `${JSON.stringify(manifest, null, 2)}\n`);
    // Include the receipt itself in transfer verification; only local sealing writes it.
    const receiptHash = createHash('sha256').update(await readFile(path.join(root, metadata))).digest('hex');
    await writeFile(path.join(root, checksums),
        `${Object.entries({ ...files, [metadata]: receiptHash }).map(([file, hash]) => `${hash}  ${file}`).join('\n')}\n`);
    return manifest;
}

async function verifyArtifact(root, environment) {
    if (!['test', 'prod'].includes(environment)) throw new Error('Invalid environment');
    for (const file of [metadata, checksums]) {
        if (!(await lstat(path.join(root, file))).isFile()) throw new Error('Invalid receipt file');
    }
    const manifest = JSON.parse(await readFile(path.join(root, metadata), 'utf8'));
    if (manifest.schema !== 1 || !['test', 'production'].includes(manifest.mode) ||
        typeof manifest.dirty !== 'boolean' || !/^[a-f0-9]{40}$/.test(manifest.commit) ||
        !/^[a-f0-9]{7,40}(?:-[a-f0-9]+)?$/.test(manifest.revision) ||
        !manifest.commit.startsWith(manifest.revision.split('-')[0])) {
        throw new Error('Invalid release receipt');
    }
    if (manifest.commit !== git('rev-parse', 'HEAD')) throw new Error('Artifact is from another commit');
    if (environment === 'prod' && (manifest.mode !== 'production' || manifest.dirty || manifest.revision.includes('-'))) {
        throw new Error('Production requires a clean production-mode artifact');
    }
    const files = await inventory(root);
    if (JSON.stringify(files) !== JSON.stringify(manifest.files)) throw new Error('Artifact bytes changed; rebuild');
    const build = JSON.parse(await readFile(path.join(root, '.ensemble-build.json'), 'utf8'));
    if (build.schema !== 1 || build.commit !== manifest.commit || build.revision !== manifest.revision ||
        build.mode !== manifest.mode || build.e2eBridge !== false) {
        throw new Error('Build-time provenance does not match release receipt');
    }
    const receiptHash = createHash('sha256').update(await readFile(path.join(root, metadata))).digest('hex');
    const expected = `${Object.entries({ ...files, [metadata]: receiptHash }).map(([file, hash]) => `${hash}  ${file}`).join('\n')}\n`;
    if (await readFile(path.join(root, checksums), 'utf8') !== expected) throw new Error('Transfer checksums changed');
    return manifest;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
    const [command, root, target] = process.argv.slice(2);
    if (!root || !target || !['seal', 'verify'].includes(command)) {
        throw new Error('Usage: static-artifact.mjs <seal|verify> <directory> <mode|environment>');
    }
    const manifest = await (command === 'seal' ? sealArtifact(root, target) : verifyArtifact(root, target));
    console.log(manifest.revision);
}
