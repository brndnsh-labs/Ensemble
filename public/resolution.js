import { KEY_ORDER } from './config.js';
import { getMidi } from './utils.js';

const CADENCE_TYPES = {
    STANDARD: 'V-I',
    JAZZ: 'ii-V-I',
    BLUES: 'turnaround',
    ROCK: 'IV-I',
    POP: 'bVII-IV-I'
};

const GENRE_CADENCE_MAP = {
    'Jazz': CADENCE_TYPES.JAZZ,
    'Bossa': CADENCE_TYPES.JAZZ,
    'Neo-Soul': CADENCE_TYPES.JAZZ,
    'Blues': CADENCE_TYPES.BLUES,
    'Rock': CADENCE_TYPES.ROCK,
    'Metal': CADENCE_TYPES.ROCK,
    'Ska-Punk': CADENCE_TYPES.ROCK,
    'Disco': CADENCE_TYPES.POP,
    'Funk': CADENCE_TYPES.JAZZ,
    'Acoustic': CADENCE_TYPES.STANDARD,
    'Reggae': CADENCE_TYPES.ROCK
};

/**
 * Generates the musical events for the final resolution of a song.
 * Shared by both the live playback engine (logic-worker.js -> scheduler-core.js)
 * and the MIDI export engine (logic-worker.js).
 *
 * @param {number} step - The global step where the resolution starts.
 * @param {Object} arranger - The arranger state { key, isMinor }.
 * @param {Object} enabled - Enabled tracks { bass, chords, soloist, harmony, groove }.
 * @param {number} bpm - Beats per minute (default 100).
 * @param {Object} [groove] - The groove state (for genreFeel).
 * @param {Object} [soloist] - The soloist state (for style).
 * @returns {Array} List of note events.
 */
export function generateResolutionNotes(step, arranger, enabled, bpm = 100, groove = {}, soloist = {}) {
    const notes = [];
    const spb = 60 / bpm; // Seconds per beat
    const genre = groove.genreFeel || 'Rock';
    const cadenceType = GENRE_CADENCE_MAP[genre] || CADENCE_TYPES.STANDARD;
    
    // Determine resolution key from the last chord of the arrangement
    let resolutionKey = arranger.key;
    if (arranger.stepMap && arranger.stepMap.length > 0) {
        const lastEntry = arranger.stepMap[arranger.stepMap.length - 1];
        if (lastEntry && lastEntry.chord && lastEntry.chord.key) {
            resolutionKey = lastEntry.chord.key;
        }
    }

    const keyPC = KEY_ORDER.indexOf(resolutionKey);
    const isMinor = arranger.isMinor;

    // --- SMART TARGET LOGIC ---
    let targetPC = keyPC;
    let targetIsMinor = isMinor;
    let lastRootMidi = 60; // Default center

    if (arranger.stepMap && arranger.stepMap.length > 0) {
        const lastEntry = arranger.stepMap[arranger.stepMap.length - 1];
        if (lastEntry && lastEntry.chord) {
            const c = lastEntry.chord;
            lastRootMidi = c.rootMidi || 60;
            
            // Heuristic: Is the last chord a Tonic or a Dominant/Turnaround?
            // Detect Roman Numerals (lowercase = minor) vs Chord Names
            // Strip leading accidentals (b, #) to check the case of the numeral itself
            const cleanedValue = c.value ? c.value.replace(/^[b#]/, '') : '';
            const isLowercaseRoman = /^[a-z]/.test(cleanedValue); 
            
            // Refined Dominant Check: Ends in 7/9/13, NOT maj/min/dim/half-dim, and NOT lowercase roman
            const isExplicitDominant = c.quality === 'Dominant' || (c.value && (c.value.endsWith('7') || c.value.endsWith('9') || c.value.endsWith('13')) && !c.value.includes('maj') && !c.value.includes('m7') && !c.value.includes('min') && !c.value.includes('dim') && !c.value.includes('ø'));
            const isDominant = isExplicitDominant && !isLowercaseRoman;

            const isMinorChord = c.quality === 'Minor' || (c.value && (c.value.includes('m') || isLowercaseRoman) && !c.value.includes('maj'));

            if (isDominant) {
                // If it ends on V, resolve to I
                targetPC = (c.rootMidi + 5) % 12;
                // Keep global minor/major preference
            } else {
                // If it ends on a stable chord (I, vi, etc.), resolve to THAT chord
                targetPC = c.rootMidi % 12;
                targetIsMinor = isMinorChord;
            }
        }
    }

    // Use the Smart Target
    const rootPC = targetPC; 
    const useMinor = targetIsMinor;

    // --- CADENCE DEFINITIONS ---
    // Each step: { pc: rootPC, intervals: [], time: beats, label: string }
    let steps = [];

    switch (cadenceType) {
        case CADENCE_TYPES.JAZZ:
            // ii - V - I
            steps = [
                { pc: (rootPC + 2) % 12, intervals: useMinor ? [0, 3, 6, 10] : [0, 3, 7, 10, 14], time: 0, label: 'ii' }, // m7b5 (min) or m9 (maj)
                { pc: (rootPC + 7) % 12, intervals: useMinor ? [0, 4, 10, 13, 20] : [0, 4, 10, 14, 21], time: 2, label: 'V' }, // 7alt (min) or 13 (maj)
                { pc: rootPC, intervals: useMinor ? [0, 3, 7, 9, 14] : [0, 2, 4, 7, 9, 11], time: 4, label: 'I' } // m6/9 (min) or 6/9(maj7) (maj)
            ];
            break;
        case CADENCE_TYPES.BLUES:
            // I - VI7 - ii - V7 - I
            steps = [
                { pc: rootPC, intervals: [0, 4, 7, 10, 14], time: 0, label: 'I' },
                { pc: (rootPC + 9) % 12, intervals: [0, 4, 10, 13], time: 1, label: 'VI7' },
                { pc: (rootPC + 2) % 12, intervals: [0, 3, 7, 10], time: 2, label: 'ii' },
                { pc: (rootPC + 7) % 12, intervals: [0, 4, 10, 14], time: 3, label: 'V7' },
                { pc: rootPC, intervals: [0, 4, 7, 10, 14, 21], time: 4, label: 'I7' }
            ];
            break;
        case CADENCE_TYPES.ROCK:
            // IV - I
            steps = [
                { pc: (rootPC + 5) % 12, intervals: useMinor ? [0, 3, 7] : [0, 4, 7], time: 0, label: 'IV' },
                { pc: rootPC, intervals: useMinor ? [0, 3, 7, 12] : [0, 4, 7, 12], time: 2, label: 'I' }
            ];
            break;
        case CADENCE_TYPES.POP:
            // bVII - IV - I
            steps = [
                { pc: (rootPC + 10) % 12, intervals: [0, 4, 7], time: 0, label: 'bVII' },
                { pc: (rootPC + 5) % 12, intervals: useMinor ? [0, 3, 7] : [0, 4, 7], time: 2, label: 'IV' },
                { pc: rootPC, intervals: useMinor ? [0, 3, 7, 14] : [0, 4, 7, 14], time: 4, label: 'I' }
            ];
            break;
        default:
            // V - I
            steps = [
                { pc: (rootPC + 7) % 12, intervals: useMinor ? [0, 4, 7, 10] : [0, 4, 7, 10], time: 0, label: 'V' },
                { pc: rootPC, intervals: useMinor ? [0, 3, 7, 12] : [0, 4, 7, 12], time: 2, label: 'I' }
            ];
    }

    // --- 1. Bass Resolution ---
    if (enabled.bass) {
        steps.forEach((s, idx) => {
            const isLast = idx === steps.length - 1;
            const bassNote = (s.pc % 12) + 24 + (s.pc > 7 ? -12 : 0);
            
            // Add chromatic approach if Jazz and not first step
            if (cadenceType === CADENCE_TYPES.JAZZ && idx > 0) {
                const approachPC = (s.pc + 1) % 12; // bII approach
                const approachMidi = (approachPC % 12) + 24 + (approachPC > 7 ? -12 : 0);
                notes.push({
                    midi: approachMidi,
                    freq: 440 * Math.pow(2, (approachMidi - 69) / 12),
                    velocity: 0.7,
                    midiVelocity: 80,
                    durationSteps: 2,
                    module: 'bass',
                    step: step,
                    timingOffset: (s.time - 0.5) * spb
                });
            }

            notes.push({
                midi: bassNote,
                freq: 440 * Math.pow(2, (bassNote - 69) / 12),
                velocity: isLast ? 1.0 : 0.8,
                midiVelocity: isLast ? 120 : 100,
                durationSteps: isLast ? 32 : 8,
                module: 'bass',
                step: step,
                timingOffset: s.time * spb
            });
        });
    }

    // --- 2. Chord Resolution ---
    if (enabled.chords) {
        // Sustain on
        notes.push({
            midi: 0,
            module: 'chords',
            step: step,
            timingOffset: 0,
            ccEvents: [{ controller: 64, value: 127, timingOffset: 0 }]
        });

        let currentRootMidi = lastRootMidi; // Start from where the song ended

        steps.forEach((s, idx) => {
            const isLast = idx === steps.length - 1;
            
            // Voice Leading: Find root octave closest to currentRootMidi
            // s.pc is 0-11. currentRootMidi is ~60.
            const diff = (s.pc - (currentRootMidi % 12) + 12) % 12; // 0-11 distance UP
            const distUp = diff;
            const distDown = 12 - diff;
            
            let nextRoot = currentRootMidi;
            if (distUp < distDown) nextRoot += distUp; // Go up
            else nextRoot -= distDown; // Go down
            
            // Keep within reasonable chord range (48 - 72)
            if (nextRoot < 48) nextRoot += 12;
            if (nextRoot > 72) nextRoot -= 12;
            
            currentRootMidi = nextRoot;

            const freqs = s.intervals.map(i => 440 * Math.pow(2, (nextRoot + i - 69) / 12));
            const polyComp = 1 / Math.sqrt(freqs.length || 1);

            freqs.forEach((f, i) => {
                // Slower strum for the final chord
                const offset = i * (isLast ? 0.04 : 0.015);
                notes.push({
                    midi: getMidi(f),
                    freq: f,
                    velocity: (isLast ? 0.8 : 0.6) * polyComp,
                    midiVelocity: Math.round((isLast ? 0.8 : 0.6) * polyComp * 127),
                    durationSteps: isLast ? 48 : 8,
                    module: 'chords',
                    step: step,
                    timingOffset: (s.time * spb) + offset
                });
            });
        });
    }

    // --- 3. Soloist Resolution ---
    if (enabled.soloist) {
        // Simple "Hero" lick logic: 
        // Play guide tones for early steps, resolve to root/ext on last step
        const baseOctave = soloist.octave || 72;
        steps.forEach((s, idx) => {
            const isLast = idx === steps.length - 1;
            const pc = isLast ? (s.pc + (Math.random() < 0.5 ? 0 : 7)) % 12 : (s.pc + 4) % 12; // Root/5th vs 3rd
            const soloistMidi = pc + baseOctave + (pc < 5 ? 12 : 0); // Dynamic octave offset

            notes.push({
                midi: soloistMidi,
                freq: 440 * Math.pow(2, (soloistMidi - 69) / 12),
                velocity: isLast ? 0.9 : 0.7,
                midiVelocity: isLast ? 115 : 90,
                durationSteps: isLast ? 32 : 4,
                module: 'soloist',
                step: step,
                timingOffset: s.time * spb,
                bendStartInterval: isLast ? 0.5 : 0,
                vibrato: isLast ? { delay: 0.5, depth: 0.3 } : null
            });
        });
    }

    // --- 4. Harmony Resolution ---
    if (enabled.harmony) {
        steps.forEach((s, idx) => {
            const isLast = idx === steps.length - 1;
            // Pad support: Root + 5th + top color
            const padIntervals = isLast ? [0, 7, 14] : [0, 7];
            const rootMidi = s.pc + 60;
            
            padIntervals.forEach((interval, i) => {
                const m = rootMidi + 12 + interval;
                notes.push({
                    midi: m,
                    freq: 440 * Math.pow(2, (m - 69) / 12),
                    velocity: 0.5,
                    midiVelocity: 70,
                    durationSteps: isLast ? 48 : 8,
                    module: 'harmony',
                    step: step,
                    timingOffset: (s.time * spb) + (i * 0.02)
                });
            });
        });
    }

    // --- 5. Drums Resolution ---
    if (enabled.groove) {
        // Pre-cadence fill if Jazz/Blues
        if (cadenceType === CADENCE_TYPES.JAZZ || cadenceType === CADENCE_TYPES.BLUES) {
            // Snare roll leading into first step
            for (let i = 0; i < 4; i++) {
                notes.push({
                    module: 'groove',
                    name: 'Snare',
                    velocity: 0.4 + (i * 0.1),
                    midiVelocity: 50 + (i * 15),
                    step: step,
                    timingOffset: - (4 - i) * (spb / 4)
                });
            }
        }

        steps.forEach((s, idx) => {
            const isLast = idx === steps.length - 1;
            
            // On each step of cadence
            notes.push({
                module: 'groove',
                name: 'Kick',
                velocity: 0.8,
                midiVelocity: 100,
                step: step,
                timingOffset: s.time * spb
            });

            if (isLast) {
                notes.push({
                    module: 'groove',
                    name: 'Crash',
                    velocity: 1.0,
                    midiVelocity: 127,
                    step: step,
                    timingOffset: s.time * spb
                });
                // Final Ride Bell for class
                notes.push({
                    module: 'groove',
                    name: 'Ride',
                    velocity: 0.9,
                    midiVelocity: 110,
                    step: step,
                    timingOffset: s.time * spb + 0.01
                });
            } else {
                notes.push({
                    module: 'groove',
                    name: 'HiHat',
                    velocity: 0.7,
                    midiVelocity: 90,
                    step: step,
                    timingOffset: s.time * spb
                });
            }
        });
    }

    return notes;
}
