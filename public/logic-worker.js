import { getBassNote, isBassActive } from './bass.js';
import { getSoloistNote } from './soloist.js';
import { getHarmonyNotes } from './harmonies.js';
import { getAccompanimentNotes, compingState } from './accompaniment.js';
import { generateResolutionNotes } from './resolution.js';
import { getState } from './state.js';
import { TIME_SIGNATURES } from './config.js';
import { getMidi, getStepInfo, getFrequency } from './utils.js';
import { generateProceduralFill } from './fills.js';
import { analyzeForm } from './form-analysis.js';
import { WORKER_MSG, WORKER_RESP } from './worker-types.js';

const { arranger, chords, bass, soloist, groove, harmony, playback } = getState();

// --- WORKER STATE ---
let timerID = null;
let interval = 25;
let bbBufferHead = 0;
let sbBufferHead = 0;
let cbBufferHead = 0;
let hbBufferHead = 0;
let lastChordIndex = 0;
let lastSectionIndex = 0;
const mainCursor = { index: 0, sectionIndex: 0 };
const lookaheadCursor = { index: 0, sectionIndex: 0 };
const LOOKAHEAD = 64;

// --- EXPORT HELPERS ---

const PPQ = 480; 

function writeVarInt(value) {
    const buffer = [];
    if (value === 0) return [0];
    while (value > 0) {
        let byte = value & 0x7F;
        value >>= 7;
        if (buffer.length > 0) byte |= 0x80;
        buffer.push(byte);
    }
    return buffer.reverse();
}

function writeString(str) {
    return str.split('').map(c => c.charCodeAt(0));
}

function writeInt32(val) {
    return [(val >> 24) & 0xFF, (val >> 16) & 0xFF, (val >> 8) & 0xFF, val & 0xFF];
}

function writeInt16(val) {
    return [(val >> 8) & 0xFF, val & 0xFF];
}

class MidiTrack {
    constructor() {
        this.events = [];
    }

    addEvent(time, data) {
        this.events.push({ time: Math.round(time), data });
    }

    noteOn(time, ch, note, vel) { this.addEvent(time, [0x90 | ch, note, vel]); }
    noteOff(time, ch, note) { this.addEvent(time, [0x80 | ch, note, 0]); }
    programChange(time, ch, program) { this.addEvent(time, [0xC0 | ch, program]); }
    cc(time, ch, cc, val) { this.addEvent(time, [0xB0 | ch, cc, val]); }
    pitchBend(time, ch, val) {
        const normalized = Math.max(0, Math.min(16383, val + 8192));
        this.addEvent(time, [0xE0 | ch, normalized & 0x7F, (normalized >> 7) & 0x7F]);
    }
    setName(time, name) {
        const bytes = writeString(name);
        this.addEvent(time, [0xFF, 0x03, ...writeVarInt(bytes.length), ...bytes]);
    }
    setTempo(time, bpm) {
        const mspb = Math.round(60000000 / bpm);
        this.addEvent(time, [0xFF, 0x51, 0x03, (mspb >> 16) & 0xFF, (mspb >> 8) & 0xFF, mspb & 0xFF]);
    }
    setTimeSig(time, n, d) {
        let dp = 2; if (d === 8) dp = 3;
        this.addEvent(time, [0xFF, 0x58, 0x04, n, dp, 24, 8]);
    }
    setKeySig(time, root, isMinor) {
        const keyMap = { 'C': 0, 'G': 1, 'D': 2, 'A': 3, 'E': 4, 'B': 5, 'Gb': -6, 'Db': -5, 'Ab': -4, 'Eb': -3, 'Bb': -2, 'F': -1 };
        const rootLookup = (root === 'F#' ? 'Gb' : (root === 'C#' ? 'Db' : root));
        let sf = keyMap[rootLookup] || 0;
        if (isMinor) {
            const KEY_ORDER = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
            const relMajor = KEY_ORDER[(KEY_ORDER.indexOf(rootLookup) + 3) % 12];
            sf = keyMap[relMajor] || 0;
        }
        this.addEvent(time, [0xFF, 0x59, 0x02, sf < 0 ? 256 + sf : sf, isMinor ? 0x01 : 0x00]);
    }
    endOfTrack(time) { this.addEvent(time, [0xFF, 0x2F, 0x00]); }

    compile() {
        this.events.sort((a, b) => {
            if (a.time !== b.time) return a.time - b.time;
            const typeA = a.data[0] & 0xF0;
            const typeB = b.data[0] & 0xF0;
            if (typeA === 0x80 && typeB === 0x90) return -1; 
            if (typeA === 0x90 && typeB === 0x80) return 1;
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

// --- LOGIC ---

export function getChordAtStep(step, cursor = null) {
    if (arranger.totalSteps === 0) return null;
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
            if (s.start > targetStep) break;
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
                sectionEnd: sectionData?.end || arranger.totalSteps
            };
        }
        if (entry.start > targetStep) break;
    }
    return null;
}

function fillBuffers(currentStep, requestTimestamp = null, processStartTime = null) {
    const targetStep = currentStep + LOOKAHEAD;
    const notesToMain = [];
    if (bbBufferHead < currentStep) bbBufferHead = currentStep;
    if (sbBufferHead < currentStep) sbBufferHead = currentStep;
    if (cbBufferHead < currentStep) cbBufferHead = currentStep;
    if (hbBufferHead < currentStep) hbBufferHead = currentStep;
    
    let head = Math.min(
        bass.enabled ? bbBufferHead : 999999,
        soloist.enabled ? sbBufferHead : 999999,
        chords.enabled ? cbBufferHead : 999999,
        harmony.enabled ? hbBufferHead : 999999
    );
    if (head === 999999) head = currentStep;

    const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepsPerMeasure = ts.beats * ts.stepsPerBeat;
    
    while (head < targetStep) {
        const step = head;
        const chordData = getChordAtStep(step, mainCursor);
        
        // --- Bass ---
        if (bass.enabled && step >= bbBufferHead) {
            if (chordData) {
                const { chord, stepInChord } = chordData;
                if (isBassActive(bass.style, step, stepInChord)) {
                    const nextChordData = getChordAtStep(step + 4, lookaheadCursor);
                    const { sectionStart, sectionEnd } = chordData;
                    const bassResult = getBassNote(chord, nextChordData?.chord, stepInChord / ts.stepsPerBeat, bass.lastFreq, bass.octave, bass.style, chordData.chordIndex, step, stepInChord, { sectionStart, sectionEnd });
                    if (bassResult && (bassResult.freq || bassResult.midi)) {
                        if (!bassResult.midi) bassResult.midi = getMidi(bassResult.freq);
                        if (!bassResult.freq) bassResult.freq = getFrequency(bassResult.midi);
                        bass.lastFreq = bassResult.freq;
                        notesToMain.push({ ...bassResult, step, module: 'bass' });
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
                soloResult = getSoloistNote(chord, nextChordData?.chord, step, soloist.lastFreq, soloist.octave, soloist.style, stepInChord, false, { sectionStart, sectionEnd });
                
                if (soloResult) {
                    const results = Array.isArray(soloResult) ? soloResult : [soloResult];
                    for (let i = 0; i < results.length; i++) {
                        const res = results[i];
                        if (res.freq || res.midi) {
                            if (!res.midi) res.midi = getMidi(res.freq);
                            if (!res.freq) res.freq = getFrequency(res.midi);
                            if (!res.isDoubleStop) soloist.lastFreq = res.freq;
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
                const chordNotes = getAccompanimentNotes(chord, step, stepInChord, step % stepsPerMeasure, stepInfo);
                for (let i = 0; i < chordNotes.length; i++) {
                    const n = chordNotes[i];
                    if (!n.freq) n.freq = getFrequency(n.midi);
                    notesToMain.push({ ...n, step, module: 'chords' });
                }
            }
            cbBufferHead++;
        }

        // --- Harmonies ---
        if (harmony.enabled && step >= hbBufferHead) {
            if (chordData) {
                const { chord, stepInChord } = chordData;
                const nextChordData = getChordAtStep(step + 4, lookaheadCursor);
                const harmonyNotes = getHarmonyNotes(chord, nextChordData?.chord, step, harmony.octave, harmony.style, stepInChord, soloResult);
                for (let i = 0; i < harmonyNotes.length; i++) {
                    const n = harmonyNotes[i];
                    if (!n.freq) n.freq = getFrequency(n.midi);
                    notesToMain.push({ ...n, step, module: 'harmony' });
                }
            }
            hbBufferHead++;
        }
        
        head++;
    }
    const workerProcessTime = processStartTime ? performance.now() - processStartTime : 0;
    if (notesToMain.length > 0) postMessage({ type: WORKER_RESP.NOTES, notes: notesToMain, requestTimestamp, workerProcessTime });
}

export function handleExport(options) {
    try {
        const { includedTracks = ['chords', 'bass', 'soloist', 'harmonies', 'drums'], targetDuration = 3, loopMode = 'time', filename } = options;
        if (arranger.progression.length === 0) { postMessage({ type: WORKER_RESP.ERROR, data: "No progression to export" }); return; }

        const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        const totalStepsOneLoop = arranger.totalSteps;
        const stepsPerMeasure = ts.beats * ts.stepsPerBeat;
        const loopSeconds = (totalStepsOneLoop / ts.stepsPerBeat) * (60 / playback.bpm);
        let loopCount = (loopMode === 'once') ? 1 : Math.max(1, Math.min(100, Math.ceil((targetDuration * 60) / loopSeconds)));
        const totalStepsWithoutEnding = totalStepsOneLoop * loopCount;
        const totalStepsExport = totalStepsWithoutEnding + 16; // Add one resolution measure

        // Independent cursors for export
        const exportCursor = { index: 0, sectionIndex: 0 };
        const exportLookaheadCursor = { index: 0, sectionIndex: 0 };

        // --- 1:1 TIMING MAP GENERATION ---
        const stepTimes = new Array(totalStepsExport + 128);
        const secondsPerBeat = 60.0 / playback.bpm;
        const sixteenthSec = 0.25 * secondsPerBeat;
        
        let accumulatedSeconds = 0;
        for (let i = 0; i < stepTimes.length; i++) {
            stepTimes[i] = accumulatedSeconds;
            
            let duration = sixteenthSec;
            if (groove.swing > 0 && ts.stepsPerBeat === 4) {
                const shift = (sixteenthSec / 3) * (groove.swing / 100);
                if (groove.swingSub === '16th') {
                    duration += (i % 2 === 0) ? shift : -shift;
                } else {
                    duration += ((i % 4) < 2) ? shift : -shift;
                }
            }
            accumulatedSeconds += duration;
        }

        // Helper to convert any absolute second timestamp to MIDI Pulses
        const toPulses = (t) => Math.round(t * (playback.bpm / 60.0) * PPQ);

        const metaTrack = new MidiTrack();
        const chordTrack = new MidiTrack();
        const bassTrack = new MidiTrack();
        const soloistTrack = new MidiTrack();
        const harmonyTrack = new MidiTrack();
        const drumTrack = new MidiTrack();

        metaTrack.setName(0, 'Ensemble Export');
        metaTrack.setTempo(0, playback.bpm);
        metaTrack.setKeySig(0, arranger.key, arranger.isMinor);
        const [tsNum, tsDenom] = (arranger.timeSignature || '4/4').split('/').map(Number);
        metaTrack.setTimeSig(0, tsNum, tsDenom);

        chordTrack.setName(0, 'Chords'); chordTrack.programChange(0, 0, 4);
        bassTrack.setName(0, 'Bass'); bassTrack.programChange(0, 1, 34);
        soloistTrack.setName(0, 'Soloist'); soloistTrack.programChange(0, 2, 80);
        harmonyTrack.setName(0, 'Harmonies'); harmonyTrack.programChange(0, 3, 61); // Brass/Synth
        drumTrack.setName(0, 'Drums');

        const prevStates = { chords: chords.enabled, bass: bass.enabled, soloist: soloist.enabled, harmony: harmony.enabled, groove: groove.enabled, intensity: playback.bandIntensity, doubleStops: soloist.doubleStops, sessionSteps: soloist.sessionSteps };
        chords.enabled = true; bass.enabled = true; soloist.enabled = true; harmony.enabled = true; groove.enabled = true;
        soloist.sessionSteps = 1000; // Bypass warm-up for export
        compingState.lockedUntil = 0; compingState.lastChordIndex = -1;
        soloist.busySteps = 0; soloist.isResting = false; soloist.currentPhraseSteps = 0;

        // --- EXPORT CONDUCTOR ---
        const exportConductor = {
            loopCount: 0,
            formIteration: 0,
            targetIntensity: playback.bandIntensity,
            stepSize: 0,
            form: analyzeForm()
        };

        const checkWorkerTransition = (step) => {
            if (!groove.enabled) return;
            const modStep = step % totalStepsOneLoop;
            
            if (modStep === 0 && step > 0) {
                exportConductor.loopCount++;
                exportConductor.formIteration++;
            }

            const entry = arranger.stepMap.find(e => modStep >= e.start && modStep < e.end);
            if (!entry) return;
            
            const sectionEnd = entry.end;
            const fillStart = sectionEnd - stepsPerMeasure;
            
            if (modStep === fillStart) {
                const currentIndex = arranger.stepMap.indexOf(entry);
                let nextEntry = arranger.stepMap[currentIndex + 1];
                let isLoopEnd = false;
                if (!nextEntry) { nextEntry = arranger.stepMap[0]; isLoopEnd = true; }
                
                if (nextEntry.chord.sectionId !== entry.chord.sectionId || isLoopEnd) {
                    let shouldFill = true;
                    if (isLoopEnd && totalStepsOneLoop <= 64) {
                        const freq = playback.bandIntensity > 0.75 ? 1 : (playback.bandIntensity > 0.4 ? 2 : 4);
                        shouldFill = (exportConductor.loopCount % freq === 0);
                    }
                    if (shouldFill) {
                        groove.fillSteps = generateProceduralFill(groove.genreFeel, playback.bandIntensity, stepsPerMeasure);
                        groove.fillActive = true;
                        groove.fillStartStep = step;
                        groove.fillLength = stepsPerMeasure;
                        groove.pendingCrash = true;
                    }
                }
            }
            
            if (playback.autoIntensity && modStep === 0 && exportConductor.formIteration > 0) {
                const grandCycle = exportConductor.formIteration % 8;
                let target = 0.5;
                if (grandCycle < 3) target = 0.6;
                else if (grandCycle < 5) target = 0.9; 
                else target = 0.4; 
                playback.bandIntensity = playback.bandIntensity + (target - playback.bandIntensity) * 0.5;
            }

            // --- Intelligent Harmony Export Scaling ---
            // Mirror the conductor's logic: scale complexity with intensity
            harmony.complexity = Math.max(0, (playback.bandIntensity - 0.2) * 1.25);
            
            // "Final Build" for MIDI: If we are in the last loop of the export, push for a climax
            const isLastLoop = (exportConductor.loopCount >= loopCount - 1);
            if (isLastLoop && loopCount > 1) {
                harmony.complexity = Math.max(harmony.complexity, 0.85);
            }
        };

        for (let globalStep = 0; globalStep < totalStepsWithoutEnding; globalStep++) {
            checkWorkerTransition(globalStep);

            const stepTimeS = stepTimes[globalStep];

            const measureStep = globalStep % stepsPerMeasure;
            const stepInfo = getStepInfo(globalStep, ts);
            const chordData = getChordAtStep(globalStep, exportCursor);

            if (chordData) {
                const { chord, stepInChord } = chordData;
                const nextChordData = getChordAtStep(globalStep + 4, exportLookaheadCursor);

                if (includedTracks.includes('chords')) {
                    const notes = getAccompanimentNotes(chord, globalStep, stepInChord, measureStep, stepInfo);
                    const numVoices = notes.filter(n => n.midi > 0).length;
                    const polyphonyComp = 1 / Math.sqrt(Math.max(1, numVoices));

                    notes.forEach(n => {
                        const noteTimeS = stepTimeS + (n.timingOffset || 0);
                        const notePulse = Math.max(0, toPulses(noteTimeS));
                        
                        if (n.midi > 0) {
                            n.ccEvents.forEach(cc => chordTrack.cc(notePulse, 0, cc.controller, cc.value));
                            
                            // Safe MIDI Velocity for Chords with power compensation
                            let finalVel = n.velocity * polyphonyComp;
                            if (n.muted) finalVel *= 0.3; // Scale ghost "chucks"
                            const midiVel = Math.max(1, Math.min(127, Math.round(finalVel * 127)));
                            
                            chordTrack.noteOn(notePulse, 0, n.midi, midiVel);
                            
                            let endTimeS;
                            if (n.durationSteps < 1) {
                                endTimeS = noteTimeS + (n.durationSteps * sixteenthSec);
                            } else {
                                const targetStepIdx = globalStep + Math.round(n.durationSteps);
                                endTimeS = stepTimes[targetStepIdx] || (noteTimeS + (n.durationSteps * sixteenthSec));
                            }
                            if (endTimeS - noteTimeS < 0.05) endTimeS = noteTimeS + 0.05;
                            
                            chordTrack.noteOff(toPulses(endTimeS), 0, n.midi);
                        } else if (n.ccEvents.length > 0) {
                            n.ccEvents.forEach(cc => chordTrack.cc(notePulse, 0, cc.controller, cc.value));
                        }
                    });
                }

                if (includedTracks.includes('bass') && isBassActive(bass.style, globalStep, stepInChord)) {
                    const { sectionStart, sectionEnd } = chordData;
                    const res = getBassNote(chord, nextChordData?.chord, stepInChord / ts.stepsPerBeat, bass.lastFreq, bass.octave, bass.style, chordData.chordIndex, globalStep, stepInChord, { sectionStart, sectionEnd });
                    if (res && res.midi) {
                        const noteTimeS = stepTimeS + (res.timingOffset || 0);
                        const notePulse = Math.max(0, toPulses(noteTimeS));
                        
                        // Safe MIDI Velocity for Bass
                        let finalVel = res.velocity;
                        if (res.muted) finalVel *= 0.25; 
                        const midiVel = Math.max(1, Math.min(127, Math.round(finalVel * 127)));

                        bassTrack.noteOn(notePulse, 1, res.midi, midiVel);
                        
                        let endTimeS;
                        if (res.durationSteps < 1) {
                            endTimeS = noteTimeS + (res.durationSteps * sixteenthSec);
                        } else {
                            const targetStepIdx = globalStep + Math.round(res.durationSteps);
                            endTimeS = stepTimes[targetStepIdx] || (noteTimeS + (res.durationSteps * sixteenthSec));
                        }
                        if (endTimeS - noteTimeS < 0.05) endTimeS = noteTimeS + 0.05;

                        // Add small release tail (20ms) to bass notes to prevent "choked" sound 
                        endTimeS += 0.02;

                        bassTrack.noteOff(toPulses(endTimeS), 1, res.midi);
                        bass.lastFreq = 440 * Math.pow(2, (res.midi - 69) / 12);
                    }
                }

                if (includedTracks.includes('soloist')) {
                    const { sectionStart, sectionEnd } = chordData;
                    const soloResult = getSoloistNote(chord, nextChordData?.chord, globalStep, soloist.lastFreq, soloist.octave, soloist.style, stepInChord, false, { sectionStart, sectionEnd });
                    if (soloResult) {
                        const results = Array.isArray(soloResult) ? soloResult : [soloResult];
                        const polyphonyComp = 1 / Math.sqrt(Math.max(1, results.length));

                        results.forEach(res => {
                            if (res.midi) {
                                const noteTimeS = stepTimeS + (res.timingOffset || 0);
                                const notePulse = Math.max(0, toPulses(noteTimeS));
                                
                                // Safe MIDI Velocity for Soloist with power compensation
                                const midiVel = Math.max(1, Math.min(127, Math.round(res.velocity * polyphonyComp * 127)));

                                if (res.bendStartInterval) {
                                    soloistTrack.pitchBend(notePulse, 2, Math.round(-(res.bendStartInterval / 2) * 8192));
                                    soloistTrack.noteOn(notePulse, 2, res.midi, midiVel);
                                    soloistTrack.pitchBend(toPulses(stepTimeS + sixteenthSec), 2, 0);
                                } else {
                                    soloistTrack.noteOn(notePulse, 2, res.midi, midiVel);
                                }
                                
                                let endTimeS;
                                if (res.durationSteps < 1) {
                                    endTimeS = noteTimeS + (res.durationSteps * sixteenthSec);
                                } else {
                                    const targetStepIdx = globalStep + Math.round(res.durationSteps);
                                    endTimeS = stepTimes[targetStepIdx] || (noteTimeS + (res.durationSteps * sixteenthSec));
                                }
                                if (endTimeS - noteTimeS < 0.05) endTimeS = noteTimeS + 0.05;

                                // Add small release tail (15ms) for soloist
                                endTimeS += 0.015;

                                soloistTrack.noteOff(toPulses(endTimeS), 2, res.midi);
                                if (!res.isDoubleStop) soloist.lastFreq = 440 * Math.pow(2, (res.midi - 69) / 12);
                            }
                        });
                    }
                }

                if (includedTracks.includes('harmonies')) {
                    const harmonyNotes = getHarmonyNotes(chord, nextChordData?.chord, globalStep, harmony.octave, harmony.style, stepInChord);
                    const polyphonyComp = 1 / Math.sqrt(Math.max(1, harmonyNotes.length));

                    harmonyNotes.forEach(n => {
                        const noteTimeS = stepTimeS + (n.timingOffset || 0);
                        const notePulse = Math.max(0, toPulses(noteTimeS));
                        const midiVel = Math.max(1, Math.min(127, Math.round(n.velocity * polyphonyComp * 127)));

                        harmonyTrack.noteOn(notePulse, 3, n.midi, midiVel);

                        let endTimeS;
                        if (n.durationSteps < 1) {
                            endTimeS = noteTimeS + (n.durationSteps * sixteenthSec);
                        } else {
                            const targetStepIdx = globalStep + Math.round(n.durationSteps);
                            endTimeS = stepTimes[targetStepIdx] || (noteTimeS + (n.durationSteps * sixteenthSec));
                        }
                        harmonyTrack.noteOff(toPulses(endTimeS), 3, n.midi);
                    });
                }
            }

            if (includedTracks.includes('drums')) {
                let pocketOffset = 0;
                if (groove.genreFeel === 'Neo-Soul' || groove.genreFeel === 'Hip Hop') pocketOffset += 0.015;

                if (playback.bandIntensity > 0.75) pocketOffset -= 0.008; 
                else if (playback.bandIntensity < 0.3) pocketOffset += 0.010;

                const drumTimeS = stepTimeS + pocketOffset;
                const drumPulse = Math.max(0, toPulses(drumTimeS));
                
                const nextStepTimeS = stepTimes[globalStep + 1] || (stepTimeS + sixteenthSec);
                const tightDurationS = (nextStepTimeS - stepTimeS) * 0.75; 
                const drumMap = { 
                    'Kick': 36, 'Snare': 38, 'HiHat': 42, 'Open': 46, 'Crash': 49,
                    'Clave': 75, 'Conga': 63, 'Bongo': 60, 'Perc': 67, 'Shaker': 82, 'Guiro': 74,
                    'High Tom': 50, 'Mid Tom': 47, 'Low Tom': 43
                };

                let fillPlayed = false;

                if (groove.fillActive) {
                    const fillStep = globalStep - groove.fillStartStep;
                    
                    if (fillStep >= 0 && fillStep < groove.fillLength) {
                        if (playback.bandIntensity >= 0.5 || fillStep >= (groove.fillLength / 2)) {
                            const fillNotes = groove.fillSteps[fillStep];
                            if (fillNotes && fillNotes.length > 0) {
                                fillNotes.forEach(n => {
                                    const midi = drumMap[n.name];
                                    if (midi) {
                                        const durS = n.name === 'Crash' ? secondsPerBeat : tightDurationS;
                                        // Safe MIDI Velocity for Drums (Fills)
                                        const midiVel = Math.max(1, Math.min(127, Math.round(n.vel * 127)));
                                        drumTrack.noteOn(drumPulse, 9, midi, midiVel);
                                        drumTrack.noteOff(toPulses(drumTimeS + durS), 9, midi);
                                    }
                                });
                                fillPlayed = true; 
                            }
                        }
                    } else if (fillStep === groove.fillLength) {
                        groove.fillActive = false;
                        if (groove.pendingCrash) {
                            drumTrack.noteOn(drumPulse, 9, drumMap['Crash'], 110);
                            drumTrack.noteOff(toPulses(drumTimeS + secondsPerBeat), 9, drumMap['Crash']);
                            groove.pendingCrash = false;
                        }
                    }
                }

                if (!fillPlayed) {
                    groove.instruments.forEach(inst => {
                        const val = inst.steps[globalStep % (groove.measures * stepsPerMeasure)];
                        if (val > 0 && !inst.muted) {
                            const midi = drumMap[inst.name];
                            if (midi) {
                                const durS = inst.name === 'Crash' ? secondsPerBeat : tightDurationS;
                                // Safe MIDI Velocity for Drums (Grid)
                                const baseVel = val === 2 ? 110 : 90;
                                const midiVel = Math.max(1, Math.min(127, baseVel));
                                drumTrack.noteOn(drumPulse, 9, midi, midiVel);
                                drumTrack.noteOff(toPulses(drumTimeS + durS), 9, midi);
                            }
                        }
                    });
                }
            }
        }

        // --- FINAL RESOLUTION MEASURE ---
        const resolutionStep = totalStepsWithoutEnding;
        const resTimeS = stepTimes[resolutionStep];

        const resolutionNotes = generateResolutionNotes(resolutionStep, arranger, { 
            bass: includedTracks.includes('bass'), 
            chords: includedTracks.includes('chords'), 
            soloist: includedTracks.includes('soloist'), 
            harmony: includedTracks.includes('harmonies'),
            groove: includedTracks.includes('drums') 
        }, playback.bpm);

        resolutionNotes.forEach(n => {
            let track;
            let channel = 0;
            if (n.module === 'bass') { track = bassTrack; channel = 1; }
            else if (n.module === 'chords') { track = chordTrack; channel = 0; }
            else if (n.module === 'soloist') { track = soloistTrack; channel = 2; }
            else if (n.module === 'harmony') { track = harmonyTrack; channel = 3; }
            else if (n.module === 'groove') { track = drumTrack; channel = 9; }
            
            if (!track) return;

            const offsetS = n.timingOffset || 0;
            const notePulse = toPulses(resTimeS + offsetS);

            if (n.ccEvents) {
                n.ccEvents.forEach(cc => {
                     track.cc(toPulses(resTimeS + (cc.timingOffset || 0)), channel, cc.controller, cc.value);
                });
            }

            if (n.midi > 0) {
                 if (n.module === 'soloist' && n.bendStartInterval) {
                     track.pitchBend(notePulse, channel, Math.round(-(n.bendStartInterval / 2) * 8192));
                 }
                 
                 track.noteOn(notePulse, channel, n.midi, n.midiVelocity || 90);

                 if (n.module === 'soloist' && n.bendStartInterval) {
                     track.pitchBend(toPulses(resTimeS + sixteenthSec), channel, 0);
                 }
                 
                 const durationS = (n.durationSteps || 1) * sixteenthSec;
                 track.noteOff(toPulses(resTimeS + offsetS + durationS), channel, n.midi);
            } else if (n.module === 'groove' && n.name) {
                const drumMap = { 
                    'Kick': 36, 'Snare': 38, 'HiHat': 42, 'Open': 46, 'Crash': 49,
                    'Clave': 75, 'Conga': 63, 'Bongo': 60, 'Perc': 67, 'Shaker': 82, 'Guiro': 74,
                    'High Tom': 50, 'Mid Tom': 47, 'Low Tom': 43
                };
                const midi = drumMap[n.name];
                if (midi) {
                    track.noteOn(notePulse, channel, midi, n.midiVelocity || 110);
                    const durS = (n.name === 'Crash') ? 3.0 : 0.1;
                    track.noteOff(toPulses(resTimeS + offsetS + durS), channel, midi);
                }
            }
        });

        // Cleanup: Release sustain for chords if they were active
        if (includedTracks.includes('chords')) {
            chordTrack.cc(toPulses(resTimeS + (16.1 * sixteenthSec)), 0, 64, 0);
        }

        const finalPulse = toPulses(stepTimes[totalStepsExport - 1] + sixteenthSec);
        const finalTrackList = [metaTrack];
        const trackRefs = { chords: chordTrack, bass: bassTrack, soloist: soloistTrack, harmonies: harmonyTrack, drums: drumTrack };
        ['chords', 'bass', 'soloist', 'harmonies', 'drums'].forEach(key => {
            if (includedTracks.includes(key)) {
                trackRefs[key].endOfTrack(finalPulse);
                finalTrackList.push(trackRefs[key]);
            }
        });
        metaTrack.endOfTrack(finalPulse);

        chords.enabled = prevStates.chords; bass.enabled = prevStates.bass; soloist.enabled = prevStates.soloist; harmony.enabled = prevStates.harmony; groove.enabled = prevStates.groove; playback.bandIntensity = prevStates.intensity; soloist.doubleStops = prevStates.doubleStops; soloist.sessionSteps = prevStates.sessionSteps;

        const header = new Uint8Array([...writeString('MThd'), ...writeInt32(6), ...writeInt16(1), ...writeInt16(finalTrackList.length), ...writeInt16(PPQ)]);
        const trackChunks = finalTrackList.map(t => t.compile());
        const totalSize = header.length + trackChunks.reduce((acc, c) => acc + c.length, 0);
        const result = new Uint8Array(totalSize);
        result.set(header, 0);
        let offset = header.length;
        trackChunks.forEach(c => { result.set(c, offset); offset += c.length; });

        let finalFilename = (filename || 'ensemble-export').replace(/\.midi?$/i, '') + '.mid';
        postMessage({ type: WORKER_RESP.EXPORT_COMPLETE, blob: result, filename: finalFilename });
    } catch (e) { postMessage({ type: WORKER_RESP.ERROR, data: e.message, stack: e.stack }); }
}

if (typeof self !== 'undefined') {
    self.onmessage = (e) => {
        const { type, data } = e.data;
        var startTime = performance.now();
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
                    if (data.chords) Object.assign(chords, data.chords);
                    if (data.bass) Object.assign(bass, data.bass);
                    if (data.soloist) Object.assign(soloist, data.soloist);
                    if (data.harmony) Object.assign(harmony, data.harmony);
                    if (data.groove) {
                        Object.assign(groove, data.groove);
                        if (data.groove.instruments) {
                            data.groove.instruments.forEach(di => {
                                const inst = groove.instruments.find(i => i.name === di.name);
                                if (inst) inst.steps = di.steps;
                            });
                        }
                    }
                    if (data.playback) Object.assign(playback, data.playback);
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
                            mainCursor.index = 0; mainCursor.sectionIndex = 0;
                            lookaheadCursor.index = 0; lookaheadCursor.sectionIndex = 0;
                        }
                        if (syncData.chords) {
                            Object.assign(chords, syncData.chords);
                            if (syncData.chords.rhythmicMask !== undefined) chords.rhythmicMask = syncData.chords.rhythmicMask;
                        }
                        if (syncData.bass) Object.assign(bass, syncData.bass);
                        if (syncData.soloist) Object.assign(soloist, syncData.soloist);
                        if (syncData.harmony) {
                            Object.assign(harmony, syncData.harmony);
                            if (syncData.harmony.rhythmicMask !== undefined) harmony.rhythmicMask = syncData.harmony.rhythmicMask;
                            if (syncData.harmony.pocketOffset !== undefined) harmony.pocketOffset = syncData.harmony.pocketOffset;
                        }
                        if (syncData.groove) {
                            Object.assign(groove, syncData.groove);
                            if (syncData.groove.instruments) { syncData.groove.instruments.forEach(di => { const inst = groove.instruments.find(i => i.name === di.name); if (inst) { inst.steps = di.steps; inst.muted = di.muted; } }); }
                            if (syncData.groove.snareMask !== undefined) groove.snareMask = syncData.groove.snareMask;
                        }
                        if (syncData.playback) Object.assign(playback, syncData.playback);
                    }
                    
                    bbBufferHead = data.step; sbBufferHead = data.step; cbBufferHead = data.step; hbBufferHead = data.step;
                    soloist.isResting = false; soloist.busySteps = 0; soloist.currentPhraseSteps = 0;
                    soloist.sessionSteps = 0;
                    soloist.deviceBuffer = [];
                    bass.busySteps = 0;
                    soloist.motifBuffer = []; soloist.hookBuffer = []; soloist.isReplayingMotif = false;
                    soloist.sharedHookBuffer = [];
                    harmony.motifBuffer = [];
                    harmony.lastMidis = [];
                    
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
                case WORKER_MSG.EXPORT: handleExport(data); break;
            }
        } catch (err) { postMessage({ type: WORKER_RESP.ERROR, data: err.message, stack: err.stack }); }
    };
}

export function handleResolution(step, requestTimestamp = null, processStartTime = null) {
    const notesToMain = generateResolutionNotes(step, arranger, { bass: bass.enabled, chords: chords.enabled, soloist: soloist.enabled, harmony: harmony.enabled, groove: groove.enabled }, playback.bpm);
    var workerProcessTime = processStartTime ? performance.now() - processStartTime : 0;
    postMessage({ type: WORKER_RESP.NOTES, notes: notesToMain, requestTimestamp, workerProcessTime });
}

function handlePrime(steps) {
    if (!soloist.enabled || arranger.totalSteps === 0) return;
    
    // Default to 2 full loops of the progression to establish firm musical context
    const stepsToPrime = steps || (arranger.totalSteps * 2);
    
    if (playback.workerLogging) {
        console.log(`[Worker] Priming engine for ${stepsToPrime} steps...`);
    }

    // Reset soloist state for priming
    soloist.isResting = false;
    soloist.busySteps = 0;
    bass.busySteps = 0;
    soloist.currentPhraseSteps = 0;
    soloist.motifBuffer = [];
    soloist.hookBuffer = [];
    soloist.isReplayingMotif = false;

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
                        { sectionStart, sectionEnd }
                    );
                    if (bassResult && (bassResult.freq || bassResult.midi)) {
                         if (!bassResult.freq) bassResult.freq = 440 * Math.pow(2, (bassResult.midi - 69) / 12);
                         bass.lastFreq = bassResult.freq;
                    }
                }
            }

            // 2. Prime Soloist
            const { sectionStart, sectionEnd } = chordData;
            // Manually increment sessionSteps for priming logic
            soloist.sessionSteps = (soloist.sessionSteps || 0) + 1;
            
            const soloResult = getSoloistNote(
                chord, 
                nextChordData?.chord, 
                s, 
                soloist.lastFreq, 
                soloist.octave, 
                soloist.style, 
                stepInChord,
                true,
                { sectionStart, sectionEnd }
            );
            
            if (soloResult) {
                const results = Array.isArray(soloResult) ? soloResult : [soloResult];
                results.forEach(res => {
                    if (res.freq || res.midi) {
                         if (!res.freq) res.freq = 440 * Math.pow(2, (res.midi - 69) / 12);
                         if (!res.isDoubleStop) soloist.lastFreq = res.freq;
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
    soloist.busySteps = 0;
    bass.busySteps = 0;
    soloist.sessionSteps = 0;
}
