import { compingState, getAccompanimentNotes } from '../accompaniment.js';
import { getBassNote, isBassActive } from '../bass.js';
import { TIME_SIGNATURES } from '../config.js';
import { generateProceduralFill } from '../fills.js';
import { analyzeForm } from '../form-analysis.js';
import { getHarmonyNotes } from '../harmonies.js';
import { DRUM_PRESETS } from '../presets.js';
import { generateResolutionNotes } from '../resolution.js';
import { getSoloistNote } from '../soloist.js';
import { getState } from '../state.js';
import { getFrequency, getMidi, getStepInfo } from '../utils.js';
import { WORKER_RESP } from '../worker-types.js';
import {
    createCoordinationContext,
    enforceRegisterSlotting,
    updateCoordinationContext,
} from './coordination-engine.js';
import { applyGrooveOverrides, calculatePocketOffset } from './groove-engine.js';
import { getChordAtStep } from './worker-utils.js';

export const MIDI_EXTENSION_PATTERN = /\.midi?$/i;
export const PPQ = 480;

// Internal variable tracking export state for message queueing in logic-worker
let _isExporting = false;
export const isExporting = () => _isExporting;
let _onExportEnd = null;
export const setOnExportEnd = (fn) => (_onExportEnd = fn);

function writeVarInt(value) {
    const buffer = [];
    if (value === 0) {
        return [0];
    }
    while (value > 0) {
        let byte = value & 0x7f;
        value >>= 7;
        if (buffer.length > 0) {
            byte |= 0x80;
        }
        buffer.push(byte);
    }
    return buffer.reverse();
}

function writeString(str) {
    return str.split('').map((c) => c.charCodeAt(0));
}

function writeInt32(val) {
    return [(val >> 24) & 0xff, (val >> 16) & 0xff, (val >> 8) & 0xff, val & 0xff];
}

function writeInt16(val) {
    return [(val >> 8) & 0xff, val & 0xff];
}

export class MidiTrack {
    constructor() {
        this.events = [];
    }

    addEvent(time, data) {
        this.events.push({ time: Math.round(time), data });
    }

    noteOn(time, ch, note, vel) {
        this.addEvent(time, [0x90 | ch, note, vel]);
    }
    noteOff(time, ch, note) {
        this.addEvent(time, [0x80 | ch, note, 0]);
    }
    programChange(time, ch, program) {
        this.addEvent(time, [0xc0 | ch, program]);
    }
    cc(time, ch, cc, val) {
        this.addEvent(time, [0xb0 | ch, cc, val]);
    }
    pitchBend(time, ch, val) {
        const normalized = Math.max(0, Math.min(16383, val + 8192));
        this.addEvent(time, [0xe0 | ch, normalized & 0x7f, (normalized >> 7) & 0x7f]);
    }
    setName(time, name) {
        const bytes = writeString(name);
        this.addEvent(time, [0xff, 0x03, ...writeVarInt(bytes.length), ...bytes]);
    }
    marker(time, text) {
        const bytes = writeString(text);
        this.addEvent(time, [0xff, 0x06, ...writeVarInt(bytes.length), ...bytes]);
    }
    text(time, text) {
        const bytes = writeString(text);
        this.addEvent(time, [0xff, 0x01, ...writeVarInt(bytes.length), ...bytes]);
    }
    lyric(time, text) {
        const bytes = writeString(text);
        this.addEvent(time, [0xff, 0x05, ...writeVarInt(bytes.length), ...bytes]);
    }
    setTempo(time, bpm) {
        const mspb = Math.round(60000000 / bpm);
        this.addEvent(time, [
            0xff,
            0x51,
            0x03,
            (mspb >> 16) & 0xff,
            (mspb >> 8) & 0xff,
            mspb & 0xff,
        ]);
    }
    setTimeSig(time, n, d) {
        let dp = 2;
        if (d === 8) {
            dp = 3;
        }
        this.addEvent(time, [0xff, 0x58, 0x04, n, dp, 24, 8]);
    }
    setKeySig(time, root, isMinor) {
        const keyMap = {
            C: 0,
            G: 1,
            D: 2,
            A: 3,
            E: 4,
            B: 5,
            Gb: -6,
            Db: -5,
            Ab: -4,
            Eb: -3,
            Bb: -2,
            F: -1,
        };
        const rootLookup = root === 'F#' ? 'Gb' : root === 'C#' ? 'Db' : root;
        let sf = keyMap[rootLookup] || 0;
        if (isMinor) {
            const KEY_ORDER = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
            const relMajor = KEY_ORDER[(KEY_ORDER.indexOf(rootLookup) + 3) % 12];
            sf = keyMap[relMajor] || 0;
        }
        this.addEvent(time, [0xff, 0x59, 0x02, sf < 0 ? 256 + sf : sf, isMinor ? 0x01 : 0x00]);
    }
    endOfTrack(time) {
        this.addEvent(time, [0xff, 0x2f, 0x00]);
    }

    compile() {
        this.events.sort((a, b) => {
            if (a.time !== b.time) {
                return a.time - b.time;
            }
            const typeA = a.data[0] & 0xf0;
            const typeB = b.data[0] & 0xf0;
            if (typeA === 0x80 && typeB === 0x90) {
                return -1;
            }
            if (typeA === 0x90 && typeB === 0x80) {
                return 1;
            }
            return 0;
        });
        const binary = [];
        let lastTime = 0;
        for (const ev of this.events) {
            const dt = Math.max(0, ev.time - lastTime);
            binary.push(...writeVarInt(dt), ...ev.data);
            lastTime = ev.time;
        }
        const len = writeInt32(binary.length);
        return new Uint8Array([...writeString('MTrk'), ...len, ...binary]);
    }
}

export class ExportProcessor {
    constructor(options) {
        const { arranger, groove, playback, chords, bass, soloist, harmony } = getState();
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
        const loopSeconds = (this.totalStepsOneLoop / this.ts.stepsPerBeat) * (60 / playback.bpm);
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
        for (let i = 0; i < this.stepTimes.length; i++) {
            this.stepTimes[i] = accumulatedSeconds;
            let duration = this.sixteenthSec;
            if (groove.swing > 0 && this.ts.stepsPerBeat === 4) {
                const shift = (this.sixteenthSec / 3) * (groove.swing / 100);
                if (groove.swingSub === '16th') {
                    duration += i % 2 === 0 ? shift : -shift;
                } else {
                    duration += i % 4 < 2 ? shift : -shift;
                }
            }
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
        this.metaTrack.setTempo(0, playback.bpm);
        this.metaTrack.setKeySig(0, arranger.key, arranger.isMinor);
        const [tsNum, tsDenom] = (arranger.timeSignature || '4/4').split('/').map(Number);
        this.metaTrack.setTimeSig(0, tsNum, tsDenom);

        this.chordTrack.setName(0, 'Chords');
        this.chordTrack.programChange(0, 0, 4);
        this.bassTrack.setName(0, 'Bass');
        this.bassTrack.programChange(0, 1, 34);
        this.soloistTrack.setName(0, 'Soloist');
        this.soloistTrack.programChange(0, 2, 80);
        this.harmonyTrack.setName(0, 'Harmonies');
        this.harmonyTrack.programChange(0, 3, 61);
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
        };

        this.globalStep = 0;
    }

    start() {
        const { arranger } = getState();
        if (arranger.progression.length === 0) {
            postMessage({ type: WORKER_RESP.ERROR, data: 'No progression to export' });
            this.cleanup();
            return;
        }

        _isExporting = true;
        this.processChunk();
    }

    toPulses(t) {
        const { playback } = getState();
        return Math.round(t * (playback.bpm / 60.0) * PPQ);
    }

    checkWorkerTransition(step) {
        const { groove, playback, arranger, harmony } = getState();
        if (!groove.enabled) {
            return;
        }
        const modStep = step % this.totalStepsOneLoop;

        if (modStep === 0 && step > 0) {
            this.exportConductor.loopCount++;
            this.exportConductor.formIteration++;
            playback.currentLoopCount = this.exportConductor.loopCount; // @worker-mutation
        }

        const entry = arranger.stepMap.find((e) => modStep >= e.start && modStep < e.end);
        if (!entry) {
            return;
        }

        const sectionEnd = entry.end;
        const fillStart = sectionEnd - this.stepsPerMeasure;

        if (modStep === fillStart) {
            const currentIndex = arranger.stepMap.indexOf(entry);
            let nextEntry = arranger.stepMap[currentIndex + 1];
            let isLoopEnd = false;
            if (!nextEntry) {
                nextEntry = arranger.stepMap[0];
                isLoopEnd = true;
            }

            if (nextEntry.chord.sectionId !== entry.chord.sectionId || isLoopEnd) {
                let shouldFill = groove.creativity;
                if (shouldFill && isLoopEnd && this.totalStepsOneLoop <= 64) {
                    const freq =
                        playback.bandIntensity > 0.75 ? 1 : playback.bandIntensity > 0.4 ? 2 : 4;
                    shouldFill = this.exportConductor.loopCount % freq === 0;
                }
                if (shouldFill) {
                    const fill = generateProceduralFill(
                        groove.genreFeel,
                        playback.bandIntensity,
                        this.stepsPerMeasure,
                    );
                    groove.fillSteps = fill; // @worker-mutation
                    groove.fillActive = true; // @worker-mutation
                    groove.fillStartStep = step; // @worker-mutation
                    groove.fillLength = this.stepsPerMeasure; // @worker-mutation
                    groove.pendingCrash = true; // @worker-mutation
                }
            }
        }

        if (playback.autoIntensity && modStep === 0 && this.exportConductor.formIteration > 0) {
            const grandCycle = this.exportConductor.formIteration % 8;
            let target = 0.5;
            if (grandCycle < 3) {
                target = 0.6;
            } else if (grandCycle < 5) {
                target = 0.9;
            } else {
                target = 0.4;
            }
            playback.bandIntensity =
                playback.bandIntensity + (target - playback.bandIntensity) * 0.5; // @worker-mutation
        }

        harmony.complexity = Math.max(0, (playback.bandIntensity - 0.2) * 1.25); // @worker-mutation

        const isLastLoop = this.exportConductor.loopCount >= this.loopCount - 1;
        if (isLastLoop && this.loopCount > 1) {
            harmony.complexity = Math.max(harmony.complexity, 0.85); // @worker-mutation
        }
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
            postMessage({ type: WORKER_RESP.ERROR, data: e.message, stack: e.stack });
            this.cleanup();
        }
    }

    processStep(globalStep) {
        this.checkWorkerTransition(globalStep);
        const { arranger, groove, playback, soloist, bass, harmony } = getState();

        const stepTimeS = this.stepTimes[globalStep];
        const measureStep = globalStep % this.stepsPerMeasure;
        const stepInfo = getStepInfo(globalStep, this.ts, arranger.measureMap, TIME_SIGNATURES);
        const chordData = getChordAtStep(globalStep, this.exportCursor);

        // --- Calculate Turnaround State (Match main engine) ---
        const stepsPerBar = this.stepsPerMeasure;
        const sectionEntry = arranger.sectionMap?.find(
            (e) => globalStep >= e.start && globalStep < e.end,
        );
        let measuresInSection = 4;
        let startStep = 0;
        if (sectionEntry) {
            measuresInSection = Math.max(1, (sectionEntry.end - sectionEntry.start) / stepsPerBar);
            startStep = sectionEntry.start;
        }
        const barInSection = Math.floor((globalStep - startStep) / stepsPerBar);
        const isTurnaround =
            groove.creativity &&
            measuresInSection > 1 &&
            barInSection % measuresInSection === measuresInSection - 1;

        // 1. Context Assembly (Anchor: Groove)
        const coordination = createCoordinationContext(globalStep, stepInfo);
        coordination.pocketOffset = calculatePocketOffset(playback, groove);

        if (chordData) {
            const { sectionEnd, sectionStart } = chordData;
            const remainingSteps = sectionEnd - globalStep;
            const stepsPerMeasure = this.ts.beats * this.ts.stepsPerBeat;

            // --- Structural Awareness: Turnaround Detection ---
            const sectionSteps = sectionEnd - sectionStart;
            const isLongEnough = sectionSteps >= stepsPerMeasure * 8;
            coordination.isTurnaround = isLongEnough && remainingSteps <= stepsPerMeasure * 2;

            if (remainingSteps <= stepsPerMeasure) {
                const nextSectionChordData = getChordAtStep(sectionEnd, this.exportLookaheadCursor);
                if (nextSectionChordData?.chord) {
                    coordination.upcomingSectionFirstChord = nextSectionChordData.chord;
                }
            }
        }

        // Pre-calculate Drum Hits for Coordination
        if (this.includedTracks.includes('drums')) {
            const drumStep = globalStep % (groove.measures * this.stepsPerMeasure);
            const sectionId = chordData?.chord?.sectionId || null;
            const seedIdx =
                groove.sectionSeedMap && sectionId ? groove.sectionSeedMap[sectionId] || 0 : 0;
            const preset = DRUM_PRESETS[groove.lastDrumPreset];

            const checkHit = (instName) => {
                const inst = groove.instruments.find((i) => i.name === instName);
                if (!inst || inst.muted) {
                    return false;
                }
                let stepVal = inst.steps[drumStep];
                if (groove.creativity && preset?.variations?.[seedIdx]) {
                    const varInst = preset.variations[seedIdx][instName];
                    if (varInst) {
                        stepVal = varInst[drumStep];
                    }
                }

                const result = applyGrooveOverrides({
                    step: globalStep,
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
                    isTurnaround,
                    stepsPerBar: this.stepsPerMeasure,
                    loopStep: drumStep,
                });
                return result.shouldPlay;
            };

            coordination.kickHit = checkHit('Kick');
            coordination.snareHit = checkHit('Snare');
        }

        if (chordData) {
            const { chord, stepInChord } = chordData;
            const nextChordData = getChordAtStep(globalStep + 4, this.exportLookaheadCursor);

            // Emit Metadata on Chord/Section Change
            if (stepInChord === 0) {
                const pulse = this.toPulses(stepTimeS);
                const modStep = globalStep % this.totalStepsOneLoop;
                const section = arranger.sectionMap?.find((s) => s.start === modStep);

                if (section) {
                    this.metaTrack.marker(pulse, `--- ${section.label} ---`);
                }
                this.metaTrack.marker(pulse, chord.absName || 'Chord');

                if (this.includedTracks.includes('chords')) {
                    this.chordTrack.text(pulse, chord.absName || 'Chord');
                }
            }

            // 2. Soloist Generation (High Priority)
            let soloResult = null;
            if (this.includedTracks.includes('soloist')) {
                const { sectionStart, sectionEnd } = chordData;
                soloResult = getSoloistNote(
                    chord,
                    nextChordData?.chord,
                    globalStep,
                    soloist.lastFreq,
                    soloist.octave,
                    soloist.style,
                    stepInChord,
                    false,
                    { sectionStart, sectionEnd, stepCoordination: coordination },
                    stepInfo,
                );
                if (soloResult) {
                    const results = Array.isArray(soloResult) ? soloResult : [soloResult];
                    const polyphonyComp = 1 / Math.sqrt(Math.max(1, results.length));

                    results.forEach((res) => {
                        if (res.midi) {
                            const noteTimeS = stepTimeS + (res.timingOffset || 0);
                            const notePulse = Math.max(0, this.toPulses(noteTimeS));

                            const midiVel = Math.max(
                                1,
                                Math.min(127, Math.round(res.velocity * polyphonyComp * 127)),
                            );

                            // Enforce Contract: Register Slotting (with smooth octave shift)
                            const lastSoloMidi = soloist.lastFreq
                                ? getMidi(soloist.lastFreq)
                                : null;
                            res.midi = enforceRegisterSlotting(
                                'soloist',
                                res.midi,
                                coordination,
                                lastSoloMidi,
                            );

                            if (res.bendStartInterval) {
                                this.soloistTrack.pitchBend(
                                    notePulse,
                                    2,
                                    Math.round(-(res.bendStartInterval / 2) * 8192),
                                );
                                this.soloistTrack.noteOn(notePulse, 2, res.midi, midiVel);
                                this.soloistTrack.pitchBend(
                                    this.toPulses(stepTimeS + this.sixteenthSec),
                                    2,
                                    0,
                                );
                            } else {
                                this.soloistTrack.noteOn(notePulse, 2, res.midi, midiVel);
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
                            endTimeS += 0.015;

                            this.soloistTrack.noteOff(this.toPulses(endTimeS), 2, res.midi);
                            if (!res.isDoubleStop) {
                                soloist.lastFreq = 440 * 2 ** ((res.midi - 69) / 12); // @worker-mutation
                            }
                        }
                    });
                    updateCoordinationContext(coordination, 'soloist', soloResult);
                }
            }

            // 3. Bass Generation (Yields to Soloist, Locks to Kick)
            if (
                this.includedTracks.includes('bass') &&
                isBassActive(bass.style, globalStep, stepInChord, stepInfo, coordination)
            ) {
                const { sectionStart, sectionEnd } = chordData;
                const res = getBassNote(
                    chord,
                    nextChordData?.chord,
                    stepInChord / this.ts.stepsPerBeat,
                    bass.lastFreq,
                    bass.octave,
                    bass.style,
                    chordData.chordIndex,
                    globalStep,
                    stepInChord,
                    { sectionStart, sectionEnd, stepCoordination: coordination },
                    stepInfo,
                );
                if (res?.midi) {
                    const noteTimeS = stepTimeS + (res.timingOffset || 0);
                    const notePulse = Math.max(0, this.toPulses(noteTimeS));

                    let finalVel = res.velocity;
                    if (res.muted) {
                        finalVel *= 0.25;
                    }
                    const midiVel = Math.max(1, Math.min(127, Math.round(finalVel * 127)));

                    // Enforce Contract: Register Slotting (with smooth octave shift)
                    const lastBassMidi = bass.lastFreq ? getMidi(bass.lastFreq) : null;
                    res.midi = enforceRegisterSlotting(
                        'bass',
                        res.midi,
                        coordination,
                        lastBassMidi,
                    );

                    this.bassTrack.noteOn(notePulse, 1, res.midi, midiVel);

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
                    endTimeS += 0.02;

                    this.bassTrack.noteOff(this.toPulses(endTimeS), 1, res.midi);
                    bass.lastFreq = 440 * 2 ** ((res.midi - 69) / 12); // @worker-mutation
                    updateCoordinationContext(coordination, 'bass', res);
                }
            }

            // 4. Chords Generation (Yields Density to Soloist)
            if (this.includedTracks.includes('chords')) {
                const notes = getAccompanimentNotes(
                    chord,
                    globalStep,
                    stepInChord,
                    measureStep,
                    stepInfo,
                    coordination,
                );
                const numVoices = notes.filter((n) => n.midi > 0).length;
                const polyphonyComp = 1 / Math.sqrt(Math.max(1, numVoices));

                notes.forEach((n) => {
                    const noteTimeS = stepTimeS + (n.timingOffset || 0);
                    const notePulse = Math.max(0, this.toPulses(noteTimeS));

                    if (n.midi > 0) {
                        // Enforce Contract: Register Slotting
                        n.midi = enforceRegisterSlotting('chords', n.midi, coordination);

                        n.ccEvents.forEach((cc) =>
                            this.chordTrack.cc(notePulse, 0, cc.controller, cc.value),
                        );

                        let finalVel = n.velocity * polyphonyComp;
                        if (n.muted) {
                            finalVel *= 0.3;
                        }
                        const midiVel = Math.max(1, Math.min(127, Math.round(finalVel * 127)));

                        this.chordTrack.noteOn(notePulse, 0, n.midi, midiVel);

                        let endTimeS;
                        if (n.durationSteps < 1) {
                            endTimeS = noteTimeS + n.durationSteps * this.sixteenthSec;
                        } else {
                            const targetStepIdx = globalStep + Math.round(n.durationSteps);
                            endTimeS =
                                this.stepTimes[targetStepIdx] ||
                                noteTimeS + n.durationSteps * this.sixteenthSec;
                        }
                        if (endTimeS - noteTimeS < 0.05) {
                            endTimeS = noteTimeS + 0.05;
                        }

                        this.chordTrack.noteOff(this.toPulses(endTimeS), 0, n.midi);
                    } else if (n.ccEvents.length > 0) {
                        n.ccEvents.forEach((cc) =>
                            this.chordTrack.cc(notePulse, 0, cc.controller, cc.value),
                        );
                    }
                });
                updateCoordinationContext(coordination, 'chords', notes);
            }

            // 4. Harmonies
            if (this.includedTracks.includes('harmonies')) {
                const harmonyNotes = getHarmonyNotes(
                    chord,
                    nextChordData?.chord,
                    globalStep,
                    harmony.octave,
                    harmony.style,
                    stepInChord,
                    soloResult,
                    coordination,
                    stepInfo,
                );
                const polyphonyComp = 1 / Math.sqrt(Math.max(1, harmonyNotes.length));

                harmonyNotes.forEach((n) => {
                    const noteTimeS = stepTimeS + (n.timingOffset || 0);
                    const notePulse = Math.max(0, this.toPulses(noteTimeS));
                    const midiVel = Math.max(
                        1,
                        Math.min(127, Math.round(n.velocity * polyphonyComp * 127)),
                    );

                    this.harmonyTrack.noteOn(notePulse, 3, n.midi, midiVel);

                    let endTimeS;
                    if (n.durationSteps < 1) {
                        endTimeS = noteTimeS + n.durationSteps * this.sixteenthSec;
                    } else {
                        const targetStepIdx = globalStep + Math.round(n.durationSteps);
                        endTimeS =
                            this.stepTimes[targetStepIdx] ||
                            noteTimeS + n.durationSteps * this.sixteenthSec;
                    }
                    this.harmonyTrack.noteOff(this.toPulses(endTimeS), 3, n.midi);
                });
            }

            if (this.includedTracks.includes('drums')) {
                const drumTimeS = stepTimeS + calculatePocketOffset(playback, groove);
                const drumPulse = Math.max(0, this.toPulses(drumTimeS));

                const nextStepTimeS =
                    this.stepTimes[globalStep + 1] || stepTimeS + this.sixteenthSec;
                const tightDurationS = (nextStepTimeS - stepTimeS) * 0.75;
                const drumMap = {
                    Kick: 36,
                    Snare: 38,
                    HiHat: 42,
                    Open: 46,
                    Crash: 49,
                    Clave: 75,
                    Conga: 63,
                    Bongo: 60,
                    Perc: 67,
                    Shaker: 82,
                    Guiro: 74,
                    'High Tom': 50,
                    'Mid Tom': 47,
                    'Low Tom': 43,
                };

                let fillPlayed = false;

                if (groove.fillActive) {
                    const fillStep = globalStep - groove.fillStartStep;

                    if (fillStep >= 0 && fillStep < groove.fillLength) {
                        if (playback.bandIntensity >= 0.5 || fillStep >= groove.fillLength / 2) {
                            const fillNotes = groove.fillSteps[fillStep];
                            if (fillNotes && fillNotes.length > 0) {
                                fillNotes.forEach((n) => {
                                    const midi = drumMap[n.name];
                                    if (midi) {
                                        const durS =
                                            n.name === 'Crash'
                                                ? this.secondsPerBeat
                                                : tightDurationS;
                                        const midiVel = Math.max(
                                            1,
                                            Math.min(127, Math.round(n.vel * 127)),
                                        );
                                        this.drumTrack.noteOn(drumPulse, 9, midi, midiVel);
                                        this.drumTrack.noteOff(
                                            this.toPulses(drumTimeS + durS),
                                            9,
                                            midi,
                                        );
                                    }
                                });
                                fillPlayed = true;
                            }
                        }
                    } else if (fillStep === groove.fillLength) {
                        groove.fillActive = false; // @worker-mutation
                        if (groove.pendingCrash) {
                            this.drumTrack.noteOn(drumPulse, 9, drumMap.Crash, 110);
                            this.drumTrack.noteOff(
                                this.toPulses(drumTimeS + this.secondsPerBeat),
                                9,
                                drumMap.Crash,
                            );
                            groove.pendingCrash = false; // @worker-mutation
                        }
                    }
                }

                if (!fillPlayed) {
                    const drumStep = globalStep % (groove.measures * this.stepsPerMeasure);
                    const sectionId = chordData?.chord?.sectionId || null;
                    const seedIdx =
                        groove.sectionSeedMap && sectionId
                            ? groove.sectionSeedMap[sectionId] || 0
                            : 0;
                    const preset = DRUM_PRESETS[groove.lastDrumPreset];

                    groove.instruments.forEach((inst) => {
                        let stepVal = inst.steps[drumStep];
                        if (groove.creativity && preset?.variations?.[seedIdx]) {
                            const varInst = preset.variations[seedIdx][inst.name];
                            if (varInst) {
                                stepVal = varInst[drumStep];
                            }
                        }

                        const { shouldPlay, velocity, soundName, instTimeOffset } =
                            applyGrooveOverrides({
                                step: globalStep,
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
                                isTurnaround,
                                stepsPerBar: this.stepsPerMeasure,
                                loopStep: drumStep,
                            });

                        if (shouldPlay && !inst.muted) {
                            const midi = drumMap[soundName] || drumMap[inst.name];
                            if (midi) {
                                const durS =
                                    soundName === 'Open' || soundName === 'Crash'
                                        ? this.secondsPerBeat
                                        : tightDurationS;
                                const finalTimeS = drumTimeS + instTimeOffset;
                                const midiVel = Math.max(
                                    1,
                                    Math.min(127, Math.round(velocity * 127)),
                                );
                                this.drumTrack.noteOn(this.toPulses(finalTimeS), 9, midi, midiVel);
                                this.drumTrack.noteOff(this.toPulses(finalTimeS + durS), 9, midi);
                            }
                        }
                    });
                }
            }
        }
    }

    finish() {
        const { arranger, playback, groove, soloist } = getState();
        const resolutionStep = this.totalStepsWithoutEnding;
        const resTimeS = this.stepTimes[resolutionStep];
        const resPulse = this.toPulses(resTimeS);

        this.metaTrack.marker(resPulse, '=== Resolution ===');

        const resolutionNotes = generateResolutionNotes(
            resolutionStep,
            arranger,
            {
                bass: this.includedTracks.includes('bass'),
                chords: this.includedTracks.includes('chords'),
                soloist: this.includedTracks.includes('soloist'),
                harmony: this.includedTracks.includes('harmonies'),
                groove: this.includedTracks.includes('drums'),
            },
            playback.bpm,
            groove,
            soloist,
        );

        resolutionNotes.forEach((n) => {
            let track;
            let channel = 0;
            if (n.module === 'bass') {
                track = this.bassTrack;
                channel = 1;
            } else if (n.module === 'chords') {
                track = this.chordTrack;
                channel = 0;
            } else if (n.module === 'soloist') {
                track = this.soloistTrack;
                channel = 2;
            } else if (n.module === 'harmony') {
                track = this.harmonyTrack;
                channel = 3;
            } else if (n.module === 'groove') {
                track = this.drumTrack;
                channel = 9;
            }

            if (!track) {
                return;
            }

            const offsetS = n.timingOffset || 0;
            const notePulse = this.toPulses(resTimeS + offsetS);

            if (n.ccEvents) {
                n.ccEvents.forEach((cc) => {
                    track.cc(
                        this.toPulses(resTimeS + (cc.timingOffset || 0)),
                        channel,
                        cc.controller,
                        cc.value,
                    );
                });
            }

            if (n.midi > 0) {
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
                const drumMap = {
                    Kick: 36,
                    Snare: 38,
                    HiHat: 42,
                    Open: 46,
                    Crash: 49,
                    Clave: 75,
                    Conga: 63,
                    Bongo: 60,
                    Perc: 67,
                    Shaker: 82,
                    Guiro: 74,
                    'High Tom': 50,
                    'Mid Tom': 47,
                    'Low Tom': 43,
                };
                const midi = drumMap[n.name];
                if (midi) {
                    track.noteOn(notePulse, channel, midi, n.midiVelocity || 110);
                    const durS = n.name === 'Crash' ? 3.0 : 0.1;
                    track.noteOff(this.toPulses(resTimeS + offsetS + durS), channel, midi);
                }
            }
        });

        // Cleanup: Release sustain for chords if they were active
        if (this.includedTracks.includes('chords')) {
            this.chordTrack.cc(this.toPulses(resTimeS + 16.1 * this.sixteenthSec), 0, 64, 0);
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
        const trackChunks = finalTrackList.map((t) => t.compile());
        const totalSize = header.length + trackChunks.reduce((acc, c) => acc + c.length, 0);
        const result = new Uint8Array(totalSize);
        result.set(header, 0);
        let offset = header.length;
        trackChunks.forEach((c) => {
            result.set(c, offset);
            offset += c.length;
        });

        const finalFilename = `${(this.filename || 'ensemble-export').replace(MIDI_EXTENSION_PATTERN, '')}.mid`;
        postMessage({ type: WORKER_RESP.EXPORT_COMPLETE, blob: result, filename: finalFilename });
    }

    cleanup() {
        const { chords, bass, soloist, harmony, groove, playback } = getState();
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

export function handleExport(options) {
    try {
        const processor = new ExportProcessor(options);
        processor.start();
    } catch (e) {
        postMessage({ type: WORKER_RESP.ERROR, data: e.message, stack: e.stack });
    }
}
