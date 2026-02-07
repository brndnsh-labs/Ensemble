import { getBestInversion } from './chords.js';
import { getState } from './state.js';
import { TIME_SIGNATURES } from './config.js';

/**
 * HARMONIES.JS
 */

// Internal memory for motif consistency
const motifCache = new Map(); 
let lastPlayedStep = -1;

/**
 * Clears the internal motif memory. Used for section changes or testing.
 */
export function clearHarmonyMemory() {
    const { harmony, soloist } = getState();
    motifCache.clear();
    harmony.lastMidis = [];
    lastPlayedStep = -1;
    soloist.motifBuffer = [];
    soloist.isReplayingMotif = false;
}

/**
 * Extracts 3rds and 7ths (Guide Tones) from a set of intervals.
 * Critical for "supportive" harmony that defines quality without clutter.
 */
export function getGuideTones(intervals) {
    return intervals.filter(i => {
        const iMod = i % 12;
        return iMod === 3 || iMod === 4 || iMod === 10 || iMod === 11;
    });
}

/**
 * Filters intervals to remove high extensions (9, 11, 13) to avoid clashing with soloist.
 */
export function getSafeVoicings(intervals) {
    return intervals.filter(i => {
         const iMod = i % 12;
         // Allow Root(0), 5th(7), 3rds(3/4), 7ths(10/11), 6ths(9)
         // Exclude b9(1), 9(2), 11(5), #11(6), b13(8) unless they are essentially 3/7
         return [0, 7, 3, 4, 10, 11, 9].includes(iMod);
    });
}

/**
 * Generates a procedural rhythmic pattern based on genre feel.
 * Values indicate intensity threshold: 1=Always, 2=Medium(>0.4), 3=High(>0.7)
 * @param {string} feel - The genre feel
 * @param {number} seed - Random seed
 * @returns {number[]} 16-step pattern
 */
export function generateCompingPattern(feel, seed) {
    const pattern = new Array(16).fill(0);
    const pseudoRandom = () => {
        seed = (seed * 9301 + 49297) % 233280;
        return seed / 233280;
    };

    // LEGACY PATTERNS (Restored for regression prevention)
    const LEGACY_PATTERNS = {
        'Bossa Nova': [[1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0], [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0]],
        'Disco': [[0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1], [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]],
        'Rock': [[1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0], [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0]],
        'Metal': [[1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0, 1, 0]],
        'Reggae': [[0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], [0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0]],
        'Country': [[1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0]],
        'Acoustic': [[1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], [1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0]],
        'Hip Hop': [[0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0], [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0]]
    };

    if (LEGACY_PATTERNS[feel]) {
        const templates = LEGACY_PATTERNS[feel];
        // Use seed to pick a variation deterministically
        const idx = Math.floor(pseudoRandom() * templates.length);
        const t = templates[idx];
        // Legacy patterns are binary (0/1).
        // We map 1 -> 1 (Always play) for backward compatibility consistency.
        return t.map(x => x);
    }

    if (feel === 'Jazz') {
        // Charleston variations
        if (pseudoRandom() < 0.6) {
            pattern[0] = 1; // Base
            // And-of-2 (Step 6) is standard Charleston
            if (pseudoRandom() < 0.7) pattern[6] = 1;

            // High intensity anticipation (And-of-4 / Step 14)
            if (pseudoRandom() < 0.5) pattern[14] = 3;
        } else {
            // "Red Garland" sparse (Beat 2, And-of-3)
            pattern[4] = 1;
            if (pseudoRandom() < 0.7) pattern[10] = 1;
        }

        // Random ghost hits for flavor at mid/high intensity
        const ghosts = [3, 9, 13];
        ghosts.forEach(g => {
            if (pseudoRandom() < 0.3) pattern[g] = 2;
        });

    } else if (feel === 'Funk') {
        // The "One"
        pattern[0] = 1;

        // Syncopated 16ths (e/a)
        const syncopations = [3, 6, 9, 12, 14];
        syncopations.forEach(s => {
            const r = pseudoRandom();
            if (r < 0.4) pattern[s] = 1;      // Base groove
            else if (r < 0.7) pattern[s] = 2; // Mid intensity add
            else pattern[s] = 3;              // High intensity busy
        });

    } else if (feel === 'Neo-Soul') {
        // Dragged, sparse
        if (pseudoRandom() < 0.6) pattern[0] = 1;
        if (pseudoRandom() < 0.5) pattern[7] = 1; // Syncopated (before beat 3)
        pattern[15] = 3; // Pickup at high intensity
    } else {
        // Default / Pop
        pattern[0] = 1;
        pattern[6] = 2;  // And of 2 (Mid)
        pattern[12] = 3; // Beat 4 (High)
    }

    return pattern;
}

/**
 * Generates harmony notes for a given step.
 */
export function getHarmonyNotes(chord, nextChord, step, octave, style, stepInChord, soloistResult = null) {
    if (!chord) return [];

    // Destructure state here to avoid ReferenceError during evaluation
    const { playback, groove, harmony, soloist, arranger } = getState();

    // Internal Style Config
    const STYLE_CONFIG = {
        horns: { density: 2, rhythmicStyle: 'stabs', timingJitter: 0.005, velocity: 0.85, octaveOffset: 0 },
        strings: { density: 2, rhythmicStyle: 'pads', timingJitter: 0.02, velocity: 0.6, octaveOffset: 0 },
        organ: { density: 3, rhythmicStyle: 'stabs', timingJitter: 0.015, velocity: 0.85, octaveOffset: 0 },
        plucks: { density: 2, rhythmicStyle: 'stabs', timingJitter: 0.002, velocity: 0.7, octaveOffset: 24 },
        counter: { density: 1, rhythmicStyle: 'pads', timingJitter: 0.03, velocity: 0.75, octaveOffset: -12 },
        smart: { density: 2, rhythmicStyle: 'auto', timingJitter: 0.008, velocity: 0.75, octaveOffset: 0 }
    };

    if (playback.bandIntensity < 0.22) return [];
    const isChordStart = stepInChord === 0;
    // Don't play if we just played a note and soloist is active (avoid stepping on toes)
    if (lastPlayedStep !== -1 && step === lastPlayedStep + 1 && soloistResult) return [];

    const notes = [];
    const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepsPerMeasure = ts.beats * ts.stepsPerBeat;
    const measureStep = step % stepsPerMeasure;
    const sectionId = chord.sectionId || 'default';
    const feel = groove.genreFeel;
    
    // 1. Determine Style
    let activeStyle = style;
    if (style === 'smart') {
        if (feel === 'Blues') activeStyle = 'organ';
        else if (feel === 'Jazz' || feel === 'Bossa Nova') activeStyle = 'strings';
        else if (feel === 'Disco' || feel === 'Hip Hop') activeStyle = 'plucks';
        else if (feel === 'Funk' || feel === 'Metal' || feel === 'Afrobeat') activeStyle = 'horns';
        else if (feel === 'Reggae') activeStyle = 'organ';
        else if (feel === 'Neo-Soul') activeStyle = 'organ';
        else if (feel === 'Country' || feel === 'Acoustic') activeStyle = 'strings';
        else activeStyle = 'strings';
    }

    // Override for Comping in Jazz/Funk (User Request 1: Comping vs Pads)
    if ((feel === 'Jazz' || feel === 'Funk') && activeStyle === 'strings') {
        activeStyle = 'organ';
    }

    const config = STYLE_CONFIG[activeStyle] || STYLE_CONFIG.smart;
    let rhythmicStyle = config.rhythmicStyle;

    if (rhythmicStyle === 'auto') {
        const isPadGenre = (feel === 'Rock' || feel === 'Acoustic' || feel === 'Neo-Soul');
        rhythmicStyle = isPadGenre ? 'pads' : 'stabs';
    }

    if (feel === 'Jazz' || feel === 'Funk') rhythmicStyle = 'stabs';

    // 2. Determine Intervals (Note Selection)
    let intervals = chord.intervals || [0, 4, 7];
    const isSoloistBusy = soloist.enabled && !soloist.isResting;

    // Override Rhythm for Soloist Support
    if (isSoloistBusy) {
        rhythmicStyle = 'pads';
    }

    if (isSoloistBusy) {
        intervals = getSafeVoicings(intervals);
        // Thin out if very busy
        if (soloist.notesInPhrase > 3 || harmony.complexity < 0.4) {
             const guides = getGuideTones(intervals);
             if (guides.length > 0) intervals = [0, ...guides];
             else intervals = [0, 7];
        }
    } else {
        if (harmony.complexity < 0.4 || playback.bandIntensity < 0.4) {
            const guides = getGuideTones(intervals);
            if (guides.length > 0) intervals = guides;
        }
    }

    // 3. Procedural Pattern Generation
    if (!motifCache.has(sectionId)) {
        let hash = 0;
        for (let i = 0; i < sectionId.length; i++) { hash = ((hash << 5) - hash) + sectionId.charCodeAt(i); hash |= 0; }
        const seed = Math.abs(hash);

        // Generate and cache the base pattern structure (independent of intensity)
        const pattern = generateCompingPattern(feel, seed);

        // Calculate a broad rhythmic mask for UI/Consistency based on "Base" hits only
        let rhythmicMask = 0;
        for (let i = 0; i < 16; i++) { if (pattern[i] > 0) rhythmicMask |= (1 << i); }

        motifCache.set(sectionId, {
            seed,
            rhythmicMask,
            pattern
        });
    }

    const motif = motifCache.get(sectionId);
    if (harmony.rhythmicMask !== motif.rhythmicMask) harmony.rhythmicMask = motif.rhythmicMask;

    // 4. Decision: Should we play?
    let shouldPlay = false;
    let durationSteps = 1;
    let isLatched = false;

    // Latching Logic (Soloist Hook Reinforcement)
    if (soloist.enabled && soloist.isReplayingMotif && soloistResult && playback.bandIntensity > 0.6) {
        shouldPlay = true;
        isLatched = true;
        durationSteps = 1;
        rhythmicStyle = 'stabs';
    }

    if (!isLatched) {
        // -- Pads Logic --
        if (rhythmicStyle === 'pads') {
            if (isChordStart || measureStep === 0) {
                shouldPlay = true;
                durationSteps = Math.min(stepsPerMeasure, chord.beats * ts.stepsPerBeat);
            }
            if (stepInChord === 0 && !shouldPlay) {
                shouldPlay = true;
                durationSteps = Math.min(stepsPerMeasure - measureStep, chord.beats * ts.stepsPerBeat);
            }
        }
        // -- Comping / Stabs Logic --
        else {
            const val = motif.pattern[measureStep];
            if (val > 0) {
                // Dynamic check based on intensity thresholds
                // 1: Base (Always, if global intensity > 0.2)
                // 2: Medium (Global > 0.4)
                // 3: High (Global > 0.7)
                const needed = (val === 1) ? 0.0 : (val === 2 ? 0.4 : 0.7);

                if (playback.bandIntensity >= needed) {
                    shouldPlay = true;
                    durationSteps = 2;
                }
            }

            // Call and Response
            if (!shouldPlay && soloist.enabled && soloist.isResting && soloist.notesInPhrase > 0) {
                if (Math.random() < 0.3 * harmony.complexity) {
                    shouldPlay = true;
                    durationSteps = 2;
                }
            }
        }
    }

    if (!shouldPlay) return [];

    // 5. Generate Notes
    const rootMidi = chord.rootMidi;
    let finalIntervals = [...intervals];

    let polyphony = Math.floor(1 + playback.bandIntensity * 3 * harmony.complexity);
    if (activeStyle === 'organ' || activeStyle === 'strings') polyphony = Math.max(2, polyphony);
    if (polyphony > finalIntervals.length) polyphony = finalIntervals.length;
    if (polyphony < 1) polyphony = 1;

    if (finalIntervals.length > polyphony) {
        const guides = getGuideTones(finalIntervals);
        const nonGuides = finalIntervals.filter(i => !guides.includes(i));
        const selected = [...guides];
        let needed = polyphony - selected.length;
        if (needed < 0) {
             finalIntervals = guides.slice(0, polyphony);
        } else {
             finalIntervals = [...guides, ...nonGuides.slice(0, needed)];
        }
    }

    // Increased minimums to avoid bass mud (MIDI 57 = A3, MIDI 53 = F3)
    const rangeMin = activeStyle === 'organ' ? 57 : 53;
    const currentMidis = getBestInversion(rootMidi, finalIntervals, harmony.lastMidis, stepInChord === 0, octave, rangeMin, 79, activeStyle);

    if (currentMidis.length > 0) lastPlayedStep = step;
    const polyphonyComp = 1 / Math.sqrt(currentMidis.length || 1);
    
    const pocketOffset = harmony.pocketOffset || 0;
    const styleOffset = config.octaveOffset || 0;
    const finalMidisForMemory = [];

    for (let i = 0; i < currentMidis.length; i++) {
        const midi = currentMidis[i];
        let finalMidi = midi + styleOffset;

        // Safety Filter: Hard cut below G3 (55) for most styles to prevent muddy collisions with bass
        if (finalMidi < 55 && activeStyle !== 'counter' && activeStyle !== 'plucks') continue;
        
        // Safety Filter: Hard cut above MIDI 100 (E7) to avoid piercing high frequencies
        if (finalMidi > 100) finalMidi -= 12; // Shift down an octave if too high
        if (finalMidi > 100) continue; // Skip if still too high (rare)
        
        const intensity = playback.bandIntensity;
        let slideInterval = 0, slideDuration = 0, vibrato = { rate: 0, depth: 0 };

        if (feel === 'Neo-Soul' && Math.random() < 0.3) {
             slideInterval = (Math.random() > 0.5 ? -1 : -2);
             slideDuration = 0.1;
        }

        if (activeStyle === 'strings' && durationSteps > 4) {
             vibrato = { rate: 5.0, depth: 10 * intensity };
        }

        const baseVol = config.velocity * (0.6 + intensity * 0.4);
        const stagger = (i - (currentMidis.length - 1) / 2) * 0.005;
        let finalOffset = pocketOffset + stagger + (Math.random() * config.timingJitter);

        notes.push({
            midi: finalMidi,
            velocity: baseVol * polyphonyComp,
            durationSteps: Math.max(0.1, durationSteps),
            timingOffset: finalOffset,
            style: activeStyle,
            isLatched: isLatched,
            isChordStart: true,
            slideInterval,
            slideDuration,
            vibrato
        });
        finalMidisForMemory.push(finalMidi);
    }

    harmony.lastMidis = finalMidisForMemory;
    return notes;
}
