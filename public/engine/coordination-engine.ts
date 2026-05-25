import type { SoloistHook, SoloistSessionSeed, StepInfo } from '../types.js';

/**
 * Coordination Context Management and Contract Enforcement
 * This module ensures the "Musical Coordination Contract" is satisfied.
 */

// why: leaning on the alterations over V7alt/V7b9/V7#9/etc. is the single most
// idiomatic move in jazz soloing. The soloist needs to know "this chord is altered
// and these specific pitch classes (relative to root) are the alterations to lean on".
// Kept exhaustive and explicit rather than parsing the chord symbol — the chord
// engine already canonicalizes quality strings; we map each known altered quality
// to the set of *altered extensions* (NOT the chord tones themselves) so the
// soloist's final-stage `weight *= 2.0` multiplier biases toward color tones,
// not toward roots/3rds/5ths which already win via the chord-tone bonus.
//
// Pitch classes are semitone offsets from the chord root:
//   b9 = 1,  #9 = 3,  #11/b5 = 6,  b13/#5 = 8
//
// Source: harmony-coordination.md P0 #8.
const ALT_EXTENSIONS_BY_QUALITY: Record<string, readonly number[]> = {
    // Fully altered dominant — bebop "altered scale" colors: b9, #9, #11, b13.
    '7alt': [1, 3, 6, 8],
    // Single-alteration dominants — only the named alteration is preferred.
    '7b9': [1],
    '7#9': [3],
    '7b5': [6],
    '7#11': [6],
    '7b13': [8],
    // Half-diminished / m7b5: bebop Locrian b9 (1) is iconic; Locrian #2 natural-9
    // (2) is the modal default. Both are valid color tones; include both.
    halfdim: [1, 2],
    m7b5: [1, 2],
    'half-diminished': [1, 2],
    // Diminished (o7): whole-half diminished scale color tone is the natural-9
    // above root (interval 2). b9 (1) belongs to the half-whole scale used on
    // dominant-b9 chords, NOT on fully diminished — would sound out-of-scale here.
    dim: [2],
    diminished: [2],
    // Augmented dominants (7#5): soloed with whole-tone scale [0,2,4,6,8,10] —
    // the #11/b5 (interval 6) is the defining color tone. #9 (3) is NOT in the
    // whole-tone scale and would break the chord's identity. augmaj7 is soloed
    // with Lydian Augmented, where #11 (6) is again the canonical lean.
    aug: [6],
    augmented: [6],
    augmaj7: [6],
};

/**
 * Returns the pitch classes (semitone offsets from chord root) of the *altered
 * extensions* for a chord, or [] if the chord is not a recognized tension chord.
 * Soloist final-stage weight multiplier consumes this list.
 */
export function getAltPitchClasses(
    quality: string | undefined | null,
    rootMidi: number | undefined | null,
): number[] {
    if (!quality || !Number.isFinite(rootMidi)) {
        return [];
    }
    const offsets = ALT_EXTENSIONS_BY_QUALITY[quality];
    if (!offsets) {
        return [];
    }
    const rootPc = (((rootMidi as number) % 12) + 12) % 12;
    const out: number[] = [];
    for (let i = 0; i < offsets.length; i++) {
        out.push((rootPc + offsets[i]) % 12);
    }
    return out;
}

/**
 * True iff the chord quality is one of the tension qualities that publishes
 * a non-empty altered-extension list. Mirrors `isTensionChordQuality` in
 * voicing-policy.ts but scoped to the soloist alteration map above.
 */
export function isTensionChordForSoloist(quality: string | undefined | null): boolean {
    return Boolean(quality && quality in ALT_EXTENSIONS_BY_QUALITY);
}

/**
 * Carryover values that survive across ticks. Producers of the per-tick context
 * (currently only `tick-logic.ts → generateNotesForStep`) thread this in via the
 * caller (`worker-buffer-manager`, `midi-worker-logic`) so consumers that need
 * "what did the soloist do recently?" can read a sticky value instead of the
 * current-tick-only `soloistMidi` (which is ~0 on most harmony stab steps
 * because harmony explicitly yields away from soloist-active steps).
 *
 * writer: tick-logic.ts (copies out after each generated step)
 * readable-after: any consumer in any module
 */
export interface CoordinationCarryover {
    lastActiveSoloistMidi: number;
    // Absolute step at which lastActiveSoloistMidi was last written. Lets consumers
    // age-cap the sticky so a soloist who played one note then went silent doesn't
    // steer harmony's register for the entire remaining session.
    lastActiveSoloistStep: number;
}

export function createCoordinationContext(
    step: number,
    stepInfo: StepInfo | null = null,
    carryover: CoordinationCarryover | null = null,
) {
    // Initial context derived from the "anchor" (Groove)
    const ts = (stepInfo as any)?.tsConfig || { beats: 4, stepsPerBeat: 4 };
    const stepsPerBar = ts.beats * ts.stepsPerBeat;
    const mStep = stepInfo ? stepInfo.mStep : step % stepsPerBar;

    return {
        // writer: createCoordinationContext (derived from step argument)
        // readable-after: creation (all producers)
        step,
        // writer: createCoordinationContext (derived from stepInfo.mStep or step % stepsPerBar)
        // readable-after: creation (all producers)
        mStep,
        // writer: createCoordinationContext (derived from stepInfo or mStep)
        // readable-after: creation (all producers)
        isMeasureStart: stepInfo ? stepInfo.isMeasureStart : mStep === 0,
        // writer: createCoordinationContext (derived from mStep + time-signature config)
        // readable-after: creation (all producers)
        isMeasureEnd: mStep >= stepsPerBar - (ts.stepsPerBeat || 4), // Last beat of measure
        // writer: tick-logic.ts drum preamble (checkHit('Kick') at line ~260, before producers)
        // readable-after: drum preamble (any producer — bass locks to kick using this)
        kickHit: false,
        // writer: tick-logic.ts drum preamble (checkHit('Snare') at line ~261, before producers)
        // readable-after: drum preamble (any producer)
        snareHit: false,
        // writer: tick-logic.ts groove preamble (calculatePocketOffset at line ~102, before producers)
        // readable-after: groove preamble (any producer)
        pocketOffset: 0,
        // writer: tick-logic.ts updateCoordinationContext('soloist') at line ~318
        // readable-after: soloist producer (bass, chords, harmony can read this)
        soloistBusy: false,
        // writer: updateCoordinationContext('soloist') — set true whenever the
        // soloist's main result has midi > 0 on this tick. Read by harmony
        // (spectral-gap branch, yield-when-active) and accompaniment
        // (unison-avoidance, dynamic-density) to decide whether to step out of
        // the soloist's way.
        soloistActive: false,
        // writer: soloist.ts (end-of-phrase guard, ~line 1792) — true ONLY on
        // the tick the soloist completes a phrase. Read by harmony to time
        // entry/exit gestures against phrase boundaries rather than against
        // raw rests.
        soloistPhraseEnd: false,
        // writer: tick-logic.ts updateCoordinationContext('soloist') at line ~318 (current tick only)
        // readable-after: soloist producer (bass, chords, harmony can read this)
        // NOTE: this is 0 on most harmony-stab steps because harmony yields away from soloist-active
        // steps. Use lastActiveSoloistMidi for cross-tick register awareness.
        soloistMidi: 0,
        // writer: tick-logic.ts updateCoordinationContext('soloist') at line ~318
        // readable-after: soloist producer (bass, chords, harmony can read this)
        avgSoloistMidi: 0,
        // why: harmony's spectral-gap branch (harmonies.ts:535-540) needs a non-zero
        // soloist position on harmony-stab steps, but the soloist usually rests on those
        // steps. lastActiveSoloistMidi survives across ticks so the branch actually fires.
        // Seeded from caller carryover; updated in updateCoordinationContext('soloist').
        // writer: tick-logic.ts updateCoordinationContext('soloist') → carryover storage;
        //         seeded each tick from caller-supplied CoordinationCarryover
        // readable-after: creation (all producers — carryover value is always available)
        lastActiveSoloistMidi: carryover?.lastActiveSoloistMidi || 0,
        // Step at which lastActiveSoloistMidi was last written. Consumers compare against
        // `step` to age-cap stale values (see harmonies.ts spectral-gap branch). 0 means
        // "never set" (sentinel — equivalent to no sticky).
        // writer: tick-logic.ts updateCoordinationContext('soloist') → carryover storage;
        //         seeded each tick from caller-supplied CoordinationCarryover
        // readable-after: creation (all producers — carryover value is always available)
        lastActiveSoloistStep: carryover?.lastActiveSoloistStep || 0,
        // writer: tick-logic.ts updateCoordinationContext('bass') at line ~371
        // readable-after: bass producer (chords, harmony can read this)
        bassHit: false,
        // writer: tick-logic.ts updateCoordinationContext('bass') at line ~371
        // readable-after: bass producer (chords, harmony can read this)
        bassMidi: 0,
        // writer: tick-logic.ts updateCoordinationContext('chords') at line ~400
        // readable-after: chords producer (harmony can read this)
        accompanimentHit: false,
        // writer: tick-logic.ts updateCoordinationContext('chords') at line ~400
        // readable-after: chords producer (harmony can read this; soloist also reads this
        //   but via the previous-tick value from accompanimentMidis — see S5 unison-avoidance)
        accompanimentMidis: [] as number[],
        // writer: tick-logic.ts updateCoordinationContext('chords') at line ~400
        // readable-after: chords producer (harmony can read this)
        avgChordMidi: 0,
        // writer: tick-logic.ts chord-data preamble at lines ~118-119 (before producers run)
        // readable-after: chord-data preamble (any producer)
        // Absolute step indices for the current section's boundaries. Default 0
        // means "no chord data yet" — consumers all guard via `|| 0`, `?? null`,
        // or `sectionEnd > 0` checks, so the sentinel is safe.
        sectionStart: 0,
        sectionEnd: 0,
        // writer: tick-logic.ts chord-data preamble at line ~142 (before producers run)
        // readable-after: chord-data preamble (any producer including soloist)
        upcomingSectionFirstChord: null as any,
        // why: epic-form-arrangement S2 (Imperfect Symmetry). Same value the soloist
        // derives from `getSectionContext(arranger, step)` (soloist.ts). Published
        // through the coordination context so bass/drums/accompaniment producers can
        // diverge their repeat passes (Verse 1 vs Verse 2 vs Verse 3) without each
        // engine re-deriving the same lookup against `arranger.sectionMap`.
        //
        // Semantics:
        //   1 = first occurrence ("Statement" — no Imperfect-Symmetry bias)
        //   2 = second occurrence ("Restatement" — engines may apply seeded variation)
        //   3+ = further repeats (engines may amplify variation per occurrence)
        //
        // Default of 1 matches `getSectionContext`'s no-sectionMap fallback so engines
        // can safely test `occurrence > 1` without guarding against `undefined`.
        // writer: tick-logic.ts (chord-data preamble, before producers run)
        // readable-after: chord-data preamble (any producer)
        sectionOccurrence: 1,
        // why: epic-form-arrangement S4 — final-bar resolution cascade. True ONLY
        // when song-mode playback is ending AND the current tick is inside the
        // final measure of the form (`playback.isEndingPending && modStep +
        // stepsPerMeasure >= arranger.totalSteps`). Bass holds tonic, chords play
        // a root-position cadence voicing, drums fire a Crash + sustained cymbal.
        // Currently only the soloist senses the form's end (`soloist.ts:1257`'s
        // per-section `isFinalMeasure`); this flag lets the rest of the band end
        // together.
        //
        // Precedence: when true, this OVERRIDES Imperfect Symmetry on the final
        // bar — bass/chords/drums each early-out to the resolution gesture rather
        // than apply a repeat-pass octave/voicing/ghost shift on top. The musical
        // intent is "land hard on the tonic, no variation theatre on the way out."
        //
        // Default of `false` matches non-ending playback and the no-arranger
        // fallback so engines can safely gate on truthy without an undefined
        // check.
        //
        // Source: docs/audit/form-arranger.md P1 #6;
        //         docs/audit/epic-form-arrangement.md S4.
        // writer: tick-logic.ts (chord-data preamble, before producers run)
        // readable-after: chord-data preamble (any producer)
        isFinalMeasure: false,
        // why: epic-form-arrangement S5 — Intro/Outro instrument layering.
        // A produced track opens drums-only for 2-4 bars, then layers in bass,
        // then chords, then harmony — and inverts the order on the outro.
        // Today all six engines emit from beat 1; the "Intro" is just "the
        // same band, quieter" (form-arranger.md P1 #4).
        //
        // Semantics:
        //   - `introBarsElapsed`: number of COMPLETE bars elapsed since the
        //     start of the current section, when the section's label matches
        //     `isIntroSectionLabel`. Bar 0 = first bar (first downbeat through
        //     end-of-bar). Engines compare against `INTRO_MUTES[engine]` from
        //     `arrangement-layering.ts` — `introBarsElapsed < muteBars`
        //     means "I should rest this tick."
        //   - `outroBarsRemaining`: number of bars REMAINING in the current
        //     section (including the current bar), when the section's label
        //     matches `isOutroSectionLabel`. Engines compare against
        //     `OUTRO_MUTES[engine]` — `outroBarsRemaining <= muteBars`
        //     means "I should rest this tick" (outro fade-out).
        //   - `-1` is the sentinel for "not in an intro/outro section." A
        //     sentinel rather than `undefined` so producers can read the field
        //     once and gate cleanly: `if (introBarsElapsed >= 0 && ...)`.
        //
        // Precedence: `isFinalMeasure` (S4) OVERRIDES the outro mute on the
        // final bar of the form — the resolution cadence MUST fire even if
        // the bass would otherwise be muted by `outroBarsRemaining <= 1`.
        // Engines that consume both flags MUST check `isFinalMeasure` first.
        //
        // Source: docs/audit/form-arranger.md P1 #4;
        //         docs/audit/epic-form-arrangement.md S5.
        // writer: tick-logic.ts (chord-data preamble, before producers run)
        // readable-after: chord-data preamble (any producer)
        introBarsElapsed: -1,
        outroBarsRemaining: -1,
        // why: published per-tick from the current chord (writer: tick-logic chord-preamble
        // at lines ~102-122; readable-after: chord-preamble — i.e. by EVERY producer
        // including the soloist which runs first). Lets the soloist bias toward
        // b9/#9/#11/b13 over V7alt-family chords as a final-stage weight multiplier in
        // selectPitchAndDevices. See harmony-coordination.md P0 #8.
        //
        // NOTE the writer is the tick-preamble, NOT a producer, because the soloist
        // (the primary consumer) runs BEFORE the chords producer would have published.
        // The fields are pure functions of the current chord, so we don't need a
        // running producer to compute them — we publish them at the same time as
        // upcomingSectionFirstChord and isTurnaround (the other chord-preamble fields).
        // writer: tick-logic.ts (chord-data preamble, before producers run)
        // readable-after: chord-data preamble (any producer)
        isTensionChord: false,
        altPitchClasses: [] as number[],
        // why: harmony's comper and finalizer modes read these to decide voicing density
        // and guide-tone reduction when the soloist is active. Publishing them through the
        // coordination context rather than letting harmonies.ts reach into soloist.session.*
        // directly keeps the contract surface honest and ensures mocked tests exercise the
        // same code paths as production. (Source: harmony-coordination.md P0 #5, S4.)
        // writer: tick-logic.ts (soloist producer block, after getSoloistNote)
        // readable-after: soloist producer (any consumer that runs after soloist)
        // Default `true` matches state.soloist.session.phrasing.isResting's boot value
        // in public/state/instruments.ts, so harmony doesn't see a false "busy" signal
        // on the first tick before the soloist producer has written.
        soloistResting: true,
        soloistNotesInPhrase: 0,
        // why: epic-deferred-followups S9(b) — harmonies.ts previously reached
        // into `soloist.session.memory.sharedHookBuffer` and `soloist.session.seed`
        // directly (the Ska-Punk shared-hook reinforcement + melodic-shadowing
        // branches in playShadowMode). That crosses the soloist↔harmony engine
        // boundary instead of going through the coordination contract. These two
        // fields publish the same objects through coordination so harmony reads
        // only the contract surface — and mocked tests exercise the same paths
        // as production.
        //
        //   - `soloistSharedHookBuffer`: hooks the soloist has shared for other
        //     instruments to echo (Ska-Punk antiphony). Empty array when there
        //     are none — never null, so harmony can `.find()` without a guard.
        //   - `soloistSeed`: the SRDC "Head" seed melody for the session, or
        //     null before the soloist has seeded one (matches
        //     `soloist.session.seed`'s null boot value).
        //
        // Both are worker-internal — computed worker-side from the soloist
        // session each tick and consumed only by the harmony producer that runs
        // later in the same tick — so they do NOT need main↔worker sync.
        // writer: soloist producer (tick-logic.ts, after getSoloistNote)
        // readable-after: soloist producer (harmony can read this)
        soloistSharedHookBuffer: [] as SoloistHook[],
        soloistSeed: null as SoloistSessionSeed | null,
        // why: epic-deferred-followups S1(a) — section-boundary lookahead.
        // `upcomingSectionFirstChord` (above) already publishes WHICH chord
        // the next section opens on; these three fields publish the surrounding
        // STRUCTURAL context so the conductor / engines can anticipate a section
        // change rather than hit it cold:
        //
        //   - `upcomingSectionLabel`: the raw label of the next section
        //     (e.g. "Drop", "Breakdown", "Chorus"). null when the next section
        //     can't be resolved (no sectionMap, or the chart is single-section).
        //   - `upcomingSectionEnergyDelta`: `getSectionEnergy(next) -
        //     getSectionEnergy(current)` from form-analysis.ts's energy map
        //     (drop=1.0, breakdown=0.3, chorus=0.9, verse=0.5, …). A large
        //     positive delta means "the band is about to lift hard"; a large
        //     negative delta means "about to drop to a breakdown." 0 when the
        //     next label is unknown.
        //   - `barsUntilSectionChange`: whole measures remaining until the
        //     section boundary. 0 means "we are IN the last bar before the
        //     change." -1 is the sentinel for "no upcoming change resolvable"
        //     (matches the upcomingSectionFirstChord null contract — both are
        //     only populated in the last measure of a section).
        //
        // S1(b)'s Drop/Breakdown mechanic and S2's section-gated rock push
        // both consume these. Defaults (null / 0 / -1) mean "no lookahead
        // signal" so consumers can gate cleanly without an undefined check.
        // writer: tick-logic.ts (chord-data preamble, before producers run)
        // readable-after: chord-data preamble (any producer)
        upcomingSectionLabel: null as string | null,
        upcomingSectionEnergyDelta: 0,
        barsUntilSectionChange: -1,
        // why: epic-deferred-followups S1(b) — Drop/Breakdown structural mechanic.
        // A drop is not a loud chorus; it is a STRUCTURAL EVENT — the band cuts
        // for one bar, a crash marks the gap, then everyone slams back on the
        // next downbeat. These two flags carry that event band-wide:
        //
        //   - `dropMuteActive`: true for every step of the 1-bar pre-drop mute
        //     window (the LAST bar before a drop/breakdown section). When true,
        //     bass / chords / harmony / soloist emit nothing — the cut. Drums
        //     are exempt (they carry the crash).
        //   - `dropCrashPending`: true ONLY on the downbeat (first step) of the
        //     mute bar. The drum layer fires a single Crash here to mark the
        //     gap; the rest of the bar is silent across all engines.
        //
        // The mute is exactly 1 bar — long enough for the cut to register as
        // intentional, short enough that the slam-back still feels like the
        // same phrase. Both default false (no drop pending). Genre-gated to
        // high-energy styles (Rock/Metal/Shred/Hip-Hop/Disco/Ska-Punk) — a
        // drop cut is idiomatic there and alien to jazz/bossa/acoustic.
        //
        // writer: tick-logic.ts (chord-data preamble, before producers run)
        // readable-after: chord-data preamble (any producer)
        dropMuteActive: false,
        dropCrashPending: false,
    };
}

/**
 * The full coordination context shape produced by `createCoordinationContext` and
 * mutated by `updateCoordinationContext`. Exporting the type lets consumer files
 * annotate parameters without resorting to `any`.
 *
 * Fields are listed in writer order (creation-time → drum preamble → soloist
 * producer → bass producer → chord producer). See the inline comments inside
 * `createCoordinationContext` for detailed writer / readable-after semantics.
 *
 * The five S1 lookahead/drop fields are explicitly called out because
 * `drop-mechanic.ts` and the Epic 11 S2 rock-push consume them through
 * `(coordination as any)` casts — having the real type here documents the
 * shape and gives future callers a migration target.
 *   - `upcomingSectionLabel`      — raw label of the next section ("Drop", "Chorus", …)
 *   - `upcomingSectionEnergyDelta`— getSectionEnergy(next) − getSectionEnergy(current)
 *   - `barsUntilSectionChange`    — 0 = last bar before change, −1 = not resolvable
 *   - `dropMuteActive`            — true every step of the 1-bar pre-drop cut window
 *   - `dropCrashPending`          — true only on the downbeat of the mute bar
 *
 * Source: docs/audit/FOLLOWUPS.md §G "CoordinationContext interface" NIT;
 *         docs/audit/epic-deferred-followups.md S1(a)/(b).
 */
export type CoordinationContext = ReturnType<typeof createCoordinationContext>;

export function updateCoordinationContext(
    context: CoordinationContext,
    module: string,
    result: any,
): void {
    if (!result) {
        return;
    }

    switch (module) {
        case 'soloist': {
            const results = Array.isArray(result) ? result : [result];
            // Optimization: Replace filter/reduce/find chain with single loop to avoid allocations
            let sum = 0;
            let count = 0;
            let mainResult = null;

            for (let i = 0; i < results.length; i++) {
                const r = results[i];
                if (r.midi > 0) {
                    sum += r.midi;
                    count++;
                    if (!mainResult || (!r.isDoubleStop && mainResult.isDoubleStop)) {
                        mainResult = r;
                    }
                }
            }

            if (mainResult) {
                context.soloistActive = true;
                context.soloistMidi = mainResult.midi;
                // why: sticky companion to soloistMidi — overwritten on every non-rest
                // soloist note. Paired with lastActiveSoloistStep so consumers can
                // age-cap a stale value (soloist who played one note then went silent
                // shouldn't steer harmony for the rest of the session).
                context.lastActiveSoloistMidi = mainResult.midi;
                context.lastActiveSoloistStep = context.step;
                if (mainResult.isBusy) {
                    context.soloistBusy = true;
                }

                // Calculate average for harmony slotting
                context.avgSoloistMidi = sum / count;
            }
            break;
        }
        case 'bass':
            if (result.midi > 0) {
                context.bassHit = true;
                context.bassMidi = result.midi;
            }
            break;
        case 'chords': {
            const notes = Array.isArray(result) ? result : [result];
            // Optimization: Replace map/filter/reduce chain with standard for loop to avoid intermediate array allocations
            const activeMidis: number[] = [];
            let sum = 0;
            for (let i = 0; i < notes.length; i++) {
                const m = notes[i].midi;
                if (m > 0) {
                    activeMidis.push(m);
                    sum += m;
                }
            }

            if (activeMidis.length > 0) {
                context.accompanimentHit = true;
                context.accompanimentMidis = activeMidis;
                context.avgChordMidi = sum / activeMidis.length;
            }
            break;
        }
    }
}

/**
 * Enforces the "Strict Register Slotting" rules defined in ENSEMBLE_COORDINATION.md.
 * If a note is outside its designated slot, it is transposed to the nearest octave within range.
 */
export function enforceRegisterSlotting(
    module: string,
    midi: number,
    _context: any,
    targetMidi: number | null = null,
): number {
    if (midi <= 0) {
        return midi;
    }

    switch (module) {
        case 'bass':
            // Bass: MIDI 23 to 57 (Supports 5-string Low B and melodic fills)
            return smoothOctaveClamp(midi, 23, 57, targetMidi);

        case 'chords':
        case 'harmony':
            // Chords/Harmony: 52 to 84 (when Bass is present/active)
            return smoothOctaveClamp(midi, 52, 84, targetMidi);

        case 'soloist':
            // Soloist: Priority 60 to 90, but has free range.
            // We clamp if it's hitting bass frequencies (now raised to 52).
            if (midi < 52) {
                return smoothOctaveClamp(midi, 60, 90, targetMidi);
            }
            return midi;

        default:
            return midi;
    }
}

function smoothOctaveClamp(
    midi: number,
    min: number,
    max: number,
    target: number | null = null,
): number {
    let current = midi;

    // If we have a target (e.g. previous note), try to get as close as possible
    // while staying within [min, max]
    if (target !== null) {
        // First get into range
        while (current < min) {
            current += 12;
        }
        while (current > max) {
            current -= 12;
        }

        // Then try to match target octave
        const octaves = [-12, 12];
        for (const shift of octaves) {
            const shifted = current + shift;
            if (shifted >= min && shifted <= max) {
                if (Math.abs(shifted - target) < Math.abs(current - target)) {
                    current = shifted;
                }
            }
        }
    } else {
        while (current < min) {
            current += 12;
        }
        while (current > max) {
            current -= 12;
        }
    }

    return Math.max(min, Math.min(max, current));
}
