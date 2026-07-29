#!/usr/bin/env node
// mix:ab — render the same scene/seed at two git refs and SUBTRACT the audio.
//
//   npm run --silent mix:ab -- --scene=funk-pocket --refs=main..HEAD
//   npm run --silent mix:ab -- --scene=funk-pocket --refs=0f0b3a4c~1..0f0b3a4c --stems=bass
//   npm run --silent mix:ab -- --scene=funk-pocket --identity=HEAD
//   npm run --silent mix:ab -- --scene=funk-pocket --refs=main..HEAD --keep --out=tmp/ab
//
// WHAT IT IS FOR. "Did this change alter anything besides X, and where" is not a
// listening task — the render is deterministic for a fixed scene/seed, so the
// question is arithmetic. Render at both refs, subtract sample-wise, and the
// residual IS the change: its total level says how big, its per-bar profile says
// where, and the event delta says which notes moved. That makes a diff
// *addressable* ("bass, bars 3-4, midi 45 became midi 33") instead of gestured at,
// and it makes the predicate `git bisect run`-able.
//
// WHAT IT IS NOT. Not an audition and not a verdict. It reports levels and
// locations; whether the difference is an improvement stays with the listening
// gate (DOCTRINE §5). Anything it cannot measure prints
// `NOT VERIFIABLE: <metric> — <reason>` rather than being omitted.
//
// THE MECHANISM, stated because it looks alarming: this script performs `git
// checkout` in the MAIN repo (a worktree has no `node_modules`, and the npx-probe
// trap that follows from that is documented in the global working notes). Two
// things make that safe. It refuses to run on a dirty tree and never stashes, and
// renders land in `tmp/`, which is gitignored and therefore survives a checkout —
// that survival is the whole trick. Node resolves this module's static imports
// before `main()` runs, so the tool keeps working even while the tree is parked on
// a ref where this file does not exist yet.
//
// NON-GOAL, deliberately: injecting the CURRENT harness into an old checkout. Each
// ref is rendered by its OWN `scripts/mix-report.ts`. Rendering old engine code
// through a new harness is a different experiment — it measures the harness change
// too — and this tool declines to run it. The cost is that a ref older than
// 795baf1b has no `--write-events`, so its event delta reports NOT VERIFIABLE; the
// null test, which is the primary product, still works at any ref.

import { spawnSync } from 'node:child_process';
import {
    copyFileSync,
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    rmSync,
    writeFileSync,
} from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { encodeWav } from '../public/engine/wav-encoder.js';
import type { RenderMeta } from './audio-verify.js';
import { decodeWav } from './mix-verify.js';
import { barRangeToWindow, musicEndSec, STEPS_PER_BAR, STEPS_PER_BEAT } from './spectro-grid.js';

const REPO_ROOT = path.resolve(import.meta.dirname, '..');

// ── The one threshold that decides an exit code ───────────────────────────────

/**
 * Residual RMS (dBFS) at or below which the tool REFUSES to attribute a difference
 * to the change under test, and reports it as indistinguishable from render noise.
 *
 * **It is not zero, and tightening it back to zero will break the tool.** The
 * renderer is NOT bit-reproducible: Chromium's `OfflineAudioContext` sums floats in
 * an order that varies run to run, so the same ref rendered twice already leaves a
 * residual. Measured three times on `main` @ d44dee78, `funk-pocket`/`MIX_AUDIT`,
 * and confirmed not to be a build artefact (two renders from an identical bundle
 * reproduce it):
 *
 * | stem            | residual RMS | max abs diff |
 * | :-------------- | -----------: | -----------: |
 * | full            |  −99.0 dBFS  |       2 LSB  |
 * | full+solo       |  −99.2 dBFS  |       2 LSB  |
 * | bass            | −100.5 dBFS  |       2 LSB  |
 * | drums           | −102.9 dBFS  |       2 LSB  |
 * | harmony         | −105.0 dBFS  |       1 LSB  |
 * | chords          | −107.3 dBFS  |       1 LSB  |
 * | soloist (silent)|         −Inf |       0      |
 *
 * −90 dBFS leaves ~9 dB of margin over the worst of those, and is also — to within
 * a dB — the point below which a residual cannot survive being written to the
 * 16-bit residual WAV at all (1 LSB ≈ −90.3 dBFS). So the level this tool declines
 * to attribute is the same level its difference spectrogram could not show.
 *
 * Override per run with `--threshold-db=`; do not edit this constant without
 * re-measuring the table above with `--identity=<ref>`.
 */
export const DEFAULT_THRESHOLD_DB = -90;

/** How far a note may slide and still count as the same note MOVED, not add+remove. */
export const MOVE_WINDOW_STEPS = STEPS_PER_BEAT;

/** Loudest bars listed per stem, and the per-category cap on printed note deltas. */
const REPORT_LIMIT = 6;

// ── CLI ───────────────────────────────────────────────────────────────────────

export interface MixAbOptions {
    scene: string | null;
    seed: string | null;
    loops: number;
    stems: string[];
    fromRef: string | null;
    toRef: string | null;
    /** Same ref rendered twice — measures the render's own noise floor. */
    identity: string | null;
    thresholdDb: number;
    out: string | null;
    /** Keep the two per-ref render directories instead of deleting them. */
    keep: boolean;
}

/**
 * `A..B` → the two refs. Strict on purpose: a ref name cannot contain `..` (git
 * forbids it in `check-ref-format`), so any spec that does not split into exactly
 * two non-empty halves is a typo, and a silently-coerced one would compare two refs
 * nobody asked for while printing a header that looks entirely plausible.
 */
export function parseRefsSpec(spec: string): { fromRef: string; toRef: string } {
    const parts = spec.split('..').map((part) => part.trim());
    // A three-dot spec splits into two NON-empty parts (`main...HEAD` → `main`,
    // `.HEAD`), so an emptiness check alone lets it through and the run then
    // compares against a ref named `.HEAD`. Git forbids a ref component that
    // begins or ends with a dot, so rejecting those catches it generally rather
    // than special-casing the one spelling.
    const malformed =
        parts.length !== 2 ||
        parts.some((part) => part === '' || part.startsWith('.') || part.endsWith('.'));
    if (malformed) {
        throw new Error(`--refs must look like main..HEAD (got "${spec}")`);
    }
    return { fromRef: parts[0], toRef: parts[1] };
}

export function parseMixAbArgs(argv: string[]): MixAbOptions {
    const options: MixAbOptions = {
        scene: null,
        seed: null,
        loops: 1,
        stems: [],
        fromRef: null,
        toRef: null,
        identity: null,
        thresholdDb: DEFAULT_THRESHOLD_DB,
        out: null,
        keep: false,
    };
    for (const arg of argv) {
        if (arg === '--keep') {
            options.keep = true;
        } else if (arg.startsWith('--scene=')) {
            options.scene = arg.slice('--scene='.length);
        } else if (arg.startsWith('--seed=')) {
            options.seed = arg.slice('--seed='.length);
        } else if (arg.startsWith('--loops=')) {
            const parsed = Number.parseInt(arg.slice('--loops='.length), 10);
            options.loops = Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
        } else if (arg.startsWith('--stems=')) {
            options.stems = arg
                .slice('--stems='.length)
                .split(',')
                .map((value) => value.trim())
                .filter(Boolean);
        } else if (arg.startsWith('--refs=')) {
            const { fromRef, toRef } = parseRefsSpec(arg.slice('--refs='.length));
            options.fromRef = fromRef;
            options.toRef = toRef;
        } else if (arg.startsWith('--from-ref=')) {
            options.fromRef = arg.slice('--from-ref='.length).trim();
        } else if (arg.startsWith('--to-ref=')) {
            options.toRef = arg.slice('--to-ref='.length).trim();
        } else if (arg.startsWith('--identity=')) {
            options.identity = arg.slice('--identity='.length).trim();
        } else if (arg.startsWith('--threshold-db=')) {
            const parsed = Number.parseFloat(arg.slice('--threshold-db='.length));
            if (!Number.isFinite(parsed)) {
                throw new Error(`--threshold-db must be a number (got "${arg}")`);
            }
            options.thresholdDb = parsed;
        } else if (arg.startsWith('--out=')) {
            options.out = arg.slice('--out='.length);
        } else if (arg.startsWith('--')) {
            // A silently-dropped flag would compare the wrong pair of refs, or the
            // right pair at the wrong threshold, under a header that reads correct.
            throw new Error(`Unknown flag: ${arg}`);
        }
    }

    if (options.identity !== null) {
        if (options.fromRef !== null || options.toRef !== null) {
            throw new Error('--identity renders ONE ref twice; it cannot be combined with refs');
        }
        if (options.identity === '') {
            throw new Error('--identity needs a ref (e.g. --identity=HEAD)');
        }
    } else if (options.fromRef === null || options.toRef === null) {
        throw new Error(
            'pass --refs=A..B (or both --from-ref= and --to-ref=), or --identity=<ref>',
        );
    }
    return options;
}

// ── Residual math ─────────────────────────────────────────────────────────────

/**
 * Amplitude → dBFS, with a true `-Infinity` at exactly zero.
 *
 * Deliberately NOT `audio-analysis.ts`'s `toDb`, whose −120 floor is the wrong
 * shape for a null test: a byte-identical pair is a MEANINGFUL result — it says the
 * renderer was exactly reproducible for that stem — and clamping it to −120 makes
 * it indistinguishable from a genuine −120 dBFS measurement.
 */
export function rmsToDbfs(rms: number): number {
    return rms > 0 ? 20 * Math.log10(rms) : Number.NEGATIVE_INFINITY;
}

export interface DecodedStem {
    channels: Float32Array[];
    sampleRate: number;
}

export interface StemResidual {
    /** Sample-wise A − B over the compared channels and the common prefix. */
    residual: Float32Array[];
    sampleRate: number;
    rms: number;
    rmsDb: number;
    maxAbsDiff: number;
    framesA: number;
    framesB: number;
    comparedFrames: number;
    channelsA: number;
    channelsB: number;
    comparedChannels: number;
}

/** RMS across every channel over a half-open frame span, and the frames it covered. */
export function residualRms(
    residual: Float32Array[],
    fromFrame: number,
    toFrame: number,
): { rms: number; frameCount: number } {
    const start = Math.max(0, Math.floor(fromFrame));
    const end = Math.min(residual[0]?.length ?? 0, Math.floor(toFrame));
    if (residual.length === 0 || end <= start) {
        return { rms: 0, frameCount: 0 };
    }
    let sumSquares = 0;
    for (const channel of residual) {
        for (let i = start; i < end; i++) {
            sumSquares += channel[i] * channel[i];
        }
    }
    return {
        rms: Math.sqrt(sumSquares / ((end - start) * residual.length)),
        frameCount: end - start,
    };
}

/**
 * The null test itself: A − B, sample by sample.
 *
 * Differing lengths are compared over the COMMON PREFIX and reported, never
 * silently truncated — a change that shortened the render by a bar would otherwise
 * read as a clean null over the part that happens to line up.
 */
export function subtractStems(a: DecodedStem, b: DecodedStem): StemResidual {
    if (a.sampleRate !== b.sampleRate) {
        throw new Error(`sample rates differ (${a.sampleRate} Hz vs ${b.sampleRate} Hz)`);
    }
    if (a.channels.length === 0 || b.channels.length === 0) {
        throw new Error('a stem decoded with no channels');
    }
    const comparedChannels = Math.min(a.channels.length, b.channels.length);
    const framesA = a.channels[0].length;
    const framesB = b.channels[0].length;
    const comparedFrames = Math.min(framesA, framesB);

    const residual: Float32Array[] = [];
    let sumSquares = 0;
    let maxAbsDiff = 0;
    for (let channel = 0; channel < comparedChannels; channel++) {
        const out = new Float32Array(comparedFrames);
        const left = a.channels[channel];
        const right = b.channels[channel];
        for (let i = 0; i < comparedFrames; i++) {
            const diff = left[i] - right[i];
            out[i] = diff;
            sumSquares += diff * diff;
            const magnitude = Math.abs(diff);
            if (magnitude > maxAbsDiff) {
                maxAbsDiff = magnitude;
            }
        }
        residual.push(out);
    }
    const total = comparedFrames * comparedChannels;
    const rms = total > 0 ? Math.sqrt(sumSquares / total) : 0;
    return {
        residual,
        sampleRate: a.sampleRate,
        rms,
        rmsDb: rmsToDbfs(rms),
        maxAbsDiff,
        framesA,
        framesB,
        comparedFrames,
        channelsA: a.channels.length,
        channelsB: b.channels.length,
        comparedChannels,
    };
}

export interface BarResidual {
    /** 1-indexed bar. The trailing `tail` entry is numbered one past the last bar. */
    bar: number;
    /** True for the post-form reverb tail, which no bar line annotates. */
    tail: boolean;
    startSec: number;
    endSec: number;
    frameCount: number;
    rms: number;
    rmsDb: number;
}

/**
 * Residual RMS per bar — the localization the whole tool exists for.
 *
 * Bar geometry is NOT re-derived here: each bucket's span comes from
 * `spectro-grid.ts`'s `barRangeToWindow`, which already owns the lead-in offset
 * (`mix-report` renders 0.25 s of silence before the downbeat, so bar 1 does not
 * start at t=0) and the clamp that makes a form ending mid-bar produce a short
 * final bucket instead of one running past the music. A second copy of that
 * arithmetic here is exactly how a tool ends up confidently naming the wrong bar.
 *
 * Two spans are deliberately handled outside the bar loop:
 *
 * - the TAIL. `mix-report` renders ~2 s past the last step, and a change that only
 *   moved a reverb tail lands entirely in it. Without its own bucket that residual
 *   is in the stem total with nowhere to point at.
 * - buckets with NO compared samples (the renders differed in length, or the file
 *   is short) are omitted rather than reported as −Inf, because −Inf reads as
 *   "identical here" when the truth is "not compared here".
 */
export function residualByBar(
    residual: Float32Array[],
    sampleRate: number,
    meta: RenderMeta,
): BarResidual[] {
    const frames = residual[0]?.length ?? 0;
    const totalBars = Math.ceil((meta.stepsPerLoop * meta.loopCount) / STEPS_PER_BAR);
    const bars: BarResidual[] = [];

    const measure = (bar: number, tail: boolean, startSec: number, endSec: number): void => {
        // Both edges ROUND. Flooring the start and rounding the end would let two
        // adjacent buckets disagree about the frame on their shared boundary by one,
        // so a sample could be counted twice or not at all — invisible on a real
        // render and exactly the sort of drift that makes a localization claim
        // stop being reproducible.
        const { rms, frameCount } = residualRms(
            residual,
            Math.round(startSec * sampleRate),
            Math.round(endSec * sampleRate),
        );
        if (frameCount === 0) {
            return;
        }
        bars.push({ bar, tail, startSec, endSec, frameCount, rms, rmsDb: rmsToDbfs(rms) });
    };

    for (let bar = 1; bar <= totalBars; bar++) {
        const window = barRangeToWindow({ fromBar: bar, toBar: bar }, meta);
        measure(bar, false, window.startSec, window.endSec);
    }
    const tailStart = musicEndSec(meta);
    measure(totalBars + 1, true, tailStart, frames / sampleRate);
    return bars;
}

/** The loudest buckets first — the "where is it" answer, capped for the report. */
export function loudestBars(bars: BarResidual[], limit: number): BarResidual[] {
    return [...bars].sort((a, b) => b.rmsDb - a.rmsDb || a.bar - b.bar).slice(0, limit);
}

/**
 * The exit-code decision, in one place.
 *
 * `>` and not `>=`: a residual sitting exactly AT the threshold is at the floor,
 * and the tool's contract is that the floor is not attributable to the change under
 * test. Bracketed in `tests/scripts/mix-ab.test.ts` at the threshold and one
 * epsilon either side.
 */
export function exceedsThreshold(rmsDb: number, thresholdDb: number): boolean {
    return rmsDb > thresholdDb;
}

// ── Event delta ───────────────────────────────────────────────────────────────

export interface DumpEvent {
    track: string;
    time: number;
    midi: number;
}

export interface NotePosition {
    /** Step index from the first musical step; negative inside the lead-in. */
    step: number;
    bar: number;
    beat: number;
    /** 1-indexed sixteenth within the beat. */
    sixteenth: number;
}

function floorMod(value: number, modulus: number): number {
    return ((value % modulus) + modulus) % modulus;
}

/**
 * Play time → musical position. Rounded to the nearest step on purpose: the dumped
 * times are POST-humanization, so the same note at the same step differs by a few
 * milliseconds between two renders and an exact-time key would report every note in
 * the song as both added and removed.
 */
export function positionOf(
    timeSec: number,
    meta: RenderMeta,
    stepsPerBar: number = STEPS_PER_BAR,
): NotePosition {
    const step = Math.round((timeSec - meta.leadInSeconds) / meta.stepSeconds);
    const withinBar = floorMod(step, stepsPerBar);
    return {
        step,
        bar: Math.floor(step / stepsPerBar) + 1,
        beat: Math.floor(withinBar / STEPS_PER_BEAT) + 1,
        sixteenth: floorMod(withinBar, STEPS_PER_BEAT) + 1,
    };
}

/** `bar 3 beat 2` on the beat, `bar 3 beat 2.3` on the third sixteenth of beat 2. */
export function formatPosition(position: NotePosition): string {
    const beat =
        position.sixteenth === 1 ? `${position.beat}` : `${position.beat}.${position.sixteenth}`;
    return `bar ${position.bar} beat ${beat}`;
}

export interface PositionedNote {
    track: string;
    midi: number;
    position: NotePosition;
}

export interface MovedNote {
    track: string;
    midi: number;
    from: NotePosition;
    to: NotePosition;
}

export interface RepitchedNote {
    track: string;
    position: NotePosition;
    midiA: number;
    midiB: number;
}

export interface EventDelta {
    /** In B, with no counterpart in A. */
    added: PositionedNote[];
    /** In A, with no counterpart in B. */
    removed: PositionedNote[];
    /** Same track and pitch, different step. */
    moved: MovedNote[];
    /** Same track and step, different pitch. */
    repitched: RepitchedNote[];
    matched: number;
}

function sortNotes(notes: PositionedNote[]): PositionedNote[] {
    return [...notes].sort(
        (a, b) =>
            a.position.step - b.position.step || a.track.localeCompare(b.track) || a.midi - b.midi,
    );
}

/**
 * Diff two note lists into added / removed / repitched / moved.
 *
 * The pass order is the whole design, and it is not arbitrary:
 *
 *  1. EXACT (track, step, pitch) — a multiset match, so a doubled note stays doubled.
 *  2. REPITCHED (track, step) — the note is still on the beat, the pitch moved. This
 *     runs before the move pass because it is the shape an octave/register change
 *     takes (#1278's disco bass anchor), and reporting that as "one note removed
 *     here, another added at the same instant" buries the one fact worth reading.
 *  3. MOVED (track, pitch) within `MOVE_WINDOW_STEPS` — the note kept its pitch and
 *     slid. Nearest step wins so a run of notes pairs off in order.
 *
 * Whatever survives all three is genuinely added or removed. A note that both moved
 * AND changed pitch has no honest single-line description, so it falls through as a
 * removal plus an addition rather than being guessed at.
 */
export function diffEvents(
    aEvents: DumpEvent[],
    bEvents: DumpEvent[],
    meta: RenderMeta,
    moveWindowSteps: number = MOVE_WINDOW_STEPS,
): EventDelta {
    const toNotes = (events: DumpEvent[]): PositionedNote[] =>
        sortNotes(
            events.map((event) => ({
                track: event.track,
                midi: event.midi,
                position: positionOf(event.time, meta),
            })),
        );
    const notesA = toNotes(aEvents);
    const notesB = toNotes(bEvents);
    const takenA = new Array<boolean>(notesA.length).fill(false);
    const takenB = new Array<boolean>(notesB.length).fill(false);

    let matched = 0;
    const repitched: RepitchedNote[] = [];
    const moved: MovedNote[] = [];

    const pair = (
        keyOf: (note: PositionedNote) => string,
        accept: (a: PositionedNote, b: PositionedNote) => boolean,
        score: (a: PositionedNote, b: PositionedNote) => number,
        onPair: (a: PositionedNote, b: PositionedNote) => void,
    ): void => {
        const buckets = new Map<string, number[]>();
        for (let j = 0; j < notesB.length; j++) {
            if (takenB[j]) {
                continue;
            }
            const key = keyOf(notesB[j]);
            const bucket = buckets.get(key);
            if (bucket) {
                bucket.push(j);
            } else {
                buckets.set(key, [j]);
            }
        }
        for (let i = 0; i < notesA.length; i++) {
            if (takenA[i]) {
                continue;
            }
            const candidates = buckets.get(keyOf(notesA[i]));
            if (!candidates) {
                continue;
            }
            let bestIndex = -1;
            let bestScore = Number.POSITIVE_INFINITY;
            for (const j of candidates) {
                if (takenB[j] || !accept(notesA[i], notesB[j])) {
                    continue;
                }
                const value = score(notesA[i], notesB[j]);
                if (value < bestScore) {
                    bestScore = value;
                    bestIndex = j;
                }
            }
            if (bestIndex < 0) {
                continue;
            }
            takenA[i] = true;
            takenB[bestIndex] = true;
            onPair(notesA[i], notesB[bestIndex]);
        }
    };

    pair(
        (note) => `${note.track}|${note.position.step}|${note.midi}`,
        () => true,
        () => 0,
        () => {
            matched++;
        },
    );
    pair(
        (note) => `${note.track}|${note.position.step}`,
        () => true,
        (a, b) => Math.abs(a.midi - b.midi),
        (a, b) => {
            repitched.push({ track: a.track, position: a.position, midiA: a.midi, midiB: b.midi });
        },
    );
    pair(
        (note) => `${note.track}|${note.midi}`,
        (a, b) => Math.abs(a.position.step - b.position.step) <= moveWindowSteps,
        (a, b) => Math.abs(a.position.step - b.position.step),
        (a, b) => {
            moved.push({ track: a.track, midi: a.midi, from: a.position, to: b.position });
        },
    );

    return {
        added: sortNotes(notesB.filter((_, index) => !takenB[index])),
        removed: sortNotes(notesA.filter((_, index) => !takenA[index])),
        moved: moved.sort((a, b) => a.from.step - b.from.step || a.track.localeCompare(b.track)),
        repitched: repitched.sort(
            (a, b) => a.position.step - b.position.step || a.track.localeCompare(b.track),
        ),
        matched,
    };
}

// ── Report ────────────────────────────────────────────────────────────────────

export interface RefDescriptor {
    /** Whatever the user (or `git symbolic-ref`) called it. */
    spec: string;
    sha: string;
    detached: boolean;
}

export interface StemReport {
    /** Render file base name, e.g. `funk-pocket-bass-MIX_AUDIT`. */
    label: string;
    stem: string;
    residual: StemResidual;
    bars: BarResidual[] | null;
    delta: EventDelta | null;
    notVerifiable: Record<string, string>;
    residualWavPath: string | null;
}

export interface AbReport {
    identity: boolean;
    refA: RefDescriptor;
    refB: RefDescriptor;
    thresholdDb: number;
    stems: StemReport[];
    onlyInA: string[];
    onlyInB: string[];
}

function formatDb(value: number): string {
    return Number.isFinite(value) ? value.toFixed(1) : value < 0 ? '-inf' : '+inf';
}

function describeRef(ref: RefDescriptor): string {
    const short = ref.sha.slice(0, 8);
    return ref.spec === ref.sha ? short : `${ref.spec} (${short})`;
}

function formatNoteLines(delta: EventDelta, limit: number): string[] {
    const lines: string[] = [];
    const push = (text: string): void => {
        lines.push(text);
    };
    for (const note of delta.repitched.slice(0, limit)) {
        push(
            `${formatPosition(note.position)} — ${note.track} midi ${note.midiA} in A, ` +
                `midi ${note.midiB} in B`,
        );
    }
    for (const note of delta.moved.slice(0, limit)) {
        push(
            `${formatPosition(note.from)} — ${note.track} midi ${note.midi} in A, ` +
                `${formatPosition(note.to)} in B`,
        );
    }
    for (const note of delta.removed.slice(0, limit)) {
        push(
            `${formatPosition(note.position)} — ${note.track} midi ${note.midi} in A, absent in B`,
        );
    }
    for (const note of delta.added.slice(0, limit)) {
        push(
            `${formatPosition(note.position)} — ${note.track} midi ${note.midi} in B, absent in A`,
        );
    }
    const shown =
        Math.min(delta.repitched.length, limit) +
        Math.min(delta.moved.length, limit) +
        Math.min(delta.removed.length, limit) +
        Math.min(delta.added.length, limit);
    const total =
        delta.repitched.length + delta.moved.length + delta.removed.length + delta.added.length;
    if (total > shown) {
        push(`+${total - shown} more`);
    }
    return lines;
}

/**
 * The A/B table. Facts and localization only — there is deliberately no
 * better/worse line anywhere in it, and a residual at or below the threshold is
 * reported as indistinguishable from render noise rather than as a small change.
 */
export function formatAbReport(report: AbReport): string {
    const pad = ' '.repeat(15);
    const lines: string[] = [];
    lines.push(
        report.identity
            ? `mix:ab IDENTITY — ${describeRef(report.refA)} rendered twice`
            : `mix:ab — A=${describeRef(report.refA)} → B=${describeRef(report.refB)}`,
    );
    lines.push(
        `threshold ${formatDb(report.thresholdDb)} dBFS — at or below it a residual is ` +
            'indistinguishable from render noise',
    );
    lines.push('');

    for (const stem of report.stems) {
        const { residual } = stem;
        const over = exceedsThreshold(residual.rmsDb, report.thresholdDb);
        const verdict = over
            ? `ABOVE THRESHOLD by ${(residual.rmsDb - report.thresholdDb).toFixed(1)} dB`
            : 'at or below threshold — indistinguishable from render noise';
        lines.push(
            `${stem.label.padEnd(34)} residual ${formatDb(residual.rmsDb).padStart(7)} dBFS  ` +
                `max|diff| ${residual.maxAbsDiff.toExponential(2)}  ${verdict}`,
        );

        if (residual.framesA !== residual.framesB) {
            lines.push(
                `${pad}LENGTHS DIFFER: A ${residual.framesA} frames, B ${residual.framesB} — ` +
                    `compared the common prefix (${residual.comparedFrames} frames, ` +
                    `${(residual.comparedFrames / residual.sampleRate).toFixed(3)}s)`,
            );
        }
        if (residual.channelsA !== residual.channelsB) {
            lines.push(
                `${pad}CHANNEL COUNTS DIFFER: A ${residual.channelsA}, B ${residual.channelsB} — ` +
                    `compared ${residual.comparedChannels}`,
            );
        }

        if (over && stem.bars !== null && stem.bars.length > 0) {
            const loudest = loudestBars(stem.bars, REPORT_LIMIT)
                .map((bar) => `${bar.tail ? 'tail' : `bar ${bar.bar}`} ${formatDb(bar.rmsDb)}`)
                .join(', ');
            lines.push(`${pad}loudest: ${loudest} dBFS`);
        }

        if (stem.delta !== null) {
            const { delta } = stem;
            const counts =
                `${delta.added.length} added, ${delta.removed.length} removed, ` +
                `${delta.repitched.length} repitched, ${delta.moved.length} moved ` +
                `(${delta.matched} unchanged)`;
            lines.push(`${pad}events: ${counts}`);
            for (const line of formatNoteLines(delta, REPORT_LIMIT)) {
                lines.push(`${pad}  ${line}`);
            }
        }

        if (stem.residualWavPath !== null) {
            lines.push(
                `${pad}residual WAV ${stem.residualWavPath} ` +
                    `(peak ${formatDb(rmsToDbfs(residual.maxAbsDiff))} dBFS)`,
            );
        }
        for (const [metric, reason] of Object.entries(stem.notVerifiable)) {
            lines.push(`${pad}NOT VERIFIABLE: ${metric} — ${reason}`);
        }
        lines.push('');
    }

    for (const name of report.onlyInA) {
        lines.push(`NOT VERIFIABLE: ${name} — rendered at A only, nothing at B to subtract`);
    }
    for (const name of report.onlyInB) {
        lines.push(`NOT VERIFIABLE: ${name} — rendered at B only, nothing at A to subtract`);
    }

    const over = report.stems.filter((stem) =>
        exceedsThreshold(stem.residual.rmsDb, report.thresholdDb),
    );
    lines.push(
        `${over.length} of ${report.stems.length} stem(s) above ${formatDb(report.thresholdDb)} dBFS` +
            (over.length > 0 ? `: ${over.map((stem) => stem.stem).join(', ')}` : ''),
    );
    return lines.join('\n');
}

// ── git ───────────────────────────────────────────────────────────────────────

function git(args: string[], options: { allowFailure?: boolean } = {}): string | null {
    const result = spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' });
    if (result.error) {
        throw new Error(`could not run git — ${result.error.message}`);
    }
    if (result.status !== 0) {
        if (options.allowFailure) {
            return null;
        }
        throw new Error(
            `git ${args.join(' ')} failed: ${result.stderr?.trim() || 'unknown error'}`,
        );
    }
    return result.stdout;
}

/** Where HEAD is right now — a branch name when there is one, a sha when detached. */
function readHeadRef(): RefDescriptor {
    const sha = (git(['rev-parse', 'HEAD']) as string).trim();
    const branch = git(['symbolic-ref', '--short', 'HEAD'], { allowFailure: true });
    return branch === null
        ? { spec: sha, sha, detached: true }
        : { spec: branch.trim(), sha, detached: false };
}

/**
 * Refuse to run on a dirty tree, and never stash.
 *
 * Stashing here would be the single most dangerous thing this tool could do: a
 * `git stash` before a checkout followed by a failed pop leaves uncommitted work in
 * a place the user did not put it, and the failure mode is silent. Refusing costs
 * one `git stash` typed by hand and removes the whole class.
 */
function requireCleanTree(): void {
    const status = ((git(['status', '--porcelain']) as string) || '').trim();
    if (status.length === 0) {
        return;
    }
    const preview = status.split('\n').slice(0, 5).join('\n  ');
    throw new Error(
        'working tree is dirty — mix:ab checks out other refs and will NOT stash for you.\n' +
            `  ${preview}\n` +
            '  commit or stash by hand, then re-run.',
    );
}

function checkoutSha(sha: string): void {
    if (readHeadRef().sha === sha) {
        // Already there. Skipping is not just faster: an identity run on HEAD then
        // performs no git write at all.
        return;
    }
    git(['checkout', '--quiet', '--detach', sha]);
}

/**
 * Put the user back where they started, and be LOUD if that fails.
 *
 * Always called from a `finally`. A tool that moves HEAD and then dies quietly
 * leaves someone building on a ref they did not choose, so the failure path prints
 * the ref they are actually on and the exact command that gets them back.
 */
function restoreRef(original: RefDescriptor): void {
    const args = original.detached
        ? ['checkout', '--quiet', '--detach', original.sha]
        : ['checkout', '--quiet', original.spec];
    const failed = git(args, { allowFailure: true }) === null;
    const now = readHeadRef();
    if (!failed && now.sha === original.sha && now.spec === original.spec) {
        return;
    }
    const bar = '!'.repeat(78);
    process.stderr.write(
        `\n${bar}\n` +
            'mix:ab COULD NOT RESTORE YOUR ORIGINAL REF.\n' +
            `  you started on : ${describeRef(original)}\n` +
            `  you are now on : ${describeRef(now)}\n` +
            `  get back with  : git checkout ${original.spec}\n` +
            '  nothing was stashed, so no uncommitted work is hiding anywhere.\n' +
            `${bar}\n\n`,
    );
    process.exitCode = 1;
}

// ── Rendering ─────────────────────────────────────────────────────────────────

/**
 * Drive one headless render at whatever ref is currently checked out.
 *
 * `--no-build` is deliberately NOT passed. `mix:report` renders the built bundle in
 * `dist/`, so reusing a bundle built at the other ref would render ref A's code and
 * label it ref B — the exact error the whole tool exists to rule out.
 *
 * `--write-events` is passed unconditionally. On a ref older than 795baf1b the flag
 * simply does not exist; that harness ignores it, renders the WAVs anyway, and
 * writes no dumps — which the caller detects by their absence and reports as a
 * NOT VERIFIABLE event delta rather than failing the run.
 */
function runMixReport(outDir: string, options: MixAbOptions): void {
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
    const result = spawnSync('npx', args, {
        cwd: REPO_ROOT,
        stdio: ['ignore', 'ignore', 'inherit'],
    });
    if (result.error) {
        throw new Error(`could not run mix:report — ${result.error.message}`);
    }
    if (result.status !== 0) {
        throw new Error(`mix:report exited with code ${result.status}`);
    }
}

interface LoadedRender {
    label: string;
    stem: string;
    decoded: DecodedStem;
    dumpPath: string | null;
    meta: RenderMeta | null;
    events: DumpEvent[] | null;
}

interface EventDumpFile {
    stem: string;
    meta: RenderMeta;
    events: DumpEvent[];
}

function loadRenderDir(dir: string): Map<string, LoadedRender> {
    const loaded = new Map<string, LoadedRender>();
    for (const name of readdirSync(dir)
        .filter((entry) => entry.endsWith('.wav'))
        .sort()) {
        const label = name.slice(0, -'.wav'.length);
        const decoded = decodeWav(readFileSync(path.join(dir, name)));
        const dumpPath = path.join(dir, `${label}.events.json`);
        const dump: EventDumpFile | null = existsSync(dumpPath)
            ? JSON.parse(readFileSync(dumpPath, 'utf8'))
            : null;
        if (dump && dump.meta.sampleRate !== decoded.sampleRate) {
            // Same guard `mix:verify` and `mix:spectro` make: a rate mismatch puts
            // every bar boundary at the wrong second while the numbers still look
            // entirely plausible.
            throw new Error(
                `${name}: WAV is ${decoded.sampleRate} Hz but its event dump says ` +
                    `${dump.meta.sampleRate} Hz`,
            );
        }
        loaded.set(label, {
            label,
            stem: dump?.stem ?? label,
            decoded,
            dumpPath: dump ? dumpPath : null,
            meta: dump?.meta ?? null,
            events: dump?.events ?? null,
        });
    }
    if (loaded.size === 0) {
        throw new Error(`${dir} contains no *.wav — the render produced nothing`);
    }
    return loaded;
}

/**
 * `--stems=` filters the comparison, not the render (`mix:report` always renders
 * them all). The stem id comes from the event dump when there is one; without a
 * dump the file name is all there is, and `funk-pocket-bass-MIX_AUDIT` cannot be
 * split reliably (scene ids contain hyphens too), so it falls back to a substring
 * test rather than guessing at a parse.
 */
export function matchesStemFilter(
    entry: { stem: string; label: string },
    filter: string[],
): boolean {
    if (filter.length === 0) {
        return true;
    }
    return filter.some(
        (stem) =>
            entry.stem === stem ||
            (entry.stem === entry.label && entry.label.includes(`-${stem}-`)),
    );
}

/** Clear stale renders so `mix:spectro --from=<out>` cannot read a mix of two runs. */
function prepareOutDir(outDir: string): void {
    mkdirSync(outDir, { recursive: true });
    for (const name of readdirSync(outDir)) {
        if (name.endsWith('.wav') || name.endsWith('.events.json')) {
            rmSync(path.join(outDir, name), { force: true });
        }
    }
}

/**
 * Write the residual as a WAV, plus a copy of the event dump beside it under the
 * matching name — which is precisely the shape `mix:spectro --from=<dir>` reads, so
 * the difference spectrogram is one more command and no new plumbing.
 *
 * The residual is written at unity gain. At 16 bits one LSB is ≈ −90.3 dBFS, so a
 * residual near the noise floor does not survive the write — the same level the
 * tool already declines to attribute, which is why it is not normalized: scaling it
 * up would move it off the pinned `SPECTRO_SCALE` dB window that makes two sheets
 * comparable in the first place.
 */
function writeResidual(
    outDir: string,
    stem: LoadedRender,
    residual: StemResidual,
    sidecar: string | null,
): string {
    const wavPath = path.join(outDir, `${stem.label}.wav`);
    writeFileSync(wavPath, Buffer.from(encodeWav(residual.residual, residual.sampleRate)));
    if (sidecar !== null) {
        copyFileSync(sidecar, path.join(outDir, `${stem.label}.events.json`));
    }
    return path.relative(REPO_ROOT, wavPath);
}

async function main(argv: string[]): Promise<void> {
    const options = parseMixAbArgs(argv);
    const identity = options.identity !== null;
    const outDir = path.resolve(REPO_ROOT, options.out ?? path.join('tmp', 'ab'));
    // Renders MUST land outside the checked-out tree, or the second checkout would
    // wipe the first ref's output. `tmp/` is gitignored, which is exactly what makes
    // this tool possible at all.
    const renderRoot = path.join(REPO_ROOT, 'tmp', 'mix-ab-render');
    const dirA = path.join(renderRoot, 'a');
    const dirB = path.join(renderRoot, 'b');

    requireCleanTree();
    const original = readHeadRef();

    // Resolve to immutable shas BEFORE any checkout. `--refs=good..HEAD` is the
    // `git bisect run` shape, and after the first checkout `HEAD` would name the
    // ref we just moved to — so a late resolve would silently compare a ref with
    // itself and report a clean null on every commit.
    const resolve = (spec: string): RefDescriptor => {
        const sha = git(['rev-parse', '--verify', `${spec}^{commit}`], { allowFailure: true });
        if (sha === null) {
            throw new Error(`not a commit this repo knows: ${spec}`);
        }
        return { spec, sha: sha.trim(), detached: true };
    };
    const refA = resolve(identity ? (options.identity as string) : (options.fromRef as string));
    const refB = identity ? refA : resolve(options.toRef as string);

    rmSync(renderRoot, { recursive: true, force: true });
    mkdirSync(dirA, { recursive: true });
    mkdirSync(dirB, { recursive: true });

    try {
        try {
            checkoutSha(refA.sha);
            runMixReport(dirA, options);
            checkoutSha(refB.sha);
            runMixReport(dirB, options);
        } finally {
            restoreRef(original);
        }

        const loadedA = loadRenderDir(dirA);
        const loadedB = loadRenderDir(dirB);
        const shared = [...loadedA.keys()].filter((label) => loadedB.has(label));
        const compared = shared.filter((label) =>
            matchesStemFilter(loadedA.get(label) as LoadedRender, options.stems),
        );
        if (compared.length === 0) {
            throw new Error(
                options.stems.length > 0
                    ? `no stems matched --stems=${options.stems.join(',')}`
                    : 'the two renders share no stem file names',
            );
        }

        prepareOutDir(outDir);
        const stems: StemReport[] = [];
        for (const label of compared) {
            const a = loadedA.get(label) as LoadedRender;
            const b = loadedB.get(label) as LoadedRender;
            const residual = subtractStems(a.decoded, b.decoded);
            const notVerifiable: Record<string, string> = {};

            // Geometry is a property of the scene/seed/loops, which are identical at
            // both refs — so either ref's dump can supply it, and one ref predating
            // `--write-events` does not cost the per-bar localization.
            const meta = b.meta ?? a.meta;
            const bars =
                meta === null ? null : residualByBar(residual.residual, residual.sampleRate, meta);
            if (meta === null) {
                notVerifiable.perBarResidual =
                    'neither ref wrote an event dump (both predate 795baf1b), so the bar grid ' +
                    'is unknown; the stem total above is still exact';
            }

            let delta: EventDelta | null = null;
            if (a.events !== null && b.events !== null && meta !== null) {
                delta = diffEvents(a.events, b.events, meta);
            } else {
                const missing = [a.events === null ? 'A' : null, b.events === null ? 'B' : null]
                    .filter(Boolean)
                    .join(' and ');
                notVerifiable.eventDelta =
                    `ref ${missing} wrote no event dump — \`--write-events\` landed in 795baf1b, ` +
                    'and rendering an old ref through the current harness would measure the ' +
                    'harness change too';
            }

            stems.push({
                label,
                stem: a.stem,
                residual,
                bars,
                delta,
                notVerifiable,
                residualWavPath: writeResidual(outDir, a, residual, b.dumpPath ?? a.dumpPath),
            });
        }

        const report: AbReport = {
            identity,
            refA,
            refB,
            thresholdDb: options.thresholdDb,
            stems,
            onlyInA: [...loadedA.keys()].filter((label) => !loadedB.has(label)),
            onlyInB: [...loadedB.keys()].filter((label) => !loadedA.has(label)),
        };
        process.stdout.write(`${formatAbReport(report)}\n`);
        if (options.keep) {
            process.stdout.write(
                `per-ref renders kept in ${path.relative(REPO_ROOT, renderRoot)}\n`,
            );
        }
        if (stems.some((stem) => exceedsThreshold(stem.residual.rmsDb, options.thresholdDb))) {
            process.exitCode = 1;
        }
    } finally {
        if (!options.keep) {
            rmSync(renderRoot, { recursive: true, force: true });
        }
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    main(process.argv.slice(2)).catch((error) => {
        process.stderr.write(`mix:ab failed: ${(error as Error).message}\n`);
        process.exitCode = 1;
    });
}
