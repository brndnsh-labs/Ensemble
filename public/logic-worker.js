import { compingState, getAccompanimentNotes } from './accompaniment.js';
import { getBassNote, isBassActive } from './bass.js';
import { TIME_SIGNATURES } from './config.js';
import { generateProceduralFill } from './fills.js';
import { analyzeForm } from './form-analysis.js';
import { getHarmonyNotes } from './harmonies.js';
import { DRUM_PRESETS } from './presets.js';
import { generateResolutionNotes } from './resolution.js';
import { getSoloistNote } from './soloist.js';
import { getState } from './state.js';
import { getFrequency, getMidi, getStepInfo } from './utils.js';
import { WORKER_MSG, WORKER_RESP } from './worker-types.js';

const { arranger, chords, bass, soloist, groove, harmony, playback } = getState();

// --- WORKER STATE ---
let timerID = null;
const interval = 25;
let bbBufferHead = 0;
let sbBufferHead = 0;
let cbBufferHead = 0;
let hbBufferHead = 0;

// Shared state for multi-way coordination within a single step
const stepCoordination = {
    step: -1,
    bassHit: false,
    bassMidi: 0,
    soloistActive: false,
    soloistMidi: 0,
    accompanimentHit: false,
    accompanimentMidis: [],
};

let lastChordIndex = 0;
let lastSectionIndex = 0;
const mainCursor = { index: 0, sectionIndex: 0 };
const lookaheadCursor = { index: 0, sectionIndex: 0 };
const LOOKAHEAD = 64;

// Export State
let isExporting = false;
const messageQueue = [];

// --- EXPORT HELPERS ---

const PPQ = 480;

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

class ExportProcessor {
    constructor(options) {
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

        chords.enabled = true;
        bass.enabled = true;
        soloist.enabled = true;
        harmony.enabled = true;
        groove.enabled = true; // @worker-mutation
        soloist.sessionSteps = 1000; // @worker-mutation
        compingState.lockedUntil = 0;
        compingState.lastChordIndex = -1;
        soloist.busySteps = 0;
        soloist.isResting = false;
        soloist.currentPhraseSteps = 0; // @worker-mutation

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
        if (arranger.progression.length === 0) {
            postMessage({ type: WORKER_RESP.ERROR, data: 'No progression to export' });
            this.cleanup();
            return;
        }

        isExporting = true;
        this.processChunk();
    }

    toPulses(t) {
        return Math.round(t * (playback.bpm / 60.0) * PPQ);
    }

    checkWorkerTransition(step) {
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
                let shouldFill = true;
                if (isLoopEnd && this.totalStepsOneLoop <= 64) {
                    const freq =
                        playback.bandIntensity > 0.75 ? 1 : playback.bandIntensity > 0.4 ? 2 : 4;
                    shouldFill = this.exportConductor.loopCount % freq === 0;
                }
                if (shouldFill) {
                    groove.fillSteps = generateProceduralFill(
                        groove.genreFeel,
                        playback.bandIntensity,
                        this.stepsPerMeasure,
                    ); // @worker-mutation
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

        const stepTimeS = this.stepTimes[globalStep];
        const measureStep = globalStep % this.stepsPerMeasure;
        const stepInfo = getStepInfo(globalStep, this.ts);
        const chordData = getChordAtStep(globalStep, this.exportCursor);

        // Coordination state for export
        const coordination = {
            step: globalStep,
            bassHit: false,
            bassMidi: 0,
            soloistActive: false,
            soloistMidi: 0,
            accompanimentHit: false,
            accompanimentMidis: [],
            kickHit: false,
            snareHit: false,
        };

        // Pre-calculate Drum Hits for Coordination
        if (this.includedTracks.includes('drums')) {
            const modStepGroove = globalStep % (groove.measures * this.stepsPerMeasure);
            const seedIdx =
                groove.sectionSeedMap && chordData?.sectionId
                    ? groove.sectionSeedMap[chordData.sectionId] || 0
                    : 0;
            const preset = DRUM_PRESETS[groove.lastDrumPreset];

            const checkHit = (instName) => {
                const inst = groove.instruments.find((i) => i.name === instName);
                if (!inst || inst.muted) {
                    return false;
                }
                let val = 0;
                if (preset?.variations?.[seedIdx]) {
                    const varInst = preset.variations[seedIdx][instName];
                    if (varInst) {
                        val = varInst[modStepGroove];
                    }
                } else {
                    val = inst.steps[modStepGroove];
                }
                return val > 0;
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

            // 1. Bass (Moved up for coordination)
            if (
                this.includedTracks.includes('bass') &&
                isBassActive(bass.style, globalStep, stepInChord)
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
                );
                if (res?.midi) {
                    const noteTimeS = stepTimeS + (res.timingOffset || 0);
                    const notePulse = Math.max(0, this.toPulses(noteTimeS));

                    let finalVel = res.velocity;
                    if (res.muted) {
                        finalVel *= 0.25;
                    }
                    const midiVel = Math.max(1, Math.min(127, Math.round(finalVel * 127)));

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

                    // Register in coordination state
                    coordination.bassHit = true;
                    coordination.bassMidi = res.midi;
                }
            }

            // 2. Soloist
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

                                // Register in coordination state
                                coordination.soloistActive = true;
                                coordination.soloistMidi = res.midi;
                            }
                        }
                    });
                }
            }

            // 3. Chords (Accompaniment)
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

                        // Register in coordination state
                        coordination.accompanimentHit = true;
                        coordination.accompanimentMidis.push(n.midi);
                    } else if (n.ccEvents.length > 0) {
                        n.ccEvents.forEach((cc) =>
                            this.chordTrack.cc(notePulse, 0, cc.controller, cc.value),
                        );
                    }
                });
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
                let pocketOffset = 0;
                if (groove.genreFeel === 'Neo-Soul' || groove.genreFeel === 'Hip Hop') {
                    pocketOffset += 0.015;
                }

                if (playback.bandIntensity > 0.75) {
                    pocketOffset -= 0.008;
                } else if (playback.bandIntensity < 0.3) {
                    pocketOffset += 0.01;
                }

                const drumTimeS = stepTimeS + pocketOffset;
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
                    groove.instruments.forEach((inst) => {
                        // --- MULTI-SEED LOGIC ---
                        // Find the seed assigned to this section
                        const seedIdx =
                            groove.sectionSeedMap && chordData.sectionId
                                ? groove.sectionSeedMap[chordData.sectionId] || 0
                                : 0;

                        let val = 0;
                        const preset = DRUM_PRESETS[groove.lastDrumPreset];
                        if (preset?.variations?.[seedIdx]) {
                            const varInst = preset.variations[seedIdx][inst.name];
                            if (varInst) {
                                val =
                                    varInst[globalStep % (groove.measures * this.stepsPerMeasure)];
                            }
                        } else {
                            // Fallback to main grid if no variation/preset found
                            val = inst.steps[globalStep % (groove.measures * this.stepsPerMeasure)];
                        }

                        if (val > 0 && !inst.muted) {
                            const midi = drumMap[inst.name];
                            if (midi) {
                                const durS =
                                    inst.name === 'Crash' ? this.secondsPerBeat : tightDurationS;
                                const baseVel = val === 2 ? 110 : 90;
                                const midiVel = Math.max(1, Math.min(127, baseVel));
                                this.drumTrack.noteOn(drumPulse, 9, midi, midiVel);
                                this.drumTrack.noteOff(this.toPulses(drumTimeS + durS), 9, midi);
                            }
                        }
                    });
                }
            }
        }
    }

    finish() {
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

        const finalFilename = `${(this.filename || 'ensemble-export').replace(/\.midi?$/i, '')}.mid`;
        postMessage({ type: WORKER_RESP.EXPORT_COMPLETE, blob: result, filename: finalFilename });
    }

    cleanup() {
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

        isExporting = false;
        processMessageQueue();
    }
}

// --- LOGIC ---

export function getChordAtStep(step, cursor = null) {
    if (arranger.totalSteps === 0) {
        return null;
    }
    const targetStep = step % arranger.totalSteps;

    // Determine which state variables to use (cursor or global defaults)
    let currentLastSectionIndex = cursor ? cursor.sectionIndex : lastSectionIndex;
    let currentLastChordIndex = cursor ? cursor.index : lastChordIndex;

    // Reset cursors if targetStep is before our current position (looping back)
    const lastStep = arranger.stepMap[currentLastChordIndex]?.start || 0;
    if (targetStep < lastStep) {
        currentLastSectionIndex = 0;
        currentLastChordIndex = 0;

        // Also reset global state if not using a custom cursor
        if (!cursor) {
            lastSectionIndex = 0;
            lastChordIndex = 0;
        }
    }

    let sectionData = null;
    if (arranger.sectionMap) {
        let startI = 0;
        if (currentLastSectionIndex < arranger.sectionMap.length) {
            const cached = arranger.sectionMap[currentLastSectionIndex];
            if (targetStep >= cached.start) {
                startI = currentLastSectionIndex;
            }
        }
        for (let i = startI; i < arranger.sectionMap.length; i++) {
            const s = arranger.sectionMap[i];
            if (targetStep >= s.start && targetStep < s.end) {
                sectionData = s;
                currentLastSectionIndex = i;
                break;
            }
            if (s.start > targetStep) {
                break;
            }
        }
    }

    let startI = 0;
    if (currentLastChordIndex < arranger.stepMap.length) {
        const cached = arranger.stepMap[currentLastChordIndex];
        if (targetStep >= cached.start) {
            startI = currentLastChordIndex;
        }
    }

    for (let i = startI; i < arranger.stepMap.length; i++) {
        const entry = arranger.stepMap[i];
        if (targetStep >= entry.start && targetStep < entry.end) {
            currentLastChordIndex = i;

            // Update the state variables
            if (cursor) {
                cursor.index = currentLastChordIndex;
                cursor.sectionIndex = currentLastSectionIndex;
            } else {
                lastChordIndex = currentLastChordIndex;
                lastSectionIndex = currentLastSectionIndex;
            }

            return {
                chord: entry.chord,
                stepInChord: targetStep - entry.start,
                chordIndex: i,
                sectionStart: sectionData?.start || 0,
                sectionEnd: sectionData?.end || arranger.totalSteps,
            };
        }
        if (entry.start > targetStep) {
            break;
        }
    }
    return null;
}

function fillBuffers(currentStep, requestTimestamp = null, processStartTime = null) {
    const targetStep = currentStep + LOOKAHEAD;
    const notesToMain = [];
    if (bbBufferHead < currentStep) {
        bbBufferHead = currentStep;
    }
    if (sbBufferHead < currentStep) {
        sbBufferHead = currentStep;
    }
    if (cbBufferHead < currentStep) {
        cbBufferHead = currentStep;
    }
    if (hbBufferHead < currentStep) {
        hbBufferHead = currentStep;
    }

    let head = Math.min(
        bass.enabled ? bbBufferHead : 999999,
        soloist.enabled ? sbBufferHead : 999999,
        chords.enabled ? cbBufferHead : 999999,
        harmony.enabled ? hbBufferHead : 999999,
    );
    if (head === 999999) {
        head = currentStep;
    }

    const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepsPerMeasure = ts.beats * ts.stepsPerBeat;

    while (head < targetStep) {
        const step = head;
        const chordData = getChordAtStep(step, mainCursor);

        // Reset step coordination for this specific step
        stepCoordination.step = step;
        stepCoordination.bassHit = false;
        stepCoordination.bassMidi = 0;
        stepCoordination.soloistActive = false;
        stepCoordination.soloistMidi = 0;
        stepCoordination.accompanimentHit = false;
        stepCoordination.accompanimentMidis = [];

        // --- Bass ---
        if (bass.enabled && step >= bbBufferHead) {
            if (chordData) {
                const { chord, stepInChord } = chordData;
                if (isBassActive(bass.style, step, stepInChord)) {
                    const nextChordData = getChordAtStep(step + 4, lookaheadCursor);
                    const { sectionStart, sectionEnd } = chordData;
                    const bassResult = getBassNote(
                        chord,
                        nextChordData?.chord,
                        stepInChord / ts.stepsPerBeat,
                        bass.lastFreq,
                        bass.octave,
                        bass.style,
                        chordData.chordIndex,
                        step,
                        stepInChord,
                        { sectionStart, sectionEnd, stepCoordination },
                    );
                    if (bassResult && (bassResult.freq || bassResult.midi)) {
                        if (!bassResult.midi) {
                            bassResult.midi = getMidi(bassResult.freq);
                        }
                        if (!bassResult.freq) {
                            bassResult.freq = getFrequency(bassResult.midi);
                        }
                        bass.lastFreq = bassResult.freq; // @worker-mutation
                        notesToMain.push({ ...bassResult, step, module: 'bass' });

                        // Register in coordination state
                        stepCoordination.bassHit = true;
                        stepCoordination.bassMidi = bassResult.midi;
                    }
                }
            }
            bbBufferHead++;
        }

        // --- Soloist ---
        let soloResult = null;
        if (soloist.enabled && step >= sbBufferHead) {
            if (chordData) {
                const { chord, stepInChord, sectionStart, sectionEnd } = chordData;
                const nextChordData = getChordAtStep(step + 4, lookaheadCursor);
                soloResult = getSoloistNote(
                    chord,
                    nextChordData?.chord,
                    step,
                    soloist.lastFreq,
                    soloist.octave,
                    soloist.style,
                    stepInChord,
                    false,
                    { sectionStart, sectionEnd, stepCoordination },
                );

                if (soloResult) {
                    const results = Array.isArray(soloResult) ? soloResult : [soloResult];
                    for (let i = 0; i < results.length; i++) {
                        const res = results[i];
                        if (res.freq || res.midi) {
                            if (!res.midi) {
                                res.midi = getMidi(res.freq);
                            }
                            if (!res.freq) {
                                res.freq = getFrequency(res.midi);
                            }
                            if (!res.isDoubleStop) {
                                soloist.lastFreq = res.freq; // @worker-mutation

                                // Register in coordination state (non-double-stops)
                                stepCoordination.soloistActive = true;
                                stepCoordination.soloistMidi = res.midi;
                            }
                            notesToMain.push({ ...res, step, module: 'soloist' });
                        }
                    }
                }
            }
            sbBufferHead++;
        }

        // --- Chords ---
        if (chords.enabled && step >= cbBufferHead) {
            if (chordData) {
                const { chord, stepInChord } = chordData;
                const stepInfo = getStepInfo(step, ts);
                const chordNotes = getAccompanimentNotes(
                    chord,
                    step,
                    stepInChord,
                    step % stepsPerMeasure,
                    stepInfo,
                    stepCoordination,
                );
                for (let i = 0; i < chordNotes.length; i++) {
                    const n = chordNotes[i];
                    if (!n.freq) {
                        n.freq = getFrequency(n.midi);
                    }
                    notesToMain.push({ ...n, step, module: 'chords' });

                    // Register in coordination state
                    if (n.midi > 0) {
                        stepCoordination.accompanimentHit = true;
                        stepCoordination.accompanimentMidis.push(n.midi);
                    }
                }
            }
            cbBufferHead++;
        }

        // --- Harmonies ---
        if (harmony.enabled && step >= hbBufferHead) {
            if (chordData) {
                const { chord, stepInChord } = chordData;
                const nextChordData = getChordAtStep(step + 4, lookaheadCursor);
                const harmonyNotes = getHarmonyNotes(
                    chord,
                    nextChordData?.chord,
                    step,
                    harmony.octave,
                    harmony.style,
                    stepInChord,
                    soloResult,
                    stepCoordination,
                );
                for (let i = 0; i < harmonyNotes.length; i++) {
                    const n = harmonyNotes[i];
                    if (!n.freq) {
                        n.freq = getFrequency(n.midi);
                    }
                    notesToMain.push({ ...n, step, module: 'harmony' });
                }
            }
            hbBufferHead++;
        }

        head++;
    }
    const workerProcessTime = processStartTime ? performance.now() - processStartTime : 0;
    if (notesToMain.length > 0) {
        postMessage({
            type: WORKER_RESP.NOTES,
            notes: notesToMain,
            requestTimestamp,
            workerProcessTime,
        });
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

function processMessage(type, data, startTime) {
    try {
        switch (type) {
            case WORKER_MSG.START:
                if (!timerID) {
                    timerID = setInterval(() => {
                        const startTime = performance.now();
                        postMessage({ type: WORKER_RESP.TICK });

                        const s = playback.step;
                        fillBuffers(s, null, startTime);
                    }, interval);
                }
                break;
            case WORKER_MSG.STOP:
                if (timerID) {
                    clearInterval(timerID);
                    timerID = null;
                }
                break;
            case WORKER_MSG.SYNC_STATE:
                if (data.arranger) {
                    Object.assign(arranger, data.arranger);
                    arranger.totalSteps = data.arranger.totalSteps;
                    arranger.stepMap = data.arranger.stepMap;
                    arranger.sectionMap = data.arranger.sectionMap;
                }
                if (data.chords) {
                    Object.assign(chords, data.chords);
                }
                if (data.bass) {
                    Object.assign(bass, data.bass);
                }
                if (data.soloist) {
                    Object.assign(soloist, data.soloist);
                }
                if (data.harmony) {
                    Object.assign(harmony, data.harmony);
                }
                if (data.groove) {
                    Object.assign(groove, data.groove);
                    if (data.groove.instruments) {
                        data.groove.instruments.forEach((di) => {
                            const inst = groove.instruments.find((i) => i.name === di.name);
                            if (inst) {
                                inst.steps = di.steps;
                            }
                        });
                    }
                }
                if (data.playback) {
                    Object.assign(playback, data.playback);
                }
                break;
            case WORKER_MSG.REQUEST_BUFFER:
                fillBuffers(data.step, data.requestTimestamp, startTime);
                break;
            case WORKER_MSG.FLUSH:
                if (data.syncData) {
                    const syncData = data.syncData;
                    if (syncData.arranger) {
                        Object.assign(arranger, syncData.arranger);
                        arranger.totalSteps = syncData.arranger.totalSteps;
                        arranger.stepMap = syncData.arranger.stepMap;
                        arranger.sectionMap = syncData.arranger.sectionMap;
                        lastChordIndex = 0;
                        lastSectionIndex = 0;
                        mainCursor.index = 0;
                        mainCursor.sectionIndex = 0;
                        lookaheadCursor.index = 0;
                        lookaheadCursor.sectionIndex = 0;
                    }
                    if (syncData.chords) {
                        Object.assign(chords, syncData.chords);
                        if (syncData.chords.rhythmicMask !== undefined) {
                            chords.rhythmicMask = syncData.chords.rhythmicMask; // @worker-mutation
                        }
                    }
                    if (syncData.bass) {
                        Object.assign(bass, syncData.bass);
                    }
                    if (syncData.soloist) {
                        Object.assign(soloist, syncData.soloist);
                    }
                    if (syncData.harmony) {
                        Object.assign(harmony, syncData.harmony);
                        if (syncData.harmony.rhythmicMask !== undefined) {
                            harmony.rhythmicMask = syncData.harmony.rhythmicMask; // @worker-mutation
                        }
                        if (syncData.harmony.pocketOffset !== undefined) {
                            harmony.pocketOffset = syncData.harmony.pocketOffset; // @worker-mutation
                        }
                    }
                    if (syncData.groove) {
                        Object.assign(groove, syncData.groove);
                        if (syncData.groove.instruments) {
                            syncData.groove.instruments.forEach((di) => {
                                const inst = groove.instruments.find((i) => i.name === di.name);
                                if (inst) {
                                    inst.steps = di.steps;
                                    inst.muted = di.muted;
                                }
                            });
                        }
                        if (syncData.groove.snareMask !== undefined) {
                            groove.snareMask = syncData.groove.snareMask; // @worker-mutation
                        }
                    }
                    if (syncData.playback) {
                        Object.assign(playback, syncData.playback);
                    }
                }

                bbBufferHead = data.step;
                sbBufferHead = data.step;
                cbBufferHead = data.step;
                hbBufferHead = data.step;
                soloist.isResting = false;
                soloist.busySteps = 0;
                soloist.currentPhraseSteps = 0; // @worker-mutation
                soloist.sessionSteps = 0; // @worker-mutation
                soloist.deviceBuffer = []; // @worker-mutation
                bass.busySteps = 0; // @worker-mutation
                soloist.motifBuffer = [];
                soloist.thematicSeed = []; // @worker-mutation
                soloist.thematicSeedRoot = 0; // @worker-mutation
                soloist.hookBuffer = [];
                soloist.isReplayingMotif = false; // @worker-mutation
                soloist.isReplayingSeed = false; // @worker-mutation
                soloist.sharedHookBuffer = []; // @worker-mutation
                harmony.motifBuffer = []; // @worker-mutation
                harmony.lastMidis = []; // @worker-mutation

                // Reset accompaniment memory
                compingState.lastChordIndex = -1;
                compingState.lockedUntil = 0;
                compingState.rhythmPattern = [];

                if (data.primeSteps > 0) {
                    handlePrime(data.primeSteps);
                }

                fillBuffers(data.step, data.requestTimestamp, startTime);
                break;
            case WORKER_MSG.PRIME:
                handlePrime(data);
                break;
            case WORKER_MSG.RESOLUTION:
                handleResolution(data.step, data.requestTimestamp, startTime);
                break;
            case WORKER_MSG.EXPORT:
                handleExport(data);
                break;
        }
    } catch (err) {
        postMessage({ type: WORKER_RESP.ERROR, data: err.message, stack: err.stack });
    }
}

function processMessageQueue() {
    while (messageQueue.length > 0) {
        const { type, data, startTime } = messageQueue.shift();
        processMessage(type, data, startTime);
        // If an export started, stop processing the queue until it finishes
        if (isExporting) {
            break;
        }
    }
}

if (typeof self !== 'undefined') {
    self.onmessage = (e) => {
        const { type, data } = e.data;
        var startTime = performance.now();

        if (isExporting) {
            // Queue all messages during export to ensure state consistency
            messageQueue.push({ type, data, startTime });
        } else {
            processMessage(type, data, startTime);
        }
    };
}

export function handleResolution(step, requestTimestamp = null, processStartTime = null) {
    const coordination = {
        step,
        bassHit: false,
        bassMidi: 0,
        soloistActive: false,
        soloistMidi: 0,
        accompanimentHit: false,
        accompanimentMidis: [],
    };

    const notesToMain = generateResolutionNotes(
        step,
        arranger,
        {
            bass: bass.enabled,
            chords: chords.enabled,
            soloist: soloist.enabled,
            harmony: harmony.enabled,
            groove: groove.enabled,
        },
        playback.bpm,
        groove,
        soloist,
        coordination,
    );
    var workerProcessTime = processStartTime ? performance.now() - processStartTime : 0;
    postMessage({
        type: WORKER_RESP.NOTES,
        notes: notesToMain,
        isResolution: true,
        requestTimestamp,
        workerProcessTime,
    });
}

function handlePrime(steps) {
    if (!soloist.enabled || arranger.totalSteps === 0) {
        return;
    }

    // Default to 2 full loops of the progression to establish firm musical context
    const stepsToPrime = steps || arranger.totalSteps * 2;

    if (playback.workerLogging) {
        console.log(`[Worker] Priming engine for ${stepsToPrime} steps...`);
    }

    // Reset soloist state for priming
    soloist.isResting = false; // @worker-mutation
    soloist.busySteps = 0; // @worker-mutation
    bass.busySteps = 0; // @worker-mutation
    soloist.currentPhraseSteps = 0; // @worker-mutation
    soloist.motifBuffer = []; // @worker-mutation
    soloist.thematicSeed = []; // @worker-mutation
    soloist.thematicSeedRoot = 0; // @worker-mutation
    soloist.hookBuffer = []; // @worker-mutation
    soloist.isReplayingMotif = false; // @worker-mutation
    soloist.isReplayingSeed = false; // @worker-mutation
    soloist.lastAttackStep = -100; // @worker-mutation

    // Local cursors for priming
    const primeCursor = { index: 0, sectionIndex: 0 };
    const primeLookaheadCursor = { index: 0, sectionIndex: 0 };

    const start = performance.now();

    // We simulate running through the progression (wrapping around)
    // ensuring that when we finish, the state is primed for Step 0.
    for (let i = 0; i < stepsToPrime; i++) {
        const s = i;
        const chordData = getChordAtStep(s, primeCursor);

        if (chordData) {
            const { chord, stepInChord } = chordData;
            const nextChordData = getChordAtStep(s + 4, primeLookaheadCursor);
            const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];

            const coordination = {
                step: s,
                bassHit: false,
                bassMidi: 0,
                soloistActive: false,
                soloistMidi: 0,
                accompanimentHit: false,
                accompanimentMidis: [],
                kickHit: false,
                snareHit: false,
            };

            // 1. Prime Bass (if enabled) to update bass.lastFreq
            if (bass.enabled) {
                if (isBassActive(bass.style, s, stepInChord)) {
                    const { sectionStart, sectionEnd } = chordData;
                    const centerMidi = bass.octave;
                    const bassResult = getBassNote(
                        chord,
                        nextChordData?.chord,
                        stepInChord / ts.stepsPerBeat,
                        bass.lastFreq,
                        centerMidi,
                        bass.style,
                        chordData.chordIndex,
                        s,
                        stepInChord,
                        { sectionStart, sectionEnd, stepCoordination: coordination },
                    );
                    if (bassResult && (bassResult.freq || bassResult.midi)) {
                        if (!bassResult.freq) {
                            bassResult.freq = 440 * 2 ** ((bassResult.midi - 69) / 12);
                        }
                        bass.lastFreq = bassResult.freq; // @worker-mutation
                        coordination.bassHit = true;
                        coordination.bassMidi = bassResult.midi;
                    }
                }
            }

            // 2. Prime Soloist
            const { sectionStart, sectionEnd } = chordData;
            // Manually increment sessionSteps for priming logic
            soloist.sessionSteps = (soloist.sessionSteps || 0) + 1; // @worker-mutation

            const soloResult = getSoloistNote(
                chord,
                nextChordData?.chord,
                s,
                soloist.lastFreq,
                soloist.octave,
                soloist.style,
                stepInChord,
                true,
                { sectionStart, sectionEnd, stepCoordination: coordination },
            );

            if (soloResult) {
                const results = Array.isArray(soloResult) ? soloResult : [soloResult];
                results.forEach((res) => {
                    if (res.freq || res.midi) {
                        if (!res.freq) {
                            res.freq = 440 * 2 ** ((res.midi - 69) / 12);
                        }
                        if (!res.isDoubleStop) {
                            soloist.lastFreq = res.freq; // @worker-mutation
                            coordination.soloistActive = true;
                            coordination.soloistMidi = res.midi;
                        }
                    }
                });
            }
        }
    }

    const elapsed = performance.now() - start;
    if (playback.workerLogging) {
        console.log(`[Worker] Priming complete in ${elapsed.toFixed(2)}ms`);
    }

    // Reset physical and session state for the REAL start at Step 0
    soloist.busySteps = 0; // @worker-mutation
    bass.busySteps = 0; // @worker-mutation
    soloist.sessionSteps = 0; // @worker-mutation
}
