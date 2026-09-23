import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

/**
 * The v2 export's bundle-size tripwire (#1388). One number: the total bytes of JavaScript under
 * `out/_next/static/` — the app's own chunks and its workers, which every visitor downloads and
 * the offline install caches. It fails only when that total passes the checked-in ceiling, which
 * sits about 25% above the measured baseline: a loose line that stays quiet through ordinary
 * work and trips on the accident it exists for — an eager import or a heavy dependency.
 *
 * It is a tripwire, not a budget to work toward (`docs/guides/bundle-hygiene.md`). When it
 * trips, find what grew before raising the ceiling; raise it deliberately, in its own commit,
 * with the new baseline measured the same way.
 */
const root = path.resolve('out/_next/static');
const limits = JSON.parse(readFileSync(path.resolve('bundle-tripwire.json'), 'utf8'));

function scripts(dir) {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const file = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            return scripts(file);
        }
        return entry.name.endsWith('.js') ? [{ file, bytes: statSync(file).size }] : [];
    });
}

const chunks = scripts(root);
if (chunks.length === 0) {
    throw new Error(`No JavaScript under ${root} — build the export first.`);
}
const total = chunks.reduce((sum, chunk) => sum + chunk.bytes, 0);
const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;
const line = `v2 export JavaScript: ${kb(total)} in ${chunks.length} files (ceiling ${kb(limits.ceilingBytes)}, baseline ${kb(limits.baselineBytes)})`;

if (total <= limits.ceilingBytes) {
    console.log(line);
} else {
    const largest = chunks
        .sort((a, b) => b.bytes - a.bytes)
        .slice(0, 5)
        .map((chunk) => `  ${kb(chunk.bytes).padStart(10)}  ${path.relative(root, chunk.file)}`);
    console.error(
        [
            `${line} — OVER by ${kb(total - limits.ceilingBytes)}.`,
            'Largest files:',
            ...largest,
            'Find what grew (docs/guides/bundle-hygiene.md) before raising the ceiling in prototypes/v2/bundle-tripwire.json.',
        ].join('\n'),
    );
    process.exitCode = 1;
}
