import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Rewrites `shard-weights.json` — each spec file's measured seconds per project — from
 * Playwright JSON reports that together cover a full run, so `playwright.config.ts` can split
 * CI's shards by duration (#1463). Re-measure when a CI shard runs visibly longer than its
 * sibling.
 *
 * Measure on CI, not here: the runner is what the deal has to balance, and it is not this
 * machine scaled (a local run put WebKit's sound-pack tests at 120s where the runner takes far
 * longer, so the leg that drew them ran 110s behind its siblings). Every `v2-suite` leg uploads
 * its report, so from a green run of `main`:
 *
 *   gh run download <run-id> --pattern 'v2-shard-report-*' --dir reports
 *   npm run shard:weights -- $(find reports -name 'v2-shard-report.json') "<date>, CI run <run-id>"
 *
 * Or from one local run, with no `V2_SHARD` set so it covers every file on both projects:
 *
 *   ENSEMBLE_V2_BASE=/ npm run build
 *   ENSEMBLE_V2_BASE=/ PLAYWRIGHT_JSON_OUTPUT_NAME=report.json npx playwright test --workers=3 --reporter=json
 *   npm run shard:weights -- report.json "<date>, main at <sha>"
 */
const args = process.argv.slice(2);
const measured = args.pop();
const reportPaths = args;
if (reportPaths.length === 0 || !measured || measured.endsWith('.json')) {
    throw new Error(
        'usage: npm run shard:weights -- <report.json>... "<date>, CI run <id> | main at <sha>"',
    );
}

/** @type {Record<string, Record<string, number>>} */
const seconds = {};
function walk(suite, file) {
    const specFile = suite.file ?? file;
    for (const spec of suite.specs ?? []) {
        for (const test of spec.tests) {
            const ms = test.results.reduce((sum, result) => sum + result.duration, 0);
            seconds[test.projectName] ??= {};
            const project = seconds[test.projectName];
            project[specFile] = (project[specFile] ?? 0) + ms / 1000;
        }
    }
    for (const child of suite.suites ?? []) {
        walk(child, specFile);
    }
}
for (const reportPath of reportPaths) {
    const report = JSON.parse(readFileSync(path.resolve(reportPath), 'utf8'));
    for (const suite of report.suites) {
        walk(suite, suite.file);
    }
}

const rounded = Object.fromEntries(
    Object.entries(seconds)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([project, files]) => [
            project,
            Object.fromEntries(
                Object.entries(files)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([file, s]) => [file, Math.round(s * 10) / 10]),
            ),
        ]),
);
writeFileSync(
    path.resolve('shard-weights.json'),
    `${JSON.stringify({ measured, seconds: rounded }, null, 4)}\n`,
);
console.log(`shard-weights.json: ${Object.keys(rounded).join(', ')}`);
