import { KEY_ORDER, TIME_SIGNATURES } from './config.js';
import {
    BASS_STYLES,
    CHORD_STYLES,
    HARMONY_STYLES,
    SOLOIST_STYLES,
} from './data/instrument-styles.js';
import { GENRE_FEELS, GENRE_NAMES } from './data/smart-genres.js';
import { hydrateVoice } from './engine/instrument-registry.js';
import { resolveSoloistMode } from './engine/soloist-mode-policy.js';
import { saveCurrentState } from './persistence.js';
import { INSTRUMENT_REVERB_DEFAULTS, MIXER_SETTINGS_VERSION } from './state/instruments.js';

import { dispatch, getState, storage } from './state.js';
import type { InstrumentVoice, Mutable, Palette, ThemeMode } from './types.js';
import { ACTIONS } from './types.js';
import {
    decodeBase64Unicode,
    decompressSections,
    escapeHTML,
    generateId,
    normalizeKey,
    stripDangerousChars,
} from './utils.js';

const clamp = (val: any, min: number, max: number, defaultVal: number): number => {
    const num = typeof val === 'string' ? parseFloat(val) : Number(val);
    if (Number.isNaN(num)) {
        return defaultVal;
    }
    return Math.min(Math.max(min, num), max);
};

/**
 * Hydrate the #675 sound-source mode. A persisted boolean wins; for pre-#675
 * saves with no `autoSound`, default to **Auto** — unless the session had
 * explicitly picked a pack voice (via the old per-instrument picker), in which
 * case preserve that choice as a pin so auto-follow doesn't override it.
 */
const hydrateAutoSound = (saved: unknown, voice: InstrumentVoice): boolean =>
    typeof saved === 'boolean' ? saved : voice === 'synth';

// Mix-pass consolidation (2026-05-23) — soloist is now a single trumpet voice;
// legacy presets (neo / vowel / saxophone / shred) coerce to trumpet here so
// older saved sessions and share URLs keep loading without throwing.
const SUPPORTED_SOLOIST_PRESETS = new Set(['trumpet']);

function normalizeSoloistPreset(preset: any, fallback = 'trumpet'): string {
    return typeof preset === 'string' && SUPPORTED_SOLOIST_PRESETS.has(preset) ? preset : fallback;
}

const VALID_PALETTES = new Set<Palette>([
    'after-hours',
    'midnight',
    'high-contrast',
    'forest',
    'sunset',
    'synthwave',
]);

// Theme migration (2026-05-31) — the single `theme` value split into two axes:
// `palette` (color identity) + `mode` (auto/light/dark). Map any legacy `theme`
// from an older saved session onto the new pair so sessions keep their look.
const LEGACY_THEME_MAP: Record<string, { palette: Palette; mode: ThemeMode }> = {
    auto: { palette: 'after-hours', mode: 'auto' },
    'after-hours': { palette: 'after-hours', mode: 'dark' },
    dark: { palette: 'after-hours', mode: 'dark' },
    'lead-sheet': { palette: 'after-hours', mode: 'light' },
    light: { palette: 'after-hours', mode: 'light' },
    midnight: { palette: 'midnight', mode: 'dark' },
    'high-contrast': { palette: 'high-contrast', mode: 'dark' },
};

function migrateTheme(savedState: any): { palette: Palette; mode: ThemeMode } {
    // Prefer the new two-axis fields when present.
    if (VALID_PALETTES.has(savedState?.palette)) {
        const mode: ThemeMode = ['auto', 'light', 'dark'].includes(savedState?.mode)
            ? savedState.mode
            : 'auto';
        return { palette: savedState.palette, mode };
    }
    // Fall back to the legacy single `theme` value.
    return LEGACY_THEME_MAP[savedState?.theme] ?? { palette: 'after-hours', mode: 'auto' };
}

function decompressBandSettings(str: string): any {
    try {
        // Bound untrusted `bnd` share-URL input before decode/parse to prevent
        // memory exhaustion — mirrors the 100KB cap in decompressSections (utils.ts).
        if (!str || typeof str !== 'string' || str.length > 102400) {
            return null;
        }
        const json = decodeBase64Unicode(str);
        return JSON.parse(json);
    } catch (e) {
        console.error('Failed to decompress band settings', e);
        return null;
    }
}

/**
 * Validates and sanitizes sections array from untrusted source.
 */
function validateSections(sections: any[]): any[] {
    if (!Array.isArray(sections)) {
        return [];
    }
    const safeSections = sections.slice(0, 500);
    return safeSections.map((s, i) => {
        if (!s || typeof s !== 'object') {
            return {
                id: generateId(),
                label: `Section ${i + 1}`,
                value: '',
                key: '',
                isMinor: undefined,
                repeat: 1,
                timeSignature: '',
                seamless: false,
            };
        }

        let safeLabel = escapeHTML(s.label || `Section ${i + 1}`);
        if (safeLabel.length > 100) {
            safeLabel = safeLabel.substring(0, 100);
        }

        let safeValue = typeof s.value === 'string' ? s.value : '';
        if (safeValue.length > 1000) {
            safeValue = safeValue.substring(0, 1000);
        }
        safeValue = stripDangerousChars(safeValue);

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
            isMinor: typeof s.isMinor === 'boolean' ? s.isMinor : undefined,
            repeat: Math.min(Math.max(1, parseInt(s.repeat, 10) || 1), 64),
            timeSignature:
                typeof s.timeSignature === 'string' && TIME_SIGNATURES[s.timeSignature]
                    ? s.timeSignature
                    : '',
            seamless: !!s.seamless,
        };
    });
}

export function hydrateState(): void {
    const { playback, chords, bass, soloist, harmony, groove, arranger, vizState } = getState();
    const savedState = storage.get('currentState');
    if (savedState?.sections) {
        const shouldResetMixer = Number(savedState.mixerVersion) !== MIXER_SETTINGS_VERSION;
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

        Object.assign(arranger, {
            sections: validatedSections,
            key: validatedKey,
            timeSignature: validatedTS,
            isMinor: savedState.isMinor || false,
            notation: validatedNotation,
            lastChordPreset: savedState.lastChordPreset || 'Pop (Standard)',
            seed:
                (typeof savedState.seed === 'string' && savedState.seed) ||
                (typeof savedState.soloist?.seed === 'string' && savedState.soloist.seed) ||
                '',
            randomizeSeed:
                typeof savedState.randomizeSeed === 'boolean' ? savedState.randomizeSeed : true,
        });

        const { palette, mode } = migrateTheme(savedState);
        Object.assign(playback, {
            palette,
            mode,
            bpm: clamp(savedState.bpm, 20, 300, 100),
            bandIntensity: clamp(savedState.bandIntensity, 0, 1, 0.35),
            complexity: clamp(savedState.complexity, 0, 1, 0.3),
            autoIntensity: true,
            practiceMode: savedState.practiceMode !== undefined ? savedState.practiceMode : true,
            metronome: false,
            visualFlash: savedState.visualFlash !== undefined ? savedState.visualFlash : false,
            haptic: savedState.haptic !== undefined ? savedState.haptic : false,
            qualityColors: savedState.qualityColors !== undefined ? savedState.qualityColors : true,
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

        (vizState as Mutable<typeof vizState>).enabled =
            savedState.vizEnabled !== undefined ? savedState.vizEnabled : false; // @direct-mutation

        if (savedState.chords) {
            Object.assign(chords, {
                enabled: savedState.chords.enabled !== undefined ? savedState.chords.enabled : true,
                voice: hydrateVoice(savedState.chords.voice),
                autoSound: hydrateAutoSound(
                    savedState.chords.autoSound,
                    hydrateVoice(savedState.chords.voice),
                ),
                // #787: Acoustic's chord-style default changed 'pad' → 'arp' (the
                // fingerpick lane). A session saved under the old default would
                // otherwise reload as a static block pad with no arpeggio, so
                // upgrade that one stale default. A deliberately-chosen 'pad' on
                // any other genre is preserved.
                style:
                    savedState.groove?.genreFeel === 'Acoustic' && savedState.chords.style === 'pad'
                        ? 'arp'
                        : savedState.chords.style || 'smart',
                instrument: 'Piano',
                octave: clamp(savedState.chords.octave, 0, 127, 48),
                density: savedState.chords.density,
                volume: shouldResetMixer ? 1.0 : clamp(savedState.chords.volume, 0, 1, 1.0),
                reverb: shouldResetMixer
                    ? INSTRUMENT_REVERB_DEFAULTS.chords
                    : clamp(savedState.chords.reverb, 0, 1, INSTRUMENT_REVERB_DEFAULTS.chords),
            });
        }
        if (savedState.bass) {
            Object.assign(bass, {
                enabled: savedState.bass.enabled !== undefined ? savedState.bass.enabled : true,
                voice: hydrateVoice(savedState.bass.voice),
                autoSound: hydrateAutoSound(
                    savedState.bass.autoSound,
                    hydrateVoice(savedState.bass.voice),
                ),
                style: savedState.bass.style || 'smart',
                octave: clamp(savedState.bass.octave, 0, 127, 36),
                volume: shouldResetMixer ? 1.0 : clamp(savedState.bass.volume, 0, 1, 1.0),
                reverb: shouldResetMixer
                    ? INSTRUMENT_REVERB_DEFAULTS.bass
                    : clamp(savedState.bass.reverb, 0, 1, INSTRUMENT_REVERB_DEFAULTS.bass),
            });
        }
        if (savedState.soloist) {
            Object.assign(soloist, {
                enabled:
                    savedState.soloist.enabled !== undefined ? savedState.soloist.enabled : false,
                voice: hydrateVoice(savedState.soloist.voice),
                autoSound: hydrateAutoSound(
                    savedState.soloist.autoSound,
                    hydrateVoice(savedState.soloist.voice),
                ),
                style: savedState.soloist.style || 'smart',
                preset: normalizeSoloistPreset(savedState.soloist.preset, 'trumpet'),
                octave:
                    savedState.soloist.octave === 77 ||
                    savedState.soloist.octave === 67 ||
                    savedState.soloist.octave === undefined
                        ? 72
                        : clamp(savedState.soloist.octave, 0, 127, 72),
                volume: shouldResetMixer ? 1.0 : clamp(savedState.soloist.volume, 0, 1, 1.0),
                reverb: shouldResetMixer
                    ? INSTRUMENT_REVERB_DEFAULTS.soloist
                    : clamp(savedState.soloist.reverb, 0, 1, INSTRUMENT_REVERB_DEFAULTS.soloist),
                mode: resolveSoloistMode(
                    savedState.soloist.mode
                        ? savedState.soloist.mode
                        : savedState.soloist.doubleStops
                          ? 'guitar'
                          : 'monophonic',
                ),
                // #856 — Auto phrasing mode. Pre-#856 saves have no `autoMode`;
                // default to Auto so they pick up voice-derived guitar mode.
                autoMode:
                    typeof savedState.soloist.autoMode === 'boolean'
                        ? savedState.soloist.autoMode
                        : true,
            });
        }
        if (savedState.harmony) {
            Object.assign(harmony, {
                enabled:
                    savedState.harmony.enabled !== undefined ? savedState.harmony.enabled : false,
                voice: hydrateVoice(savedState.harmony.voice),
                autoSound: hydrateAutoSound(
                    savedState.harmony.autoSound,
                    hydrateVoice(savedState.harmony.voice),
                ),
                style: savedState.harmony.style || 'smart',
                octave: clamp(savedState.harmony.octave, 0, 127, 60),
                volume: shouldResetMixer ? 1.0 : clamp(savedState.harmony.volume, 0, 1, 1.0),
                reverb: shouldResetMixer
                    ? INSTRUMENT_REVERB_DEFAULTS.harmony
                    : clamp(savedState.harmony.reverb, 0, 1, INSTRUMENT_REVERB_DEFAULTS.harmony),
                complexity: clamp(savedState.harmony.complexity, 0, 1, 0.5),
            });
        }
        if (savedState.groove) {
            Object.assign(groove, {
                enabled: savedState.groove.enabled !== undefined ? savedState.groove.enabled : true,
                voice: hydrateVoice(savedState.groove.voice),
                autoSound: hydrateAutoSound(
                    savedState.groove.autoSound,
                    hydrateVoice(savedState.groove.voice),
                ),
                volume: shouldResetMixer ? 1.0 : clamp(savedState.groove.volume, 0, 1, 1.0),
                reverb: shouldResetMixer
                    ? INSTRUMENT_REVERB_DEFAULTS.groove
                    : clamp(savedState.groove.reverb, 0, 1, INSTRUMENT_REVERB_DEFAULTS.groove),
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
                    savedState.groove.genreFeel && GENRE_FEELS.includes(savedState.groove.genreFeel)
                        ? savedState.groove.genreFeel
                        : 'Rock',
                lastSmartGenre:
                    savedState.groove.lastSmartGenre ||
                    GENRE_NAMES.find(
                        (k) => GENRE_FEELS[GENRE_NAMES.indexOf(k)] === savedState.groove.genreFeel,
                    ) ||
                    'Rock',
                sectionSeedMap: savedState.groove.sectionSeedMap || {},
                currentMeasure: 0,
            });

            if (savedState.groove.pattern && savedState.groove.pattern.length > 0) {
                savedState.groove.pattern.forEach((savedInst: any) => {
                    const inst = groove.instruments.find((i) => i.name === savedInst.name);
                    if (inst) {
                        inst.steps.fill(0);
                        savedInst.steps.forEach((v: any, i: number) => {
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
                inputEnabled: savedState.midi.inputEnabled || false,
                // Validated against the live enumerated `inputs` list once MIDI access
                // is (re)acquired (syncMIDIInputs) — a stale/no-longer-connected device
                // id falls back to "any input" rather than silently killing play-along.
                selectedInputId: savedState.midi.selectedInputId || null,
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
        }

        if (shouldResetMixer) {
            saveCurrentState();
        }
    } else {
        dispatch(ACTIONS.RESET_STATE);
    }
    dispatch(ACTIONS.HYDRATE);
}

export function loadFromUrl(): void {
    const { arranger, groove, soloist, bass, chords, harmony } = getState();
    const params = new URLSearchParams(window.location.search);
    let hasParams = false;

    const sParam = params.get('s');
    if (sParam) {
        (arranger as Mutable<typeof arranger>).sections = decompressSections(sParam); // @direct-mutation
        hasParams = true;
    } else {
        const progParam = params.get('prog');
        if (progParam) {
            let prog = progParam;
            if (prog.length > 1000) {
                prog = prog.substring(0, 1000);
            }
            prog = stripDangerousChars(prog);
            (arranger as Mutable<typeof arranger>).sections = [
                { id: generateId(), label: 'Main', value: prog },
            ]; // @direct-mutation
            hasParams = true;
        }
    }

    if (hasParams) {
        clearChordPresetHighlight();
    }

    const keyParam = params.get('key');
    if (keyParam) {
        const rawKey = normalizeKey(keyParam);
        if (KEY_ORDER.includes(rawKey)) {
            (arranger as Mutable<typeof arranger>).key = rawKey; // @direct-mutation
        }
    }

    const tsParam = params.get('ts');
    if (tsParam) {
        if (TIME_SIGNATURES[tsParam]) {
            (arranger as Mutable<typeof arranger>).timeSignature = tsParam; // @direct-mutation
        }
    }

    const bpmParam = params.get('bpm');
    if (bpmParam) {
        const bpm = parseFloat(bpmParam);
        if (!Number.isNaN(bpm) && bpm >= 20 && bpm <= 300) {
            dispatch(ACTIONS.SET_BPM, bpm);
        }
    }

    const styleParam = params.get('style');
    if (styleParam) {
        if (CHORD_STYLES.some((s) => s.id === styleParam)) {
            dispatch(ACTIONS.SET_STYLE, { module: 'chords', style: styleParam });
        }
    }

    const genreParam = params.get('genre');
    if (genreParam) {
        if (GENRE_NAMES.includes(genreParam)) {
            (groove as Mutable<typeof groove>).lastSmartGenre = genreParam; // @direct-mutation
            (groove as Mutable<typeof groove>).genreFeel = genreParam; // @direct-mutation
        }
    }

    const intParam = params.get('int');
    if (intParam) {
        const val = parseFloat(intParam);
        if (!Number.isNaN(val)) {
            dispatch(ACTIONS.SET_BAND_INTENSITY, Math.max(0, Math.min(1, val)));
        }
    }

    const compParam = params.get('comp');
    if (compParam) {
        const val = parseFloat(compParam);
        if (!Number.isNaN(val)) {
            dispatch(ACTIONS.SET_COMPLEXITY, Math.max(0, Math.min(1, val)));
        }
    }

    const notationParam = params.get('notation');
    if (notationParam) {
        if (['roman', 'name', 'nns'].includes(notationParam)) {
            (arranger as Mutable<typeof arranger>).notation = notationParam; // @direct-mutation
        }
    }

    const tmrParam = params.get('tmr');
    if (tmrParam) {
        const tmr = parseInt(tmrParam, 10);
        if (!Number.isNaN(tmr)) {
            dispatch(ACTIONS.SET_SESSION_TIMER, clamp(tmr, 0, 60, 0));
        }
    }

    // High-fidelity band settings
    const bndParam = params.get('bnd');
    if (bndParam) {
        const band = decompressBandSettings(bndParam);
        if (band) {
            const hasMixerVersion =
                Number(band.mv || band.mixerVersion || 0) === MIXER_SETTINGS_VERSION;
            if (band.s) {
                Object.assign(soloist, {
                    enabled: !!band.s.e,
                    style: SOLOIST_STYLES.some((s) => s.id === band.s.s) ? band.s.s : soloist.style,
                    preset: normalizeSoloistPreset(band.s.p, soloist.preset),
                    octave: clamp(band.s.o, 0, 127, 72),
                    volume: hasMixerVersion ? clamp(band.s.v, 0, 1, 1.0) : 1.0,
                    reverb: hasMixerVersion
                        ? clamp(band.s.r, 0, 1, INSTRUMENT_REVERB_DEFAULTS.soloist)
                        : INSTRUMENT_REVERB_DEFAULTS.soloist,
                    mode: resolveSoloistMode(band.s.m || soloist.mode),
                    // #856 — older share URLs have no `am`; default to Auto.
                    autoMode: band.s.am === undefined ? true : !!band.s.am,
                });
                if (typeof band.s.sd === 'string') {
                    Object.assign(arranger, { seed: band.s.sd });
                }
            }
            if (band.b) {
                Object.assign(bass, {
                    enabled: !!band.b.e,
                    style: BASS_STYLES.some((s) => s.id === band.b.s) ? band.b.s : bass.style,
                    octave: clamp(band.b.o, 0, 127, 36),
                    volume: hasMixerVersion ? clamp(band.b.v, 0, 1, 1.0) : 1.0,
                    reverb: hasMixerVersion
                        ? clamp(band.b.r, 0, 1, INSTRUMENT_REVERB_DEFAULTS.bass)
                        : INSTRUMENT_REVERB_DEFAULTS.bass,
                });
            }
            if (band.c) {
                Object.assign(chords, {
                    enabled: !!band.c.e,
                    style: CHORD_STYLES.some((s) => s.id === band.c.s) ? band.c.s : chords.style,
                    octave: clamp(band.c.o, 0, 127, 48),
                    volume: hasMixerVersion ? clamp(band.c.v, 0, 1, 1.0) : 1.0,
                    reverb: hasMixerVersion
                        ? clamp(band.c.r, 0, 1, INSTRUMENT_REVERB_DEFAULTS.chords)
                        : INSTRUMENT_REVERB_DEFAULTS.chords,
                    density: clamp(band.c.d, 0, 1, 0.5),
                });
            }
            if (band.h) {
                Object.assign(harmony, {
                    enabled: !!band.h.e,
                    style: HARMONY_STYLES.some((s) => s.id === band.h.s) ? band.h.s : harmony.style,
                    octave: clamp(band.h.o, 0, 127, 60),
                    volume: hasMixerVersion ? clamp(band.h.v, 0, 1, 1.0) : 1.0,
                    reverb: hasMixerVersion
                        ? clamp(band.h.r, 0, 1, INSTRUMENT_REVERB_DEFAULTS.harmony)
                        : INSTRUMENT_REVERB_DEFAULTS.harmony,
                    complexity: clamp(band.h.c, 0, 1, 0.5),
                });
            }
            if (band.g) {
                Object.assign(groove, {
                    enabled: !!band.g.e,
                    volume: hasMixerVersion ? clamp(band.g.v, 0, 1, 1.0) : 1.0,
                    reverb: hasMixerVersion
                        ? clamp(band.g.r, 0, 1, INSTRUMENT_REVERB_DEFAULTS.groove)
                        : INSTRUMENT_REVERB_DEFAULTS.groove,
                    swing: clamp(band.g.sw, 0, 100, 0),
                    swingSub: [4, 8, 16].includes(band.g.ss) ? band.g.ss : 8,
                    humanize: clamp(band.g.hu, 0, 100, 20),
                });
            }
        }
    }

    // Top-level seed override. Lets a permalink (especially the audition
    // links produced by `npm run audition-link`) pin the soloist seed
    // without having to round-trip through the full base64 `bnd` payload.
    const seedParam = params.get('seed');
    if (seedParam) {
        const safe = stripDangerousChars(seedParam).slice(0, 64);
        if (safe) {
            (arranger as Mutable<typeof arranger>).seed = safe; // @direct-mutation
        }
    }

    // Audition permalink: show the AuditionOverlay so a single click satisfies
    // browser autoplay policy and triggers togglePlay on the now-hydrated scene.
    if (params.get('autoplay') === '1') {
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'audition', open: true });
    }
}

function clearChordPresetHighlight() {}
