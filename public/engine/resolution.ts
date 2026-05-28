import { KEY_ORDER } from '../config.js';
import type { ArrangerState } from '../state/arranger.js';
import type { EnsembleState } from '../types.js';
import { getFrequency } from '../utils.js';
import { getBestInversion, getIntervals } from './chords-engine.js';

/**
 * PUBLIC/RESOLUTION.JS
 *
 * Generates the musical events for the final resolution of a song.
 * Optimized for clean "Final Button" landings on the Tonic.
 */

const RESOLUTION_NORMALIZER = 0.85; // Global tamer to prevent limiter crushing
const RESOLUTION_STAGGER = 0.015; // Max jitter in seconds for sample-accurate peak reduction

interface CadenceStep {
    label: string;
    degree: number;
    quality: string;
    beats: number;
    baseVelocity: number;
}

interface GenreConfig {
    profile: string;
    ritardando: number;
}

const CADENCE_PROFILES: Record<string, CadenceStep[]> = {
    // Single tonic landing, kept in the same lane as the band.
    BUTTON: [{ label: 'I', degree: 0, quality: 'major', beats: 4, baseVelocity: 0.8 }],

    // Standard V -> I resolution with a blended tonic landing.
    STANDARD_V_I: [
        { label: 'V', degree: 7, quality: 'major', beats: 2, baseVelocity: 0.75 },
        { label: 'I', degree: 0, quality: 'major', beats: 4, baseVelocity: 0.74 },
    ],

    // Jazz ii -> V -> I (Condensed) with a softer tonic arrival.
    JAZZ_V_I: [
        { label: 'V7', degree: 7, quality: '13', beats: 2, baseVelocity: 0.7 },
        { label: 'I6/9', degree: 0, quality: '6', beats: 4, baseVelocity: 0.68 },
    ],
};

// why: keyed by genreFeel (see :72). Epic 2 S3 fixed three dead/missing keys:
//   - 'Bossa' → 'Bossa Nova' (the canonical feel; the old key never matched, so
//     bossa charts got the Rock button instead of their jazz ritardando).
//   - 'Ska-Punk' → 'Ska' (the Ska-Punk genre's feel; punk-ska ends hard, so the
//     BUTTON value is unchanged — the rekey just makes it reachable/explicit).
//   - Added 'Hip Hop' and 'Country' (both were absent → Rock button fallback).
//     Hip Hop keeps a hard BUTTON cut: it's metronomic loop music, a ritardando
//     (tempo slow-down) would read as wrong. Country resolves with a clear V-I
//     authentic cadence and a gentle slow-down — matched to Blues' 0.8 (its
//     roots-Americana neighbor), not Acoustic's balladic 1.5.
const GENRE_MAP: Record<string, GenreConfig> = {
    Jazz: { profile: 'JAZZ_V_I', ritardando: 1.2 },
    'Bossa Nova': { profile: 'JAZZ_V_I', ritardando: 1.0 },
    'Neo-Soul': { profile: 'JAZZ_V_I', ritardando: 1.5 },
    Blues: { profile: 'STANDARD_V_I', ritardando: 0.8 },
    Country: { profile: 'STANDARD_V_I', ritardando: 0.8 },
    Rock: { profile: 'BUTTON', ritardando: 0.0 },
    Metal: { profile: 'BUTTON', ritardando: 0.0 },
    Ska: { profile: 'BUTTON', ritardando: 0.0 },
    Disco: { profile: 'BUTTON', ritardando: 0.0 },
    Funk: { profile: 'BUTTON', ritardando: 0.0 },
    'Hip Hop': { profile: 'BUTTON', ritardando: 0.0 },
    Acoustic: { profile: 'STANDARD_V_I', ritardando: 1.5 },
    Reggae: { profile: 'BUTTON', ritardando: 0.0 },
};

export function generateResolutionNotes(
    state: EnsembleState,
    step: number,
    arranger: ArrangerState,
    enabled: any,
    bpm = 100,
    groove: any = {},
    soloist: any = {},
): any[] {
    const notes: any[] = [];
    const { playback } = state;
    const genre = groove.genreFeel || 'Rock';
    const config = GENRE_MAP[genre] || GENRE_MAP.Rock;

    // Scale the raw energy of the ending based on the current band intensity.
    // This ensures a chill track doesn't end with a jarring peak-velocity hit.
    const intensity = playback?.bandIntensity ?? 0.5;
    const intensityScale = 0.6 + intensity * 0.4; // 0.6 (min) to 1.0 (max)

    const getFinalVel = (baseVel: number): number =>
        baseVel * intensityScale * RESOLUTION_NORMALIZER;

    const getStagger = (maxMs = RESOLUTION_STAGGER): number => Math.random() * maxMs;

    const resolutionKey = arranger.key || 'C';
    const isMinor = arranger.isMinor;
    const keyIndex = KEY_ORDER.indexOf(resolutionKey);

    const cadenceSteps = CADENCE_PROFILES[config.profile] || CADENCE_PROFILES.BUTTON;
    const ritardandoAmount = config.ritardando;

    // 1. Timing Map
    const spb = 60.0 / bpm;
    let currentTime = 0;
    const timingMap: { time: number; step: CadenceStep }[] = cadenceSteps.map((s, idx) => {
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

    timingMap.forEach((entry, idx) => {
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
        const intervals = getIntervals(state, quality, is7th, density, genre);

        let playRoot = anchor - (anchor % 12) + targetPC;
        if (playRoot > anchor + 6) {
            playRoot -= 12;
        }
        if (playRoot < anchor - 6) {
            playRoot += 12;
        }

        const voicings = getBestInversion(state, playRoot, intervals, lastMidis, {
            anchor,
            min: 48,
            max: 80,
        });
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
            voicings.forEach((m: number, vIdx: number) => {
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
            const baseVel = isLast ? 0.76 : 0.8;
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
            const kickVel = getFinalVel(isLast ? 0.86 : 1.0);
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
                const crashVel = getFinalVel(0.82);
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
            const baseVel = isLast ? 0.68 : 0.7;
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
            voicings.slice(-3).forEach((m: any) => {
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
