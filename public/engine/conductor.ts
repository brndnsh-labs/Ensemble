import { analyzeForm, getJamMacroArc, getSectionEnergy } from '../form-analysis.js';
import { debounceSaveState, saveCurrentState } from '../persistence.js';
import type { EnsembleState } from '../types.js';
import { ACTIONS } from '../types.js';
import { triggerFlash } from '../ui.js';
import { binarySearchMap, binarySearchMapIndex } from '../utils.js';
import { loopArcMultiplier } from './arc.js';
import { generateProceduralFill } from './fills.js';
import { REVERB_PRESETS } from './reverb.js';
import { effectiveTargetIntensity } from './section-overrides.js';

/**
 * Genres that get the lush hall reverb preset; everything else gets the tight
 * room. Slow, open, harmonically rich styles want a long tail — punchy,
 * percussive styles want the groove to stay articulate.
 */
const HALL_GENRES = new Set(['Jazz', 'Blues', 'Bossa Nova', 'Neo-Soul', 'Acoustic', 'Minimal']);

type Dispatch = (action: any, payload?: any) => void;

/**
 * Per-genre `targetEnergy` floors for the auto-intensity macro-arc.
 *
 * why: the macro-arc ladder and `getSectionEnergy` both produce values that
 * cluster around 0.4–0.5 for low-energy windows, which sits BELOW the
 * Snare-vs-Sidestick gates in several genres (`grooves/funk.ts:195` at 0.3
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
const GENRE_INTENSITY_FLOORS: Record<string, number> = {
    // why: funk pocket needs to crack — Snare gate at 0.3, floor at 0.45 keeps
    // backbeat well above with headroom for verse breakdowns.
    Funk: 0.45,
    // why: neo-soul snare gate is INTENSITY_BANDS.LOW=0.35; 0.40 keeps the
    // dilla-pocket snare just above the rim-shot threshold.
    'Neo-Soul': 0.4,
    // why: disco is a high-energy genre by definition — four-on-the-floor
    // needs presence; 0.45 keeps the kick punching.
    Disco: 0.45,
    // why: existing Rock/Metal floor preserved (was hard-coded at
    // `conductor.ts:448-450` pre-S8).
    Rock: 0.35,
    Metal: 0.35,
    // why: jazz and bossa legitimately operate quietly — sidestick comping
    // and brush ride ARE the genre identity at low intensity. Floor still
    // present so we don't bottom out at 0.1 (dead-air) on a moody chart.
    Jazz: 0.3,
    // why: canonical `groove.genreFeel` is 'Bossa Nova' (see groove-engine.ts:34,
    // drum-presets.ts:830) — 'Bossa' key alone would never match in production.
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
 * macro-arc (`conductor.ts:501`). The jitter adds `Math.random() * MACRO_JITTER_RANGE - MACRO_JITTER_RANGE / 2`
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
    const { playback, soloist, groove, arranger } = state;
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

    // --- 2. Complexity / Busyness ---
    const targetHookProb = 0.2 + complexity * 0.6;

    // --- 3. Musical Conversation (Soloist Density) ---
    // If soloist is active, the accompanist should "listen" and back off.
    const isSoloistBusy = soloist.enabled && (soloist.session.phrasing.busySteps || 0) > 0;
    const targetIntentDensity = isSoloistBusy ? 0.3 * (1 - complexity) : 0.5 + intensity * 0.4;

    // --- 4. Harmony Evolution ---
    // Harmonies follow the complexity signal for activity level.
    let targetHbComplexity = complexity;

    // If Song Mode is active and we are in the last 30 seconds, push for a "Final Build"
    const elapsedMins =
        playback.sessionTimer > 0 && playback.sessionStartTime > 0
            ? (performance.now() - playback.sessionStartTime) / 60000
            : 0;
    const progress =
        playback.sessionTimer > 0 ? Math.min(1.0, elapsedMins / playback.sessionTimer) : 0;

    if (playback.songMode && playback.isEndingPending) {
        targetHbComplexity = Math.max(targetHbComplexity, 0.85);
    }

    // --- 5. Expression (Lyrical vs Involved) ---
    // Lyrical = 1.0 (Melodic, slower), Involved = 0.0 (Busy, technical)
    let lyricalBias = 0.5;

    // Song Arc: Smooth interpolation instead of hard jumps
    if (playback.songMode && playback.sessionTimer > 0) {
        if (progress < 0.3) {
            // Initial Phase: 0.9 down to 0.5
            lyricalBias = 0.9 - (progress / 0.3) * 0.4;
        } else if (progress < 0.7) {
            // Building Phase: 0.5 down to 0.2
            lyricalBias = 0.5 - ((progress - 0.3) / 0.4) * 0.3;
        } else if (progress < 0.9) {
            // Peak: 0.2
            lyricalBias = 0.2;
        } else {
            // Resolution: 0.2 up to 0.95
            lyricalBias = 0.2 + ((progress - 0.9) / 0.1) * 0.75;
        }
    }

    // Section Overrides (Smoothed)
    const modStep = arranger.totalSteps > 0 ? playback.step % arranger.totalSteps : 0;
    const currentEntry = binarySearchMap(arranger.stepMap || [], modStep);
    if (currentEntry) {
        const label = (currentEntry.chord as any).sectionLabel.toLowerCase();
        let sectionBias = 0.5;
        if (label.includes('solo')) {
            sectionBias = 0.2;
        } else if (label.includes('verse')) {
            sectionBias = 0.75;
        } else if (label.includes('outro') || label.includes('intro')) {
            sectionBias = 0.9;
        }

        // Blend section bias with song arc (70% section, 30% arc)
        lyricalBias = sectionBias * 0.7 + lyricalBias * 0.3;
    }

    // Soloist Energy Cap: Prevent "runaway" density at loop starts
    const isFirstHalfOfSection =
        currentEntry && modStep - currentEntry.start < (currentEntry.end - currentEntry.start) / 2;
    const soloistIntensityMod = isFirstHalfOfSection ? -0.15 : 0.05;

    dispatch(ACTIONS.UPDATE_CONDUCTOR_DECISION, {
        density: targetDensity,
        velocity: targetVelocity,
        hookProb: targetHookProb,
        intent: {
            density: targetIntentDensity,
            soloistMod: soloistIntensityMod,
        },
        lyricalBias: lyricalBias,
    });

    dispatch(ACTIONS.UPDATE_HB, {
        complexity: targetHbComplexity,
    });

    // --- 6. Micro-Timing (Pocket) ---
    let targetBassPocket = 0;
    const genre = groove.genreFeel;
    if (genre === 'Neo-Soul') {
        targetBassPocket = 0.025; // 25ms "Dilla" lag
    } else if (genre === 'Funk') {
        targetBassPocket = -0.005; // 5ms "Ahead of the beat" push for Funk energy
    }

    dispatch(ACTIONS.SET_PARAM, { module: 'bass', param: 'pocketOffset', value: targetBassPocket });

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
        graph.bass.eq.type = 'highpass'; // @direct-mutation
        graph.bass.eq.frequency.setTargetAtTime(40, time, ramp);

        graph.soloist.eq.type = 'highshelf'; // @direct-mutation
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

    debounceSaveState();
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
        const multiplier = playback.bandIntensity > effectiveTarget ? 0.75 : 1.25;
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

        if (
            nextEntry &&
            (isLoopEnd || (nextEntry.chord as any).sectionId !== (entry.chord as any).sectionId)
        ) {
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
            const nextSectionId = (nextEntry.chord as any).sectionId;
            const nextSection = arranger.sections.find((s: any) => s.id === nextSectionId);
            if (nextSection?.seamless) {
                shouldFill = false;
            }

            if (isLoopEnd && shouldFill) {
                const nextLoopCount = conductor.loopCount + 1;
                const nextFormIteration = conductor.formIteration + 1;
                dispatch(ACTIONS.UPDATE_CONDUCTOR_STATE, {
                    loopCount: nextLoopCount,
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
                    shouldFill = nextLoopCount % loopFrequency === 0;
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

                        if (progress < 0.15) {
                            macroFloor = 0.2;
                            macroCeiling = 0.45;
                        } else if (progress < 0.4) {
                            macroFloor = 0.4;
                            macroCeiling = 0.7;
                        } else if (progress < 0.65) {
                            macroFloor = 0.5;
                            macroCeiling = 0.8;
                        } else if (progress < 0.85) {
                            macroFloor = 0.7;
                            macroCeiling = 1.0;
                        } else {
                            macroFloor = 0.2;
                            macroCeiling = 0.5;
                        }
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
                            (s: any) => s.id === (nextEntry.chord as any).sectionId,
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
                            targetEnergy = getSectionEnergy((nextEntry.chord as any).sectionLabel);
                        }
                    } else {
                        targetEnergy = getSectionEnergy((nextEntry.chord as any).sectionLabel);
                    }

                    targetEnergy = Math.max(macroFloor, Math.min(macroCeiling, targetEnergy));
                    targetEnergy += Math.random() * MACRO_JITTER_RANGE - MACRO_JITTER_RANGE / 2;

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
                        targetEnergy = Math.max(
                            0.3,
                            Math.min(0.95, targetEnergy + (Math.random() * 0.2 - 0.1)),
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
                    const fillSteps = generateProceduralFill(
                        groove.genreFeel,
                        playback.bandIntensity,
                        stepsPerMeasure,
                    );
                    dispatch(ACTIONS.TRIGGER_FILL, {
                        steps: fillSteps,
                        startStep: currentStep,
                        length: stepsPerMeasure,
                        crash: true,
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

                // --- 3. THE DRUM SEED (Creativity Memory) ---
                if (groove.creativity && nextSection) {
                    // Re-evaluate the drum seed only if it hasn't been set for this section
                    if ((groove.sectionSeedMap as any)[nextSection.id] === undefined) {
                        // Generate a robust float seed (0.0 to 1.0) to serve as the abstract pool marker
                        const seed = Math.random();
                        dispatch(ACTIONS.SET_GROOVE_SEED, { sectionId: nextSection.id, seed });
                    }
                } else if (!groove.creativity && nextSection) {
                    // Reset or force to Standard if creativity is toggled off mid-song
                    dispatch(ACTIONS.SET_GROOVE_SEED, { sectionId: nextSection.id, seed: 0.5 });
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
        const isTransition =
            !nextEntry || (nextEntry.chord as any).sectionId !== (entry.chord as any).sectionId;

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
