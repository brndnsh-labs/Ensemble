import { deepSignal } from 'deepsignal';
import type {
    Action,
    GlobalContext,
    GrooveState,
    Instrument,
    Mutable,
    PocketState,
} from '../types.js';
import { ACTIONS } from '../types.js';

export type { GrooveState, Instrument, PocketState };

export const groove = deepSignal<GrooveState>({
    enabled: true,
    voice: 'current',
    instruments: [
        { name: 'Kick', symbol: '🥁', steps: new Array(128).fill(0), muted: false },
        { name: 'Snare', symbol: '👏', steps: new Array(128).fill(0), muted: false },
        { name: 'HiHat', symbol: '🎩', steps: new Array(128).fill(0), muted: false },
        { name: 'Open', symbol: '📀', steps: new Array(128).fill(0), muted: false },
        { name: 'Clave', symbol: '🥢', steps: new Array(128).fill(0), muted: false },
        { name: 'Conga', symbol: '🪘', steps: new Array(128).fill(0), muted: false },
        { name: 'Bongo', symbol: '🥁', steps: new Array(128).fill(0), muted: false },
        { name: 'Perc', symbol: '🪇', steps: new Array(128).fill(0), muted: false },
        { name: 'Shaker', symbol: '🧂', steps: new Array(128).fill(0), muted: false },
        { name: 'Guiro', symbol: '🥖', steps: new Array(128).fill(0), muted: false },
        { name: 'High Tom', symbol: '🪘', steps: new Array(128).fill(0), muted: false },
        { name: 'Mid Tom', symbol: '🪘', steps: new Array(128).fill(0), muted: false },
        { name: 'Low Tom', symbol: '🪘', steps: new Array(128).fill(0), muted: false },
    ],
    volume: 1.0,
    reverb: 0.2,
    measures: 1,
    currentMeasure: 0,
    followPlayback: true,
    humanize: 20,
    swing: 0,
    swingSub: '8th',
    lastDrumPreset: 'Basic Rock',
    seed: '',
    audioBuffers: {},
    genreFeel: 'Rock',
    lastSmartGenre: 'Rock',
    pendingGenreFeel: null,
    genreSwitchCountdown: null,
    orchestrationMap: null,
    fillMap: null,
    accentMap: null,
    seedTimelineStartStep: 0,
    fillActive: false,
    fillSteps: {},
    buffer: new Map(),
    lastHatGain: null,
    lastRideGain: null,
    lastCrashGain: null,
    fillStartStep: 0,
    fillLength: 0,
    snareMask: 0,
    pendingCrash: false,
    // why: generative fills/variations/entropy default ON (drum audit 2026-05-29).
    sectionSeedMap: {},
    variations: null,
    pocket: {
        globalDrive: 0, // -1.0 (behind) to 1.0 (ahead)
        tightness: 0.5, // 0.0 (loose/jittery) to 1.0 (grid-locked)
        bassGravity: 0.8, // 0.0 to 1.0 (how much bass follows Kick)
        chordGravity: 0.6, // 0.0 to 1.0 (how much chords follow Bass)
        soloistGravity: 0.4, // 0.0 to 1.0 (how much soloist follows Snare/Hats)
    },
});

export function grooveReducer(action: Action, playback: GlobalContext): boolean {
    const g = groove as Mutable<typeof groove>;
    switch (action.type) {
        case ACTIONS.UPDATE_GB:
            for (const key in action.payload) {
                if (Object.hasOwn(groove, key)) {
                    (groove as any)[key] = (action.payload as any)[key];
                }
            }
            return true;
        case ACTIONS.SET_PARAM:
            if (
                action.payload.module === 'groove' ||
                action.payload.module === 'drum' ||
                action.payload.module === 'drums'
            ) {
                (groove as any)[action.payload.param] = action.payload.value;
                return true;
            }
            break;
        case ACTIONS.RESET_STATE:
            g.enabled = true;
            g.voice = 'current';
            g.volume = 1.0;
            g.reverb = 0.2;
            g.swing = 0;
            g.swingSub = '8th';
            g.genreFeel = 'Rock';
            g.lastSmartGenre = 'Rock';
            g.measures = 1;
            g.currentMeasure = 0;
            g.orchestrationMap = null;
            g.fillMap = null;
            g.accentMap = null;
            g.seedTimelineStartStep = 0;
            g.lastHatGain = null;
            g.lastRideGain = null;
            g.lastCrashGain = null;

            groove.pocket.globalDrive = 0;
            groove.pocket.tightness = 0.5;
            groove.pocket.bassGravity = 0.8;
            groove.pocket.chordGravity = 0.6;
            groove.pocket.soloistGravity = 0.4;

            groove.instruments.forEach((inst) => {
                inst.steps.fill(0);
                inst.muted = false;
            });
            return true;
        case ACTIONS.SET_ACTIVE_MEASURE:
            g.currentMeasure = parseInt(String(action.payload), 10);
            return true;
        case ACTIONS.SET_SWING:
            g.swing = action.payload;
            return true;
        case ACTIONS.SET_SWING_SUB:
            g.swingSub = action.payload;
            return true;
        case ACTIONS.SET_HUMANIZE:
            g.humanize = action.payload;
            return true;
        case ACTIONS.SET_VOLUME:
            if (
                action.payload.module === 'groove' ||
                action.payload.module === 'drum' ||
                action.payload.module === 'drums'
            ) {
                g.volume = action.payload.value;
                return true;
            }
            return false;
        case ACTIONS.SET_REVERB:
            if (
                action.payload.module === 'groove' ||
                action.payload.module === 'drum' ||
                action.payload.module === 'drums'
            ) {
                g.reverb = action.payload.value;
                return true;
            }
            return false;
        case ACTIONS.SET_GROOVE_SEED:
            if (!groove.sectionSeedMap) {
                g.sectionSeedMap = {};
            }
            (groove.sectionSeedMap as any)[action.payload.sectionId] = action.payload.seed;
            return true;
        case ACTIONS.SET_GENRE_COUNTDOWN:
            if (groove.genreSwitchCountdown !== action.payload) {
                g.genreSwitchCountdown = action.payload;
                return true;
            }
            return false;
        case ACTIONS.SET_GENRE_FEEL:
            if (playback.isPlaying) {
                g.pendingGenreFeel = action.payload;
                g.lastSmartGenre = action.payload.genreName || groove.lastSmartGenre;
            } else {
                g.genreFeel = action.payload.feel ?? groove.genreFeel;
                g.pendingGenreFeel = null;
                g.lastSmartGenre = action.payload.genreName || groove.lastSmartGenre;
                // DeepSignal handles nested reactivity, but we still map to ensure fresh references
                // for any legacy components that might rely on shallow comparison.
                g.instruments = groove.instruments.map((inst) => ({
                    ...inst,
                    steps: [...inst.steps],
                }));

                if (action.payload.swing !== undefined) {
                    g.swing = action.payload.swing;
                }
                if (action.payload.sub !== undefined) {
                    g.swingSub = action.payload.sub;
                }
            }
            return true;
        case ACTIONS.TRIGGER_FILL:
            g.fillSteps = action.payload.steps;
            g.fillActive = true;
            g.fillStartStep = action.payload.startStep;
            g.fillLength = action.payload.length;
            g.pendingCrash = !!action.payload.crash;
            return true;
    }
    return false;
}
