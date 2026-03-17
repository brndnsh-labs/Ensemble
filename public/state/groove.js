import { ACTIONS } from '../types.js';

/**
 * @typedef {Object} Instrument
 * @property {string} name - Instrument name (e.g., 'Kick').
 * @property {string} symbol - Display emoji/symbol.
 * @property {Array<number>} steps - Sequencer steps (0=off, 1=on, 2=accent).
 * @property {boolean} muted - Whether the instrument is muted.
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
 * @property {Object} audioBuffers - Cache for decoded drum samples.
 * @property {string} genreFeel - Active genre for procedural nuances ('Rock', 'Jazz', 'Funk').
 * @property {boolean} larsMode - Whether "Lars Mode" (tempo drift) is active.
 * @property {number} larsIntensity - Intensity of tempo drift (0.0 - 1.0).
 * @property {boolean} fillActive - Whether a drum fill is currently being played.
 * @property {Object} fillSteps - Transient storage for the generated fill pattern.
 * @property {string} activeTab - Currently active UI tab.
 * @property {string} mobileTab - Currently active mobile tab.
 * @property {number|null} lastHatGain - Last velocity for the hi-hat (for dynamics).
 * @property {number} fillStartStep - Step index where the current fill began.
 * @property {number} fillLength - Length of the current fill in steps.
 * @property {number} snareMask - 16-bit mask of the current snare pattern.
 * @property {boolean} pendingCrash - Whether a crash cymbal is queued for the next downbeat.
 * @property {boolean} creativity - Whether generative fills/variations are enabled.
 * @property {Object} sectionSeedMap - Random seeds for each song section.
 * @property {number} gridVersion - Counter for grid UI updates.
 * @property {Object} pocket - Unified rhythmic pocket configuration.
 * @property {string} lastSmartGenre - Last selected smart genre.
 * @property {string|null} pendingGenreFeel - Genre queued for the next measure.
 * @property {number|null} genreSwitchCountdown - Beats until genre switch.
 * @property {Map} buffer - Map of scheduled drum events.
 */
export const groove = {
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
    audioBuffers: {},
    genreFeel: 'Rock',
    larsMode: false,
    larsIntensity: 0.5,
    lastSmartGenre: 'Rock',
    pendingGenreFeel: null,
    genreSwitchCountdown: null,
    fillActive: false,
    fillSteps: {},
    buffer: new Map(),
    activeTab: 'smart',
    mobileTab: 'chords',
    lastHatGain: null,
    fillStartStep: 0,
    fillLength: 0,
    snareMask: 0,
    pendingCrash: false,
    creativity: false,
    sectionSeedMap: {},
    gridVersion: 0,
    // --- Unified Rhythmic Pocket System ---
    pocket: {
        globalDrive: 0, // -1.0 (behind) to 1.0 (ahead)
        tightness: 0.5, // 0.0 (loose/jittery) to 1.0 (grid-locked)
        bassGravity: 0.8, // 0.0 to 1.0 (how much bass follows Kick)
        chordGravity: 0.6, // 0.0 to 1.0 (how much chords follow Bass)
        soloistGravity: 0.4, // 0.0 to 1.0 (how much soloist follows Snare/Hats)
    },
};

export function grooveReducer(action, payload, playback) {
    switch (action) {
        case ACTIONS.SET_PARAM:
            if (
                payload.module === 'groove' ||
                payload.module === 'drum' ||
                payload.module === 'drums'
            ) {
                groove[payload.param] = payload.value;
                return true;
            }
            break;
        case ACTIONS.RESET_STATE:
            Object.assign(groove, {
                enabled: true,
                volume: 0.5,
                reverb: 0.2,
                swing: 0,
                swingSub: '8th',
                genreFeel: 'Rock',
                activeTab: 'smart',
                lastSmartGenre: 'Rock',
                measures: 1,
                currentMeasure: 0,
            });
            Object.assign(groove.pocket, {
                globalDrive: 0,
                tightness: 0.5,
                bassGravity: 0.8,
                chordGravity: 0.6,
                soloistGravity: 0.4,
            });
            groove.instruments.forEach((inst) => {
                inst.steps.fill(0);
                inst.muted = false;
            });
            return true;
        case ACTIONS.SET_POCKET_CONFIG:
            Object.assign(groove.pocket, payload);
            return true;
        case ACTIONS.SET_GROOVE_STEPS: {
            const inst = groove.instruments.find((i) => i.name === payload.instrument);
            if (inst) {
                inst.steps.fill(0);
                payload.steps.forEach((v, i) => {
                    if (i < 128) {
                        inst.steps[i] = v;
                    }
                });
                return true;
            }
            return false;
        }
        case ACTIONS.SET_ACTIVE_MEASURE:
            Object.assign(groove, { currentMeasure: parseInt(payload, 10) });
            return true;
        case ACTIONS.SET_SWING:
            Object.assign(groove, { swing: payload });
            return true;
        case ACTIONS.SET_SWING_SUB:
            Object.assign(groove, { swingSub: payload });
            return true;
        case ACTIONS.SET_HUMANIZE:
            Object.assign(groove, { humanize: payload });
            return true;
        case ACTIONS.SET_VOLUME:
            if (
                payload.module === 'groove' ||
                payload.module === 'drum' ||
                payload.module === 'drums'
            ) {
                Object.assign(groove, { volume: payload.value });
                return true;
            }
            return false;
        case ACTIONS.SET_REVERB:
            if (
                payload.module === 'groove' ||
                payload.module === 'drum' ||
                payload.module === 'drums'
            ) {
                Object.assign(groove, { reverb: payload.value });
                return true;
            }
            return false;
        case ACTIONS.SET_FOLLOW_PLAYBACK:
            Object.assign(groove, { followPlayback: payload });
            return true;
        case ACTIONS.SET_LARS_MODE:
            Object.assign(groove, { larsMode: !!payload });
            return true;
        case ACTIONS.SET_LARS_INTENSITY:
            Object.assign(groove, { larsIntensity: Math.max(0, Math.min(1, payload)) });
            return true;
        case ACTIONS.SET_CREATIVITY:
            Object.assign(groove, { creativity: !!payload });
            return true;
        case ACTIONS.SET_GROOVE_SEED:
            if (!groove.sectionSeedMap) {
                groove.sectionSeedMap = {};
            }
            groove.sectionSeedMap[payload.sectionId] = payload.seed;
            return true;
        case ACTIONS.SET_GENRE_COUNTDOWN:
            if (groove.genreSwitchCountdown !== payload) {
                Object.assign(groove, { genreSwitchCountdown: payload });
                return true;
            }
            return false;
        case ACTIONS.SET_GENRE_FEEL:
            if (playback.isPlaying) {
                Object.assign(groove, {
                    pendingGenreFeel: payload,
                    lastSmartGenre: payload.genreName || groove.lastSmartGenre,
                });
            } else {
                const updates = {
                    genreFeel: payload.feel,
                    pendingGenreFeel: null,
                    lastSmartGenre: payload.genreName || groove.lastSmartGenre,
                    activeTab: 'smart',
                    // Create a fresh array reference to ensure UI components like SequencerGrid re-render
                    instruments: groove.instruments.map((inst) => ({
                        ...inst,
                        steps: [...inst.steps],
                    })),
                };
                if (payload.swing !== undefined) {
                    updates.swing = payload.swing;
                }
                if (payload.sub !== undefined) {
                    updates.swingSub = payload.sub;
                }
                Object.assign(groove, updates);
            }
            return true;
        case ACTIONS.SET_ACTIVE_TAB:
            if (payload.module === 'groove') {
                Object.assign(groove, { activeTab: payload.tab });
                return true;
            }
            return false;
        case ACTIONS.TRIGGER_FILL:
            Object.assign(groove, {
                fillSteps: payload.steps,
                fillActive: true,
                fillStartStep: payload.startStep,
                fillLength: payload.length,
                pendingCrash: !!payload.crash,
            });
            return true;
        case ACTIONS.STEP_TOGGLE:
            groove.gridVersion++;
            return true;
    }
    return false;
}
