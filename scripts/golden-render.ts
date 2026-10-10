/**
 * The golden-render check: does the band still SOUND the way it did? (#1577)
 *
 *   npm run golden                 # render the frozen requests, compare with the fingerprints
 *   npm run golden -- --update     # an intended sound change: rewrite the fingerprints
 *   npm run golden -- --refreeze   # the band's events changed shape: recompose, then update
 *   npm run golden -- --scene=funk-synth [--json]
 *
 * A few render requests are frozen in `tests/golden/fixtures/<scene>.request.json`: the score,
 * the events the band played, the lane sounds and the seed. Frozen, so the check is about the
 * sound of FIXED notes. A `band/` style change does not move it (the critique claims hold what
 * the band plays); a voice, bus, pack or master-chain change does. Each stem of each request
 * is rendered in node (`mix-render-node.ts`) and reduced to a fingerprint (level, tone, width
 * and a loudness contour), compared with `tests/golden/fixtures/fingerprints.json` inside
 * `TOLERANCE`. A difference prints what moved and exits 1.
 *
 * It measures; it does not listen. A fingerprint that holds says the render did not move,
 * never that it sounds good, and a change it reports still needs the ear (`Needs-ear`).
 */

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Lane } from '../band/index.js';
import { computePeak, computeRms, toDb } from './audio-analysis.js';
import {
    laneEvents,
    type MixScene,
    performSceneForReport,
    sceneVoices,
    type VoicePin,
} from './band-scene.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const GOLDEN_DIR = path.join(REPO_ROOT, 'tests/golden/fixtures');
const FINGERPRINTS_PATH = path.join(GOLDEN_DIR, 'fingerprints.json');
const SAMPLE_RATE = 44100;
const SEED = 'GOLDEN';

/**
 * The scenes the check renders. Four bars each: long enough for a tail, a fill and the
 * sidechain to show, short enough that every PR can afford them. Between them they cover the
 * built-in voices under two bus EQs (Funk, Jazz's lower bass highpass and swing ride) and the
 * packs most charts play on.
 */
export const GOLDEN_SCENES: readonly MixScene[] = [
    {
        id: 'funk-synth',
        genreFeel: 'Funk',
        bpm: 104,
        key: 'E',
        intensity: 0.78,
        sections: [{ id: 'a', label: 'A', value: 'Em7 | Em7 | A7 | B7' }],
    },
    {
        id: 'jazz-synth',
        genreFeel: 'Jazz',
        bpm: 140,
        key: 'C',
        intensity: 0.6,
        sections: [{ id: 'a', label: 'A', value: 'Dm7 | G7 | Cmaj7 | A7' }],
    },
    {
        id: 'jazz-sample-band',
        genreFeel: 'Jazz',
        bpm: 140,
        key: 'F',
        intensity: 0.6,
        sections: [{ id: 'a', label: 'A', value: 'Gm7 | C7 | Fmaj7 | D7' }],
        voices: [
            { module: 'groove', voice: 'pack:acoustic-kit' },
            { module: 'bass', voice: 'pack:upright-bass' },
            { module: 'chords', voice: 'pack:grand' },
            { module: 'soloist', voice: 'pack:sax-alto' },
        ],
    },
    {
        id: 'neo-soul-keys',
        genreFeel: 'Neo-Soul',
        bpm: 84,
        key: 'C',
        intensity: 0.6,
        sections: [{ id: 'a', label: 'A', value: 'Fmaj7 | Em7 | Dm7 | Cmaj7' }],
        voices: [
            { module: 'groove', voice: 'pack:acoustic-kit' },
            { module: 'chords', voice: 'pack:rhodes' },
            { module: 'soloist', voice: 'pack:electric-guitar-clean' },
        ],
    },
];

/** The stems fingerprinted for every scene: the whole band, and each lane alone. */
export const GOLDEN_STEMS: ReadonlyArray<{ id: string; lanes: readonly Lane[] }> = [
    { id: 'mix', lanes: ['drums', 'bass', 'comp', 'lead'] },
    { id: 'drums', lanes: ['drums'] },
    { id: 'bass', lanes: ['bass'] },
    { id: 'comp', lanes: ['comp'] },
    { id: 'lead', lanes: ['lead'] },
];

/** A frozen render: everything `renderBand` needs, with all four lanes' events. */
export interface FrozenRequest {
    score: unknown;
    passes: Array<Array<{ lane: Lane }>>;
    bpm: number;
    sampleRate: number;
    intensity: number;
    voices: VoicePin[];
    randomSeed: string;
    genreFeel: string;
}

/** Compose a scene with the band as it plays today and freeze the result. */
export function freezeScene(scene: MixScene): FrozenRequest {
    const voices = sceneVoices(scene);
    const performance = performSceneForReport(scene, SEED, 1, voices);
    return {
        score: performance.score,
        passes: performance.band,
        bpm: scene.bpm,
        sampleRate: SAMPLE_RATE,
        intensity: performance.settings.intensity ?? 0.7,
        voices,
        randomSeed: `${scene.id}:${SEED}`,
        genreFeel: scene.genreFeel,
    };
}

/** Band centres for the tone part of a fingerprint: octaves from the sub to the air. */
export const FINGERPRINT_BANDS = [60, 125, 250, 500, 1000, 2000, 4000, 8000] as const;
const BAND_WINDOW = 4096;
const BLOCK_SECONDS = 0.5;
/** Levels under this are reported as this: below it a dB figure is rounding noise. */
export const FLOOR_DB = -90;

/** What a render is reduced to. Every level is dBFS, rounded to a hundredth. */
export interface Fingerprint {
    seconds: number;
    rmsDb: number;
    peakDb: number;
    /** Mean level at each of `FINGERPRINT_BANDS`, over the whole render. */
    bandsDb: number[];
    /** The side channel's level; `FLOOR_DB` for a mono stem. */
    sideDb: number;
    /** RMS of each half second: the loudness contour (envelopes, tails, ducking). */
    blocksDb: number[];
}

const round2 = (value: number): number => Math.round(value * 100) / 100;
const floored = (db: number): number =>
    round2(Number.isFinite(db) ? Math.max(FLOOR_DB, db) : FLOOR_DB);

/** Reduce a render to its fingerprint. */
export function fingerprint(channels: Float32Array[], sampleRate: number): Fingerprint {
    const length = channels[0]?.length ?? 0;
    const mono = new Float32Array(length);
    for (const channel of channels) {
        for (let i = 0; i < length; i++) {
            mono[i] += channel[i] / channels.length;
        }
    }

    // Mean Goertzel magnitude per band over every consecutive window, as an amplitude.
    const bandsDb = FINGERPRINT_BANDS.map((freq) => {
        const coeff = 2 * Math.cos((2 * Math.PI * freq) / sampleRate);
        let sum = 0;
        let windows = 0;
        for (let start = 0; start + BAND_WINDOW <= length; start += BAND_WINDOW) {
            let s1 = 0;
            let s2 = 0;
            for (let i = start; i < start + BAND_WINDOW; i++) {
                const s0 = mono[i] + coeff * s1 - s2;
                s2 = s1;
                s1 = s0;
            }
            sum += Math.sqrt(Math.max(0, s1 * s1 + s2 * s2 - coeff * s1 * s2)) / (BAND_WINDOW / 2);
            windows++;
        }
        return floored(toDb(windows > 0 ? sum / windows : 0));
    });

    const blockLength = Math.round(BLOCK_SECONDS * sampleRate);
    const blocksDb: number[] = [];
    for (let start = 0; start + blockLength <= length; start += blockLength) {
        blocksDb.push(floored(toDb(computeRms(mono.subarray(start, start + blockLength)))));
    }

    let sideDb = FLOOR_DB;
    if (channels.length >= 2) {
        const side = new Float32Array(length);
        for (let i = 0; i < length; i++) {
            side[i] = (channels[0][i] - channels[1][i]) * 0.5;
        }
        sideDb = floored(toDb(computeRms(side)));
    }

    return {
        seconds: round2(length / sampleRate),
        rmsDb: floored(toDb(computeRms(mono))),
        peakDb: floored(toDb(computePeak(mono))),
        bandsDb,
        sideDb,
        blocksDb,
    };
}

/**
 * How far a fingerprint may move before the check fails, in dB. A node render repeats to
 * within 0.02 dB on every metric (the same requests twice, idle and with every core busy), so
 * these sit five times over the noise and well under the smallest change worth hearing: a
 * planted 0.5 dB voice change, a bus filter move and a reverb send change all trip them.
 * Levels quieter than `quietDb` are compared at `quietToleranceDb`: far down, a dB is a tiny
 * absolute change.
 */
export const TOLERANCE = {
    levelDb: 0.1,
    peakDb: 0.1,
    bandDb: 0.1,
    sideDb: 0.1,
    blockDb: 0.1,
    seconds: 0.02,
    quietDb: -60,
    quietToleranceDb: 0.5,
} as const;

export interface Difference {
    metric: string;
    golden: number;
    actual: number;
    delta: number;
    tolerance: number;
}

/** Every metric of `actual` that sits outside `TOLERANCE` of `golden`. */
export function compareFingerprints(golden: Fingerprint, actual: Fingerprint): Difference[] {
    const differences: Difference[] = [];
    const check = (metric: string, was: number, now: number, tolerance: number): void => {
        const quiet = was < TOLERANCE.quietDb && now < TOLERANCE.quietDb;
        const allowed = quiet ? Math.max(tolerance, TOLERANCE.quietToleranceDb) : tolerance;
        const delta = now - was;
        if (Math.abs(delta) > allowed + 1e-9) {
            differences.push({ metric, golden: was, actual: now, delta, tolerance: allowed });
        }
    };
    if (Math.abs(actual.seconds - golden.seconds) > TOLERANCE.seconds) {
        differences.push({
            metric: 'length (s)',
            golden: golden.seconds,
            actual: actual.seconds,
            delta: actual.seconds - golden.seconds,
            tolerance: TOLERANCE.seconds,
        });
    }
    check('level (RMS)', golden.rmsDb, actual.rmsDb, TOLERANCE.levelDb);
    check('peak', golden.peakDb, actual.peakDb, TOLERANCE.peakDb);
    check('stereo side', golden.sideDb, actual.sideDb, TOLERANCE.sideDb);
    FINGERPRINT_BANDS.forEach((freq, index) => {
        const label = freq >= 1000 ? `${freq / 1000} kHz` : `${freq} Hz`;
        check(`tone ${label}`, golden.bandsDb[index], actual.bandsDb[index], TOLERANCE.bandDb);
    });
    const blocks = Math.max(golden.blocksDb.length, actual.blocksDb.length);
    for (let index = 0; index < blocks; index++) {
        const from = (index * BLOCK_SECONDS).toFixed(1);
        check(
            `contour ${from}–${((index + 1) * BLOCK_SECONDS).toFixed(1)} s`,
            golden.blocksDb[index] ?? FLOOR_DB,
            actual.blocksDb[index] ?? FLOOR_DB,
            TOLERANCE.blockDb,
        );
    }
    return differences;
}

export type FingerprintFile = {
    /** Bumped when the fingerprint's own definition changes, so old files fail loudly. */
    version: number;
    scenes: Record<string, Record<string, Fingerprint>>;
};
export const FINGERPRINT_VERSION = 1;

export interface SceneResult {
    scene: string;
    stem: string;
    differences: Difference[];
    /** Set when the committed file has no fingerprint for this stem. */
    missing: boolean;
}

/** Compare a run with the committed fingerprints, scene by scene and stem by stem. */
export function compareRun(
    golden: FingerprintFile,
    actual: Record<string, Record<string, Fingerprint>>,
): SceneResult[] {
    const results: SceneResult[] = [];
    for (const [scene, stems] of Object.entries(actual)) {
        for (const [stem, print] of Object.entries(stems)) {
            const was = golden.scenes[scene]?.[stem];
            results.push({
                scene,
                stem,
                missing: !was,
                differences: was ? compareFingerprints(was, print) : [],
            });
        }
    }
    return results;
}

const signed = (value: number): string => `${value >= 0 ? '+' : ''}${value.toFixed(2)}`;

/** The report a failed check prints: what moved, largest first, capped per stem. */
export function formatResults(results: SceneResult[], limit = 6): string {
    const lines: string[] = [];
    for (const result of results) {
        if (result.missing) {
            lines.push(`${result.scene} / ${result.stem}: no committed fingerprint`);
            continue;
        }
        if (result.differences.length === 0) {
            continue;
        }
        const sorted = [...result.differences].sort(
            (a, b) => Math.abs(b.delta) / b.tolerance - Math.abs(a.delta) / a.tolerance,
        );
        lines.push(`${result.scene} / ${result.stem}: ${sorted.length} moved`);
        for (const difference of sorted.slice(0, limit)) {
            lines.push(
                `    ${difference.metric.padEnd(22)} ${difference.golden.toFixed(2).padStart(8)} → ${difference.actual.toFixed(2).padStart(8)}  (${signed(difference.delta)}, allowed ±${difference.tolerance})`,
            );
        }
        if (sorted.length > limit) {
            lines.push(`    +${sorted.length - limit} more`);
        }
    }
    return lines.join('\n');
}

interface GoldenOptions {
    update: boolean;
    refreeze: boolean;
    json: boolean;
    scenes: string[] | null;
}

export function parseGoldenArgs(argv: string[]): GoldenOptions {
    const options: GoldenOptions = { update: false, refreeze: false, json: false, scenes: null };
    for (const arg of argv) {
        if (arg === '--update') {
            options.update = true;
        } else if (arg === '--refreeze') {
            options.refreeze = true;
            options.update = true;
        } else if (arg === '--json') {
            options.json = true;
        } else if (arg.startsWith('--scene=')) {
            options.scenes = arg.slice('--scene='.length).split(',').filter(Boolean);
        } else {
            throw new Error(
                `golden: unknown argument "${arg}" (--update, --refreeze, --scene=<id,…>, --json)`,
            );
        }
    }
    const known = GOLDEN_SCENES.map((scene) => scene.id);
    for (const id of options.scenes ?? []) {
        if (!known.includes(id)) {
            throw new Error(`golden: no scene "${id}" (one of ${known.join(', ')})`);
        }
    }
    return options;
}

export const requestPath = (sceneId: string): string =>
    path.join(GOLDEN_DIR, `${sceneId}.request.json`);

function writeJson(file: string, value: unknown): void {
    writeFileSync(file, `${JSON.stringify(value)}\n`);
}

async function main(argv: string[]): Promise<void> {
    const options = parseGoldenArgs(argv);
    const scenes = GOLDEN_SCENES.filter(
        (scene) => !options.scenes || options.scenes.includes(scene.id),
    );
    mkdirSync(GOLDEN_DIR, { recursive: true });

    if (options.refreeze) {
        for (const scene of scenes) {
            writeJson(requestPath(scene.id), freezeScene(scene));
        }
    }
    for (const scene of scenes) {
        if (!existsSync(requestPath(scene.id))) {
            throw new Error(
                `golden: ${path.relative(REPO_ROOT, requestPath(scene.id))} is missing; run \`npm run golden -- --refreeze\``,
            );
        }
    }

    const { createNodeRenderer } = await import('./mix-render-node.js');
    const renderer = await createNodeRenderer();
    const actual: Record<string, Record<string, Fingerprint>> = {};
    const log = (line: string): void => {
        if (!options.json) {
            process.stderr.write(`${line}\n`);
        }
    };
    for (const scene of scenes) {
        const frozen = JSON.parse(readFileSync(requestPath(scene.id), 'utf8')) as FrozenRequest;
        const started = Date.now();
        actual[scene.id] = {};
        for (const stem of GOLDEN_STEMS) {
            const request = { ...frozen, passes: laneEvents(frozen.passes as never, stem.lanes) };
            const render = await renderer.renderAndMeasure(request as never, 1);
            actual[scene.id][stem.id] = fingerprint(render.channels, render.sampleRate);
        }
        log(`rendered ${scene.id} (${((Date.now() - started) / 1000).toFixed(1)} s)`);
    }

    if (options.update) {
        const previous: FingerprintFile = existsSync(FINGERPRINTS_PATH)
            ? JSON.parse(readFileSync(FINGERPRINTS_PATH, 'utf8'))
            : { version: FINGERPRINT_VERSION, scenes: {} };
        const next: FingerprintFile = {
            version: FINGERPRINT_VERSION,
            // A `--scene=` update keeps the other scenes' fingerprints.
            scenes: {
                ...(previous.version === FINGERPRINT_VERSION ? previous.scenes : {}),
                ...actual,
            },
        };
        writeFileSync(FINGERPRINTS_PATH, `${JSON.stringify(next, null, 4)}\n`);
        // Biome's JSON layout (one array per line), so the commit hook leaves the file alone
        // and a fingerprint change reads as one line per metric.
        execFileSync('npx', ['biome', 'format', '--write', FINGERPRINTS_PATH], {
            cwd: REPO_ROOT,
            stdio: 'ignore',
        });
        log(`wrote ${path.relative(REPO_ROOT, FINGERPRINTS_PATH)}`);
        return;
    }

    if (!existsSync(FINGERPRINTS_PATH)) {
        throw new Error('golden: no committed fingerprints; run `npm run golden -- --update`');
    }
    const golden = JSON.parse(readFileSync(FINGERPRINTS_PATH, 'utf8')) as FingerprintFile;
    if (golden.version !== FINGERPRINT_VERSION) {
        throw new Error(
            `golden: fingerprints are version ${golden.version}, this check reads ${FINGERPRINT_VERSION}; run \`npm run golden -- --update\``,
        );
    }
    const results = compareRun(golden, actual);
    const moved = results.filter((result) => result.missing || result.differences.length > 0);
    if (options.json) {
        process.stdout.write(`${JSON.stringify({ moved: moved.length, results }, null, 2)}\n`);
    } else if (moved.length === 0) {
        log(
            `golden: ${results.length} stems across ${scenes.length} scenes match their fingerprints`,
        );
    } else {
        log(
            `\ngolden: ${moved.length} of ${results.length} stems no longer match their fingerprints.\n\n${formatResults(results)}\n\nThe band sounds different on fixed notes. If that is the point of this change, run\n\`npm run golden -- --update\`, commit the fingerprints, and say what changed in the PR;\na sound change still needs a listen. If it is not, a voice, bus, pack or the master chain\nmoved by accident.`,
        );
    }
    if (moved.length > 0) {
        process.exitCode = 1;
    }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main(process.argv.slice(2)).catch((error) => {
        process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
        process.exit(1);
    });
}
