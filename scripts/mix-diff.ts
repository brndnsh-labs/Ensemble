import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import {
    diffMixReports,
    formatMixDiffHuman,
    loadMixReport,
    type MixDiffThresholds,
} from './mix-diff-utils.js';

const REPO_ROOT = process.cwd();

interface ParsedArgs {
    positional: string[];
    json: boolean;
    pretty: boolean;
    thresholds: Partial<MixDiffThresholds>;
}

function parseArgs(argv: string[]): ParsedArgs {
    const positional: string[] = [];
    const thresholds: Partial<MixDiffThresholds> = {};
    let json = false;
    let pretty = false;

    for (const arg of argv) {
        if (arg === '--json') {
            json = true;
        } else if (arg === '--pretty') {
            pretty = true;
        } else if (arg.startsWith('--threshold-db=')) {
            thresholds.db = Number(arg.slice('--threshold-db='.length));
        } else if (arg.startsWith('--threshold-spectral=')) {
            thresholds.spectralRelative = Number(arg.slice('--threshold-spectral='.length));
        } else if (arg.startsWith('--threshold-spikes=')) {
            thresholds.spikeRate = Number(arg.slice('--threshold-spikes='.length));
        } else if (arg.startsWith('--')) {
            throw new Error(`Unknown flag: ${arg}`);
        } else {
            positional.push(arg);
        }
    }

    return { positional, json, pretty, thresholds };
}

export async function runMixDiff(argv: string[] = process.argv.slice(2)): Promise<number> {
    const args = parseArgs(argv);
    if (args.positional.length !== 2) {
        process.stderr.write(
            'Usage: npm run mix:diff -- <before.json> <after.json> [--json] [--pretty] ' +
                '[--threshold-db=<n>] [--threshold-spectral=<n>] [--threshold-spikes=<n>]\n',
        );
        return 2;
    }

    const [beforePath, afterPath] = args.positional;
    const [beforeText, afterText] = await Promise.all([
        readFile(path.resolve(REPO_ROOT, beforePath), 'utf8'),
        readFile(path.resolve(REPO_ROOT, afterPath), 'utf8'),
    ]);

    const before = loadMixReport(beforeText);
    const after = loadMixReport(afterText);

    const baseThresholds = {
        db: 1.5,
        spectralRelative: 0.05,
        spikeRate: 1.5,
    };
    const thresholds = { ...baseThresholds, ...args.thresholds };

    const diff = diffMixReports(before, after, thresholds);

    if (args.json) {
        process.stdout.write(`${JSON.stringify(diff, null, args.pretty ? 2 : undefined)}\n`);
    } else {
        process.stdout.write(`${formatMixDiffHuman(diff)}\n`);
    }

    return diff.summary.significant > 0 ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    runMixDiff()
        .then((code) => {
            process.exitCode = code;
        })
        .catch((error) => {
            console.error('mix-diff failed:', error);
            process.exitCode = 1;
        });
}
