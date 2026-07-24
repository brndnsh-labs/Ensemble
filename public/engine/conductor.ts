import { TIME_SIGNATURES } from '../config.js';
import { analyzeForm, getJamMacroArc, getSectionEnergy } from '../form-analysis.js';
import { saveCurrentState } from '../persistence.js';
import type { EnsembleState } from '../types.js';
import { ACTIONS } from '../types.js';
import { triggerFlash } from '../ui.js';
import { binarySearchMap, binarySearchMapIndex } from '../utils.js';
import { loopArcMultiplier } from './arc.js';
import { macroArcLadder } from './coordination-engine.js';
import { generatePhrasePickup, generateProceduralFill } from './fills.js';
import { getPhraseSeed } from './grooves/utils.js';
import { createPRNG, deriveSectionSeed, stringHash31 } from './hash-utils.js';
import { REVERB_PRESETS } from './reverb.js';
import { effectiveTargetIntensity, RAMP_INTENSITY_MULTIPLIER } from './section-overrides.js';

/**
 * Genres that get the lush hall reverb preset; everything else gets the tight
 * room. Slow, open, harmonically rich styles want a long tail — punchy,
 * percussive styles want the groove to stay articulate.
 */
// Exported for tests/standards/genre-feel-canon-guard.test.ts (#1208) only.
export const HALL_GENRES = new Set(['Jazz', 'Blues', 'Bossa Nova', 'Neo-Soul', 'Acoustic']);

/**
 * Genres whose interior-phrase "breathing" is NOT a driving snare lead-in, so
 * the within-section phrase pickup (`checkSectionTransition`) stays off for
 * them. These are the brush / sidestick / clave / sparse-by-design feels:
 * a jazz drummer breathes on the ride and comping, and a reggae One Drop and a
 * bossa live on the sidestick — a snare 16th flurry into the downbeat reads as
 * an out-of-idiom intrusion in all of them. Everything else (Rock/Funk/Disco/
 * Country/Blues/Metal/Hip Hop/Neo-Soul/Ska) is a snare-backbeat genre where the
 * lead-in is idiomatic. Mirrors the sparse-hat grouping in `groove-engine.ts`,
 * minus Country/Blues (whose train-beat/shuffle phrasing DOES want the pickup).
 */
const PICKUP_SUPPRESSED_GENRES = new Set(['Jazz', 'Bossa Nova', 'Reggae', 'Acoustic']);

type Dispatch = (action: any, payload?: any) => void;

/**
 * Per-genre `targetEnergy` floors for the auto-intensity macro-arc.
 *
 * why: the macro-arc ladder and `getSectionEnergy` both produce values that
 * cluster around 0.4–0.5 for low-energy windows, which sits BELOW the
 * Snare-vs-Sidestick gates in several genres (funk's `applyOverrides` at 0.3
 * post-S8, neo-soul's INTENSITY_BANDS.LOW=0.35, disco's 0.35) and makes the
 * groove read as "polite rim-shot" where a real player would crack the snare.
 *
 * Genres listed here have a real natural floor — funk's pocket NEVER drops
 * below "engaged"; bossa/jazz legitimately go quieter. Genres NOT in the map
 * preserve the prior no-floor behavior so the macro-arc can still take them
 * down to 0.1 for ambient/lyrical passages.
 *
 * Values are starting points (audit doc 2026-05-17 listening test); expect
 * ±0.05 tuning once we measure realized bandIntensity in critique tests.
 */
// Exported for tests/standards/genre-feel-canon-guard.test.ts (#1208) only.
export const GENRE_INTENSITY_FLOORS: Record<string, number> = {
    // why: funk pocket needs to crack — Snare gate at 0.3, floor at 0.45 keeps
    // backbeat well above with headroom for verse breakdowns.
    Funk: 0.45,
    // why: neo-soul snare gate is INTENSITY_BANDS.LOW=0.35; 0.40 keeps the
    // dilla-pocket snare just above the rim-shot threshold.
    'Neo-Soul': 0.4,
    // why: disco is a high-energy genre by definition — four-on-the-floor
    // needs presence; 0.45 keeps the kick punching.
    Disco: 0.45,
    // why: existing Rock/Metal floor preserved (was hard-coded in
    // the `macroFloor` ladder pre-S8).
    Rock: 0.35,
    Metal: 0.35,
    // why: jazz and bossa legitimately operate quietly — sidestick comping
    // and brush ride ARE the genre identity at low intensity. Floor still
    // present so we don't bottom out at 0.1 (dead-air) on a moody chart.
    Jazz: 0.3,
    // why: this table is keyed by `groove.genreFeel`, not the picker name — see
    // the GENRE-NAMING AUTHORITY block in data/smart-genres.ts. A 'Bossa' key
    // would never match in production.
    'Bossa Nova': 0.3,
    // why: ska-punk's signature upbeat-crack (offbeat hat + snare-on-2-and-4) is
    // genre identity; without a floor the conductor can park bandIntensity below
    // the velocity threshold where that crack reads as energy. Epic 12 S6 B3 —
    // chosen by analogy with Disco's 0.45 floor, one notch lower because ska-punk's
    // snare-on-the-and is less load-bearing than disco's four-on-the-floor kick.
    // why: canonical genreFeel for the Ska-Punk genre is 'Ska' (smart-genres.ts) —
    // the old 'Ska-Punk' key (the preset name) never matched, so the floor was dead
    // and the upbeat-crack could fall below the velocity threshold. Epic 2 S1.
    Ska: 0.4,
};

/**
 * Amplitude of the ±jitter applied to `targetEnergy` during the session-timer
 * macro-arc (applied via `macroJitterPrng`). The jitter adds `Math.random() * MACRO_JITTER_RANGE - MACRO_JITTER_RANGE / 2`
 * so the realized target varies by ±MACRO_JITTER_RANGE/2 around the ladder value.
 *
 * why: 0.15 is wide enough for the band to breathe naturally between arc
 * waypoints without the energy ladder feeling metronomic, but narrow enough
 * that it can't accidentally push from one arc window (e.g. warmup ceiling 0.45)
 * into an adjacent window's floor (development floor 0.40 — gap is 0.05).
 * Exported so critique tests can assert the exact jitter band without
 * hard-coding the 0.15 literal independently.
 */
export const MACRO_JITTER_RANGE = 0.15;

export function analyzeFormUI(arranger: EnsembleState['arranger'], dispatch?: Dispatch) {
    const form = analyzeForm(arranger);
    if (form && dispatch) {
        dispatch(ACTIONS.UPDATE_CONDUCTOR_STATE, { form });
    }
}

export function applyConductor(state: EnsembleState, dispatch: Dispatch) {
    const { playback, groove } = state;
    const intensity = playback.bandIntensity; // 0.0 - 1.0
    const complexity = playback.complexity; // 0.0 - 1.0

    // --- 1. Master Dynamics ---
    let targetDensity = 'standard';
    if (intensity < 0.4) {
        targetDensity = 'thin';
    } else if (intensity > 0.85) {
        targetDensity = 'rich';
    }

    const targetVelocity = 0.7 + intensity * 0.45; // 0.7x to 1.15x (Adjusted to avoid overloads)

    // --- 4. Harmony Evolution ---
    // Harmonies follow the complexity signal for activity level.
    let targetHbComplexity = complexity;

    // Song Mode ending: in the last 30s, floor harmony complexity high so the
    // outro's harmonic activity fills in. Note this bumps harmony density ONLY —
    // the end-of-song tempo ritardando is a separate, per-genre mechanism in
    // engine/resolution.ts, not a full build here. (#800)
    if (playback.songMode && playback.isEndingPending) {
        targetHbComplexity = Math.max(targetHbComplexity, 0.85);
    }

    dispatch(ACTIONS.UPDATE_CONDUCTOR_DECISION, {
        density: targetDensity,
        velocity: targetVelocity,
    });

    dispatch(ACTIONS.UPDATE_HB, {
        complexity: targetHbComplexity,
    });

    // #1063: the old "mirror getBandPocket onto bass.pocketOffset" write was
    // removed — nothing ever read that param (the lanes call getBandPocket
    // directly; see docs/design/timing-model.md §4).
    const genre = groove.genreFeel;

    // --- 5. Intensity-Aware Mix Shaping ---
    if (playback.audio && playback.audioGraph) {
        const time = playback.audio.currentTime;
        const ramp = 0.5;
        const graph = playback.audioGraph;

        // Master Limiter: Tighter at high intensity to glue the mix
        const limiter = graph.master.limiter;
        const targetThreshold = -1.5 - intensity * 1.5; // Lower threshold (-1.5 to -3.0 dB)
        const targetRatio = 4 + intensity * 4; // Transparent ratio (4:1 to 8:1)
        const targetRelease = 0.08; // Fast release to avoid pumping

        limiter.threshold.setTargetAtTime(targetThreshold, time, ramp);
        limiter.ratio.setTargetAtTime(targetRatio, time, ramp);
        limiter.release.setTargetAtTime(targetRelease, time, ramp);

        // --- Pro Mix Spectral Slotting & Panning ---
        graph.chords.eq.frequency.setTargetAtTime(250, time, ramp);
        if (graph.chords.panner) {
            graph.chords.panner.pan.setTargetAtTime(-0.2, time, ramp);
        }
        graph.bass.eq.type = 'highpass';
        graph.bass.eq.frequency.setTargetAtTime(40, time, ramp);

        graph.soloist.eq.type = 'highshelf';
        graph.soloist.eq.frequency.setTargetAtTime(8000, time, ramp);
        graph.soloist.eq.gain.setTargetAtTime(-3, time, ramp); // Tame harshness

        graph.harmonies.eq.frequency.setTargetAtTime(300, time, ramp);
        if (graph.harmonies.panner) {
            graph.harmonies.panner.pan.setTargetAtTime(0.2, time, ramp);
        }

        // Reverb Cleaning (Abbey Road)
        graph.master.reverbPreFilter.frequency.setTargetAtTime(600, time, ramp);

        // Per-genre reverb space: a lush hall for slow, open genres; a tight
        // room for punchy, percussive ones so the groove stays articulate.
        const reverbPreset = HALL_GENRES.has(genre) ? REVERB_PRESETS.hall : REVERB_PRESETS.room;
        graph.master.reverb.applyPreset(reverbPreset, time);
    }
    // #1127 — no debounceSaveState() here: this runs ~every step during an
    // intensity ramp and would perpetually reset the persistence chokepoint's
    // debounce, starving genuine saves. applyConductor changes no persisted
    // field; the loop-boundary saveCurrentState() below is the periodic flush.
}

/**
 * Updates auto-intensity and monitors the band's "conversation".
 */
export function updateAutoConductor(state: EnsembleState, dispatch: Dispatch) {
    const { playback, conductor } = state;
    if (!playback.autoIntensity || !playback.isPlaying) {
        return;
    }

    // why: when the playhead is inside a section that carries a `targetIntensity`
    // override, the auto-conductor should ramp toward that section-local target
    // instead of the global one. Falls back to `conductor.targetIntensity` when
    // no override is present, preserving identical behavior for charts that
    // don't use per-section arrangement.
    const effectiveTarget = effectiveTargetIntensity(state, playback.step || 0);

    if (Math.abs(playback.bandIntensity - effectiveTarget) > 0.001) {
        // why: asymmetric ramp — bands "settle in and build," leaning into rises and
        // easing out of drops. Original S8 inversion shipped 0.5×-down / 1.5×-up;
        // softened to 0.75 / 1.25 (Epic 12 S6 / LISTEN_TESTS B2) because the 1.5×
        // up-ramp could leap the realized bandIntensity by ≈+0.25 in a single
        // measure, reading as a lurch on rising section boundaries. 0.75 / 1.25
        // preserves the asymmetry intent (ups still faster than downs) but caps the
        // per-measure rise at ≈+0.0625 — a musically natural swell rather than a step
        // change. Companion fixes from S8 — per-genre floors below + the drum-gate
        // sweep — still apply unchanged.
        const multiplier =
            playback.bandIntensity > effectiveTarget
                ? RAMP_INTENSITY_MULTIPLIER.down
                : RAMP_INTENSITY_MULTIPLIER.up;
        let newIntensity =
            playback.bandIntensity +
            (playback.bandIntensity < effectiveTarget
                ? Math.abs(conductor.stepSize)
                : -Math.abs(conductor.stepSize)) *
                multiplier;
        newIntensity = Math.max(0.01, Math.min(1.0, newIntensity));

        if (newIntensity !== playback.bandIntensity) {
            dispatch(ACTIONS.SET_BAND_INTENSITY, newIntensity);
        }

        applyConductor(state, dispatch);
    }
}

export function checkSectionTransition(
    state: EnsembleState,
    currentStep: number,
    stepsPerMeasure: number,
    dispatch: Dispatch,
) {
    const { groove, arranger, playback, conductor } = state;
    if (!groove.enabled) {
        return;
    }

    // Find where we are
    const total = arranger.totalSteps;
    if (total === 0) {
        return;
    }
    const modStep = currentStep % total;
    const seedTimelineStartStep = groove.seedTimelineStartStep || 0;
    const seedTimelineStep = currentStep - seedTimelineStartStep;
    const seededTimelineEnd =
        groove.orchestrationMap?.[groove.orchestrationMap.length - 1]?.end || 0;
    const seededTimelineActive =
        seedTimelineStep >= 0 && (!seededTimelineEnd || seedTimelineStep < seededTimelineEnd);

    // Trigger major transitions (fills/intensity updates) only at the start of a measure.
    // We want to trigger when the measure about to be scheduled is the LAST measure of a section or the loop.
    if (modStep % stepsPerMeasure === 0) {
        const seededFill = seededTimelineActive ? groove.fillMap?.[seedTimelineStep] : null;
        const nextSeededOrchestration =
            seededTimelineActive && groove.orchestrationMap
                ? binarySearchMap(groove.orchestrationMap, seedTimelineStep + stepsPerMeasure)
                : null;

        if (seededFill && !groove.fillActive) {
            dispatch(ACTIONS.TRIGGER_FILL, {
                steps: seededFill.steps,
                startStep: currentStep,
                length: seededFill.length,
                crash: seededFill.crash,
            });

            if (playback.visualFlash) {
                triggerFlash(0.25);
            }
        }

        if (playback.autoIntensity && nextSeededOrchestration?.energyLevel !== undefined) {
            let targetEnergy = Math.max(0.1, Math.min(1.0, nextSeededOrchestration.energyLevel));
            // Synth-audit Epic 7 S4: loop-driven intensity arc. When the user has set
            // a finite loopLimit, ride a hold+lift envelope across loops so all four
            // engines build/release in phase. loopLimit=0 (free-form jam) keeps
            // bit-identical behavior.
            // why: macro-arc gated on explicit `loopLimit > 1`. Timer mode is
            // shaped by the separate session-progress arc above (elapsed-minute
            // ramp) — stacking both produces a 0.85× early-loop crush that
            // contradicts the session-progress shape. The fuzzy-timer fix lives
            // in scheduler-core's end condition + the Arrange tab's loop-strip
            // visualization, not here.
            if (playback.loopLimit > 1) {
                targetEnergy = Math.max(
                    0.1,
                    Math.min(
                        1.0,
                        targetEnergy *
                            loopArcMultiplier(playback.currentLoopCount, playback.loopLimit),
                    ),
                );
            }
            // #796: apply the per-genre intensity floor on the LIVE seeded path too.
            // `GENRE_INTENSITY_FLOORS` was previously read only in the
            // targetEnergy-undefined fallback branch, which the seeded window makes
            // unreachable — so funk/disco/neo-soul/ska verses rode below their genre
            // floor and never crossed their signature drum gates (e.g. funk's 0.5
            // 16th-hat shimmer). Applied AFTER the loop-arc multiplier so the floor is a
            // hard minimum the arc-release can't sink below, mirroring the fallback's
            // late-stage `GENRE_INTENSITY_FLOORS` clamp.
            const genreFloor = GENRE_INTENSITY_FLOORS[groove.genreFeel];
            if (genreFloor !== undefined) {
                targetEnergy = Math.max(genreFloor, targetEnergy);
            }
            // why: when the upcoming measure falls inside a section with a
            // `targetIntensity` override, size the per-tick stepSize to close
            // that gap (not the orchestration-map target). Without this, an
            // override of 0.9 against a global of 0.5 would still ramp at the
            // smaller stride — likely never reaching the override before the
            // section ends. updateAutoConductor then uses effectiveTarget for
            // direction; this aligns the magnitude.
            const overrideTarget = effectiveTargetIntensity(state, currentStep + stepsPerMeasure);
            const rampTarget =
                overrideTarget !== state.conductor.targetIntensity ? overrideTarget : targetEnergy;
            dispatch(ACTIONS.UPDATE_CONDUCTOR_STATE, {
                targetIntensity: targetEnergy,
                stepSize: (rampTarget - playback.bandIntensity) / stepsPerMeasure,
            });
        }

        const measureEnd = modStep + stepsPerMeasure;

        // We look at the chord at the END of the measure to see if we are transitioning.
        // This is crucial for Jazz Blues or split-bar turnarounds where the last chord
        // of the measure is different from the first.
        const effectiveStep = measureEnd - 1;
        const entry = binarySearchMap(arranger.stepMap || [], effectiveStep);

        if (!entry) {
            return;
        }
        const isLoopEnd = measureEnd >= total;

        // Find the chord at the beginning of the NEXT section/loop iteration
        const nextChordIdx = isLoopEnd
            ? 0
            : binarySearchMapIndex(arranger.stepMap || [], measureEnd);
        const nextEntry = nextChordIdx !== -1 ? arranger.stepMap[nextChordIdx] : null;

        if (nextEntry && (isLoopEnd || nextEntry.chord.sectionId !== entry.chord.sectionId)) {
            // --- 1. THE SOLOIST TRADE ---
            // Real musicians trade even if there isn't a drum fill!
            const { soloist: soloistState } = state;
            if (
                soloistState &&
                (soloistState.tradeMode === 'sections' ||
                    (soloistState.tradeMode === 'loops' && isLoopEnd))
            ) {
                const nextSoloState = !soloistState.enabled;
                const sbUpdate: Record<string, unknown> = { enabled: nextSoloState };

                if (nextSoloState) {
                    Object.assign(sbUpdate, {
                        isWaitingForEntry: true,
                        isResting: true,
                        isYielding: false,
                        activeSteps: 0,
                        restSteps: 0,
                    });
                } else {
                    Object.assign(sbUpdate, {
                        isYielding: true,
                        isWaitingForEntry: false,
                    });
                }

                dispatch(ACTIONS.UPDATE_SB, sbUpdate);
                saveCurrentState();
            }

            let shouldFill = true;

            // CHECK FOR SEAMLESS TRANSITION
            const nextSectionId = nextEntry.chord.sectionId;
            const nextSection = arranger.sections.find((s: any) => s.id === nextSectionId);
            if (nextSection?.seamless) {
                shouldFill = false;
            }

            if (isLoopEnd && shouldFill) {
                const nextFormIteration = conductor.formIteration + 1;
                dispatch(ACTIONS.UPDATE_CONDUCTOR_STATE, {
                    formIteration: nextFormIteration,
                });

                // Dynamic threshold based on measure length
                // If the total song length is 4 measures or fewer, we treat it as a short loop.
                const isShortLoop = arranger.totalSteps <= stepsPerMeasure * 4;

                if (isShortLoop) {
                    // How many full loop iterations before triggering a transition fill?
                    // High intensity = fill every loop (1).
                    // Medium intensity = fill every 2 loops.
                    // Low intensity = fill every 4 loops.
                    const loopFrequency =
                        playback.bandIntensity > 0.75 ? 1 : playback.bandIntensity > 0.4 ? 2 : 4;
                    shouldFill = nextFormIteration % loopFrequency === 0;
                }
            }

            if (shouldFill) {
                let targetEnergy = nextSeededOrchestration?.energyLevel;

                if (targetEnergy === undefined) {
                    targetEnergy = 0.5;
                    const currentInt = playback.bandIntensity;

                    // --- 1. THE MACRO-ARC ---
                    let macroFloor = 0.2,
                        macroCeiling = 0.6;

                    // Priority: SESSION TIMER ARC
                    if (playback.sessionTimer > 0 && playback.sessionStartTime > 0) {
                        const elapsedMins = (performance.now() - playback.sessionStartTime) / 60000;
                        const progress = Math.min(1.0, elapsedMins / playback.sessionTimer);

                        ({ macroFloor, macroCeiling } = macroArcLadder(progress));
                    } else {
                        // Fallback: open-ended jam (no session timer) — a
                        // genre-aware raised-cosine swell with deterministic
                        // per-cycle variation, replacing the old rigid
                        // `formIteration % 8` sawtooth that snapped the energy
                        // band back to a quiet intro every 8 form-repeats.
                        ({ macroFloor, macroCeiling } = getJamMacroArc(
                            conductor.formIteration,
                            groove.genreFeel,
                        ));
                    }

                    // --- 2. THE LOCAL FUNCTIONAL ROLE ---
                    if (conductor.form && (conductor.form as any).sections) {
                        const nextSection = (conductor.form as any).sections.find(
                            (s: any) => s.id === nextEntry.chord.sectionId,
                        );
                        if (nextSection) {
                            // why: switch arms used to enumerate a formal-music
                            // vocabulary (Exposition/Development/Climax/...)
                            // that `analyzeForm` never emits — only `Build`
                            // overlapped, so six of seven arms were dead and
                            // every section fell through to the
                            // `getSectionEnergy(label)` default. Renamed to
                            // mirror `analyzeForm`'s actual output (Intro,
                            // Outro, Peak, Main Theme, Theme B, Bridge,
                            // Variation, Refrain, Build) with energies that
                            // preserve the musical intent of the old arms
                            // (Intro ≈ Exposition, Peak ≈ Climax, Outro ≈
                            // Resolution, Refrain ≈ Recapitulation, Bridge ≈
                            // Contrast). `Variation` (only emitted when
                            // section flux > 2.8) sits slightly hotter than
                            // `Theme B` to honor the flux signal.
                            const role = nextSection.role;
                            switch (role) {
                                case 'Intro':
                                    targetEnergy = macroFloor + 0.1;
                                    break;
                                case 'Outro':
                                    targetEnergy = macroFloor - 0.1;
                                    break;
                                case 'Peak':
                                    targetEnergy = macroCeiling + 0.1;
                                    break;
                                case 'Main Theme':
                                case 'Theme B':
                                    targetEnergy = (macroFloor + macroCeiling) / 2 + 0.1;
                                    break;
                                case 'Variation':
                                    targetEnergy = (macroFloor + macroCeiling) / 2 + 0.15;
                                    break;
                                case 'Bridge':
                                    targetEnergy =
                                        currentInt > (macroFloor + macroCeiling) / 2
                                            ? macroFloor
                                            : macroCeiling;
                                    break;
                                case 'Refrain':
                                    targetEnergy = macroFloor + 0.2;
                                    break;
                                case 'Build':
                                    targetEnergy = macroCeiling;
                                    break;
                                default:
                                    targetEnergy = getSectionEnergy(nextSection.label);
                            }
                            if (nextSection.flux > 2.6) {
                                targetEnergy += 0.1;
                            }
                            if (nextSection.iteration === 2) {
                                targetEnergy += 0.1;
                            } else if (nextSection.iteration >= 3) {
                                targetEnergy -= 0.15;
                            }
                        } else {
                            targetEnergy = getSectionEnergy(nextEntry.chord.sectionLabel);
                        }
                    } else {
                        targetEnergy = getSectionEnergy(nextEntry.chord.sectionLabel);
                    }

                    targetEnergy = Math.max(macroFloor, Math.min(macroCeiling, targetEnergy));
                    // #793: seed the per-section macro jitter off
                    // (formIteration, currentStep) instead of raw Math.random.
                    // These draws sit only in the targetEnergy-undefined fallback
                    // (unreachable while the ~128-bar seeded window is active), so
                    // default timer sessions were already repeatable — but a long
                    // open jam that outruns the window used to acquire
                    // non-repeatable drift that can randomly cross a drum gate
                    // (e.g. funk's 0.5 shimmer) and desync the arc thereafter.
                    // createPRNG is the same seeded PRNG the fallback fill uses.
                    const macroJitterPrng = createPRNG(
                        `macro-jitter:${conductor.formIteration}:${currentStep}`,
                    );
                    targetEnergy += macroJitterPrng() * MACRO_JITTER_RANGE - MACRO_JITTER_RANGE / 2;

                    // why: genre-specific floors keep the auto-intensity above each
                    // genre's Snare-vs-Sidestick gate. Applied AFTER the random jitter
                    // (so a low jitter draw can't undo the floor) and BEFORE the global
                    // [0.1, 1.0] clamp. Centralized in `GENRE_INTENSITY_FLOORS` at
                    // module scope rather than scattered across groove configs so the
                    // blast radius stays inside conductor.ts. See S8 (epic-form-arrangement).
                    const genreFloor = GENRE_INTENSITY_FLOORS[groove.genreFeel];
                    if (genreFloor !== undefined) {
                        targetEnergy = Math.max(genreFloor, targetEnergy);
                    }

                    targetEnergy = Math.max(0.1, Math.min(1.0, targetEnergy));

                    if (isLoopEnd && playback.autoIntensity) {
                        // #793: seed the loop-end jitter off currentLoopCount so a
                        // long looped session's energy arc is reproducible
                        // run-to-run instead of drifting cumulatively (±0.1/loop)
                        // by raw Math.random.
                        const loopEndJitterPrng = createPRNG(
                            `loop-end-jitter:${conductor.formIteration}:${playback.currentLoopCount}`,
                        );
                        targetEnergy = Math.max(
                            0.3,
                            Math.min(0.95, targetEnergy + (loopEndJitterPrng() * 0.2 - 0.1)),
                        );
                    }
                } else {
                    targetEnergy = Math.max(0.1, Math.min(1.0, targetEnergy));
                }

                const shouldUseProceduralFallback =
                    !groove.fillMap ||
                    !seededTimelineActive ||
                    seedTimelineStep >= seededTimelineEnd;
                if (shouldUseProceduralFallback) {
                    // why: #799 — seed the fallback so looped fills are
                    // reproducible. The primary fillMap path is deterministic;
                    // this fallback (reached once the seeded timeline runs dry —
                    // the extended-looping/practice case) used raw Math.random,
                    // so the fill template differed on every pass. Key on the
                    // (genre, step) of the fill so the same arrangement replays
                    // identically.
                    const fillPrng = createPRNG(`fallback-fill:${groove.genreFeel}:${currentStep}`);
                    const fillSteps = generateProceduralFill(
                        groove.genreFeel,
                        playback.bandIntensity,
                        stepsPerMeasure,
                        fillPrng,
                    );
                    // why: #799 — mirror the seeded path's "Crash Contract"
                    // (`pendingCrash` in generateDrumFills) instead of an unconditional crash on
                    // every fallback fill: crash when energy is rising into the
                    // fill, OR when arriving at an energetic section (target >
                    // 0.4) — a structural section/loop downbeat still wants the
                    // cymbal even if the energy delta is flat. Only a genuinely
                    // quiet, non-building transition now lands without a crash.
                    const energyRising = targetEnergy > playback.bandIntensity;
                    const fillCrash = energyRising || targetEnergy > 0.4;
                    dispatch(ACTIONS.TRIGGER_FILL, {
                        steps: fillSteps,
                        startStep: currentStep,
                        length: stepsPerMeasure,
                        crash: fillCrash,
                    });

                    if (playback.visualFlash) {
                        triggerFlash(0.25);
                    }
                }

                if (playback.autoIntensity) {
                    // Synth-audit Epic 7 S4: arc-modulate the seed-driven target so the
                    // loop envelope composes with the section's macro energy. See arc.ts.
                    // Gated on explicit `loopLimit > 1` only — timer-mode sessions use
                    // the session-progress arc above instead.
                    let arcedTarget = targetEnergy;
                    if (playback.loopLimit > 1) {
                        arcedTarget = Math.max(
                            0.1,
                            Math.min(
                                1.0,
                                targetEnergy *
                                    loopArcMultiplier(
                                        playback.currentLoopCount,
                                        playback.loopLimit,
                                    ),
                            ),
                        );
                    }
                    // #796: floor the seeded TRANSITION emission too — the paired
                    // seeded dispatch site. The mid-section seeded path is floored
                    // above, but a verse that begins AT a section boundary reaches
                    // *this* dispatch with its raw seeded `energyLevel` (the
                    // GENRE_INTENSITY_FLOORS clamp lives only in the undefined-
                    // targetEnergy fallback branch), so without this it lands below
                    // the genre floor on the downbeat and funk's 0.5 shimmer gate
                    // never trips. Applied after the loop-arc multiplier so the floor
                    // stays a hard minimum the arc can't sink below.
                    const genreFloor = GENRE_INTENSITY_FLOORS[groove.genreFeel];
                    if (genreFloor !== undefined) {
                        arcedTarget = Math.max(genreFloor, arcedTarget);
                    }
                    const overrideTarget = effectiveTargetIntensity(
                        state,
                        currentStep + stepsPerMeasure,
                    );
                    const rampTarget =
                        overrideTarget !== state.conductor.targetIntensity
                            ? overrideTarget
                            : arcedTarget;
                    dispatch(ACTIONS.UPDATE_CONDUCTOR_STATE, {
                        targetIntensity: arcedTarget,
                        stepSize: (rampTarget - playback.bandIntensity) / stepsPerMeasure,
                    });
                }

                // --- 3. THE DRUM SEED (section memory) ---
                if (nextSection) {
                    // Re-evaluate the drum seed only if it hasn't been set for this section
                    if (groove.sectionSeedMap?.[nextSection.id] === undefined) {
                        // #791: derive the section's groove marker from (sectionId,
                        // songSeed) instead of Math.random(). The groove-engine
                        // fallback derives the SAME value, so this write is now a
                        // memo (it pre-warms sectionSeedMap and seeds the
                        // drums-tick variation index) — never a source of a
                        // mid-section groove swap or a non-reproducible take.
                        const seed = deriveSectionSeed(nextSection.id, arranger.seed ?? '');
                        dispatch(ACTIONS.SET_GROOVE_SEED, { sectionId: nextSection.id, seed });
                    }
                }
            }
        }

        // --- THE WITHIN-SECTION PHRASE PICKUP ---
        // A real drummer breathes every few bars even when the form isn't
        // changing: a brief snare lead-in on the last beat of a 4-bar phrase,
        // sitting between the big section-transition fills handled above. The
        // seeded fillMap / procedural fills only fire at section/loop seams, so
        // without this the interior of a long section is mechanically even.
        // Deterministic (seeded per section+bar) so loops stay coherent. Skipped
        // if a transition fill already fired this measure (it set fillActive),
        // the section is too quiet to warrant a lead-in, or the genre doesn't
        // phrase with a driving snare (PICKUP_SNARE_GENRES) — a brush-jazz, a
        // reggae One Drop or a bossa would never throw snare 16ths into the
        // downbeat, so we leave their interior bars alone rather than impose a
        // rock idiom on every style.
        if (
            !groove.fillActive &&
            playback.bandIntensity > 0.45 &&
            !PICKUP_SUPPRESSED_GENRES.has(groove.genreFeel)
        ) {
            const sectionEntry = binarySearchMap(arranger.sectionMap || [], modStep);
            if (sectionEntry) {
                const barInSection = Math.floor((modStep - sectionEntry.start) / stepsPerMeasure);
                const PHRASE_BARS = 4; // standard 4-bar phrase hinge
                const isPhraseEnd = (barInSection + 1) % PHRASE_BARS === 0;
                // The section's last bar already gets the transition fill above.
                // Derive it from the SAME signal the transition uses — does the
                // next bar cross a section/loop boundary — rather than a
                // round(sectionLen / spm) bar count, which can disagree with the
                // transition's stepMap-sectionId check on a non-bar-aligned
                // section and let a pickup stack onto the transition bar.
                const nextBarStep = modStep + stepsPerMeasure;
                const nextSectionEntry =
                    nextBarStep >= total
                        ? null
                        : binarySearchMap(arranger.sectionMap || [], nextBarStep);
                const isSectionEndBar =
                    !nextSectionEntry || nextSectionEntry.id !== sectionEntry.id;

                if (isPhraseEnd && !isSectionEndBar) {
                    // Per-section seed so different sections don't pick up in
                    // lockstep; fall back to a stable hash of the section id
                    // for sections the creativity-memory block hasn't seeded.
                    let sectionSeed = groove.sectionSeedMap?.[sectionEntry.id];
                    if (typeof sectionSeed !== 'number') {
                        sectionSeed = (Math.abs(stringHash31(sectionEntry.id)) % 256) / 256;
                    }

                    // Two independent deterministic draws: fire (salt 0) and
                    // variant (salt 1). why: floor 0.2 keeps a section just above
                    // the 0.45 gate breathing only sparingly (~0.45 fire rate) —
                    // a tasteful player doesn't pick up on every phrase when the
                    // energy is low — while the 0.55 slope lets a hot section
                    // approach the 0.8 ceiling (a busy player leans in).
                    const fireSeed = getPhraseSeed(sectionSeed, barInSection, PHRASE_BARS, 0);
                    const fireProb = Math.min(0.8, 0.2 + playback.bandIntensity * 0.55);
                    if (fireSeed < fireProb) {
                        const variantSeed = getPhraseSeed(
                            sectionSeed,
                            barInSection,
                            PHRASE_BARS,
                            1,
                        );
                        const tsConf =
                            TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
                        const stepsPerBeat = tsConf.stepsPerBeat;
                        const pickup = generatePhrasePickup(
                            stepsPerBeat,
                            playback.bandIntensity,
                            variantSeed,
                        );
                        dispatch(ACTIONS.TRIGGER_FILL, {
                            steps: pickup,
                            // Land the pickup on the bar's final beat.
                            startStep: currentStep + (stepsPerMeasure - stepsPerBeat),
                            length: stepsPerBeat,
                            crash: false,
                        });
                    }
                }
            }
        }
    }

    // --- Harmonic Anticipation (Ghost Kick / Bark) ---
    // Runs at the very end of a chord if it leads into a new section or song end.
    const currentChordIdx = binarySearchMapIndex(arranger.stepMap || [], modStep);
    if (currentChordIdx === -1) {
        return;
    }
    const entry = arranger.stepMap[currentChordIdx];

    const isChordEnd = modStep === entry.end - 1;
    if (isChordEnd) {
        const nextEntry = arranger.stepMap[currentChordIdx + 1];
        const isTransition = !nextEntry || nextEntry.chord.sectionId !== entry.chord.sectionId;

        if (isTransition && !groove.fillActive && playback.bandIntensity > 0.4) {
            dispatch(ACTIONS.TRIGGER_FILL, {
                steps: {
                    0: [
                        { name: 'Kick', vel: 0.6 },
                        { name: 'Open', vel: 0.9 },
                    ],
                },
                startStep: currentStep,
                length: 1,
                crash: true,
            });
        }
    }
}
