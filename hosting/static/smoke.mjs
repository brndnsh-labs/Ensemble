// Disposable local Docker rehearsal; no host ports, registry writes or live services.
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import {
    chmodSync,
    mkdirSync,
    mkdtempSync,
    readFileSync,
    renameSync,
    rmSync,
    symlinkSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const root = mkdtempSync(path.join(tmpdir(), 'ensemble-static-smoke-'));
chmodSync(root, 0o755);
const recipe = readFileSync(new URL('compose.yml', import.meta.url), 'utf8');
const image = recipe.match(/image: (\S+)/)[1];
const config = path.resolve(import.meta.dirname, 'nginx.conf');
let container;
const docker = (...args) =>
    execFileSync('docker', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
try {
    for (const name of ['one', 'two']) {
        mkdirSync(path.join(root, '.releases', name), { recursive: true });
        for (const file of ['index.html', 'sw.js', 'manifest.json']) {
            writeFileSync(path.join(root, '.releases', name, file), name);
        }
    }
    mkdirSync(path.join(root, '.v2-previews', 'preview'), { recursive: true });
    writeFileSync(path.join(root, '.v2-previews', 'preview', 'index.html'), 'preview-sentinel');
    symlinkSync('.v2-previews/preview', path.join(root, 'v2'));
    symlinkSync('.releases/one', path.join(root, 'current'));
    container = docker(
        'run',
        '--detach',
        '--rm',
        '--network',
        'none',
        '--read-only',
        '--user',
        '101:101',
        '--cap-drop',
        'ALL',
        '--security-opt',
        'no-new-privileges',
        '--tmpfs',
        '/tmp:size=32m,mode=1777',
        '--mount',
        `type=bind,src=${root},dst=/site,readonly`,
        '--mount',
        `type=bind,src=${config},dst=/etc/nginx/nginx.conf,readonly`,
        '--entrypoint',
        'nginx',
        image,
        '-g',
        'daemon off;',
    );
    const request = (url) =>
        docker('exec', container, 'wget', '-qO-', `http://127.0.0.1:8080${url}`);
    let ready = false;
    for (let attempt = 0; attempt < 30; attempt++) {
        try {
            ready = request('/') === 'one';
        } catch {
            /* startup only */
        }
        if (ready) {
            break;
        }
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(ready, true, 'container serves initial release');
    assert.equal(request('/v2/'), 'preview-sentinel');
    for (const url of [
        '/missing.js',
        '/api/auth/session',
        '/.releases/one/index.html',
        '/v2/.secret',
        '/current/index.html',
    ]) {
        let error;
        try {
            request(url);
        } catch (caught) {
            error = caught;
        }
        assert.match(String(error?.stderr), /404/, `${url} must be a real 404`);
    }
    for (const [url, policy] of [
        ['/sw.js', 'no-store'],
        ['/index.html', 'no-cache'],
        ['/v2/', 'no-store'],
    ]) {
        const probe = spawnSync(
            'docker',
            ['exec', container, 'wget', '-S', '-O', '/dev/null', `http://127.0.0.1:8080${url}`],
            { encoding: 'utf8' },
        );
        assert.equal(probe.status, 0);
        assert.match(probe.stderr, new RegExp(`Cache-Control: ${policy}`, 'i'));
    }
    assert.equal(docker('exec', container, 'id', '-u'), '101');
    const write = spawnSync('docker', ['exec', container, 'touch', '/etc/hosting-smoke'], {
        encoding: 'utf8',
    });
    assert.notEqual(write.status, 0, 'runtime root must not be writable');
    symlinkSync('.releases/two', path.join(root, '.next'));
    renameSync(path.join(root, '.next'), path.join(root, 'current'));
    assert.equal(request('/'), 'two', 'same running container follows the atomic pointer');
    assert.equal(request('/v2/'), 'preview-sentinel', 'root release does not touch preview');
    // A prod-style root has no preview pointer, using the identical nginx recipe.
    renameSync(path.join(root, 'v2'), path.join(root, '.preview-disabled'));
    let absent;
    try {
        request('/v2/');
    } catch (error) {
        absent = error;
    }
    assert.match(String(absent?.stderr), /404/);
    console.log(
        'PASS: non-root/read-only runtime, real 404s, atomic swap, test preview isolation, prod v2 absence',
    );
} finally {
    if (container) {
        docker('rm', '--force', container);
    }
    rmSync(root, { recursive: true, force: true });
}
