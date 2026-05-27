import { TIME_SIGNATURES } from '../config.js';
import { getJamMacroArc, getSectionEnergy } from '../form-analysis.js';
import type { EnsembleState, Mutable } from '../types.js';
import {
    binarySearchMap,
    getFrequency,
    getMidi,
    getStepInfo,
    isSectionTurnaround,
} from '../utils.js';
import { getAccompanimentNotes } from './accompaniment.js';
import { isIntroSectionLabel, isOutroSectionLabel } from './arrangement-layering.js';
import { getSectionContext } from './arranger-utils.js';
import { getBassNote, isBassActive } from './bass-engine.js';
import {
    type CoordinationCarryover,
    createCoordinationContext,
    enforceRegisterSlotting,
    getAltPitchClasses,
    isTensionChordForSoloist,
    updateCoordinationContext,
} from './coordination-engine.js';
import { shouldFireDropMute } from './drop-mechanic.js';
import { applyGrooveOverrides, calculatePocketOffset } from './groove-engine.js';
import { getHarmonyNotes } from './harmonies.js';
import { isInstrumentActiveAtStep } from './section-overrides.js';
import { getSoloistNote } from './soloist.js';
import { getChordAtStep } from './worker-utils.js';

export interface TickCursors {
    mainCursor: { index: number; sectionIndex: number };
    lookaheadCursor: { index: number; sectionIndex: number };
}

export interface NoteResult {
    module: string;
    step: number;
    midi?: number;
    freq?: number;
    velocity?: number;
    durationSteps?: number;
    timingOffset?: number;
    bendStartInterval?: number;
    isDoubleStop?: boolean;
    isLegato?: boolean;
    dry?: boolean;
    ccEvents?: any;
    muted?: boolean;
}

export interface DrumHitInfo {
    shouldPlay: boolean;
    velocity: number;
    soundName: string;
    instTimeOffset: number;
    inst: any;
}

export interface GenerateNotesOptions {
    includeChords?: boolean;
    includeBass?: boolean;
    includeSoloist?: boolean;
    includeHarmony?: boolean;
    includeDrums?: boolean;
}

export interface GenerateNotesResult {
    notes: NoteResult[];
    coordination: any;
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
    const { arranger, bass, soloist, harmony, groove, playback } = state;

    const includeChords = options.includeChords ?? isInstrumentActiveAtStep(state, 'chords', step);
    const includeBass = options.includeBass ?? isInstrumentActiveAtStep(state, 'bass', step);
    const includeSoloist =
        options.includeSoloist ?? isInstrumentActiveAtStep(state, 'soloist', step);
    const includeHarmony =
        options.includeHarmony ?? isInstrumentActiveAtStep(state, 'harmony', step);
    const includeDrums = options.includeDrums ?? isInstrumentActiveAtStep(state, 'groove', step);

    const notesToMain: NoteResult[] = [];
    const drumHits: DrumHitInfo[] = [];

    const ts = (TIME_SIGNATURES as any)[arranger.timeSignature] || (TIME_SIGNATURES as any)['4/4'];
    const stepsPerBar = ts.beats * ts.stepsPerBeat;

    const chordData = getChordAtStep(step, arranger, cursors.mainCursor);
    const stepInfo = getStepInfo(step, ts, arranger.measureMap, TIME_SIGNATURES);

    // 1. Context Assembly (Anchor: Groove)
    const coordination = createCoordinationContext(step, stepInfo as any, carryover);
    // writer: groove preamble (this line); readable-after: any producer
    (coordination as any).pocketOffset = calculatePocketOffset(playback, groove);

    if (chordData) {
        const { sectionEnd, sectionStart } = chordData;
        const remainingSteps = sectionEnd - step;
        const stepsPerMeasure = ts.beats * ts.stepsPerBeat;

        // why: section boundaries on the coordination context directly so consumers
        // that receive bare coordination (e.g. isBassActive) can read sectionEnd
        // without depending on the wrapper-context shape passed to getBassNote.
        // writer: chord-data preamble (these lines); readable-after: any producer
        (coordination as any).sectionStart = sectionStart;
        (coordination as any).sectionEnd = sectionEnd;

        // --- Structural Awareness: Turnaround Detection ---
        // writer: chord-data preamble (this line); readable-after: any producer
        const sectionSteps = sectionEnd - sectionStart;
        const isLongEnough = sectionSteps >= stepsPerMeasure * 8;
        (coordination as any).isTurnaround = isLongEnough && remainingSteps <= stepsPerMeasure * 2;

        // --- Tension-chord publication (writer: chord-preamble; readable-after: any producer) ---
        // why: must be published BEFORE the soloist producer runs (line ~254) so the
        // pitch picker's final-stage `weight *= 3` multiplier on altered pitch classes
        // (soloist-pitch-engine.ts) actually sees the signal. The soloist always runs
        // ahead of the chords producer, so writing this in `updateCoordinationContext('chords')`
        // would be one tick too late. Both fields are pure functions of the current chord.
        const currentChord = chordData.chord;
        if (currentChord) {
            (coordination as any).isTensionChord = isTensionChordForSoloist(currentChord.quality);
            (coordination as any).altPitchClasses = getAltPitchClasses(
                currentChord.quality,
                currentChord.rootMidi,
            );
        }

        // writer: chord-data preamble (this block); readable-after: any producer
        if (remainingSteps <= stepsPerMeasure) {
            const nextSectionChordData = getChordAtStep(
                sectionEnd,
                arranger,
                cursors.lookaheadCursor,
            );
            if (nextSectionChordData?.chord) {
                (coordination as any).upcomingSectionFirstChord = nextSectionChordData.chord;

                // --- Section-boundary lookahead (epic-deferred-followups S1(a)) ---
                // why: `upcomingSectionFirstChord` only tells engines WHICH chord
                // the next section opens on. The conductor / drop mechanic also
                // need the STRUCTURAL context: which section, how much louder, and
                // how many bars away. We publish all three here — pure functions
                // of the lookahead chord — so no producer re-derives them. They
                // are only meaningful in the last measure of a section (the same
                // window `upcomingSectionFirstChord` is populated in), hence the
                // shared `remainingSteps <= stepsPerMeasure` guard.
                const upcomingLabel = (nextSectionChordData.chord as any)?.sectionLabel ?? null;
                (coordination as any).upcomingSectionLabel = upcomingLabel;
                // why: energy delta uses form-analysis.ts's 0..1 SECTION_ENERGY_MAP
                // (drop=1.0, breakdown=0.3, chorus=0.9, …). A large positive delta
                // means "the band is about to lift hard"; the drop mechanic and
                // S2's rock push both gate on it.
                (coordination as any).upcomingSectionEnergyDelta =
                    getSectionEnergy(upcomingLabel) -
                    getSectionEnergy((currentChord as any)?.sectionLabel);
                // why: whole measures remaining until the boundary. `remainingSteps`
                // is steps until `sectionEnd`; floor-dividing by `stepsPerMeasure`
                // and subtracting the trailing partial bar gives "0 = we are IN the
                // last bar before the change." Clamped at 0 — when the lookahead is
                // available we are by construction within the final measure.
                (coordination as any).barsUntilSectionChange = Math.max(
                    0,
                    Math.floor((remainingSteps - 1) / stepsPerMeasure),
                );
            }
        }

        // --- Drop / Breakdown structural mechanic (epic-deferred-followups S1(b)) ---
        // why: FOLLOWUPS §A (DECIDED 2026-05-20: build the real mechanic). When a
        // drop/breakdown section is approaching, the band CUTS for the last bar
        // before the boundary (a single crash marks the gap) and SLAMS back on the
        // drop's downbeat. `shouldFireDropMute` owns the genre gate + energy-delta
        // threshold; here we translate "this is a cut bar" into the two band-wide
        // flags the producers read. The mute spans the whole cut bar; the crash
        // fires only on its downbeat.
        //
        // The producer call-sites below (soloist/bass/chords/harmony) check
        // `dropMuteActive` and skip emission entirely — a uniform 1-bar silence,
        // unlike the staggered per-engine intro/outro mutes. Drums are exempt:
        // the drum block emits the marking Crash on `dropCrashPending`.
        //
        // why formProgress: an energy-delta-INFERRED cut (a verse→chorus lift
        // with no literal "drop" label) is gated to the back of the form so it
        // reads as a late-song climax rather than firing on every early chorus
        // (listen-test 2026-05-20). `step` is cumulative, so `step % total` is
        // the position within the unrolled form. Default 1 when total is
        // unknown (degenerate empty arrangement) — never suppress on bad data.
        const dropTotalFormSteps = Number.isFinite(arranger.totalSteps) ? arranger.totalSteps : 0;
        const dropFormProgress =
            dropTotalFormSteps > 0
                ? (((step % dropTotalFormSteps) + dropTotalFormSteps) % dropTotalFormSteps) /
                  dropTotalFormSteps
                : 1;
        if (
            shouldFireDropMute(
                groove.genreFeel,
                (coordination as any).barsUntilSectionChange,
                (coordination as any).upcomingSectionLabel,
                (coordination as any).upcomingSectionEnergyDelta,
                dropFormProgress,
            )
        ) {
            (coordination as any).dropMuteActive = true;
            // why: the crash marks the START of the empty bar — fire it on the
            // measure downbeat only, then leave the rest of the bar silent.
            (coordination as any).dropCrashPending = stepInfo
                ? stepInfo.isMeasureStart
                : step % stepsPerMeasure === 0;
        }

        // --- Section-occurrence publication (epic-form-arrangement S2) ---
        // why: Imperfect Symmetry for repeat passes. The soloist already derives this
        // value via `getSectionContext` from its SRDC path (soloist.ts); we publish
        // the same lookup onto the coordination context here so bass/drums/accomp
        // producers can diverge Verse 2 from Verse 1 without re-walking sectionMap.
        // Default 1 was already written by createCoordinationContext — we overwrite
        // only when arranger.sectionMap is populated. Must happen BEFORE any producer
        // runs, because the bass producer (which is the consumer in this story) is
        // invoked further down at line ~340.
        // writer: chord-data preamble (this line); readable-after: any producer
        const sectionCtx = getSectionContext(arranger, step);
        (coordination as any).sectionOccurrence = sectionCtx.occurrence;

        // --- Final-measure publication (epic-form-arrangement S4) ---
        // why: form-arranger.md P1 #6 — only the soloist senses the form's end
        // today (`soloist.ts` derives a per-section `isLastSectionMeasure`). Bass,
        // chords, harmony, and drums hit the loop boundary cold. Publish a clear
        // band-wide "this is the final bar of a song-mode playback that is
        // ending" signal so:
        //   - drums fire a Crash + sustained cymbal on beat 1 (final cymbal swell)
        //   - bass holds tonic on the downbeat (no walking, no octave plays)
        //   - chords/accompaniment play a cadence voicing (root position,
        //     minimal extension) — the resolved feel
        //
        // Condition exactly mirrors the story sketch:
        //   playback.songMode && playback.isEndingPending
        //     && step-within-form + stepsPerMeasure >= arranger.totalSteps
        //
        // We use `stepInForm` (the absolute step modulo total form length) so
        // looped song-mode playback gates on the same bar number every iteration
        // until `isEndingPending` is set by the scheduler at end-button / session-
        // timer expiration. Both conditions must hold — otherwise normal looping
        // would fire the cadence on the form's last bar every loop, which is
        // wrong (only the FINAL pass ends).
        //
        // Precedence: when true, downstream engines OVERRIDE Imperfect Symmetry
        // on the final bar — the resolution gesture is more important than a
        // repeat-pass octave/voicing/ghost shift. See coordination-engine.ts
        // `isFinalMeasure` doc comment for the musical reasoning.
        //
        // writer: chord-data preamble (this block); readable-after: any producer
        const totalFormSteps = Number.isFinite(arranger.totalSteps) ? arranger.totalSteps : 0;
        if (playback.songMode && playback.isEndingPending && totalFormSteps > 0) {
            const stepInForm = ((step % totalFormSteps) + totalFormSteps) % totalFormSteps;
            // why: `stepInForm + stepsPerMeasure >= total` is true for every step
            // in the last bar of the form. Using `>=` matches the audit-doc
            // sketch and handles the boundary case where stepInForm is exactly
            // (total - stepsPerMeasure) — the very first step of the final bar.
            if (stepInForm + stepsPerMeasure >= totalFormSteps) {
                coordination.isFinalMeasure = true;
            }
        }

        // --- Intro/Outro layering publication (epic-form-arrangement S5) ---
        // why: form-arranger.md P1 #4 — the arranger has Intro/Outro labels
        // (unrollArrangement at arranger-utils.ts:131-133; form-analysis.ts:
        // 99-104) but no engine reads them. Publish two bar-counter fields so
        // bass/chords/harmony can stay silent for the first N bars of an
        // intro (drums-only opening that LAYERS in) and the last N bars of
        // an outro (band thins out before the final cadence).
        //
        // Source labels live on `chord.sectionLabel` (unroller sets this at
        // arranger-utils.ts:161). Substring match — same vocabulary the
        // soloist already uses at `soloist.ts:102` for `isOutro`.
        //
        // Both fields default to -1 (sentinel "not in intro/outro section"),
        // so engines can gate cleanly:
        //   if (introBarsElapsed >= 0 && introBarsElapsed < INTRO_MUTES[me]) return null;
        //   if (outroBarsRemaining >= 0 && outroBarsRemaining <= OUTRO_MUTES[me]) return null;
        //
        // Bar accounting: `bars-elapsed = floor((step - sectionStart) / spm)`
        // is the number of COMPLETE bars before the current step (bar 0 is
        // the first bar of the section). `bars-remaining = ceil((sectionEnd
        // - step) / spm)` is the number of bars left including the current
        // one (so the LAST bar of a section reports `1`, not `0`).
        //
        // Precedence: `isFinalMeasure` (S4) OVERRIDES outro mute on the
        // form's final bar — the resolution cadence must fire even if bass
        // would otherwise be muted by `outroBarsRemaining <= OUTRO_MUTES.bass`.
        // Engine gates check `isFinalMeasure` first; this preamble does not
        // need to clear the outro counter (a clear would prevent engines that
        // don't consume `isFinalMeasure` from honoring the outro mute on the
        // sub-beats of the final bar — symmetry with S4's own sub-beat
        // silence is cleaner).
        const currentLabel = (currentChord as any)?.sectionLabel;
        if (isIntroSectionLabel(currentLabel)) {
            // why: `step >= sectionStart` is guaranteed by `getChordAtStep`'s
            // lookup contract, but floor() handles the boundary cleanly.
            // Bar 0 spans `sectionStart .. sectionStart + spm - 1`; bar 1
            // spans `sectionStart + spm .. + 2spm - 1`; etc.
            (coordination as any).introBarsElapsed = Math.floor(
                (step - sectionStart) / stepsPerMeasure,
            );
        } else if (isOutroSectionLabel(currentLabel)) {
            // why: `Math.ceil` ensures the LAST step of the last bar still
            // reports `1` (not `0`) — so engines whose mute is `OUTRO_MUTES
            // <= 1` correctly silence on the entire final bar of the outro.
            // E.g. sectionEnd=64, step=63, spm=16 → ceil((64-63)/16)=1.
            // E.g. sectionEnd=64, step=48, spm=16 → ceil((64-48)/16)=1
            //   (the LAST bar). step=47 → ceil(17/16)=2 (the second-to-last).
            const remaining = sectionEnd - step;
            (coordination as any).outroBarsRemaining =
                remaining > 0 ? Math.ceil(remaining / stepsPerMeasure) : 0;
        }
    }

    // Pre-calculate Drum Hits for Coordination
    const drumStep = step % (groove.measures * stepsPerBar);
    const sectionId = chordData?.chord?.sectionId || null;
    const seedIdx =
        groove.sectionSeedMap && sectionId ? (groove.sectionSeedMap as any)[sectionId] || 0 : 0;

    // Use a cached variation lookup if creativity is enabled
    if (groove.creativity && groove.lastDrumPreset) {
        // We use a global cache or just handle it synchronously if already loaded
        // For now, we'll try to find a way to avoid the top-level import.
    }

    // --- Calculate Turnaround State ---
    const isTurnaround =
        groove.creativity && isSectionTurnaround(step, arranger.sectionMap, stepsPerBar, 1);

    let fillPlayed = false;

    // --- Drop / Breakdown cut bar (epic-deferred-followups S1(b)) ---
    // why: during the 1-bar pre-drop mute the drums also cut — the ONLY
    // percussion event is a single Crash on the downbeat marking the empty
    // bar. We branch BEFORE the fill / pattern logic so a scheduled fill or
    // the base groove cannot smuggle hits into the cut bar. `kickHit` /
    // `snareHit` stay false (already their defaults) so any consumer reading
    // them sees the silence honestly. Drum genres that are drop-friendly only
    // — `shouldFireDropMute` already gated `dropMuteActive` on genre.
    const dropMuteActive = (coordination as any).dropMuteActive === true;
    if (dropMuteActive) {
        if (includeDrums && (coordination as any).dropCrashPending === true) {
            const crashInst = groove.instruments.find((i) => i.name === 'Crash') || {
                name: 'Crash',
                muted: false,
            };
            if (!crashInst.muted) {
                drumHits.push({
                    shouldPlay: true,
                    // why: 1.1 — the same value as the fill-transition crash
                    // (line ~370). The cut bar is otherwise SILENT, so the
                    // gesture reads from the void around the crash, not from a
                    // velocity nudge; a transition crash already sits at the top
                    // of the kit's dynamic range and a crash into silence needs
                    // no extra push to land.
                    velocity: 1.1,
                    soundName: 'Crash',
                    instTimeOffset: 0,
                    inst: crashInst,
                });
            }
        }
        fillPlayed = true; // suppress the base pattern + any scheduled fill below
    }

    if (!dropMuteActive && groove.fillActive) {
        const fillStep = step - (groove.fillStartStep || 0);

        if (fillStep >= 0 && fillStep < (groove.fillLength || 0)) {
            if (playback.bandIntensity >= 0.1 || fillStep >= (groove.fillLength || 0) / 2) {
                const fillNotes = (groove.fillSteps as any)?.[fillStep];
                if (fillNotes && fillNotes.length > 0) {
                    fillNotes.forEach((n: any) => {
                        const inst = groove.instruments.find((i) => i.name === n.name) || {
                            name: n.name,
                            muted: false,
                        };
                        if (!inst.muted) {
                            drumHits.push({
                                shouldPlay: true,
                                velocity: n.vel,
                                soundName: n.name,
                                instTimeOffset: 0,
                                inst,
                            });
                        }
                    });
                    fillPlayed = true;
                }
            }
        } else if (fillStep === groove.fillLength) {
            // @worker-mutation (handled in tick-logic transition usually, but just in case for stateless generation)
            if (groove.pendingCrash) {
                const inst = groove.instruments.find((i) => i.name === 'Crash') || {
                    name: 'Crash',
                    muted: false,
                };
                if (!inst.muted) {
                    drumHits.push({
                        shouldPlay: true,
                        velocity: 1.1,
                        soundName: 'Crash',
                        instTimeOffset: 0,
                        inst,
                    });
                }
            }
        }
    }

    if (!fillPlayed) {
        // Variations lookup
        const checkHit = (instName: string, evaluateOnly: boolean = true): boolean => {
            const inst = groove.instruments.find((i) => i.name === instName);
            if (!inst || inst.muted) {
                return false;
            }
            let stepVal = inst.steps[drumStep];

            // Variation logic: We use pre-computed variations if creativity is high
            if (groove.creativity && groove.variations) {
                const varInst = groove.variations[seedIdx]?.[instName];
                if (varInst) {
                    stepVal = varInst[drumStep];
                }
            }

            const result = applyGrooveOverrides(state, {
                step,
                inst,
                stepVal,
                playback,
                groove,
                isDownbeat: stepInfo.isMeasureStart,
                isBeatStart: stepInfo.isBeatStart,
                isBackbeat: stepInfo.isBackbeat,
                isGroupStart: stepInfo.isGroupStart,
                sectionId,
                beatIndex: stepInfo.beatIndex,
                isOffbeat: stepInfo.isOffbeat,
                isEOfBeat: stepInfo.isEOfBeat,
                isAOfBeat: stepInfo.isAOfBeat,
                tsConfig: stepInfo.tsConfig,
                // why: epic-deferred-followups S8(c) — `mStep` / `stepInGroup` /
                // `groupIndex` / `isCompound` were declared on GrooveOverrideOptions
                // but never passed here, so per-genre strategies silently consumed
                // `undefined` — `tsConfig.pulse.includes(undefined)` is always false,
                // and the compound-meter skip-beat branch keyed off `stepInGroup ===
                // groupSteps - 1` could never fire. `stepInfo` already carries all
                // four (computed in utils.ts `getStepInfo`); thread them through.
                // `isPulse` / `isPulseStart` are likewise stepInfo-sourced. NOTE: the
                // blast radius is wider than jazz.ts — funk.ts (`isPulse` ×3),
                // latin.ts and reggae.ts (`isPulseStart` ×3 each) all read these from
                // the context bag, so S8(c) re-activates previously-dead idiom
                // branches in four genres (jazz/funk/latin/reggae), not just jazz.
                mStep: stepInfo.mStep,
                stepInGroup: stepInfo.stepInGroup,
                groupIndex: stepInfo.groupIndex,
                isCompound: stepInfo.isCompound,
                isPulse: stepInfo.isPulse,
                isPulseStart: stepInfo.isPulseStart,
                isTurnaround,
                stepsPerBar,
                loopStep: drumStep,
                // why: epic-form-arrangement S3 — Imperfect Symmetry for drums on
                // repeat passes. Published per-tick on the coordination context by
                // the chord-data preamble (see line ~162); pass it down so
                // applyGrooveOverrides can permute one ghost note per 16-step bar
                // when sectionOccurrence ≥ 2. Default 1 mirrors the coordination
                // context's createCoordinationContext default, so engines can safely
                // gate on `occurrence > 1` without an undefined check.
                sectionOccurrence: coordination.sectionOccurrence ?? 1,
                // why: epic-form-arrangement S4 — final-bar resolution cascade.
                // Published per-tick on the coordination context by the chord-data
                // preamble (see line ~199); pass it down so applyGrooveOverrides can
                // fire a Crash + sustained cymbal on the final bar of a song-mode
                // playback that is ending. Default `false` mirrors the coordination
                // context default; engines safely gate without an undefined check.
                isFinalMeasure: coordination.isFinalMeasure === true,
            });

            if (!evaluateOnly && result.shouldPlay) {
                drumHits.push({
                    shouldPlay: result.shouldPlay,
                    velocity: result.velocity,
                    soundName: result.soundName,
                    instTimeOffset: result.instTimeOffset,
                    inst,
                });
            }
            return result.shouldPlay;
        };

        // writer: drum preamble; readable-after: any producer (bass locks to kick using this)
        coordination.kickHit = checkHit('Kick', true);
        // writer: drum preamble; readable-after: any producer
        coordination.snareHit = checkHit('Snare', true);

        // If including drums, process all instruments for actual playback
        if (includeDrums) {
            groove.instruments.forEach((inst) => {
                checkHit(inst.name, false);
            });
        }
    }

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
            soloResult = getSoloistNote(
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
            // Written here (after getSoloistNote) so session state reflects this tick's
            // final phrasing decisions before harmony runs.
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
            for (let i = 0; i < chordNotes.length; i++) {
                const n = chordNotes[i];
                // Enforce Contract: Register Slotting
                n.midi = enforceRegisterSlotting('chords', n.midi, coordination);

                if (!n.freq) {
                    n.freq = getFrequency(n.midi);
                }
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

                if (!n.freq) {
                    n.freq = getFrequency(n.midi);
                }
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
        let macroFloor = 0.2;
        let macroCeiling = 0.6;

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
