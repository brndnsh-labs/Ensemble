import { TIME_SIGNATURES } from '../config.js';
import { getSectionEnergy } from '../form-analysis.js';
import type { EnsembleState } from '../types.js';
import { getStepInfo, isSectionTurnaround } from '../utils.js';
import { isIntroSectionLabel, isOutroSectionLabel } from './arrangement-layering.js';
import { getSectionContext } from './arranger-utils.js';
import {
    type CoordinationCarryover,
    type CoordinationContext,
    createCoordinationContext,
    getAltPitchClasses,
    isTensionChordForSoloist,
} from './coordination-engine.js';
import { shouldFireDropMute } from './drop-mechanic.js';
import { applyGrooveOverrides, calculatePocketOffset } from './groove-engine.js';
import { isInstrumentActiveAtStep } from './section-overrides.js';
import type { DrumHitInfo, TickCursors } from './tick-logic.js';
import { type ChordAtStep, getChordAtStep } from './worker-utils.js';

/**
 * Shared per-tick context produced by the drum preamble + drum block. The lane
 * sections in `tick-logic.ts` (soloist/bass/chords/harmony) consume the SAME
 * objects returned here — preserving the load-bearing coordination publication
 * ordering and byte-identical drum output. This module imports ONLY clean deps
 * (groove/fills/coordination/arranger/form) so the real-time scheduler can pull
 * drums without dragging the heavy lane generators into the main chunk.
 */
export interface DrumTickResult {
    coordination: CoordinationContext;
    chordData: ChordAtStep | null;
    stepInfo: ReturnType<typeof getStepInfo>;
    ts: (typeof TIME_SIGNATURES)[keyof typeof TIME_SIGNATURES];
    stepsPerBar: number;
    dropMuteActive: boolean;
    drumHits: DrumHitInfo[];
    includeSoloist: boolean;
    includeBass: boolean;
    includeChords: boolean;
    includeHarmony: boolean;
}

/**
 * Runs the preamble + drum block of a single musical step — coordination
 * context assembly and all drum-hit generation. Code is MOVED VERBATIM from
 * `generateNotesForStep` (tick-logic.ts) so the drum output is byte-identical;
 * the lane sections compose on top of this result. The coordination-publication
 * ordering here is load-bearing — do not reorder.
 *
 * `carryover` carries sticky cross-tick coordination state — see
 * `generateNotesForStep` for the contract.
 */
export function runDrumTick(
    state: EnsembleState,
    step: number,
    cursors: TickCursors,
    carryover: CoordinationCarryover | null = null,
): DrumTickResult {
    const { arranger, groove, playback } = state;

    const includeChords = isInstrumentActiveAtStep(state, 'chords', step);
    const includeBass = isInstrumentActiveAtStep(state, 'bass', step);
    const includeSoloist = isInstrumentActiveAtStep(state, 'soloist', step);
    const includeHarmony = isInstrumentActiveAtStep(state, 'harmony', step);
    const includeDrums = isInstrumentActiveAtStep(state, 'groove', step);

    const drumHits: DrumHitInfo[] = [];

    const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepsPerBar = ts.beats * ts.stepsPerBeat;

    const chordData = getChordAtStep(step, arranger, cursors.mainCursor);
    const stepInfo = getStepInfo(step, ts, arranger.measureMap, TIME_SIGNATURES);

    // 1. Context Assembly (Anchor: Groove)
    const coordination = createCoordinationContext(step, stepInfo as any, carryover);
    // writer: groove preamble (this line); readable-after: any producer
    coordination.pocketOffset = calculatePocketOffset(playback, groove, step, arranger.totalSteps);

    if (chordData) {
        const { sectionEnd, sectionStart } = chordData;
        const remainingSteps = sectionEnd - step;
        const stepsPerMeasure = ts.beats * ts.stepsPerBeat;

        // why: section boundaries on the coordination context directly so consumers
        // that receive bare coordination (e.g. isBassActive) can read sectionEnd
        // without depending on the wrapper-context shape passed to getBassNote.
        // writer: chord-data preamble (these lines); readable-after: any producer
        coordination.sectionStart = sectionStart;
        coordination.sectionEnd = sectionEnd;

        // --- Structural Awareness: Turnaround Detection ---
        // writer: chord-data preamble (this line); readable-after: any producer
        const sectionSteps = sectionEnd - sectionStart;
        const isLongEnough = sectionSteps >= stepsPerMeasure * 8;
        coordination.isTurnaround = isLongEnough && remainingSteps <= stepsPerMeasure * 2;

        // --- Tension-chord publication (writer: chord-preamble; readable-after: any producer) ---
        // why: must be published BEFORE the soloist producer runs (line ~254) so the
        // pitch picker's final-stage `weight *= 3` multiplier on altered pitch classes
        // (soloist-pitch-engine.ts) actually sees the signal. The soloist always runs
        // ahead of the chords producer, so writing this in `updateCoordinationContext('chords')`
        // would be one tick too late. Both fields are pure functions of the current chord.
        const currentChord = chordData.chord;
        if (currentChord) {
            coordination.isTensionChord = isTensionChordForSoloist(currentChord.quality);
            coordination.altPitchClasses = getAltPitchClasses(
                currentChord.quality,
                currentChord.rootMidi,
            );
        }

        // why (Epic 3 S12): widen ONLY the structural counter to the penultimate bar so
        // the bass approach-window ramp has a `1` tier. Pure function of remainingSteps —
        // deliberately does NOT call getChordAtStep (which mutates lookaheadCursor), so the
        // harmonic lookahead schedule and cursor advance are untouched. The other three
        // lookahead fields stay final-bar-only (below) to avoid premature voice-leading
        // anticipation. Guarded on a resolvable form so an empty arrangement keeps -1.
        if (arranger.totalSteps > 0 && remainingSteps <= stepsPerMeasure * 2) {
            coordination.barsUntilSectionChange = Math.max(
                0,
                Math.floor((remainingSteps - 1) / stepsPerMeasure),
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
                coordination.upcomingSectionFirstChord = nextSectionChordData.chord;

                // --- Section-boundary lookahead (epic-deferred-followups S1(a)) ---
                // why: `upcomingSectionFirstChord` only tells engines WHICH chord
                // the next section opens on. The conductor / drop mechanic also
                // need the STRUCTURAL context: which section and how much louder.
                // We publish these here — pure functions of the lookahead chord —
                // so no producer re-derives them. They are only meaningful in the
                // last measure of a section (the same window `upcomingSectionFirstChord`
                // is populated in), hence the shared `remainingSteps <= stepsPerMeasure`
                // guard. (`barsUntilSectionChange` is the exception — Epic 3 S12 moved
                // it to a wider penultimate-bar window above; see that block.)
                const upcomingLabel = (nextSectionChordData.chord as any)?.sectionLabel ?? null;
                coordination.upcomingSectionLabel = upcomingLabel;
                // why: energy delta uses form-analysis.ts's 0..1 SECTION_ENERGY_MAP
                // (drop=1.0, breakdown=0.3, chorus=0.9, …). A large positive delta
                // means "the band is about to lift hard"; the drop mechanic and
                // S2's rock push both gate on it.
                coordination.upcomingSectionEnergyDelta =
                    getSectionEnergy(upcomingLabel) -
                    getSectionEnergy((currentChord as any)?.sectionLabel);
                // note (Epic 3 S12): `barsUntilSectionChange` is NO LONGER written here.
                // It moved to the wider `<= stepsPerMeasure * 2` block above so it can
                // hold `1` on the penultimate bar (the bass approach-window tier). The
                // three other fields stay final-bar-only here — publishing the upcoming
                // chord / label / energy delta a bar early would pull voice-leading
                // anticipation toward the next section prematurely.
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
                coordination.barsUntilSectionChange,
                coordination.upcomingSectionLabel,
                coordination.upcomingSectionEnergyDelta,
                dropFormProgress,
            )
        ) {
            coordination.dropMuteActive = true;
            // why: the crash marks the START of the empty bar — fire it on the
            // measure downbeat only, then leave the rest of the bar silent.
            coordination.dropCrashPending = stepInfo
                ? stepInfo.isMeasureStart
                : step % stepsPerMeasure === 0;
        }

        // --- Section-occurrence publication (epic-form-arrangement S2) ---
        // why: Imperfect Symmetry for repeat passes. The soloist already derives this
        // value via `getSectionContext` from its SRDC path (arranger-utils.ts); we publish
        // the same lookup onto the coordination context here so bass/drums/accomp
        // producers can diverge Verse 2 from Verse 1 without re-walking sectionMap.
        // Default 1 was already written by createCoordinationContext — we overwrite
        // only when arranger.sectionMap is populated. Must happen BEFORE any producer
        // runs, because the bass producer (which is the consumer in this story) is
        // invoked further down at line ~340.
        // writer: chord-data preamble (this line); readable-after: any producer
        const sectionCtx = getSectionContext(arranger, step);
        coordination.sectionOccurrence = sectionCtx.occurrence;

        // --- Final-measure publication (epic-form-arrangement S4) ---
        // why: form-arranger.md P1 #6 — only the soloist senses the form's end
        // today (derives a per-section `isLastSectionMeasure`). Bass,
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
        // (unrollArrangement in arranger-utils.ts assigns the roleLabel) but no
        // engine reads them. Publish two bar-counter fields so
        // bass/chords/harmony can stay silent for the first N bars of an
        // intro (drums-only opening that LAYERS in) and the last N bars of
        // an outro (band thins out before the final cadence).
        //
        // Source labels live on `chord.sectionLabel` (unrollArrangement sets this
        // via `sectionLabel: roleLabel`). Substring match — same vocabulary the
        // soloist already uses in its `isOutro` check.
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
            coordination.introBarsElapsed = Math.floor((step - sectionStart) / stepsPerMeasure);
        } else if (isOutroSectionLabel(currentLabel)) {
            // why: `Math.ceil` ensures the LAST step of the last bar still
            // reports `1` (not `0`) — so engines whose mute is `OUTRO_MUTES
            // <= 1` correctly silence on the entire final bar of the outro.
            // E.g. sectionEnd=64, step=63, spm=16 → ceil((64-63)/16)=1.
            // E.g. sectionEnd=64, step=48, spm=16 → ceil((64-48)/16)=1
            //   (the LAST bar). step=47 → ceil(17/16)=2 (the second-to-last).
            const remaining = sectionEnd - step;
            coordination.outroBarsRemaining =
                remaining > 0 ? Math.ceil(remaining / stepsPerMeasure) : 0;
        }
    }

    // Pre-calculate Drum Hits for Coordination
    const drumStep = step % (groove.measures * stepsPerBar);
    const sectionId = chordData?.chord?.sectionId || null;
    const seedIdx = groove.sectionSeedMap && sectionId ? groove.sectionSeedMap[sectionId] || 0 : 0;

    // --- Calculate Turnaround State ---
    const isTurnaround = isSectionTurnaround(step, arranger.sectionMap, stepsPerBar, 1);

    let fillPlayed = false;

    // --- Drop / Breakdown cut bar (epic-deferred-followups S1(b)) ---
    // why: during the 1-bar pre-drop mute the drums also cut — the ONLY
    // percussion event is a single Crash on the downbeat marking the empty
    // bar. We branch BEFORE the fill / pattern logic so a scheduled fill or
    // the base groove cannot smuggle hits into the cut bar. `kickHit` /
    // `snareHit` stay false (already their defaults) so any consumer reading
    // them sees the silence honestly. Drum genres that are drop-friendly only
    // — `shouldFireDropMute` already gated `dropMuteActive` on genre.
    const dropMuteActive = coordination.dropMuteActive === true;
    if (dropMuteActive) {
        if (includeDrums && coordination.dropCrashPending === true) {
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

            // Variation logic: use pre-computed variations when present.
            if (groove.variations) {
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

    return {
        coordination,
        chordData,
        stepInfo,
        ts,
        stepsPerBar,
        dropMuteActive,
        drumHits,
        includeSoloist,
        includeBass,
        includeChords,
        includeHarmony,
    };
}

/**
 * Drums-only tick entrypoint for the real-time scheduler. Runs the preamble +
 * drum block and returns just the drum hits — the only thing `scheduler-core`
 * consumes. By importing only clean deps (no lane generators), this keeps the
 * heavy accompaniment/bass/harmonies/chords modules off the main `index.js`
 * chunk. The `includeDrums` gating is honored inside `runDrumTick` (via
 * `isInstrumentActiveAtStep(state, 'groove', step)`), matching the prior
 * `generateNotesForStep` drum-only call exactly.
 */
export function generateDrumsForStep(
    state: EnsembleState,
    step: number,
    cursors: TickCursors,
    carryover: CoordinationCarryover | null = null,
): { drumHits: DrumHitInfo[] } {
    const { drumHits } = runDrumTick(state, step, cursors, carryover);
    return { drumHits };
}
