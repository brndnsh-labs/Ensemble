import { deepSignal } from 'deepsignal';
import { ACTIONS } from '../types.js';

/**
 * @typedef {Object} Instrument
 * @property {string} name - Instrument name (e.g., 'Kick').
 * @property {string} symbol - Display emoji/symbol.
 * @property {Array<number>} steps - Sequencer steps (0=off, 1=on, 2=accent).
 * @property {boolean} muted - Whether the instrument is muted.
 */

/**
 * @typedef {Object} PocketState
 * @property {number} globalDrive - -1.0 (behind) to 1.0 (ahead)
 * @property {number} tightness - 0.0 (loose/jittery) to 1.0 (grid-locked)
 * @property {number} bassGravity - 0.0 to 1.0 (how much bass follows Kick)
 * @property {number} chordGravity - 0.0 to 1.0 (how much chords follow Bass)
 * @property {number} soloistGravity - 0.0 to 1.0 (how much soloist follows Snare/Hats)
 */

/**
 * @typedef {Object} GrooveState
 * @property {boolean} enabled - Whether the drum engine is active.
 * @property {Array<Instrument>} instruments - List of drum instruments.
 * @property {number} volume - Volume level.
 * @property {number} reverb - Reverb level.
 * @property {number} measures - Number of measures in the loop (1-8).
 * @property {number} currentMeasure - Currently visible measure for editing.
 * @property {boolean} followPlayback - Whether to scroll grid during playback.
 * @property {number} humanize - Humanization percentage (0-100).
 * @property {number} swing - Swing percentage (0-100).
 * @property {string} swingSub - Swing subdivision ('8th' or '16th').
 * @property {string} lastDrumPreset - Name of the last loaded drum preset.
 * @property {string} seed - Thematic seed for deterministic generation.
 * @property {any} audioBuffers - Cache for decoded drum samples.
 * @property {string} genreFeel - Active genre for procedural nuances ('Rock', 'Jazz', 'Funk').
 * @property {boolean} larsMode - Whether "Lars Mode" (tempo drift) is active.
 * @property {number} larsIntensity - Intensity of tempo drift (0.0 - 1.0).
 * @property {boolean} fillActive - Whether a drum fill is currently being played.
 * @property {Object} fillSteps - Transient storage for the generated fill pattern.
 * @property {GainNode|null} lastHatGain - Last gain node for the hi-hat.
 * @property {GainNode|null} lastRideGain - Last gain node for the ride cymbal.
 * @property {number} fillStartStep - Step index where the current fill began.
 * @property {number} fillLength - Length of the current fill in steps.
 * @property {number} snareMask - 16-bit mask of the current snare pattern.
 * @property {boolean} pendingCrash - Whether a crash cymbal is queued for the next downbeat.
 * @property {boolean} creativity - Whether generative fills/variations are enabled.
 * @property {Object} sectionSeedMap - Random seeds for each song section.
 * @property {PocketState} pocket - Unified rhythmic pocket configuration.
 * @property {string} lastSmartGenre - Last selected smart genre.
 * @property {{genreName?: string, feel?: string}|null} pendingGenreFeel - Genre queued for the next measure.
 * @property {number|null} genreSwitchCountdown - Beats until genre switch.
 * @property {Array<any>|null} orchestrationMap - Pre-calculated section orchestration map.
 * @property {Record<number, any>|null} fillMap - Pre-calculated song-wide fill map.
 * @property {Record<number, any>|null} accentMap - Pre-calculated soloist accent catching map.
 * @property {Array<any>|null} variations - Pre-calculated pattern variations for the current preset.
 * @property {Map<number, any>} buffer - Map of scheduled drum events.
 */
/**
 * @type {import('deepsignal').DeepSignal<GrooveState>}
 */
export const groove = deepSignal({
    enabled: true,
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
    volume: 0.5,
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
    larsMode: false,
    larsIntensity: 0.5,
    lastSmartGenre: 'Rock',
    pendingGenreFeel: null,
    genreSwitchCountdown: null,
    orchestrationMap: null,
    fillMap: null,
    accentMap: null,
    fillActive: false,
    fillSteps: {},
    buffer: new Map(),
    lastHatGain: null,
    lastRideGain: null,
    fillStartStep: 0,
    fillLength: 0,
    snareMask: 0,
    pendingCrash: false,
    creativity: false,
    sectionSeedMap: {},
    variations: null,
    // --- Unified Rhythmic Pocket System ---
    pocket: {
        globalDrive: 0, // -1.0 (behind) to 1.0 (ahead)
        tightness: 0.5, // 0.0 (loose/jittery) to 1.0 (grid-locked)
        bassGravity: 0.8, // 0.0 to 1.0 (how much bass follows Kick)
        chordGravity: 0.6, // 0.0 to 1.0 (how much chords follow Bass)
        soloistGravity: 0.4, // 0.0 to 1.0 (how much soloist follows Snare/Hats)
    },
});

/**
 * @param {string} action
 * @param {any} payload
 * @param {import('./playback.js').GlobalContext} playback
 */
export function grooveReducer(action, payload, playback) {
    switch (action) {
        case ACTIONS.UPDATE_GB:
            for (const key in payload) {
                if (Object.hasOwn(groove, key)) {
                    /** @type {any} */ (groove)[key] = payload[key];
                }
            }
            return true;
        case ACTIONS.SET_PARAM:
            if (
                payload.module === 'groove' ||
                payload.module === 'drum' ||
                payload.module === 'drums'
            ) {
                /** @type {any} */ (groove)[payload.param] = payload.value;
                return true;
            }
            break;
        case ACTIONS.RESET_STATE:
            groove.enabled = true;
            groove.volume = 0.5;
            groove.reverb = 0.2;
            groove.swing = 0;
            groove.swingSub = '8th';
            groove.genreFeel = 'Rock';
            groove.lastSmartGenre = 'Rock';
            groove.measures = 1;
            groove.currentMeasure = 0;
            groove.orchestrationMap = null;
            groove.fillMap = null;
            groove.accentMap = null;

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
            groove.currentMeasure = parseInt(payload, 10);
            return true;
        case ACTIONS.SET_SWING:
            groove.swing = payload;
            return true;
        case ACTIONS.SET_SWING_SUB:
            groove.swingSub = payload;
            return true;
        case ACTIONS.SET_HUMANIZE:
            groove.humanize = payload;
            return true;
        case ACTIONS.SET_VOLUME:
            if (
                payload.module === 'groove' ||
                payload.module === 'drum' ||
                payload.module === 'drums'
            ) {
                groove.volume = payload.value;
                return true;
            }
            return false;
        case ACTIONS.SET_REVERB:
            if (
                payload.module === 'groove' ||
                payload.module === 'drum' ||
                payload.module === 'drums'
            ) {
                groove.reverb = payload.value;
                return true;
            }
            return false;
        case ACTIONS.SET_LARS_MODE:
            groove.larsMode = !!payload;
            return true;
        case ACTIONS.SET_LARS_INTENSITY:
            groove.larsIntensity = Math.max(0, Math.min(1, payload));
            return true;
        case ACTIONS.SET_GROOVE_SEED:
            if (!groove.sectionSeedMap) {
                groove.sectionSeedMap = {};
            }
            /** @type {any} */ (groove.sectionSeedMap)[payload.sectionId] = payload.seed;
            return true;
        case ACTIONS.SET_GENRE_COUNTDOWN:
            if (groove.genreSwitchCountdown !== payload) {
                groove.genreSwitchCountdown = payload;
                return true;
            }
            return false;
        case ACTIONS.SET_GENRE_FEEL:
            if (playback.isPlaying) {
                groove.pendingGenreFeel = payload;
                groove.lastSmartGenre = payload.genreName || groove.lastSmartGenre;
            } else {
                groove.genreFeel = payload.feel;
                groove.pendingGenreFeel = null;
                groove.lastSmartGenre = payload.genreName || groove.lastSmartGenre;
                // DeepSignal handles nested reactivity, but we still map to ensure fresh references
                // for any legacy components that might rely on shallow comparison.
                groove.instruments = groove.instruments.map((inst) => ({
                    ...inst,
                    steps: [...inst.steps],
                }));

                if (payload.swing !== undefined) {
                    groove.swing = payload.swing;
                }
                if (payload.sub !== undefined) {
                    groove.swingSub = payload.sub;
                }
            }
            return true;
        case ACTIONS.TRIGGER_FILL:
            groove.fillSteps = payload.steps;
            groove.fillActive = true;
            groove.fillStartStep = payload.startStep;
            groove.fillLength = payload.length;
            groove.pendingCrash = !!payload.crash;
            return true;
    }
    return false;
}
