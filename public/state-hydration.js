import { applyTheme } from './app-controller.js';
import { KEY_ORDER, TIME_SIGNATURES } from './config.js';
import { CHORD_STYLES, SMART_GENRES } from './presets.js';
import { dispatch, getState, storage } from './state.js';
import { ACTIONS } from './types.js';
import {
    decompressSections,
    escapeHTML,
    generateId,
    normalizeKey,
    stripDangerousChars,
} from './utils.js';

/**
 * Helper to safely clamp numeric values from storage.
 * @param {*} val - The value to check.
 * @param {number} min - Minimum allowed value.
 * @param {number} max - Maximum allowed value.
 * @param {number} defaultVal - Default if invalid.
 * @returns {number}
 */
const clamp = (val, min, max, defaultVal) => {
    const num = parseFloat(val);
    if (Number.isNaN(num)) {
        return defaultVal;
    }
    return Math.min(Math.max(min, num), max);
};

/**
 * Validates and sanitizes sections array from untrusted source.
 * @param {Array} sections
 * @returns {Array}
 */
function validateSections(sections) {
    if (!Array.isArray(sections)) {
        return [];
    }

    // 1. Limit number of sections (DoS prevention)
    const safeSections = sections.slice(0, 500);

    return safeSections.map((s, i) => {
        if (!s || typeof s !== 'object') {
            return {
                id: generateId(),
                label: `Section ${i + 1}`,
                value: '',
                key: '',
                repeat: 1,
                timeSignature: '',
                seamless: false,
            };
        }

        // 2. Sanitize Label (XSS prevention)
        let safeLabel = escapeHTML(s.label || `Section ${i + 1}`);
        if (safeLabel.length > 100) {
            safeLabel = safeLabel.substring(0, 100);
        }

        // 3. Sanitize Value (XSS prevention)
        let safeValue = typeof s.value === 'string' ? s.value : '';
        if (safeValue.length > 1000) {
            safeValue = safeValue.substring(0, 1000);
        }
        safeValue = stripDangerousChars(safeValue);

        // 4. Sanitize Key
        let safeKey = '';
        if (s.key && typeof s.key === 'string') {
            const normKey = normalizeKey(s.key);
            if (KEY_ORDER.includes(normKey)) {
                safeKey = normKey;
            }
        }

        return {
            id: s.id || generateId(),
            label: safeLabel,
            value: safeValue,
            key: safeKey,
            repeat: Math.min(Math.max(1, parseInt(s.repeat, 10) || 1), 64),
            timeSignature:
                typeof s.timeSignature === 'string' && TIME_SIGNATURES[s.timeSignature]
                    ? s.timeSignature
                    : '',
            seamless: !!s.seamless,
        };
    });
}

export function hydrateState() {
    const { playback, chords, bass, soloist, harmony, groove, arranger, vizState } = getState();
    const savedState = storage.get('currentState');
    if (savedState?.sections) {
        // --- SECURITY VALIDATION ---
        const validatedSections = validateSections(savedState.sections);

        let validatedKey = 'C';
        if (savedState.key) {
            const normKey = normalizeKey(savedState.key);
            if (KEY_ORDER.includes(normKey)) {
                validatedKey = normKey;
            }
        }

        let validatedTS = '4/4';
        if (savedState.timeSignature && TIME_SIGNATURES[savedState.timeSignature]) {
            validatedTS = savedState.timeSignature;
        }

        const validNotations = ['roman', 'name', 'nns'];
        const validatedNotation = validNotations.includes(savedState.notation)
            ? savedState.notation
            : 'roman';
        // ---------------------------

        Object.assign(arranger, {
            sections: validatedSections,
            key: validatedKey,
            timeSignature: validatedTS,
            isMinor: savedState.isMinor || false,
            notation: validatedNotation,
            lastChordPreset: savedState.lastChordPreset || 'Pop (Standard)',
        });

        Object.assign(playback, {
            theme: savedState.theme || 'auto',
            bpm: clamp(savedState.bpm, 20, 300, 100),
            bandIntensity: clamp(savedState.bandIntensity, 0, 1, 0.35),
            complexity: clamp(savedState.complexity, 0, 1, 0.3),
            autoIntensity: true,
            metronome: false,
            visualFlash: savedState.visualFlash !== undefined ? savedState.visualFlash : false,
            haptic: savedState.haptic !== undefined ? savedState.haptic : false,
            countIn: savedState.countIn !== undefined ? savedState.countIn : true,
            sessionTimer: clamp(savedState.sessionTimer, 0, 60, 5),
            songMode: savedState.songMode !== undefined ? !!savedState.songMode : true,
            applyPresetSettings:
                savedState.applyPresetSettings !== undefined
                    ? savedState.applyPresetSettings
                    : false,
            masterVolume: clamp(savedState.masterVolume, 0, 1, 0.4),
            stopAtEnd: false,
        });

        vizState.enabled = savedState.vizEnabled !== undefined ? savedState.vizEnabled : false; // @worker-mutation

        if (savedState.chords) {
            Object.assign(chords, {
                enabled: savedState.chords.enabled !== undefined ? savedState.chords.enabled : true,
                style: savedState.chords.style || 'smart',
                instrument: 'Piano',
                octave: clamp(savedState.chords.octave, 0, 127, 48), // Reasonable MIDI range
                density: savedState.chords.density,
                volume: clamp(savedState.chords.volume, 0, 1, 0.5),
                reverb: clamp(savedState.chords.reverb, 0, 1, 0.3),
                pianoRoots: savedState.chords.pianoRoots || false,
                activeTab: savedState.chords.activeTab || 'smart',
            });
        }
        if (savedState.bass) {
            Object.assign(bass, {
                enabled: savedState.bass.enabled !== undefined ? savedState.bass.enabled : true,
                style: savedState.bass.style || 'smart',
                octave: clamp(savedState.bass.octave, 0, 127, 36),
                volume: clamp(savedState.bass.volume, 0, 1, 0.45),
                reverb: clamp(savedState.bass.reverb, 0, 1, 0.05),
                activeTab: savedState.bass.activeTab || 'smart',
            });
        }
        if (savedState.soloist) {
            Object.assign(soloist, {
                enabled:
                    savedState.soloist.enabled !== undefined ? savedState.soloist.enabled : false,
                style: savedState.soloist.style || 'smart',
                preset: savedState.soloist.preset || 'trumpet',
                octave:
                    savedState.soloist.octave === 77 ||
                    savedState.soloist.octave === 67 ||
                    savedState.soloist.octave === undefined
                        ? 72
                        : clamp(savedState.soloist.octave, 0, 127, 72),
                volume: clamp(savedState.soloist.volume, 0, 1, 0.5),
                reverb: clamp(savedState.soloist.reverb, 0, 1, 0.6),
                mode: savedState.soloist.mode
                    ? savedState.soloist.mode
                    : savedState.soloist.doubleStops
                      ? 'guitar'
                      : 'monophonic',
                activeTab: savedState.soloist.activeTab || 'smart',
                leadSheetMelody: savedState.soloist.leadSheetMelody || [],
            });
        }
        if (savedState.harmony) {
            Object.assign(harmony, {
                enabled:
                    savedState.harmony.enabled !== undefined ? savedState.harmony.enabled : false,
                style: savedState.harmony.style || 'smart',
                octave: clamp(savedState.harmony.octave, 0, 127, 60),
                volume: clamp(savedState.harmony.volume, 0, 1, 0.4),
                reverb: clamp(savedState.harmony.reverb, 0, 1, 0.4),
                complexity: clamp(savedState.harmony.complexity, 0, 1, 0.5),
                activeTab: savedState.harmony.activeTab || 'smart',
            });
        }
        if (savedState.groove) {
            Object.assign(groove, {
                enabled: savedState.groove.enabled !== undefined ? savedState.groove.enabled : true,
                volume: clamp(savedState.groove.volume, 0, 1, 0.5),
                reverb: clamp(savedState.groove.reverb, 0, 1, 0.2),
                swing: clamp(savedState.groove.swing, 0, 100, 0),
                swingSub: savedState.groove.swingSub,
                measures: clamp(savedState.groove.measures, 1, 8, 1),
                humanize: clamp(savedState.groove.humanize, 0, 100, 20),
                followPlayback:
                    savedState.groove.followPlayback !== undefined
                        ? savedState.groove.followPlayback
                        : savedState.groove.autoFollow !== undefined
                          ? savedState.groove.autoFollow
                          : true,
                lastDrumPreset: savedState.groove.lastDrumPreset || 'Basic Rock',
                genreFeel:
                    savedState.groove.genreFeel &&
                    Object.values(SMART_GENRES).some((g) => g.feel === savedState.groove.genreFeel)
                        ? savedState.groove.genreFeel
                        : 'Rock',
                larsMode: savedState.groove.larsMode || false,
                larsIntensity: clamp(savedState.groove.larsIntensity, 0, 1, 0.5),
                lastSmartGenre:
                    savedState.groove.lastSmartGenre ||
                    Object.keys(SMART_GENRES).find(
                        (k) => SMART_GENRES[k].feel === savedState.groove.genreFeel,
                    ) ||
                    'Rock',
                activeTab: savedState.groove.activeTab || 'smart',
                mobileTab: savedState.groove.mobileTab || 'chords',
                creativity:
                    savedState.groove.creativity !== undefined
                        ? !!savedState.groove.creativity
                        : false,
                sectionSeedMap: savedState.groove.sectionSeedMap || {},
                currentMeasure: 0,
            });

            if (savedState.groove.pattern && savedState.groove.pattern.length > 0) {
                savedState.groove.pattern.forEach((savedInst) => {
                    const inst = groove.instruments.find((i) => i.name === savedInst.name);
                    if (inst) {
                        inst.steps.fill(0);
                        savedInst.steps.forEach((v, i) => {
                            if (i < 128) {
                                inst.steps[i] = v;
                            }
                        });
                    }
                });
            }
        }

        if (savedState.midi) {
            dispatch(ACTIONS.SET_MIDI_CONFIG, {
                enabled: savedState.midi.enabled || false,
                selectedOutputId: savedState.midi.selectedOutputId || null,
                chordsChannel: savedState.midi.chordsChannel || 1,
                bassChannel: savedState.midi.bassChannel || 2,
                soloistChannel: savedState.midi.soloistChannel || 3,
                harmonyChannel: savedState.midi.harmonyChannel || 4,
                drumsChannel: savedState.midi.drumsChannel || 10,
                latency: savedState.midi.latency || 0,
                muteLocal:
                    savedState.midi.muteLocal !== undefined ? savedState.midi.muteLocal : true,
                chordsOctave: savedState.midi.chordsOctave || 0,
                bassOctave: savedState.midi.bassOctave || 0,
                soloistOctave: savedState.midi.soloistOctave || 0,
                drumsOctave: savedState.midi.drumsOctave || 0,
                velocitySensitivity:
                    savedState.midi.velocitySensitivity !== undefined
                        ? savedState.midi.velocitySensitivity
                        : 1.0,
            });

            if (savedState.midi.enabled) {
                import('./midi-controller.js').then(({ initMIDI }) => {
                    initMIDI();
                });
            }
        }

        applyTheme(playback.theme);
    } else {
        applyTheme('auto');
    }
    dispatch('HYDRATE'); // Notify UI of all changes
}

export function loadFromUrl() {
    const { arranger, groove } = getState();
    const params = new URLSearchParams(window.location.search);
    let hasParams = false;
    if (params.get('s')) {
        arranger.sections = decompressSections(params.get('s'));
        hasParams = true;
    } else if (params.get('prog')) {
        let prog = params.get('prog');
        if (prog.length > 1000) {
            prog = prog.substring(0, 1000);
        }
        prog = stripDangerousChars(prog);
        arranger.sections = [{ id: generateId(), label: 'Main', value: prog }];
        hasParams = true;
    }
    if (hasParams) {
        clearChordPresetHighlight();
    }
    if (params.get('key')) {
        const rawKey = normalizeKey(params.get('key'));
        if (KEY_ORDER.includes(rawKey)) {
            arranger.key = rawKey;
        }
    }

    if (params.get('ts')) {
        const ts = params.get('ts');
        if (TIME_SIGNATURES[ts]) {
            arranger.timeSignature = ts;
        }
    }

    if (params.get('bpm')) {
        const bpm = parseFloat(params.get('bpm'));
        if (!Number.isNaN(bpm) && bpm >= 20 && bpm <= 300) {
            dispatch(ACTIONS.SET_BPM, bpm);
        }
    }

    if (params.get('style')) {
        const style = params.get('style');
        // Validate style against available presets
        if (CHORD_STYLES.some((s) => s.id === style)) {
            dispatch(ACTIONS.SET_STYLE, { module: 'chords', style });
        }
    }

    if (params.get('genre')) {
        const genre = params.get('genre');
        // Validate genre
        if (SMART_GENRES[genre]) {
            groove.lastSmartGenre = genre; // @worker-mutation
            groove.genreFeel = genre; // @worker-mutation
        }
    }

    if (params.get('int')) {
        const val = parseFloat(params.get('int'));
        if (!Number.isNaN(val)) {
            dispatch(ACTIONS.SET_BAND_INTENSITY, Math.max(0, Math.min(1, val)));
        }
    }

    if (params.get('comp')) {
        const val = parseFloat(params.get('comp'));
        if (!Number.isNaN(val)) {
            dispatch(ACTIONS.SET_COMPLEXITY, Math.max(0, Math.min(1, val)));
        }
    }

    if (params.get('notation')) {
        const not = params.get('notation');
        if (['roman', 'name', 'nns'].includes(not)) {
            arranger.notation = not;
        }
    }
}

function clearChordPresetHighlight() {
    // DOM manipulation not needed here as UI will reflect state
}
