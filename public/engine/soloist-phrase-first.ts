import type { EnsembleState, Mutable } from '../types.js';
import { scrambleHash } from './hash-utils.js';
import { getSoloistNote } from './soloist.js';

/**
 * Phrase-first soloist engine — Slice 1 of the soloist re-architecture
 * (docs/design/soloist-phrase-first.md).
 *
 * Runs as a PARALLEL path to the legacy `getSoloistNote`, selected per-tick in
 * `tick-logic.ts` by the user-facing `soloist.phraseFirstSoloist` flag
 * (Settings → Performance Engine). Keeping it parallel means the legacy engine
 * stays the default and `main` remains shippable while this is built up
 * incrementally and auditioned by ear, one layer at a time.
 *
 * **Contract (matches `getSoloistNote`):** same argument list, returns
 * `null` | a note object (`{ midi, velocity, durationSteps, timingOffset, … }`,
 * `freq` is derived downstream), and it maintains `soloist.session.phrasing
 * .isResting` each tick (tick-logic publishes it to the coordination context so
 * bass/chords/harmony know whether the lead is breathing).
 *
 * **Build status — 2c (apex reach + recurring peaks):** on top of 2b (theme +
 * breath + arc + chord-tone landing + cumulative development with theme return),
 * the climb now has a *destination*: the highest note of EACH development-cycle
 * window (its local peak) LANDS on a **money note** — a strong key tone a
 * third-to-sixth above — whenever it sounds, so the lead reaches a resolved
 * signature peak roughly once per cycle (~24 bars), not once per macro-form
 * (design §9). Every
 * emitted note's duration is clamped to the next note that sounds, so the
 * monophonic lead never overruns its successor. Still to come: op variety (inversion,
 * displacement), a stepwise run-up into the apex, voice-leading targeting on
 * weak beats, then full expression (bends/vibrato, sparingly). With no seed it
 * defers to the legacy engine so the lead is never silent-by-bug.
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
function diatonicTranspose(
    midi: number,
    degrees: number,
    keyRootPc: number,
    isMinor: boolean,
): number {
    if (degrees <= 0) {
        return midi;
    }
    const steps = isMinor ? MINOR_STEPS : MAJOR_STEPS;
    const len = steps.length;
    const relPc = (((midi - keyRootPc) % 12) + 12) % 12;
    // Index of the scale degree at or just below this pitch class.
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
    // Pure contour-preserving transpose — register folding is applied to the
    // developed line as ONE unit at the call site (a per-note fold here would
    // invert the contour at the seam where adjacent notes straddle the ceiling).
    return Math.round(midi - relPc + newRel);
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
    prevFreq: number | null,
    octave: number,
    style: string,
    stepInChord: number,
    coordination: any = {},
    stepInfo: any = null,
): any {
    const { playback, soloist, arranger } = state;

    // No harmony to play against → nothing to do (matches legacy contract).
    if (!currentChord) {
        return null;
    }

    // Build 2a only knows how to perform a stated theme. Without a seed (the
    // brief pre-seed window, or a genre that produced none) defer to the proven
    // legacy engine so the soloist is never silent-by-bug.
    const seed = soloist.session.seed;
    if (!seed?.notes?.length) {
        return getSoloistNote(
            state,
            currentChord,
            nextChord,
            step,
            prevFreq,
            octave,
            style,
            stepInChord,
            coordination,
            stepInfo,
        );
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
    const cycleLen = Math.max(cyclePeriod * totalSteps, totalSteps);
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

    // --- Pitch: develop the theme, then LAND with intention on strong beats ---
    const isDownbeat = stepInfo
        ? Boolean(stepInfo.isDownbeat || stepInfo.isMeasureStart)
        : stepInChord === 0;
    let midi: number;
    if (isApexStep) {
        // The apex IS the form's one peak, so it lands the money note whenever it
        // sounds — the climax always resolves onto the curated strong tone. Driven
        // by the apex's identity (not the loop-count phase, which is decoupled from
        // its fixed form position — see above). Not chord-snapped: the held
        // tonic/5th over the changes is the idiomatic pedal climax (design §9).
        midi = moneyNote;
    } else {
        // Body of the line: parallel diatonic sequence (contour preserved),
        // climbing higher as the cycle develops, then landing chord tones on
        // strong beats so phrases resolve onto the harmony. The whole developed
        // line is folded into register as ONE unit (bodyOctaveFold) so the seam
        // never inverts the contour. (Weak-beat voice-leading is a later build.)
        midi = diatonicTranspose(primary.midi, liftDegrees, keyRootPc, keyIsMinor) + bodyOctaveFold;
        if (isDownbeat) {
            const root = ((currentChord.rootMidi % 12) + 12) % 12;
            const intervals: number[] = currentChord.intervals || [0, 4, 7];
            const chordPcs = new Set<number>(intervals.map((i) => (((root + i) % 12) + 12) % 12));
            midi = snapToNearestPc(midi, chordPcs);
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

    phr.isResting = false; // @worker-mutation
    return {
        midi,
        velocity,
        durationSteps,
        timingOffset: primary.timingOffset ?? 0,
        bendStartInterval: 0,
        vibrato: false,
        isDoubleStop: false,
    };
}
