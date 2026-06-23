import { TIME_SIGNATURES } from '../config.js';
import { flushBuffers, loadDrumPreset } from '../instrument-controller.js';
import type { EnsembleState, Mutable } from '../types.js';
import { ACTIONS } from '../types.js';
import { triggerFlash } from '../ui.js';
import {
    getFrequency,
    getMidi,
    getStepInfo,
    getStepsPerMeasure,
    isSectionTurnaround,
    midiToNote,
    secondsPerBeatFor,
    secondsPerStepFor,
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
import { checkSectionTransition, updateAutoConductor } from './conductor.js';
import { generateDrumsForStep } from './drums-tick.js';
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
import { stringHash31 } from './hash-utils.js';
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
import { HUMANIZE_PROFILES, humanizeNote, humanizeSeed, killActiveVoices } from './synth-utils.js';
import { getChordAtStep as _getChordAtStep, type ChordAtStep } from './worker-utils.js';

type Dispatch = (action: any, payload?: any) => void;

// Persistent cursor for scheduleDrums' section lookup. The scheduler ticks
// strictly forward through `absoluteStep`, so most calls land in the same
// section or the next one — a cursor-walk avoids the per-step Array.findIndex
// pass over sectionMap.
let drumSectionCursor = 0;
function findSectionIndexFromCursor(
    sectionMap: readonly { start: number; end: number }[] | undefined,
    step: number,
): number {
    if (!sectionMap || sectionMap.length === 0) {
        return 0;
    }
    if (drumSectionCursor >= sectionMap.length) {
        drumSectionCursor = 0;
    }
    if (step < sectionMap[drumSectionCursor].start) {
        drumSectionCursor = 0;
    }
    for (let i = drumSectionCursor; i < sectionMap.length; i++) {
        const s = sectionMap[i];
        if (step >= s.start && step < s.end) {
            drumSectionCursor = i;
            return i;
        }
        if (s.start > step) {
            break;
        }
    }
    return 0;
}

// Per-chord MIDI cache for visualizer payloads. Chord objects are immutable per
// progression index, so the freqs → MIDI mapping only changes when the chord
// itself changes. Caching avoids three per-step `new Array(n)` allocations
// inside the visualizer hot path (bass, soloist, chord events).
const chordMidiCache = new WeakMap<{ freqs: number[] }, number[]>();
function getChordMidiNotes(chord: { freqs: number[] }): number[] {
    let cached = chordMidiCache.get(chord);
    if (!cached) {
        const fLen = chord.freqs.length;
        cached = new Array(fLen);
        for (let i = 0; i < fLen; i++) {
            cached[i] = getMidi(chord.freqs[i]) ?? 0;
        }
        chordMidiCache.set(chord, cached);
    }
    return cached;
}

const DRUM_VIS_PITCHES: Record<string, number> = {
    Kick: 36,
    Snare: 38,
    HiHat: 42,
    ClosedHat: 42,
    HiHatQuarter: 42,
    HiHatHalf: 46,
    HiHatPedal: 44,
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
 */
export function togglePlay(
    state: EnsembleState,
    fromDispatch: boolean = false,
    dispatch: Dispatch | undefined = undefined,
): void {
    const { playback, chords } = state;

    // Determine if we are STARTING or STOPPING based on current state.
    // If fromDispatch is true, isPlaying ALREADY reflects the target state.
    const isStopping = fromDispatch ? !playback.isPlaying : playback.isPlaying;

    if (isStopping) {
        if (!fromDispatch) {
            (playback as Mutable<typeof playback>).isPlaying = false; // @direct-mutation
        }
        if (playback.autoIntensity && dispatch) {
            dispatch(ACTIONS.UPDATE_CONDUCTOR_STATE, { targetIntensity: 0.35 });
        }
        stopWorker();
        stopPlatformAudioAndWakeLock();
        (playback as Mutable<typeof playback>).drawQueue = []; // @direct-mutation
        (playback as Mutable<typeof playback>).lastActiveDrumElements = null; // @direct-mutation
        (chords as Mutable<typeof chords>).lastActiveChordIndex = null; // @direct-mutation
        (chords as Mutable<typeof chords>).scheduledChordIndex = null; // @direct-mutation
        (playback as Mutable<typeof playback>).resolutionTriggered = false; // @direct-mutation
        (playback as Mutable<typeof playback>).isScheduling = false; // @direct-mutation
        if (dispatch) {
            dispatch(ACTIONS.SET_ENDING_PENDING, false);
            dispatch(ACTIONS.SET_STOP_AT_END, false);
        }
        if (dispatch) {
            dispatch(ACTIONS.VIS_RESET);
        }
        killAllNotes(state);
        stopMidiTransport(state, playback.audio?.currentTime || 0);
        flushBuffers();

        if (playback.audio) {
            if (playback.suspendTimeout) {
                clearTimeout(playback.suspendTimeout);
            }
            (playback as Mutable<typeof playback>).suspendTimeout /* @direct-mutation */ =
                setTimeout(() => {
                    if (
                        !playback.isPlaying &&
                        playback.audio &&
                        playback.audio.state === 'running'
                    ) {
                        playback.audio.suspend();
                    }
                }, 3000) as any;
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
            (playback as Mutable<typeof playback>).isPlaying = true; // @direct-mutation
            (playback as Mutable<typeof playback>).sessionStartTime = performance.now(); // @direct-mutation
        }

        if (playback.autoIntensity && dispatch) {
            dispatch(ACTIONS.UPDATE_CONDUCTOR_STATE, { targetIntensity: 0.35 });
        }

        (playback as Mutable<typeof playback>).step = 0; // @direct-mutation
        (playback as Mutable<typeof playback>).resolutionTriggered = false; // @direct-mutation
        (playback as Mutable<typeof playback>).isScheduling = false; // @direct-mutation
        (chords as Mutable<typeof chords>).scheduledChordIndex = 0; // @direct-mutation
        (chords as Mutable<typeof chords>).lastActiveChordIndex = null; // @direct-mutation
        if (dispatch) {
            dispatch(ACTIONS.RESET_SESSION); // Reset warm-up counters
            dispatch(ACTIONS.SET_ENDING_PENDING, false);
        }
        syncWorker();
        flushBuffers();

        startPlatformAudioAndWakeLock();
        restoreGains(state);
        const startTime = (playback.audio?.currentTime || 0) + 0.1;
        (playback as Mutable<typeof playback>).nextNoteTime = startTime; // @direct-mutation
        (playback as Mutable<typeof playback>).unswungNextNoteTime = startTime; // @direct-mutation
        (playback as Mutable<typeof playback>).isCountingIn = playback.countIn; // @direct-mutation
        (playback as Mutable<typeof playback>).countInBeat = 0; // @direct-mutation

        // Initial MIDI cleanup
        startMidiTransport(state, startTime);

        startWorker();
        scheduler(state, dispatch);
    }
}

function triggerResolution(state: EnsembleState, time: number, dispatch?: Dispatch): void {
    const { playback, bass, soloist, chords, harmony, groove } = state;

    // 0. Clear all buffers to prevent "double hits" from pre-fetched notes
    // The worker might have already sent normal notes for the wrap-around step.
    bass.buffer.clear();
    soloist.audio.buffer.clear();
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

function scheduleResolution(
    state: EnsembleState,
    time: number,
    dispatch: Dispatch | undefined = undefined,
): void {
    const { playback, bass, soloist, chords, harmony, groove } = state;
    // Schedule the final resolution measure (Tonic chord, Kick+Crash, etc.)
    const effectiveBpm = playback.bpm;
    const spb = 60.0 / effectiveBpm;
    const measureDuration = 8 * spb; // Ring out for 2 bars (approx 5-6s)

    // 1. Schedule all instruments that came from the worker (Bass, Chords, Soloist, Harmony, Groove)
    // The worker-client puts these in track buffers.
    // Create a dummy chord data for visuals during ring-out (buffer-only) playback.
    // The schedulers only touch `chord.freqs` when emitting visualizer events; the
    // empty freqs makes those events no-ops without disabling the visualizer path.
    const dummyChordData = { chord: { freqs: [] } } as unknown as ChordAtStep;

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
        6 * spb * 1000,
    );

    // 4. Stop playback after the full ring-out (2 bars)
    setTimeout(() => {
        if (playback.isPlaying && dispatch) {
            dispatch(ACTIONS.TOGGLE_PLAY);
        }
    }, measureDuration * 1000);
}

/**
 * Main scheduling loop.
 * Looks ahead by `playback.scheduleAheadTime` and schedules notes for all enabled instruments.
 * Handles count-in, session timing, and resolution triggers.
 */
export function scheduler(state: EnsembleState, dispatch: Dispatch | undefined = undefined): void {
    const { playback, groove, arranger } = state;
    if (playback.isScheduling || !playback.isPlaying) {
        return;
    }
    (playback as Mutable<typeof playback>).isScheduling = true; // @direct-mutation

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
                    (playback as Mutable<typeof playback>).currentLoopCount++; // @direct-mutation
                    syncWorker('LOOP_BOUNDARY');

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
                            (playback as Mutable<typeof playback>).resolutionTriggered = true; // @direct-mutation
                            (playback as Mutable<typeof playback>).stopAtEnd = false; // @direct-mutation
                            triggerResolution(state, playback.nextNoteTime, dispatch);
                        }
                        return; // Stop scheduling
                    }
                }

                if (playback.step % spm === 0 && groove.pendingGenreFeel) {
                    applyPendingGenre(state);
                }

                scheduleGlobalEvent(state, playback.step, playback.nextNoteTime, dispatch);
                advanceGlobalStep(state);
            }
        }
    } finally {
        (playback as Mutable<typeof playback>).isScheduling = false; // @direct-mutation
    }
}

function applyPendingGenre(state: EnsembleState): void {
    const { groove, playback } = state;
    const payload: any = groove.pendingGenreFeel;
    if (!payload) {
        return;
    }

    (groove as Mutable<typeof groove>).genreFeel = payload.feel; // @direct-mutation
    if (payload.swing !== undefined) {
        (groove as Mutable<typeof groove>).swing = payload.swing; // @direct-mutation
    }
    if (payload.sub !== undefined) {
        (groove as Mutable<typeof groove>).swingSub = payload.sub; // @direct-mutation
    }
    if (payload.genreName) {
        (groove as Mutable<typeof groove>).lastSmartGenre = payload.genreName; // @direct-mutation
    }

    if (payload.drum) {
        loadDrumPreset(payload.drum);
    }

    (groove as Mutable<typeof groove>).pendingGenreFeel = null; // @direct-mutation

    (playback as Mutable<typeof playback>).nextNoteTime = playback.unswungNextNoteTime; // @direct-mutation

    syncAndFlushWorker(state, playback.step);
    triggerFlash(0.15);
}

function advanceCountIn(state: EnsembleState): void {
    const { playback, arranger } = state;
    const effectiveBpm = playback.bpm;
    const signatures: any = TIME_SIGNATURES;
    const ts = signatures[arranger.timeSignature] || signatures['4/4'];
    // count-in clicks `ts.beats` per bar (4 quarters in 4/4, 6 eighths in 6/8).
    // `secondsPerBeatFor` returns one ts.beats-native unit: 60/bpm (a quarter)
    // in stepsPerBeat=4 meters, (60/bpm)/2 (an eighth) in stepsPerBeat=2 meters.
    const beatDuration = secondsPerBeatFor(ts, effectiveBpm);
    (playback as Mutable<typeof playback>).nextNoteTime += beatDuration; // @direct-mutation
    (playback as Mutable<typeof playback>).unswungNextNoteTime += beatDuration; // @direct-mutation
    (playback as Mutable<typeof playback>).countInBeat++; // @direct-mutation
    if (playback.countInBeat >= ts.beats) {
        (playback as Mutable<typeof playback>).isCountingIn = false; // @direct-mutation
        (playback as Mutable<typeof playback>).step = 0; // @direct-mutation
    }
}

function scheduleCountIn(state: EnsembleState, beat: number, time: number): void {
    const { playback, arranger, soloist, vizState } = state;
    if (!playback.audio) {
        return;
    }
    const osc = playback.audio.createOscillator();
    const gain = playback.audio.createGain();
    osc.connect(gain);
    if (playback.audioGraph) {
        gain.connect(playback.audioGraph.master.gain);
    }
    const signatures: any = TIME_SIGNATURES;
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
    const firstChord: any = arranger.stepMap?.[0]?.chord || {
        rootMidi: 60,
        scale: [0, 2, 4, 5, 7, 9, 11],
        intervals: [0, 4, 7],
    };
    const pickupStepInfo = getStepInfo(
        pickupStep,
        ts,
        arranger.measureMap || ([] as any),
        signatures,
    );

    const soloistNote = getSoloistNote(
        state,
        firstChord,
        firstChord,
        pickupStep,
        soloist.audio.lastFreq as any,
        soloist.octave,
        soloist.style as any,
        0,
        { sectionStart: 0, sectionEnd: arranger.totalSteps || 0, bypassRhythm: false },
        pickupStepInfo,
    );

    if (soloistNote) {
        const results = Array.isArray(soloistNote) ? soloistNote : [soloistNote];
        const pickupStepSec = secondsPerStepFor(playback.bpm);
        results.forEach((res: any, voiceIndex: number) => {
            const freq = res.freq || getFrequency(res.midi);
            // convert step count to seconds via the canonical step duration.
            const duration = (res.durationSteps || 4) * pickupStepSec;

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
                humanizeSeed(pickupStep, 'soloist', voiceIndex),
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

function advanceGlobalStep(state: EnsembleState): void {
    const { playback, groove, arranger } = state;
    const effectiveBpm = playback.bpm;

    const signatures: any = TIME_SIGNATURES;
    const sInfo = getStepInfo(
        playback.step,
        signatures[arranger.timeSignature] || signatures['4/4'],
        arranger.measureMap,
        signatures,
    );
    const ts = signatures[sInfo.tsName || '4/4'] || signatures['4/4'];

    // the "unswung" grid clock advances by one plain step (a 16th) so the
    // soloistTime blend in `scheduleGlobalEvent` stays aligned with the swung
    // `nextNoteTime`.
    const stepSec = secondsPerStepFor(effectiveBpm);
    const duration = calculateStepDuration(playback.step, effectiveBpm, ts, groove);

    (playback as Mutable<typeof playback>).nextNoteTime += duration; // @direct-mutation
    (playback as Mutable<typeof playback>).unswungNextNoteTime += stepSec; // @direct-mutation
    (playback as Mutable<typeof playback>).step++; // @direct-mutation
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
 * **Invariant**: `chords.scheduledChordIndex` is always written back from the
 * cursor after every call, including null returns. This ensures that loop-back
 * resets (cursor reset to 0 inside the helper) are persisted even when no chord
 * entry covers the requested step.
 *
 * If you need to change chord-lookup behavior, edit `worker-utils.js`.
 */
function getChordAtStep(state: EnsembleState, step: number): ChordAtStep | null {
    const { arranger, chords } = state;
    const cursor = { index: chords.scheduledChordIndex || 0, sectionIndex: 0 };
    const result = _getChordAtStep(step, arranger, cursor);
    (chords as Mutable<typeof chords>).scheduledChordIndex = cursor.index; // @direct-mutation — always persist, including loop-back resets
    return result;
}

/**
 * Schedules drum sounds for a specific step.
 * Applies pocket/timing offsets, handles fills, and pushes events to the visualizer queue.
 */
function scheduleDrums(
    state: EnsembleState,
    params: any,
    dispatch: Dispatch | undefined = undefined,
): void {
    const { time, absoluteStep } = params;

    const { playback, groove, vizState, arranger } = state;

    const conductorVel = playback.conductorVelocity || 1.0;
    // #714: thread the real step so the drum grid sits in the SAME per-step shared
    // pocket the melodic lanes lock to (coordination.pocketOffset, published in the
    // drum preamble) — "one shared pocket" is then literally one, and the drum
    // timing is deterministic/loop-stable (was raw Math.random via the default args).
    const finalTime =
        time + calculatePocketOffset(playback, groove, absoluteStep, arranger.totalSteps);

    // Evaluate fills and standard groove patterns via our unified tick logic
    // This maintains 1:1 playback/export parity.
    const sectionIndex = findSectionIndexFromCursor(arranger.sectionMap, absoluteStep);
    const tickResult = generateDrumsForStep(state, absoluteStep, {
        mainCursor: { index: 0, sectionIndex: Math.max(0, sectionIndex) },
        lookaheadCursor: { index: 0, sectionIndex: 0 },
    });

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
                (groove as Mutable<typeof groove>).fillActive = false; // @direct-mutation
            }
            if (groove.pendingCrash) {
                (groove as Mutable<typeof groove>).pendingCrash = false; // @direct-mutation
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

    // Seeded per-note humanization (synth-audit Epic 0 S6): each drum piece
    // gets its own independent micro-timing + velocity wobble, replacing the
    // shared per-tick `Math.random()` jitter that moved the whole kit in
    // lockstep. Seeded on (step, piece) so looped playback reproduces exactly.
    // `humanize` is normally a 0–100 slider value; guard the divide so a
    // malformed dispatch can't fan a NaN into every drum's playTime/velocity.
    const humanizeScale = Number.isFinite(groove.humanize) ? groove.humanize / 100 : 0;

    tickResult.drumHits.forEach((hit: any) => {
        const h = humanizeNote(
            humanizeSeed(absoluteStep, 'drums', stringHash31(hit.soundName)),
            HUMANIZE_PROFILES.drums,
            humanizeScale,
        );
        const playTime = finalTime + hit.instTimeOffset + h.timeOffset;
        const velocity = hit.velocity * conductorVel * h.velocityMult;
        playDrumSound(state, hit.soundName, playTime, velocity);

        if (vizState.enabled) {
            const midiNum = DRUM_VIS_PITCHES[hit.soundName] || 36;
            queueVisualizerNoteEvent(playback, {
                track: 'drums',
                midi: midiNum,
                time: playTime,
                velocity,
                duration: 0.1,
            });
        }

        dispatchMidiDrum(state, hit.soundName, playTime, velocity);
    });
}

/**
 * Schedules drum notes directly from the worker buffer (for Resolution or pattern playback).
 */
function scheduleDrumsFromBuffer(state: EnsembleState, step: number, time: number): void {
    const { groove, playback, vizState } = state;

    const notes = groove.buffer.get(step);
    groove.buffer.delete(step);

    if (notes && notes.length > 0) {
        const conductorVel = playback.conductorVelocity || 1.0;

        notes.forEach((n: any) => {
            const { name, velocity, timingOffset } = n;
            const playTime = time + (timingOffset || 0);

            playDrumSound(state, name, playTime, velocity * conductorVel);

            if (vizState.enabled) {
                const midiNum = DRUM_VIS_PITCHES[name] || 36;
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
 */
function scheduleBass(
    state: EnsembleState,
    chordData: ChordAtStep,
    step: number,
    time: number,
): void {
    const { bass, playback, vizState, groove } = state;
    const notes = bass.buffer.get(step);
    bass.buffer.delete(step);

    // Seeded per-note humanization (synth-audit Epic 5 S5): replaces the
    // shared per-tick `t` jitter for the bass voice. Tight `bass` profile —
    // bass is a steady instrument, so the spreads are small (±14 ms timing,
    // ±10% velocity, ±3¢ detune). Seeded on `(step, 'bass')` so looped
    // playback and critique tests reproduce exactly. Guard the divide so a
    // malformed dispatch can't fan a NaN into the bass timing/velocity/pitch.
    const humanizeScale = Number.isFinite(groove.humanize) ? groove.humanize / 100 : 0;

    if (notes && notes.length > 0) {
        notes.forEach((noteEntry: any) => {
            if (noteEntry?.freq) {
                const { freq, durationSteps, velocity, timingOffset, muted, bendStartInterval } =
                    noteEntry;
                const { chord } = chordData as any;
                const h = humanizeNote(
                    humanizeSeed(step, 'bass', 0),
                    HUMANIZE_PROFILES.bass,
                    humanizeScale,
                );
                const adjustedTime = time + (timingOffset || 0) + h.timeOffset;
                // Apply detune by nudging the frequency itself — `playBassNote`
                // takes no detune param, and ±3¢ is far below any perceptual
                // pitch-class boundary so this can't accidentally bend the note.
                const detunedFreq = Number.isFinite(freq)
                    ? freq * 2 ** (h.detuneCents / 1200)
                    : freq;
                (bass as Mutable<typeof bass>).lastPlayedFreq = freq; // @direct-mutation
                const midiNum = getMidi(freq || 0) || 0;
                const { name, octave } = midiToNote(midiNum);
                // step → seconds via the canonical step duration.
                const stepSecBass = secondsPerStepFor(playback.bpm);
                const duration = (durationSteps || 4) * stepSecBass;
                const finalVel =
                    (velocity || 1.0) * (playback.conductorVelocity || 1.0) * h.velocityMult;
                if (vizState.enabled) {
                    const chordNotes = getChordMidiNotes(chord);

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
                playBassNote(
                    state,
                    detunedFreq || 0,
                    adjustedTime,
                    duration,
                    finalVel,
                    muted,
                    bendStartInterval || 0,
                );
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
 */
function scheduleSoloist(
    state: EnsembleState,
    chordData: ChordAtStep,
    step: number,
    playTime: number,
): void {
    const { soloist, playback, vizState } = state;
    const notes = soloist.audio.buffer.get(step);
    soloist.audio.buffer.delete(step);
    const soloistStepSec = secondsPerStepFor(playback.bpm);

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

        notesToPlay.forEach((noteEntry: any, voiceIndex: number) => {
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
                const { chord } = chordData as any;
                const offsetS = timingOffset || 0;

                if (!noteEntry.isDoubleStop) {
                    (soloist.audio as Mutable<typeof soloist.audio>).lastPlayedFreq = freq; // @direct-mutation
                }

                const midiNum = noteEntry.midi || getMidi(freq || 0) || 0;
                const { name, octave } = midiToNote(midiNum);
                // step → seconds via the canonical step duration.
                const duration = (durationSteps || 4) * soloistStepSec;
                const baseVel = (velocity || 1.0) * (playback.conductorVelocity || 1.0);
                const vel = baseVel * polyphonyComp;
                const finalTime = playTime + offsetS;

                // Legato detection (epic-3-soloist S1): a note that begins
                // where the previous one ended is a connected phrase note —
                // drive the dead legato/portamento path from rhythmic
                // adjacency. lastNoteEnd holds the previous soloist note's
                // finalTime+duration; a gap under half a 16th-step (slack for
                // timing-offset jitter) counts as contiguous, while a real
                // rest is at least a full step of silence. Excluded:
                // double stops (a single lastRenderedFreq can't glide a
                // chord) and notes with an explicit bend-in (the bend is an
                // intentional articulation that legato would otherwise
                // swallow — applyPitchEnvelope checks legato before bend).
                // Slack is half a step (a 16th) of the current tempo.
                const gridSlack = soloistStepSec * 0.5;
                const isLegato =
                    !noteEntry.isDoubleStop &&
                    !bendStartInterval &&
                    finalTime - soloist.audio.lastNoteEnd < gridSlack;

                playSoloNote(
                    state,
                    freq,
                    finalTime,
                    duration,
                    vel,
                    bendStartInterval || 0,
                    style,
                    isLegato,
                    vibrato,
                    // Per-note timbral humanization seed (epic-3-soloist S5) —
                    // (step, voiceIndex) so successive same-pitch notes differ
                    // yet stay deterministic for looped playback / tests.
                    humanizeSeed(step, 'soloist', voiceIndex),
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
                    const chordNotes = getChordMidiNotes(chord);

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
                (soloist.audio as Mutable<typeof soloist.audio>).lastNoteEnd = finalTime + duration; // @direct-mutation
            }
        });
    }
}

export function scheduleChordVisuals(
    state: EnsembleState,
    chordData: ChordAtStep,
    t: number,
): void {
    const { playback, chords, vizState, arranger } = state;
    if (chordData.stepInChord === 0) {
        const chordNotes = getChordMidiNotes(chordData.chord);

        if (chords.lastActiveChordIndex !== chordData.chordIndex) {
            (chords as Mutable<typeof chords>).lastActiveChordIndex = chordData.chordIndex; // @direct-mutation
        }

        // Only queue canvas events when the Visuals workspace is active.
        // Arranger highlighting is driven directly from the scheduler now.
        if (vizState.enabled) {
            // why: `chord.beats` is measured in the TS-native beat (eighths for
            // compound), so route through `secondsPerBeatFor` (which scales by
            // stepsPerBeat) for the chord-event viz lifetime rather than a bare
            // per-quarter duration.
            const tsForChordViz =
                (TIME_SIGNATURES as any)[arranger?.timeSignature] ||
                (TIME_SIGNATURES as any)['4/4'];
            queueVisualizerChordEvent(playback, {
                time: t,
                index: chordData.chordIndex,
                chordNotes,
                rootMidi: chordData.chord.rootMidi,
                intervals: chordData.chord.intervals,
                duration: chordData.chord.beats * secondsPerBeatFor(tsForChordViz, playback.bpm),
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
 * #691 — fade time for releasing the previous chord voicing when the harmony
 * changes. ~50 ms: a clean handoff (Brandon's pick) that isn't clicky.
 */
const CHORD_CHANGE_FADE = 0.05;

/**
 * #691 — decide whether to release the previous chord's (sampled) voicing.
 * Release only on a real harmony change: a different chord identity (`absName`),
 * not the first chord (`prevKey` null), not a re-strike / arpeggio of the same
 * chord (keys equal → keep ringing), not under the sustain pedal (it owns the
 * ring), and only when something is actually ringing. Pure, so it's unit-testable
 * without driving the whole scheduler.
 */
export function shouldReleasePriorVoicing(
    prevKey: string | null,
    newKey: string | null,
    sustainActive: boolean,
    activeVoiceCount: number,
): boolean {
    return (
        !sustainActive &&
        newKey !== null &&
        prevKey !== null &&
        newKey !== prevKey &&
        activeVoiceCount > 0
    );
}

/**
 * Schedules chord notes from the worker buffer.
 * Handles sustain pedal events (MIDI CC 64).
 */
function scheduleChords(
    state: EnsembleState,
    chordData: ChordAtStep,
    step: number,
    time: number,
): void {
    const { chords, playback, vizState } = state;
    const notes = chords.buffer.get(step);
    chords.buffer.delete(step);

    if (notes && notes.length > 0) {
        // #691 — release the previous voicing when the harmony changes so a
        // sustained pack (e.g. the Drawbar Organ, which holds flat at full level
        // for its whole duration) doesn't ring into the new chord. Keyed on the
        // chord's identity (`absName`), so a re-strike or arpeggio of the *same*
        // chord keeps ringing — only a real change cuts. Synth voices already
        // decay to silence; only sampled voices are tracked/cut here. Pedal down
        // leaves the ring to the sustain path.
        const mutPlayback = playback as Mutable<typeof playback>;
        // Defensive: a partially-built state (some unit-test mocks) may omit the
        // runtime field; the real slice inits it in `state/playback.ts`.
        if (!Array.isArray(mutPlayback.activeChordVoices)) {
            mutPlayback.activeChordVoices = []; // @direct-mutation
        }
        const chordKey = chordData?.chord?.absName ?? null;
        if (
            shouldReleasePriorVoicing(
                mutPlayback.lastChordKey,
                chordKey,
                Boolean(playback.sustainActive),
                mutPlayback.activeChordVoices.length,
            )
        ) {
            for (const handle of mutPlayback.activeChordVoices) {
                handle.release(time, CHORD_CHANGE_FADE);
            }
            mutPlayback.activeChordVoices = []; // @direct-mutation
        }
        if (chordKey !== null) {
            mutPlayback.lastChordKey = chordKey; // @direct-mutation
        }

        // step → seconds via the canonical step duration so chord-comp note
        // lengths match their `durationSteps` count.
        const stepSecChords = secondsPerStepFor(playback.bpm);
        // Count how many non-muted notes are in this step for volume normalization
        let numVoices = 0;
        for (let i = 0; i < notes.length; i++) {
            if (!notes[i].muted && notes[i].freq) {
                numVoices++;
            }
        }

        // synth-audit Epic 2 S1 — strum index. The synth chord voice rolls the
        // chord low→high; rank each non-muted note by ascending pitch and pass
        // that rank as `index` (the strum stagger). (Was A/B-gated on the `new`
        // voice; #649 made the reworked voice the only one, so always compute.)
        const playable: number[] = [];
        for (let i = 0; i < notes.length; i++) {
            if (!notes[i].muted && notes[i].freq) {
                playable.push(i);
            }
        }
        playable.sort((a, b) => notes[a].freq - notes[b].freq);
        const strumRank: number[] = new Array(notes.length).fill(0);
        for (let r = 0; r < playable.length; r++) {
            strumRank[playable[r]] = r;
        }

        for (let ni = 0; ni < notes.length; ni++) {
            const n = notes[ni];
            const { freq, velocity, timingOffset, durationSteps, muted, instrument, ccEvents } = n;
            const playTime = time + (timingOffset || 0);

            if (ccEvents && ccEvents.length > 0) {
                for (let ci = 0; ci < ccEvents.length; ci++) {
                    const cc = ccEvents[ci];
                    if (cc.controller === 64) {
                        const isSustain = cc.value >= 64;
                        const ccTime = playTime + (cc.timingOffset || 0);
                        updateSustain(state, isSustain, ccTime);
                        dispatchMidiChordSustain(state, cc.value, ccTime);
                    }
                }
            }

            if (!muted && freq) {
                // synth-audit Epic 2 S7 — fail-fast NaN guards. `velocity`
                // comes straight from the worker note and `duration` from
                // `durationSteps`; a non-finite value silently poisons a gain
                // or cutoff AudioParam, or makes `osc.stop(NaN)` throw and the
                // note never schedule. Catch + log here, before the voice
                // dispatch, so the bad payload is visible rather than swallowed.
                let safeVelocity = velocity;
                if (!Number.isFinite(safeVelocity)) {
                    console.warn(
                        `scheduleChords: non-finite velocity (${velocity}) — 0.5 fallback`,
                    );
                    safeVelocity = 0.5;
                }
                let duration = (durationSteps || 1) * stepSecChords;
                if (!Number.isFinite(duration)) {
                    console.warn(
                        `scheduleChords: non-finite duration (durationSteps=${durationSteps}) — one-step fallback`,
                    );
                    duration = stepSecChords;
                }
                const midiNum = getMidi(freq) || 0;
                const { name, octave } = midiToNote(midiNum);
                const voiceHandle = playNote(state, freq, playTime, duration, {
                    vol: safeVelocity,
                    index: strumRank[ni],
                    instrument: instrument || 'Piano',
                    numVoices: numVoices,
                });
                // #691 — track sampled chord voices so the next harmony change can
                // release this voicing. Skip under the pedal (it owns the ring).
                // Bounded like `heldNotes`: a long same-chord vamp re-strikes into
                // the list, but each voice self-frees, so drop the oldest (ended)
                // handle past the cap.
                if (voiceHandle && !playback.sustainActive) {
                    const acv = (playback as Mutable<typeof playback>).activeChordVoices;
                    acv.push(voiceHandle); // @direct-mutation
                    if (acv.length > 64) {
                        acv.shift(); // @direct-mutation
                    }
                }
                dispatchMidiChordNote(state, freq, safeVelocity, playTime, duration);
                if (vizState.enabled) {
                    queueVisualizerNoteEvent(playback, {
                        track: 'chords',
                        noteName: name,
                        octave,
                        midi: midiNum,
                        time: playTime,
                        duration,
                        velocity: safeVelocity,
                        ccEvents,
                    });
                }
            }
        }
    }
}

/**
 * Schedules harmony notes (pads, stabs) from the worker buffer.
 * Handles voice killing for smoother transitions.
 *
 * Exported for `tests/unit/engine/scheduler-harmony-legato.test.ts` — the
 * pad-mode legato survivor-retention partition (the `legatoMidis` block below)
 * is otherwise reachable only via the full `scheduleGlobalEvent` tick.
 */
export function scheduleHarmonies(
    state: EnsembleState,
    _chordData: ChordAtStep,
    step: number,
    time: number,
): void {
    const { harmony, playback, vizState } = state;
    const notes = harmony.buffer.get(step);
    harmony.buffer.delete(step);

    if (notes && notes.length > 0) {
        // step → seconds via the canonical step duration for harmony pads/stabs.
        const stepSecHarmony = secondsPerStepFor(playback.bpm);

        // If any note in this step is a chord start or movement,
        // clear previous voices once before scheduling the new ones.
        // why: pad-mode legato (epic-harmony-polish S1) — when at least one note
        // is a legato continuation, the blanket kill would choke voices that
        // should be held across the chord change. Instead, kill only voices
        // whose MIDI is NOT in the incoming legato set; voices in that set are
        // extended in-place by playHarmonyNote. When no legato notes are present
        // the original kill-all behavior is preserved.
        const starter = notes.find((n: any) => n.isChordStart);
        if (starter) {
            const legatoMidis = new Set<number>();
            for (let i = 0; i < notes.length; i++) {
                if (notes[i].isLegato) {
                    const lm = notes[i].midi ?? getMidi(notes[i].freq);
                    if (Number.isFinite(lm)) {
                        legatoMidis.add(lm);
                    }
                }
            }
            if (legatoMidis.size > 0 && state.harmony.activeVoices) {
                const fade = starter.killFade || 0.05;
                // B11 (#710) — schedule the release at the new chord's onset
                // (`time`), not `currentTime`. The scheduler runs ~200-400ms ahead
                // of playback, so killing at currentTime cut the prior pad early
                // instead of a smooth fade into the change (chords use `time` at
                // the activeChordVoices release above).
                const killTime = time;
                const survivors: any[] = [];
                const toKill: any[] = [];
                for (const v of state.harmony.activeVoices) {
                    if (v.midi !== null && legatoMidis.has(v.midi)) {
                        survivors.push(v);
                    } else {
                        toKill.push(v);
                    }
                }
                if (toKill.length > 0) {
                    // killActiveVoices clears the array in-place; pass a local
                    // copy so survivors are not also wiped.
                    killActiveVoices(toKill, killTime, fade);
                }
                // Rebuild activeVoices in-place to retain only survivors.
                state.harmony.activeVoices.length = 0; // @worker-mutation
                for (const v of survivors) {
                    state.harmony.activeVoices.push(v); // @worker-mutation
                }
            } else {
                // B11 (#710) — likewise schedule the blanket release at `time`.
                killHarmonyNote(state, starter.killFade || 0.05, time);
            }
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

        notes.forEach((n: any) => {
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
                isLegato,
                isBloom,
                isLatched,
                isArp,
            } = n;
            const playTime = time + (timingOffset || 0);
            const m = noteMidi || getMidi(freq);

            if (freq || m) {
                const duration = (durationSteps || 1) * stepSecHarmony;
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
                    !!isLegato,
                    !!isBloom,
                    !!isLatched,
                    !!isArp,
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
 */
export function scheduleGlobalEvent(
    state: EnsembleState,
    step: number,
    swungTime: number,
    dispatch: Dispatch | undefined = undefined,
): void {
    const { arranger, playback, groove, soloist, chords, bass, harmony, vizState } = state;
    const signatures: any = TIME_SIGNATURES;
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
            (groove as Mutable<typeof groove>).snareMask = snareMask; // @direct-mutation
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
    // Legacy shared per-tick timing jitter. Drums no longer use this — S6 gave
    // them independent seeded humanization (`humanizeNote`). Bass, chords,
    // harmonies and the soloist still ride this shared `t` until Epics 5/2/1/3
    // migrate each to `humanizeNote`; remove this line once they have.
    const t = swungTime + (Math.random() - 0.5) * (groove.humanize / 100) * 0.025;

    if (playback.metronome && stepInfo.isBeatStart && playback.audio) {
        let freq = stepInfo.isMeasureStart ? 1000 : stepInfo.isGroupStart ? 800 : 600;
        if (ts.beats % 2 === 0 && stepInfo.beatIndex === ts.beats / 2 && !stepInfo.isGroupStart) {
            freq = 800; // Accented middle beat for simple meters
        }

        const osc = playback.audio.createOscillator();
        const g = playback.audio.createGain();
        osc.connect(g);
        if (playback.audioGraph) {
            g.connect(playback.audioGraph.master.gain);
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

        const chordDataForDrums = getChordAtStep(state, step);
        const sectionId = chordDataForDrums?.chord?.sectionId || null;

        // --- Port Turnaround Logic from Worker ---
        const stepsPerBar = spm;
        const isTurnaround = isSectionTurnaround(step, arranger.sectionMap, stepsPerBar, 1);

        scheduleDrums(
            state,
            {
                step: drumStep,
                // Drums take the un-jittered base time: S6 humanizes each drum
                // piece independently inside `scheduleDrums`, so they no longer
                // ride the shared per-tick `t` jitter (that would double up).
                time: swungTime,
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

    const chordData = getChordAtStep(state, step);
    if (chordData) {
        if (chordData.chord.key && chordData.chord.key !== playback.currentKey) {
            (playback as Mutable<typeof playback>).currentKey = chordData.chord.key as any; // @direct-mutation
            window.dispatchEvent(
                new CustomEvent('key-change', { detail: { key: playback.currentKey } }),
            );
        }
        scheduleChordVisuals(state, chordData, t);
        if (bass.enabled) {
            // S5: bass migrated to per-note `humanizeNote` inside `scheduleBass`,
            // so it takes the un-jittered `swungTime` (riding the shared `t`
            // would double up). Chords/harmonies/soloist still ride `t` until
            // their respective humanize stories migrate them.
            scheduleBass(state, chordData, step, swungTime);
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
 */
function syncAndFlushWorker(
    state: EnsembleState,
    step: number,
    dispatch: Dispatch | undefined = undefined,
): void {
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
            lastFreq: soloist.audio.lastFreq,
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
            instruments: groove.instruments.map((i: any) => ({
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
    soloist.audio.buffer.clear();
    harmony.buffer.clear();
    if (dispatch) {
        dispatch(ACTIONS.SET_PARAM, { module: 'groove', param: 'fillActive', value: false });
    } else {
        (groove as Mutable<typeof groove>).fillActive = false; // @direct-mutation
    }

    killAllNotes(state);
    flushWorker(step, syncData as any);
    restoreGains(state);
}
