#!/usr/bin/env node
/**
 * test-loop.ts — run a Vitest file repeatedly to stress-test stochastic
 * critique tests (the project's "30-run reliability loop" convention).
 *
 * Usage:   npm run test:loop -- <vitest-file-or-name-filter> [count]
 * Example: npm run test:loop -- tests/standards/rock-bass-critique.test.ts
 *          npm run test:loop -- funk-bass 50
 *
 * Each iteration is a fresh `vitest run` process, so Math.random-driven
 * variation and module-level caches reset between runs — matching how a
 * real reliability sweep behaves (separate processes, not vitest --repeat,
 * which would share module state across iterations).
 *
 * Exits 0 only if every run passed; non-zero (and prints the first failing
 * run's output) otherwise. Existing as a single stable npm script means it
 * is auto-approved by the `Bash(npm run *)` permission rule — no per-run
 * permission prompts during a reliability loop.
 */
import { spawnSync } from 'node:child_process';

const args = process.argv.slice(2);
const target = args[0];
const count = Number(args[1]) || 30;

if (!target || Number.isNaN(count) || count < 1) {
    console.error('usage: npm run test:loop -- <vitest-file-or-name-filter> [count=30]');
    process.exit(1);
}

console.log(`test:loop — ${count} runs of "${target}"\n`);

let passed = 0;
let firstFailure = '';

for (let i = 1; i <= count; i++) {
    const res = spawnSync('npx', ['vitest', 'run', target], { encoding: 'utf8' });
    if (res.status === 0) {
        passed++;
    } else if (!firstFailure) {
        firstFailure = `${res.stdout ?? ''}${res.stderr ?? ''}`;
    }
    process.stdout.write(`\r  run ${i}/${count}  —  ${passed} passed, ${i - passed} failed`);
}

process.stdout.write('\n\n');

if (passed === count) {
    console.log(`✅ ${passed}/${count} runs passed — reliable.`);
    process.exit(0);
}

console.log(`❌ ${passed}/${count} runs passed — ${count - passed} FAILED.\n`);
console.log('--- output from first failing run ---');
console.log(firstFailure.trim());
process.exit(1);
