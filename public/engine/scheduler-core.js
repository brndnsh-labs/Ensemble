import { TIME_SIGNATURES } from '../config.js';
import { flushBuffers, loadDrumPreset } from '../instrument-controller.js';
import { ACTIONS } from '../types.js';
import { triggerFlash } from '../ui.js';
import {
    getFrequency,
    getMidi,
    getStepInfo,
    getStepsPerMeasure,
    isSectionTurnaround,
    midiToNote,
} from '../utils.js';
import {
    queueVisualizerChordEvent,
    queueVisualizerFillEvent,
    queueVisualizerNoteEvent,
    queueVisualizerStepEvent,
} from '../visualizer-events.js';
import {
    flushWorker,
    requestBuffer,
    requestResolution,
    startWorker,
    stopWorker,
    syncWorker,
} from '../worker-client.js';
import { checkSectionTransition, updateAutoConductor, updateLarsTempo } from './conductor.js';
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
import { calculatePocketOffset, calculateStepDuration } from './groove-engine.js';
import {
    dispatchMidiAutomation,
    dispatchMidiBass,
    dispatchMidiChordNote,
    dispatchMidiChordSustain,
    dispatchMidiCountInSoloist,
    dispatchMidiDrum,
    dispatchMidiHarmonyNote,
    dispatchMidiSoloist,
    startMidiTransport,
    stopMidiTransport,
} from './midi-scheduler.js';
import {
    initPlatformHacks,
    startPlatformAudioAndWakeLock,
    stopPlatformAudioAndWakeLock,
} from './platform-orchestrator.js';
import { getSoloistNote } from './soloist.js';
import { isSoloistMonophonicMode } from './soloist-mode-policy.js';
import { generateNotesForStep } from './tick-logic.js';
import { getChordAtStep as _getChordAtStep } from './worker-utils.js';

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
initPlatformHacks();

/**
 * Toggles the playback state of the session.
 * Handles audio context suspension/resumption, worker synchronization,
 * and global state updates for starting or stopping the engine.
 *
 * @param {import('../types.js').EnsembleState} state - Global ensemble state.
 * @param {boolean} [fromDispatch=false] - Whether this call originated from a Redux-like dispatch.
 * @param {Function} [dispatch] - State dispatch function.
 */
export function togglePlay(state, fromDispatch = false, dispatch = undefined) {
    const { playback, chords } = state;

    // Determine if we are STARTING or STOPPING based on current state.
    // If fromDispatch is true, isPlaying ALREADY reflects the target state.
    const isStopping = fromDispatch ? !playback.isPlaying : playback.isPlaying;

    if (isStopping) {
        if (!fromDispatch) {
            playback.isPlaying = false; // @direct-mutation
        }
        if (playback.autoIntensity && dispatch) {
            dispatch(ACTIONS.UPDATE_CONDUCTOR_STATE, { targetIntensity: 0.35 });
        }
        stopWorker();
        stopPlatformAudioAndWakeLock();
        playback.drawQueue = []; // @direct-mutation
        playback.lastActiveDrumElements = null; // @direct-mutation
        chords.lastActiveChordIndex = null; // @direct-mutation
        chords.scheduledChordIndex = null; // @direct-mutation
        playback.resolutionTriggered = false; // @direct-mutation
        playback.isScheduling = false; // @direct-mutation
        if (dispatch) {
            dispatch(ACTIONS.SET_ENDING_PENDING, false);
            dispatch(ACTIONS.SET_STOP_AT_END, false);
        }
        if (dispatch) {
            dispatch('VIS_RESET');
        }
        killAllNotes(state);
        stopMidiTransport(state, playback.audio?.currentTime || 0);
        flushBuffers();

        if (playback.audio) {
            if (playback.suspendTimeout) {
                clearTimeout(playback.suspendTimeout);
            }
            playback.suspendTimeout /* @direct-mutation */ = /** @type {any} */ (
                setTimeout(() => {
                    if (
                        !playback.isPlaying &&
                        playback.audio &&
                        playback.audio.state === 'running'
                    ) {
                        playback.audio.suspend();
                    }
                }, 3000)
            );
        }
    } else {
        if (playback.suspendTimeout) {
            clearTimeout(playback.suspendTimeout);
        }
        initAudio(state);

        if (playback.audio && playback.audio.state === 'suspended') {
            playback.audio.resume();
        }

        if (!fromDispatch) {
            playback.isPlaying = true; // @direct-mutation
            playback.sessionStartTime = performance.now(); // @direct-mutation
        }

        if (playback.autoIntensity && dispatch) {
            dispatch(ACTIONS.UPDATE_CONDUCTOR_STATE, { targetIntensity: 0.35 });
        }

        playback.step = 0; // @direct-mutation
        playback.resolutionTriggered = false; // @direct-mutation
        playback.isScheduling = false; // @direct-mutation
        chords.scheduledChordIndex = 0; // @direct-mutation
        chords.lastActiveChordIndex = null; // @direct-mutation
        if (dispatch) {
            dispatch(ACTIONS.RESET_SESSION); // Reset warm-up counters
            dispatch(ACTIONS.SET_ENDING_PENDING, false);
        }
        syncWorker();
        flushBuffers();

        startPlatformAudioAndWakeLock();
        restoreGains(state);
        const startTime = (playback.audio?.currentTime || 0) + 0.1;
        playback.nextNoteTime = startTime; // @direct-mutation
        playback.unswungNextNoteTime = startTime; // @direct-mutation
        playback.isCountingIn = playback.countIn; // @direct-mutation
        playback.countInBeat = 0; // @direct-mutation

        // Initial MIDI cleanup
        startMidiTransport(state, startTime);

        startWorker();
        scheduler(state, dispatch);
    }
}

/**
 * @param {import('../types.js').EnsembleState} state
 * @param {number} time
 * @param {Function} [dispatch]
 */
function triggerResolution(state, time, dispatch) {
    const { playback, bass, soloist, chords, harmony, groove } = state;

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
        scheduleResolution(state, time, dispatch);
    }, 50);
}

/**
 * @param {import('../types.js').EnsembleState} state
 * @param {number} time
 * @param {Function} [dispatch]
 */
function scheduleResolution(state, time, dispatch = undefined) {
    const { playback, bass, soloist, chords, harmony, groove, conductor } = state;
    // Schedule the final resolution measure (Tonic chord, Kick+Crash, etc.)
    const effectiveBpm = playback.bpm + (conductor.larsBpmOffset || 0);
    const spb = 60.0 / effectiveBpm;
    const measureDuration = 8 * spb; // Ring out for 2 bars (approx 5-6s)

    // 1. Schedule all instruments that came from the worker (Bass, Chords, Soloist, Harmony, Groove)
    // The worker-client puts these in track buffers.
    // Create a dummy chord data for visuals
    const dummyChordData = { chord: { freqs: [] } };

    if (bass.enabled) {
        scheduleBass(state, dummyChordData, playback.step, time);
    }
    if (soloist.enabled) {
        scheduleSoloist(state, dummyChordData, playback.step, time);
    }
    if (chords.enabled) {
        scheduleChords(state, dummyChordData, playback.step, time);
    }
    if (harmony.enabled) {
        scheduleHarmonies(state, dummyChordData, playback.step, time);
    }
    if (groove.enabled) {
        scheduleDrumsFromBuffer(state, playback.step, time);
    }

    // 2. Add a final flash
    if (playback.visualFlash) {
        triggerFlash(0.4);
    }

    // 3. Graceful Sustain Release (at 1.5 bars)
    setTimeout(
        () => {
            if (playback.isPlaying) {
                updateSustain(state, false);
            }
        },
        /** @type {any} */ (6 * spb * 1000),
    );

    // 4. Stop playback after the full ring-out (2 bars)
    setTimeout(
        () => {
            if (playback.isPlaying && dispatch) {
                dispatch(ACTIONS.TOGGLE_PLAY);
            }
        },
        /** @type {any} */ (measureDuration * 1000),
    );
}

/**
 * Main scheduling loop.
 * Looks ahead by `playback.scheduleAheadTime` and schedules notes for all enabled instruments.
 * Handles count-in, session timing, and resolution triggers.
 *
 * @param {import('../types.js').EnsembleState} state - Global ensemble state.
 * @param {Function} [dispatch] - State dispatch function.
 */
export function scheduler(state, dispatch = undefined) {
    const { playback, groove, arranger } = state;
    if (playback.isScheduling || !playback.isPlaying) {
        return;
    }
    playback.isScheduling = true; // @direct-mutation

    try {
        requestBuffer(playback.step);

        // Update genre UI (countdowns)
        if (groove.pendingGenreFeel && dispatch) {
            const stepsPerMeasure = getStepsPerMeasure(arranger.timeSignature);
            const stepsRemaining = stepsPerMeasure - (playback.step % stepsPerMeasure);
            const beatsRemaining = Math.ceil(stepsRemaining / 4);

            if (groove.genreSwitchCountdown !== beatsRemaining) {
                dispatch(ACTIONS.SET_GENRE_COUNTDOWN, beatsRemaining);
            }
        } else if (groove.genreSwitchCountdown !== null && dispatch) {
            dispatch(ACTIONS.SET_GENRE_COUNTDOWN, null);
        }

        while (
            playback.nextNoteTime <
            (playback.audio?.currentTime || 0) + playback.scheduleAheadTime
        ) {
            if (playback.isCountingIn) {
                scheduleCountIn(state, playback.countInBeat, playback.nextNoteTime);
                advanceCountIn(state);
            } else {
                const spm = getStepsPerMeasure(arranger.timeSignature);

                // --- Session Timer Check ---
                if (playback.songMode && playback.sessionTimer > 0 && !playback.isEndingPending) {
                    const elapsedMins = (performance.now() - playback.sessionStartTime) / 60000;
                    if (elapsedMins >= playback.sessionTimer && dispatch) {
                        dispatch(ACTIONS.SET_ENDING_PENDING, true);
                    }
                }

                // --- Resolution Trigger Logic ---
                // If ending is pending or stopAtEnd is active, check for appropriate boundary (Next Chorus)
                if (playback.step > 0 && playback.step % arranger.totalSteps === 0) {
                    playback.currentLoopCount++;

                    // --- Loop Limit Check ---
                    if (playback.songMode && playback.loopLimit > 0 && !playback.isEndingPending) {
                        if (playback.currentLoopCount >= playback.loopLimit && dispatch) {
                            dispatch(ACTIONS.SET_ENDING_PENDING, true);
                        }
                    }

                    if (
                        playback.isEndingPending ||
                        playback.stopAtEnd ||
                        playback.resolutionTriggered
                    ) {
                        if (!playback.resolutionTriggered) {
                            playback.resolutionTriggered = true; // @direct-mutation
                            playback.stopAtEnd = false; // @direct-mutation
                            triggerResolution(state, playback.nextNoteTime, dispatch);
                        }
                        return; // Stop scheduling
                    }
                }

                if (playback.step % spm === 0 && groove.pendingGenreFeel) {
                    applyPendingGenre(state);
                }

                scheduleGlobalEvent(state, playback.step, playback.nextNoteTime, dispatch);
                advanceGlobalStep(state, dispatch);
            }
        }
    } finally {
        playback.isScheduling = false; // @direct-mutation
    }
}

/**
 * @param {import('../types.js').EnsembleState} state
 */
function applyPendingGenre(state) {
    const { groove, playback } = state;
    /** @type {any} */
    const payload = groove.pendingGenreFeel;
    if (!payload) {
        return;
    }

    groove.genreFeel = payload.feel; // @direct-mutation
    if (payload.swing !== undefined) {
        groove.swing = payload.swing; // @direct-mutation
    }
    if (payload.sub !== undefined) {
        groove.swingSub = payload.sub; // @direct-mutation
    }
    if (payload.genreName) {
        groove.lastSmartGenre = payload.genreName; // @direct-mutation
    }

    if (payload.drum) {
        loadDrumPreset(payload.drum);
    }

    groove.pendingGenreFeel = null; // @direct-mutation

    playback.nextNoteTime = playback.unswungNextNoteTime; // @direct-mutation

    syncAndFlushWorker(state, playback.step);
    triggerFlash(0.15);
}

/**
 * @param {import('../types.js').EnsembleState} state
 */
function advanceCountIn(state) {
    const { playback, arranger, conductor } = state;
    const effectiveBpm = playback.bpm + (conductor.larsBpmOffset || 0);
    const beatDuration = 60.0 / effectiveBpm;
    playback.nextNoteTime += beatDuration;
    playback.unswungNextNoteTime += beatDuration;
    playback.countInBeat++;
    /** @type {any} */
    const signatures = TIME_SIGNATURES;
    const ts = signatures[arranger.timeSignature] || signatures['4/4'];
    if (playback.countInBeat >= ts.beats) {
        playback.isCountingIn = false; // @direct-mutation
        playback.step = 0; // @direct-mutation
    }
}

/**
 * @param {import('../types.js').EnsembleState} state
 * @param {number} beat
 * @param {number} time
 */
function scheduleCountIn(state, beat, time) {
    const { playback, arranger, soloist, vizState } = state;
    if (!playback.audio) {
        return;
    }
    const osc = playback.audio.createOscillator();
    const gain = playback.audio.createGain();
    osc.connect(gain);
    if (playback.masterGain) {
        gain.connect(playback.masterGain);
    }
    /** @type {any} */
    const signatures = TIME_SIGNATURES;
    const ts = signatures[arranger.timeSignature] || signatures['4/4'];
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
    /** @type {any} */
    const firstChord = arranger.stepMap?.[0]?.chord || {
        rootMidi: 60,
        scale: [0, 2, 4, 5, 7, 9, 11],
        intervals: [0, 4, 7],
    };
    const pickupStepInfo = getStepInfo(
        pickupStep,
        ts,
        arranger.measureMap || /** @type {any} */ ([]),
        signatures,
    );

    const soloistNote = getSoloistNote(
        state,
        firstChord,
        firstChord,
        pickupStep,
        /** @type {any} */ (soloist.lastFreq),
        soloist.octave,
        /** @type {any} */ (soloist.style),
        0,
        { sectionStart: 0, sectionEnd: arranger.totalSteps || 0, bypassRhythm: false },
        pickupStepInfo,
    );

    if (soloistNote) {
        const results = Array.isArray(soloistNote) ? soloistNote : [soloistNote];
        results.forEach((res) => {
            const freq = res.freq || getFrequency(res.midi);
            const duration = (res.durationSteps || 4) * 0.25 * (60.0 / playback.bpm);

            playSoloNote(
                state,
                freq,
                time,
                duration,
                res.velocity,
                res.bendStartInterval || 0,
                soloist.style,
                false,
                res.vibrato,
            );
            dispatchMidiCountInSoloist(state, res, time);
            if (vizState.enabled) {
                const { name, octave } = midiToNote(res.midi);
                queueVisualizerNoteEvent(playback, {
                    track: 'soloist',
                    midi: res.midi,
                    time,
                    velocity: res.velocity,
                    duration,
                    noteName: name,
                    octave,
                });
            }
        });
    }
}

/**
 * @param {import('../types.js').EnsembleState} state
 * @param {Function} [dispatch]
 */
function advanceGlobalStep(state, dispatch = undefined) {
    const { playback, groove, arranger, conductor } = state;
    if (dispatch) {
        updateLarsTempo(state, playback.step, dispatch);
    }
    const effectiveBpm = playback.bpm + (conductor.larsBpmOffset || 0);
    const sixteenth = 0.25 * (60.0 / effectiveBpm);

    /** @type {any} */
    const signatures = TIME_SIGNATURES;
    const sInfo = getStepInfo(
        playback.step,
        signatures[arranger.timeSignature] || signatures['4/4'],
        arranger.measureMap,
        signatures,
    );
    const ts = signatures[sInfo.tsName || '4/4'] || signatures['4/4'];

    const duration = calculateStepDuration(playback.step, effectiveBpm, ts, groove);

    playback.nextNoteTime += duration;
    playback.unswungNextNoteTime += sixteenth;
    playback.step++; // @direct-mutation
}

/**
 * Thin adapter over the canonical {@link _getChordAtStep} from `worker-utils.js`.
 *
 * The canonical implementation lives in `worker-utils.js` and is the single
 * source of truth for chord-lookup logic. This adapter bridges the
 * `(state, step)` calling convention used inside scheduler-core to the
 * `(step, arranger, cursor)` signature of the canonical helper, preserving
 * the `chords.scheduledChordIndex` cursor that the scheduler maintains for
 * O(1) amortized lookups.
 *
 * If you need to change chord-lookup behavior, edit `worker-utils.js`.
 *
 * @param {import('../types.js').EnsembleState} state
 * @param {number} step
 * @returns {any}
 */
function getChordAtStep(state, step) {
    const { arranger, chords } = state;
    const cursor = { index: chords.scheduledChordIndex || 0, sectionIndex: 0 };
    const result = _getChordAtStep(step, arranger, cursor);
    if (result) {
        chords.scheduledChordIndex = cursor.index; // @direct-mutation
    }
    return result;
}

/**
 * Schedules drum sounds for a specific step.
 * Applies pocket/timing offsets, handles fills, and pushes events to the visualizer queue.
 *
 * @param {import('../types.js').EnsembleState} state - Global ensemble state.
 * @param {any} params - Drum parameters.
 * @param {Function} [dispatch] - State dispatch function.
 */
function scheduleDrums(state, params, dispatch = undefined) {
    const { time, absoluteStep } = params;

    const { playback, groove, vizState, arranger } = state;

    // PERFORMANCE MODE: Skip automatic drums if manual pad is active
    if (playback.modals?.drumPad) {
        return;
    }

    const conductorVel = playback.conductorVelocity || 1.0;
    const finalTime = time + calculatePocketOffset(playback, groove);

    // Evaluate fills and standard groove patterns via our unified tick logic
    // This maintains 1:1 playback/export parity.
    const sectionIndex =
        arranger.sectionMap?.findIndex(
            (/** @type {any} */ s) => absoluteStep >= s.start && absoluteStep < s.end,
        ) || 0;
    const tickResult = generateNotesForStep(
        state,
        absoluteStep,
        {
            mainCursor: { index: 0, sectionIndex: Math.max(0, sectionIndex) },
            lookaheadCursor: { index: 0, sectionIndex: 0 },
        },
        {
            includeDrums: true,
            includeBass: false,
            includeChords: false,
            includeHarmony: false,
            includeSoloist: false,
        },
    );

    // Handle fill state cleanup
    if (groove.fillActive) {
        const fillStep = absoluteStep - (groove.fillStartStep || 0);
        if (fillStep >= (groove.fillLength || 0)) {
            if (dispatch) {
                dispatch(ACTIONS.SET_PARAM, {
                    module: 'groove',
                    param: 'fillActive',
                    value: false,
                });
            } else {
                groove.fillActive = false; // @direct-mutation
            }
            if (groove.pendingCrash) {
                groove.pendingCrash = false; // @direct-mutation
            }
        }

        if (fillStep >= 0 && fillStep < (groove.fillLength || 0)) {
            if (vizState.enabled) {
                queueVisualizerFillEvent(playback, finalTime, true);
            }
        }
    } else if (vizState.enabled) {
        // Ensure fill visual state is cleared when fill is not active
        queueVisualizerFillEvent(playback, finalTime, false);
    }

    tickResult.drumHits.forEach((hit) => {
        const playTime = finalTime + hit.instTimeOffset;
        playDrumSound(state, hit.soundName, playTime, hit.velocity * conductorVel);

        if (vizState.enabled) {
            const midiNum = /** @type {any} */ (DRUM_VIS_PITCHES)[hit.soundName] || 36;
            queueVisualizerNoteEvent(playback, {
                track: 'drums',
                midi: midiNum,
                time: playTime,
                velocity: hit.velocity * conductorVel,
                duration: 0.1,
            });
        }

        dispatchMidiDrum(state, hit.soundName, playTime, hit.velocity * conductorVel);
    });
}

/**
 * Schedules drum notes directly from the worker buffer (for Resolution or pattern playback).
 *
 * @param {import('../types.js').EnsembleState} state - Global ensemble state.
 * @param {number} step - The global step index.
 * @param {number} time - The AudioContext time to play.
 */
function scheduleDrumsFromBuffer(state, step, time) {
    const { groove, playback, vizState } = state;

    // PERFORMANCE MODE: Skip automatic drums if manual pad is active
    if (playback.modals?.drumPad) {
        return;
    }

    const notes = groove.buffer.get(step);
    groove.buffer.delete(step);

    if (notes && notes.length > 0) {
        const conductorVel = playback.conductorVelocity || 1.0;

        notes.forEach((/** @type {any} */ n) => {
            const { name, velocity, timingOffset } = n;
            const playTime = time + (timingOffset || 0);

            playDrumSound(state, name, playTime, velocity * conductorVel);

            if (vizState.enabled) {
                const midiNum = /** @type {any} */ (DRUM_VIS_PITCHES)[name] || 36;
                queueVisualizerNoteEvent(playback, {
                    track: 'drums',
                    midi: midiNum,
                    time: playTime,
                    velocity: velocity * conductorVel,
                    duration: 0.1,
                });
            }

            dispatchMidiDrum(state, name, playTime, velocity * conductorVel);
        });
    }
}

/**
 * Schedules bass notes from the worker buffer.
 *
 * @param {import('../types.js').EnsembleState} state - Global ensemble state.
 * @param {any} chordData - The current chord context.
 * @param {number} step - The global step index.
 * @param {number} time - The AudioContext time to play.
 */
function scheduleBass(state, chordData, step, time) {
    const { bass, playback, vizState } = state;
    const notes = bass.buffer.get(step);
    bass.buffer.delete(step);

    if (notes && notes.length > 0) {
        notes.forEach((/** @type {any} */ noteEntry) => {
            if (noteEntry?.freq) {
                const { freq, durationSteps, velocity, timingOffset, muted } = noteEntry;
                const { chord } = /** @type {any} */ (chordData);
                const adjustedTime = time + (timingOffset || 0);
                bass.lastPlayedFreq = freq; // @direct-mutation
                const midiNum = getMidi(freq || 0) || 0;
                const { name, octave } = midiToNote(midiNum);
                const spb = 60.0 / playback.bpm;
                const duration = (durationSteps || 4) * 0.25 * spb;
                const finalVel = (velocity || 1.0) * (playback.conductorVelocity || 1.0);
                if (vizState.enabled) {
                    const fLen = chord.freqs.length;
                    const chordNotes = new Array(fLen);
                    for (let i = 0; i < fLen; i++) {
                        chordNotes[i] = getMidi(/** @type {any} */ (chord.freqs[i]));
                    }

                    queueVisualizerNoteEvent(playback, {
                        track: 'bass',
                        noteName: name,
                        octave,
                        midi: midiNum,
                        time: adjustedTime,
                        chordNotes,
                        duration,
                    });
                }
                playBassNote(state, freq || 0, adjustedTime, duration, finalVel, muted);
                if (!muted) {
                    // Bass is strictly monophonic, so we force Mono mode to kill previous notes
                    dispatchMidiBass(state, midiNum, finalVel, adjustedTime, duration);
                }
            }
        });
    }
}

/**
 * Schedules soloist (melody) notes from the worker buffer.
 * Handles monophonic/polyphonic modes, bends, and MIDI output.
 *
 * @param {import('../types.js').EnsembleState} state - Global ensemble state.
 * @param {any} chordData - The current chord context.
 * @param {number} step - The global step index.
 * @param {number} playTime - The AudioContext time to play.
 */
function scheduleSoloist(state, chordData, step, playTime) {
    const { soloist, playback, vizState } = state;
    const notes = soloist.buffer.get(step);
    soloist.buffer.delete(step);

    if (notes && notes.length > 0) {
        // Optimization: Avoid allocation if we only play one note (Common case)
        let notesToPlay = notes;
        if (isSoloistMonophonicMode(soloist.mode) && notes.length > 1) {
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

        notesToPlay.forEach((/** @type {any} */ noteEntry) => {
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
                const { chord } = /** @type {any} */ (chordData);
                const offsetS = timingOffset || 0;

                if (!noteEntry.isDoubleStop) {
                    soloist.lastPlayedFreq = freq; // @direct-mutation
                }

                const midiNum = noteEntry.midi || getMidi(freq || 0) || 0;
                const { name, octave } = midiToNote(midiNum);
                const spb = 60.0 / playback.bpm;
                const duration = (durationSteps || 4) * 0.25 * spb;
                const baseVel = (velocity || 1.0) * (playback.conductorVelocity || 1.0);
                const vel = baseVel * polyphonyComp;
                const finalTime = playTime + offsetS;

                playSoloNote(
                    state,
                    freq,
                    finalTime,
                    duration,
                    vel,
                    bendStartInterval || 0,
                    style,
                    false,
                    vibrato,
                );

                // Soloist is monophonic UNLESS double stops are enabled
                const isMono = isSoloistMonophonicMode(soloist.mode);

                dispatchMidiSoloist(
                    state,
                    midiNum,
                    vel,
                    finalTime,
                    duration,
                    bendStartInterval || 0,
                    isMono,
                );

                if (vizState.enabled) {
                    const fLen = chord.freqs.length;
                    const chordNotes = new Array(fLen);
                    for (let i = 0; i < fLen; i++) {
                        chordNotes[i] = getMidi(/** @type {any} */ (chord.freqs[i]));
                    }

                    queueVisualizerNoteEvent(playback, {
                        track: 'soloist',
                        noteName: name,
                        octave,
                        midi: midiNum,
                        time: finalTime,
                        chordNotes,
                        duration,
                        noteType,
                    });
                }
                soloist.lastNoteEnd = finalTime + duration; // @direct-mutation
            }
        });
    }
}

/**
 * @param {import('../types.js').EnsembleState} state
 * @param {any} chordData
 * @param {number} t
 */
export function scheduleChordVisuals(state, chordData, t) {
    const { playback, chords, vizState } = state;
    if (chordData.stepInChord === 0) {
        const freqs = chordData.chord.freqs;
        const fLen = freqs.length;
        const chordNotes = new Array(fLen);
        for (let i = 0; i < fLen; i++) {
            chordNotes[i] = getMidi(freqs[i]);
        }

        if (chords.lastActiveChordIndex !== chordData.chordIndex) {
            chords.lastActiveChordIndex = chordData.chordIndex; // @direct-mutation
        }

        // Only queue canvas events when the Visuals workspace is active.
        // Arranger highlighting is driven directly from the scheduler now.
        if (vizState.enabled) {
            queueVisualizerChordEvent(playback, {
                time: t,
                index: chordData.chordIndex,
                chordNotes,
                rootMidi: chordData.chord.rootMidi,
                intervals: chordData.chord.intervals,
                duration: chordData.chord.beats * (60 / playback.bpm),
                label: chordData.chord.absName,
                sectionId: chordData.chord.sectionId || null,
            });
        }

        if (playback.visualFlash) {
            triggerFlash(0.1);
        }
    }
}

/**
 * Schedules chord notes from the worker buffer.
 * Handles sustain pedal events (MIDI CC 64).
 *
 * @param {import('../types.js').EnsembleState} state - Global ensemble state.
 * @param {any} _chordData - The current chord context.
 * @param {number} step - The global step index.
 * @param {number} time - The AudioContext time to play.
 */
function scheduleChords(state, _chordData, step, time) {
    const { chords, playback, vizState } = state;
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

        notes.forEach((/** @type {any} */ n) => {
            const {
                freq,
                velocity,
                timingOffset,
                durationSteps,
                muted,
                instrument,

                ccEvents,
            } = n;
            const playTime = time + (timingOffset || 0);

            if (ccEvents && ccEvents.length > 0) {
                ccEvents.forEach((/** @type {any} */ cc) => {
                    if (cc.controller === 64) {
                        const isSustain = cc.value >= 64;
                        const ccTime = playTime + (cc.timingOffset || 0);
                        updateSustain(state, isSustain, ccTime);
                        dispatchMidiChordSustain(state, cc.value, ccTime);
                    }
                });
            }

            if (!muted && freq) {
                const duration = (durationSteps || 1) * 0.25 * spb;
                const midiNum = getMidi(freq) || 0;
                const { name, octave } = midiToNote(midiNum);
                playNote(state, freq, playTime, duration, {
                    vol: velocity,
                    index: 0,
                    instrument: instrument || 'Piano',
                    numVoices: numVoices,
                });
                dispatchMidiChordNote(state, freq, velocity, playTime, duration);
                if (vizState.enabled) {
                    queueVisualizerNoteEvent(playback, {
                        track: 'chords',
                        noteName: name,
                        octave,
                        midi: midiNum,
                        time: playTime,
                        duration,
                        velocity,
                        ccEvents,
                    });
                }
            }
        });
    }
}

/**
 * Schedules harmony notes (pads, stabs) from the worker buffer.
 * Handles voice killing for smoother transitions.
 *
 * @param {import('../types.js').EnsembleState} state - Global ensemble state.
 * @param {any} _chordData - The current chord context.
 * @param {number} step - The global step index.
 * @param {number} time - The AudioContext time to play.
 */
function scheduleHarmonies(state, _chordData, step, time) {
    const { harmony, playback, vizState } = state;
    const notes = harmony.buffer.get(step);
    harmony.buffer.delete(step);

    if (notes && notes.length > 0) {
        const spb = 60.0 / playback.bpm;

        // If any note in this step is a chord start or movement,
        // clear previous voices once before scheduling the new ones.
        const starter = notes.find((/** @type {any} */ n) => n.isChordStart);
        if (starter) {
            killHarmonyNote(state, starter.killFade || 0.05);
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

        notes.forEach((/** @type {any} */ n) => {
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
                    state,
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
                dispatchMidiHarmonyNote(state, m, finalVel, playTime, duration);

                if (vizState.enabled) {
                    const { name, octave } = midiToNote(m);
                    queueVisualizerNoteEvent(playback, {
                        track: 'harmony',
                        noteName: name,
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
 * @param {import('../types.js').EnsembleState} state - Global ensemble state.
 * @param {number} step - The global step index.
 * @param {number} swungTime - The swung AudioContext time.
 * @param {Function} [dispatch] - State dispatch function.
 */
export function scheduleGlobalEvent(state, step, swungTime, dispatch = undefined) {
    const { arranger, playback, groove, soloist, chords, bass, harmony, vizState } = state;
    /** @type {any} */
    const signatures = TIME_SIGNATURES;
    const globalTS = signatures[arranger.timeSignature] || signatures['4/4'];
    const stepInfo = getStepInfo(step, globalTS, arranger.measureMap, signatures);
    const ts = signatures[stepInfo.tsName || '4/4'] || globalTS;

    if (dispatch) {
        updateAutoConductor(state, dispatch);
    }

    // --- NEW: Rhythm Section Mask Calculation ---
    // Extract the snare pattern for the current measure to share with the ensemble
    const spm = getStepsPerMeasure(stepInfo.tsName || arranger.timeSignature || '4/4');
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
            groove.snareMask = snareMask; // @direct-mutation
            // Immediate sync to worker so harmony module can "hear" the new drum pattern
            syncWorker(ACTIONS.SET_PARAM, {
                module: 'groove',
                param: 'snareMask',
                value: snareMask,
            });
        }
    }

    if (dispatch) {
        checkSectionTransition(state, step, spm, dispatch);
    }

    // MIDI Automation
    dispatchMidiAutomation(state, stepInfo, swungTime);

    const drumStep = step % (groove.measures * spm);
    const t = swungTime + (Math.random() - 0.5) * (groove.humanize / 100) * 0.025;

    if (playback.metronome && stepInfo.isBeatStart && playback.audio) {
        let freq = stepInfo.isMeasureStart ? 1000 : stepInfo.isGroupStart ? 800 : 600;
        if (ts.beats % 2 === 0 && stepInfo.beatIndex === ts.beats / 2 && !stepInfo.isGroupStart) {
            freq = 800; // Accented middle beat for simple meters
        }

        const osc = playback.audio.createOscillator();
        const g = playback.audio.createGain();
        osc.connect(g);
        if (playback.masterGain) {
            g.connect(playback.masterGain);
        }
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
        playback.unswungNextNoteTime * straightness + swungTime * (1.0 - straightness);

    if (groove.enabled) {
        if (vizState.enabled) {
            queueVisualizerStepEvent(playback, swungTime, drumStep);
        }

        const chordDataForDrums = /** @type {any} */ (getChordAtStep(state, step));
        const sectionId = chordDataForDrums?.chord?.sectionId || null;

        // --- Port Turnaround Logic from Worker ---
        const stepsPerBar = spm;
        const isTurnaround =
            groove.creativity && isSectionTurnaround(step, arranger.sectionMap, stepsPerBar, 1);

        scheduleDrums(
            state,
            {
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
            },
            dispatch,
        );
    }

    const chordData = /** @type {any} */ (getChordAtStep(state, step));
    if (chordData) {
        if (chordData.chord.key && chordData.chord.key !== playback.currentKey) {
            playback.currentKey = /** @type {any} */ (chordData.chord.key); // @direct-mutation
            window.dispatchEvent(
                new CustomEvent('key-change', { detail: { key: playback.currentKey } }),
            );
        }
        scheduleChordVisuals(state, chordData, t);
        if (bass.enabled) {
            scheduleBass(state, chordData, step, t);
        }
        if (soloist.enabled) {
            scheduleSoloist(state, chordData, step, soloistTime);
        }
        if (chords.enabled) {
            scheduleChords(state, chordData, step, t);
        }
        if (harmony.enabled) {
            scheduleHarmonies(state, chordData, step, t);
        }
    }
}

/**
 * Syncs current state parameters to the worker and flushes the note buffers.
 * Called when key parameters (genre, key, progression) change.
 *
 * @param {import('../types.js').EnsembleState} state - Global ensemble state.
 * @param {number} step - The current global step.
 * @param {Function} [dispatch] - State dispatch function.
 */
function syncAndFlushWorker(state, step, dispatch = undefined) {
    const { arranger, chords, bass, soloist, harmony, groove, playback } = state;
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
            instruments: groove.instruments.map((/** @type {any} */ i) => ({
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
            practiceMode: playback.practiceMode,
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
    if (dispatch) {
        dispatch(ACTIONS.SET_PARAM, { module: 'groove', param: 'fillActive', value: false });
    } else {
        groove.fillActive = false; // @direct-mutation
    }

    killAllNotes(state);
    flushWorker(step, /** @type {any} */ (syncData));
    restoreGains(state);
}
