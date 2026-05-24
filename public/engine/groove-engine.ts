import type { EnsembleState } from '../types.js';
import {
    binarySearchMap,
    calculateTimingOffset,
    getStepsPerMeasure,
    isSectionTurnaround,
} from '../utils.js';
import * as acoustic from './grooves/acoustic.js';
import * as blues from './grooves/blues.js';
import * as country from './grooves/country.js';
import * as disco from './grooves/disco.js';
import * as funk from './grooves/funk.js';
import * as hiphop from './grooves/hiphop.js';
import * as jazz from './grooves/jazz.js';
import * as latin from './grooves/latin.js';
import * as metal from './grooves/metal.js';
import * as minimal from './grooves/minimal.js';
import * as neoSoul from './grooves/neo-soul.js';
import * as reggae from './grooves/reggae.js';
import * as rock from './grooves/rock.js';
import * as shred from './grooves/shred.js';
import * as skaPunk from './grooves/ska-punk.js';
import { DEFAULT_CONFIG } from './grooves/utils.js';
import { scrambleHash, stringHash31, stringHash33 } from './hash-utils.js';

const strategies: Record<string, any> = {
    Jazz: jazz,
    Blues: blues,
    Rock: rock,
    Funk: funk,
    'Neo-Soul': neoSoul,
    'Hip Hop': hiphop,
    Acoustic: acoustic,
    Disco: disco,
    Reggae: reggae,
    'Bossa Nova': latin,
    Latin: latin,
    'Ska-Punk': skaPunk,
    Country: country,
    Metal: metal,
    Minimal: minimal,
    Shred: shred,
};

// why (Epic 12 S6 B6): genres whose closed-hat is a constant 8th/16th-note
// ticker driving the pocket. The Epic 2 S4 final-bar resolution gesture (Crash
// + sustained cymbal) suppresses the HiHat universally so the swell rings out
// cleanly — but in these genres the hat ISN'T a separate "would the cymbal
// clutter the swell" decision, it's part of the spine. Suppressing it reads as
// an abrupt drop-out at the moment the band is supposed to land hardest.
//
// Membership rule: hat (or upbeat-crack ride/snare driving the offbeat) plays
// on every 8th or finer through the bar at typical intensity. Disco's 4-on-the-
// floor + 8th-hat, Funk's 16th ghosting, Rock's driving 8ths, Metal/Shred's
// 8th-note rides, Ska-Punk's offbeat-hat upbeat-crack.
//
// For sparser-hat genres (Jazz/Bossa/Acoustic/Country/Blues/Reggae/Neo-Soul/
// Latin/Minimal/Hip Hop) the original universal suppression remains correct —
// the hat wasn't a constant ticker to begin with, so silencing it on the final
// bar reads as the intended "let the swell breathe" gesture.
const HAT_DENSE_GENRES = new Set(['Disco', 'Funk', 'Rock', 'Metal', 'Shred', 'Ska-Punk']);

function getStrategy(groove: any): any {
    const isLatinStyle =
        groove.genreFeel === 'Bossa Nova' ||
        ['Bossa Nova', 'Latin/Salsa', 'Afro-Cuban 6/8', 'Samba'].includes(groove.lastDrumPreset) ||
        groove.lastSmartGenre === 'Bossa';
    if (isLatinStyle) {
        return latin;
    }

    return strategies[groove.genreFeel] || null;
}

function humanizeVelocity(vel: number, seed: number, amount = 0.05): number {
    return vel * (1.0 + (scrambleHash(seed) - 0.5) * amount);
}

/**
 * Per-loop motif complexity cap for Chorus Evolution pocket discipline.
 * Loop 0,1 → Standard (1): metronomic foundation on The Head.
 * Loop 2+  → Active   (2): groove opens up on repeat passes.
 * Cap never exceeds 2 so the engine doesn't jump straight to Busy (3).
 * why: form-arranger.md P0 #3 — drums must prove Chorus Evolution contract
 * before fanning out to other engines; groove-engine.ts applies this at
 * per-tick time so the same OrchestrationMap entry renders differently
 * across loop passes without re-seeding the whole arrangement.
 */
export function motifCapForLoop(loopCount: number): number {
    return Math.min(2, 1 + Math.floor(loopCount / 2));
}

// why: tick-logic builds this bag inline for every drum tick. Tightening
// the shape here lets the compiler catch typos in field names (which would
// silently shadow as `undefined` and corrupt the per-tick groove decision).
// Test fixtures pass `params: any`, which remains assignable; production
// `inst` / `tsConfig` keep `any` for compatibility with `Instrument` and
// `TIME_SIGNATURES[...]` shapes without forcing a wider refactor here.
export interface GrooveOverrideOptions {
    stepVal: number;
    step: number;
    inst: any;
    playback: EnsembleState['playback'];
    groove: EnsembleState['groove'];
    isDownbeat: boolean;
    isBeatStart: boolean;
    isPulse?: boolean;
    isPulseStart?: boolean;
    isGroupStart: boolean;
    isBackbeat: boolean;
    isOffbeat: boolean;
    isEOfBeat: boolean;
    isAOfBeat: boolean;
    beatIndex: number;
    tsConfig: any;
    // why: `mStep` / `stepInGroup` / `groupIndex` / `isCompound` are sourced
    // from `stepInfo` (utils.ts `getStepInfo`) and threaded through by the
    // tick-logic.ts production caller (epic-deferred-followups S8(c)). Per-genre
    // strategies (jazz.ts reads all four for compound-meter ride/skip-beat
    // logic) consume them via the `context` bag below. Kept optional so test
    // fixtures that don't exercise compound meters can omit them.
    mStep?: number;
    isCompound?: boolean;
    stepInGroup?: number;
    groupIndex?: number;
    sectionId?: string | null;
    sectionOccurrence: number;
    isFinalMeasure: boolean;
    // tick-logic.ts builds the bag with a few extras (`isTurnaround`,
    // `stepsPerBar`, `loopStep`) that this function recomputes internally
    // and ignores; declared optional so the call site typechecks.
    isTurnaround?: boolean;
    stepsPerBar?: number;
    loopStep?: number;
}

export function applyGrooveOverrides(
    state: any,
    {
        stepVal,
        step,
        inst,
        playback,
        groove,
        isDownbeat,
        isBeatStart,
        isPulse,
        isPulseStart,
        isGroupStart,
        isBackbeat,
        isOffbeat,
        isEOfBeat,
        isAOfBeat,
        beatIndex,
        tsConfig,
        mStep,
        isCompound,
        stepInGroup,
        groupIndex,
        sectionId: sectionIdFromTick,
        sectionOccurrence,
        isFinalMeasure,
    }: GrooveOverrideOptions,
) {
    const { soloist, arranger } = state;
    const arrangerState = { timeSignature: '4/4', ...(arranger || {}) };
    const stepsPerBar = getStepsPerMeasure(arrangerState.timeSignature);
    const loopStep = step % stepsPerBar;

    let currentState = {
        shouldPlay: stepVal > 0,
        velocity: stepVal === 2 ? 1.25 : 0.9,
        soundName: inst.name,
        instTimeOffset: 0,
    };

    const strategy = getStrategy(groove);
    const config = strategy ? strategy.config : DEFAULT_CONFIG;

    let pulseWeight = 1.0;
    if ((inst.name === 'HiHat' || inst.name === 'Open') && !config.exemptFromPulseShaping) {
        const isSyncopated = loopStep % 2 === 1;
        if (isOffbeat) {
            pulseWeight = 0.85;
        } else if (isSyncopated) {
            pulseWeight = 0.7;
        }
    }

    const drumComplexity = groove.creativity ? 0.8 : 0.3;

    const barIndex = Math.floor(step / stepsPerBar);
    const prevBarIndex = Math.floor((step - 1) / stepsPerBar);
    const isFirstStepOfNewBar = loopStep === 0 && barIndex !== prevBarIndex;
    const seedTimelineStartStep = groove.seedTimelineStartStep || 0;
    const timelineStep = step - seedTimelineStartStep;

    const orchestration: any = groove.orchestrationMap
        ? binarySearchMap(groove.orchestrationMap, timelineStep)
        : null;
    // Pocket discipline by loop: Loop 0,1 → Standard (1); Loop 2+ → Active (2).
    // Read playback.currentLoopCount at per-tick time so the same orchestration
    // entry renders differently across repeat passes (Chorus Evolution).
    const loopCount = playback?.currentLoopCount ?? 0;
    const motifCap = motifCapForLoop(loopCount);
    const cappedMotif =
        orchestration?.motifComplexity !== undefined
            ? Math.min(orchestration.motifComplexity, motifCap)
            : undefined;
    const effectiveComplexity = cappedMotif !== undefined ? cappedMotif / 3 : drumComplexity;

    // Calculate current section length to determine turnarounds dynamically instead of hardcoded 4 bars
    const isTurnaround =
        groove.creativity && isSectionTurnaround(step, arrangerState.sectionMap, stepsPerBar, 1);

    // Check if the PREVIOUS bar was a turnaround to determine if we should crash now
    const prevStep = step - stepsPerBar;
    const prevWasTurnaround =
        groove.creativity &&
        isSectionTurnaround(prevStep, arrangerState.sectionMap, stepsPerBar, 1);

    const justFinishedTurnaround = prevWasTurnaround && isFirstStepOfNewBar;

    const chordEntry: any = binarySearchMap(arrangerState.stepMap || [], step);
    const sectionId = chordEntry?.chord?.sectionId;
    let sectionSeed = (groove.sectionSeedMap as Record<string, number>)?.[sectionId];
    if (sectionSeed === undefined) {
        // Latin/Bossa requires 2-bar stability for authentic Clave motifs
        const seedBarIndex = config.isLatin ? Math.floor(barIndex / 2) * 2 : barIndex;
        sectionSeed = ((seedBarIndex * 137 + (groove.creativity ? 42 : 0)) % 256) / 256;
    }

    const context = {
        step,
        inst,
        stepVal,
        playback,
        groove,
        isDownbeat,
        isBeatStart,
        isPulse,
        isPulseStart,
        isGroupStart,
        isBackbeat,
        isOffbeat,
        isEOfBeat,
        isAOfBeat,
        beatIndex,
        tsConfig,
        mStep,
        isCompound,
        stepInGroup,
        groupIndex,
        stepsPerBar,
        loopStep,
        drumComplexity: effectiveComplexity,
        orchestration,
        barIndex,
        isFirstStepOfNewBar,
        sectionSeed,
        isTurnaround,
        isSoloistBusy: soloist.enabled && soloist.session.phrasing.busySteps > 0,
    };

    if (strategy) {
        currentState = strategy.applyOverrides(context, currentState);
    }

    // --- Phase 2b: Section-boundary Crash (applied post-strategy so genre overrides don't clobber it) ---
    // why: the turnaround block previously ran BEFORE strategy.applyOverrides, which unconditionally
    // resets the hat lane (e.g. funk.ts:64 sets shouldPlay=false and rebuilds from scratch), so the
    // Crash routing was always wiped. Moving it here — parallel with the crash-catch accent below —
    // guarantees the Crash fires on the final, post-strategy state.
    if (justFinishedTurnaround && isDownbeat) {
        if (inst.name === 'Kick') {
            currentState.shouldPlay = true;
            currentState.velocity = 1.35;
        } else if (inst.name === 'Open' && playback.bandIntensity > 0.45) {
            // why: route the section-start crash splash on the Open lane only — `blues.ts:59`
            // is the reference pattern. Firing on both HiHat and Open lanes (the previous
            // implementation) produces two stacked Crash drumHits per boundary, and the
            // second voice's `lastCrashGain` ramp-down in synth-drums.ts:949-955 actively
            // chokes the first voice's tail (audible "flam" + gain stutter). The HiHat lane
            // keeps whatever the genre strategy decided. At intensity < 0.45 we leave the
            // Open lane to its strategy default — no crash on a quiet intro return.
            currentState.shouldPlay = true;
            // why: epic-deferred-followups S8(b) — splash the genre's declared
            // accent cymbal (Metal → China) on the post-turnaround boundary.
            // Default 'Crash' preserves every other genre's behavior.
            currentState.soundName = config.accentCymbal ?? 'Crash';
            currentState.velocity = 1.2;
        }
    }

    // --- Phase 3: Soloist Accent Catching ---
    const accent = timelineStep >= 0 ? groove.accentMap?.[timelineStep] : null;
    if (accent) {
        if (accent.type === 'crash-catch') {
            if (inst.name === 'Kick') {
                currentState.shouldPlay = true;
                currentState.velocity = 1.3;
            } else if (inst.name === 'Open') {
                // why: route crash-catch accents on the Open lane only — same double-fire
                // reasoning as the section-boundary block above. A crash-catch fires every
                // time the soloist hits a peak (velocity > 0.85 or syncopation > 0.75), so
                // the duplicate-Crash artifact cumulatively dominated a song with an active
                // soloist. The HiHat lane stays on whatever the strategy chose.
                currentState.shouldPlay = true;
                // why: S8(b) — crash-catch accents use the genre's declared
                // accent cymbal (Metal → China) so a soloist peak on a metal
                // section splashes China, consistent with the boundary block.
                currentState.soundName = config.accentCymbal ?? 'Crash';
                currentState.velocity = 1.25;
            }
        } else if (accent.type === 'snare-stab') {
            if (inst.name === 'Snare') {
                currentState.shouldPlay = true;
                currentState.soundName = 'Snare';
                currentState.velocity = 1.2;
            } else if (inst.name === 'Kick') {
                currentState.shouldPlay = true;
                currentState.velocity = 1.1;
            }
        } else if (accent.type === 'hat-bark') {
            if (inst.name === 'HiHat' || inst.name === 'Open') {
                currentState.shouldPlay = true;
                currentState.soundName = 'Open';
                currentState.velocity = 1.1;
            }
        }
    }

    // --- Entropy Phase (Random Expressivity) ---
    // why: drums.md P0 #2 — per-genre floor on entropy. Reggae One Drop holes
    // at 0.5, Jazz ride emptiness at 0.45, Acoustic ballad at 0.5 all need
    // entropy fully off so the silence reads as silence. `suppressEntropyBelow`
    // defaults to 0 (legacy behavior — entropy always runs); per-genre overrides
    // live in each grooves/*.ts config. Bossa/Latin already exempt via isLatin
    // gating the Snare branch below; this is the broader gate that also covers
    // the HiHat/Open branch.
    const entropyFloor = config.suppressEntropyBelow ?? 0;
    // why: strict `>` so the floor value itself is suppressed. The audit's
    // canonical case (drums.md P0 #2) is "Reggae One Drop at intensity 0.5":
    // with floor=0.5 and `>=` the entropy still fires at 0.5; `>` makes the
    // floor inclusive of the suppressed range, matching the story's phrasing
    // "no entropy sprinkle below the genre's floor" (≤ floor = suppressed).
    const entropyGateActive = playback.bandIntensity > entropyFloor;

    // Suppress entropy during the first iteration to establish a solid 'Pocket'.
    // why: drums.md P0 #2 — when `arrangerState.totalSteps` is unset (early-bar
    // bootstrap or seed paths that haven't filled the timeline length yet), the
    // previous comparison `step < (totalSteps || 0)` collapsed to `step < 0`,
    // which is always false → entropy fired at full strength when it should have
    // been suppressed. Fall back to `seedTimelineStartStep + stepsPerBar`: this
    // suppresses for the first bar after the seed timeline starts whenever the
    // engine doesn't know the total length yet.
    const firstIterBoundary = arrangerState.totalSteps || seedTimelineStartStep + stepsPerBar;
    const firstIterationSuppression = step < firstIterBoundary ? 0.3 : 1.0;

    // why: Epic 12 S4 — migrate the three entropy-phase Math.random() draws to
    // scrambleHash seeded on (barIndex, sectionId, loopStep, inst.name) so
    // drum-strategy probability and velocity decisions are deterministic across
    // loops and critique tests. Each draw gets a distinct discriminator (1/3/5)
    // so co-located draws don't collide. sectionId hashed with stringHash33 —
    // matching the Imperfect Symmetry block at line ~437; inst.name hashed with
    // stringHash31 (the existing convention at lines 467/597) so the gate
    // decision is INDEPENDENT per lane — without the inst-name fold, Snare and
    // HiHat would see the same hash quantile at the same (barIndex, loopStep)
    // and their entropy decisions would lockstep. Musically minor (Snare/HiHat
    // eligibility conditions are mutually exclusive at any given step), but
    // restoring lane independence preserves the prior per-call statistical
    // shape. Source: FOLLOWUPS §C.
    const _entropySectionIdStr = sectionIdFromTick || sectionId || '';
    const _entropySectionHash = stringHash33(_entropySectionIdStr);
    const _entropyInstHash = stringHash31(inst.name ?? '');
    // Shared base seed: barIndex * large-prime XOR sectionHash XOR loopStep * small-prime XOR instHash.
    // Discriminators are odd primes (1/3/5) so adjacent draws produce unrelated values.
    const _entropyBaseSeed =
        (_entropySectionHash ^ (barIndex * 0x9e3779b1) ^ (loopStep * 131) ^ _entropyInstHash) | 0;

    if (
        groove.creativity &&
        entropyGateActive &&
        !currentState.shouldPlay &&
        // why: draw 1 (discriminator 1) — the entropy gate itself. scrambleHash gives
        // a well-distributed float per (barIndex, sectionId, loopStep) tuple so the
        // gate fires at the correct average rate without introducing LCG sawtooth
        // artifacts (see feedback_seeded_prng_mulberry32 project memory).
        scrambleHash((_entropyBaseSeed + 1) | 0) <
            playback.bandIntensity *
                config.entropyMultiplier *
                firstIterationSuppression *
                (config.blockAdjacentSnare && groove.genreFeel !== 'Rock' ? 0.7 : 1.0)
    ) {
        const isSyncopated = loopStep % 2 === 1;
        const subdivision = stepsPerBar / (arrangerState.timeSignature.includes('/8') ? 2 : 4);
        const isHeavySync = loopStep % subdivision === Math.floor(subdivision / 2);

        // Simple hardcoded checks adapted to dynamic offset from backbeat
        let isBackbeatAdjacent = false;
        let isEOfBeatCheck = false;

        if (arrangerState.timeSignature === '4/4') {
            isBackbeatAdjacent = [3, 5, 11, 13].includes(loopStep);
            isEOfBeatCheck = [1, 9].includes(loopStep);
        }
        const blockSnare = config.blockAdjacentSnare && (isBackbeatAdjacent || isEOfBeatCheck);

        if (inst.name === 'Snare' && isSyncopated && !blockSnare && !config.isLatin) {
            currentState.shouldPlay = true;
            // why: draw 2 (discriminator 3) — ghost snare velocity in [0.1, 0.25).
            // Must be distinct from draw 1 to avoid correlation; discriminator 3
            // separates the gate decision from the velocity assignment. Range matches
            // prior Math.random(): 0.1 + r*0.15 ∈ [0.10, 0.25).
            currentState.velocity = 0.1 + scrambleHash((_entropyBaseSeed + 3) | 0) * 0.15;
            // why: gate kept at 0.4 (NOT swept with the per-genre S8 backbeat gates).
            // This fires entropy-phase syncopation hits across ALL genres including ones
            // whose per-genre Snare gates were deliberately preserved (Jazz brushwork,
            // Bossa clave, Acoustic ballad). Blanket-lowering to 0.3 would crack ghost
            // hits where the genre identity is rim. Ghost-fill velocity (0.1-0.25) is
            // quieter than backbeat (~1.2 scaled) — rim is the musical default. (S8 2026-05-17)
            currentState.soundName = playback.bandIntensity < 0.4 ? 'Sidestick' : 'Snare';
        } else if (
            (inst.name === 'HiHat' || inst.name === 'Open') &&
            isHeavySync &&
            !config.blockAdjacentSnare &&
            // Respect phrase-release lane ownership: when the strategy has routed this
            // step to the Open articulation (soundName='Open', shouldPlay=false on the
            // HiHat lane), entropy must not reclaim it as a closed-hat hit.
            currentState.soundName !== 'Open'
        ) {
            currentState.shouldPlay = true;
            // why: draw 3 (discriminator 5) — entropy hihat velocity in [0.2, 0.4).
            // Discriminator 5 separates this from draws 1 and 2. Range matches prior
            // Math.random(): 0.2 + r*0.2 ∈ [0.20, 0.40). Kept in a separate branch
            // from draw 2 (Snare) so a single step can't trigger both velocity paths.
            currentState.velocity = 0.2 + scrambleHash((_entropyBaseSeed + 5) | 0) * 0.2;
            currentState.soundName = 'HiHat';
        }
    }

    // --- Imperfect Symmetry: per-bar ghost-note permutation on repeat passes ---
    // why: epic-form-arrangement S3 — when a section repeats (Verse 2 vs Verse 1),
    // the drums otherwise produce an identical 16-step pattern, making the band
    // sound mechanical on repeated form. On the restatement we permute ONE ghost
    // note per 16-step bar (per Snare/HiHat lane) by toggling its play state at
    // a seeded, non-foundational step. Mirrors the bass S2 pattern; same seed
    // recipe `(sectionIdHash, occurrence, barIndex, instName)`.
    //
    // Musical intent: "this drummer pushed the ghost one 16th later on Verse 2."
    // The skeleton (Kick on 1, Snare backbeat) is preserved — we only touch
    // non-foundational subdivisions where a real drummer would naturally vary
    // the embellishment between passes. Kick lane is exempt entirely so the
    // pocket's bottom never moves.
    //
    // Toggle semantics (musically symmetric — picks the seeded step regardless
    // of whether it's currently a hit, then flips it):
    //   - currently playing → drop to silent (the drummer "skipped" that ghost)
    //   - currently silent  → add a ghost hit at low velocity (the drummer
    //     "added" a ghost where none existed on the Statement pass)
    // Either way the bar's hit distribution changes by exactly one event.
    //
    // Source: docs/audit/form-arranger.md P1 #7;
    //         docs/audit/epic-form-arrangement.md S3.
    const sectionOccurrenceSafe: number = sectionOccurrence ?? 1;
    const isRepeatPassDrums = sectionOccurrenceSafe >= 2;
    const isGhostLane = inst.name === 'Snare' || inst.name === 'HiHat' || inst.name === 'Open';
    // why: epic-form-arrangement S4 precedence — on the form's final bar, the
    // resolution gesture (Crash + sustained cymbal) overrides Imperfect Symmetry.
    // Gating the ghost-permutation block prevents a "skipped ghost" from landing
    // on the same bar as the cadence crash, which would muddy the resolution.
    const isFinalMeasureDrums = isFinalMeasure === true;
    if (
        !isFinalMeasureDrums &&
        isRepeatPassDrums &&
        isGhostLane &&
        arrangerState.timeSignature === '4/4'
    ) {
        // why: skip foundational positions — downbeat (step 0) and backbeats
        // (steps 4, 12 in 4/4) define the genre's groove skeleton; permuting
        // them would read as a glitch, not as expressive variation. Allowed
        // candidates are the 13 remaining 16th positions per bar.
        const FOUNDATIONAL_STEPS_4_4 = new Set([0, 4, 12]);
        if (!FOUNDATIONAL_STEPS_4_4.has(loopStep)) {
            // Hash sectionId string (djb2 ×33-from-5381) for stable per-section
            // variation — canonical helper, see hash-utils.ts.
            const sectionIdStr: string = sectionIdFromTick || sectionId || '';
            const sectionIdHash = stringHash33(sectionIdStr);
            // why: also fold the instrument name so Snare and HiHat each get
            // their own target step within the bar — otherwise both lanes
            // would permute on the same 16th, doubling the gesture. djb2
            // ×31-from-0 variant (stringHash31) — kept distinct from the
            // section hash so this lane's seeded distribution is unchanged.
            const instNameHash = stringHash31(inst.name ?? '');
            // why: a bare djb-style polynomial hash of short instrument names
            // ("Snare" vs "HiHat") leaves the low bits poorly distributed, so
            // the XOR below can correlate adjacent lanes. Run it through the
            // canonical mulberry32 scramble first so each lane gets a
            // well-mixed 32-bit integer to fold into targetSeed.
            const instHash = (scrambleHash(instNameHash) * 0x100000000) | 0;
            const targetSeed = scrambleHash(
                (sectionIdHash ^
                    (sectionOccurrenceSafe * 0x9e3779b1) ^
                    (barIndex * 0x85ebca77) ^
                    (instHash * 0x27d4eb2f)) |
                    0,
            );
            // 13 non-foundational candidate steps: [1,2,3,5,6,7,8,9,10,11,13,14,15]
            const candidateSteps = [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15];
            const targetStep = candidateSteps[Math.floor(targetSeed * candidateSteps.length)];
            if (loopStep === targetStep && !inst.muted) {
                if (currentState.shouldPlay) {
                    // why: drop this ghost — the drummer skipped it on the repeat.
                    // Preserve soundName so logging stays informative.
                    currentState.shouldPlay = false;
                } else {
                    // why: add a ghost at low velocity. 0.18 sits in the ghost-velocity
                    // band used elsewhere in this engine (entropy ghost = 0.1+rand*0.15,
                    // entropy hat = 0.2+rand*0.2). For Snare, route to Sidestick at low
                    // intensity to match the entropy-phase convention at line 304.
                    // S8 2026-05-17: this gate stays at 0.4 by design (see line 304 rationale);
                    // per-genre gates were swept to 0.3, ghost-fills across all genres stay rim.
                    currentState.shouldPlay = true;
                    currentState.velocity = 0.18;
                    if (inst.name === 'Snare') {
                        currentState.soundName =
                            playback.bandIntensity < 0.4 ? 'Sidestick' : 'Snare';
                    } else {
                        currentState.soundName = 'HiHat';
                    }
                }
            }
        }
    }

    // --- Final-Bar Resolution Cymbal (epic-form-arrangement S4) ---
    // why: form-arranger.md P1 #6 — when song-mode playback is ending, the band
    // should signal the ending across all instruments. Today the drum engine
    // only signals via the section-boundary Crash (line ~221) — which fires on
    // every section turnaround, not on the song's last bar. Add an explicit
    // final-bar gesture: Crash + sustained Open cymbal on beat 1, plus a
    // reinforced Kick. The "final cymbal swell" of the audit doc.
    //
    // Lane assignments mirror the section-boundary Crash routing (line ~221)
    // and `crash-routing-critique.test.ts`: route the crash on the Open lane to
    // avoid the double-Crash audio artifact (synth-drums.ts:949-955's
    // lastCrashGain ramp-down would otherwise choke the second voice's tail).
    // Kick gets a reinforced thump for arrival weight. The HiHat lane is left
    // alone — its closed-hat ticking on the final bar would clutter the swell.
    // Snare gets a final accent on the downbeat (a "punctuation snare hit") if
    // present.
    //
    // Suppressing other voices on the final bar: we ALSO drop HiHat hits past
    // beat 1, so the Open/Crash swell rings out cleanly. Snare backbeats are
    // left alone (a real drummer keeps the backbeat through the final bar's
    // hit; only the cymbal stops ticking).
    //
    // Precedence: this block runs AFTER imperfect-symmetry (which itself is
    // gated off above on the final bar), AFTER section-boundary crash routing,
    // and BEFORE velocity humanization — so the seed-jitter still applies for
    // a natural feel even on the cadence hit.
    //
    // Source: docs/audit/form-arranger.md P1 #6;
    //         docs/audit/epic-form-arrangement.md S4.
    if (isFinalMeasureDrums) {
        if (isDownbeat) {
            // Beat 1 of the final bar: fire the resolution gesture per-lane.
            if (inst.name === 'Open') {
                // why: Open lane carries the Crash for the final-bar swell —
                // same routing convention as the section-boundary crash above
                // (line ~225). Velocity 1.25 — strong arrival, kept below the
                // synth ceiling 1.4 so it doesn't clip.
                currentState.shouldPlay = true;
                currentState.soundName = 'Crash';
                currentState.velocity = 1.25;
            } else if (inst.name === 'Kick') {
                // why: reinforced kick on the final downbeat — the bass and
                // chord cadence both anchor on beat 1; the kick anchors the
                // drums alongside them.
                currentState.shouldPlay = true;
                currentState.velocity = 1.3;
            } else if (inst.name === 'Snare') {
                // why: a punctuation snare on the final downbeat (a real
                // drummer would not skip the backbeat-arrival accent). 1.15 —
                // strong but below the kick/crash so the swell remains the
                // dominant gesture.
                currentState.shouldPlay = true;
                currentState.velocity = 1.15;
            } else if (inst.name === 'HiHat' && !HAT_DENSE_GENRES.has(groove.genreFeel)) {
                // why: suppress the closed-hat on beat 1 — the Open Crash is
                // what we want ringing through the bar. Closed hat overlay
                // would clutter the swell. Gated per-genre (Epic 12 S6 B6):
                // in 8th-note-hat genres (HAT_DENSE_GENRES) the hat is part of
                // the spine, so silencing it reads as an abrupt drop-out
                // rather than a swell-breathing decision.
                currentState.shouldPlay = false;
            }
        } else {
            // After beat 1: silence Open (the Crash's tail rings on its own)
            // and the HiHat in sparse-hat genres. In HAT_DENSE_GENRES we let
            // the hat ticker continue through the final bar (Epic 12 S6 B6) —
            // chopping it for a swell that doesn't fit the genre would read
            // as the band dropping out, not as a cadence gesture.
            if (inst.name === 'Open') {
                currentState.shouldPlay = false;
            } else if (inst.name === 'HiHat' && !HAT_DENSE_GENRES.has(groove.genreFeel)) {
                currentState.shouldPlay = false;
            }
            // Snare/Kick: let the strategy/entropy decide as usual — a real
            // drummer might add a backbeat or a kick echo on beat 3 of the
            // final bar. We don't actively suppress those.
        }
    }

    if (currentState.shouldPlay && !inst.muted) {
        if (inst.name === 'HiHat' || inst.name === 'Open') {
            currentState.velocity *= pulseWeight;
        }

        if (inst.name === 'Snare' && isBackbeat && config.backbeatCrack) {
            currentState.velocity *= 1.15;
        }

        const jitterAmount = inst.name === 'Kick' ? 0.04 : 0.08;
        // why: seed by (step, full instrument name hash) so each instrument's
        // jitter is independent but reproducible. Folding the full string is
        // required because charCodeAt(0) alone collides on real lane pairs:
        // Clave/Conga (C), HiHat/HighTom (H), Snare/Shaker (S) — see S5 review P1.
        // djb2 ×31-from-0 (stringHash31) — preserves this site's prior output.
        const nameHash = stringHash31(inst.name ?? '');
        const humanSeed = step * 41 + nameHash * 7;
        currentState.velocity = humanizeVelocity(currentState.velocity, humanSeed, jitterAmount);
    }

    return currentState;
}

export function calculateStepDuration(step: number, bpm: number, ts: any, groove: any): number {
    const sixteenthSec = 0.25 * (60.0 / bpm);
    let duration = sixteenthSec;

    if (groove.swing > 0) {
        if (ts.stepsPerBeat === 4) {
            const shift = (sixteenthSec / 3) * (groove.swing / 100);
            if (groove.swingSub === '16th') {
                duration += step % 2 === 0 ? shift : -shift;
            } else {
                // 8th note swing logic: Weighted 'Loping' distribution across 4 subdivisions
                const subIndex = step % ts.stepsPerBeat;
                const weights = [1.5, 0.5, -0.5, -1.5];
                duration += shift * weights[subIndex];
            }
        } else if (ts.stepsPerBeat === 3) {
            const shift = (sixteenthSec / 3) * (groove.swing / 100);
            duration +=
                groove.swingSub === '16th'
                    ? step % 2 === 0
                        ? shift
                        : -shift // 16th note swing over compound meters doesn't map exactly to '8th note' logic the same way
                    : step % ts.stepsPerBeat === 0
                      ? shift // on macro beat
                      : step % ts.stepsPerBeat === 2
                        ? -shift // 3rd triplet part
                        : 0; // middle triplet stays same or slightly nudged based on deeper logic, simple offset for now
        }
    }

    return duration;
}

export function calculatePocketOffset(playback: any, groove: any): number {
    let pocketOffset = calculateTimingOffset('drums', groove.pocket, playback.bandIntensity);
    const strategy = getStrategy(groove);
    if (strategy?.config.dillaFeel) {
        pocketOffset += 0.015;
    }
    return pocketOffset;
}

export function getDrumMotif(
    seed: number,
    genreFeel: string,
    complexity: number,
    intensity = 1.0,
): number {
    const mockGroove = { genreFeel };
    const strategy = getStrategy(mockGroove);
    if (strategy?.getMotif) {
        return strategy.getMotif(seed, complexity, intensity);
    }
    return 0;
}
