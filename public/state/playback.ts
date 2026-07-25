import { deepSignal } from 'deepsignal';
import type { Action, GlobalContext, Mutable } from '../types.js';
import { ACTIONS } from '../types.js';

export type { GlobalContext };

export const playback = deepSignal<GlobalContext>({
    audio: null,
    audioGraph: null,
    isPlaying: false,
    bpm: 100,
    nextNoteTime: 0.0,
    unswungNextNoteTime: 0.0,
    scheduleAheadTime: 0.2,
    step: 0,
    currentSectionId: null,
    startStep: 0,
    loopStartStep: -1,
    loopEndStep: -1,
    rampBpm: false,
    rampBpmPerLoop: 4,
    rampStartPct: 0.66,
    rampBpmTarget: 0,
    drawQueue: [],
    isCountingIn: false,
    countInBeat: 0,
    isDrawing: false,
    palette: 'after-hours',
    mode: 'auto',
    wakeLock: null,
    bandIntensity: 0.35,
    complexity: 0.3,
    autoIntensity: true,
    practiceMode: true,
    metronome: false,
    applyPresetSettings: false,
    sustainActive: false,
    songMode: true,
    sessionTimer: 5,
    debugSoloist: false,
    loopLimit: 0,
    currentLoopCount: 0,
    sessionStartTime: 0,
    isEndingPending: false,
    intent: {
        anticipation: 0.2,
        layBack: 0,
    },
    lastActiveDrumElements: null,
    heldNotes: new Set(),
    activeChordVoices: [],
    lastChordKey: null,
    lastPlayingStep: -1,
    workerLogging: false,
    suspendTimeout: null,
    currentKey: null,
    conductorVelocity: 1.0,
    masterVolume: 0.4,
    countIn: true,
    visualFlash: false,
    qualityColors: true, // color chord symbols by harmonic quality on the chart
    toasts: [],
    flashIntensity: 0,
    updateAvailable: false,
    resolutionTriggered: false,
    isScheduling: false,
    chartLocked: true,
    modals: {
        settings: false,
        share: false,
        surpriseMe: false,
        manual: false,
        // Set true when the app is loaded with ?autoplay=1 (audition permalink).
        // Renders the AuditionOverlay so a single click satisfies the browser
        // autoplay gesture requirement and starts the rendered scene.
        audition: false,
    },
    settingsTab: 'playback',
});

export function playbackReducer(action: Action): boolean {
    const p = playback as Mutable<typeof playback>;
    switch (action.type) {
        case ACTIONS.RESET_STATE:
            p.bpm = 100;
            p.palette = 'after-hours';
            p.mode = 'auto';
            p.bandIntensity = 0.35;
            p.complexity = 0.3;
            p.autoIntensity = true;
            p.metronome = false;
            p.countIn = true;
            p.visualFlash = false;
            p.qualityColors = true;
            p.sessionTimer = 5;
            p.applyPresetSettings = false;
            p.conductorVelocity = 1.0;
            p.updateAvailable = false;
            return true;
        case ACTIONS.SET_UPDATE_AVAILABLE:
            p.updateAvailable = !!action.payload;
            return true;
        case ACTIONS.TOGGLE_PLAY:
            p.isPlaying = !p.isPlaying;
            if (p.isPlaying) {
                p.sessionStartTime = performance.now();
                p.currentLoopCount = 0;
                // #1021 — the woodshed drill starts here. If a tempo ramp is armed
                // on a live loop, the CURRENT tempo is the goal: capture it as the
                // target, then drop to the start speed (rampStartPct of target) so
                // the scheduler can climb back up to it a step per loop. Captured at
                // START (not arm-time) so whatever BPM you set before pressing play
                // is the tempo you earn your way back to.
                if (p.rampBpm && p.loopStartStep >= 0 && p.loopEndStep > p.loopStartStep) {
                    p.rampBpmTarget = p.bpm;
                    p.bpm = Math.max(40, Math.round(p.bpm * p.rampStartPct));
                }
            } else {
                // Stopping ends any section-practice drill (#1016): the loop and
                // the start-from-here seed are transient, invoked from the
                // stopped-state popover. Clearing here means the global Play
                // button always resumes normal full-form playback from the top.
                p.startStep = 0;
                p.loopStartStep = -1;
                p.loopEndStep = -1;
                // Ramp drill ends with the loop (#1021): restore the goal tempo so
                // stopping mid-climb never strands you at a slow practice speed
                // (reaching the target already leaves you there), then disarm.
                if (p.rampBpmTarget > 0) {
                    p.bpm = p.rampBpmTarget;
                    p.rampBpmTarget = 0;
                }
                p.rampBpm = false;
            }
            if (p.autoIntensity) {
                p.bandIntensity = 0.35;
            }
            return true;
        case ACTIONS.SET_BPM:
            p.bpm = Math.max(40, Math.min(240, parseInt(String(action.payload), 10)));
            return true;
        case ACTIONS.SET_MODAL_OPEN:
            if (Object.hasOwn(playback.modals, action.payload.modal)) {
                // `as any` is load-bearing here: deepSignal types each modal flag as
                // `Signal<boolean> & true | Signal<boolean> & false`, so a dynamic-key
                // WRITE won't accept a plain boolean under a `keyof` narrow (TS2322).
                // The read-side sibling in GlobalShortcuts.tsx narrows fine; this one
                // can't. Guarded by the `Object.hasOwn` check above.
                (playback.modals as any)[action.payload.modal] = !!action.payload.open;
                return true;
            }
            return false;
        case ACTIONS.SET_SETTINGS_TAB:
            p.settingsTab = String(action.payload);
            return true;
        case ACTIONS.SET_CHART_LOCKED:
            p.chartLocked = !!action.payload;
            return true;
        case ACTIONS.SET_PARAM:
            if (action.payload.module === 'playback') {
                (playback as Record<string, unknown>)[action.payload.param] = action.payload.value;
                return true;
            }
            break;
        case ACTIONS.SET_BAND_INTENSITY:
            // synth-audit Epic 2 S7 — fail-fast NaN guard. A non-finite
            // payload would clamp to NaN (`Math.max(0, Math.min(1, NaN))`),
            // poisoning every consumer's velocity/cutoff math downstream.
            // Catch + log, keep the previous value rather than swallow it.
            if (!Number.isFinite(action.payload)) {
                console.warn(
                    `SET_BAND_INTENSITY: non-finite payload (${action.payload}) — ignored`,
                );
                return false;
            }
            p.bandIntensity = Math.max(0, Math.min(1, action.payload));
            return true;
        case ACTIONS.SET_COMPLEXITY:
            p.complexity = Math.max(0, Math.min(1, action.payload));
            return true;
        case ACTIONS.SET_AUTO_INTENSITY:
            p.autoIntensity = !!action.payload;
            return true;
        case ACTIONS.SET_METRONOME:
            p.metronome = action.payload;
            return true;
        case ACTIONS.SET_PRESET_SETTINGS_MODE:
            p.applyPresetSettings = action.payload;
            return true;
        case ACTIONS.SET_SONG_MODE:
            p.songMode = !!action.payload;
            return true;
        case ACTIONS.SET_SESSION_TIMER:
            p.sessionTimer = action.payload;
            return true;
        case ACTIONS.SET_ENDING_PENDING:
            p.isEndingPending = action.payload;
            return true;
        case ACTIONS.SET_START_STEP:
            // Section-practice (#1016): seed the step the next play starts from.
            p.startStep = Number.isFinite(action.payload) ? Math.max(0, action.payload) : 0;
            return true;
        case ACTIONS.SET_PRACTICE_LOOP:
            // Section-practice (#1016): `null` clears the loop; otherwise fold
            // playback within [start, end). An empty/inverted range clears too.
            if (
                action.payload &&
                Number.isFinite(action.payload.start) &&
                Number.isFinite(action.payload.end) &&
                action.payload.end > action.payload.start
            ) {
                p.loopStartStep = Math.max(0, action.payload.start);
                p.loopEndStep = action.payload.end;
                // A loop always begins at its own start, so seed it atomically
                // here — the caller needn't also dispatch SET_START_STEP.
                p.startStep = p.loopStartStep;
            } else {
                // Clearing a loop (e.g. the mid-play badge tap) leaves startStep
                // alone — the playhead flows on from wherever it is.
                p.loopStartStep = -1;
                p.loopEndStep = -1;
                // A tempo ramp needs a live loop; clearing the loop disarms it
                // (#1021). Restore the goal tempo first so a mid-climb clear never
                // leaves you at a slow practice speed.
                if (p.rampBpmTarget > 0) {
                    p.bpm = p.rampBpmTarget;
                    p.rampBpmTarget = 0;
                }
                p.rampBpm = false;
            }
            return true;
        case ACTIONS.SET_PRACTICE_RAMP:
            // Practice tempo-ramp config (#1021). `null` disarms; otherwise merge
            // the provided fields, clamped to sane drill bounds. The goal tempo is
            // whatever BPM is set when playback starts (see TOGGLE_PLAY); here we
            // only carry the arming flag and the two knobs — the start fraction and
            // the per-loop climb.
            if (action.payload === null) {
                p.rampBpm = false;
            } else {
                if (typeof action.payload.enabled === 'boolean') {
                    p.rampBpm = action.payload.enabled;
                }
                if (Number.isFinite(action.payload.perLoop)) {
                    p.rampBpmPerLoop = Math.max(1, Math.min(20, action.payload.perLoop as number));
                }
                if (Number.isFinite(action.payload.startPct)) {
                    // 40%–95% of the goal — below 40 is a pointless crawl, above 95
                    // isn't a ramp.
                    p.rampStartPct = Math.max(
                        0.4,
                        Math.min(0.95, action.payload.startPct as number),
                    );
                }
            }
            return true;
        case ACTIONS.TRIGGER_EMERGENCY_LOOKAHEAD:
            if (p.scheduleAheadTime < 0.4) {
                p.scheduleAheadTime = p.scheduleAheadTime * 2.0;
                console.warn(
                    `[Performance] Emergency Lookahead Triggered: ${p.scheduleAheadTime}s`,
                );
                setTimeout(() => {
                    p.scheduleAheadTime = 0.2;
                    console.warn('[Performance] Lookahead reset to normal.');
                }, 10000);
            }
            return true;
        case ACTIONS.UPDATE_CONDUCTOR_DECISION:
            if (action.payload.velocity) {
                p.conductorVelocity = action.payload.velocity;
            }
            if (action.payload.intent) {
                if (action.payload.intent.anticipation !== undefined) {
                    playback.intent.anticipation = action.payload.intent.anticipation;
                }
                if (action.payload.intent.layBack !== undefined) {
                    playback.intent.layBack = action.payload.intent.layBack;
                }
            }
            break;
        case ACTIONS.SHOW_TOAST: {
            const toast = action.payload;
            const isObj = typeof toast === 'object' && toast !== null;
            const id = (isObj ? toast.id : undefined) || Math.random().toString(36).substr(2, 9);
            const message = String((isObj ? toast.message : undefined) || toast);
            const actions = isObj && Array.isArray(toast.actions) ? toast.actions : undefined;
            const entry: { id: string; message: string; actions?: string[] } = { id, message };
            if (actions && actions.length > 0) {
                entry.actions = actions;
            }
            p.toasts = [...p.toasts, entry];
            return true;
        }
        case 'TOAST_EXPIRED':
            p.toasts = p.toasts.filter((t) => t.id !== action.payload);
            return true;
        case ACTIONS.TRIGGER_FLASH:
            p.flashIntensity = action.payload || 0.25;
            return true;
        case 'FLASH_EXPIRED':
            p.flashIntensity = 0;
            return true;
    }
    return false;
}
