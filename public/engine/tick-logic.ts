import { getJamMacroArc } from '../song/form-analysis.js';
import type { EnsembleState, Mutable, SoloistExpression } from '../types.js';
import { binarySearchMap, getFrequency, getMidi } from '../utils.js';
import { applyPowerChordVoicing, getAccompanimentNotes } from './accompaniment.js';
import { getBassNote, isBassActive } from './bass-engine.js';
import {
    type CoordinationCarryover,
    type CoordinationContext,
    enforceRegisterSlotting,
    macroArcLadder,
    updateCoordinationContext,
} from './coordination-engine.js';
import { runDrumTick } from './drums-tick.js';
import { getHarmonyNotes } from './harmonies.js';
import { isPowerChordChordsVoice } from './instrument-registry.js';
import { getQaHangAt, getSoloistNotePhraseFirst } from './soloist-phrase-first.js';
import type { DrumHitInfo, TickCursors } from './tick-types.js';
import { getChordAtStep } from './worker-utils.js';

// #698 — Metal's crunch power chords anchor to E2 (MIDI 40), the standard-tuning
// low-E chug, dropping into the bass register on purpose (bass doubles the root).
// Paired with the 'chords-guitar-low' register slot in coordination-engine.
const METAL_POWER_CHORD_ANCHOR = 40;

export interface NoteResult {
    module: string;
    step: number;
    midi?: number;
    freq?: number;
    velocity?: number;
    durationSteps?: number;
    timingOffset?: number;
    /** One-way bend-*in*: start this many semitones off the written pitch, ramp to it. */
    bendStartInterval?: number;
    /** Bend-and-release + future slide/scoop (#744). Distinct from `bendStartInterval`. */
    expression?: SoloistExpression;
    isDoubleStop?: boolean;
    isLegato?: boolean;
    dry?: boolean;
    ccEvents?: any;
    muted?: boolean;
}

export interface GenerateNotesOptions {
    includeChords?: boolean;
    includeBass?: boolean;
    includeSoloist?: boolean;
    includeHarmony?: boolean;
    includeDrums?: boolean;
    // #842: true on the conductor-less generators (logic worker + MIDI export),
    // where `state.conductor` is a stale default rather than the live ramp source.
    // Routes drum-motif selection through the bar-downbeat latch in `runDrumTick`
    // instead of the (stale) conductor reconstruction. Omitted (false) on the
    // live/audio-export paths, which keep the #841 reconstruction.
    noLiveConductor?: boolean;
}

export interface GenerateNotesResult {
    notes: NoteResult[];
    coordination: CoordinationContext;
    drumHits: DrumHitInfo[];
}

/**
 * Generates notes and drum hits for a single musical step.
 *
 * `carryover` carries sticky cross-tick coordination state (e.g.
 * lastActiveSoloistMidi) — callers should store the post-tick value from
 * `result.coordination` and feed it back in on the next tick. Stateless
 * callers (drum-only paths, isolated tests) can omit it.
 */
export function generateNotesForStep(
    state: EnsembleState,
    step: number,
    cursors: TickCursors,
    options: GenerateNotesOptions = {},
    carryover: CoordinationCarryover | null = null,
): GenerateNotesResult {
    const { arranger, bass, soloist, harmony } = state;

    // Drum preamble + drum block: coordination assembly and all drum-hit
    // generation. Moved verbatim into `drums-tick.ts` (the clean, lane-free
    // module the real-time scheduler imports) and composed back here. The
    // returned `coordination`/`chordData`/`stepInfo`/`ts` are the SAME objects
    // the lane sections below read — preserving byte-identical output and the
    // load-bearing publication ordering.
    const drumTick = runDrumTick(state, step, cursors, carryover, options.noLiveConductor);
    const { coordination, chordData, stepInfo, ts, dropMuteActive, drumHits } = drumTick;

    // The drum-only path honors `isInstrumentActiveAtStep` gating internally; the
    // lane include-flags here can still be overridden per-call via `options`.
    const includeSoloist = options.includeSoloist ?? drumTick.includeSoloist;
    const includeBass = options.includeBass ?? drumTick.includeBass;
    const includeChords = options.includeChords ?? drumTick.includeChords;
    const includeHarmony = options.includeHarmony ?? drumTick.includeHarmony;

    const notesToMain: NoteResult[] = [];

    // 2. Soloist Generation (High Priority)
    // why (`!dropMuteActive`): epic-deferred-followups S1(b) — the drop cut bar
    // is a uniform band-wide silence. Soloist/bass/chords/harmony all skip
    // emission for the whole bar; only the drum Crash (above) sounds. We gate
    // at the producer call-site rather than inside each engine because the cut
    // is uniform (unlike the staggered per-engine intro/outro mutes), so a
    // single tick-logic gate is the honest single point of truth.
    let soloResult: any = null;
    if (includeSoloist && !dropMuteActive) {
        if (chordData) {
            const { chord, stepInChord, sectionStart, sectionEnd } = chordData;
            const nextChordData = getChordAtStep(step + 4, arranger, cursors.lookaheadCursor);
            // Phrase-first is THE soloist engine (the beta toggle was retired once
            // it became the default). It self-delegates to the legacy generator
            // during the brief pre-seed window (no session seed yet), so the
            // legacy path stays reachable as an internal fallback.
            soloResult = getSoloistNotePhraseFirst(
                state,
                chord || null,
                nextChordData?.chord || null,
                step,
                (soloist.audio.lastFreq || null) as any,
                soloist.octave,
                soloist.style || '',
                stepInChord,
                { sectionStart, sectionEnd, stepCoordination: coordination },
                stepInfo || null,
            );

            if (soloResult) {
                const results = Array.isArray(soloResult) ? soloResult : [soloResult];
                for (let i = 0; i < results.length; i++) {
                    const res = results[i];
                    if (res.freq || res.midi) {
                        if (!res.midi) {
                            res.midi = getMidi(res.freq);
                        }
                        // Enforce Contract: Register Slotting (with smooth octave shift)
                        const lastSoloMidi = soloist.audio.lastFreq
                            ? getMidi(soloist.audio.lastFreq)
                            : null;
                        res.midi = enforceRegisterSlotting(
                            'soloist',
                            res.midi,
                            coordination,
                            lastSoloMidi as any,
                        );

                        if (!res.freq) {
                            res.freq = getFrequency(res.midi);
                        }
                        if (!res.isDoubleStop) {
                            (soloist.audio as Mutable<typeof soloist.audio>).lastFreq = res.freq; // @worker-mutation
                        }
                        notesToMain.push({ ...res, step, module: 'soloist' });
                    }
                }
                updateCoordinationContext(coordination, 'soloist', soloResult);
            }

            // why: harmonies.ts previously reached into soloist.session.* directly for
            // isResting and notesInPhrase (harmony-coordination.md P0 #5). Publishing
            // these through the coordination context keeps the contract surface honest:
            // mocked tests and production code both exercise the same harmony branches.
            // Written here (after getSoloistNotePhraseFirst) so session state reflects
            // this tick's final phrasing decisions before harmony runs.
            // writer: soloist producer (these lines); readable-after: soloist producer (bass, chords, harmony)
            coordination.soloistResting = Boolean(soloist.session.phrasing.isResting);
            coordination.soloistNotesInPhrase = soloist.session.currentPhrase.notesInPhrase ?? 0;
            // why: S9(b) — harmonies.ts previously reached into
            // `soloist.session.memory.sharedHookBuffer` and `soloist.session.seed`
            // directly (Ska-Punk shared-hook + melodic-shadowing). Publish both
            // through coordination so harmony reads only the contract surface.
            // Written here (soloist producer block) so harmony, which runs later
            // this tick, sees this tick's session state.
            coordination.soloistSharedHookBuffer = soloist.session.memory.sharedHookBuffer ?? [];
            coordination.soloistSeed = soloist.session.seed ?? null;
            // why (#1157): digested Q&A window so the comper can answer the
            // question's hang (see the soloistQaHang field comment in
            // createCoordinationContext). Published every soloist tick — inside
            // a window it carries the hang; outside (or pre-seed) it's null, so
            // the comper's gesture self-disables with the soloist lane.
            // writer: soloist producer (this line); readable-after: soloist producer (chords, harmony)
            coordination.soloistQaHang = getQaHangAt(
                soloist.session.seed ?? null,
                step,
                ts.stepsPerBeat,
                ts.beats * ts.stepsPerBeat,
                arranger.totalSteps,
            );
        }
    }

    // 3. Bass Generation (Yields to Soloist, Locks to Kick)
    // `!dropMuteActive`: see the soloist gate above — S1(b) drop cut bar.
    if (includeBass && !dropMuteActive) {
        if (chordData) {
            const { chord, stepInChord } = chordData;
            if (isBassActive(state, bass.style, step, stepInChord, stepInfo, coordination)) {
                const nextChordData = getChordAtStep(step + 4, arranger, cursors.lookaheadCursor);
                const { sectionStart, sectionEnd } = chordData;
                const bassResult = getBassNote(
                    state,
                    chord,
                    nextChordData?.chord,
                    stepInChord / ts.stepsPerBeat,
                    (bass.lastFreq || null) as any,
                    bass.octave,
                    bass.style,
                    chordData.chordIndex,
                    step,
                    stepInChord,
                    { sectionStart, sectionEnd, stepCoordination: coordination },
                    stepInfo || null,
                );
                if (bassResult && (bassResult.freq || bassResult.midi)) {
                    if (!bassResult.midi) {
                        bassResult.midi = getMidi(bassResult.freq);
                    }
                    // Enforce Contract: Register Slotting (with smooth octave shift)
                    const lastBassMidi = bass.lastFreq ? getMidi(bass.lastFreq) : null;
                    bassResult.midi = enforceRegisterSlotting(
                        'bass',
                        bassResult.midi,
                        coordination,
                        lastBassMidi as any,
                    );

                    if (!bassResult.freq) {
                        bassResult.freq = getFrequency(bassResult.midi);
                    }
                    (bass as Mutable<typeof bass>).lastFreq = bassResult.freq; // @worker-mutation
                    notesToMain.push({ ...bassResult, step, module: 'bass' });
                    updateCoordinationContext(coordination, 'bass', bassResult);
                }
            }
        }
    }

    // 4. Chords Generation (Yields Density to Soloist)
    // `!dropMuteActive`: see the soloist gate above — S1(b) drop cut bar.
    if (includeChords && !dropMuteActive) {
        if (chordData) {
            const { chord, stepInChord } = chordData;
            const chordNotes = getAccompanimentNotes(
                state,
                chord,
                step,
                stepInChord,
                stepInfo.mStep,
                stepInfo,
                coordination,
            );
            // #698 — crunch rhythm-guitar chords play POWER CHORDS: reduce the
            // comp voicing to root+5(+oct) before register slotting so distorted
            // triads don't mud up. Pitch-only + gated on the synced voice, so it
            // never touches the piano/organ comps or the synth fallback. On METAL
            // the chug drops an octave to E2 (`METAL_POWER_CHORD_ANCHOR`) and uses a
            // relaxed register slot ('chords-guitar-low') so it stays down in the
            // bass register — that overlap is the metal idiom. Rock/other guitar
            // power chords keep the standard chords slot (~E3), which reads right.
            const powerChords = isPowerChordChordsVoice(state.chords.voice);
            const metalLowChug = powerChords && state.groove.genreFeel === 'Metal';
            if (powerChords) {
                applyPowerChordVoicing(
                    chordNotes,
                    chord.rootMidi,
                    metalLowChug ? METAL_POWER_CHORD_ANCHOR : undefined,
                );
            }
            const chordsSlot = metalLowChug ? 'chords-guitar-low' : 'chords';
            for (let i = 0; i < chordNotes.length; i++) {
                const n = chordNotes[i];
                // Enforce Contract: Register Slotting
                n.midi = enforceRegisterSlotting(chordsSlot, n.midi, coordination);

                // Recompute freq from the SNAPPED + CLAMPED midi, ALWAYS — mirror
                // the harmony lane's B8 fix (#709). The scheduler plays `freq`, not
                // `midi`; the power-chord reduction (#698) and register slotting
                // both move `midi` after a comp lane may have preloaded `freq` (the
                // final-cadence lane sets `freq: getFrequency(midi)`). A stale
                // pre-change freq (the old `!n.freq` guard) would sound the
                // un-reduced/pre-clamp pitch — e.g. a full distorted triad on the
                // exposed resolution chord, exactly the mud power chords avoid.
                n.freq = getFrequency(n.midi);
                notesToMain.push({ ...n, step, module: 'chords' });
            }
            updateCoordinationContext(coordination, 'chords', chordNotes);
        }
    }

    // 5. Harmony Generation (Yields to All)
    // `!dropMuteActive`: see the soloist gate above — S1(b) drop cut bar.
    if (includeHarmony && !dropMuteActive) {
        if (chordData) {
            const { chord, stepInChord } = chordData;
            const nextChordData = getChordAtStep(step + 4, arranger, cursors.lookaheadCursor);
            const harmonyNotes = getHarmonyNotes(
                state,
                chord,
                nextChordData?.chord,
                step,
                harmony.octave,
                harmony.style,
                stepInChord,
                soloResult,
                coordination,
                stepInfo,
            );
            for (let i = 0; i < harmonyNotes.length; i++) {
                const n = harmonyNotes[i];
                // Enforce Contract: Register Slotting
                n.midi = enforceRegisterSlotting('harmony', n.midi, coordination);

                // B8 (#709) — recompute freq from the CLAMPED midi, always. The
                // harmony engine computes freq pre-clamp (getBestInversion max:100),
                // then this slotting can shift the midi down to ≤84; a stale
                // pre-clamp freq would sound an octave too high and desync the
                // visualizer. (Was gated on `!n.freq`, so the stale freq survived.)
                n.freq = getFrequency(n.midi);
                notesToMain.push({ ...n, step, module: 'harmony' });
            }
        }
    }

    return {
        notes: notesToMain,
        coordination,
        drumHits,
    };
}

/**
 * Mutates state and conductorState to handle transitions, fills, intensity,
 * and harmony complexity. This ensures 1:1 parity between live engine and offline export.
 */
export function applyWorkerTransition(
    state: EnsembleState,
    step: number,
    conductorState: any,
): void {
    const { groove, playback, arranger, harmony } = state;
    if (!groove.enabled || !arranger.totalSteps) {
        return;
    }

    const modStep = step % arranger.totalSteps;
    const timelineStep = step - (groove.seedTimelineStartStep || 0);

    if (modStep === 0 && step > 0) {
        conductorState.loopCount++;
        conductorState.formIteration++;
        // playback.currentLoopCount is owned by the main-thread scheduler now;
        // it arrives via syncWorker('LOOP_BOUNDARY'). The worker uses conductorState.loopCount
        // for its own bookkeeping; engines that need a unified field read playback.currentLoopCount.
    }

    const entry = binarySearchMap(arranger.stepMap || [], modStep);
    if (!entry) {
        return;
    }

    // --- Phase 2: Thematic Fill Memory ---
    if (timelineStep >= 0 && groove.fillMap?.[timelineStep]) {
        const fillData = groove.fillMap[timelineStep];
        (groove as Mutable<typeof groove>).fillSteps = fillData.steps; // @worker-mutation
        (groove as Mutable<typeof groove>).fillActive = true; // @worker-mutation
        (groove as Mutable<typeof groove>).fillStartStep = step; // @worker-mutation
        (groove as Mutable<typeof groove>).fillLength = fillData.length; // @worker-mutation
        (groove as Mutable<typeof groove>).pendingCrash = fillData.crash; // @worker-mutation
    }

    // --- Auto Intensity Simulation for Offline Export ---
    if (playback.autoIntensity && conductorState.totalLoops !== undefined) {
        const totalExportSteps = arranger.totalSteps * conductorState.totalLoops;
        const progress = totalExportSteps > 0 ? step / totalExportSteps : 0;

        // Match the macro-arc logic from conductor.js (session timer arc)
        const { macroFloor, macroCeiling } = macroArcLadder(progress);

        // Incorporate Section Energy
        let targetEnergy = 0.5;
        if (conductorState.form?.sections && entry?.chord) {
            const currentSectionId = entry.chord.sectionId;
            const currentSection = conductorState.form.sections.find(
                (s: any) => s.id === currentSectionId,
            );
            if (currentSection) {
                // why: see companion switch in `conductor.ts` — same dead-arm
                // rename. This copy uses the simpler `macroFloor` for Bridge
                // (always-down) vs conductor.ts's bidirectional invert; that
                // asymmetry is intentional (different tick, different purpose).
                const role = currentSection.role;
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
                        targetEnergy = macroFloor;
                        break;
                    case 'Refrain':
                        targetEnergy = macroFloor + 0.2;
                        break;
                    case 'Build':
                        targetEnergy = macroCeiling;
                        break;
                    default:
                        targetEnergy = 0.5;
                }
            }
        }

        targetEnergy = Math.max(macroFloor, Math.min(macroCeiling, targetEnergy));

        // Smoothly interpolate towards target energy over the section
        if (entry && entry.end > entry.start) {
            const stepSize = (targetEnergy - playback.bandIntensity) / (entry.end - entry.start);
            const newIntensity = Math.max(0.1, Math.min(1.0, playback.bandIntensity + stepSize));
            (playback as Mutable<typeof playback>).bandIntensity = newIntensity; // @worker-mutation
        }
    } else if (playback.autoIntensity && modStep === 0 && conductorState.formIteration > 0) {
        // Timer-less open-jam fallback (offline export, no totalLoops). Was a
        // rigid `formIteration % 8` 3-step sawtooth; now follows the same
        // `getJamMacroArc` raised-cosine swell the conductor uses on the live
        // path, so an exported open jam breathes instead of churning on a
        // hard period-8 step. Target = the swell's centre (floor/ceiling
        // midpoint) since this path drives a single intensity, not a band.
        const { macroFloor, macroCeiling } = getJamMacroArc(
            conductorState.formIteration,
            groove.genreFeel,
        );
        const target = (macroFloor + macroCeiling) / 2;
        (playback as Mutable<typeof playback>).bandIntensity =
            playback.bandIntensity + (target - playback.bandIntensity) * 0.5; // @worker-mutation
    }

    (harmony as Mutable<typeof harmony>).complexity = Math.max(
        0,
        (playback.bandIntensity - 0.2) * 1.25,
    ); // @worker-mutation

    // Handle offline export specific end-of-loop build up
    if (conductorState.loopMode !== undefined && conductorState.totalLoops !== undefined) {
        const isLastLoop = conductorState.loopCount >= conductorState.totalLoops - 1;
        if (isLastLoop && conductorState.totalLoops > 1) {
            (harmony as Mutable<typeof harmony>).complexity = Math.max(harmony.complexity, 0.85); // @worker-mutation
        }
    } else if (playback.songMode && playback.isEndingPending) {
        // Live Mode Ending Anticipation
        (harmony as Mutable<typeof harmony>).complexity = Math.max(harmony.complexity, 0.85); // @worker-mutation
    }
}
