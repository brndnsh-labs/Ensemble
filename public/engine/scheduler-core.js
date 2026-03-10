import { draw } from '../animation-loop.js';
import {
    checkSectionTransition,
    conductorState,
    updateAutoConductor,
    updateLarsTempo,
} from '../conductor.js';
import { TIME_SIGNATURES } from '../config.js';
import { DRUM_PRESETS } from '../data/drum-presets.js';
import { flushBuffers, loadDrumPreset } from '../instrument-controller.js';
import {
    normalizeMidiVelocity,
    panic,
    sendMIDICC,
    sendMIDIDrum,
    sendMIDINote,
    sendMIDITransport,
} from '../midi-controller.js';
import {
    activateWakeLock,
    deactivateWakeLock,
    initPlatform,
    lockAudio,
    unlockAudio,
} from '../platform.js';
import { getSoloistNote } from '../soloist.js';
import { dispatch, getState } from '../state.js';
import { ACTIONS } from '../types.js';
import { triggerFlash } from '../ui.js';
import { getFrequency, getMidi, getStepInfo, getStepsPerMeasure, midiToNote } from '../utils.js';
import {
    flushWorker,
    requestBuffer,
    requestResolution,
    startWorker,
    stopWorker,
    syncWorker,
} from '../worker-client.js';
import {
    initAudio,
    killAllNotes,
    killHarmonyNote,
    playBassNote,
    playDrumSound,
    playHarmonyNote,
    playNote,
    playSoloNote,
    restoreGains,
    updateSustain,
} from './engine.js';
import { applyGrooveOverrides, calculatePocketOffset } from './groove-engine.js';

const DRUM_VIS_PITCHES = {
    Kick: 36,
    Snare: 38,
    HiHat: 42,
    ClosedHat: 42,
    Open: 46,
    OpenHat: 46,
    Ride: 51,
    Crash: 49,
    TomHi: 50,
    TomMid: 47,
    TomLow: 45,
    Rimshot: 37,
    Clap: 39,
    Shaker: 70,
    Cowbell: 56,
};

// Initialize platform-specific hacks (iOS Audio, WakeLock state)
initPlatform();

/**
 * Toggles the playback state of the session.
 * Handles audio context suspension/resumption, worker synchronization,
 * and global state updates for starting or stopping the engine.
 *
 * @param {Object} [viz] - Optional visualizer instance override.
 * @param {boolean} [fromDispatch=false] - Whether this call originated from a Redux-like dispatch.
 */
export function togglePlay(viz, fromDispatch = false) {
    const { playback, arranger, chords } = getState();
    const activeViz = viz || playback.viz;

    // Determine if we are STARTING or STOPPING based on current state.
    // If fromDispatch is true, isPlaying ALREADY reflects the target state.
    const isStopping = fromDispatch ? !playback.isPlaying : playback.isPlaying;

    if (isStopping) {
        if (!fromDispatch) {
            playback.isPlaying = false;
        }
        if (playback.autoIntensity) {
            conductorState.target = 0.35;
        }
        stopWorker();
        lockAudio();
        deactivateWakeLock();
        playback.drawQueue = [];
        playback.lastActiveDrumElements = null;
        chords.lastActiveChordIndex = null;
        chords.scheduledChordIndex = null;
        playback.resolutionTriggered = false;
        playback.isScheduling = false;
        dispatch(ACTIONS.SET_ENDING_PENDING, false);
        dispatch(ACTIONS.SET_STOP_AT_END, false);
        if (activeViz) {
            activeViz.clear();
        }
        dispatch('VIS_RESET');
        killAllNotes();
        panic(true); // Full MIDI reset
        sendMIDITransport('stop', playback.audio?.currentTime || 0);
        flushBuffers();

        if (playback.audio) {
            if (playback.suspendTimeout) {
                clearTimeout(playback.suspendTimeout);
            }
            playback.suspendTimeout = setTimeout(() => {
                if (!playback.isPlaying && playback.audio.state === 'running') {
                    playback.audio.suspend();
                }
            }, 3000);
        }
    } else {
        if (playback.suspendTimeout) {
            clearTimeout(playback.suspendTimeout);
        }
        initAudio();

        if (playback.audio && playback.audio.state === 'suspended') {
            playback.audio.resume();
        }

        if (!fromDispatch) {
            playback.isPlaying = true;
            playback.sessionStartTime = performance.now();
        }

        if (playback.autoIntensity) {
            conductorState.target = 0.35;
        }

        playback.step = 0;
        playback.resolutionTriggered = false;
        playback.isScheduling = false;
        chords.scheduledChordIndex = 0;
        dispatch(ACTIONS.RESET_SESSION); // Reset warm-up counters
        dispatch(ACTIONS.SET_ENDING_PENDING, false);
        syncWorker();
        const primeSteps = arranger.totalSteps > 0 ? arranger.totalSteps * 2 : 0;
        flushBuffers(primeSteps);

        unlockAudio();
        restoreGains();
        const startTime = playback.audio.currentTime + 0.1;
        playback.nextNoteTime = startTime;
        playback.unswungNextNoteTime = startTime;
        playback.isCountingIn = playback.countIn;
        playback.countInBeat = 0;
        activateWakeLock();
        if (activeViz) {
            activeViz.setBeatReference(playback.nextNoteTime);
        }
        if (!playback.isDrawing) {
            playback.isDrawing = true;
            requestAnimationFrame(() => draw(activeViz));
        }

        // Initial MIDI cleanup
        panic(true);
        sendMIDITransport('start', startTime);

        startWorker();
        scheduler();
    }
}

function triggerResolution(time) {
    const { playback, bass, soloist, chords, harmony, groove } = getState();

    // 0. Clear all buffers to prevent "double hits" from pre-fetched notes
    // The worker might have already sent normal notes for the wrap-around step.
    bass.buffer.clear();
    soloist.buffer.clear();
    chords.buffer.clear();
    harmony.buffer.clear();
    groove.buffer.clear();

    // 1. Tell worker to generate resolution
    requestResolution(playback.step);

    // 2. We'll wait for the notes to come back via the worker-client callback
    // The worker-client already handles incoming 'notes' and puts them in buffers.
    // We just need to wait a few ms and then schedule them.
    setTimeout(() => {
        scheduleResolution(time);
    }, 50);
}

function scheduleResolution(time) {
    const { playback, bass, soloist, chords, harmony, groove } = getState();
    // Schedule the final resolution measure (Tonic chord, Kick+Crash, etc.)
    const effectiveBpm = playback.bpm + (conductorState.larsBpmOffset || 0);
    const spb = 60.0 / effectiveBpm;
    const measureDuration = 8 * spb; // Ring out for 2 bars (approx 5-6s)

    // 1. Schedule all instruments that came from the worker (Bass, Chords, Soloist, Harmony, Groove)
    // The worker-client puts these in track buffers.
    // Create a dummy chord data for visuals
    const dummyChordData = { chord: { freqs: [] } };

    if (bass.enabled) {
        scheduleBass(dummyChordData, playback.step, time);
    }
    if (soloist.enabled) {
        scheduleSoloist(dummyChordData, playback.step, time, time);
    }
    if (chords.enabled) {
        scheduleChords(dummyChordData, playback.step, time);
    }
    if (harmony.enabled) {
        scheduleHarmonies(dummyChordData, playback.step, time);
    }
    if (groove.enabled) {
        scheduleDrumsFromBuffer(playback.step, time);
    }

    // 2. Add a final flash
    if (playback.visualFlash) {
        triggerFlash(0.4);
    }

    // 3. Graceful Sustain Release (at 1.5 bars)
    setTimeout(
        () => {
            if (playback.isPlaying) {
                updateSustain(false);
            }
        },
        6 * spb * 1000,
    );

    // 4. Stop playback after the full ring-out (2 bars)
    setTimeout(() => {
        if (playback.isPlaying) {
            dispatch(ACTIONS.TOGGLE_PLAY);
        }
    }, measureDuration * 1000);
}

/**
 * Main scheduling loop.
 * Looks ahead by `playback.scheduleAheadTime` and schedules notes for all enabled instruments.
 * Handles count-in, session timing, and resolution triggers.
 */
export function scheduler() {
    const { playback, groove, arranger } = getState();
    if (playback.isScheduling || !playback.isPlaying) {
        return;
    }
    playback.isScheduling = true;

    try {
        requestBuffer(playback.step);

        // Update genre UI (countdowns)
        if (groove.pendingGenreFeel) {
            const stepsPerMeasure = getStepsPerMeasure(arranger.timeSignature);
            const stepsRemaining = stepsPerMeasure - (playback.step % stepsPerMeasure);
            const beatsRemaining = Math.ceil(stepsRemaining / 4);

            if (groove.genreSwitchCountdown !== beatsRemaining) {
                dispatch(ACTIONS.SET_GENRE_COUNTDOWN, beatsRemaining);
            }
        } else if (groove.genreSwitchCountdown !== null) {
            dispatch(ACTIONS.SET_GENRE_COUNTDOWN, null);
        }

        while (playback.nextNoteTime < playback.audio.currentTime + playback.scheduleAheadTime) {
            if (playback.isCountingIn) {
                scheduleCountIn(playback.countInBeat, playback.nextNoteTime);
                advanceCountIn();
            } else {
                const spm = getStepsPerMeasure(arranger.timeSignature);

                // --- Session Timer Check ---
                if (playback.songMode && playback.sessionTimer > 0 && !playback.isEndingPending) {
                    const elapsedMins = (performance.now() - playback.sessionStartTime) / 60000;
                    if (elapsedMins >= playback.sessionTimer) {
                        dispatch(ACTIONS.SET_ENDING_PENDING, true);
                    }
                }

                // --- Resolution Trigger Logic ---
                // If ending is pending or stopAtEnd is active, check for appropriate boundary (Next Chorus)
                if (playback.step > 0 && playback.step % arranger.totalSteps === 0) {
                    playback.currentLoopCount++;

                    // --- Loop Limit Check ---
                    if (playback.songMode && playback.loopLimit > 0 && !playback.isEndingPending) {
                        if (playback.currentLoopCount >= playback.loopLimit) {
                            dispatch(ACTIONS.SET_ENDING_PENDING, true);
                        }
                    }

                    if (
                        playback.isEndingPending ||
                        playback.stopAtEnd ||
                        playback.resolutionTriggered
                    ) {
                        if (!playback.resolutionTriggered) {
                            playback.resolutionTriggered = true;
                            playback.stopAtEnd = false;
                            triggerResolution(playback.nextNoteTime);
                        }
                        return; // Stop scheduling
                    }
                }

                if (playback.step % spm === 0 && groove.pendingGenreFeel) {
                    applyPendingGenre();
                }

                scheduleGlobalEvent(playback.step, playback.nextNoteTime);
                advanceGlobalStep();
            }
        }
    } finally {
        const { playback: pb } = getState();
        pb.isScheduling = false;
    }
}

function applyPendingGenre() {
    const { groove, playback } = getState();
    const payload = groove.pendingGenreFeel;
    if (!payload) {
        return;
    }

    groove.genreFeel = payload.feel;
    if (payload.swing !== undefined) {
        groove.swing = payload.swing;
    }
    if (payload.sub !== undefined) {
        groove.swingSub = payload.sub;
    }
    if (payload.genreName) {
        groove.lastSmartGenre = payload.genreName;
    }

    if (payload.drum) {
        loadDrumPreset(payload.drum);
    }

    groove.pendingGenreFeel = null;

    playback.nextNoteTime = playback.unswungNextNoteTime;

    syncAndFlushWorker(playback.step);
    triggerFlash(0.15);
}

function advanceCountIn() {
    const { playback, arranger } = getState();
    const effectiveBpm = playback.bpm + (conductorState.larsBpmOffset || 0);
    const beatDuration = 60.0 / effectiveBpm;
    playback.nextNoteTime += beatDuration;
    playback.unswungNextNoteTime += beatDuration;
    playback.countInBeat++;
    const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    if (playback.countInBeat >= ts.beats) {
        playback.isCountingIn = false;
        playback.step = 0;
    }
}

function scheduleCountIn(beat, time) {
    const { playback, arranger, soloist } = getState();
    if (playback.visualFlash) {
        playback.drawQueue.push({ type: 'flash', time: time, intensity: 0.3, beat: 1 });
    }
    const osc = playback.audio.createOscillator();
    const gain = playback.audio.createGain();
    osc.connect(gain);
    gain.connect(playback.masterGain);
    const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    let freq = 440;
    if (beat === 0) {
        freq = 1000;
    } else if (ts.grouping && ts.grouping.length > 1) {
        let accumulated = 0;
        for (const g of ts.grouping) {
            if (beat === accumulated && beat !== 0) {
                freq = 800;
                break;
            }
            accumulated += g;
        }
    } else {
        if (beat === 0) {
            freq = 1000;
        } else if (ts.beats % 2 === 0 && beat === ts.beats / 2) {
            freq = 800; // Medium click for half-measure in simple meters (e.g., beat 2 in 4/4)
        } else if (ts.stepsPerBeat === 3 && beat % 3 === 0 && beat !== 0) {
            freq = 800; // Medium click for macro beats in compound meters (e.g. beat 3 in 6/8, beat 3/6/9 in 12/8)
        }
    }
    osc.frequency.setValueAtTime(freq, time);
    gain.gain.setValueAtTime(0.3, time);
    gain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);
    osc.onended = () => {
        gain.disconnect();
        osc.disconnect();
    };
    osc.start(time);
    osc.stop(time + 0.1);

    // --- Soloist Pick-up Support ---
    const pickupStep = (beat - ts.beats) * ts.stepsPerBeat;
    const firstChord = arranger.stepMap?.[0]?.chord || {
        rootMidi: 60,
        scale: [0, 2, 4, 5, 7, 9, 11],
        intervals: [0, 4, 7],
    };
    const pickupStepInfo = getStepInfo(pickupStep, ts, null, TIME_SIGNATURES);

    const soloistNote = getSoloistNote(
        firstChord,
        firstChord,
        pickupStep,
        soloist.lastFreq,
        soloist.octave,
        soloist.style,
        0,
        false,
        { sectionStart: 0, sectionEnd: arranger.totalSteps, bypassRhythm: false },
        pickupStepInfo,
    );

    if (soloistNote) {
        const results = Array.isArray(soloistNote) ? soloistNote : [soloistNote];
        results.forEach((res) => {
            const freq = res.freq || getFrequency(res.midi);
            const duration = (res.durationSteps || 4) * 0.25 * (60.0 / playback.bpm);

            playSoloNote(
                freq,
                time,
                duration,
                res.velocity,
                res.bendStartInterval || 0,
                soloist.style,
                false,
                res.vibrato,
            );
            sendMIDINote('Soloist', res.midi, res.velocity, time, res.duration || 0.25);
            playback.drawQueue.push({
                type: 'note',
                track: 'soloist',
                midi: res.midi,
                time: time,
                velocity: res.velocity,
            });
        });
    }
}

function advanceGlobalStep() {
    const { playback, groove, arranger } = getState();
    updateLarsTempo(playback.step);
    const effectiveBpm = playback.bpm + (conductorState.larsBpmOffset || 0);
    const sixteenth = 0.25 * (60.0 / effectiveBpm);
    let duration = sixteenth;
    if (groove.swing > 0) {
        // Find current time signature for swing logic
        const sInfo = getStepInfo(
            playback.step,
            TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'],
            arranger.measureMap,
            TIME_SIGNATURES,
        );
        const ts = TIME_SIGNATURES[sInfo.tsName] || TIME_SIGNATURES['4/4'];
        if (ts.stepsPerBeat === 4) {
            const shift = (sixteenth / 3) * (groove.swing / 100);
            duration +=
                groove.swingSub === '16th'
                    ? playback.step % 2 === 0
                        ? shift
                        : -shift
                    : playback.step % (ts.stepsPerBeat * 1) < ts.stepsPerBeat / 2
                      ? shift
                      : -shift; // 8th note swing logic generalized for any meter with 4 steps per beat
        } else if (ts.stepsPerBeat === 3) {
            const shift = (sixteenth / 3) * (groove.swing / 100);
            duration +=
                groove.swingSub === '16th'
                    ? playback.step % 2 === 0
                        ? shift
                        : -shift // 16th note swing over compound meters doesn't map exactly to '8th note' logic the same way
                    : playback.step % ts.stepsPerBeat === 0
                      ? shift // on macro beat
                      : playback.step % ts.stepsPerBeat === 2
                        ? -shift // 3rd triplet part
                        : 0; // middle triplet stays same or slightly nudged based on deeper logic, simple offset for now
        }
    }
    playback.nextNoteTime += duration;
    playback.unswungNextNoteTime += sixteenth;
    playback.step++; // @direct-mutation
}

function getChordAtStep(step) {
    const { arranger, chords } = getState();
    if (arranger.totalSteps === 0) {
        return null;
    }
    const targetStep = step % arranger.totalSteps;

    // Reset cursor if we are looping back
    const lastStep = arranger.stepMap[chords.scheduledChordIndex || 0]?.start || 0;
    if (targetStep < lastStep) {
        chords.scheduledChordIndex = 0; // @direct-mutation
    }

    const startI = chords.scheduledChordIndex || 0;
    for (let i = startI; i < arranger.stepMap.length; i++) {
        const entry = arranger.stepMap[i];
        if (targetStep >= entry.start && targetStep < entry.end) {
            chords.scheduledChordIndex = i; // @direct-mutation
            return { chord: entry.chord, stepInChord: targetStep - entry.start, chordIndex: i };
        }
    }
    return null;
}

/**
 * Schedules drum sounds for a specific step.
 * Applies pocket/timing offsets, handles fills, and pushes events to the visualizer queue.
 *
 * @param {number} step - The local drum loop step (0-15 etc).
 * @param {number} time - The AudioContext time to play.
 * @param {boolean} isDownbeat - Whether this step is the start of a measure.
 * @param {boolean} isQuarter - Whether this step is a beat start.
 * @param {boolean} isBackbeat - Whether this step is a backbeat (2 or 4).
 * @param {number} absoluteStep - The global session step.
 * @param {boolean} isGroupStart - Whether this step is the start of a rhythm group.
 * @param {string} sectionId - The ID of the current song section.
 */
function scheduleDrums(params) {
    const {
        step,
        time,
        isDownbeat,
        isBeatStart,
        isBackbeat,
        absoluteStep,
        isGroupStart,
        sectionId,
        beatIndex,
        isOffbeat,
        isEOfBeat,
        isAOfBeat,
        tsConfig,
        isTurnaround,
    } = params;

    const { playback, groove, vizState, midi, arranger } = getState();
    const conductorVel = playback.conductorVelocity || 1.0;
    const finalTime = time + calculatePocketOffset(playback, groove);
    const stepsPerBar = getStepsPerMeasure(arranger.timeSignature);

    // ... (fill logic) ...
    if (groove.fillActive) {
        const fillStep = absoluteStep - groove.fillStartStep;
        if (fillStep >= groove.fillLength) {
            dispatch(ACTIONS.SET_PARAM, { module: 'groove', param: 'fillActive', value: false });
            if (groove.pendingCrash) {
                playDrumSound('Crash', finalTime, 1.1 * conductorVel);
                groove.pendingCrash = false;
            }
        }
    }

    if (groove.fillActive) {
        const fillStep = absoluteStep - groove.fillStartStep;
        if (fillStep >= 0 && fillStep < groove.fillLength) {
            if (playback.bandIntensity >= 0.5 || fillStep >= groove.fillLength / 2) {
                const notes = groove.fillSteps[fillStep];
                if (notes && notes.length > 0) {
                    if (vizState.enabled && playback.viz) {
                        playback.drawQueue.push({
                            type: 'fill_active',
                            time: finalTime,
                            active: true,
                        });
                    }
                    notes.forEach((note) => {
                        playDrumSound(note.name, finalTime, note.vel * conductorVel);

                        if (vizState.enabled && playback.viz) {
                            const midiNum = DRUM_VIS_PITCHES[note.name] || 36;
                            playback.drawQueue.push({
                                type: 'drums_vis',
                                midi: midiNum,
                                time: finalTime,
                                velocity: note.vel * conductorVel,
                                duration: 0.1,
                            });
                        }
                    });
                    return;
                }
            }
        }
    } else if (vizState.enabled && playback.viz) {
        // Ensure fill visual state is cleared when fill is not active
        playback.drawQueue.push({ type: 'fill_active', time: finalTime, active: false });
    }

    // --- MULTI-SEED LIVE LOGIC ---
    const seedIdx = groove.sectionSeedMap && sectionId ? groove.sectionSeedMap[sectionId] || 0 : 0;
    const preset = DRUM_PRESETS[groove.lastDrumPreset];

    groove.instruments.forEach((inst) => {
        let stepVal = inst.steps[step];

        // If creativity is on and we have a valid preset variation, override the step value
        if (groove.creativity && preset && preset.variations && preset.variations[seedIdx]) {
            const varInst = preset.variations[seedIdx][inst.name];
            if (varInst) {
                stepVal = varInst[step];
            }
        }

        const { shouldPlay, velocity, soundName, instTimeOffset } = applyGrooveOverrides({
            step: absoluteStep,
            inst,
            stepVal,
            playback,
            groove,
            isDownbeat,
            isBeatStart,
            isBackbeat,
            isGroupStart,
            beatIndex,
            isOffbeat,
            isEOfBeat,
            isAOfBeat,
            tsConfig,
            isTurnaround,
            stepsPerBar,
            loopStep: step, // scheduleDrums 'step' is the local drum loop step
        });

        if (shouldPlay && !inst.muted) {
            const playTime = finalTime + instTimeOffset;
            playDrumSound(soundName, playTime, velocity * conductorVel);

            if (vizState.enabled && playback.viz) {
                const midiNum = DRUM_VIS_PITCHES[soundName] || 36;
                playback.drawQueue.push({
                    type: 'drums_vis',
                    midi: midiNum,
                    time: playTime,
                    velocity: velocity * conductorVel,
                    duration: 0.1,
                });
            }

            sendMIDIDrum(
                soundName,
                playTime,
                Math.min(1.0, velocity * conductorVel),
                midi.drumsOctave,
            );
        }
    });
}

/**
 * Schedules drum notes directly from the worker buffer (for Resolution or pattern playback).
 *
 * @param {number} step - The global step index.
 * @param {number} time - The AudioContext time to play.
 */
function scheduleDrumsFromBuffer(step, time) {
    const { groove, playback, vizState, midi } = getState();
    const notes = groove.buffer.get(step);
    groove.buffer.delete(step);

    if (notes && notes.length > 0) {
        const conductorVel = playback.conductorVelocity || 1.0;

        notes.forEach((n) => {
            const { name, velocity, timingOffset } = n;
            const playTime = time + (timingOffset || 0);

            playDrumSound(name, playTime, velocity * conductorVel);

            if (vizState.enabled && playback.viz) {
                const midiNum = DRUM_VIS_PITCHES[name] || 36;
                playback.drawQueue.push({
                    type: 'drums_vis',
                    midi: midiNum,
                    time: playTime,
                    velocity: velocity * conductorVel,
                    duration: 0.1,
                });
            }

            sendMIDIDrum(name, playTime, Math.min(1.0, velocity * conductorVel), midi.drumsOctave);
        });
    }
}

/**
 * Schedules bass notes from the worker buffer.
 *
 * @param {Object} chordData - The current chord context.
 * @param {number} step - The global step index.
 * @param {number} time - The AudioContext time to play.
 */
function scheduleBass(chordData, step, time) {
    const { bass, playback, vizState, midi } = getState();
    const notes = bass.buffer.get(step);
    bass.buffer.delete(step);

    if (notes && notes.length > 0) {
        notes.forEach((noteEntry) => {
            if (noteEntry?.freq) {
                const { freq, durationSteps, velocity, timingOffset, muted } = noteEntry;
                const { chord } = chordData;
                const adjustedTime = time + (timingOffset || 0);
                bass.lastPlayedFreq = freq;
                const midiNum = getMidi(freq);
                const { name, octave } = midiToNote(midiNum);
                const spb = 60.0 / playback.bpm;
                const duration = (durationSteps || 4) * 0.25 * spb;
                const finalVel = (velocity || 1.0) * (playback.conductorVelocity || 1.0);
                if (vizState.enabled && playback.viz) {
                    playback.viz.truncateNotes('bass', adjustedTime);

                    const fLen = chord.freqs.length;
                    const chordNotes = new Array(fLen);
                    for (let i = 0; i < fLen; i++) {
                        chordNotes[i] = getMidi(chord.freqs[i]);
                    }

                    playback.drawQueue.push({
                        type: 'bass_vis',
                        name,
                        octave,
                        midi: midiNum,
                        time: adjustedTime,
                        chordNotes,
                        duration,
                    });
                }
                playBassNote(freq, adjustedTime, duration, finalVel, muted);
                if (!muted) {
                    // Bass is strictly monophonic, so we force Mono mode to kill previous notes
                    sendMIDINote(
                        midi.bassChannel,
                        midiNum + midi.bassOctave * 12,
                        normalizeMidiVelocity(finalVel),
                        adjustedTime,
                        duration,
                        true,
                    );
                }
            }
        });
    }
}

/**
 * Schedules soloist (melody) notes from the worker buffer.
 * Handles monophonic/polyphonic modes, bends, and MIDI output.
 *
 * @param {Object} chordData - The current chord context.
 * @param {number} step - The global step index.
 * @param {number} time - The AudioContext time (swung).
 * @param {number} unswungTime - The AudioContext time (linear/unswung) for strict quantization.
 */
function scheduleSoloist(chordData, step, _time, unswungTime) {
    const { soloist, playback, vizState, midi } = getState();
    const notes = soloist.buffer.get(step);
    soloist.buffer.delete(step);

    if (notes && notes.length > 0) {
        if (playback.debugSoloist) {
            console.log(
                `[Soloist Debug] Step ${step}: Scheduling ${notes.length} notes from buffer`,
            );
        }
        // Optimization: Avoid allocation if we only play one note (Common case)
        let notesToPlay = notes;
        if (soloist.mode === 'monophonic' && notes.length > 1) {
            notesToPlay = [notes[0]];
        }

        // Power-compensation for double stops: Scale volume by 1/sqrt(N)
        let numVoices = 0;
        for (let i = 0; i < notesToPlay.length; i++) {
            if (notesToPlay[i].freq) {
                numVoices++;
            }
        }
        const polyphonyComp = 1 / Math.sqrt(Math.max(1, numVoices));

        notesToPlay.forEach((noteEntry) => {
            if (noteEntry?.freq) {
                const {
                    freq,
                    durationSteps,
                    velocity,
                    bendStartInterval,
                    style,
                    timingOffset,
                    noteType,
                    vibrato,
                } = noteEntry;
                const { chord } = chordData;
                const offsetS = timingOffset || 0;

                if (!noteEntry.isDoubleStop) {
                    soloist.lastPlayedFreq = freq; // @direct-mutation
                }

                const midiNum = noteEntry.midi || getMidi(freq);
                const { name, octave } = midiToNote(midiNum);
                const spb = 60.0 / playback.bpm;
                const duration = (durationSteps || 4) * 0.25 * spb;
                const baseVel = (velocity || 1.0) * (playback.conductorVelocity || 1.0);
                const vel = baseVel * polyphonyComp;
                const playTime = unswungTime + offsetS;

                playSoloNote(
                    freq,
                    playTime,
                    duration,
                    vel,
                    bendStartInterval || 0,
                    style,
                    false,
                    vibrato,
                );

                // Soloist is monophonic UNLESS double stops are enabled
                const isMono = soloist.mode === 'monophonic';

                // Support Pitch Bend for MIDI scoops
                let bend = 0;
                if (bendStartInterval !== 0) {
                    // Map semitones to 14-bit value (-8192 to 8191)
                    // Assuming standard 2-semitone range.
                    bend = Math.round(-(bendStartInterval / 2) * 8192);
                }

                sendMIDINote(
                    midi.soloistChannel,
                    midiNum + midi.soloistOctave * 12,
                    normalizeMidiVelocity(vel),
                    playTime,
                    duration,
                    { isMono, bend },
                );

                if (vizState.enabled && playback.viz) {
                    if (isMono) {
                        playback.viz.truncateNotes('soloist', playTime);
                    }

                    const fLen = chord.freqs.length;
                    const chordNotes = new Array(fLen);
                    for (let i = 0; i < fLen; i++) {
                        chordNotes[i] = getMidi(chord.freqs[i]);
                    }

                    playback.drawQueue.push({
                        type: 'soloist_vis',
                        name,
                        octave,
                        midi: midiNum,
                        time: playTime,
                        chordNotes,
                        duration,
                        noteType,
                    });
                }
                soloist.lastNoteEnd = playTime + duration; // @direct-mutation
            }
        });
    }
}

export function scheduleChordVisuals(chordData, t) {
    const { playback } = getState();
    if (chordData.stepInChord === 0) {
        const freqs = chordData.chord.freqs;
        const fLen = freqs.length;
        const chordNotes = new Array(fLen);
        for (let i = 0; i < fLen; i++) {
            chordNotes[i] = getMidi(freqs[i]);
        }

        // Push visual event for UI highlighting, even if canvas viz is disabled
        playback.drawQueue.push({
            type: 'chord_vis',
            time: t,
            index: chordData.chordIndex,
            chordNotes,
            rootMidi: chordData.chord.rootMidi,
            intervals: chordData.chord.intervals,
            duration: chordData.chord.beats * (60 / playback.bpm),
        });

        if (playback.visualFlash) {
            triggerFlash(0.1);
        }
    }
}

/**
 * Schedules chord notes from the worker buffer.
 * Handles sustain pedal events (MIDI CC 64).
 *
 * @param {Object} chordData - The current chord context.
 * @param {number} step - The global step index.
 * @param {number} time - The AudioContext time to play.
 */
function scheduleChords(_chordData, step, time) {
    const { chords, playback, midi } = getState();
    const notes = chords.buffer.get(step);
    chords.buffer.delete(step);

    if (notes && notes.length > 0) {
        const spb = 60.0 / playback.bpm;
        // Count how many non-muted notes are in this step for volume normalization
        let numVoices = 0;
        for (let i = 0; i < notes.length; i++) {
            if (!notes[i].muted && notes[i].freq) {
                numVoices++;
            }
        }

        notes.forEach((n) => {
            const {
                freq,
                velocity,
                timingOffset,
                durationSteps,
                muted,
                instrument,
                dry,
                ccEvents,
            } = n;
            const playTime = time + (timingOffset || 0);

            if (ccEvents && ccEvents.length > 0) {
                ccEvents.forEach((cc) => {
                    if (cc.controller === 64) {
                        const isSustain = cc.value >= 64;
                        const ccTime = playTime + (cc.timingOffset || 0);
                        updateSustain(isSustain, ccTime);
                        sendMIDICC(midi.chordsChannel, 64, cc.value, ccTime);
                    }
                });
            }

            if (!muted && freq) {
                const duration = (durationSteps || 1) * 0.25 * spb;
                playNote(freq, playTime, duration, {
                    vol: velocity,
                    index: 0,
                    instrument: instrument || 'Piano',
                    dry: dry,
                    numVoices: numVoices,
                });
                sendMIDINote(
                    midi.chordsChannel,
                    getMidi(freq) + midi.chordsOctave * 12,
                    normalizeMidiVelocity(velocity),
                    playTime,
                    duration,
                );
            }
        });
    }
}

/**
 * Schedules harmony notes (pads, stabs) from the worker buffer.
 * Handles voice killing for smoother transitions.
 *
 * @param {Object} chordData - The current chord context.
 * @param {number} step - The global step index.
 * @param {number} time - The AudioContext time to play.
 */
function scheduleHarmonies(_chordData, step, time) {
    const { harmony, playback, vizState, midi } = getState();
    const notes = harmony.buffer.get(step);
    harmony.buffer.delete(step);

    if (notes && notes.length > 0) {
        const spb = 60.0 / playback.bpm;

        // If any note in this step is a chord start or movement,
        // clear previous voices once before scheduling the new ones.
        const starter = notes.find((n) => n.isChordStart);
        if (starter) {
            killHarmonyNote(starter.killFade || 0.05);
        }

        // Power-compensation for multiple voices: Scale volume by 1/sqrt(N)
        // Optimization: Count voices without array allocation
        let numVoices = 0;
        for (let i = 0; i < notes.length; i++) {
            if (notes[i].freq || notes[i].midi) {
                numVoices++;
            }
        }
        const polyphonyComp = 1 / Math.sqrt(Math.max(1, numVoices));

        notes.forEach((n) => {
            const {
                freq,
                velocity,
                timingOffset,
                durationSteps,
                midi: noteMidi,
                style,
                slideInterval,
                slideDuration,
                vibrato,
            } = n;
            const playTime = time + (timingOffset || 0);
            const m = noteMidi || getMidi(freq);

            if (freq || m) {
                const duration = (durationSteps || 1) * 0.25 * spb;
                const baseVel = velocity * (playback.conductorVelocity || 1.0);
                const finalVel = baseVel * polyphonyComp;

                playHarmonyNote(
                    freq || 440,
                    playTime,
                    duration,
                    finalVel,
                    style,
                    m,
                    slideInterval,
                    slideDuration,
                    vibrato,
                );
                sendMIDINote(
                    midi.harmonyChannel,
                    m + midi.harmonyOctave * 12,
                    normalizeMidiVelocity(finalVel),
                    playTime,
                    duration,
                );

                if (vizState.enabled && playback.viz) {
                    const { name, octave } = midiToNote(m);
                    playback.drawQueue.push({
                        type: 'harmony_vis',
                        name,
                        octave,
                        midi: m,
                        time: playTime,
                        duration,
                    });
                }
            }
        });
    }
}

/**
 * Orchestrates global events for the current step.
 * Updates conductor state, triggers MIDI automation, rhythm section masking, and metronome.
 *
 * @param {number} step - The global step index.
 * @param {number} swungTime - The swung AudioContext time.
 */
export function scheduleGlobalEvent(step, swungTime) {
    const { arranger, playback, groove, soloist, midi, chords, bass, harmony } = getState();
    const globalTS = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepInfo = getStepInfo(step, globalTS, arranger.measureMap, TIME_SIGNATURES);
    const ts = TIME_SIGNATURES[stepInfo.tsName] || globalTS;

    updateAutoConductor();

    // --- NEW: Rhythm Section Mask Calculation ---
    // Extract the snare pattern for the current measure to share with the ensemble
    const spm = getStepsPerMeasure(stepInfo.tsName);
    if (step % spm === 0) {
        let snareMask = 0;
        const snare = groove.instruments.find((i) => i.name === 'Snare');
        if (snare) {
            for (let i = 0; i < spm; i++) {
                if (snare.steps[i] > 0) {
                    snareMask |= 1 << i;
                }
            }
        }
        if (groove.snareMask !== snareMask) {
            groove.snareMask = snareMask;
            // Immediate sync to worker so harmony module can "hear" the new drum pattern
            syncWorker(ACTIONS.SET_PARAM, {
                module: 'groove',
                param: 'snareMask',
                value: snareMask,
            });
        }
    }

    checkSectionTransition(step, spm);

    // MIDI Automation
    if (midi.enabled && midi.selectedOutputId && stepInfo.isBeatStart) {
        const intensityCC = Math.floor(playback.bandIntensity * 127);
        const soloistTensionCC = Math.floor(soloist.tension * 127);

        sendMIDICC(midi.soloistChannel, 1, soloistTensionCC, swungTime);
        sendMIDICC(midi.soloistChannel, 11, intensityCC, swungTime);
        sendMIDICC(midi.chordsChannel, 11, intensityCC, swungTime);
        sendMIDICC(midi.bassChannel, 11, intensityCC, swungTime);
    }

    const drumStep = step % (groove.measures * spm);
    const t = swungTime + (Math.random() - 0.5) * (groove.humanize / 100) * 0.025;

    if (playback.metronome && stepInfo.isBeatStart) {
        let freq = stepInfo.isMeasureStart ? 1000 : stepInfo.isGroupStart ? 800 : 600;
        if (ts.beats % 2 === 0 && stepInfo.beatIndex === ts.beats / 2 && !stepInfo.isGroupStart) {
            freq = 800; // Accented middle beat for simple meters
        }

        const osc = playback.audio.createOscillator();
        const g = playback.audio.createGain();
        osc.connect(g);
        g.connect(playback.masterGain);
        osc.frequency.setValueAtTime(freq, swungTime);
        g.gain.setValueAtTime(0.15, swungTime);
        g.gain.exponentialRampToValueAtTime(0.001, swungTime + 0.05);
        osc.start(swungTime);
        osc.stop(swungTime + 0.05);
        osc.onended = () => {
            g.disconnect();
            osc.disconnect();
        };
    }

    const feel = groove.genreFeel;
    const straightness =
        feel === 'Reggae'
            ? 0.5
            : soloist.style === 'neo'
              ? 0.65
              : soloist.style === 'blues'
                ? 0.55
                : soloist.style === 'bossa'
                  ? 0.75
                  : 0.65;
    const soloistTime =
        playback.unswungNextNoteTime * straightness +
        swungTime * (1.0 - straightness) +
        (Math.random() - 0.5) * (groove.humanize / 100) * 0.025;

    if (groove.enabled) {
        if (stepInfo.isBeatStart && playback.visualFlash) {
            playback.drawQueue.push({
                type: 'flash',
                time: swungTime,
                intensity: stepInfo.isMeasureStart ? 0.2 : stepInfo.isGroupStart ? 0.15 : 0.1,
                beat: stepInfo.isMeasureStart ? 1 : 0,
            });
        }

        playback.drawQueue.push({ type: 'drum_vis', step: drumStep, time: swungTime });

        const chordDataForDrums = getChordAtStep(step);
        const sectionId = chordDataForDrums?.chord?.sectionId || null;

        // --- Port Turnaround Logic from Worker ---
        const stepsPerBar = spm;
        const entry = arranger.sectionMap?.find((e) => step >= e.start && step < e.end);
        let isTurnaround = false;
        if (groove.creativity) {
            let measuresInSection = 4;
            let startStep = 0;
            if (entry) {
                measuresInSection = Math.max(1, (entry.end - entry.start) / stepsPerBar);
                startStep = entry.start;
            }
            const barInSection = Math.floor((step - startStep) / stepsPerBar);
            // Use modulo for fallback (entry-less) turnaround logic, and suppress turnaround fills for 1-measure sections
            isTurnaround =
                measuresInSection > 1 && barInSection % measuresInSection === measuresInSection - 1;
        }

        scheduleDrums({
            step: drumStep,
            time: t,
            isDownbeat: stepInfo.isMeasureStart,
            isBeatStart: stepInfo.isBeatStart,
            isBackbeat: stepInfo.isBackbeat,
            absoluteStep: step,
            isGroupStart: stepInfo.isGroupStart,
            sectionId,
            beatIndex: stepInfo.beatIndex,
            isOffbeat: stepInfo.isOffbeat,
            isEOfBeat: stepInfo.isEOfBeat,
            isAOfBeat: stepInfo.isAOfBeat,
            tsConfig: stepInfo.tsConfig,
            isTurnaround,
        });
    }

    const chordData = getChordAtStep(step);
    if (chordData) {
        if (chordData.chord.key && chordData.chord.key !== playback.currentKey) {
            playback.currentKey = chordData.chord.key;
            window.dispatchEvent(
                new CustomEvent('key-change', { detail: { key: playback.currentKey } }),
            );
        }
        scheduleChordVisuals(chordData, t);
        if (bass.enabled) {
            scheduleBass(chordData, step, t);
        }
        if (soloist.enabled) {
            scheduleSoloist(chordData, step, t, soloistTime);
        }
        if (chords.enabled) {
            scheduleChords(chordData, step, t);
        }
        if (harmony.enabled) {
            scheduleHarmonies(chordData, step, t);
        }
    }
}

/**
 * Syncs current state parameters to the worker and flushes the note buffers.
 * Called when key parameters (genre, key, progression) change.
 *
 * @param {number} step - The current global step.
 */
function syncAndFlushWorker(step) {
    const { arranger, chords, bass, soloist, harmony, groove, playback } = getState();
    const syncData = {
        arranger: {
            progression: arranger.progression,
            stepMap: arranger.stepMap,
            sectionMap: arranger.sectionMap,
            totalSteps: arranger.totalSteps,
            key: arranger.key,
            isMinor: arranger.isMinor,
            timeSignature: arranger.timeSignature,
            grouping: arranger.grouping,
        },
        chords: {
            style: chords.style,
            octave: chords.octave,
            density: chords.density,
            enabled: chords.enabled,
            volume: chords.volume,
        },
        bass: {
            style: bass.style,
            octave: bass.octave,
            enabled: bass.enabled,
            lastFreq: bass.lastFreq,
            volume: bass.volume,
        },
        soloist: {
            style: soloist.style,
            octave: soloist.octave,
            enabled: soloist.enabled,
            lastFreq: soloist.lastFreq,
            volume: soloist.volume,
            mode: soloist.mode,
        },
        harmony: {
            style: harmony.style,
            octave: harmony.octave,
            enabled: harmony.enabled,
            volume: harmony.volume,
            complexity: harmony.complexity,
        },
        groove: {
            genreFeel: groove.genreFeel,
            lastDrumPreset: groove.lastDrumPreset,
            enabled: groove.enabled,
            volume: groove.volume,
            measures: groove.measures,
            swing: groove.swing,
            swingSub: groove.swingSub,
            instruments: groove.instruments.map((i) => ({
                name: i.name,
                steps: [...i.steps],
                muted: i.muted,
            })),
        },
        playback: {
            bpm: playback.bpm,
            bandIntensity: playback.bandIntensity,
            complexity: playback.complexity,
            autoIntensity: playback.autoIntensity,
            songMode: playback.songMode,
            sessionTimer: playback.sessionTimer,
            sessionStartTime: playback.sessionStartTime,
            isEndingPending: playback.isEndingPending,
        },
    };

    chords.buffer.clear();
    bass.buffer.clear();
    soloist.buffer.clear();
    harmony.buffer.clear();
    dispatch(ACTIONS.SET_PARAM, { module: 'groove', param: 'fillActive', value: false });

    killAllNotes();
    flushWorker(step, syncData);
    restoreGains();
}
