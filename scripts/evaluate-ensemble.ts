/**
 * Ensemble coordination and timing audit.
 * Emits compact JSON by default; use --jsonl for one line per aggregate/seed/measure row.
 */

import process from 'node:process';
import { pathToFileURL } from 'node:url';
import {
    buildEnsembleAuditReport,
    formatEnsembleAuditOutput,
    normalizeSeedList,
    runEnsembleSweep,
} from './ensemble-analysis-utils.js';
import {
    parseCliArgs,
    readBooleanOption,
    readNumberOption,
    readStringOption,
} from './soloist-analysis-utils.js';

const DEFAULT_SEED = 'ENSEMBLE_AUDIT';

export async function evaluateEnsemble(argv = process.argv.slice(2)) {
    const options = parseCliArgs(argv);
    const genre = readStringOption(options, 'genre', 'Jazz');
    const arrangementName = readStringOption(options, 'arrangement', 'changes');
    const defaultTimeSignature =
        arrangementName.toLowerCase() === 'five-four' || arrangementName === '5/4' ? '5/4' : '4/4';
    const bpm = readNumberOption(options, 'bpm', 112);
    const intensity = readNumberOption(options, 'intensity', 0.6);
    const complexity = readNumberOption(options, 'complexity', intensity);
    const loops = Math.max(1, Math.floor(readNumberOption(options, 'loops', 2)));
    const timeSignature = readStringOption(options, 'time-signature', defaultTimeSignature);
    const key = readStringOption(options, 'key', 'C');
    const density = readStringOption(options, 'density', 'standard');
    const baseSeed = readStringOption(options, 'seed', DEFAULT_SEED);
    const seedSweepOption = readStringOption(
        options,
        'seed-sweep',
        readStringOption(options, 'seeds', ''),
    );
    const seeds = normalizeSeedList(baseSeed, seedSweepOption);
    const creativity = readBooleanOption(options, 'creativity', true);
    const includeBass = readBooleanOption(options, 'bass', true);
    const includeChords = readBooleanOption(options, 'chords', true);
    const includeSoloist = readBooleanOption(options, 'soloist', true);
    const includeHarmony = readBooleanOption(options, 'harmony', true);
    const includeDrums = readBooleanOption(options, 'drums', true);
    const full = readBooleanOption(options, 'full', false);
    const jsonl = readBooleanOption(options, 'jsonl', false);
    const pretty = readBooleanOption(options, 'pretty', false);
    const quietSeedLogs = !readBooleanOption(options, 'show-seeder-log', false);
    const drumPreset = readStringOption(options, 'drum-preset', '');
    const chordStyle = readStringOption(options, 'chord-style', '');
    const bassStyle = readStringOption(options, 'bass-style', '');
    const soloistStyle = readStringOption(options, 'soloist-style', '');
    const harmonyStyle = readStringOption(options, 'harmony-style', '');

    const captures = await runEnsembleSweep({
        genre,
        bpm,
        intensity,
        complexity,
        arrangementName,
        timeSignature,
        key,
        density,
        seeds,
        loops,
        creativity,
        includeBass,
        includeChords,
        includeSoloist,
        includeHarmony,
        includeDrums,
        quietSeedLogs,
        drumPreset: drumPreset || undefined,
        chordStyle: chordStyle || undefined,
        bassStyle: bassStyle || undefined,
        soloistStyle: soloistStyle || undefined,
        harmonyStyle: harmonyStyle || undefined,
    });

    const report = buildEnsembleAuditReport({
        captures,
        options: {
            genre,
            bpm,
            intensity,
            complexity,
            arrangementName,
            timeSignature,
            key,
            density,
            loops,
            seeds,
            creativity,
            bass: includeBass,
            chords: includeChords,
            soloist: includeSoloist,
            harmony: includeHarmony,
            drums: includeDrums,
            drumPreset: drumPreset || null,
            chordStyle: chordStyle || null,
            bassStyle: bassStyle || null,
            soloistStyle: soloistStyle || null,
            harmonyStyle: harmonyStyle || null,
            full,
        },
        full,
    });

    process.stdout.write(formatEnsembleAuditOutput(report, { jsonl, pretty }));
    process.stdout.write('\n');
    return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    evaluateEnsemble().catch((error) => {
        console.error('\nEnsemble audit failed:', error);
        process.exitCode = 1;
    });
}
