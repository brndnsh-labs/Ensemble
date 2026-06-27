import { TIME_SIGNATURES } from '../config.js';
import { analyzeForm } from '../form-analysis.js';
import type { EnsembleState, Mutable, StepInfo } from '../types.js';
import { binarySearchMap, getStepInfo, secondsPerStepFor } from '../utils.js';
import { WORKER_RESP } from '../worker-types.js';
import { compingState } from './accompaniment.js';
import { resetBassState } from './bass-engine.js';
import { updateCoordinationContext } from './coordination-engine.js';
import { calculatePocketOffset, calculateStepDuration } from './groove-engine.js';
import { DRUM_MAP } from './midi-constants.js';
import {
    MidiTrack,
    normalizeMidiVelocity,
    writeInt16,
    writeInt32,
    writeString,
} from './midi-utils.js';
import { generateResolutionNotes } from './resolution.js';
import { resetSoloistState } from './soloist.js';
import { applyWorkerTransition, generateNotesForStep } from './tick-logic.js';
import { getChordAtStep } from './worker-utils.js';

const MIDI_EXTENSION_PATTERN = /\.midi?$/i;
const PPQ = 480;

export interface ExportOptions {
    includedTracks?: string[];
    targetDuration?: number;
    loopMode?: string;
    filename?: string;
    [key: string]: any;
}

export interface ExportCursor {
    index: number;
    sectionIndex: number;
}

export interface ExportPrevStates {
    chords: boolean;
    bass: boolean;
    soloist: boolean;
    harmony: boolean;
    groove: boolean;
    intensity: number;
    mode: any;
    sessionSteps: any;
    currentLoopCount: number;
}

export interface ExportConductor {
    loopCount: number;
    formIteration: number;
    targetIntensity: number;
    stepSize: number;
    form: any;
    loopMode: string;
    totalLoops: number;
}

// Internal variable tracking export state for message queueing in logic-worker
let _isExporting = false;
export const isExporting = (): boolean => _isExporting;
let _onExportEnd: (() => void) | null = null;
export const setOnExportEnd = (fn: (() => void) | null): (() => void) | null => (_onExportEnd = fn);

export class ExportProcessor {
    state: EnsembleState;
    options: ExportOptions;
    includedTracks: string[];
    targetDuration: number;
    loopMode: string;
    filename: string | undefined;
    CHUNK_MS: number;
    ts: any;
    totalStepsOneLoop: number;
    stepsPerMeasure: number;
    loopCount: number;
    totalStepsWithoutEnding: number;
    totalStepsExport: number;
    exportCursor: ExportCursor;
    exportLookaheadCursor: ExportCursor;
    stepTimes: number[];
    secondsPerBeat: number;
    sixteenthSec: number;
    metaTrack: MidiTrack;
    chordTrack: MidiTrack;
    bassTrack: MidiTrack;
    soloistTrack: MidiTrack;
    harmonyTrack: MidiTrack;
    drumTrack: MidiTrack;
    prevStates: ExportPrevStates;
    exportConductor: ExportConductor;
    globalStep: number;
    // why: sticky cross-tick soloist position for harmony's spectral-gap branch.
    // Independent from the live workerContext so an export run doesn't pollute (or get
    // polluted by) playback state. Step is paired so consumers can age-cap stale values.
    lastActiveSoloistMidi: number;
    lastActiveSoloistStep: number;

    constructor(state: EnsembleState, options: ExportOptions) {
        const { arranger, groove, playback, chords, bass, soloist, harmony } = state;
        this.state = state;
        this.options = options;
        this.includedTracks = options.includedTracks || [
            'chords',
            'bass',
            'soloist',
            'harmonies',
            'drums',
        ];
        this.targetDuration = options.targetDuration || 3;
        this.loopMode = options.loopMode || 'time';
        this.filename = options.filename;

        this.CHUNK_MS = 12; // Allow execution for ~12ms per frame

        // Initialize Export State
        this.ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        this.totalStepsOneLoop = arranger.totalSteps;
        this.stepsPerMeasure = this.ts.beats * this.ts.stepsPerBeat;
        // why: loop-duration estimate must match the step accumulation used by
        // `calculateStepDuration` and `stepTimes` below. BPM is quarter-notes/
        // min for every meter, so one step (a 16th) is (60/bpm)/4 everywhere.
        const stepSecForLoop = secondsPerStepFor(playback.bpm || 120);
        const loopSeconds = this.totalStepsOneLoop * stepSecForLoop;
        this.loopCount =
            this.loopMode === 'once'
                ? 1
                : Math.max(1, Math.min(100, Math.ceil((this.targetDuration * 60) / loopSeconds)));
        this.totalStepsWithoutEnding = this.totalStepsOneLoop * this.loopCount;
        this.totalStepsExport = this.totalStepsWithoutEnding + 16;

        this.exportCursor = { index: 0, sectionIndex: 0 };
        this.exportLookaheadCursor = { index: 0, sectionIndex: 0 };

        // Timing Map
        this.stepTimes = new Array(this.totalStepsExport + 128);
        // why: `secondsPerBeat` is the cymbal ring length for ride / crash
        // sustains — one quarter-note (60/bpm) in every meter. Not routed
        // through `secondsPerBeatFor`, which returns one `ts.beats`-native unit
        // (one eighth for 6/8 / 7/8 / 12/8) — shorter than the cymbal ring we
        // want here.
        this.secondsPerBeat = 60.0 / playback.bpm;
        // why: `sixteenthSec` is misnamed but consumers use it as "duration of
        // one step" = (60/bpm)/4 in all meters; matches `calculateStepDuration`
        // and the `stepTimes` accumulation below.
        this.sixteenthSec = stepSecForLoop;

        let accumulatedSeconds = 0;

        const signatures: any = TIME_SIGNATURES;

        for (let i = 0; i < this.stepTimes.length; i++) {
            this.stepTimes[i] = accumulatedSeconds;

            const sInfo = getStepInfo(
                i,
                signatures[arranger.timeSignature] || signatures['4/4'],
                arranger.measureMap,
                signatures,
            );
            const ts = signatures[sInfo.tsName || '4/4'] || signatures['4/4'];

            const duration = calculateStepDuration(i, playback.bpm, ts, groove);
            accumulatedSeconds += duration;
        }

        // MIDI Tracks
        this.metaTrack = new MidiTrack();
        this.chordTrack = new MidiTrack();
        this.bassTrack = new MidiTrack();
        this.soloistTrack = new MidiTrack();
        this.harmonyTrack = new MidiTrack();
        this.drumTrack = new MidiTrack();

        this.metaTrack.setName(0, 'Ensemble Export');
        // Displayed BPM is quarter-notes/min for every meter, matching the MIDI
        // tempo convention — write it straight through with no conversion.
        this.metaTrack.setTempo(0, playback.bpm || 120);
        this.metaTrack.setKeySig(0, (arranger.key as any) || 'C', arranger.isMinor || false);
        const [tsNum, tsDenom] = (arranger.timeSignature || '4/4').split('/').map(Number);
        this.metaTrack.setTimeSig(0, tsNum, tsDenom);

        this.chordTrack.setName(0, 'Chords');
        this.chordTrack.programChange(0, this.state.midi.chordsChannel - 1, 4);
        this.chordTrack.pitchBend(0, this.state.midi.chordsChannel - 1, 0);

        this.bassTrack.setName(0, 'Bass');
        this.bassTrack.programChange(0, this.state.midi.bassChannel - 1, 34);
        this.bassTrack.setPitchBendRange(0, this.state.midi.bassChannel - 1, 2);
        this.bassTrack.pitchBend(0, this.state.midi.bassChannel - 1, 0);

        this.soloistTrack.setName(0, 'Soloist');
        this.soloistTrack.programChange(0, this.state.midi.soloistChannel - 1, 80);
        this.soloistTrack.setPitchBendRange(0, this.state.midi.soloistChannel - 1, 2);
        this.soloistTrack.pitchBend(0, this.state.midi.soloistChannel - 1, 0);

        this.harmonyTrack.setName(0, 'Harmonies');
        this.harmonyTrack.programChange(0, this.state.midi.harmonyChannel - 1, 61);
        this.harmonyTrack.pitchBend(0, this.state.midi.harmonyChannel - 1, 0);

        this.drumTrack.setName(0, 'Drums');

        // Snapshot and Apply Overrides
        this.prevStates = {
            chords: chords.enabled,
            bass: bass.enabled,
            soloist: soloist.enabled,
            harmony: harmony.enabled,
            groove: groove.enabled,
            intensity: playback.bandIntensity,
            mode: soloist.mode,
            sessionSteps: soloist.session.sessionSteps,
            currentLoopCount: playback.currentLoopCount,
        };

        (chords as Mutable<typeof chords>).enabled = true; // @worker-mutation
        (bass as Mutable<typeof bass>).enabled = true; // @worker-mutation
        (soloist as Mutable<typeof soloist>).enabled = true; // @worker-mutation
        (harmony as Mutable<typeof harmony>).enabled = true; // @worker-mutation
        (groove as Mutable<typeof groove>).enabled = true; // @worker-mutation
        (playback as Mutable<typeof playback>).currentLoopCount = 0; // @worker-mutation

        resetSoloistState(this.state);
        resetBassState(this.state);
        (harmony as Mutable<typeof harmony>).lastMidis = []; // @worker-mutation
        (groove as Mutable<typeof groove>).fillActive = false; // @worker-mutation
        (groove as Mutable<typeof groove>).pendingCrash = false; // @worker-mutation

        compingState.lockedUntil = 0; // @worker-mutation
        compingState.lastChordIndex = -1; // @worker-mutation
        compingState.grooveRetentionCount = 0; // @worker-mutation
        compingState.lastVoicingMidis = []; // @worker-mutation
        compingState.statementChordKey = null; // @worker-mutation — #715 per-hit-economy memory
        compingState.statementVoicingMidis = []; // @worker-mutation

        // Conductor State
        this.exportConductor = {
            loopCount: 0,
            formIteration: 0,
            targetIntensity: playback.bandIntensity,
            stepSize: 0,
            form: analyzeForm(this.state.arranger),
            loopMode: this.loopMode,
            totalLoops: this.loopCount,
        };

        this.globalStep = 0;
        this.lastActiveSoloistMidi = 0;
        this.lastActiveSoloistStep = 0;
    }

    start(): void {
        const { arranger } = this.state;
        if (arranger.progression.length === 0) {
            postMessage({ type: WORKER_RESP.ERROR, data: 'No progression to export' });
            this.cleanup();
            return;
        }

        _isExporting = true;
        this.processChunk();
    }

    toPulses(t: number): number {
        const { playback } = this.state;
        // `t` is in real seconds; PPQ is per-quarter and BPM is quarter-notes/min
        // for every meter, so quarter-BPM is just the displayed BPM.
        return Math.round(t * (playback.bpm / 60.0) * PPQ);
    }

    /**
     * Writes global MIDI CC automation (Expression and Tension) to tracks.
     */
    _writeAutomationToTracks(_globalStep: number, stepTimeS: number, stepInfo: StepInfo): void {
        if (!stepInfo.isBeatStart) {
            return;
        }

        const { playback, soloist, midi } = this.state;
        const pulse = this.toPulses(stepTimeS);

        const intensityCC = Math.floor((playback.bandIntensity || 0.5) * 127);
        const soloistTensionCC = Math.floor((soloist.session.tension || 0) * 127);

        // Expression (CC 11) for all pitched instruments
        this.soloistTrack.cc(pulse, midi.soloistChannel - 1, 11, intensityCC);
        this.chordTrack.cc(pulse, midi.chordsChannel - 1, 11, intensityCC);
        this.bassTrack.cc(pulse, midi.bassChannel - 1, 11, intensityCC);

        // Modulation/Tension (CC 1) for Soloist
        this.soloistTrack.cc(pulse, midi.soloistChannel - 1, 1, soloistTensionCC);
    }

    _writeNotesToTrack(
        track: MidiTrack,
        channel: number,
        notes: any[],
        stepTimeS: number,
        moduleName: string,
        coordination: any,
        globalStep: number,
    ): void {
        const polyphonyComp = 1 / Math.sqrt(Math.max(1, notes.length));
        const midiState = this.state.midi;
        const humanizeFactor = (this.state.groove.humanize || 0) / 100;

        notes.forEach((res) => {
            if (res.midi && res.midi > 0) {
                const noteTimeS = stepTimeS + (res.timingOffset || 0);
                const notePulse = Math.max(0, this.toPulses(noteTimeS));

                let octaveShift = 0;
                if (moduleName === 'bass') {
                    octaveShift = midiState.bassOctave || 0;
                } else if (moduleName === 'chords') {
                    octaveShift = midiState.chordsOctave || 0;
                } else if (moduleName === 'soloist') {
                    octaveShift = midiState.soloistOctave || 0;
                } else if (moduleName === 'harmony') {
                    octaveShift = midiState.harmonyOctave || 0;
                }

                const finalMidi = Math.max(0, Math.min(127, res.midi + octaveShift * 12));

                let finalVel = res.velocity * polyphonyComp;

                // Match live engine dynamic scaling
                if (moduleName === 'bass') {
                    // Match synth-bass square-root compression curve
                    finalVel = Math.sqrt(res.velocity);
                } else if (moduleName === 'soloist') {
                    // Match synth-soloist band intensity swell
                    const intensity = this.state.playback.bandIntensity ?? 0.5;
                    const intensityGain = 0.5 + intensity * 0.9;
                    finalVel = res.velocity * intensityGain;
                }

                if (res.muted) {
                    finalVel *= moduleName === 'bass' ? 0.15 : 0.3;
                }

                // Apply global humanization to velocity
                if (humanizeFactor > 0) {
                    const velJitter = 1.0 + (Math.random() - 0.5) * (humanizeFactor * 0.2);
                    finalVel *= velJitter;
                }

                const midiVel = normalizeMidiVelocity(finalVel);

                if (res.ccEvents && res.ccEvents.length > 0) {
                    res.ccEvents.forEach((cc: any) =>
                        track.cc(notePulse, channel, cc.controller, cc.value),
                    );
                }

                if (res.bendStartInterval) {
                    track.pitchBend(
                        notePulse,
                        channel,
                        Math.round(-(res.bendStartInterval / 2) * 8192),
                    );
                    track.noteOn(notePulse, channel, finalMidi, midiVel);
                } else {
                    track.noteOn(notePulse, channel, finalMidi, midiVel);
                }

                let endTimeS: number;
                let actualDurationSteps = res.durationSteps;

                // Handle Staccato "Dry" notes (e.g. Reggae Skanks, Funk Chucks)
                if (res.dry) {
                    actualDurationSteps *= 0.3;
                }

                if (actualDurationSteps < 1) {
                    endTimeS = noteTimeS + actualDurationSteps * this.sixteenthSec;
                } else {
                    const targetStepIdx = globalStep + Math.round(actualDurationSteps);
                    endTimeS =
                        this.stepTimes[targetStepIdx] ||
                        noteTimeS + actualDurationSteps * this.sixteenthSec;
                }

                if (endTimeS - noteTimeS < 0.05) {
                    endTimeS = noteTimeS + 0.05;
                }

                if (res.bendStartInterval) {
                    const resetTimeS = Math.min(endTimeS, noteTimeS + 0.05);
                    track.pitchBend(this.toPulses(resetTimeS), channel, 0);
                }

                if (moduleName === 'soloist') {
                    // Extend overlap for Legato slides to trigger DAW glide
                    endTimeS += res.isLegato ? 0.05 : 0.015;
                } else if (moduleName === 'bass') {
                    endTimeS += 0.02;
                }

                track.noteOff(this.toPulses(endTimeS), channel, finalMidi);
            } else if (res.ccEvents && res.ccEvents.length > 0) {
                const noteTimeS = stepTimeS + (res.timingOffset || 0);
                const notePulse = Math.max(0, this.toPulses(noteTimeS));
                res.ccEvents.forEach((cc: any) =>
                    track.cc(notePulse, channel, cc.controller, cc.value),
                );
            }
        });
        updateCoordinationContext(coordination, moduleName, notes);
    }

    processChunk(): void {
        try {
            const chunkStart = performance.now();

            while (this.globalStep < this.totalStepsWithoutEnding) {
                // Check time budget
                if (performance.now() - chunkStart > this.CHUNK_MS) {
                    const progress = Math.min(0.99, this.globalStep / this.totalStepsExport);
                    postMessage({ type: WORKER_RESP.EXPORT_PROGRESS, progress });
                    setTimeout(() => this.processChunk(), 0);
                    return;
                }

                this.processStep(this.globalStep);
                this.globalStep++;
            }

            this.finish();
        } catch (e) {
            postMessage({
                type: WORKER_RESP.ERROR,
                data: (e as Error).message,
                stack: (e as Error).stack,
            });
            this.cleanup();
        }
    }

    processStep(globalStep: number): void {
        applyWorkerTransition(this.state, globalStep, this.exportConductor);

        const { arranger, groove, playback } = this.state;
        const stepTimeS = this.stepTimes[globalStep];

        const tickResult = generateNotesForStep(
            this.state,
            globalStep,
            {
                mainCursor: this.exportCursor,
                lookaheadCursor: this.exportLookaheadCursor,
            },
            {
                includeSoloist: this.includedTracks.includes('soloist'),
                includeBass: this.includedTracks.includes('bass'),
                includeChords: this.includedTracks.includes('chords'),
                includeHarmony: this.includedTracks.includes('harmonies'),
                includeDrums: this.includedTracks.includes('drums'),
            },
            // Thread sticky soloist position across ticks so the exported harmony track
            // matches live playback's spectral-gap behavior. Step paired so consumers
            // can age-cap stale values.
            {
                lastActiveSoloistMidi: this.lastActiveSoloistMidi,
                lastActiveSoloistStep: this.lastActiveSoloistStep,
            },
        );

        if (tickResult.coordination?.lastActiveSoloistMidi) {
            this.lastActiveSoloistMidi = tickResult.coordination.lastActiveSoloistMidi;
            this.lastActiveSoloistStep = tickResult.coordination.lastActiveSoloistStep;
        }

        const stepInfo = getStepInfo(
            globalStep,
            TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'],
            arranger.measureMap,
            TIME_SIGNATURES,
        );

        // Write CC Automation (Expression/Intensity and Tension)
        this._writeAutomationToTracks(globalStep, stepTimeS, stepInfo);

        const notes = tickResult.notes;
        const drumHits = tickResult.drumHits;

        const chordData = getChordAtStep(globalStep, arranger, this.exportCursor);
        if (chordData && chordData.stepInChord === 0) {
            const { chord } = chordData;
            const pulse = this.toPulses(stepTimeS);
            const modStep = globalStep % this.totalStepsOneLoop;
            const section = binarySearchMap(arranger.sectionMap || [], modStep);

            if (section && section.start === modStep) {
                this.metaTrack.marker(pulse, `--- ${section.label} ---`);
            }
            this.metaTrack.marker(pulse, chord.absName || 'Chord');

            if (this.includedTracks.includes('chords')) {
                this.chordTrack.text(pulse, chord.absName || 'Chord');
            }
        }

        const soloistNotes = notes.filter((n: any) => n.module === 'soloist');
        if (soloistNotes.length > 0) {
            this._writeNotesToTrack(
                this.soloistTrack,
                this.state.midi.soloistChannel - 1,
                soloistNotes,
                stepTimeS,
                'soloist',
                tickResult.coordination,
                globalStep,
            );
        }

        const bassNotes = notes.filter((n: any) => n.module === 'bass');
        if (bassNotes.length > 0) {
            this._writeNotesToTrack(
                this.bassTrack,
                this.state.midi.bassChannel - 1,
                bassNotes,
                stepTimeS,
                'bass',
                tickResult.coordination,
                globalStep,
            );
        }

        const chordsNotes = notes.filter((n: any) => n.module === 'chords');
        if (chordsNotes.length > 0) {
            this._writeNotesToTrack(
                this.chordTrack,
                this.state.midi.chordsChannel - 1,
                chordsNotes,
                stepTimeS,
                'chords',
                tickResult.coordination,
                globalStep,
            );
        }

        const harmonyNotes = notes.filter((n: any) => n.module === 'harmony');
        if (harmonyNotes.length > 0) {
            this._writeNotesToTrack(
                this.harmonyTrack,
                this.state.midi.harmonyChannel - 1,
                harmonyNotes,
                stepTimeS,
                'harmony',
                tickResult.coordination,
                globalStep,
            );
        }

        if (this.includedTracks.includes('drums')) {
            // #714: thread the real step + loop length so export drum timing matches
            // the shared per-step pocket (and the realtime scheduler), keeping
            // playback/export parity airtight and the drum lane loop-stable.
            const drumTimeS =
                stepTimeS +
                calculatePocketOffset(playback, groove, globalStep, this.totalStepsOneLoop);

            const nextStepTimeS = this.stepTimes[globalStep + 1] || stepTimeS + this.sixteenthSec;
            const tightDurationS = (nextStepTimeS - stepTimeS) * 0.75;

            if (groove.fillActive) {
                const fillStep = globalStep - groove.fillStartStep;
                if (fillStep === groove.fillLength) {
                    (groove as Mutable<typeof groove>).fillActive = false; // @worker-mutation
                    (groove as Mutable<typeof groove>).pendingCrash = false; // @worker-mutation
                }
            }

            drumHits.forEach((hit: any) => {
                const soundName = hit.soundName as any;
                const instName = (hit.inst as any).name;
                const name = soundName || instName;
                let midi = (DRUM_MAP as any)[soundName] || (DRUM_MAP as any)[instName];

                if (midi) {
                    midi += (this.state.midi.drumsOctave || 0) * 12;
                    midi = Math.max(0, Math.min(127, midi));
                }

                // Fuzzy matching for unmapped dynamic names
                if (!midi) {
                    if (name.includes('Tom')) {
                        if (name.includes('High')) {
                            midi = (DRUM_MAP as any)['High Tom'];
                        } else if (name.includes('Low')) {
                            midi = (DRUM_MAP as any)['Low Tom'];
                        } else {
                            midi = (DRUM_MAP as any)['Mid Tom'];
                        }
                    } else if (name.includes('Agogo')) {
                        if (name.includes('Low')) {
                            midi = (DRUM_MAP as any)['Low Agogo'];
                        } else {
                            midi = (DRUM_MAP as any)['High Agogo'];
                        }
                    } else if (name.includes('Bongo')) {
                        // why: S8(d) — DRUM_MAP keys are suffix-first
                        // (`Bongo<Variant>`), matching Agogo/Cowbell.
                        if (name.includes('Low')) {
                            midi = (DRUM_MAP as any).BongoLow;
                        } else {
                            midi = (DRUM_MAP as any).BongoHigh;
                        }
                    } else if (name.includes('Conga')) {
                        // why: S8(d) — DRUM_MAP keys are suffix-first
                        // (`Conga<Variant>`), matching Agogo/Cowbell.
                        if (name.includes('Low')) {
                            midi = (DRUM_MAP as any).CongaLow;
                        } else if (name.includes('Open')) {
                            midi = (DRUM_MAP as any).CongaOpen;
                        } else if (name.includes('Mute')) {
                            midi = (DRUM_MAP as any).CongaMute;
                        } else if (name.includes('Slap')) {
                            midi = (DRUM_MAP as any).CongaSlap;
                        } else {
                            midi = (DRUM_MAP as any).CongaHigh;
                        }
                    } else if (name.includes('Cowbell')) {
                        // why: live drum engine (playDrumSoundCurrent's Cowbell block) emits
                        // 'CowbellHigh'/'CowbellLow' for the disco octave-cowbell
                        // motif (Epic 7 S2). Without this branch the variants
                        // would fall through and silently drop from MIDI export
                        // while still rendering in audio. GM has only one cowbell
                        // note (56), so high/low both map to it — the per-voice
                        // pitch shift is a synth-side effect, not a MIDI feature.
                        midi = (DRUM_MAP as any).Cowbell;
                    } else if (name.includes('Brush')) {
                        // why: any 'Brush'-named variant routes to the bare
                        // Brush mapping (Side Stick 37) — see midi-constants.ts.
                        midi = (DRUM_MAP as any).Brush;
                    }
                }

                if (midi) {
                    const durS =
                        name === 'Open' || name === 'Crash' ? this.secondsPerBeat : tightDurationS;
                    const finalTimeS = drumTimeS + hit.instTimeOffset;

                    // Match live engine velocity scaling multipliers
                    let volMultiplier = 1.0;
                    if (name === 'Kick' || name === 'Snare' || name === 'Sidestick') {
                        volMultiplier = 1.3;
                    } else if (name === 'HiHat') {
                        volMultiplier = 0.85;
                    } else if (name === 'Open') {
                        volMultiplier = 0.75;
                    } else if (name === 'Ride') {
                        volMultiplier = 0.8;
                    } else if (name === 'Crash') {
                        volMultiplier = 0.85;
                    } else if (name.includes('Tom')) {
                        volMultiplier = 0.8;
                    } else if (name === 'Clave') {
                        volMultiplier = 0.7;
                    } else if (name.startsWith('Conga') || name.startsWith('Bongo')) {
                        volMultiplier = name.includes('Slap') ? 0.85 : 0.7;
                    } else if (name.startsWith('Agogo') || name === 'Perc') {
                        volMultiplier = 0.35;
                    } else if (name === 'Guiro') {
                        volMultiplier = 0.5;
                    } else if (name === 'Shaker') {
                        volMultiplier = 0.45;
                    } else if (name.includes('Cowbell')) {
                        // matches live cowbell perceived loudness vs other perc.
                        volMultiplier = 0.6;
                    } else if (name.includes('Brush')) {
                        // soft sweep — exported via Side Stick (37); damp to
                        // avoid triggering an importer's hard-accent threshold.
                        volMultiplier = 0.5;
                    }

                    const scaledVelocity = hit.velocity * volMultiplier;
                    const midiVel = normalizeMidiVelocity(scaledVelocity);

                    this.drumTrack.noteOn(
                        this.toPulses(finalTimeS),
                        this.state.midi.drumsChannel - 1,
                        midi,
                        midiVel,
                    );
                    this.drumTrack.noteOff(
                        this.toPulses(finalTimeS + durS),
                        this.state.midi.drumsChannel - 1,
                        midi,
                    );
                }
            });
        }
    }

    finish(): void {
        const { arranger, playback, groove, soloist } = this.state;
        const resolutionStep = this.totalStepsWithoutEnding;
        const resTimeS = this.stepTimes[resolutionStep];
        const resPulse = this.toPulses(resTimeS);

        this.metaTrack.marker(resPulse, '=== Resolution ===');

        const resolutionNotes = generateResolutionNotes(
            this.state,
            resolutionStep,
            arranger,
            {
                bass: this.includedTracks.includes('bass'),
                chords: this.includedTracks.includes('chords'),
                soloist: this.includedTracks.includes('soloist'),
                harmony: this.includedTracks.includes('harmonies'),
                groove: this.includedTracks.includes('drums'),
            } as any,
            playback.bpm,
            groove,
            soloist,
        );

        resolutionNotes.forEach((n: any) => {
            let track: MidiTrack | undefined;
            let channel = 0;
            if (n.module === 'bass') {
                track = this.bassTrack;
                channel = this.state.midi.bassChannel - 1;
            } else if (n.module === 'chords') {
                track = this.chordTrack;
                channel = this.state.midi.chordsChannel - 1;
            } else if (n.module === 'soloist') {
                track = this.soloistTrack;
                channel = this.state.midi.soloistChannel - 1;
            } else if (n.module === 'harmony') {
                track = this.harmonyTrack;
                channel = this.state.midi.harmonyChannel - 1;
            } else if (n.module === 'groove') {
                track = this.drumTrack;
                channel = this.state.midi.drumsChannel - 1;
            }

            if (!track) {
                return;
            }

            const offsetS = n.timingOffset || 0;
            const notePulse = this.toPulses(resTimeS + offsetS);

            if (n.ccEvents) {
                n.ccEvents.forEach((cc: any) => {
                    track!.cc(
                        this.toPulses(resTimeS + (cc.timingOffset || 0)),
                        channel,
                        cc.controller,
                        cc.value,
                    );
                });
            }

            if (n.midi && n.midi > 0) {
                let octaveShift = 0;
                if (n.module === 'bass') {
                    octaveShift = this.state.midi.bassOctave || 0;
                } else if (n.module === 'chords') {
                    octaveShift = this.state.midi.chordsOctave || 0;
                } else if (n.module === 'soloist') {
                    octaveShift = this.state.midi.soloistOctave || 0;
                } else if (n.module === 'harmony') {
                    octaveShift = this.state.midi.harmonyOctave || 0;
                }

                const finalMidi = Math.max(0, Math.min(127, n.midi + octaveShift * 12));

                if (n.module === 'soloist' && n.bendStartInterval) {
                    track.pitchBend(
                        notePulse,
                        channel,
                        Math.round(-(n.bendStartInterval / 2) * 8192),
                    );
                }

                track.noteOn(notePulse, channel, finalMidi, n.midiVelocity || 90);

                const durationS = (n.durationSteps || 1) * this.sixteenthSec;
                const endTimeS = resTimeS + offsetS + durationS;

                if (n.module === 'soloist' && n.bendStartInterval) {
                    const resetTimeS = Math.min(endTimeS, resTimeS + offsetS + 0.05);
                    track.pitchBend(this.toPulses(resetTimeS), channel, 0);
                }

                track.noteOff(this.toPulses(endTimeS), channel, finalMidi);
            } else if (n.module === 'groove' && n.name) {
                let midi = (DRUM_MAP as any)[n.name];
                if (midi) {
                    midi += (this.state.midi.drumsOctave || 0) * 12;
                    midi = Math.max(0, Math.min(127, midi));

                    track.noteOn(notePulse, channel, midi, n.midiVelocity || 110);
                    const durS = n.name === 'Crash' ? 3.0 : 0.1;
                    track.noteOff(this.toPulses(resTimeS + offsetS + durS), channel, midi);
                }
            }
        });

        // Cleanup: Release sustain for chords if they were active
        if (this.includedTracks.includes('chords')) {
            this.chordTrack.cc(
                this.toPulses(resTimeS + 16.1 * this.sixteenthSec),
                this.state.midi.chordsChannel - 1,
                64,
                0,
            );
        }

        const finalPulse = this.toPulses(
            this.stepTimes[this.totalStepsExport - 1] + this.sixteenthSec,
        );
        const finalTrackList: MidiTrack[] = [this.metaTrack];
        const trackRefs: Record<string, MidiTrack> = {
            chords: this.chordTrack,
            bass: this.bassTrack,
            soloist: this.soloistTrack,
            harmonies: this.harmonyTrack,
            drums: this.drumTrack,
        };
        ['chords', 'bass', 'soloist', 'harmonies', 'drums'].forEach((key) => {
            if (this.includedTracks.includes(key)) {
                trackRefs[key].endOfTrack(finalPulse);
                finalTrackList.push(trackRefs[key]);
            }
        });
        this.metaTrack.endOfTrack(finalPulse);

        // Restore State
        this.cleanup();

        const header = new Uint8Array([
            ...writeString('MThd'),
            ...writeInt32(6),
            ...writeInt16(1),
            ...writeInt16(finalTrackList.length),
            ...writeInt16(PPQ),
        ]);

        // Optimization: Pre-allocate array and avoid reduce for compiling chunks
        const tLen = finalTrackList.length;
        const trackChunks: Uint8Array[] = new Array(tLen);
        let chunksTotalSize = 0;

        for (let i = 0; i < tLen; i++) {
            const chunk = finalTrackList[i].compile();
            trackChunks[i] = chunk;
            chunksTotalSize += chunk.length;
        }

        const totalSize = header.length + chunksTotalSize;
        const result = new Uint8Array(totalSize);
        result.set(header, 0);
        let offset = header.length;

        for (let i = 0; i < tLen; i++) {
            result.set(trackChunks[i], offset);
            offset += trackChunks[i].length;
        }

        const finalFilename = `${(this.filename || 'ensemble-export').replace(MIDI_EXTENSION_PATTERN, '')}.mid`;
        postMessage({ type: WORKER_RESP.EXPORT_COMPLETE, blob: result, filename: finalFilename });
    }

    cleanup(): void {
        const { chords, bass, soloist, harmony, groove, playback } = this.state;
        if (this.prevStates) {
            (chords as Mutable<typeof chords>).enabled = this.prevStates.chords; // @worker-mutation
            (bass as Mutable<typeof bass>).enabled = this.prevStates.bass; // @worker-mutation
            (soloist as Mutable<typeof soloist>).enabled = this.prevStates.soloist; // @worker-mutation
            (harmony as Mutable<typeof harmony>).enabled = this.prevStates.harmony; // @worker-mutation
            (groove as Mutable<typeof groove>).enabled = this.prevStates.groove; // @worker-mutation
            (playback as Mutable<typeof playback>).bandIntensity = this.prevStates.intensity; // @worker-mutation
            (soloist as Mutable<typeof soloist>).mode = this.prevStates.mode; // @worker-mutation
            (soloist.session as Mutable<typeof soloist.session>).sessionSteps =
                this.prevStates.sessionSteps; // @worker-mutation
            (playback as Mutable<typeof playback>).currentLoopCount =
                this.prevStates.currentLoopCount; // @worker-mutation
        }

        _isExporting = false;
        if (_onExportEnd) {
            _onExportEnd();
        }
    }
}

/**
 * Handles the offline MIDI export process.
 */
export function handleExport(state: EnsembleState, options: ExportOptions): void {
    try {
        const processor = new ExportProcessor(state, options);
        processor.start();
    } catch (e) {
        postMessage({
            type: WORKER_RESP.ERROR,
            data: (e as Error).message,
            stack: (e as Error).stack,
        });
    }
}
