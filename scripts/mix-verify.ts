#!/usr/bin/env node
// mix:verify — reconcile what the engine SCHEDULED against what the render
// actually PRODUCED, for the same deterministic seed.
//
//   npm run --silent mix:verify -- --scene=funk-pocket
//   npm run --silent mix:verify -- --scene=jazz-swing --stems=bass,drums --loops=2
//   npm run --silent mix:verify -- --keep=tmp/ears       # keep the WAV + event dump
//
// Drives `mix:report --write-wav --write-events` (one headless render of the real
// shipped bundle), then runs the pure checks in `audio-verify.ts` over each stem.
//
// What it is for: the question `tests/standards/` cannot ask. A critique test
// proves the engine DECIDED to play a note; this proves the note is present in the
// render — audible, on time, at the right pitch, at a level that tracks velocity.
// Everything between those two claims is a defect below the note buffer: a mute
// voice, a dropped hit, an envelope that eats an accent, a graph that clicks.
//
// What it is NOT: an audition. It emits facts and prints `NOT VERIFIABLE` for
// anything it cannot measure. A clean table never means "this sounds good" — that
// judgment stays with the listening gate (DOCTRINE §5).

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import {
    detectOnsets,
    estimateOutputLatencyMs,
    formatVerificationTable,
    groupSimultaneous,
    type RenderMeta,
    type ScheduledEvent,
    type StemVerification,
    verifyStem,
} from './audio-verify.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

interface EventDump {
    scene: string;
    stem: string;
    seed: string;
    tracks: string[];
    meta: RenderMeta;
    events: Array<ScheduledEvent & { velocity: number | null }>;
}

export interface MixVerifyOptions {
    scene: string | null;
    stems: string[];
    loops: number;
    seed: string | null;
    keep: string | null;
    noBuild: boolean;
}

export function parseMixVerifyArgs(argv: string[]): MixVerifyOptions {
    const options: MixVerifyOptions = {
        scene: null,
        stems: [],
        loops: 1,
        seed: null,
        keep: null,
        noBuild: false,
    };
    for (const arg of argv) {
        if (arg === '--no-build') {
            options.noBuild = true;
        } else if (arg.startsWith('--scene=')) {
            options.scene = arg.slice('--scene='.length);
        } else if (arg.startsWith('--stems=')) {
            options.stems = arg
                .slice('--stems='.length)
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean);
        } else if (arg.startsWith('--loops=')) {
            const parsed = Number.parseInt(arg.slice('--loops='.length), 10);
            options.loops = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
        } else if (arg.startsWith('--seed=')) {
            options.seed = arg.slice('--seed='.length);
        } else if (arg.startsWith('--keep=')) {
            options.keep = arg.slice('--keep='.length);
        } else if (arg.startsWith('--')) {
            throw new Error(`Unknown flag: ${arg}`);
        }
    }
    return options;
}

/**
 * Minimal RIFF reader for our own `encodeWav` output (16-bit PCM). Chunks are
 * walked rather than assumed at fixed offsets — a wrong-length header would
 * otherwise silently shift every sample and fake a timing defect.
 */
export function decodeWav(buffer: Buffer): { channels: Float32Array[]; sampleRate: number } {
    if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
        throw new Error('not a RIFF/WAVE file');
    }
    let offset = 12;
    let sampleRate = 0;
    let channelCount = 0;
    let bitsPerSample = 0;
    let dataStart = -1;
    let dataLength = 0;

    while (offset + 8 <= buffer.length) {
        const id = buffer.toString('ascii', offset, offset + 4);
        const size = buffer.readUInt32LE(offset + 4);
        const body = offset + 8;
        if (id === 'fmt ') {
            channelCount = buffer.readUInt16LE(body + 2);
            sampleRate = buffer.readUInt32LE(body + 4);
            bitsPerSample = buffer.readUInt16LE(body + 14);
        } else if (id === 'data') {
            dataStart = body;
            dataLength = Math.min(size, buffer.length - body);
        }
        offset = body + size + (size % 2);
    }

    if (dataStart < 0 || channelCount < 1) {
        throw new Error('WAVE file has no readable data chunk');
    }
    if (bitsPerSample !== 16) {
        throw new Error(`unsupported bit depth ${bitsPerSample} (expected 16)`);
    }

    const frameCount = Math.floor(dataLength / (2 * channelCount));
    const channels = Array.from({ length: channelCount }, () => new Float32Array(frameCount));
    for (let frame = 0; frame < frameCount; frame++) {
        for (let channel = 0; channel < channelCount; channel++) {
            const index = dataStart + (frame * channelCount + channel) * 2;
            channels[channel][frame] = buffer.readInt16LE(index) / 0x8000;
        }
    }
    return { channels, sampleRate };
}

function toMono(channels: Float32Array[]): Float32Array {
    if (channels.length === 1) {
        return channels[0];
    }
    const length = channels[0].length;
    const mono = new Float32Array(length);
    for (const channel of channels) {
        for (let i = 0; i < length; i++) {
            mono[i] += channel[i] / channels.length;
        }
    }
    return mono;
}

function runMixReport(outDir: string, options: MixVerifyOptions): void {
    const args = [
        'tsx',
        'scripts/mix-report.ts',
        `--write-wav=${outDir}`,
        `--write-events=${outDir}`,
        `--loops=${options.loops}`,
        '--json',
    ];
    if (options.scene) {
        args.push(`--scene=${options.scene}`);
    }
    if (options.seed) {
        args.push(`--seed=${options.seed}`);
    }
    if (options.noBuild) {
        args.push('--no-build');
    }

    // stdout is the mix report's own JSON, which we do not consume; stderr carries
    // build progress and any real failure, so it stays attached.
    const result = spawnSync('npx', args, {
        cwd: REPO_ROOT,
        stdio: ['ignore', 'ignore', 'inherit'],
    });
    // `error` is set when the process never ran at all (ENOENT on npx); without
    // this it surfaces as the confusing "exited with code null".
    if (result.error) {
        throw new Error(`could not run mix:report — ${result.error.message}`);
    }
    if (result.status !== 0) {
        throw new Error(`mix:report exited with code ${result.status}`);
    }
}

/** Dump events → the analysis module's shape (its optionals are `undefined`, not `null`). */
function toScheduledEvents(dump: EventDump): ScheduledEvent[] {
    return dump.events.map((event) => ({
        track: event.track,
        time: event.time,
        midi: event.midi,
        duration: event.duration ?? undefined,
        velocity: event.velocity ?? undefined,
    }));
}

export function verifyDump(
    dump: EventDump,
    samples: Float32Array,
    outputLatencyMs?: number | null,
): StemVerification {
    const singleLane = dump.tracks.length === 1;
    const pitched = singleLane && dump.tracks[0] !== 'drums';
    return verifyStem({
        stemId: `${dump.scene}/${dump.stem}`,
        tracks: dump.tracks,
        samples,
        outputLatencyMs,
        events: toScheduledEvents(dump),
        meta: dump.meta,
        pitched,
        singleLane,
    });
}

async function main(argv: string[]): Promise<void> {
    const options = parseMixVerifyArgs(argv);
    const outDir = options.keep
        ? path.resolve(REPO_ROOT, options.keep)
        : mkdtempSync(path.join(tmpdir(), 'ensemble-verify-'));

    try {
        runMixReport(outDir, options);

        const dumps = readdirSync(outDir)
            .filter((name) => name.endsWith('.events.json'))
            .sort();
        if (dumps.length === 0) {
            throw new Error('render produced no event dumps');
        }

        // Every stem is loaded even when `--stems` narrows the report, because the
        // latency fit below must not depend on which stems you asked to see: with a
        // filter-dependent median, the SAME bass stem read 81.5% next to drums and
        // 79.0% next to drums+chords. Graph latency is a property of the render.
        const loaded: Array<{ dump: EventDump; samples: Float32Array }> = [];
        for (const name of dumps) {
            const dump: EventDump = JSON.parse(readFileSync(path.join(outDir, name), 'utf8'));
            const wavPath = path.join(outDir, name.replace('.events.json', '.wav'));
            const { channels, sampleRate } = decodeWav(readFileSync(wavPath));
            // The decoder walks chunks precisely so a header mismatch cannot shift
            // every sample and fake a timing defect — which is only worth doing if
            // the decoded rate is actually checked against the one analysis uses.
            if (sampleRate !== dump.meta.sampleRate) {
                throw new Error(
                    `${name}: WAV is ${sampleRate} Hz but its event dump says ${dump.meta.sampleRate} Hz`,
                );
            }
            loaded.push({ dump, samples: toMono(channels) });
        }

        // One graph latency for the whole render, not one per stem.
        //
        // The constant is a property of the shared master chain, so it is the same
        // for every lane. Fitted per stem it would absorb any lane-wide lay-back
        // into itself and re-label real musical feel as "graph latency" — the
        // measurement would then be structurally incapable of reporting the thing
        // it exists to report. Taking the median across stems also rescues sparse
        // lanes, which cannot fit a constant of their own at all.
        const perStem = loaded
            .map(({ dump, samples }) =>
                estimateOutputLatencyMs(
                    groupSimultaneous(toScheduledEvents(dump), dump.meta),
                    detectOnsets(samples, dump.meta.sampleRate),
                ),
            )
            .filter((value): value is number => value !== null)
            .sort((a, b) => a - b);
        const sharedLatencyMs = perStem.length > 0 ? perStem[Math.floor(perStem.length / 2)] : null;

        const shown =
            options.stems.length > 0
                ? loaded.filter(({ dump }) => options.stems.includes(dump.stem))
                : loaded;
        if (shown.length === 0) {
            throw new Error(`no stems matched --stems=${options.stems.join(',')}`);
        }

        const results: StemVerification[] = shown.map(({ dump, samples }) =>
            verifyDump(dump, samples, sharedLatencyMs),
        );

        // Scene geometry differs per scene, so a bare multi-scene run would print
        // every row under one scene's bpm/step size. Rows are scene-qualified; the
        // header is only printed when a single scene is in play.
        const scenes = new Set(shown.map(({ dump }) => dump.scene));
        const meta: RenderMeta = shown[0].dump.meta;
        if (scenes.size > 1) {
            process.stdout.write(
                `render: ${scenes.size} scenes (${[...scenes].join(', ')}) — ` +
                    'per-scene geometry differs; rows are labelled scene/stem\n\n',
            );
            process.stdout.write(
                `${formatVerificationTable(results, meta, 6, { header: false })}\n`,
            );
        } else {
            process.stdout.write(`${formatVerificationTable(results, meta)}\n`);
        }
        if (options.keep) {
            process.stdout.write(`Render artifacts kept in ${outDir}\n`);
        }
    } finally {
        if (!options.keep) {
            rmSync(outDir, { recursive: true, force: true });
        }
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main(process.argv.slice(2)).catch((error) => {
        process.stderr.write(`mix:verify failed: ${(error as Error).message}\n`);
        process.exitCode = 1;
    });
}
