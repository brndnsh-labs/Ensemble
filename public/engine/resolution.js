import { KEY_ORDER } from '../config.js';
import { getFrequency } from '../utils.js';
import { getBestInversion, getIntervals } from './chords-engine.js';

/**
 * PUBLIC/RESOLUTION.JS
 *
 * Generates the musical events for the final resolution of a song.
 * Optimized for clean "Final Button" landings on the Tonic.
 */

const RESOLUTION_NORMALIZER = 0.85; // Global tamer to prevent limiter crushing
const RESOLUTION_STAGGER = 0.012; // Max jitter in seconds for sample-accurate peak reduction

const CADENCE_PROFILES = {
    // Sharp hit on the Tonic
    BUTTON: [{ label: 'I', degree: 0, quality: 'major', beats: 4, baseVelocity: 1.0 }],

    // Standard V -> I resolution
    STANDARD_V_I: [
        { label: 'V', degree: 7, quality: 'major', beats: 2, baseVelocity: 0.75 },
        { label: 'I', degree: 0, quality: 'major', beats: 4, baseVelocity: 1.0 },
    ],

    // Jazz ii -> V -> I (Condensed)
    JAZZ_V_I: [
        { label: 'V7', degree: 7, quality: '13', beats: 2, baseVelocity: 0.7 },
        { label: 'I6/9', degree: 0, quality: '6', beats: 4, baseVelocity: 1.0 },
    ],
};

const GENRE_MAP = {
    Jazz: { profile: 'JAZZ_V_I', ritardando: 1.2 },
    Bossa: { profile: 'JAZZ_V_I', ritardando: 1.0 },
    'Neo-Soul': { profile: 'JAZZ_V_I', ritardando: 1.5 },
    Blues: { profile: 'STANDARD_V_I', ritardando: 0.8 },
    Rock: { profile: 'BUTTON', ritardando: 0.0 },
    Metal: { profile: 'BUTTON', ritardando: 0.0 },
    'Ska-Punk': { profile: 'BUTTON', ritardando: 0.0 },
    Disco: { profile: 'BUTTON', ritardando: 0.0 },
    Funk: { profile: 'BUTTON', ritardando: 0.0 },
    Acoustic: { profile: 'STANDARD_V_I', ritardando: 1.5 },
    Reggae: { profile: 'BUTTON', ritardando: 0.0 },
};

/**
 * Generates intensity-aware resolution notes with cross-instrument normalization.
 * @param {import('../types.js').EnsembleState} state
 * @param {number} step
 * @param {import('../state/arranger.js').ArrangerState} arranger
 * @param {any} enabled
 * @param {number} [bpm=100]
 * @param {any} [groove={}]
 * @param {any} [soloist={}]
 */
export function generateResolutionNotes(
    state,
    step,
    arranger,
    enabled,
    bpm = 100,
    groove = {},
    soloist = {},
) {
    /** @type {any[]} */
    const notes = [];
    const { playback } = state;
    const genre = groove.genreFeel || 'Rock';
    const config = /** @type {any} */ (GENRE_MAP)[genre] || GENRE_MAP.Rock;

    // --- Intensity Awareness ---
    // Scale the raw energy of the ending based on the current band intensity.
    // This ensures a chill track doesn't end with a jarring peak-velocity hit.
    const intensity = playback?.bandIntensity ?? 0.5;
    const intensityScale = 0.6 + intensity * 0.4; // 0.6 (min) to 1.0 (max)

    /**
     * @param {number} baseVel
     */
    const getFinalVel = (baseVel) => baseVel * intensityScale * RESOLUTION_NORMALIZER;

    /**
     * @param {number} maxMs
     */
    const getStagger = (maxMs = RESOLUTION_STAGGER) => (Math.random() - 0.5) * maxMs;

    // Use current song key as tonic
    const resolutionKey = arranger.key || 'C';
    const isMinor = arranger.isMinor;
    const keyIndex = KEY_ORDER.indexOf(resolutionKey);

    const cadenceSteps =
        /** @type {any} */ (CADENCE_PROFILES)[config.profile] || CADENCE_PROFILES.BUTTON;
    const ritardandoAmount = config.ritardando;

    // 1. Timing Map
    const spb = 60.0 / bpm;
    let currentTime = 0;
    const timingMap = cadenceSteps.map((/** @type {any} */ s, /** @type {number} */ idx) => {
        const time = currentTime;
        let duration = s.beats * spb;

        if (ritardandoAmount > 0 && idx < cadenceSteps.length - 1) {
            duration *= 1.0 + ritardandoAmount;
        }
        currentTime += duration;
        return { time, step: s };
    });

    const anchor = 60 + keyIndex; // Middle C range
    let lastMidis = [60, 64, 67];

    timingMap.forEach((/** @type {any} */ entry, /** @type {number} */ idx) => {
        const { time, step: cadenceStep } = entry;
        const isLast = idx === cadenceSteps.length - 1;
        const targetPC = (keyIndex + cadenceStep.degree) % 12;

        // Base voicing quality
        let quality = cadenceStep.quality;
        if (isMinor) {
            quality = 'minor';
        }

        const density = genre === 'Jazz' || genre === 'Neo-Soul' ? 'rich' : 'standard';
        const is7th =
            quality.includes('7') ||
            quality.includes('9') ||
            quality.includes('6') ||
            quality.includes('minor');
        const intervals = getIntervals(state, quality, is7th, density, genre, true);

        let playRoot = anchor - (anchor % 12) + targetPC;
        if (playRoot > anchor + 6) {
            playRoot -= 12;
        }
        if (playRoot < anchor - 6) {
            playRoot += 12;
        }

        const voicings = getBestInversion(
            state,
            playRoot,
            intervals,
            lastMidis,
            false,
            anchor,
            48,
            80,
            'stabs',
        );
        lastMidis = voicings;

        // --- CHORDS ---
        if (enabled.chords) {
            if (idx === 0) {
                // Initial Sustain Pedal
                notes.push({
                    midi: 0,
                    module: 'chords',
                    step,
                    timingOffset: 0,
                    ccEvents: [{ controller: 64, value: 127, timingOffset: 0 }],
                });
            }
            voicings.forEach((/** @type {number} */ m, /** @type {number} */ vIdx) => {
                const vel = getFinalVel(cadenceStep.baseVelocity || 0.85);
                // Acoustic strum + global stagger
                const offset = (genre === 'Acoustic' ? vIdx * 0.035 : 0) + getStagger();
                notes.push({
                    midi: m,
                    freq: getFrequency(m),
                    velocity: vel,
                    midiVelocity: Math.round(vel * 127),
                    durationSteps: 16,
                    module: 'chords',
                    step,
                    timingOffset: time + Math.max(0, offset),
                });
            });
        }

        // --- BASS ---
        if (enabled.bass) {
            let bassMidi = targetPC + 36;
            if (bassMidi < 33) {
                bassMidi += 12;
            }
            const baseVel = isLast ? 1.0 : 0.8;
            const vel = getFinalVel(baseVel);
            const offset = getStagger(0.005); // Tighter stagger for bass/kick lock
            notes.push({
                midi: bassMidi,
                freq: getFrequency(bassMidi),
                velocity: vel,
                midiVelocity: Math.round(vel * 127),
                durationSteps: 16,
                module: 'bass',
                step,
                timingOffset: time + offset,
            });
        }

        // --- DRUMS ---
        if (enabled.groove) {
            const kickVel = getFinalVel(1.0);
            // Kick on every change
            notes.push({
                module: 'groove',
                name: 'Kick',
                velocity: kickVel,
                midiVelocity: Math.round(kickVel * 127),
                step,
                timingOffset: time,
            });
            if (isLast) {
                // Final Crash
                const crashVel = getFinalVel(1.0);
                notes.push({
                    module: 'groove',
                    name: 'Crash',
                    velocity: crashVel,
                    midiVelocity: Math.round(crashVel * 127),
                    step,
                    timingOffset: time + getStagger(0.008),
                });
            } else {
                const snareVel = getFinalVel(0.7);
                notes.push({
                    module: 'groove',
                    name: 'Snare',
                    velocity: snareVel,
                    midiVelocity: Math.round(snareVel * 127),
                    step,
                    timingOffset: time + getStagger(0.005),
                });
            }
        }

        // --- SOLOIST ---
        if (enabled.soloist) {
            const soloOctave = soloist.octave || 72;
            // Force resolution to Tonic (0) or 5th (7) relative to resolutionKey
            const soloPC = (isLast ? 0 : 7) + keyIndex;
            const soloMidi = soloOctave + (soloPC % 12);
            const baseVel = isLast ? 0.9 : 0.7;
            const vel = getFinalVel(baseVel);
            notes.push({
                midi: soloMidi,
                freq: getFrequency(soloMidi),
                velocity: vel,
                midiVelocity: Math.round(vel * 127),
                durationSteps: 16,
                module: 'soloist',
                step,
                timingOffset: time + getStagger(),
                vibrato: isLast ? { delay: 0.2, depth: 0.4 } : null,
            });
        }

        // --- HARMONY ---
        if (enabled.harmony) {
            // Pads follow the top notes of the voicing
            voicings.slice(-3).forEach((/** @type {any} */ m) => {
                const vel = getFinalVel(0.5);
                notes.push({
                    midi: m,
                    freq: getFrequency(m),
                    velocity: vel,
                    midiVelocity: Math.round(vel * 127),
                    durationSteps: 16,
                    module: 'harmony',
                    step,
                    timingOffset: time + getStagger(),
                    style: 'pads',
                });
            });
        }
    });

    return notes;
}
