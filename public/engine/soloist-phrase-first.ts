import { TIME_SIGNATURES } from '../config.js';
import type { EnsembleState, Mutable, SoloistExpression } from '../types.js';
import { scrambleHash } from './hash-utils.js';
import { resolveSoloistStyle } from './soloist-config.js';
import { guitarDoubleStopVoice } from './soloist-devices.js';
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

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

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
    _coordination: any = {},
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
    // could otherwise hand us a lower voice); elsewhere the first note is fine.
    const primary = isApexStep
        ? here.reduce((hi: any, n: any) => (n.midi > hi.midi ? n : hi), here[0])
        : here[0];
    const isAnchor = here.some((n: any) => n?.isAnchor);

    // --- Dramatic arc → how active the lead is right now (0..1) ---
    // Two deliberately simple contributions (tuned by ear in later builds):
    //   • entrance: the lead enters sparse and opens up over the first few
    //     loops, the way a player eases into a tune rather than charging in.
    //   • within-form swell: a gentle rise toward the middle of each form pass
    //     and a settle at its edges, so every pass breathes as an arc.
    const loopCount = playback.currentLoopCount ?? -1;
    const loopLift = Math.min(Math.max(loopCount, 0), 4) * 0.14; // builds over ~4 loops
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
    // Activity (0..1) at any absolute step: a 0.30 floor (keeps the theme's bones
    // audible) + the tempo/intensity/entrance lifts + the within-form swell (the
    // only per-step term — peaks mid-form, settles at the edges). One definition
    // so the duration-clamp lookahead below sees the SAME gate as the live emit.
    const activityAt = (st: number): number => {
        const ap =
            totalSteps > 0 ? (((st % totalSteps) + totalSteps) % totalSteps) / totalSteps : 0;
        return clamp01(0.3 + tempoFill + intensityLift + loopLift + 0.25 * Math.sin(Math.PI * ap));
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
            }
        }
        if (!present) {
            return false;
        }
        if (anchorHere || sInLoop === apexStepInLoop) {
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
    if (!isAnchor && !isApexStep) {
        const gate = scrambleHash(step * 7 + Math.max(loopCount, 0) * 131 + 17);
        if (gate > activity) {
            phr.isResting = true; // @worker-mutation
            return null;
        }
    }

    // --- Pitch: develop the theme, then VOICE-LEAD through the changes (§5) ---
    // The keystone grammar: *where you land matters more than what you run.* Strong
    // beats are TARGETS — guide tones (the 3rd/7th that define the harmony); the
    // weak step before a target is APPROACH material that steps INTO it; and a
    // coming chord is anticipated across the change. So the body of the line
    // outlines the harmony and sounds like it's GOING somewhere, not running over
    // static chords. (The apex still owns its money note, below; idiom-specific
    // chromatic enclosures / bebop passing scales are a later slice — §8.)
    const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepsPerBeat = ts.stepsPerBeat;
    const stepsPerBar = ts.beats * stepsPerBeat;
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
        // Use the FIRST seed note at that step — mirrors the live non-apex emit
        // (`primary = here[0]`), so the predicted target matches what will sound
        // (they'd diverge only on a double-stop). Approximations accepted for this
        // bounded lookahead: it ignores the density gate (may aim at a step the
        // gate rests) and re-develops at the CURRENT loop's depth (a next-bar
        // target across a loop seam will actually voice at the next depth). Both
        // are rare and only nudge an approach note by a scale step — harmless.
        let p: any = null;
        for (const n of seed.notes as any[]) {
            if (((n.step % loopLen) + loopLen) % loopLen === sIL) {
                p = n;
                break;
            }
        }
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
        if (isStrongBeat) {
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

    // --- Dynamics follow the arc: softer when sparse, fuller toward the peak ---
    // The money note also hits harder as it's reached — the climax has weight.
    const apexBoost = isApexStep ? 0.12 : 0; // the climax peak carries weight
    const velocity = clamp01((primary.velocity ?? 0.8) * (0.7 + 0.3 * activity) + apexBoost);

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
    let bendStartInterval = 0;
    if (isApexStep) {
        bendStartInterval = -2; // whole-step reach UP into the money note
    } else if (inFlurry) {
        // ~half the flurry notes get a lighter scoop — varied per (step, loop) so
        // the cluster reads as lyrical phrasing, not every note bent identically.
        if (scrambleHash(step * 13 + Math.max(loopCount, 0) * 7 + 3) < 0.5) {
            bendStartInterval = -1; // half-step scoop up
        }
    }
    const vibrato = inFlurry && durationSteps >= ts.stepsPerBeat;

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
    // `style` arrives raw (often 'smart'); resolve to the genre profile first — the
    // same resolution the seeder does — or the gate would never fire in production.
    let expression: SoloistExpression | undefined;
    const cryStyle = resolveSoloistStyle(style, state.groove?.genreFeel);
    const cryGenre = cryStyle === 'blues' || cryStyle === 'rock';
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
        bendStartInterval === 0 &&
        // Most eligible held notes cry (a blues player leans into them); the hash
        // keeps a little variation so it doesn't read as mechanically every-note.
        scrambleHash(step * 19 + Math.max(loopCount, 0) * 11 + 5) < 0.85
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
            // Let the note speak first, cry up to the tone, then release back down
            // before it ends — the vocal arc, not a static detune.
            expression = {
                bend: { peakSemitones, onsetFrac: 0.35, peakFrac: 0.62, releaseFrac: 0.85 },
            };
        }
    }

    phr.isResting = false; // @worker-mutation
    const lead = {
        midi,
        velocity,
        durationSteps,
        timingOffset: primary.timingOffset ?? 0,
        bendStartInterval,
        vibrato,
        expression,
        isDoubleStop: false,
    };

    // --- Guitar-mode double-stop PUNCTUATION (#856) ---
    // Phrase-first is melody-first, so a double-stop is an ACCENT, not a texture
    // (legacy `getSoloistNote` made them a frequent device; here they're sparse).
    // Add a harmony voice only on a structural punctuation note — the apex money
    // note, or a phrase-landing anchor on a strong beat — and only when the lead
    // is a chord tone (so the harmony lands cleanly) and the note rings (≥ a
    // beat). The harmony holds while the lead keeps its own bend/vibrato (matches
    // the legacy "the cry belongs to the lead voice" rule). Gated guitar-mode
    // only, sparse by a per-(step,loop) hash. The voice itself is chord-aware
    // (`guitarDoubleStopVoice` → the same scorer the legacy path uses).
    if (allowsSoloistPolyphony(soloist.mode)) {
        const pc = (((midi - currentChord.rootMidi) % 12) + 12) % 12;
        const isChordTone = (currentChord.intervals ?? []).some(
            (iv: number) => ((iv % 12) + 12) % 12 === pc,
        );
        const isPunctuation = isApexStep || (isAnchor && isStrongBeat);
        if (
            isPunctuation &&
            isChordTone &&
            durationSteps >= stepsPerBeat &&
            scrambleHash(step * 17 + Math.max(loopCount, 0) * 5 + 9) < 0.6
        ) {
            const harmonyMidi = guitarDoubleStopVoice(currentChord, midi, style);
            if (harmonyMidi !== null) {
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
