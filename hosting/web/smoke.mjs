// Prove a RUNNING ensemble-web container against hosting/README.md's cutover contract.
//
//   node hosting/web/smoke.mjs <image> <expected revision>
//
// Plain Node, no dependencies, and `node:http` rather than `fetch` on purpose: the assertions
// are about status codes, Location headers and Content-Encoding, and undici follows redirects
// and decompresses bodies before a test can look at either.
//
// The container is started exactly the way the stack runs one — non-root, read-only rootfs,
// every capability dropped, no new privileges, a tmpfs at /tmp — so those are proven rather
// than assumed. Nothing is retried except the bounded wait for the port to open: a retry
// anywhere else would turn a real failure into a slow pass.
import { execFileSync } from 'node:child_process';
import http from 'node:http';

const [image, revision] = process.argv.slice(2);
if (!image || !revision) {
    console.error('Usage: node hosting/web/smoke.mjs <image> <expected revision>');
    process.exit(64);
}

const docker = (...args) =>
    execFileSync('docker', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();

const failures = [];
/** Record a failure with enough to act on it: which URL, what was expected, what came back. */
const check = (passed, where, expected, actual) => {
    if (!passed) {
        failures.push(`  ${where}\n      expected: ${expected}\n      actual:   ${actual}`);
    }
};

let container;
/**
 * Remove the container once, whether the run ended cleanly, threw, or was interrupted. A
 * failure to remove is reported and swallowed: teardown must never mask the assertion result,
 * which is the only thing this script exists to produce.
 */
const removeContainer = () => {
    if (!container) {
        return;
    }
    const doomed = container;
    container = undefined;
    try {
        docker('rm', '--force', doomed);
    } catch (error) {
        console.error(`warning: could not remove container ${doomed}: ${error.message}`);
    }
};
// A ^C locally or a cancelled CI job must not leave a container holding a published port.
for (const [signal, code] of [
    ['SIGINT', 130],
    ['SIGTERM', 143],
]) {
    process.on(signal, () => {
        removeContainer();
        process.exit(code);
    });
}

try {
    container = docker(
        'run',
        '--detach',
        '--publish',
        '127.0.0.1::8080',
        '--read-only',
        '--tmpfs',
        '/tmp',
        '--cap-drop',
        'ALL',
        '--security-opt',
        'no-new-privileges',
        image,
    );
    const port = Number(docker('port', container, '8080').split('\n')[0].split(':').pop());

    /** One request, no redirect following and no transparent decompression. */
    const request = (path, { headers = {}, method = 'GET' } = {}) =>
        new Promise((resolve, reject) => {
            const call = http.request(
                { host: '127.0.0.1', port, path, method, headers },
                (response) => {
                    const chunks = [];
                    response.on('data', (chunk) => chunks.push(chunk));
                    response.on('end', () =>
                        resolve({
                            status: response.statusCode,
                            headers: response.headers,
                            body: Buffer.concat(chunks),
                        }),
                    );
                },
            );
            call.on('error', reject);
            call.end();
        });
    const text = async (path, options) => {
        const response = await request(path, options);
        return { ...response, text: response.body.toString('utf8') };
    };

    // The only permitted wait: the container has to accept a connection before anything can
    // be asserted about it. Bounded, and a timeout is a failure rather than a skip.
    let ready = false;
    for (let attempt = 0; attempt < 60 && !ready; attempt++) {
        try {
            ready = (await request('/')).status === 200;
        } catch {
            /* the port is not open yet */
        }
        if (!ready) {
            await new Promise((resolve) => setTimeout(resolve, 250));
        }
    }
    if (!ready) {
        console.error(docker('logs', container));
        throw new Error(`${image} never answered GET / on 127.0.0.1:${port}`);
    }

    // --- The stand itself, at the site root ------------------------------------------------
    const index = await text('/');
    check(index.status === 200, 'GET /', '200', index.status);
    check(
        /^text\/html/.test(index.headers['content-type'] ?? ''),
        'GET / content-type',
        'text/html',
        index.headers['content-type'],
    );
    check(
        index.text.includes('/_next/static/'),
        'GET / body',
        'references /_next/static/',
        index.text.slice(0, 200),
    );
    check(
        !index.text.includes('/v2/_next/'),
        'GET / body',
        'no /v2/_next/ references (this is the root build)',
        'found /v2/_next/',
    );
    check(
        index.headers['cache-control'] === 'no-cache',
        'GET / cache-control',
        'no-cache',
        index.headers['cache-control'],
    );
    check(
        index.headers['x-content-type-options'] === 'nosniff',
        'GET / x-content-type-options',
        'nosniff',
        index.headers['x-content-type-options'],
    );
    check(
        index.headers['content-security-policy'] === "frame-ancestors 'none'",
        'GET / content-security-policy',
        "frame-ancestors 'none'",
        index.headers['content-security-policy'],
    );

    const indexHtml = await text('/index.html');
    check(indexHtml.status === 200, 'GET /index.html', '200', indexHtml.status);
    check(
        indexHtml.headers['cache-control'] === 'no-cache',
        'GET /index.html cache-control',
        'no-cache',
        indexHtml.headers['cache-control'],
    );

    // --- The image serves the commit it was built from -------------------------------------
    const build = await text('/build.json');
    check(build.status === 200, 'GET /build.json', '200', build.status);
    check(
        /no-store|no-cache/.test(build.headers['cache-control'] ?? ''),
        'GET /build.json cache-control',
        'no-store or no-cache',
        build.headers['cache-control'],
    );
    let sourceRevision = '<unparseable>';
    try {
        sourceRevision = JSON.parse(build.text).sourceRevision;
    } catch (error) {
        sourceRevision = `JSON parse failed: ${error.message}`;
    }
    check(sourceRevision === revision, 'GET /build.json sourceRevision', revision, sourceRevision);

    // --- Service workers -------------------------------------------------------------------
    const worker = await text('/sw.js');
    check(worker.status === 200, 'GET /sw.js', '200', worker.status);
    check(
        worker.headers['cache-control'] === 'no-store',
        'GET /sw.js cache-control',
        'no-store',
        worker.headers['cache-control'],
    );
    check(
        worker.text.includes('const SCOPE = "/";'),
        'GET /sw.js body',
        'const SCOPE = "/";',
        worker.text.match(/const SCOPE = [^\n]*/)?.[0] ?? '<no SCOPE line>',
    );

    // The single most important line in the config. A browser still holding the beta's
    // `/v2/`-scoped worker reaches this origin through nothing but the update check for this
    // path, and a service-worker script fetch refuses to follow a redirect. A 308 here — the
    // obvious thing to write — strands that browser on a dead release permanently.
    const tombstone = await text('/v2/sw.js');
    check(
        tombstone.status === 200,
        'GET /v2/sw.js',
        '200 (a FILE — never a redirect: a worker script fetch rejects one)',
        tombstone.status,
    );
    check(
        tombstone.headers.location === undefined,
        'GET /v2/sw.js location',
        'no Location header',
        tombstone.headers.location,
    );
    check(
        tombstone.headers['cache-control'] === 'no-store',
        'GET /v2/sw.js cache-control',
        'no-store',
        tombstone.headers['cache-control'],
    );
    check(
        tombstone.text.includes('self.registration.unregister()'),
        'GET /v2/sw.js body',
        'the beta tombstone, which unregisters itself',
        tombstone.text.slice(0, 200),
    );

    // --- The beta path retires -------------------------------------------------------------
    // `node:http` sends `path` verbatim, so the last two rows reach nginx with the separators
    // intact — a client that normalised the path would quietly test something else.
    for (const [path, location] of [
        ['/v2/', '/'],
        ['/v2', '/'],
        ['/v2/x/y?a=b', '/x/y?a=b'],
        ['/v2?a=b', '/?a=b'],
        // Open-redirect shapes. Slicing `/v2` off the front of these leaves an AUTHORITY, not
        // a path: `//evil.example/x` is protocol-relative, and `/\/evil.example/x` reads the
        // same way because a WHATWG URL parser treats `\` as a separator in a special scheme.
        // #1355's tombstone declines to forward exactly these and leaves them to this config.
        ['/v2//evil.example/x', '/'],
        ['/v2/\\/evil.example/x', '/'],
    ]) {
        const moved = await request(path);
        check(moved.status === 308, `GET ${path}`, '308', moved.status);
        check(
            moved.headers.location === location,
            `GET ${path} location`,
            location,
            moved.headers.location,
        );
        // Parsed, never prefix-tested: `'//evil.example/x'.startsWith('/')` is true and sends
        // the browser off-origin. Behind Caddy and Cloudflare an absolute Location would also
        // publish the container's own scheme, host and LAN port to a public browser.
        let resolved;
        try {
            resolved = new URL(moved.headers.location ?? '', 'http://127.0.0.1').origin;
        } catch (error) {
            resolved = `URL parse failed: ${error.message}`;
        }
        check(
            resolved === 'http://127.0.0.1',
            `GET ${path} location`,
            'resolves back to this origin',
            `${moved.headers.location} -> ${resolved}`,
        );
    }

    // --- The web manifest keeps v1's installed identity ------------------------------------
    const manifest = await text('/manifest.json');
    check(manifest.status === 200, 'GET /manifest.json', '200', manifest.status);
    check(
        manifest.headers['cache-control'] === 'no-cache',
        'GET /manifest.json cache-control',
        'no-cache',
        manifest.headers['cache-control'],
    );
    let manifestId = '<unparseable>';
    try {
        manifestId = JSON.parse(manifest.text).id;
    } catch (error) {
        manifestId = `JSON parse failed: ${error.message}`;
    }
    check(manifestId === '/', 'GET /manifest.json id', '/', manifestId);
    check(
        /json/.test(manifest.headers['content-type'] ?? ''),
        'GET /manifest.json content-type',
        'a JSON media type',
        manifest.headers['content-type'],
    );

    // --- Caching and compression -----------------------------------------------------------
    const chunk = index.text.match(/\/_next\/static\/chunks\/[^"']+?\.js/)?.[0];
    check(typeof chunk === 'string', 'GET / body', 'a /_next/static/chunks/*.js reference', chunk);
    if (chunk) {
        const asset = await request(chunk, { headers: { 'accept-encoding': 'gzip' } });
        check(asset.status === 200, `GET ${chunk}`, '200', asset.status);
        check(
            /immutable/.test(asset.headers['cache-control'] ?? '') &&
                /max-age=31536000/.test(asset.headers['cache-control'] ?? ''),
            `GET ${chunk} cache-control`,
            'public, max-age=31536000, immutable',
            asset.headers['cache-control'],
        );
        check(
            /javascript/.test(asset.headers['content-type'] ?? ''),
            `GET ${chunk} content-type`,
            'a JavaScript media type',
            asset.headers['content-type'],
        );
        check(
            asset.headers['content-encoding'] === 'gzip',
            `GET ${chunk} content-encoding`,
            'gzip (text compresses)',
            asset.headers['content-encoding'],
        );
    }

    const packIndex = await text('/pack-files.json');
    check(packIndex.status === 200, 'GET /pack-files.json', '200', packIndex.status);
    check(
        packIndex.headers['cache-control'] === 'no-cache',
        'GET /pack-files.json cache-control',
        'no-cache',
        packIndex.headers['cache-control'],
    );
    let sample;
    try {
        sample = Object.keys(JSON.parse(packIndex.text)).find((path) => path.endsWith('.m4a'));
    } catch (error) {
        sample = undefined;
        check(false, 'GET /pack-files.json', 'parseable JSON', `parse failed: ${error.message}`);
    }
    check(typeof sample === 'string', 'GET /pack-files.json', 'at least one .m4a entry', sample);
    if (sample) {
        const audio = await request(sample, { headers: { 'accept-encoding': 'gzip' } });
        check(audio.status === 200, `GET ${sample}`, '200', audio.status);
        check(
            audio.headers['content-type'] === 'audio/x-m4a',
            `GET ${sample} content-type`,
            'audio/x-m4a',
            audio.headers['content-type'],
        );
        // Already-compressed AAC: gzipping it spends CPU to add bytes.
        check(
            audio.headers['content-encoding'] === undefined,
            `GET ${sample} content-encoding`,
            'none — audio is already compressed',
            audio.headers['content-encoding'],
        );
        // Seeking within a pack file, and what an <audio> element asks for on a slow link.
        const ranged = await request(sample, { headers: { range: 'bytes=0-99' } });
        check(ranged.status === 206, `GET ${sample} (Range)`, '206', ranged.status);
        check(
            ranged.body.length === 100,
            `GET ${sample} (Range) length`,
            '100 bytes',
            ranged.body.length,
        );
        check(
            typeof ranged.headers['content-range'] === 'string',
            `GET ${sample} (Range) content-range`,
            'a Content-Range header',
            ranged.headers['content-range'],
        );
    }

    const icon = await request('/icon.svg');
    check(icon.status === 200, 'GET /icon.svg', '200', icon.status);
    check(
        icon.headers['content-type'] === 'image/svg+xml',
        'GET /icon.svg content-type',
        'image/svg+xml',
        icon.headers['content-type'],
    );
    check(
        /max-age=86400/.test(icon.headers['cache-control'] ?? ''),
        'GET /icon.svg cache-control',
        'public, max-age=86400',
        icon.headers['cache-control'],
    );

    // --- Refusals: a real 404, no SPA fallback, nothing hidden served ----------------------
    // Every path here is a deterministic 404 — `return 404` for the API and dotfile rules, the
    // `=404` fallback for the rest — so the assertion is exact. `/50x.html` is in the list
    // because the base image ships one: this artifact must contain the export and nothing else,
    // and nginx's stock error page is both a lie about what is deployed and a version tell.
    for (const path of [
        '/there-is-no-such-page',
        '/deeper/missing/page/',
        '/api',
        '/api/auth/session',
        '/.git/config',
        '/.env',
        '/v2/.env',
        '/50x.html',
    ]) {
        const missing = await text(path);
        check(missing.status === 404, `GET ${path}`, '404', missing.status);
        // The SPA-fallback tell: app HTML behind a path the artifact does not contain.
        check(
            !missing.text.includes('/_next/static/'),
            `GET ${path} body`,
            'not the app shell — no SPA fallback',
            missing.text.slice(0, 200),
        );
    }
    // The one genuinely either/or case: an existing directory with no index file. nginx
    // answers 403 with autoindex off; what matters is that it is never a listing.
    const listing = await text('/packs/');
    check([403, 404].includes(listing.status), 'GET /packs/', '403 or 404', listing.status);
    check(
        !/Index of/i.test(listing.text),
        'GET /packs/ body',
        'no directory listing',
        listing.text.slice(0, 200),
    );

    // --- The runtime the stack actually gives it -------------------------------------------
    const uid = docker('exec', container, 'id', '-u');
    check(uid === '101', 'container uid', '101 (never root)', uid);
    const write = execFileSync(
        'docker',
        ['exec', container, 'sh', '-c', 'touch /etc/nginx/smoke 2>&1; echo "exit:$?"'],
        { encoding: 'utf8' },
    ).trim();
    check(
        !write.endsWith('exit:0'),
        'touch /etc/nginx/smoke',
        'refused — the root filesystem is read-only',
        write,
    );

    // What the image CLAIMS about itself. `build.json` proves the bytes are the right commit's;
    // this proves the label an operator reads off a running container agrees with them, which
    // is the only way `docker inspect` on docker04 can answer "what is actually deployed".
    const label = docker(
        'inspect',
        '--format',
        '{{index .Config.Labels "org.opencontainers.image.revision"}}',
        image,
    );
    check(label === revision, 'org.opencontainers.image.revision', revision, label);

    // The image's own HEALTHCHECK, run as Docker would: the compose service copies it, so a
    // missing wget or a wrong path has to fail here and not in a stack that never goes healthy.
    const healthcheck = JSON.parse(
        docker('inspect', '--format', '{{json .Config.Healthcheck.Test}}', image),
    );
    check(
        Array.isArray(healthcheck) && healthcheck[0] === 'CMD' && healthcheck.length > 1,
        'image HEALTHCHECK',
        'a CMD form healthcheck',
        JSON.stringify(healthcheck),
    );
    if (Array.isArray(healthcheck) && healthcheck[0] === 'CMD') {
        let probe = 'exit 0';
        try {
            docker('exec', container, ...healthcheck.slice(1));
        } catch (error) {
            probe = `exit ${error.status}: ${String(error.stderr ?? error.message).trim()}`;
        }
        check(probe === 'exit 0', 'image HEALTHCHECK command', 'exit 0', probe);
    }
} finally {
    removeContainer();
}

if (failures.length > 0) {
    console.error(`FAIL: ${failures.length} assertion(s) against ${image}\n${failures.join('\n')}`);
    process.exit(1);
}
console.log(
    `PASS: ${image} serves the root stand at ${revision} — /v2/sw.js is a file, /v2/* redirects relative, no SPA fallback, non-root read-only runtime`,
);
