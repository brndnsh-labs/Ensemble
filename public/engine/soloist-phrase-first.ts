import { TIME_SIGNATURES } from '../config.js';
import { getSectionEnergy } from '../song/form-analysis.js';
import type { EnsembleState, Mutable, SoloistExpression, SoloistQaHang } from '../types.js';
import { clamp01 } from '../utils.js';
import { getBandPocket } from './coordination-engine.js';
import { scrambleHash } from './hash-utils.js';
import { resolveSoloistStyle } from './soloist-config.js';
import { consonantDoubleStopInterval, guitarDoubleStopVoice } from './soloist-devices.js';
import { allowsSoloistPolyphony } from './soloist-mode-policy.js';
import { chordTargetTones } from './soloist-pitch-engine.js';

/**
 * Phrase-first soloist engine — THE soloist engine
 * (docs/design/soloist-phrase-first.md).
 *
 * `tick-logic.ts` calls this every tick. It began as a parallel, flag-gated path
 * built up layer-by-layer alongside the old `getSoloistNote`; once it became the
 * default the toggle was retired, and epic #10 (#865) DELETED the legacy engine
 * outright — this is now the only soloist generator.
 *
 * **Contract:** `null` | a note object (`{ midi, velocity, durationSteps,
 * timingOffset, … }`, `freq` is derived downstream), and it maintains
 * `soloist.session.phrasing.isResting` each tick (tick-logic publishes it to the
 * coordination context so bass/chords/harmony know whether the lead is breathing).
 * The positional argument list is inherited from the retired `getSoloistNote` (some
 * params are vestigial — see the signature).
 *
 * **Build status — 2c (apex reach + recurring peaks):** on top of 2b (theme +
 * breath + arc + chord-tone landing + cumulative development with theme return),
 * the climb now has a *destination*: the highest note of EACH development-cycle
 * window (its local peak) LANDS on a **money note** — a strong key tone a
 * third-to-sixth above — whenever it sounds, so the lead reaches a resolved
 * signature peak roughly once per cycle (~24 bars), not once per macro-form
 * (design §9). Build 2d adds expression as a lyrical FLURRY around each peak — a
 * whole-step scoop UP INTO the money note, lighter scoops on ~half the nearby
 * notes, and vibrato on any held note in the zone — clustered into a burst, with
 * the long stretch between peaks left clean so the flurries have space (§10).
 *
 * **Build 3 (voice-leading — the keystone, §5):** the body of the line now plays
 * THROUGH the changes. Strong beats (downbeat + bar midpoint) are TARGETS — a
 * non-chord-tone there is pulled onto a guide tone (3rd/7th), while a note already
 * on a chord tone is left as the melody states it; the weak step before a target
 * steps diatonically INTO it (a leading tone), and a chord change on that beat is
 * anticipated across the barline. Guide tones come from chord QUALITY (shared
 * `chordTargetTones`), robust to rootless comp voicings. (Idiom-specific chromatic
 * enclosures / bebop passing scales are a later slice — §8.) Every
 * emitted note's duration is clamped to the next note that sounds, so the
 * monophonic lead never overruns its successor. Still to come: op variety (inversion,
 * displacement), a stepwise run-up into the apex, voice-leading targeting on
 * weak beats, then full expression (bends/vibrato, sparingly). With no seed it
 * rests (returns null) — a guard test proves every canonical genre seeds non-empty
 * for a real chart, so that rest path is unreachable in normal playback.
 */

// #1006 — within-phrase velocity envelope test seam (§4.6). The envelope is a pure
// function of metric/apex POSITION, so there is no production input that turns it
// off; this module-level flag is the clean A/B toggle the critique test flips to
// measure the shaped path against the flat baseline. Production NEVER touches it —
// the envelope is always on in normal playback (default `true`). Kept off the state
// slice deliberately: it isn't persisted, synced, or user-settable, just a test hook.
export const SOLOIST_VELOCITY_ENVELOPE = { enabled: true };

// --- #1157 — Q&A hang windows for the comper's answering gesture ---
// The seed plans each 4-bar block's question→answer pair (#1009): the question
// cadence hangs on a pinned tension, rings into a carved breath, and the answer
// half re-enters after it. This helper is the ONE place that maps those seed
// positions into the live step frame (the same `loopLengthSteps` modulo the
// emit path uses — NOT `arranger.totalSteps`), so tick-logic can publish a
// digested window through the coordination context and the comper never touches
// the raw seed. Everything here is a pure function of (seed, step) — no session
// state, no PRNG — so the live and MIDI-export hosts agree by construction.

/** In-loop precomputed window (cached per seed — see qaWindowCache). */
interface QaWindowInLoop {
    pc: number;
    drawSalt: number;
    hangStart: number;
    echo: number;
    answerEntry: number;
    resolutionBarStart: number;
    resolutionBarEnd: number;
}

// Cache the O(notes²) pairing scan per seed. Validity is (seedId, stepsPerBeat,
// stepsPerMeasure, totalSteps) — recomputed on any mismatch.
//
// `seedId` is NOT redundant with the WeakMap's identity key: on the WORKER a
// regenerated seed arrives through `recursiveSafeSync`, which deep-merges a
// plain-object field into the existing target instead of replacing it, so
// `soloist.session.seed` keeps its object identity while its `notes` are swapped
// underneath (mid-playback key change / chart edit — `regenerateSessionSeeds` in
// state-effects.ts). Identity alone would serve the OLD seed's hang pitch classes
// against the NEW line until stop→play. The token changes every generation, so it
// catches exactly that case; the meter/length fields cover re-keying when the
// grid changes. (Seeds with no `seedId` — hand-built test fixtures — fall back to
// identity-only caching, which is correct for immutable fixtures.)
const qaWindowCache = new WeakMap<
    object,
    { seedId: number; spb: number; spm: number; total: number; windows: QaWindowInLoop[] }
>();

function computeQaWindows(
    seed: { notes: any[]; loopLengthSteps: number },
    spb: number,
    spm: number,
    totalSteps: number,
): QaWindowInLoop[] {
    const loopLen = seed.loopLengthSteps || 64;
    const windows: QaWindowInLoop[] = [];
    if (!seed.notes?.length || loopLen <= 0) {
        return windows;
    }
    const inLoop = (s: number) => ((s % loopLen) + loopLen) % loopLen;

    // Session salt for the comper's participation draw: the seed's content hash
    // (`seedId`, stamped by generateSessionSeed over every note), so which
    // questions get answered varies with the generated line instead of being
    // frozen to chart position — and is stable for as long as that line is.
    // Falls back to the form length for hand-built fixtures with no seedId.
    const drawSalt = (seed as { seedId?: number }).seedId ?? seed.loopLengthSteps | 0;

    // Apex positions per development-cycle window, mirroring the live engine's
    // signature-peak scan in getSoloistNotePhraseFirst (TARGET_PEAK_WINDOW_STEPS
    // = 192, loopsPerWindow, cycleLen — keep the constants in lockstep with
    // that block). Needed because TWO live branches override a question's hang
    // pitch near the apex, so the seed pc is NOT what sounds there:
    //   • the question IS the apex (`stepsToApex === 0`) — `isApexStep` is tested
    //     BEFORE the `qaRole` branch, so the lead emits the money note, a resolved
    //     tonic/5th, not the seed's soft-color hang;
    //   • the APEX DOVETAIL — the last question within 2 bars of the apex is aimed
    //     at the money note's lower neighbor.
    // Both are excluded below, for one musical reason: the apex itself answers
    // that question, and the comper must not step on the peak. (#1159 — the
    // apex-coincident half was missed on the first cut, so the comper echoed a
    // soft-color tone the lead never played, right over the climax.)
    const effTotal = totalSteps > 0 ? totalSteps : loopLen;
    const loopsPerWindow = Math.max(1, Math.round(192 / effTotal));
    const cycleLen = loopsPerWindow * effTotal;
    const apexByCycle = new Map<number, { midi: number; step: number }>();
    for (const n of seed.notes) {
        if (n.step < 0) {
            continue;
        }
        const sIL = inLoop(n.step);
        const cyc = Math.floor(sIL / cycleLen);
        const cur = apexByCycle.get(cyc);
        if (!cur || n.midi > cur.midi) {
            apexByCycle.set(cyc, { midi: n.midi, step: sIL });
        }
    }

    for (const q of seed.notes) {
        if (q.qaRole !== 'question' || q.step < 0) {
            continue;
        }
        const qIL = inLoop(q.step);
        // Apex exclusion — mirror BOTH live overrides: the apex step itself
        // (distance 0) and the dovetail into it (within 2 bars ahead).
        const apex = apexByCycle.get(Math.floor(qIL / cycleLen));
        if (apex) {
            const stepsToApex = (((apex.step - qIL) % loopLen) + loopLen) % loopLen;
            if (stepsToApex <= spm * 2) {
                continue;
            }
        }
        const hangEnd = qIL + (q.durationSteps || 1);
        // Paired answer cadence: the nearest 'answer' after this question within
        // the same 4-bar block. The seeder never half-applies a pair (#1009), so
        // an unpaired question here just means the block layout was unusual —
        // skip rather than guess.
        let answerIL = -1;
        let entryIL = -1;
        for (const m of seed.notes) {
            if (m.step < 0) {
                continue;
            }
            const mIL = inLoop(m.step);
            if (m.qaRole === 'answer' && mIL > qIL && mIL - qIL <= 4 * spm) {
                if (answerIL < 0 || mIL < answerIL) {
                    answerIL = mIL;
                }
            }
            // Soloist re-entry: the first sounding note strictly after the hang
            // (the breath is carved silence, so this IS the answer half's start).
            if (mIL > hangEnd && (entryIL < 0 || mIL < entryIL)) {
                entryIL = mIL;
            }
        }
        if (answerIL < 0) {
            continue;
        }
        if (entryIL < 0 || entryIL > answerIL) {
            entryIL = answerIL;
        }
        // Echo one beat into the hang — the comper lets the question breathe
        // before the nod — and always strictly inside the soloist's silence.
        const echo = Math.min(qIL + spb, entryIL - 1);
        if (echo <= qIL) {
            continue; // no room to interject — skip the window entirely
        }
        const resolutionBarStart = Math.floor(answerIL / spm) * spm;
        windows.push({
            pc: ((q.midi % 12) + 12) % 12,
            drawSalt,
            hangStart: qIL,
            echo,
            answerEntry: entryIL,
            resolutionBarStart,
            resolutionBarEnd: resolutionBarStart + spm,
        });
    }
    windows.sort((a, b) => a.hangStart - b.hangStart);
    return windows;
}

/**
 * The Q&A window covering `step`, or null. Coverage runs from the question
 * cadence through the end of the answer cadence's bar; blocks tile without
 * overlap, so at most one window contains any step.
 */
export function getQaHangAt(
    seed: { notes: any[]; loopLengthSteps: number; seedId?: number } | null,
    step: number,
    stepsPerBeat: number,
    stepsPerMeasure: number,
    totalSteps: number,
): SoloistQaHang | null {
    if (!seed || stepsPerBeat <= 0 || stepsPerMeasure <= 0) {
        return null;
    }
    const seedId = seed.seedId ?? 0;
    let cached = qaWindowCache.get(seed);
    if (
        !cached ||
        cached.seedId !== seedId ||
        cached.spb !== stepsPerBeat ||
        cached.spm !== stepsPerMeasure ||
        cached.total !== totalSteps
    ) {
        cached = {
            seedId,
            spb: stepsPerBeat,
            spm: stepsPerMeasure,
            total: totalSteps,
            windows: computeQaWindows(seed, stepsPerBeat, stepsPerMeasure, totalSteps),
        };
        qaWindowCache.set(seed, cached);
    }
    const loopLen = seed.loopLengthSteps || 64;
    const stepInLoop = ((step % loopLen) + loopLen) % loopLen;
    const loopBase = step - stepInLoop;
    for (const w of cached.windows) {
        if (stepInLoop >= w.hangStart && stepInLoop < w.resolutionBarEnd) {
            return {
                pc: w.pc,
                drawSalt: w.drawSalt,
                hangStartStep: loopBase + w.hangStart,
                echoStep: loopBase + w.echo,
                answerEntryStep: loopBase + w.answerEntry,
                resolutionBarStart: loopBase + w.resolutionBarStart,
                resolutionBarEnd: loopBase + w.resolutionBarEnd,
            };
        }
        if (w.hangStart > stepInLoop) {
            break; // sorted — nothing later can contain this step
        }
    }
    return null;
}

// --- Key / diatonic vocabulary (self-contained, like the rest of this engine) ---
// Note-name → pitch class, including the sharp spellings the arranger emits.
const KEY_PC: Record<string, number> = {
    C: 0,
    'C#': 1,
    Db: 1,
    D: 2,
    'D#': 3,
    Eb: 3,
    E: 4,
    F: 5,
    'F#': 6,
    Gb: 6,
    G: 7,
    'G#': 8,
    Ab: 8,
    A: 9,
    'A#': 10,
    Bb: 10,
    B: 11,
};
const MAJOR_STEPS = [0, 2, 4, 5, 7, 9, 11];
const MINOR_STEPS = [0, 2, 3, 5, 7, 8, 10]; // natural minor

// How far the line reaches, in *diatonic degrees*, at each development depth.
// depth 0 = the head (verbatim); then a third, a fifth, a sixth, a seventh as
// the cycle climbs to its climax. These are by-ear knobs — the shape (returns
// to 0, grows monotonically) is what matters, not the exact intervals.
const DEPTH_DEGREES = [0, 2, 4, 5, 6];

/**
 * Transpose a MIDI note UP by `degrees` scale degrees within the given key,
 * preserving melodic contour (parallel diatonic motion — the classic
 * "sequence" that keeps a restated idea recognizably the same). A non-scale
 * source note snaps onto the scale, which only helps keep development in key.
 * Returns the raw transposed pitch (may exceed the register ceiling) — the
 * caller folds the whole developed line into register as one unit so the
 * contour is never broken at the seam. Note the soloist's HIGH register is not
 * clamped downstream (`enforceRegisterSlotting` only lifts notes below 52), so
 * the ceiling must be respected here, not deferred.
 */
function diatonicShift(midi: number, degrees: number, keyRootPc: number, isMinor: boolean): number {
    const steps = isMinor ? MINOR_STEPS : MAJOR_STEPS;
    const len = steps.length;
    const relPc = (((midi - keyRootPc) % 12) + 12) % 12;
    // Index of the scale degree at or just below this pitch class. A non-scale
    // source (e.g. a chromatic guide tone) snaps to the nearest degree below, so
    // ±1 still lands a true scale neighbor — the diatonic step used for approaches.
    let idx = 0;
    for (let i = 0; i < len; i++) {
        if (steps[i] <= relPc) {
            idx = i;
        } else {
            break;
        }
    }
    const targetIdx = idx + degrees;
    const octaveShift = Math.floor(targetIdx / len);
    const wrapped = ((targetIdx % len) + len) % len;
    const newRel = steps[wrapped] + octaveShift * 12;
    // Pure contour-preserving shift — register folding is applied to the developed
    // line as ONE unit at the call site (a per-note fold here would invert the
    // contour at the seam where adjacent notes straddle the ceiling).
    return Math.round(midi - relPc + newRel);
}

function diatonicTranspose(
    midi: number,
    degrees: number,
    keyRootPc: number,
    isMinor: boolean,
): number {
    // Development only ever transposes UP; depth 0 (the theme return) is verbatim.
    return degrees <= 0 ? midi : diatonicShift(midi, degrees, keyRootPc, isMinor);
}

/**
 * The TRUE scale-tone neighbor of `midi` — above (`dir > 0`) or below (`dir < 0`).
 * Unlike `diatonicShift(±1)`, this is correct when `midi` is CHROMATIC to the key
 * (the common case for an approach target — a dominant ♭7, a secondary-dominant
 * 3rd): the note a step below B♭ in C major is A (a whole step), not G. For a
 * chromatic source the snap degree itself is already the lower neighbor; for a
 * scale tone, step a full degree down. The upper neighbor is always the next
 * degree up. This is what makes the weak-beat approach a real stepwise leading
 * tone into the target rather than a leap.
 */
function diatonicNeighbor(midi: number, dir: number, keyRootPc: number, isMinor: boolean): number {
    const steps = isMinor ? MINOR_STEPS : MAJOR_STEPS;
    const len = steps.length;
    const relPc = (((midi - keyRootPc) % 12) + 12) % 12;
    let idx = 0;
    let onDegree = false;
    for (let i = 0; i < len; i++) {
        if (steps[i] === relPc) {
            idx = i;
            onDegree = true;
            break;
        }
        if (steps[i] < relPc) {
            idx = i;
        } else {
            break;
        }
    }
    const targetIdx = dir < 0 ? (onDegree ? idx - 1 : idx) : idx + 1;
    const octaveShift = Math.floor(targetIdx / len);
    const wrapped = ((targetIdx % len) + len) % len;
    const newRel = steps[wrapped] + octaveShift * 12;
    return Math.round(midi - relPc + newRel);
}

/**
 * Land a note on a harmonic target: prefer a guide tone (3rd/7th) when one sits
 * within reach of the developed pitch (so the line *outlines the changes* without
 * wrenching the contour to grab a distant 3rd), else snap to the nearest
 * functional chord tone. `guides`/`pillars` are absolute pitch classes from
 * `chordTargetTones`. This is the §5 keystone: where you land defines the harmony.
 */
const GUIDE_REACH = 3; // semitones — a guide tone within a minor third is "in reach"
function landOnTarget(midi: number, guides: number[], pillars: number[]): number {
    // Leave the melody alone when it ALREADY lands a chord tone — a theme note on
    // the 5th is doing its job; wrenching it to the 3rd would erode the tune.
    // Only re-target strong beats that are currently NON-chord-tones (the ones
    // that actually read as "wandering"), and when we do, prefer a guide tone.
    const pc = ((midi % 12) + 12) % 12;
    if (pillars.includes(pc)) {
        return midi;
    }
    if (guides.length > 0) {
        const g = snapToNearestPc(midi, new Set(guides));
        if (Math.abs(g - midi) <= GUIDE_REACH) {
            return g;
        }
    }
    return pillars.length > 0 ? snapToNearestPc(midi, new Set(pillars)) : midi;
}

// A chord change between adjacent steps — root pitch-class or quality differs.
// Used to anticipate the coming chord across the change (voice-lead through it).
function chordChanged(a: any, b: any): boolean {
    if (!a || !b) {
        return false;
    }
    const ra = ((Math.round(a.rootMidi) % 12) + 12) % 12;
    const rb = ((Math.round(b.rootMidi) % 12) + 12) % 12;
    return ra !== rb || (a.quality || '') !== (b.quality || '');
}

/**
 * Snap a MIDI note to the nearest pitch class in `pcSet`, preserving register,
 * searching outward ±6 semitones, down-first on ties. Mirrors the legacy
 * file-local `snapMidiToPitchClasses` (soloist.ts); replicated here to keep the
 * parallel engine self-contained.
 */
function snapToNearestPc(midi: number, pcSet: Set<number>): number {
    const pc = ((midi % 12) + 12) % 12;
    if (pcSet.has(pc)) {
        return midi;
    }
    for (let d = 1; d <= 6; d++) {
        if (pcSet.has((((midi - d) % 12) + 12) % 12)) {
            return midi - d;
        }
        if (pcSet.has((((midi + d) % 12) + 12) % 12)) {
            return midi + d;
        }
    }
    return midi;
}

/**
 * The seed note that OWNS a step: a planned Q&A cadence first, then the hook, else
 * simply the first note there.
 *
 * #1162 — array order at a step is an accident of seed post-processing, not a
 * musical ranking. The flair pass's Device-1 dotted split (`soloist-seeder.ts`)
 * re-articulates a long note by emitting its second half at
 * `step + stepsPerBeat * 1.5` with no occupancy check; that fragment carries the
 * PARENT's pitch and is produced while the parent is being processed, so it sits
 * ahead of a cadence that lands on the same step. (The split guard `!qaRole` only
 * protects the note being split, not wherever its tail lands.) Measured at ~1 seed
 * in 90 across every preset x 10 genres x both modes; always a `durationSteps: 2`
 * fragment in front of the cadence, never a hook.
 *
 * Reading the role off the fragment cost the cadence both its pinned pitch and its
 * density-gate exemption — so a question hang could be gated to silence outright —
 * while `emitsAt`, `isAnchor` and `computeQaWindows` all scan every note at the step
 * and still expected it to sound. This is the one selector they now share, so the
 * live emit and its lookahead paths cannot drift apart again.
 *
 * Cadence outranks hook because the cadence has a CROSS-LANE contract: the comper
 * echoes the question's own pitch class via `computeQaWindows`, so losing it makes
 * another instrument answer a tone the lead never played. A hook loss is contained
 * inside this lane. (They can't collide in practice — the hook lives at a block's
 * measure 0, cadences at the end of each half.)
 */
function ownerOfStep(atStep: any[]): any {
    return (
        atStep.find((n: any) => n?.qaRole === 'question' || n?.qaRole === 'answer') ??
        atStep.find((n: any) => n?.hookRole) ??
        atStep[0] ??
        null
    );
}

export function getSoloistNotePhraseFirst(
    state: EnsembleState,
    currentChord: any,
    nextChord: any,
    step: number,
    // prevFreq/octave/stepInChord/coordination/stepInfo are vestigial: they exist
    // only to keep the positional call contract with tick-logic (the signature was
    // copied from the now-retired legacy `getSoloistNote`, epic #10). Phrase-first
    // derives these from `state`/its own structure and never reads the params.
    _prevFreq: number | null,
    _octave: number,
    style: string,
    _stepInChord: number,
    // #1020: promoted from vestigial. tick-logic passes
    // `{ sectionStart, sectionEnd, stepCoordination }` — the soloist now READS the
    // section boundaries to phrase around form seams (rest into a change, enter big
    // after a rising one). Still tolerant of `{}` from callers that don't supply it
    // (partial mocks, the pre-seed fallback path) — every read below guards.
    coordination: any = {},
    _stepInfo: any = null,
): any {
    const { playback, soloist, arranger } = state;

    // No harmony to play against → nothing to do (matches legacy contract).
    if (!currentChord) {
        return null;
    }

    // Phrase-first performs a stated theme. The seed is generated synchronously
    // on play (state-effects `regenerateSessionSeeds`) before the first tick, and
    // `generateSessionSeed` only yields an empty `notes` array in degenerate cases
    // — no stepMap / no sectionMap / totalSteps === 0 (soloist-seeder), i.e. an
    // empty chart with nothing to solo over. So a missing seed means there is no
    // music to play against: rest. (#861 — this branch replaced a delegation to
    // the legacy `getSoloistNote` engine, retired in epic #10; a guard test in
    // tests/standards proves every canonical genre seeds non-empty for a real
    // chart, so this rest path is unreachable in normal playback.)
    const seed = soloist.session.seed;
    if (!seed?.notes?.length) {
        (soloist.session.phrasing as Mutable<typeof soloist.session.phrasing>).isResting = true; // @worker-mutation
        return null;
    }

    const phr = soloist.session.phrasing as Mutable<typeof soloist.session.phrasing>;
    const loopLen = seed.loopLengthSteps || 64;

    // --- Find the theme (seed) note(s) at this step, wrapping per loop window ---
    const stepInLoop = ((step % loopLen) + loopLen) % loopLen;
    const here = seed.notes.filter((n: any) => {
        if (step < 0 && n.step === step) {
            return true; // pickup notes live at negative steps
        }
        return ((n.step % loopLen) + loopLen) % loopLen === stepInLoop;
    });

    // No theme note scheduled here → this is breath. Silence is a choice, not a
    // gap to fill: rest and let the band answer.
    if (here.length === 0) {
        phr.isResting = true; // @worker-mutation
        return null;
    }

    // --- Locate the current cycle's local apex (recurring signature peaks) ---
    // The form is divided into development-cycle WINDOWS (~24 bars each); every
    // window has its own local apex — its single highest seed note — which lands
    // on its own money note whenever it sounds. So the lead reaches a resolved
    // signature peak roughly once per cycle (heard several times in a normal
    // listen) instead of one rare global climax. Pickups (negative steps) are
    // never a peak, so they're excluded. The window is a whole number of
    // arrangement loops (`cycleLen` is a multiple of `totalSteps`), so window
    // boundaries always coincide with loop boundaries — where pitch/fold can
    // already shift — and no new mid-phrase seam is introduced. Computed from
    // seed.notes only (loop-stable). cyclePeriod/totalSteps are hoisted here so
    // both the apex window and the later development depth share one definition.
    const totalSteps = arranger.totalSteps > 0 ? arranger.totalSteps : loopLen;
    const cyclePeriod = Math.min(Math.max(3 + Math.floor(loopLen / 128), 3), 6);
    // The signature-peak window is a FIXED musical span (~12 bars), independent
    // of the progression length — a 12-bar blues must not get a third as many
    // peaks as a 4-bar pop turnaround just because its `totalSteps` is 3× larger.
    // ~12 bars (not 24) so the peaks recur often enough to read as a signature
    // hook (~once per 20s) — tuned up by ear; lower the constant for more.
    // Snap the span to a whole number of arrangement loops so window edges still
    // land on loop boundaries (where pitch/fold already shift): no new mid-phrase
    // seam, and the duration-clamp lookahead — which never crosses a loop
    // boundary — keeps using the correct window's apex. (The first cut tied the
    // window to `cyclePeriod × totalSteps`, so the recurrence silently scaled with
    // the progression: 6 peaks on a 4-bar form but only 2 on a 12-bar blues,
    // ~3.5 min apart — effectively never heard, and the peak-reach bend with them.
    // Caught by a production probe in the failing config.)
    const TARGET_PEAK_WINDOW_STEPS = 192; // ≈ 12 bars in 4/4 (16 steps/bar)
    const loopsPerWindow = Math.max(1, Math.round(TARGET_PEAK_WINDOW_STEPS / totalSteps));
    const cycleLen = loopsPerWindow * totalSteps;
    const curWindow = Math.floor(stepInLoop / cycleLen);
    let themeApexMidi = -1;
    let apexStepInLoop = -1;
    for (const n of seed.notes as any[]) {
        if (n.step < 0) {
            continue;
        }
        const sIL = ((n.step % loopLen) + loopLen) % loopLen;
        if (Math.floor(sIL / cycleLen) !== curWindow) {
            continue; // a different cycle's peak — not this window's reach
        }
        if (n.midi > themeApexMidi) {
            themeApexMidi = n.midi;
            apexStepInLoop = sIL;
        }
    }
    const isApexStep = stepInLoop === apexStepInLoop;

    // On the apex step, the note we develop is the highest one here (a double-stop
    // could otherwise hand us a lower voice); elsewhere the note that OWNS the step
    // (#1162 — see `ownerOfStep`: a planned cadence/hook outranks a split fragment
    // that merely happens to sit first in the array).
    //
    // Preferring the cadence NOTE, not merely reading its role off a different note,
    // is what keeps the pitch consistent too: `computeQaWindows` digests the question
    // note's own midi, so the comper's echo would otherwise answer a tone the lead
    // never played. The apex still outranks both — and a question sharing the apex
    // step loses nothing, since `computeQaWindows` excludes those windows entirely.
    const primary = isApexStep
        ? here.reduce((hi: any, n: any) => (n.midi > hi.midi ? n : hi), here[0])
        : ownerOfStep(here);
    const isAnchor = here.some((n: any) => n?.isAnchor);
    // #1009 — the seed-planned question/answer cadence role of the note sounding here
    // (set on the LAST note of each half of a 4-bar block; absent otherwise). Drives
    // the density-gate exemption (a cadence never gets eroded) and the development
    // asymmetry in the pitch block below (answers re-land at every depth; questions
    // roam). Read off `primary` — which #1162 makes the cadence note whenever one
    // shares this step, so this can no longer miss it.
    const qaRole = (primary as any)?.qaRole as 'question' | 'answer' | undefined;
    const isQaCadence = qaRole === 'question' || qaRole === 'answer';
    // #1056 — the seed-planned hook figure (the first few notes of a block's measure 0,
    // pitch-pinned and chord-rooted at seed time). Exempt from the density gate exactly
    // like a Q&A cadence, so the repeating, identifiable figure always sounds and the
    // ear has something to grab in the exposed early loops.
    const isHook = Boolean((primary as any)?.hookRole);

    // --- Dramatic arc → how active the lead is right now (0..1) ---
    // Two deliberately simple contributions (tuned by ear in later builds):
    //   • entrance: the lead enters sparse and opens up over the first few
    //     loops, the way a player eases into a tune rather than charging in.
    //   • within-form swell: a gentle rise toward the middle of each form pass
    //     and a settle at its edges, so every pass breathes as an arc.
    const loopCount = playback.currentLoopCount ?? -1;
    // #858: front-load the entrance ramp so early loops open up SOONER. The prior
    // linear 0.14/loop meant loops 0-1 read as timid before the line "let loose"
    // (owner audition during #857). A concave curve reaches the SAME loop-4 ceiling
    // (~0.56) but rises faster through loops 1-2 — ease in quickly, then plateau —
    // so first impressions aren't thin while the great-sounding later loops (which
    // already saturate the gate) stay untouched. Curve: [0, .24, .37, .47, .56].
    const lc = Math.min(Math.max(loopCount, 0), 4);
    const loopLift = 0.56 * (lc / 4) ** 0.6;
    // Tempo-awareness (design §7): breath is roughly constant in WALL-CLOCK, so a
    // slow tune's long bars read as too sparse at a fixed musical density — it
    // needs more notes per bar to feel as present. Fill more below ~120bpm. We do
    // NOT thin fast tempos here (the §7 density *ceiling* is a separate,
    // unvalidated change — left out so the mid-tempo genres that already sound
    // right stay untouched). Confirmed by ear: neo-soul at 86 felt sparse, 110 didn't.
    const bpm = playback.bpm || 120;
    const tempoFill = Math.min(0.22, Math.max(0, (120 - bpm) / 200));
    // phrasingIntensity (user slider, default 0.5) nudges how fully the theme is
    // stated: a "more present" ↔ "more spacious" knob layered on the arc.
    const intensityLift = ((soloist.phrasingIntensity ?? 0.5) - 0.5) * 0.3; // ±0.15
    // #1004: the lead RIDES THE BAND ARC. `bandIntensity` (conductor-driven, 0..1)
    // is the macro-form energy the rest of the band already moves with (density
    // tiers, limiter, motif ceilings) — but the foreground voice was deaf to it,
    // playing the same density through a build, a drop, a breakdown. Fold it in so
    // the lead thins on a quiet passage and fills in on a build, the way a player
    // reads the room. Centered at 0.6 = the center-of-mass of the conductor's live
    // macro-arc (the `conductor.ts` session ladder holds sustained mid-session
    // energy in ~0.5–0.7): so the intro/outro (floor 0.2) sit BELOW center and the
    // line lays back and thins, while the climax (ceiling 1.0) sits above and it
    // digs in. NOT the 0.35 dial default — the resting verse is now intentionally a
    // touch sparser, which is the desired arc, not "unchanged". Gain 0.5 makes this
    // the dominant macro term after `loopLift` (arc swing ~+0.20 at the climax down
    // to −0.20 in the intro), outweighing the within-form swell below as a macro
    // arc should. This is the "give the soloist ears" slice-A: a live read of state
    // the band already sets, not reactive listening (the coordination-transition
    // slice, #1020).
    // `?? 0.6` = fall back to the neutral CENTER when no band signal is present, so
    // both the density and velocity terms below evaluate to exactly 0 and the line
    // behaves as it did pre-#1004. Production always sets `bandIntensity` (playback
    // slice default, conductor-written); the fallback only ever fires for a partial
    // test mock that omits it — "no arc signal → no arc modulation."
    const bandEnergy = playback.bandIntensity ?? 0.6;
    const bandLift = (bandEnergy - 0.6) * 0.5;

    // #1020: the lead PHRASES AROUND FORM SEAMS ("give the soloist ears", slice B).
    // Slice A (above) rides the sustained band energy; this reads the STRUCTURE the
    // band already publishes — the current section's boundaries — so the lead does
    // what a player does at a form seam: breathe on the way into a change, then come
    // in strong on the far side of a lift. Two gated, final-stage terms folded into
    // the SAME `activityAt` lambda as slice A, so the live emit and the duration-
    // clamp lookahead below see one gate (the slice-A invariant).
    //   • rest into the change: thin the ornament gate across the LAST bar before a
    //     section boundary (multi-section forms only — a single-section loop has no
    //     "change" to rest into, just the head restating).
    //   • enter big after a rise: fill the FIRST bar of a section the form entered
    //     on an energy LIFT (verse→chorus, breakdown→drop). Detected read-only by
    //     comparing this section's energy to the previous section's (the chord just
    //     before `sectionStart`, wrapped for loops) via form-analysis' energy map —
    //     no new coordination/state field. On a rise `bandLift` is already high, so
    //     (as in slice A) density saturates and the velocity bump below carries most
    //     of the "dig in"; the gate lift still fills the early-loop / sparse cases.
    // Bar math is hoisted here (it was defined below for the pitch grammar) so the
    // seam terms can live inside `activityAt`; the pitch-grammar block below reuses
    // these same locals.
    const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepsPerBeat = ts.stepsPerBeat;
    const stepsPerBar = ts.beats * stepsPerBeat;
    const secStart = Number(coordination?.sectionStart) || 0;
    const secEnd = Number(coordination?.sectionEnd) || 0;
    const multiSection = (arranger.sections?.length ?? 0) > 1 && secEnd > secStart;
    // "Entered on a rise?" — a per-section constant, computed once. The previous
    // section is whatever covers the step just before this section's start (mod the
    // form length, so loop-boundary entries compare against the form's tail). The
    // +0.15 margin means only a GENUINE lift earns the entry emphasis: verse→chorus
    // (+0.4), verse→build (+0.2), breakdown→drop (+0.7) all fire, but a mild step
    // like intro→verse / verse→pre-chorus / verse→bridge (+0.1 in SECTION_ENERGY_MAP)
    // does NOT — a bridge is often a mellow contrast, not a dig-in, so it shouldn't
    // "enter big."
    let enteredOnRise = false;
    if (multiSection && (arranger.stepMap?.length ?? 0) > 0) {
        const prevStep = (((secStart - 1) % totalSteps) + totalSteps) % totalSteps;
        const prevEntry = arranger.stepMap.find(
            (e: any) => prevStep >= e.start && prevStep < e.end,
        );
        const curEnergy = getSectionEnergy((currentChord as any)?.sectionLabel ?? null);
        const prevEnergy = getSectionEnergy((prevEntry?.chord as any)?.sectionLabel ?? null);
        enteredOnRise = curEnergy > prevEnergy + 0.15;
    }
    // Bar position of a step within the current section (0 = first bar;
    // `barsToChange` 0 = the last bar before the boundary). `secStart`/`secEnd` are
    // LOOP-RELATIVE (getChordAtStep derives them from the sectionMap in 0..totalSteps
    // and wraps its own lookup), but `st` here is the raw monotonic transport counter
    // that never resets on a loop boundary — so wrap `st` into the form frame before
    // comparing, or the gates only ever fire on the very first lap (the #923/#921
    // hazard; same wrap bass-engine.ts applies). The lookahead passes a FUTURE
    // `absStep`, so wrap per-argument, not once. Guarded by `multiSection`.
    const seamActivityAt = (st: number): number => {
        if (!multiSection) {
            return 0;
        }
        const stInForm = totalSteps > 0 ? ((st % totalSteps) + totalSteps) % totalSteps : st;
        let d = 0;
        if (secEnd > stInForm && Math.floor((secEnd - 1 - stInForm) / stepsPerBar) === 0) {
            d -= 0.22; // rest INTO the change: thin the last bar before the seam
        }
        if (
            enteredOnRise &&
            stInForm >= secStart &&
            Math.floor((stInForm - secStart) / stepsPerBar) === 0
        ) {
            d += 0.18; // enter BIG: fill the first bar after a rising boundary
        }
        return d;
    };

    // Activity (0..1) at any absolute step: a floor (keeps the theme's bones
    // audible) + the tempo/intensity/entrance/band lifts + the seam phrasing + the
    // within-form swell (the only per-step term — peaks mid-form, settles at the
    // edges). One definition so the duration-clamp lookahead below sees the SAME
    // gate as the live emit.
    // #858: floor lifted 0.30 → 0.34 so even the entrance/edges read a touch more
    // present. It's self-limiting where it should be — late-loop peaks already
    // clamp to 1.0, so the bump only lifts early loops and form edges (exactly the
    // "timid opening" the owner flagged), a no-op where the line already saturates.
    const activityAt = (st: number): number => {
        const ap =
            totalSteps > 0 ? (((st % totalSteps) + totalSteps) % totalSteps) / totalSteps : 0;
        return clamp01(
            0.34 +
                tempoFill +
                intensityLift +
                loopLift +
                bandLift +
                seamActivityAt(st) +
                0.25 * Math.sin(Math.PI * ap),
        );
    };
    const activity = activityAt(step);

    // --- Motivic development: cumulative-but-anchored, with theme return ---
    // The idea GROWS across loops (the line sequences progressively higher) but
    // periodically RETURNS to the head so it stays recognizable — the recurrence
    // that makes a solo feel composed rather than wandering (design §6).
    //   • `depth` rises 0→peak across a rise-and-resolve cycle, then resets to 0
    //     at the top of the next cycle (the theme return). depth 0 = verbatim head.
    //   • The cycle PERIOD scales with song length: short loops come home sooner,
    //     long forms earn more departure before re-grounding.
    //   • Keyed on `loopCount` (integer) so the transposition only ever changes at
    //     a loop boundary — a clean musical seam, never a mid-phrase pitch jump.
    // Cumulative: depth d transposes by a stable monotonic amount, so each deeper
    // loop contains the prior loop's reach plus more. Anchored: contour is
    // preserved exactly by diatonic transposition and the reach is bounded — that
    // bound IS the similarity leash (growth, not drift).
    const c = Math.max(loopCount, 0);
    const developmentDepth = c % cyclePeriod;
    const liftDegrees = DEPTH_DEGREES[Math.min(developmentDepth, DEPTH_DEGREES.length - 1)];
    const keyRootPc = KEY_PC[arranger.key] ?? 0;
    const keyIsMinor = Boolean(arranger.isMinor);

    // --- Apex / money note: this cycle's signature peak (design §9) ---
    // `themeApexMidi` is the highest seed note in the CURRENT development-cycle
    // window (computed above) — this cycle's local peak. Whenever it sounds it
    // LANDS on the "money note": a strong, resolved KEY tone (tonic or 5th) a
    // third-to-sixth above it, so each cycle's peak resolves onto a curated target
    // instead of an arbitrary tension tone. A held tonic/5th over the changes is
    // the idiomatic pedal climax, so the peak keeps the money note (no chord-snap).
    // Because the peak recurs per window, the lead reaches a fresh signature peak
    // roughly once per cycle (~24 bars) rather than once per whole macro-form.
    //
    // The reach is driven by the peak's IDENTITY as its window's high point, NOT
    // by the loop-count development phase. (The first cut scaled the reach by
    // `developmentDepth` — but a peak is a fixed point in the form while depth
    // cycles independently, so the two were decoupled: the peak almost always
    // sounded at a low-reach phase and landed on a near-by tension tone, e.g. the
    // leading tone. Confirmed by a production-faithful probe across genres.)
    //
    // Derive the money note BY CONSTRUCTION (a nearest-snap can land below the
    // apex or above the ceiling): the highest strong tone in (apex+3 … apex+9],
    // capped at 90 — a clear but connected reach (≤ a sixth, no octave leaps),
    // in-register (the high end is NOT clamped downstream). If none fits, accept
    // the nearest strong tone just above; if still none, the apex keeps its pitch.
    const strongKeyPcs = new Set<number>([keyRootPc % 12, (keyRootPc + 7) % 12]);
    const highestStrongTone = (lo: number, hi: number): number => {
        for (let m = hi; m >= lo; m--) {
            if (strongKeyPcs.has(((m % 12) + 12) % 12)) {
                return m;
            }
        }
        return -1;
    };
    const reachCeil = Math.min(themeApexMidi + 9, 90);
    let moneyNote = highestStrongTone(themeApexMidi + 3, reachCeil);
    if (moneyNote < 0) {
        moneyNote = highestStrongTone(themeApexMidi + 1, reachCeil); // apex near ceiling
    }
    if (moneyNote < 0) {
        moneyNote = themeApexMidi; // no strong tone fits above → apex keeps its pitch
    }

    // Register fold for the developed body line, decided ONCE so every body note
    // shifts together (contour intact). The developed theme apex is the line's
    // highest note (diatonic transposition is order-preserving); fold the line
    // down by whole octaves until that apex sits within the ceiling.
    const developedApex = diatonicTranspose(themeApexMidi, liftDegrees, keyRootPc, keyIsMinor);
    let bodyOctaveFold = 0;
    while (developedApex + bodyOctaveFold > 88) {
        bodyOctaveFold -= 12;
    }

    // Will a note actually SOUND at this absolute step? Mirrors the live emit
    // decision exactly (anchors and the apex always sound; an ornament passes the
    // same density gate). The duration-clamp below only ever calls this for steps
    // within the current arrangement loop — it stops at the loop boundary first,
    // where the gate seed/depth change — so `loopCount` is constant across every
    // call here and the prediction is exact. Used to clamp a note's duration to
    // the next note that sounds: a monophonic lead must not overrun its successor
    // (the legacy engine clamps durations the same way; without it, held seed
    // notes overlap the next note as development opens the line up).
    const emitsAt = (absStep: number): boolean => {
        const sInLoop = ((absStep % loopLen) + loopLen) % loopLen;
        let present = false;
        let anchorHere = false;
        let qaCadenceHere = false;
        let hookHere = false;
        // Match every seed note that lands on this step — INCLUDING pickups (whose
        // negative step maps via the modulo to a high stepInLoop near the loop end),
        // exactly as the live `here` filter does. Skipping them here falsely
        // reported silence at the form tail and let a held note overrun the pickup.
        for (const n of seed.notes as any[]) {
            if (((n.step % loopLen) + loopLen) % loopLen === sInLoop) {
                present = true;
                if (n.isAnchor) {
                    anchorHere = true;
                }
                if (n.qaRole === 'question' || n.qaRole === 'answer') {
                    qaCadenceHere = true;
                }
                if (n.hookRole) {
                    hookHere = true;
                }
            }
        }
        if (!present) {
            return false;
        }
        // #1009 — mirror the live gate's Q&A-cadence exemption EXACTLY, or the
        // duration-clamp lookahead would predict a cadence rests when the live emit
        // sounds it, and the preceding note would overrun the cadence (the slice-A
        // "live emit and lookahead see one gate" invariant).
        if (anchorHere || sInLoop === apexStepInLoop || qaCadenceHere || hookHere) {
            return true;
        }
        const g = scrambleHash(absStep * 7 + Math.max(loopCount, 0) * 131 + 17);
        return g <= activityAt(absStep);
    };

    // --- Breath via density gate ---
    // Anchors (the theme's structural skeleton) always sound — they ARE the
    // melody. The apex note is exempt too: the money note is the climax moment
    // and must never be gated out. Non-anchor ornament notes only fill in as the
    // arc opens up, so quiet passages stay spacious and energetic ones fill in.
    // The gate is a deterministic per-(step,loop) hash so loops stay reproducible.
    if (!isAnchor && !isApexStep && !isQaCadence && !isHook) {
        const gate = scrambleHash(step * 7 + Math.max(loopCount, 0) * 131 + 17);
        if (gate > activity) {
            phr.isResting = true; // @worker-mutation
            return null;
        }
    }
    // #1009 — Q&A cadences are exempt from the density gate (like anchors and the
    // apex): the question's hang and the answer's resolution are the structural
    // skeleton of the phrase, so they must sound even on the sparse early loops —
    // that is precisely what makes loops 0-1 "say something".

    // --- Pitch: develop the theme, then VOICE-LEAD through the changes (§5) ---
    // The keystone grammar: *where you land matters more than what you run.* Strong
    // beats are TARGETS — guide tones (the 3rd/7th that define the harmony); the
    // weak step before a target is APPROACH material that steps INTO it; and a
    // coming chord is anticipated across the change. So the body of the line
    // outlines the harmony and sounds like it's GOING somewhere, not running over
    // static chords. (The apex still owns its money note, below; idiom-specific
    // chromatic enclosures / bebop passing scales are a later slice — §8.)
    // `ts`/`stepsPerBeat`/`stepsPerBar` are hoisted above `activityAt` (#1020 seam
    // phrasing); reused here for the pitch grammar.
    const stepInBar = ((step % stepsPerBar) + stepsPerBar) % stepsPerBar;
    // Strong beats = the downbeat and the bar's midpoint (beat 3 in 4/4): the two
    // metrically strong points a phrase resolves onto.
    const midBeatStep = Math.floor(ts.beats / 2) * stepsPerBeat;
    const isStrongBeat = stepInBar === 0 || stepInBar === midBeatStep;
    // The next strong beat ahead (beat 3 this bar, else the next downbeat).
    const nextStrongStep =
        stepInBar < midBeatStep
            ? step + (midBeatStep - stepInBar)
            : step + (stepsPerBar - stepInBar);

    // The pitch a strong beat WILL land on — its developed contour note pulled onto
    // a guide tone (or the apex's money note) — so an approach can lead into it.
    // Re-derives the future note from the seed (a bounded one-point lookahead).
    const strongTargetAt = (absStep: number, chord: any): number | null => {
        const sIL = ((absStep % loopLen) + loopLen) % loopLen;
        if (sIL === apexStepInLoop) {
            return moneyNote;
        }
        // Use the note that OWNS that step — the same `ownerOfStep` selector the live
        // emit uses — so the predicted target matches what will actually sound. #1162:
        // this previously took the first note at the step while the live emit now
        // prefers a cadence, which would aim an approach 16th at a split fragment's
        // developed pitch while the beat sounded the cadence's pinned hang — a leading
        // tone resolving into a note that isn't there. Approximations still accepted
        // for this bounded lookahead: it ignores the density gate (may aim at a step
        // the gate rests) and re-develops at the CURRENT loop's depth (a next-bar
        // target across a loop seam will actually voice at the next depth). Both are
        // rare and only nudge an approach note by a scale step — harmless.
        const atStep: any[] = [];
        for (const n of seed.notes as any[]) {
            if (((n.step % loopLen) + loopLen) % loopLen === sIL) {
                atStep.push(n);
            }
        }
        const p = ownerOfStep(atStep);
        if (!p || !chord) {
            return null;
        }
        const dev = diatonicTranspose(p.midi, liftDegrees, keyRootPc, keyIsMinor) + bodyOctaveFold;
        const { guides, pillars } = chordTargetTones(chord.rootMidi, chord.quality);
        return landOnTarget(dev, guides, pillars);
    };

    let midi: number;
    if (isApexStep) {
        // The apex IS the form's one peak, so it lands the money note whenever it
        // sounds — the climax always resolves onto the curated strong tone. Driven
        // by the apex's identity (not the loop-count phase, which is decoupled from
        // its fixed form position — see above). Not chord-snapped: the held
        // tonic/5th over the changes is the idiomatic pedal climax (design §9).
        midi = moneyNote;
    } else {
        // Develop the theme (contour preserved, folded to register as one unit).
        midi = diatonicTranspose(primary.midi, liftDegrees, keyRootPc, keyIsMinor) + bodyOctaveFold;
        if (qaRole === 'answer') {
            // #1009 — the ANSWER re-lands at EVERY development depth. Its seed pitch is
            // a chord pillar, but diatonic development (`liftDegrees`) transposes it off
            // the chord on later loops; pull it back onto a pillar (root/3rd/5th) so the
            // consequent always resolves home, however far the loop has developed. This
            // is the "answers re-land" half of the asymmetry. At depth 0 (loops 0-1, the
            // story's target) `liftDegrees` is 0, so the seed pillar is already home and
            // this is a no-op — the resolution is audible from the very first phrase.
            const { pillars } = chordTargetTones(currentChord.rootMidi, currentChord.quality);
            if (pillars.length > 0) {
                midi = snapToNearestPc(midi, new Set(pillars));
            }
        } else if (qaRole === 'question') {
            // #1009 — the QUESTION hangs on its seed-pinned soft-color tone, PRESERVED
            // at every depth (register-folded only). The body `diatonicTranspose` above
            // snaps to the KEY scale, which would drift the chromatic hang onto a stable
            // tone and resolve the question we meant to leave open — so we override it
            // back to the pin. The question is thus a recurring structural hang (like
            // the apex is a recurring peak): the line develops AROUND it while it
            // anchors the antecedent. No `landOnTarget`/approach snap: tension is the
            // point. (A depth-varying "question roams wilder" is a later refinement; the
            // answer-re-lands half of the asymmetry is fully live below.)
            midi = primary.midi + bodyOctaveFold;
            // Apex dovetail (§9): if this is the last question before the window's
            // climax, aim the hang AT the money note (its lower diatonic neighbor) so
            // the coming apex answers THIS question — the biggest ask, resolved by the
            // peak.
            const stepsToApex =
                apexStepInLoop >= 0
                    ? (((apexStepInLoop - stepInLoop) % loopLen) + loopLen) % loopLen
                    : -1;
            if (moneyNote > 0 && stepsToApex > 0 && stepsToApex <= stepsPerBar * 2) {
                midi = diatonicNeighbor(moneyNote, -1, keyRootPc, keyIsMinor);
            }
        } else if (isHook) {
            // #1056 — the hook is a seed-pinned, chord-rooted riff; preserve it VERBATIM
            // (register-folded only), like the Q&A question hang. The body diatonicTranspose
            // above snaps to the KEY scale, which would alter the hook's chord-rooted tones
            // (e.g. a maj-3rd over V) and break the recurring shape; the isStrongBeat branch
            // below would re-snap it to a guide tone. Skip both — the seeder already placed
            // the identifiable figure, so the ear grabs the SAME cell each block.
            midi = primary.midi + bodyOctaveFold;
        } else if (isStrongBeat) {
            // LAND: pull a non-chord-tone strong beat onto a guide tone of the
            // current chord (nearest functional tone if no guide is in reach);
            // a note already on a chord tone is left as the melody states it.
            const { guides, pillars } = chordTargetTones(
                currentChord.rootMidi,
                currentChord.quality,
            );
            midi = landOnTarget(midi, guides, pillars);
        } else if (nextStrongStep - step <= Math.max(1, Math.floor(stepsPerBeat / 2))) {
            // APPROACH: within the last eighth before a strong beat (the pickup 16th
            // or the "and") step diatonically INTO that target — a leading tone that
            // resolves onto the landing. Anticipation across a chord change is exact
            // only at distance 1, where `nextChord` (the adjacent-step chord) IS the
            // beat's chord; from the "and" two steps out the per-tick engine can't
            // see a change landing on the beat, so it leads into the current chord —
            // a bounded-lookahead approximation (the §4.4 phrase-span target layer
            // would close it) that's rare and at most a scale-step off, never a leap.
            const beatIsNextStep = nextStrongStep === step + 1;
            const chordThere =
                beatIsNextStep && chordChanged(currentChord, nextChord) ? nextChord : currentChord;
            const target = strongTargetAt(nextStrongStep, chordThere);
            if (target != null) {
                // Place the approach a true scale step from the target, on the side
                // the contour comes from, so it resolves into the target by step.
                // `diatonicNeighbor` (not `diatonicShift`) so a CHROMATIC target —
                // every dominant ♭7 — gets its real leading tone, not a third-leap.
                const below = diatonicNeighbor(target, -1, keyRootPc, keyIsMinor);
                const above = diatonicNeighbor(target, 1, keyRootPc, keyIsMinor);
                midi = Math.abs(below - midi) <= Math.abs(above - midi) ? below : above;
            }
        }
    }

    // #1009 — keep a pinned Q&A cadence inside the soloist register. The overrides
    // above bypass the body octave fold, and the answer's `snapToNearestPc` can land
    // a pillar below the slotting floor; lift by octaves to ≥ 52 (the high end is
    // already bounded by the body fold / the ≤ 88 apex ceiling).
    if (isQaCadence) {
        while (midi < 52) {
            midi += 12;
        }
    }
    // #1056 — the hook is preserved verbatim (bypasses the body fold), so bound it to the
    // register contract [52, 88] by octaves here — an octave shift keeps the interval
    // shape intact, so the recurring figure survives the clamp.
    if (isHook) {
        while (midi < 52) {
            midi += 12;
        }
        while (midi > 88) {
            midi -= 12;
        }
    }

    // --- Dynamics follow the arc: softer when sparse, fuller toward the peak ---
    // The money note also hits harder as it's reached — the climax has weight.
    const apexBoost = isApexStep ? 0.12 : 0; // the climax peak carries weight
    // #1004: the lead DIGS IN with the band. Velocity already tracks `activity`
    // (0.7 + 0.3·activity), so it indirectly rides bandIntensity through the gate —
    // but on saturated late loops `activity` pins at 1.0 exactly when a build
    // happens, flattening that dependence right when the lead should hit hardest.
    // A direct, final-stage weight (added after the activity multiply, like
    // apexBoost) keeps the "dig in" audible when activity is maxed. Same 0.6 center
    // (neutral at mid-session energy); gentler gain 0.2 — asymmetric around center,
    // +0.08 at the climax down to −0.12 in the intro — a weight shift you feel, not
    // a dynamic cliff.
    const bandVel = (bandEnergy - 0.6) * 0.2;
    // #1020: the seam gesture shapes WEIGHT too — ease off into the rest before a
    // change, then hit harder entering a lift. These are the velocity partners of
    // the `seamActivityAt` density terms (which handle note COUNT); on a rise
    // density saturates, so this bump carries most of the audible "enter big".
    // Final-stage, like `bandVel`/`apexBoost`. Same gates (and same loop-relative
    // wrap of `step`, #923) as the density seam above.
    const stepInForm = totalSteps > 0 ? ((step % totalSteps) + totalSteps) % totalSteps : step;
    const inSeamBar =
        multiSection &&
        secEnd > stepInForm &&
        Math.floor((secEnd - 1 - stepInForm) / stepsPerBar) === 0;
    const inEntryBar =
        enteredOnRise &&
        stepInForm >= secStart &&
        Math.floor((stepInForm - secStart) / stepsPerBar) === 0;
    const seamVel = (inSeamBar ? -0.05 : 0) + (inEntryBar ? 0.07 : 0);

    // #1006 — WITHIN-PHRASE velocity envelope (design §4.6). Every term above moves
    // SLOWLY (the arc/band/seam lifts shift across a whole form pass, apexBoost is one
    // note) so note-to-note the line landed at a near-constant weight — the last place
    // the lead sounded quantized. A player instead LEANS INTO the strong beats and the
    // apex and RELAXES on the note right after (the release). This is a distance-to-
    // target shaping term applied FINAL-STAGE — a `velocity *= envelope` AFTER every
    // additive term — per the final-stage-multiplier rule (folded into an earlier
    // factor it washes out against the activity/arc/apex biases all pushing at once).
    // Genre-neutral first pass: no per-genre contour tables yet (§4.6 leaves those for
    // a later slice). `nextStrongStep`/`isStrongBeat`/`apexStepInLoop`/`stepInLoop` are
    // all already loop-relative, so no #923 wrap is needed here.
    // KNOWN LIMITATION (#1006): the envelope is multiplicative-then-clamped, so when
    // the additive base already sits near 1.0 (late loops / high band energy) the swell
    // terms clamp and only the release dip stays audible — the "lean in" fades exactly
    // when the band is loudest. Acceptable for a genre-neutral first pass; a bipolar
    // shape around a slightly-lowered center (reserving pre-clamp headroom) is a later slice.
    let velocityEnvelope = 1.0;
    if (SOLOIST_VELOCITY_ENVELOPE.enabled) {
        // The last eighth before a beat is the "pickup" window that swells into it.
        const approachWindow = Math.max(1, Math.floor(stepsPerBeat / 2));
        if (isApexStep) {
            velocityEnvelope = 1.15; // why: the money note is the phrase's dynamic crest
        } else if (isStrongBeat) {
            velocityEnvelope = 1.06; // why: metric accent — lean into the downbeat / bar midpoint
        } else {
            const toStrong = nextStrongStep - step; // ≥1 for any non-strong step
            const lastStrongInBar = stepInBar >= midBeatStep ? midBeatStep : 0;
            const sinceStrong = stepInBar - lastStrongInBar;
            if (toStrong <= approachWindow) {
                // why: swell across the pickup INTO the beat — louder the closer it is
                // (an eighth out ≈ +1%, the 16th right before the beat ≈ +6%).
                const closeness = 1 - (toStrong - 1) / approachWindow; // 0..1
                velocityEnvelope = 1.0 + 0.06 * closeness;
            } else if (sinceStrong >= 1 && sinceStrong <= approachWindow) {
                // why: release — the note just after a strong beat eases off, deepest
                // right after the beat (−9%) and recovering toward neutral.
                const recovery = (sinceStrong - 1) / approachWindow; // 0..1
                velocityEnvelope = 0.91 + 0.08 * recovery;
            }
        }
        // why: swell as the line CLIMBS to the apex within its own loop window — the
        // approach bar leans in so the money note is ARRIVED at, not stumbled onto.
        // Compounds gently with the metric term. Only when climbing from below.
        const toApex = apexStepInLoop - stepInLoop;
        if (!isApexStep && toApex > 0 && toApex <= stepsPerBar) {
            velocityEnvelope *= 1.0 + 0.05 * (1 - (toApex - 1) / stepsPerBar);
        }
    }

    const velocity = clamp01(
        ((primary.velocity ?? 0.8) * (0.7 + 0.3 * activity) + apexBoost + bandVel + seamVel) *
            velocityEnvelope,
    );

    // --- Clamp duration to the next note that sounds (monophonic lead) ---
    // The lead is one voice: a note must release before the next one speaks.
    // Scan forward only as far as this note would ring; the first sounding note
    // caps the duration. Nothing sounding within the span → keep it full, so a
    // held note still sustains across rests (sustain preserved, overlap removed).
    let durationSteps = primary.durationSteps ?? 2;
    const span = Math.ceil(durationSteps);
    for (let d = 1; d <= span; d++) {
        // Never sustain across an arrangement-loop boundary: the gate seed and
        // development depth change there, so the lookahead can't see the next
        // loop's emit decision — clamp conservatively so a held note can't overrun
        // a note in the next loop (removes the loop-seam overlap edge).
        if (Math.floor((step + d) / totalSteps) !== Math.floor(step / totalSteps)) {
            durationSteps = Math.min(durationSteps, d);
            break;
        }
        if (emitsAt(step + d)) {
            durationSteps = Math.min(durationSteps, d);
            break;
        }
    }

    // --- Expression: a lyrical FLURRY around each signature peak (design §10) ---
    // A player doesn't decorate one isolated note — they get lyrical in BURSTS: a
    // little cluster of bends/vibrato around an expressive moment, then breathing
    // room before the next. So expression clusters into a FLURRY ZONE around each
    // cycle's money note (~¾ bar each side) and the long stretch between peaks
    // stays clean — flurries with space between, the space guaranteed by the
    // ~12-bar peak spacing.
    //   • The apex itself: the big whole-step reach UP into the money note (a
    //     negative `bendStartInterval` starts below and glides up over ≤0.1s,
    //     synth-soloist.ts `scheduleSoloistBend`).
    //   • Other notes in the zone: a lighter half-step scoop on ~half of them —
    //     gated by a per-note hash so the cluster sounds lyrical (bends in rapid
    //     succession), not a uniform mechanical trill.
    //   • Vibrato: any SUSTAINED note in the zone sings (its clamped duration is
    //     at least a beat) — so multiple vibrato events cluster at the peak, while
    //     quick notes and the whole line between peaks stay clean. Gated on the
    //     post-clamp `durationSteps` so a note shortened to fit its successor never
    //     gets a vibrato it has no room to voice.
    const EXPRESSIVE_RADIUS = 12; // steps each side of the peak (~¾ bar) = flurry zone
    const inFlurry = Math.abs(stepInLoop - apexStepInLoop) <= EXPRESSIVE_RADIUS;
    // `style` arrives raw (often 'smart'); resolve to the genre profile once — the
    // same resolution the seeder does — and reuse it for every genre-gated device
    // below (cry, country grace-slide, country chicken-pick) or those gates would
    // never fire in production.
    const resolvedStyle = resolveSoloistStyle(style, state.groove?.genreFeel);
    let bendStartInterval = 0;
    if (isApexStep) {
        bendStartInterval = -2; // whole-step reach UP into the money note
    } else if (inFlurry) {
        // ~most flurry notes get a lighter scoop — varied per (step, loop) so
        // the cluster reads as lyrical phrasing, not every note bent identically.
        // #859: raised 0.5 → 0.6 — pros lean into the scoop more than "half"; a
        // denser flurry sounds lusher without turning into a mechanical trill (the
        // flurry zone itself is still the rare-and-spaced restraint mechanism, §10).
        if (scrambleHash(step * 13 + Math.max(loopCount, 0) * 7 + 3) < 0.6) {
            bendStartInterval = -1; // half-step scoop up
        }
    }
    // #859: a genuinely LONG held note (≥2 beats) sings with vibrato even OUTSIDE
    // the flurry zone — a player vibratos any real sustain, not only near the peak.
    // Kept to long notes so it stays a sustain gesture, not a per-note tic. Excluded
    // for blues/rock outside the flurry: there the held-note expression is the "cry"
    // (bend-and-release) below, which owns those sustains — adding vibrato would
    // cannibalize it. Inside the flurry, ALL genres already vibrato ≥1-beat notes.
    const cryGenre = resolvedStyle === 'blues' || resolvedStyle === 'rock';
    const vibrato =
        (inFlurry && durationSteps >= ts.stepsPerBeat) ||
        (!inFlurry && !cryGenre && durationSteps >= 2 * ts.stepsPerBeat);

    // --- Country "grace slide": a quick down-slide grace into the note (#870) ---
    // The legacy `graceSlide` device — a country/pedal-steel finger-slide where the
    // note is approached from a semitone ABOVE and slides down into pitch (positive
    // `bendStartInterval` starts above and glides down, synth-soloist `startFreq`).
    // It's the lyrical complement to the apex's up-reach, so country gets BOTH
    // gestures. Kept sparse and STRUCTURAL per the §10 restraint lesson (devices
    // punctuate, they don't tic): country only, never on the apex/flurry notes
    // (those own their scoop), only on a note with no bend of its own — and only
    // when the note is a CHORD TONE, so the slide reads as an approach-to-resolution
    // (you slide down INTO a harmony note, the country arrival idiom) rather than a
    // random per-note dapple. A per-(step,loop) hash keeps it sparse within that set.
    const graceIsChordTone = (currentChord.intervals ?? []).some(
        (iv: number) => ((iv % 12) + 12) % 12 === (((midi - currentChord.rootMidi) % 12) + 12) % 12,
    );
    if (
        resolvedStyle === 'country' &&
        !isApexStep &&
        !inFlurry &&
        // #1056 — the hook stays crisp: a grace slide on every chord-tone hook note (the
        // hook IS chord tones) smears the identifiable figure and stacks Country's expr
        // rate against the §10 <30% guard. The hook owns its clean statement.
        !isHook &&
        bendStartInterval === 0 &&
        graceIsChordTone &&
        // sparse within the chord-tone-arrival set — a player's lyrical lean into the
        // landing note, not a slide on every arrival (cf. the cry's restraint, #869).
        // #859: 0.1 → 0.13 (modest — country stacks the slide onto its expr rate,
        // the tightest lane against the §10 <30% guard).
        scrambleHash(step * 29 + Math.max(loopCount, 0) * 17 + 4) < 0.13
    ) {
        bendStartInterval = 1; // half-step grace slide DOWN into the note
    }

    // --- Expressive "cry": bend-and-release on a sustained note (#869) ---
    // The complement to the entry-scoop (`bendStartInterval`): where the scoop
    // bends UP INTO a note at onset, the cry lets a SUSTAINED note speak, then
    // bends it UP to a chord tone mid-ring and releases back — the vocal "cry" of
    // a blues/rock lead (B.B. King). Kept rare and structural per the §10 restraint
    // lesson (phrase-first sounds great BECAUSE it's sparse; devices punctuate,
    // they don't tic):
    //   • blues / rock only — the vocal string-bend idioms (country has its own
    //     bend, #870; jazz/bossa/funk don't cry; metal leans on runs over the cry);
    //   • on a SUSTAINED note (≥ 1.5 beats) — the held phrase-ender a player leans
    //     into and cries. Sustain, not downbeat, is the right structural signal:
    //     phrase-first lands strong beats on short guide tones and saves the long
    //     rings for phrase ends (often off the beat) — that held note IS the cry's
    //     home. The big apex reach owns its own expression, so exclude the apex and
    //     its flurry (those notes already vibrato/scoop) — the cry lives in the
    //     long stretches BETWEEN peaks, spreading expression across the form.
    //   • only when the note has no entry scoop of its own (the cry owns the lead).
    //   • targeting a real chord tone 1–2 semitones above (the b7→root whole-step
    //     or a ½-step blue bend), so the cry always resolves to harmony — which
    //     also makes it naturally selective;
    //   • sparse, gated by a per-(step,loop) hash so it punctuates rather than tics.
    // Coexists with the double-stop punctuation below by design — the legacy rule is
    // "the cry belongs to the lead voice": the harmony holds while the lead bends.
    let expression: SoloistExpression | undefined;
    // cryGenre computed above (shared with the vibrato gate) — blues/rock only.
    // ≥ 1.25 beats — a held note with room to bend up and release. Deliberately
    // NOT down at 1 beat: the duration histogram cliffs there (quarter notes
    // dominate the line), so including them would spray the cry into a constant
    // warble instead of a lean-into-the-note gesture.
    const cryRings = durationSteps >= Math.ceil(1.25 * stepsPerBeat);
    if (
        cryGenre &&
        cryRings &&
        !isApexStep &&
        !inFlurry &&
        !vibrato &&
        // #1009 — a Q&A cadence owns its pitch: the answer resolves cleanly (a cry on
        // the deliberate landing works against the "sparing" restraint), and a cry on
        // the QUESTION would bend its non-chord hang UP to a chord tone — resolving the
        // very tension the question exists to leave open. Both stay cry-exempt.
        !isQaCadence &&
        // #1056 — the hook owns its clean statement (like the Q&A cadence); a cry would
        // bend the pinned figure and blur its recurring shape.
        !isHook &&
        bendStartInterval === 0 &&
        // Most eligible held notes cry (a blues player leans into them); the hash
        // keeps a little variation so it doesn't read as mechanically every-note.
        // #859: 0.85 → 0.9 — leaning a touch further into the blues cry (already the
        // most-loved device per the #857 audition); the eligibility gate (sustained,
        // between-peaks, no scoop) still keeps it a punctuation, not a warble.
        scrambleHash(step * 19 + Math.max(loopCount, 0) * 11 + 5) < 0.9
    ) {
        // Nearest chord tone (guide or pillar) 1–2 semitones above the written
        // note is the bend's destination; prefer the closer (½-step blue bend over
        // the whole-step) so the cry resolves tightly. No tone within reach → no
        // cry (keeps it grounded and sparse rather than forcing a bend to nowhere).
        const { guides, pillars } = chordTargetTones(currentChord.rootMidi, currentChord.quality);
        const targets = new Set([...guides, ...pillars]);
        let peakSemitones = 0;
        for (const up of [1, 2]) {
            if (targets.has((midi + up) % 12)) {
                peakSemitones = up;
                break;
            }
        }
        if (peakSemitones > 0) {
            // A bend's POINT is its destination: real players bend UP to the target
            // chord tone and HOLD it — the bent note IS the resolution ("it's the
            // destination note that grabs the ear"). Bend-and-release (returning to
            // the pre-bend pitch) is a specific flutter effect, NOT the default;
            // releasing de-emphasizes the target just reached and lands on the
            // weaker starting note — the "up-and-down" that reads as unnatural
            // phrasing (#960, heard on Blues). So HOLD by default (omit releaseFrac
            // → the synth + sampled voice sustain the peak, and .mid export holds
            // the bend to the note's end), and keep the release as a MINORITY
            // (~25%, its own sparse per-(step,loop) hash) for the occasional
            // expressive flutter. The note speaks first (onset 0.35), then bends up
            // to the tone (peak 0.62) and stays.
            const flutter = scrambleHash(step * 31 + Math.max(loopCount, 0) * 23 + 6) < 0.25;
            expression = {
                bend: flutter
                    ? // Flutter: speak, bend up, then release back down — needs room
                      // for the return trip, so it peaks later (0.62) and releases at 0.85.
                      { peakSemitones, onsetFrac: 0.35, peakFrac: 0.62, releaseFrac: 0.85 }
                    : // Hold: the destination IS the point, so arrive a touch sooner
                      // (0.5) and sustain the bent target for the note's back half.
                      { peakSemitones, onsetFrac: 0.35, peakFrac: 0.5 },
            };
        }
    }

    phr.isResting = false; // @worker-mutation
    // #1005/#1025: the soloist joins the single band-wide pocket — the same per-genre
    // band lean (getBandPocket) every other melodic lane (bass/comp/harmony) sums, so
    // the lead locks to the rhythm section instead of floating on its own
    // straightened-swing time (see docs/design/timing-model.md, tier 2). It layers on
    // top of any seed-authored per-note micro-offset (primary.timingOffset).
    // #1064: the current section's label keys the energy modulation of the lean.
    const bandPocket = getBandPocket(state.groove?.genreFeel, currentChord?.sectionLabel ?? null);
    const lead = {
        midi,
        velocity,
        durationSteps,
        timingOffset: (primary.timingOffset ?? 0) + bandPocket,
        bendStartInterval,
        vibrato,
        expression,
        isDoubleStop: false,
    };

    // --- Country "bend" double-stop: the oblique pedal-steel bend (#870) ---
    // The signature country/pedal-steel move (Roy Nichols, Brent Mason, Albert Lee):
    // on a SUSTAINED landing note, a chord-tone 3rd ABOVE the held lead BENDS UP into
    // pitch (from a semitone below) while the lead rings underneath — the crying
    // oblique bend, one voice held and the other bending to meet the harmony.
    //
    // It lives in the SAME structural home as the blues/rock "cry" above: the long,
    // held phrase-ENDERS (not the short apex/strong-beat accents — phrase-first lands
    // strong beats on short guide tones and saves the long rings for phrase ends). The
    // cry is blues/rock only and explicitly leaves country's sustained notes open
    // ("country has its own bend, #870"); this IS that bend, as a double-stop rather
    // than a single-voice cry. The chicken-pick snap below owns country's short
    // punctuation notes, so the two barely overlap — and where they could, this block
    // runs first and RETURNS, so the snap behavior stays unchanged.
    //
    // The bend sits on the HARMONY voice (bendStartInterval -1 = start a semitone
    // below, glide UP into pitch — the sign convention the grace-slide comment above
    // documents), so the lead keeps its own melody/rhythm and the double-stop still
    // lands a clean 3rd above: countryBend and the chicken-pick are BOTH 3rd-snaps
    // (dsThirdShare stays 1), and it's the bend + the full-duration ring that tell
    // them apart. §10 restraint (country is the tightest expr lane): gated to a
    // sustained (≥1.25-beat), between-peaks chord tone via its own per-(step,loop)
    // hash, and only when the lead carries no bend of its own (bendStartInterval 0 —
    // no grace-slide to fight).
    if (allowsSoloistPolyphony(soloist.mode) && resolvedStyle === 'country') {
        const pc = (((midi - currentChord.rootMidi) % 12) + 12) % 12;
        const isChordTone = (currentChord.intervals ?? []).some(
            (iv: number) => ((iv % 12) + 12) % 12 === pc,
        );
        // ≥ 1.25 beats — a held phrase-ender with room to bend up INTO and sustain,
        // the same sustain floor the cry uses. Excludes the apex/flurry (those own
        // their own reach/scoop), matching the cry's between-peaks placement.
        const cbRings = durationSteps >= Math.ceil(1.25 * stepsPerBeat);
        if (
            !isApexStep &&
            !inFlurry &&
            isChordTone &&
            cbRings &&
            bendStartInterval === 0 &&
            // Sparse — a lyrical landing gesture on a subset of the held chord-tone
            // enders. Its own hash stream (tag 10) stays independent of the chicken-
            // pick's (tag 7) and the cry's (tag 5/6).
            scrambleHash(step * 37 + Math.max(loopCount, 0) * 19 + 10) < 0.5
        ) {
            const thirdInt = consonantDoubleStopInterval(midi, [4, 3], currentChord);
            if (thirdInt > 0) {
                // Unlike the cry, we deliberately DON'T gate `!vibrato`: the cry bends
                // the lead itself, so vibrato would cannibalize it — but here the bend
                // is on the HARMONY voice, so a vibrato'd held lead (≥2-beat country
                // notes get vibrato) beneath the up-bending 3rd composes rather than
                // competes (a lovely pedal-steel-under-vibrato sound), not a conflict.
                // Harmony first, lead last (tick-logic reads lastFreq from the lead).
                // The 3rd-above harmony bends UP into pitch (-1) and RINGS the full
                // note with the lead — the sustained oblique bend, vs the chicken-
                // pick's short popped 3rd.
                return [
                    {
                        midi: midi + thirdInt,
                        velocity: Math.min(1, velocity * 1.1),
                        durationSteps,
                        timingOffset: lead.timingOffset,
                        bendStartInterval: -1,
                        vibrato: false,
                        isDoubleStop: true,
                    },
                    lead,
                ];
            }
        }
    }

    // --- Country "chicken-pick": the 3rd-above snap double-stop (#870) ---
    // The defining country lead idiom (Brent Mason / Albert Lee): a bright, snappy
    // double-stop where a chord-aware 3rd ABOVE the lead is plucked with it — the
    // "chicken-pickin'" pop. Distinct from the generic guitar double-stop below
    // (which prefers a 6th BELOW the lead): here the harmony sits a 3rd above, the
    // accent is sharper, and the snap doesn't need a long ring. Country takes this
    // path instead of the generic 6th. Gated to phrase-first's structural accents
    // (apex money note / strong-beat phrase anchor) and chord tones, sparse per the
    // §10 restraint lesson so it punctuates rather than machine-guns every note.
    // `consonantDoubleStopInterval([4,3])` is the same chord-aware scorer the legacy
    // chickenPick used — major-3rd first, minor-3rd when the chord asks for it.
    if (allowsSoloistPolyphony(soloist.mode) && resolvedStyle === 'country') {
        const pc = (((midi - currentChord.rootMidi) % 12) + 12) % 12;
        const isChordTone = (currentChord.intervals ?? []).some(
            (iv: number) => ((iv % 12) + 12) % 12 === pc,
        );
        const isPunctuation = isApexStep || (isAnchor && isStrongBeat);
        if (
            isPunctuation &&
            isChordTone &&
            // #859: 0.55 → 0.68 — the chicken-pick snap is a signature country lead
            // sound; a bit more of it on the (already-rare) punctuation notes reads
            // as idiomatic, not busy (still gated to apex / strong-beat anchors).
            scrambleHash(step * 23 + Math.max(loopCount, 0) * 13 + 7) < 0.68
        ) {
            // 3rd above, chord-aware (chord tone preferred so the snap rings clean).
            const thirdInt = consonantDoubleStopInterval(midi, [4, 3], currentChord);
            if (thirdInt > 0) {
                // Harmony first, lead last — tick-logic reads lastFreq from the
                // non-double-stop voice (the lead). The 3rd snaps a touch brighter
                // than the lead, the country "pop"; both keep the lead's own bend.
                // The snap is PERCUSSIVE — chicken-pickin' is a short popped attack,
                // not a sustained 3rd (the legacy device hard-set durationSteps:1).
                // Phrase-first owns the lead's rhythm, so we shorten only the harmony
                // POP (≤ half a beat) and let the lead ring as the phrase decided —
                // the snapped 3rd over a singing lead, the right hybrid-picking sound.
                const popSteps = Math.max(1, Math.min(durationSteps, Math.floor(stepsPerBeat / 2)));
                return [
                    {
                        midi: midi + thirdInt,
                        velocity: Math.min(1, velocity * 1.05),
                        durationSteps: popSteps,
                        timingOffset: lead.timingOffset,
                        bendStartInterval: 0,
                        vibrato: false,
                        isDoubleStop: true,
                    },
                    lead,
                ];
            }
        }
    }

    // --- Guitar-mode double-stop PUNCTUATION (#856) ---
    // Phrase-first is melody-first, so a double-stop is an ACCENT, not a texture
    // (legacy `getSoloistNote` made them a frequent device; here they're sparse).
    // Add a harmony voice only on a structural punctuation note — the apex money
    // note, or a phrase-landing anchor on a strong beat — and only when the lead
    // is a chord tone (so the harmony lands cleanly) and the note rings (≥ a
    // beat). The harmony holds while the lead keeps its own bend/vibrato (matches
    // the legacy "the cry belongs to the lead voice" rule). Gated guitar-mode
    // only, sparse by a per-(step,loop) hash. The voice itself is chord-aware
    // (`guitarDoubleStopVoice` → the same scorer the legacy path uses). Country is
    // handled above by its own 3rd-above chicken-pick — it never falls to the 6th.
    if (allowsSoloistPolyphony(soloist.mode) && resolvedStyle !== 'country') {
        const pc = (((midi - currentChord.rootMidi) % 12) + 12) % 12;
        const isChordTone = (currentChord.intervals ?? []).some(
            (iv: number) => ((iv % 12) + 12) % 12 === pc,
        );
        const isPunctuation = isApexStep || (isAnchor && isStrongBeat);
        if (
            isPunctuation &&
            isChordTone &&
            durationSteps >= stepsPerBeat &&
            // #859: 0.6 → 0.72 — more of the structural punctuation notes get the
            // harmony 6th. Still an ACCENT (gated to apex / strong-beat anchors on
            // ringing chord tones), just a fuller one, closer to how a guitarist
            // reaches for double-stops on the landing notes of a phrase.
            scrambleHash(step * 17 + Math.max(loopCount, 0) * 5 + 9) < 0.72
        ) {
            const harmonyMidi = guitarDoubleStopVoice(currentChord, midi, style);
            // #1056 — skip the double-stop if its harmony voice would fall under the
            // slotting floor. The lead is clamped to ≥52 above, but the added voice (a 6th
            // below) is not; a low-register hook lead can push it under. Only the rare
            // sub-floor case is skipped, so the double-stop feature is otherwise intact.
            if (harmonyMidi !== null && harmonyMidi >= 52) {
                // Harmony first, lead last — tick-logic updates lastFreq from the
                // non-double-stop voice (the lead), matching the legacy ordering.
                return [
                    {
                        midi: harmonyMidi,
                        velocity: velocity * 0.9,
                        durationSteps,
                        timingOffset: lead.timingOffset,
                        bendStartInterval: 0,
                        vibrato: false,
                        isDoubleStop: true,
                    },
                    lead,
                ];
            }
        }
    }

    return lead;
}
