import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * Rewrites `shard-weights.json` — each spec file's measured seconds per project — from a
 * Playwright JSON report of a full run, so `playwright.config.ts` can split CI's shards by
 * duration (#1463). Re-measure when a CI shard runs visibly longer than its sibling:
 *
 *   ENSEMBLE_V2_BASE=/ npm run build
 *   ENSEMBLE_V2_BASE=/ PLAYWRIGHT_JSON_OUTPUT_NAME=report.json npx playwright test --workers=3 --reporter=json
 *   npm run shard:weights -- report.json "<date>, main at <sha>"
 *
 * Run it with no `V2_SHARD` set, so the report covers every file on both projects.
 */
const [reportPath, measured] = process.argv.slice(2);
if (!reportPath || !measured) {
    throw new Error('usage: npm run shard:weights -- <report.json> "<date>, main at <sha>"');
}
const report = JSON.parse(readFileSync(path.resolve(reportPath), 'utf8'));

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
for (const suite of report.suites) {
    walk(suite, suite.file);
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
