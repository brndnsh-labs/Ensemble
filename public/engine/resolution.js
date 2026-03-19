import { KEY_ORDER } from '../config.js';
import { getFrequency } from '../utils.js';
import { getBestInversion, getIntervals } from './chords-engine.js';

/**
 * PUBLIC/RESOLUTION.JS
 *
 * Generates the musical events for the final resolution of a song.
 * Optimized for clean "Final Button" landings on the Tonic.
 */

const CADENCE_PROFILES = {
    // Sharp hit on the Tonic
    BUTTON: [{ label: 'I', degree: 0, quality: 'major', beats: 4, velocity: 1.0 }],

    // Standard V -> I resolution
    STANDARD_V_I: [
        { label: 'V', degree: 7, quality: 'major', beats: 2, velocity: 0.7 },
        { label: 'I', degree: 0, quality: 'major', beats: 4, velocity: 1.0 },
    ],

    // Jazz ii -> V -> I (Condensed)
    JAZZ_V_I: [
        { label: 'V7', degree: 7, quality: '13', beats: 2, velocity: 0.7 },
        { label: 'I6/9', degree: 0, quality: '6', beats: 4, velocity: 1.0 },
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
    const genre = groove.genreFeel || 'Rock';
    const config = /** @type {any} */ (GENRE_MAP)[genre] || GENRE_MAP.Rock;

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
                const vel = cadenceStep.velocity || 0.8;
                const offset = genre === 'Acoustic' ? vIdx * 0.03 : 0;
                notes.push({
                    midi: m,
                    freq: getFrequency(m),
                    velocity: vel,
                    midiVelocity: Math.round(vel * 127),
                    durationSteps: 16,
                    module: 'chords',
                    step,
                    timingOffset: time + offset,
                });
            });
        }

        // --- BASS ---
        if (enabled.bass) {
            let bassMidi = targetPC + 36;
            if (bassMidi < 33) {
                bassMidi += 12;
            }
            const vel = isLast ? 1.0 : 0.8;
            notes.push({
                midi: bassMidi,
                freq: getFrequency(bassMidi),
                velocity: vel,
                midiVelocity: Math.round(vel * 127),
                durationSteps: 16,
                module: 'bass',
                step,
                timingOffset: time,
            });
        }

        // --- DRUMS ---
        if (enabled.groove) {
            // Kick on every change
            notes.push({
                module: 'groove',
                name: 'Kick',
                velocity: 1.0,
                midiVelocity: 127,
                step,
                timingOffset: time,
            });
            if (isLast) {
                // Final Crash
                notes.push({
                    module: 'groove',
                    name: 'Crash',
                    velocity: 1.0,
                    midiVelocity: 127,
                    step,
                    timingOffset: time,
                });
            } else {
                notes.push({
                    module: 'groove',
                    name: 'Snare',
                    velocity: 0.7,
                    midiVelocity: 90,
                    step,
                    timingOffset: time,
                });
            }
        }

        // --- SOLOIST ---
        if (enabled.soloist) {
            const soloOctave = soloist.octave || 72;
            // Force resolution to Tonic (0) or 5th (7) relative to resolutionKey
            const soloPC = (isLast ? 0 : 7) + keyIndex;
            const soloMidi = soloOctave + (soloPC % 12);
            notes.push({
                midi: soloMidi,
                freq: getFrequency(soloMidi),
                velocity: isLast ? 0.9 : 0.7,
                durationSteps: 16,
                module: 'soloist',
                step,
                timingOffset: time,
                vibrato: isLast ? { delay: 0.2, depth: 0.4 } : null,
            });
        }

        // --- HARMONY ---
        if (enabled.harmony) {
            // Pads follow the top notes of the voicing
            voicings.slice(-3).forEach((/** @type {any} */ m) => {
                notes.push({
                    midi: m,
                    freq: getFrequency(m),
                    velocity: 0.5,
                    durationSteps: 16,
                    module: 'harmony',
                    step,
                    timingOffset: time,
                    style: 'pads',
                });
            });
        }
    });

    return notes;
}
