import { TIME_SIGNATURES } from '../config.js';
import { analyzeForm } from '../form-analysis.js';
import { binarySearchMap, getMidi, getStepInfo } from '../utils.js';
import { WORKER_RESP } from '../worker-types.js';
import { compingState } from './accompaniment.js';
import { enforceRegisterSlotting, updateCoordinationContext } from './coordination-engine.js';
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
import { applyWorkerTransition, generateNotesForStep } from './tick-logic.js';
import { getChordAtStep } from './worker-utils.js';

export const MIDI_EXTENSION_PATTERN = /\.midi?$/i;
export const PPQ = 480;

// Internal variable tracking export state for message queueing in logic-worker
let _isExporting = false;
export const isExporting = () => _isExporting;
/** @type {Function | null} */
let _onExportEnd = null;
/** @param {Function} fn */
export const setOnExportEnd = (fn) => (_onExportEnd = fn);

export class ExportProcessor {
    /**
     * @param {import('../types.js').EnsembleState} state
     * @param {any} options
     */
    constructor(state, options) {
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
        this.ts =
            /** @type {any} */ (TIME_SIGNATURES)[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        this.totalStepsOneLoop = arranger.totalSteps;
        this.stepsPerMeasure = this.ts.beats * this.ts.stepsPerBeat;
        const loopSeconds =
            (this.totalStepsOneLoop / (this.ts.stepsPerBeat || 4)) * (60 / (playback.bpm || 120));
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
        this.secondsPerBeat = 60.0 / playback.bpm;
        this.sixteenthSec = 0.25 * this.secondsPerBeat;

        let accumulatedSeconds = 0;

        /** @type {any} */
        const signatures = TIME_SIGNATURES;

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
        this.metaTrack.setTempo(0, playback.bpm || 120);
        this.metaTrack.setKeySig(
            0,
            /** @type {any} */ (arranger.key) || 'C',
            arranger.isMinor || false,
        );
        const [tsNum, tsDenom] = (arranger.timeSignature || '4/4').split('/').map(Number);
        this.metaTrack.setTimeSig(0, tsNum, tsDenom);

        this.chordTrack.setName(0, 'Chords');
        this.chordTrack.programChange(0, this.state.midi.chordsChannel - 1, 4);
        this.bassTrack.setName(0, 'Bass');
        this.bassTrack.programChange(0, this.state.midi.bassChannel - 1, 34);
        this.soloistTrack.setName(0, 'Soloist');
        this.soloistTrack.programChange(0, this.state.midi.soloistChannel - 1, 80);
        this.harmonyTrack.setName(0, 'Harmonies');
        this.harmonyTrack.programChange(0, this.state.midi.harmonyChannel - 1, 61);
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
            sessionSteps: soloist.sessionSteps,
        };

        chords.enabled = true; // @worker-mutation
        bass.enabled = true; // @worker-mutation
        soloist.enabled = true; // @worker-mutation
        harmony.enabled = true; // @worker-mutation
        groove.enabled = true; // @worker-mutation
        soloist.sessionSteps = 1000; // @worker-mutation
        compingState.lockedUntil = 0; // @worker-mutation
        compingState.lastChordIndex = -1; // @worker-mutation
        soloist.busySteps = 0; // @worker-mutation
        soloist.isResting = true; // @worker-mutation
        soloist.restSteps = 0; // @worker-mutation
        soloist.activeSteps = 0; // @worker-mutation

        // Conductor State
        this.exportConductor = {
            loopCount: 0,
            formIteration: 0,
            targetIntensity: playback.bandIntensity,
            stepSize: 0,
            form: analyzeForm(),
            loopMode: this.loopMode,
            totalLoops: this.loopCount,
        };

        this.globalStep = 0;
    }

    start() {
        const { arranger } = this.state;
        if (arranger.progression.length === 0) {
            postMessage({ type: WORKER_RESP.ERROR, data: 'No progression to export' });
            this.cleanup();
            return;
        }

        _isExporting = true;
        this.processChunk();
    }

    /**
     * @param {number} t
     */
    toPulses(t) {
        const { playback } = this.state;
        return Math.round(t * (playback.bpm / 60.0) * PPQ);
    }

    /**
     * @param {MidiTrack} track
     * @param {number} channel 0-indexed channel
     * @param {Array<any>} notes
     * @param {number} stepTimeS
     * @param {string} moduleName
     * @param {any} coordination
     * @param {number} globalStep
     */
    _writeNotesToTrack(track, channel, notes, stepTimeS, moduleName, coordination, globalStep) {
        const polyphonyComp = 1 / Math.sqrt(Math.max(1, notes.length));

        notes.forEach((res) => {
            if (res.midi && res.midi > 0) {
                const noteTimeS = stepTimeS + (res.timingOffset || 0);
                const notePulse = Math.max(0, this.toPulses(noteTimeS));

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
                const midiVel = normalizeMidiVelocity(finalVel);

                if (res.ccEvents && res.ccEvents.length > 0) {
                    res.ccEvents.forEach((/** @type {any} */ cc) =>
                        track.cc(notePulse, channel, cc.controller, cc.value),
                    );
                }

                if (res.bendStartInterval) {
                    track.pitchBend(
                        notePulse,
                        channel,
                        Math.round(-(res.bendStartInterval / 2) * 8192),
                    );
                    track.noteOn(notePulse, channel, res.midi, midiVel);
                    track.pitchBend(this.toPulses(stepTimeS + this.sixteenthSec), channel, 0);
                } else {
                    track.noteOn(notePulse, channel, res.midi, midiVel);
                }

                let endTimeS;
                if (res.durationSteps < 1) {
                    endTimeS = noteTimeS + res.durationSteps * this.sixteenthSec;
                } else {
                    const targetStepIdx = globalStep + Math.round(res.durationSteps);
                    endTimeS =
                        this.stepTimes[targetStepIdx] ||
                        noteTimeS + res.durationSteps * this.sixteenthSec;
                }
                if (endTimeS - noteTimeS < 0.05) {
                    endTimeS = noteTimeS + 0.05;
                }
                if (moduleName === 'soloist') {
                    endTimeS += 0.015;
                } else if (moduleName === 'bass') {
                    endTimeS += 0.02;
                }

                track.noteOff(this.toPulses(endTimeS), channel, res.midi);
            } else if (res.ccEvents && res.ccEvents.length > 0) {
                const noteTimeS = stepTimeS + (res.timingOffset || 0);
                const notePulse = Math.max(0, this.toPulses(noteTimeS));
                res.ccEvents.forEach((/** @type {any} */ cc) =>
                    track.cc(notePulse, channel, cc.controller, cc.value),
                );
            }
        });
        updateCoordinationContext(coordination, moduleName, notes);
    }

    processChunk() {
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
                data: /** @type {Error} */ (e).message,
                stack: /** @type {Error} */ (e).stack,
            });
            this.cleanup();
        }
    }

    /**
     * @param {number} globalStep
     */
    processStep(globalStep) {
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
        );

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
            this.metaTrack.marker(
                pulse,
                /** @type {string} */ (/** @type {any} */ (chord).absName || 'Chord'),
            );

            if (this.includedTracks.includes('chords')) {
                this.chordTrack.text(
                    pulse,
                    /** @type {string} */ (/** @type {any} */ (chord).absName || 'Chord'),
                );
            }
        }

        const soloistNotes = notes.filter((n) => n.module === 'soloist');
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

        const bassNotes = notes.filter((n) => n.module === 'bass');
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

        const chordsNotes = notes.filter((n) => n.module === 'chords');
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

        const harmonyNotes = notes.filter((n) => n.module === 'harmony');
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
            const drumTimeS = stepTimeS + calculatePocketOffset(playback, groove);

            const nextStepTimeS = this.stepTimes[globalStep + 1] || stepTimeS + this.sixteenthSec;
            const tightDurationS = (nextStepTimeS - stepTimeS) * 0.75;

            if (groove.fillActive) {
                const fillStep = globalStep - groove.fillStartStep;
                if (fillStep === groove.fillLength) {
                    groove.fillActive = false; // @worker-mutation
                    groove.pendingCrash = false; // @worker-mutation
                }
            }

            drumHits.forEach((hit) => {
                const soundName = /** @type {any} */ (hit.soundName);
                const instName = /** @type {any} */ (hit.inst).name;
                const name = soundName || instName;
                let midi = DRUM_MAP[soundName] || DRUM_MAP[instName];

                // Fuzzy matching for unmapped dynamic names
                if (!midi) {
                    if (name.includes('Tom')) {
                        if (name.includes('High')) {
                            midi = DRUM_MAP['High Tom'];
                        } else if (name.includes('Low')) {
                            midi = DRUM_MAP['Low Tom'];
                        } else {
                            midi = DRUM_MAP['Mid Tom'];
                        }
                    } else if (name.includes('Agogo')) {
                        if (name.includes('Low')) {
                            midi = DRUM_MAP['Low Agogo'];
                        } else {
                            midi = DRUM_MAP['High Agogo'];
                        }
                    } else if (name.includes('Bongo')) {
                        if (name.includes('Low')) {
                            midi = DRUM_MAP['Low Bongo'];
                        } else {
                            midi = DRUM_MAP['High Bongo'];
                        }
                    } else if (name.includes('Conga')) {
                        if (name.includes('Low')) {
                            midi = DRUM_MAP['Low Conga'];
                        } else if (name.includes('Open')) {
                            midi = DRUM_MAP['Open Conga'];
                        } else if (name.includes('Mute')) {
                            midi = DRUM_MAP['Mute Conga'];
                        } else if (name.includes('Slap')) {
                            midi = DRUM_MAP['Slap Conga'];
                        } else {
                            midi = DRUM_MAP['High Conga'];
                        }
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

    finish() {
        const { arranger, playback, groove, soloist } = this.state;
        const resolutionStep = this.totalStepsWithoutEnding;
        const resTimeS = this.stepTimes[resolutionStep];
        const resPulse = this.toPulses(resTimeS);

        this.metaTrack.marker(resPulse, '=== Resolution ===');

        const resolutionNotes = generateResolutionNotes(
            this.state,
            resolutionStep,
            arranger,
            /** @type {any} */ ({
                bass: this.includedTracks.includes('bass'),
                chords: this.includedTracks.includes('chords'),
                soloist: this.includedTracks.includes('soloist'),
                harmony: this.includedTracks.includes('harmonies'),
                groove: this.includedTracks.includes('drums'),
            }),
            playback.bpm,
            groove,
            soloist,
        );

        resolutionNotes.forEach((/** @type {any} */ n) => {
            let track;
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
                n.ccEvents.forEach((/** @type {any} */ cc) => {
                    track.cc(
                        this.toPulses(resTimeS + (cc.timingOffset || 0)),
                        channel,
                        cc.controller,
                        cc.value,
                    );
                });
            }

            if (n.midi && n.midi > 0) {
                if (n.module === 'soloist' && n.bendStartInterval) {
                    track.pitchBend(
                        notePulse,
                        channel,
                        Math.round(-(n.bendStartInterval / 2) * 8192),
                    );
                }

                track.noteOn(notePulse, channel, n.midi, n.midiVelocity || 90);

                if (n.module === 'soloist' && n.bendStartInterval) {
                    track.pitchBend(this.toPulses(resTimeS + this.sixteenthSec), channel, 0);
                }

                const durationS = (n.durationSteps || 1) * this.sixteenthSec;
                track.noteOff(this.toPulses(resTimeS + offsetS + durationS), channel, n.midi);
            } else if (n.module === 'groove' && n.name) {
                const midi = DRUM_MAP[/** @type {any} */ (n).name];
                if (midi) {
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
        const finalTrackList = [this.metaTrack];
        const trackRefs = {
            chords: this.chordTrack,
            bass: this.bassTrack,
            soloist: this.soloistTrack,
            harmonies: this.harmonyTrack,
            drums: this.drumTrack,
        };
        ['chords', 'bass', 'soloist', 'harmonies', 'drums'].forEach((key) => {
            if (this.includedTracks.includes(key)) {
                /** @type {any} */ (trackRefs)[key].endOfTrack(finalPulse);
                finalTrackList.push(/** @type {any} */ (trackRefs)[key]);
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
        const trackChunks = new Array(tLen);
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

    cleanup() {
        const { chords, bass, soloist, harmony, groove, playback } = this.state;
        if (this.prevStates) {
            chords.enabled = this.prevStates.chords; // @worker-mutation
            bass.enabled = this.prevStates.bass; // @worker-mutation
            soloist.enabled = this.prevStates.soloist; // @worker-mutation
            harmony.enabled = this.prevStates.harmony; // @worker-mutation
            groove.enabled = this.prevStates.groove; // @worker-mutation
            playback.bandIntensity = this.prevStates.intensity; // @worker-mutation
            soloist.mode = this.prevStates.mode; // @worker-mutation
            soloist.sessionSteps = this.prevStates.sessionSteps; // @worker-mutation
        }

        _isExporting = false;
        if (_onExportEnd) {
            _onExportEnd();
        }
    }
}

/**
 * Handles the offline MIDI export process.
 * @param {import('../types.js').EnsembleState} state
 * @param {Object} options
 */
/**
 * @param {import('../types.js').EnsembleState} state
 * @param {any} options
 */
export function handleExport(state, options) {
    try {
        const processor = new ExportProcessor(state, options);
        processor.start();
    } catch (e) {
        postMessage({
            type: WORKER_RESP.ERROR,
            data: /** @type {Error} */ (e).message,
            stack: /** @type {Error} */ (e).stack,
        });
    }
}
