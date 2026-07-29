#!/usr/bin/env node
// mix:plant — the calibration deck for `mix:spectro`.
//
//   npm run --silent mix:verify -- --scene=funk-pocket --keep=tmp/ears   # render once
//   npm run --silent mix:plant -- --from=tmp/ears --out=tmp/ears-defective
//   npm run --silent mix:spectro -- --from=tmp/ears-defective
//   npm run --silent mix:spectro -- --from=tmp/ears                      # the control
//
// WHY. A picture is only worth reading if a defect is visible IN it, and there is
// no way to establish that from a clean render — a clean sheet looks like a clean
// sheet whether the tool works or not. So: take a real render, plant defects whose
// type, stem and exact time range are known, and write the answer key next to
// them. Reading the defective sheet against `defects.json` is what turns "the
// sheet renders" into "the sheet shows things".
//
// This script deliberately does NOT grade the read. It plants and it records; the
// judgement of whether a planted defect was visible belongs to whoever looks at
// the sheet, and would be worthless coming from the same code that placed it.
//
// Every transform here is pure and deterministic — same input directory, same
// output bytes, every run. Nothing is randomized, so a defect that was findable
// yesterday is in the same place today.

import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { encodeWav } from '../public/engine/wav-encoder.js';
import type { RenderMeta } from './audio-verify.js';
import { requireSingleScene } from './mix-spectro.js';
import { decodeWav } from './mix-verify.js';
import { STEPS_PER_BAR, STEPS_PER_BEAT } from './spectro-grid.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

export type DefectType = 'mute-region' | 'click' | 'drop-lane' | 'flatten-accents';

export const DEFECT_TYPES: readonly DefectType[] = [
    'mute-region',
    'click',
    'drop-lane',
    'flatten-accents',
];

// ── The four transforms ───────────────────────────────────────────────────────
// Each takes one channel of samples and returns a NEW array. Pure: the caller maps
// them across channels, and the originals are never touched, so a bug here can
// never corrupt the source render the control sheet is drawn from.

/**
 * A dropped note: one short region silenced.
 *
 * Half-open on the sample index — `[floor(startSec·sr), floor(endSec·sr))` — so
 * the region's length in samples is exactly what the seconds asked for and two
 * adjacent regions never overlap by a sample. The boundary is bracketed by test:
 * the sample at `floor(endSec·sr) - 1` is silenced and the one at
 * `floor(endSec·sr)` is not.
 */
export function applyMuteRegion(
    samples: Float32Array,
    sampleRate: number,
    startSec: number,
    endSec: number,
): Float32Array {
    const out = Float32Array.from(samples);
    const from = Math.max(0, Math.floor(startSec * sampleRate));
    const to = Math.min(out.length, Math.floor(endSec * sampleRate));
    for (let i = from; i < to; i++) {
        out[i] = 0;
    }
    return out;
}

/**
 * A click: one sample driven to full scale, against its neighbors' sign.
 *
 * Sign-opposed rather than a fixed `+1` so the step is maximal wherever it lands —
 * a `+1` planted on top of an already-positive peak is a small discontinuity and
 * would be a weaker test than intended. This is the same class of artifact
 * `audio-verify`'s `measureDiscontinuity` exists to catch, one sample wide, so it
 * is genuinely hard to see and a fair test of the sheet's resolution.
 */
export function applyClick(
    samples: Float32Array,
    sampleRate: number,
    timeSec: number,
): Float32Array {
    const out = Float32Array.from(samples);
    const index = Math.floor(timeSec * sampleRate);
    if (index < 0 || index >= out.length) {
        return out;
    }
    const before = index > 0 ? out[index - 1] : 0;
    const after = index + 1 < out.length ? out[index + 1] : 0;
    out[index] = before + after >= 0 ? -1 : 1;
    return out;
}

/** A lane that never sounded: the whole stem silenced. */
export function applyDropLane(samples: Float32Array): Float32Array {
    return new Float32Array(samples.length);
}

/** Compression ratio used by `applyFlattenAccents` — hard enough to be unmissable. */
export const FLATTEN_RATIO = 8;
/**
 * Ceiling on the make-up gain (+18 dB), so the noise floor is not lifted into the
 * picture. It is the binding constraint on how flat the result gets: a hit 24 dB
 * down can only come back up by 18, so the widest surviving gap is ~6 dB. Digital
 * silence is exempt entirely — the envelope floor below leaves it at unity gain.
 */
export const FLATTEN_MAX_GAIN = 8;
/**
 * Peak the compressed stem is normalized to when it would otherwise overshoot.
 *
 * Just under full scale rather than at it, so the 16-bit round trip through
 * `encodeWav` cannot round a sample back onto ±1 and reintroduce the very thing
 * the normalization exists to remove.
 */
export const FLATTEN_PEAK_CEILING = 0.98;

/**
 * Accents eaten: the stem's dynamic range compressed hard.
 *
 * A one-pole peak follower (fast attack, slow release) drives a static gain curve
 * `gain = env^(1/ratio - 1)`, i.e. the envelope is raised to `1/ratio` with full
 * scale as the fixed point. At ratio 8 a hit 24 dB down asks for +21 dB of make-up
 * and gets the capped +18, so a 24 dB accent/ghost gap collapses to about 6 —
 * every note still present, the difference between them all but gone. That is
 * exactly the defect class a scalar level check cannot see and a picture can.
 *
 * The make-up gain is capped (`FLATTEN_MAX_GAIN`) because an uncapped inverse
 * curve gives near-infinite gain in the gaps and would fill the sheet with lifted
 * noise floor, planting a *different* defect than the one claimed.
 *
 * **It does not clip, and not clipping is load-bearing.** The gain is feed-forward
 * off an envelope that lags by its own attack time, so every sharp attack was
 * briefly multiplied by the make-up gain the *previous* quiet moment had asked
 * for: on the funk drums stem that overshot to 3.09 and the old ±1 clamp
 * hard-clipped 0.36% of samples in runs up to 1.3 ms (`full`: 0.73%, peak 2.57).
 * Broadband distortion at every transient, planted under a manifest that claims
 * only "accents eaten", confounding the masking/mud calibration this deck exists
 * to support.
 *
 * The fix is the `level` floor below — the gain is computed from the louder of the
 * follower and the current sample, so it can never ask for more headroom than the
 * sample itself has, and the attack is compressed by the ratio's own static curve
 * instead of being flattened by a clamp. Normalizing the finished buffer instead
 * was tried and rejected: the overshoot is ~10 dB on drums, so a global trim would
 * have made the defective stem quietly *quieter* than the control — a second,
 * undocumented difference in the one class that can only be read as an A/B.
 * `FLATTEN_PEAK_CEILING` remains as a backstop for a source that is itself at full
 * scale; on real stems it never binds (measured peaks 0.82–0.94).
 */
export function applyFlattenAccents(
    samples: Float32Array,
    sampleRate: number,
    ratio: number = FLATTEN_RATIO,
): Float32Array {
    const out = new Float32Array(samples.length);
    // 1 ms attack / 120 ms release: fast enough to catch a transient, slow enough
    // that the gain does not wobble within a single note and add its own artifacts.
    const attack = Math.exp(-1 / (0.001 * sampleRate));
    const release = Math.exp(-1 / (0.12 * sampleRate));
    const floor = 1e-4;
    let envelope = 0;
    let peak = 0;
    for (let i = 0; i < samples.length; i++) {
        const rectified = Math.abs(samples[i]);
        const coefficient = rectified > envelope ? attack : release;
        envelope = rectified + coefficient * (envelope - rectified);
        // Never below the sample being gained: `gain ≤ |x|^(1/ratio - 1)` bounds the
        // output at `|x|^(1/ratio) ≤ 1`, which is what makes the clamp unnecessary.
        // The 120 ms release still runs off the follower, so the gap-filling that
        // IS the defect is unchanged.
        const level = Math.max(envelope, rectified);
        const gain = level <= floor ? 1 : Math.min(FLATTEN_MAX_GAIN, level ** (1 / ratio - 1));
        const value = samples[i] * gain;
        out[i] = value;
        peak = Math.max(peak, Math.abs(value));
    }
    if (peak > FLATTEN_PEAK_CEILING) {
        const trim = FLATTEN_PEAK_CEILING / peak;
        for (let i = 0; i < out.length; i++) {
            out[i] *= trim;
        }
    }
    return out;
}

// ── Deterministic placement ───────────────────────────────────────────────────

/** Absolute seconds of a 1-indexed bar/beat, lead-in included. */
export function beatTime(meta: RenderMeta, bar: number, beat: number): number {
    const step = (bar - 1) * STEPS_PER_BAR + (beat - 1) * STEPS_PER_BEAT;
    return meta.leadInSeconds + step * meta.stepSeconds;
}

/**
 * Where each defect goes, as bar/beat positions rather than raw seconds so the
 * answer key reads in musical terms and survives a tempo change.
 *
 * The positions are staggered across the form on purpose: four defects all in bar
 * 1 would let a reader find them by looking in one place, which tests the reader
 * and not the sheet.
 */
export const DEFECT_PLACEMENT = {
    /** One beat of silence: bar 3, beat 3 → beat 4. */
    muteRegion: { bar: 3, fromBeat: 3, toBeat: 4 },
    /** Bar 5, beat 2, nudged 7 ms off the grid so it is not hidden behind an attack. */
    click: { bar: 5, beat: 2, offsetSec: 0.007 },
} as const;

/**
 * Which stem each defect lands on. First match wins, and a stem already carrying a
 * defect is skipped — one defect per lane keeps the read unambiguous, so "I can
 * see the drop" is never partly explained by a second defect in the same panel.
 */
const STEM_PREFERENCE: Record<DefectType, readonly string[]> = {
    'mute-region': ['bass', 'chords', 'soloist', 'harmony', 'drums'],
    click: ['full', 'full+solo', 'drums', 'bass'],
    'drop-lane': ['chords', 'harmony', 'soloist', 'bass'],
    'flatten-accents': ['drums', 'bass', 'chords'],
};

export interface PlantedDefect {
    type: DefectType;
    stem: string;
    file: string;
    /** Start of the affected span, absolute seconds. `null` for whole-file defects. */
    startSec: number | null;
    endSec: number | null;
    /** Musical position, for reading the answer key against the sheet. */
    where: string;
    detail: string;
}

export interface DefectManifest {
    source: string;
    scale: string;
    defects: PlantedDefect[];
    untouched: string[];
}

export interface RenderFile {
    scene: string;
    stem: string;
    wavName: string;
    eventsName: string;
    meta: RenderMeta;
}

function readRenderDir(dir: string): RenderFile[] {
    const files = readdirSync(dir)
        .filter((name) => name.endsWith('.events.json'))
        .sort()
        .map((eventsName) => {
            const dump = JSON.parse(readFileSync(path.join(dir, eventsName), 'utf8'));
            return {
                scene: dump.scene as string,
                stem: dump.stem as string,
                wavName: eventsName.replace('.events.json', '.wav'),
                eventsName,
                meta: dump.meta as RenderMeta,
            };
        });
    if (files.length === 0) {
        throw new Error(`${dir} contains no *.events.json — is it a mix:report render directory?`);
    }
    // Assignment is keyed on the stem NAME alone, so a four-scene directory turns
    // "one defect per lane" into one per lane per scene — `drop-lane` silences four
    // `chords` files and the answer key names one. Same guard the sheet makes, for
    // the same reason: this deck exists to be read against a sheet.
    requireSingleScene(
        files.map((file) => file.scene),
        '--from=<a single-scene render directory> (mix:verify --scene=<id> --keep=<dir>)',
    );
    return files;
}

/**
 * Assign each requested defect to a stem. Returns the assignment only — the actual
 * sample surgery happens in `main`, so this half is pure and testable.
 */
export function assignDefects(
    files: RenderFile[],
    requested: readonly DefectType[],
): Array<{ type: DefectType; file: RenderFile }> {
    const taken = new Set<string>();
    const assigned: Array<{ type: DefectType; file: RenderFile }> = [];
    for (const type of requested) {
        const preference = STEM_PREFERENCE[type];
        // Walk the PREFERENCE list, not the file list. Searching the files for
        // "any stem that appears in the preference list" reads the same and is
        // wrong: it hands the defect to whichever preferred stem happens to sort
        // first on disk, so `click` — which wants the mix — landed on `drums`
        // purely because `drums` sorts before `full`.
        let chosen: RenderFile | undefined;
        for (const stem of preference) {
            if (taken.has(stem)) {
                continue;
            }
            const match = files.find((file) => file.stem === stem);
            if (match) {
                chosen = match;
                break;
            }
        }
        // Nothing preferred left: take any untouched stem rather than silently
        // dropping the defect, which would leave a manifest entry-free sheet that
        // reads as "the tool missed it".
        chosen ??= files.find((file) => !taken.has(file.stem));
        if (!chosen) {
            throw new Error(
                `not enough stems to plant ${requested.length} defects (${files.length} available)`,
            );
        }
        taken.add(chosen.stem);
        assigned.push({ type, file: chosen });
    }
    return assigned;
}

export interface PlantDefectsOptions {
    from: string | null;
    out: string | null;
    defects: DefectType[];
}

export function parsePlantDefectsArgs(argv: string[]): PlantDefectsOptions {
    const options: PlantDefectsOptions = { from: null, out: null, defects: [...DEFECT_TYPES] };
    for (const arg of argv) {
        if (arg.startsWith('--from=')) {
            options.from = arg.slice('--from='.length);
        } else if (arg.startsWith('--out=')) {
            options.out = arg.slice('--out='.length);
        } else if (arg.startsWith('--defects=')) {
            const requested = arg
                .slice('--defects='.length)
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean);
            for (const value of requested) {
                if (!DEFECT_TYPES.includes(value as DefectType)) {
                    throw new Error(
                        `Unknown defect "${value}" — expected one of ${DEFECT_TYPES.join(', ')}`,
                    );
                }
            }
            options.defects = requested as DefectType[];
        } else if (arg.startsWith('--')) {
            throw new Error(`Unknown flag: ${arg}`);
        }
    }
    if (!options.from) {
        throw new Error('mix:plant requires --from=<render dir>');
    }
    if (!options.out) {
        throw new Error('mix:plant requires --out=<dir> — it never writes over the source render');
    }
    if (path.resolve(REPO_ROOT, options.from) === path.resolve(REPO_ROOT, options.out)) {
        throw new Error('--out must differ from --from; the clean render is the control');
    }
    return options;
}

function main(argv: string[]): void {
    const options = parsePlantDefectsArgs(argv);
    const fromDir = path.resolve(REPO_ROOT, options.from as string);
    const outDir = path.resolve(REPO_ROOT, options.out as string);
    mkdirSync(outDir, { recursive: true });

    const files = readRenderDir(fromDir);
    const assigned = assignDefects(files, options.defects);
    const byStem = new Map(assigned.map((entry) => [entry.file.stem, entry.type]));
    const planted: PlantedDefect[] = [];
    const untouched: string[] = [];

    for (const file of files) {
        // Event dumps always come across unmodified: the defect is in the AUDIO,
        // and `mix:spectro --from` needs the schedule to draw the same grid over
        // the defective render as over the control.
        copyFileSync(path.join(fromDir, file.eventsName), path.join(outDir, file.eventsName));

        const type = byStem.get(file.stem);
        const { channels, sampleRate } = decodeWav(readFileSync(path.join(fromDir, file.wavName)));
        if (!type) {
            copyFileSync(path.join(fromDir, file.wavName), path.join(outDir, file.wavName));
            untouched.push(file.wavName);
            continue;
        }

        const meta = file.meta;
        let transformed: Float32Array[];
        let record: Omit<PlantedDefect, 'type' | 'stem' | 'file'>;

        if (type === 'mute-region') {
            const place = DEFECT_PLACEMENT.muteRegion;
            const startSec = beatTime(meta, place.bar, place.fromBeat);
            const endSec = beatTime(meta, place.bar, place.toBeat);
            transformed = channels.map((channel) =>
                applyMuteRegion(channel, sampleRate, startSec, endSec),
            );
            record = {
                startSec,
                endSec,
                where: `bar ${place.bar}, beat ${place.fromBeat} → beat ${place.toBeat}`,
                detail: 'one beat silenced — a dropped note',
            };
        } else if (type === 'click') {
            const place = DEFECT_PLACEMENT.click;
            const timeSec = beatTime(meta, place.bar, place.beat) + place.offsetSec;
            transformed = channels.map((channel) => applyClick(channel, sampleRate, timeSec));
            record = {
                startSec: timeSec,
                endSec: timeSec + 1 / sampleRate,
                where: `bar ${place.bar}, beat ${place.beat} +${(place.offsetSec * 1000).toFixed(0)}ms`,
                detail: 'single full-scale sample against its neighbors — a click',
            };
        } else if (type === 'drop-lane') {
            transformed = channels.map((channel) => applyDropLane(channel));
            record = {
                startSec: null,
                endSec: null,
                where: 'whole file',
                detail: 'entire stem silenced — a lane that never sounded',
            };
        } else {
            transformed = channels.map((channel) => applyFlattenAccents(channel, sampleRate));
            record = {
                startSec: null,
                endSec: null,
                where: 'whole file',
                detail: `dynamic range compressed ${FLATTEN_RATIO}:1 — accents eaten`,
            };
        }

        writeFileSync(
            path.join(outDir, file.wavName),
            Buffer.from(encodeWav(transformed, sampleRate)),
        );
        planted.push({ type, stem: file.stem, file: file.wavName, ...record });
    }

    const manifest: DefectManifest = {
        source: path.relative(REPO_ROOT, fromDir),
        // No timestamp on purpose: the whole output is a deterministic function of
        // the source render, and a clock reading would break that for no gain.
        scale: 'seconds are absolute into the render file, lead-in included',
        defects: planted,
        untouched,
    };
    writeFileSync(path.join(outDir, 'defects.json'), `${JSON.stringify(manifest, null, 4)}\n`);

    process.stdout.write(`${outDir}\n`);
    for (const defect of planted) {
        const span =
            defect.startSec === null
                ? ''
                : ` [${defect.startSec.toFixed(3)}s–${(defect.endSec ?? 0).toFixed(3)}s]`;
        process.stdout.write(
            `  ${defect.type.padEnd(16)} ${defect.stem.padEnd(10)} ${defect.where}${span}\n`,
        );
    }
    process.stdout.write(
        `  ${untouched.length} stem(s) untouched · answer key at ${path.join(outDir, 'defects.json')}\n`,
    );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    try {
        main(process.argv.slice(2));
    } catch (error) {
        process.stderr.write(`mix:plant failed: ${(error as Error).message}\n`);
        process.exitCode = 1;
    }
}
