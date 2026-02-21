import { getBestInversion, getIntervals } from './chords.js';
import { KEY_ORDER } from './config.js';
import { getFrequency } from './utils.js';

/**
 * PUBLIC/RESOLUTION.JS
 *
 * Generates the musical events for the final resolution of a song.
 * Features:
 * - Genre-specific cadence profiles (Jazz ii-V-I, Rock bVI-bVII-I, etc.)
 * - Intelligent voice leading using the chord engine
 * - Ritardando (slowing down) timing logic
 * - Context-aware resolution (Major/Minor detection)
 */

const CADENCE_PROFILES = {
    // Standard Pop/Folk: IV -> V -> I
    STANDARD_MAJOR: [
        { label: 'IV', degree: 5, quality: 'major', beats: 2 },
        { label: 'V', degree: 7, quality: 'major', beats: 2 },
        { label: 'I', degree: 0, quality: 'major', beats: 4 },
    ],
    STANDARD_MINOR: [
        { label: 'iv', degree: 5, quality: 'minor', beats: 2 },
        { label: 'V', degree: 7, quality: 'major', beats: 2 },
        { label: 'i', degree: 0, quality: 'minor', beats: 4 },
    ],

    // Jazz: ii -> V -> I (with extensions)
    JAZZ_MAJOR: [
        { label: 'ii7', degree: 2, quality: 'm9', beats: 2 },
        { label: 'V7', degree: 7, quality: '13', beats: 2 },
        { label: 'I6/9', degree: 0, quality: '6', beats: 4 }, // 6/9 implied by voicing
    ],
    JAZZ_MINOR: [
        { label: 'ii7b5', degree: 2, quality: 'halfdim', beats: 2 },
        { label: 'V7alt', degree: 7, quality: '7alt', beats: 2 },
        { label: 'im6', degree: 0, quality: 'm6', beats: 4 },
    ],

    // Blues: Turnaround
    BLUES: [
        { label: 'I7', degree: 0, quality: '7', beats: 1 },
        { label: 'IV7', degree: 5, quality: '7', beats: 1 },
        { label: 'I7', degree: 0, quality: '7', beats: 1 },
        { label: 'V7#9', degree: 7, quality: '7#9', beats: 1 },
        { label: 'I7#9', degree: 0, quality: '7#9', beats: 4, fermata: true },
    ],

    // Rock/Epic: bVI -> bVII -> I (Mario Cadence)
    EPIC_MAJOR: [
        { label: 'bVI', degree: 8, quality: 'major', beats: 2 },
        { label: 'bVII', degree: 10, quality: 'major', beats: 2 },
        { label: 'I', degree: 0, quality: 'major', beats: 4, powerChord: true },
    ],
    EPIC_MINOR: [
        { label: 'VI', degree: 8, quality: 'major', beats: 2 },
        { label: 'VII', degree: 10, quality: 'major', beats: 2 },
        { label: 'i', degree: 0, quality: 'minor', beats: 4, powerChord: true },
    ],

    // Plagal / Church: IV -> I
    PLAGAL: [
        { label: 'IV', degree: 5, quality: 'maj7', beats: 2 },
        { label: 'iv', degree: 5, quality: 'minor', beats: 2 }, // Minor plagal cadence
        { label: 'I', degree: 0, quality: 'major', beats: 4 },
    ],

    // Funk/Disco: Vamp Fade or Sharp Hit
    FUNK: [
        { label: 'bVII', degree: 10, quality: '9', beats: 1 },
        { label: 'IV', degree: 5, quality: '9', beats: 1 },
        { label: 'I', degree: 0, quality: '9', beats: 0.5, staccato: true }, // Short hit
    ],
};

const GENRE_MAP = {
    Jazz: { major: 'JAZZ_MAJOR', minor: 'JAZZ_MINOR', ritardando: 1.5 },
    Bossa: { major: 'JAZZ_MAJOR', minor: 'JAZZ_MINOR', ritardando: 1.2 },
    'Neo-Soul': { major: 'JAZZ_MAJOR', minor: 'JAZZ_MINOR', ritardando: 1.8 }, // Drunken slow down
    Blues: { major: 'BLUES', minor: 'BLUES', ritardando: 1.0 }, // Constant time usually
    Rock: { major: 'EPIC_MAJOR', minor: 'EPIC_MINOR', ritardando: 0.5 },
    Metal: { major: 'EPIC_MAJOR', minor: 'EPIC_MINOR', ritardando: 0.2 },
    'Ska-Punk': { major: 'EPIC_MAJOR', minor: 'EPIC_MINOR', ritardando: 0.0 }, // Fast stop
    Disco: { major: 'FUNK', minor: 'FUNK', ritardando: 0.0 },
    Funk: { major: 'FUNK', minor: 'FUNK', ritardando: 0.5 },
    Acoustic: { major: 'PLAGAL', minor: 'STANDARD_MINOR', ritardando: 2.0 },
    Reggae: { major: 'STANDARD_MAJOR', minor: 'STANDARD_MINOR', ritardando: 1.0 },
};

/**
 * Main resolution generator.
 */
export function generateResolutionNotes(
    step,
    arranger,
    enabled,
    bpm = 100,
    groove = {},
    soloist = {},
) {
    const notes = [];
    const genre = groove.genreFeel || 'Rock';
    const profileKey = GENRE_MAP[genre] || GENRE_MAP.Rock;

    // 1. Analyze Context (Key and Mode)
    let resolutionKey = arranger.key;
    let isMinor = arranger.isMinor;

    if (arranger.stepMap && arranger.stepMap.length > 0) {
        const lastEntry = arranger.stepMap[arranger.stepMap.length - 1];
        if (lastEntry?.chord) {
            // If the last chord has a different key center, resolve to THAT key.
            if (lastEntry.chord.key) {
                resolutionKey = lastEntry.chord.key;
            }
            // Simplistic major/minor detection from last chord quality
            const q = lastEntry.chord.quality || '';
            if (q.includes('minor') || q.includes('dim')) {
                // Only switch to minor if we aren't explicitly in a Blues context (which mixes dom7s)
                if (genre !== 'Blues') {
                    isMinor = true;
                }
            }
        }
    }

    const keyIndex = KEY_ORDER.indexOf(resolutionKey);
    const profileName = isMinor ? profileKey.minor : profileKey.major;
    const cadenceSteps = CADENCE_PROFILES[profileName] || CADENCE_PROFILES.STANDARD_MAJOR;
    const ritardandoAmount = profileKey.ritardando;

    // 2. Generate Timing Map (Ritardando)
    const timingMap = [];
    let currentTime = 0;
    const spb = 60.0 / bpm;

    cadenceSteps.forEach((s, idx) => {
        timingMap.push({
            time: currentTime,
            step: s,
        });

        // Calculate duration for this step
        let duration = s.beats * spb;

        // Apply ritardando: Each step gets progressively slower
        if (ritardandoAmount > 0 && idx < cadenceSteps.length - 1) {
            const progress = idx / (cadenceSteps.length - 1);
            duration *= 1.0 + progress * ritardandoAmount;
        } else if (idx === cadenceSteps.length - 1 && s.fermata) {
            duration *= 2.0; // Hold the last note longer if fermata
        }

        currentTime += duration;
    });

    // 3. Generate Notes per Instrument
    let lastMidis = [60, 64, 67]; // Start with a generic C major triad at middle C
    const rootBaseMidi = 60 + keyIndex; // Approx Middle C for the key

    // Fix octave if rootBaseMidi is too high/low
    let anchor = rootBaseMidi;
    if (anchor > 68) {
        anchor -= 12;
    }
    if (anchor < 55) {
        anchor += 12;
    }

    timingMap.forEach((entry, idx) => {
        const { time, step: cadenceStep } = entry;
        const isLast = idx === cadenceSteps.length - 1;

        const targetPC = (keyIndex + cadenceStep.degree) % 12;
        let playRoot = anchor - (anchor % 12) + targetPC;
        // Keep root near anchor
        if (playRoot - anchor > 6) {
            playRoot -= 12;
        }
        if (anchor - playRoot > 6) {
            playRoot += 12;
        }

        // Shared Voicing Calculation
        const density = genre === 'Jazz' || genre === 'Neo-Soul' ? 'rich' : 'standard';
        const is7th =
            cadenceStep.quality.includes('7') ||
            cadenceStep.quality.includes('9') ||
            cadenceStep.quality.includes('13');
        const intervals = getIntervals(cadenceStep.quality, is7th, density, genre, true);

        const voicings = getBestInversion(
            playRoot,
            intervals,
            lastMidis,
            false,
            anchor,
            48,
            80,
            genre === 'Disco' ? 'disco' : 'stabs',
        );
        lastMidis = voicings;

        // --- CHORDS ---
        if (enabled.chords) {
            // Sustain Pedal on first step
            if (idx === 0) {
                notes.push({
                    midi: 0,
                    module: 'chords',
                    step: step,
                    timingOffset: 0,
                    ccEvents: [{ controller: 64, value: 127, timingOffset: 0 }],
                });
            }

            const strum = genre === 'Acoustic' || genre === 'Jazz';
            voicings.forEach((m, vIdx) => {
                const f = getFrequency(m);
                const vel = isLast ? 0.8 : 0.65;
                const offset = strum ? vIdx * 0.03 : 0;

                notes.push({
                    midi: m,
                    freq: f,
                    velocity: vel,
                    midiVelocity: Math.round(vel * 127),
                    durationSteps: cadenceStep.staccato ? 0.5 : cadenceStep.beats * 4,
                    module: 'chords',
                    step: step,
                    timingOffset: time + offset,
                });
            });
        }

        // --- BASS ---
        if (enabled.bass) {
            let bassMidi = (targetPC % 12) + 36; // C2 range
            if (bassMidi < 33) {
                bassMidi += 12; // Avoid too low
            }

            notes.push({
                midi: bassMidi,
                freq: getFrequency(bassMidi),
                velocity: isLast ? 0.9 : 0.8,
                midiVelocity: isLast ? 110 : 100,
                durationSteps: cadenceStep.staccato ? 0.5 : cadenceStep.beats * 4,
                module: 'bass',
                step: step,
                timingOffset: time,
            });
        }

        // --- DRUMS ---
        if (enabled.groove) {
            const kickVel = isLast ? 1.0 : 0.8;
            const crashVel = 1.0;

            // Always kick on the change
            notes.push({
                module: 'groove',
                name: 'Kick',
                velocity: kickVel,
                midiVelocity: Math.round(kickVel * 127),
                step,
                timingOffset: time,
            });

            if (isLast) {
                if (!cadenceStep.staccato) {
                    notes.push({
                        module: 'groove',
                        name: 'Crash',
                        velocity: crashVel,
                        midiVelocity: 127,
                        step,
                        timingOffset: time,
                    });
                    // Big Rock Ending effect
                    if (genre === 'Rock' || genre === 'Metal') {
                        notes.push({
                            module: 'groove',
                            name: 'Crash',
                            velocity: 0.9,
                            midiVelocity: 115,
                            step,
                            timingOffset: time + 0.1,
                        });
                    }
                } else {
                    // Staccato funk ending: Snare + Kick + Crash choke
                    notes.push({
                        module: 'groove',
                        name: 'Snare',
                        velocity: 1.0,
                        midiVelocity: 127,
                        step,
                        timingOffset: time,
                    });
                    notes.push({
                        module: 'groove',
                        name: 'Crash',
                        velocity: 0.8,
                        midiVelocity: 100,
                        step,
                        timingOffset: time,
                    });
                }
            } else {
                if (genre !== 'Acoustic') {
                    notes.push({
                        module: 'groove',
                        name: 'ClosedHat',
                        velocity: 0.6,
                        midiVelocity: 80,
                        step,
                        timingOffset: time,
                    });
                    if (cadenceStep.beats >= 2) {
                        notes.push({
                            module: 'groove',
                            name: 'Snare',
                            velocity: 0.7,
                            midiVelocity: 90,
                            step,
                            timingOffset: time + spb,
                        });
                    }
                }
            }
        }

        // --- SOLOIST ---
        if (enabled.soloist) {
            const soloOctave = soloist.octave || 72;
            let soloNotePC = targetPC;

            if (!isLast) {
                // Tension: Guide tones (3rd or 7th)
                // Approximate 3rd for now (Major 3rd = +4 semitones)
                soloNotePC = (targetPC + 4) % 12;
            }

            const soloMidi = soloOctave + (soloNotePC < 6 ? 12 : 0) + soloNotePC;

            notes.push({
                midi: soloMidi,
                freq: getFrequency(soloMidi),
                velocity: isLast ? 0.8 : 0.6,
                midiVelocity: 100,
                durationSteps: cadenceStep.staccato ? 1 : 8,
                module: 'soloist',
                step: step,
                timingOffset: time,
                vibrato: isLast ? { delay: 0.5, depth: 0.3 } : null,
            });
        }

        // --- HARMONY ---
        if (enabled.harmony) {
            // Simple pads following the chords
            const pads = voicings;
            pads.forEach((m, i) => {
                // Only play top 3 notes to avoid mud
                if (i < pads.length - 3) {
                    return;
                }

                notes.push({
                    midi: m,
                    freq: getFrequency(m),
                    velocity: 0.4,
                    midiVelocity: 60,
                    durationSteps: cadenceStep.staccato ? 1 : 16,
                    module: 'harmony',
                    step: step,
                    timingOffset: time,
                    style: 'pads',
                });
            });
        }
    });

    return notes;
}
