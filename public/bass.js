import { getFrequency, getMidi, calculateTimingOffset } from './utils.js';
import { getState } from './state.js';
import { TIME_SIGNATURES, REGGAE_RIDDIMS } from './config.js';
import { getScaleForChord } from './theory-scales.js';

const BOSSA_STEPS = [0, 6, 8, 14];

/**
 * BASS ENGINE - Procedural Line Generation
 * 
 * Logic flow:
 * 1. Determine register based on genre/intensity.
 * 2. Identify target notes (Root/5th/Approach).
 * 3. Generate rhythm cell.
 * 4. Select pitches with voice-leading constraints.
 */

// (Old getScaleForBass removed, using imported version)

export function isBassActive(style, step, stepInChord) {
    const { playback, groove, arranger } = getState();
    if (style === 'smart') {
        const mapping = { 
            'Rock': 'rock', 'Jazz': 'quarter', 'Funk': 'funk', 'Disco': 'disco', 
            'Reggae': 'dub', 'Neo-Soul': 'neo', 'Bossa Nova': 'bossa',
            'Afrobeat': 'funk', 'Blues': 'quarter', 'Acoustic': 'rock', 'Country': 'country', 'Metal': 'metal',
            'Ska-Punk': 'walking-ska', 'Ska': 'walking-ska'
        };
        style = mapping[groove.genreFeel] || mapping[groove.lastDrumPreset] || 'rock';
    }

    if (style === 'whole') return stepInChord === 0;
    if (style === 'half') return stepInChord % 8 === 0;
    if (style === 'arp') return stepInChord % 4 === 0;
    if (style === 'rock') {
        const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        return step % (ts.stepsPerBeat / 2) === 0; // 8th notes
    }
    if (style === 'bossa') {
        const stepInMeasure = step % 16;
        return BOSSA_STEPS.includes(stepInMeasure);
    }
    if (style === 'quarter') {
        const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        const isQuarter = step % ts.stepsPerBeat === 0;
        const isEighthSkip = step % ts.stepsPerBeat === Math.floor(ts.stepsPerBeat * 0.75); // The 'and' of 2/4
        
        if (isQuarter) return true;
        
        // Probabilistic eighth-note "skips" for walking bass feel
        // Complexity adds more "walking" rhythmic variety
        let skipProb = 0.1 + (playback.bandIntensity * 0.25) + (playback.complexity * 0.2);

        // High BPM Safety: Remove skips to prevent muddy low end
        if (playback.bpm > 165) skipProb = 0;

        if (isEighthSkip && Math.random() < skipProb) return true;
        
        return false;
    }
    if (style === 'funk') {
        // Funk uses a combination of foundational 1/8ths and syncopated 1/16ths
        const stepInMeasure = step % 16;
        const isFoundational = [0, 4, 8, 12, 14].includes(stepInMeasure);
        let ghostProb = 0.05 + (playback.bandIntensity * 0.3);

        // High BPM Safety
        if (playback.bpm > 150) ghostProb *= 0.5;

        if (isFoundational) return true;
        if (Math.random() < ghostProb) return true;
        return false;
    }
    if (style === 'rocco') return true;
    if (style === 'disco') return true;
    if (style === 'dub') return true;
    
    if (style === 'neo') {
        const stepInMeasure = step % 16;
        // Foundation: 1, 2&, 3, 4& (classic Dilla-esque placements)
        if ([0, 6, 8, 14].includes(stepInMeasure)) return true;
        // Occasional ghost fills
        if (playback.bandIntensity > 0.6 && Math.random() < 0.15) return true;
        return false;
    }
    if (style === 'country') {
        const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        return step % (ts.stepsPerBeat * 2) === 0; // Quarter notes (1 and 3)
    }
    if (style === 'metal') {
        // Continuous 8th notes (gallop handled in pattern gen or via ghosts)
        const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        return step % (ts.stepsPerBeat / 2) === 0; // 8ths
    }
    if (style === 'walking-ska') {
        const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        const is8th = step % (ts.stepsPerBeat / 2) === 0;
        
        // At extreme BPMs, simplify to quarter notes to prevent mud?
        // Actually for Ska, 8ths are essential. Let's just ensure they are tight.
        if (playback.bpm > 185 && step % ts.stepsPerBeat !== 0 && Math.random() < 0.3) return false;

        return is8th;
    }

    return false;
}

export function getBassNote(chord, nextChord, beatInMeasure, prevFreq, centerMidi, style, chordIndex, step, stepInChord, context = {}) {
    const { playback, groove, soloist, arranger } = getState();
    if (!chord) return null;

    if (style === 'smart') {
        const mapping = { 
            'Rock': 'rock', 'Jazz': 'quarter', 'Funk': 'funk', 'Disco': 'disco', 
            'Reggae': 'dub', 'Neo-Soul': 'neo', 'Bossa Nova': 'bossa', 
            'Country': 'country', 'Metal': 'metal', 'Afrobeat': 'funk', 
            'Blues': 'quarter', 'Acoustic': 'rock', 'Ska-Punk': 'walking-ska', 'Ska': 'walking-ska' 
        };
        style = mapping[groove.genreFeel] || mapping[groove.lastDrumPreset] || 'rock';
    }

    const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const stepsPerMeasure = ts.beats * ts.stepsPerBeat;
    const stepInMeasure = step % stepsPerMeasure;
    const isDownbeat = (stepInMeasure % ts.stepsPerBeat === 0);
    const grouping = ts.grouping || [ts.beats];
    const isGroupStart = (stepInMeasure % (grouping[0] * ts.stepsPerBeat) === 0);

    // --- Intensity Mapping ---
    const globalIntensity = playback.bandIntensity || 0.5;
    const loopStep = step % (arranger.totalSteps || 1);
    
    let sectionProgress = 0;

    if (context.sectionStart !== undefined && context.sectionEnd !== undefined) {
        // O(1) Optimization: Use provided context
        const sectionLength = context.sectionEnd - context.sectionStart;
        sectionProgress = sectionLength > 0 ? (loopStep - context.sectionStart) / sectionLength : 0;
    } else if (arranger.stepMap && arranger.stepMap.length > 0) {
        // Fallback: O(N) Lookup
        const entry = arranger.stepMap.find(e => loopStep >= e.start && loopStep < e.end);
        if (entry) {
            const currentSectionId = entry.chord.sectionId;
            const sectionEntries = arranger.stepMap.filter(e => e.chord.sectionId === currentSectionId);
            const sectionStart = sectionEntries[0].start;
            const sectionEnd = sectionEntries[sectionEntries.length - 1].end;
            const sectionLength = sectionEnd - sectionStart;
            sectionProgress = sectionLength > 0 ? (loopStep - sectionStart) / sectionLength : 0;
        }
    }
    
    const intensity = (globalIntensity * 0.7) + (sectionProgress * 0.3);
    let safeCenterMidi = centerMidi || 48; // Standard bass register anchor
    
    // --- Genre-Specific Register Offsets ---
    if (style === 'dub' || groove.genreFeel === 'Reggae') safeCenterMidi = 32;
    else if (style === 'disco' || groove.genreFeel === 'Disco') safeCenterMidi = 36; // Lowered to allow octaves
    else if (style === 'rocco') safeCenterMidi = 38; // Rocco lives on the low E/A strings
    else if (style === 'neo' || groove.genreFeel === 'Neo-Soul') safeCenterMidi = 36; // Keep it deep

    // Shift center up as intensity builds (max +7 semitones)
    safeCenterMidi += Math.floor(intensity * 7);

    const prevMidi = getMidi(prevFreq);

    const absMin = 28, absMax = 60; // Common bass range (E1 to C4) - Increased to 60 for Disco octaves

    const clampAndNormalize = (midi) => {
        if (!Number.isFinite(midi)) return safeCenterMidi;
        let pc = ((midi % 12) + 12) % 12;
        let octave = Math.floor(safeCenterMidi / 12) * 12;
        let best = -1;
        let minDiff = 999999;
        
        const check = (off) => {
            const c = octave + off + pc;
            if (c >= Math.max(absMin, safeCenterMidi - 12) && c <= Math.min(absMax, safeCenterMidi + 12)) {
                const diff = Math.abs(c - safeCenterMidi);
                if (diff < minDiff) { minDiff = diff; best = c; }
            }
        };
        check(-12); check(0); check(12);
        
        if (best !== -1) return best;
        return Math.max(absMin, Math.min(absMax, octave + pc));
    };

    const normalizeToRange = (midi) => {
        if (!Number.isFinite(midi)) return safeCenterMidi;
        const useCommitment = (style === 'quarter' || style === 'funk') && prevMidi !== null;
        const targetRef = (prevMidi !== null) ? (useCommitment ? (prevMidi * 0.7 + safeCenterMidi * 0.3) : prevMidi) : safeCenterMidi;
        
        const pc = ((midi % 12) + 12) % 12;
        const octaves = [
            Math.floor(targetRef / 12) * 12,
            Math.floor(targetRef / 12) * 12 - 12,
            Math.floor(targetRef / 12) * 12 + 12,
            Math.floor(targetRef / 12) * 12 - 24,
            Math.floor(targetRef / 12) * 12 + 24
        ];
        
        let bestCandidate = octaves[0] + pc;
        let minDiff = Math.abs(bestCandidate - targetRef);
        
        for (let i = 1; i < octaves.length; i++) {
            const cand = octaves[i] + pc;
            const diff = Math.abs(cand - targetRef);
            if (diff < minDiff) {
                minDiff = diff;
                bestCandidate = cand;
            }
        }

        return clampAndNormalize(bestCandidate);
    };

    // Use slash chord bass note if it exists, otherwise use chord root
    const rootToNormalize = (chord.bassMidi !== null && chord.bassMidi !== undefined) ? chord.bassMidi : chord.rootMidi;
    let baseRoot = normalizeToRange(rootToNormalize);

    const beatIndex = beatInMeasure;
    const intBeat = Math.floor(beatIndex);

    // --- SCALE RETRIEVAL (Refactored) ---
    const scale = getScaleForChord(chord, nextChord, style);

    const beatsInChord = Math.round(chord.beats);
    const velocity = (intBeat % 2 === 1) ? 1.15 : 1.0;

    const result = (freq, durationMultiplier = null, velocityParam = 1.0, muted = false, bendStartInterval = 0) => {
        let timingOffset = calculateTimingOffset('bass', groove.pocket, intensity);
        
        // Neo-Soul "Dilla" Lag: Layered on top of holistic pocket
        if (style === 'neo' || groove.genreFeel === 'Neo-Soul') {
            timingOffset += 0.010 + (intensity * 0.015);
        }

        let durationSteps = 1;
        if (durationMultiplier) durationSteps = durationMultiplier;
        else {
            if (style === 'whole') durationSteps = chord.beats * ts.stepsPerBeat;
            else if (style === 'half') durationSteps = (stepsPerMeasure / 2);
            else if (style === 'arp') durationSteps = (ts.stepsPerBeat);
            else if (style === 'rock') durationSteps = (ts.stepsPerBeat * 0.45);
            else if (style === 'funk') durationSteps = 0.8;
            else if (style === 'disco' || style === 'rocco' || style === 'metal' || style === 'neo' || style === 'walking-ska') durationSteps = 0.8;
            else durationSteps = ts.stepsPerBeat;
        }

        if (intensity < 0.4) {
            if (style === 'rock') durationSteps = ts.stepsPerBeat * 0.4;
            else if (style === 'funk') durationSteps = 0.7; // Ensure Funk doesn't overlap at low intensity
            else if (style === 'bossa') durationSteps = durationMultiplier ? durationMultiplier * (ts.stepsPerBeat / 4) : ts.stepsPerBeat;
        }

        // Wider dynamic range: 0.6 + intensity * 0.7 (Range: 0.6 to 1.3)
        const intensityFactor = 0.6 + (intensity * 0.7);
        const finalVel = Math.min(1.25, velocityParam * velocity * intensityFactor);

        return {
            freq,
            midi: getMidi(freq),
            velocity: finalVel,
            durationSteps,
            timingOffset,
            muted,
            bendStartInterval
        };
    };

    // --- Ensemble Awareness (Soloist Space) ---
    // If the soloist is shredding, reduce bass complexity to avoid mud.
    const isSoloistBusy = soloist.busySteps > 0;

    const withOctaveJump = (note) => {
        // Skip octave jumps if soloist is busy or intensity is too low
        if (isSoloistBusy || intensity < 0.4) return note;

        if (Math.random() < 0.15 + (intensity * 0.15)) { // More jumps at high intensity
            const direction = Math.random() < 0.5 ? 1 : -1;
            const shifted = note + (12 * direction);
            // Restrict jumps to stay below MIDI 55 to avoid clashing with Piano LH
            if (shifted >= 36 && shifted <= 55) return shifted;
        }
        return note;
    }

    // --- NEO-SOUL POCKET ---
    if (style === 'neo' || groove.genreFeel === 'Neo-Soul') {
        const isSecondaryAnchor = (intBeat === 2);
        const isUpbeat = step % 4 !== 0;
        
        // Neo-soul bass should be extremely foundational.
        if (isSecondaryAnchor || isUpbeat) {
            const hasFlat5 = scale.includes(6) && !scale.includes(7);
            const hasSharp5 = scale.includes(8) && !scale.includes(7);
            const fifth = hasFlat5 ? 6 : (hasSharp5 ? 8 : 7);
            if (Math.random() < 0.85) {
                const note = Math.random() < 0.6 ? baseRoot : baseRoot + fifth;
                return result(getFrequency(clampAndNormalize(note)), null, velocity);
            }
        }
    }

    const isSameAsPrev = (midi) => {
        if (!prevMidi) return false;
        return midi === prevMidi;
    };

    // --- Ensemble Awareness (Kick Drum Mirroring) ---
    const kickInst = (groove.instruments || []).find(i => i.name === 'Kick');
    const hasKickTrigger = kickInst && kickInst.steps && kickInst.steps[step % (groove.measures * stepsPerMeasure)] > 0;
    
    if ((style === 'rock' || style === 'funk') && hasKickTrigger) {
        const kickVel = (kickInst.steps[step % (groove.measures * stepsPerMeasure)] === 2) ? 1.25 : 1.15;
        // Scale kick velocity by intensity
        const dynamicKickVel = Math.max(0.8, kickVel * (0.7 + intensity * 0.3));
        return result(getFrequency(withOctaveJump(baseRoot)), null, dynamicKickVel);
    } else if ((style === 'rock' || style === 'funk') && !hasKickTrigger && intensity < 0.4 && !isDownbeat) {
        if (isSoloistBusy) return null;
        if (Math.random() < 0.6) return null;
        if (Math.random() < 0.3) return result(getFrequency(baseRoot), 1, 0.4, true);
    }

    // --- HARMONIC RESET ---
    const isStraightStyle = ['rock', 'half', 'whole', 'arp', 'quarter', 'disco', 'neo'].includes(style);
    if (stepInChord === 0 && (isStraightStyle || style === 'funk') && groove.genreFeel !== 'Reggae') {
        const resetVel = style === 'funk' ? 1.25 : (1.0 + intensity * 0.25);
        return result(getFrequency(withOctaveJump(baseRoot)), null, resetVel);
    }

    // --- WHOLE NOTE STYLE ---
    if (style === 'whole') return result(getFrequency(withOctaveJump(baseRoot)));

    // --- HALF NOTE STYLE ---
    if (style === 'half') {
        const halfStep = Math.floor(stepsPerMeasure / 2);
        if (stepInChord % halfStep === 0) {
            if (stepInChord === 0) return result(getFrequency(withOctaveJump(baseRoot)));
            const hasFlat5 = chord.quality === 'dim' || chord.quality === 'halfdim';
            const hasSharp5 = chord.quality === 'aug' || chord.quality === 'augmaj7';
            let fifth = baseRoot + (hasFlat5 ? 6 : (hasSharp5 ? 8 : 7));
            return result(getFrequency(clampAndNormalize(withOctaveJump(fifth))));
        }
        return null;
    }

    // --- ARP STYLE ---
    if (style === 'arp') {
        if (!isDownbeat) return null;
        const beatInMeasureInside = Math.floor(stepInMeasure / ts.stepsPerBeat);
        const beatInPattern = beatInMeasureInside % 4;
        if (beatInPattern === 0 || isGroupStart) return result(getFrequency(withOctaveJump(baseRoot)));
        const intervals = chord.intervals; 
        let targetInterval = (beatInPattern === 1 || beatInPattern === 3) ? (intervals[1] || 4) : (intervals[2] || 7);
        return result(getFrequency(clampAndNormalize(withOctaveJump(baseRoot + targetInterval))));
    }

    // --- COUNTRY STYLE (Root-Five) ---
    if (style === 'country') {
        // Root on beat 1, Fifth on beat 3
        const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        const isBeat3 = (stepInMeasure % (ts.stepsPerBeat * 4) === (ts.stepsPerBeat * 2));
        
        // Low intensity: Simplify to just Root on One?
        if (intensity < 0.3 && !isDownbeat) return null;

        let note = baseRoot;
        if (isBeat3) {
            // Alternate bass
            note = normalizeToRange(baseRoot - 5); // Down a fourth (or up a fifth)
            if (note > baseRoot) note -= 12; // Prefer lower 5th
        }
        
        // Occasional walk-up on beat 4
        if (stepInMeasure % ts.stepsPerBeat === 0 && Math.floor(beatInMeasure) === 3 && Math.random() < 0.4 && intensity > 0.4) {
             const nextTarget = nextChord ? nextChord.rootMidi : baseRoot;
             const approach = normalizeToRange(nextTarget - 1);
             return result(getFrequency(approach), 1, 1.1);
        }

        const pluckVel = 0.9 + (intensity * 0.3);
        return result(getFrequency(note), 2, pluckVel); // Plucky
    }

    // --- METAL STYLE (Pedal Point / Gallop) ---
    if (style === 'metal') {
        const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        const subDiv = ts.stepsPerBeat / 2;
        const isEighth = step % subDiv === 0;
        
        // Low Intensity: Simplify to Quarter Notes (Downbeats only)
        if (intensity < 0.35 && !isDownbeat) return null;

        if (isEighth) {
            const isDownbeat = (step % ts.stepsPerBeat === 0);
            const note = baseRoot; // Chug on root
            
            // Accent logic
            const vel = (isDownbeat ? 1.1 : 0.9) * (0.8 + intensity * 0.4);
            
            // Riffing on beats 3 and 4 (high intensity)
            if (intensity > 0.7 && beatInMeasure >= 2) {
                 // scale already retrieved
                 if (Math.random() < 0.3) {
                     const idx = Math.floor(Math.random() * 3); // Root, 2nd, b3
                     const riffNote = normalizeToRange(baseRoot + scale[idx]);
                     return result(getFrequency(riffNote), 0.5, vel);
                 }
            }
            
            return result(getFrequency(note), 0.5, vel);
        }
        return null;
    }

    // --- ROCK STYLE (8th Note Pedal) ---
    if (style === 'rock') {
        const dur = 0.7; 
        const isPulse = ts.pulse.includes(stepInMeasure);
        
        // Low Intensity: Switch to Quarter Notes
        if (intensity < 0.35) {
            if (!isDownbeat) return null; // Only play on beat
        }

        const velocityRock = ((isGroupStart || (isPulse && isDownbeat)) ? 1.15 : 1.0) * (0.7 + intensity * 0.4);
        const lastBeatIndex = ts.beats - 1;
        const beat = Math.floor(stepInMeasure / ts.stepsPerBeat);
        
        // Fill logic (High Intensity only)
        if (beat === lastBeatIndex && Math.random() < 0.4 && intensity > 0.5) {
             if (stepInMeasure === (lastBeatIndex * ts.stepsPerBeat)) { 
                 const hasFlat5 = chord.quality === 'dim' || chord.quality === 'halfdim';
                 const hasSharp5 = chord.quality === 'aug' || chord.quality === 'augmaj7';
                 const fifthOffset = hasFlat5 ? 6 : (hasSharp5 ? 8 : 7);
                 const fillNote = Math.random() < 0.5 ? baseRoot + 12 : baseRoot + fifthOffset;
                 return result(getFrequency(clampAndNormalize(withOctaveJump(fillNote))), dur, velocityRock * 1.1);
             }
        }
        return result(getFrequency(withOctaveJump(baseRoot)), dur, velocityRock);
    }

    // --- BOSSA NOVA / SAMBA STYLE ---
    if (style === 'bossa') {
        const stepsPerMeasureBossa = ts.beats * ts.stepsPerBeat;
        const stepInMeasureBossa = step % stepsPerMeasureBossa;
        const root = baseRoot;
        const fifth = clampAndNormalize(root + (chord.quality.includes('dim') ? 6 : 7));
        if (intensity > 0.65) {
            if (stepInMeasureBossa === 0) return result(getFrequency(root), 2, 1.1);
            if (stepInMeasureBossa === 4) return result(getFrequency(root), 2, 0.95);
            if (stepInMeasureBossa === 8) return result(getFrequency(root), 2, 1.1);
            if (stepInMeasureBossa === 12) return result(getFrequency(root), 2, 0.95);
            if (stepInMeasureBossa === 6 || stepInMeasureBossa === 14) {
                const note = Math.random() < 0.7 ? fifth : root + 12;
                return result(getFrequency(clampAndNormalize(note)), 2, 1.25);
            }
        } else {
            if (stepInMeasureBossa === 0) return result(getFrequency(root), 4, 1.05);
            if (stepInMeasureBossa === 6) return result(getFrequency(fifth), 2, 1.1);
            if (stepInMeasureBossa === 8) return result(getFrequency(root), 4, 1.05);
            if (stepInMeasureBossa === 14) return result(getFrequency(fifth), 2, 1.1);
        }
        return null;
    }

    // --- FUNK STYLE ---
    if (style === 'funk') {
        const stepInBeat = stepInChord % 4;
        const intBeatFunk = Math.floor(stepInChord / 4);
        const isOne = stepInChord === 0;
        
        // 1. "The One" is the anchor - Always strong
        if (isOne) return result(getFrequency(withOctaveJump(baseRoot)), 0.9, 1.25);

        // 2. The "And" (8th notes) - Prime candidates for Octave Pops
        if (stepInBeat === 2) {
            const octavePopProb = 0.2 + (intensity * 0.4);
            if (Math.random() < octavePopProb) {
                const note = baseRoot + 12;
                // Pop velocity: triggers brighter synth mode
                const popVel = 1.15 + (intensity * 0.15); 
                return result(getFrequency(clampAndNormalize(note)), 0.4, popVel);
            }
            // Occasional 5th or Octave down for variety
            if (Math.random() < 0.3) {
                const note = Math.random() < 0.5 ? baseRoot + 7 : baseRoot - 12;
                return result(getFrequency(clampAndNormalize(note)), 0.6, 0.9);
            }
        }

        // 3. High Intensity: Melodic Walking / Chromatic Approaches
        if (intensity > 0.6) {
            // Approach to Beat 3 (Step 8) or Beat 1 (Step 0)
            if ((stepInChord === 7 || stepInChord === 15) && Math.random() < 0.5) {
                const target = (stepInChord === 7) ? baseRoot : (nextChord ? normalizeToRange(nextChord.rootMidi) : baseRoot);
                const approach = Math.random() < 0.5 ? target - 1 : target + 1;
                return result(getFrequency(clampAndNormalize(approach)), 0.5, 1.05);
            }
        }

        // 4. Ghost Note "Peeling"
        if (!isSoloistBusy && (stepInBeat === 1 || stepInBeat === 3) && Math.random() < (0.1 + intensity * 0.3)) {
             // Muted "chucks" to keep the 16th engine moving
             return result(getFrequency(prevMidi || baseRoot), 0.2, 0.4, true);
        }

        // 5. Mid-phrase stability (Beat 3)
        if (intBeatFunk === 2 && stepInBeat === 0) {
             return result(getFrequency(withOctaveJump(baseRoot)), 0.8, 1.0);
        }

        return null;
    }

    // --- ROCCO STYLE (Machine-Gun 16ths) ---
    if (style === 'rocco') {
        const stepInBeat = stepInChord % 4;
        // Rocco Prestia style: Staccato 16th notes, mostly Root, heavily muted (ghosts).
        // Driving, percussive, disciplined.

        // 1. The "One" is always strong.
        if (stepInChord === 0) return result(getFrequency(baseRoot), 0.7, 1.2);

        // 2. Downbeats of 2, 3, 4
        if (stepInBeat === 0) {
            // Almost always play the root, tight.
            return result(getFrequency(baseRoot), 0.7, 1.15);
        }

        // 3. The "And" (8th notes) - Often Root or Octave or 5th
        if (stepInBeat === 2) {
            // 60% chance of playing
            if (Math.random() < 0.4 + (intensity * 0.4)) {
                // Occasional octave jump or 5th for flavor, but mostly root
                let note = baseRoot;
                const rnd = Math.random();
                if (rnd < 0.15) note += 12; // Octave pop
                else if (rnd < 0.25) note += 7; // 5th

                // Manual clamping to preserve interval direction where possible
                if (note > absMax) note -= 12;
                if (note < absMin) note += 12;
                if (note > absMax || note < absMin) note = baseRoot;

                return result(getFrequency(note), 0.7, 1.1);
            }
            // If not playing a tone, play a ghost note
            return result(getFrequency(baseRoot), 0.6, 0.7, true);
        }

        // 4. The "e" and "a" (16th notes) - The chug engine
        if (stepInBeat === 1 || stepInBeat === 3) {
            // High probability of ghost notes to propel groove
            // Probability increases with intensity, but base is high (Rocco is busy)
            let ghostProb = 0.6 + (intensity * 0.3);

            // High BPM Safety
            if (playback.bpm > 150) ghostProb *= 0.6;

            if (Math.random() < ghostProb) {
                // Mostly muted/ghosts
                // At very high intensity, some might become short staccato tones
                const isTone = (intensity > 0.8 && Math.random() < 0.3);
                return result(getFrequency(baseRoot), 0.5, isTone ? 0.9 : 0.6, !isTone);
            }
        }
        return null;
    }

    // --- DISCO STYLE (Octaves) ---
    if (style === 'disco') {
        const stepInBeat = stepInChord % 4;

        // 1. Downbeats (1, 2, 3, 4) -> Root
        if (stepInBeat === 0) {
            return result(getFrequency(baseRoot), 0.9, 1.2);
        }

        // 2. Upbeats (&) -> Octave
        if (stepInBeat === 2) {
            let note = baseRoot + 12;
            // Preservative clamping
            if (note > absMax) note = baseRoot - 12;
            if (note < absMin) note = baseRoot;

            return result(getFrequency(note), 0.9, 1.15);
        }

        // 3. 16ths -> Occasional ghost skips at high intensity
        if ((stepInBeat === 1 || stepInBeat === 3) && intensity > 0.6) {
            if (Math.random() < (intensity - 0.5)) {
                return result(getFrequency(baseRoot), 0.5, 0.7, true);
            }
        }

        return null;
    }

    // --- DUB STYLE (Reggae) ---
    if (style === 'dub') {
        const deepRoot = clampAndNormalize(baseRoot - 12); 
        const measureStepReggae = step % 16;
        let selectedRiddim = 'One Drop';
        if (intensity > 0.8) selectedRiddim = 'Steppers';
        else if (intensity > 0.6) selectedRiddim = 'Stalag';
        else if (intensity > 0.4) selectedRiddim = '54-46';
        else if (intensity > 0.2) selectedRiddim = 'Real Rock';
        const riddim = REGGAE_RIDDIMS[selectedRiddim];
        const match = riddim.find(r => r[0] === measureStepReggae);
        if (match) {
            const [, interval, vel, dur] = match;
            const tunedVel = vel * 0.7; 
            return result(getFrequency(clampAndNormalize(deepRoot + interval)), dur, tunedVel * (0.95 + Math.random() * 0.1));
        }
        return null;
    }

    // --- WALKING SKA STYLE (Fast 8ths) ---
    if (style === 'walking-ska') {
        const is8th = (step % (ts.stepsPerBeat / 2) === 0);
        if (!is8th) return null;

        const isQuarter = (step % ts.stepsPerBeat === 0);
        const beatIdx = Math.floor(stepInMeasure / ts.stepsPerBeat);

        // 1. Foundation: Downbeats of 1 and 3 are usually Root or 5th
        if (isQuarter && (beatIdx === 0 || beatIdx === 2)) {
            const note = (beatIdx === 0 || Math.random() > 0.4) ? baseRoot : baseRoot + 7;
            return result(getFrequency(clampAndNormalize(withOctaveJump(note))), 1, 1.1);
        }

        // 2. High Intensity: Melodic 8th note walking
        if (intensity > 0.5) {
            // Chromatic approach to the next beat
            const isApproach = (step % ts.stepsPerBeat !== 0);
            if (isApproach) {
                const nextTargetMidi = nextChord ? nextChord.rootMidi : baseRoot;
                const target = normalizeToRange(nextTargetMidi);
                const approachNote = Math.random() < 0.5 ? target - 1 : target + 1;
                return result(getFrequency(clampAndNormalize(withOctaveJump(approachNote))), 0.8, 1.0);
            }
        }

        // 3. Scalar/Chordal movement for other steps
        const noteIdx = Math.floor(Math.random() * scale.length);
        const walkNote = baseRoot + scale[noteIdx];
        return result(getFrequency(clampAndNormalize(withOctaveJump(walkNote))), 0.8, 0.95);
    }

    // --- QUARTER NOTE (WALKING) STYLE ---
    if (style === 'quarter' && groove.genreFeel === 'Jazz' && intensity < 0.3) {
        const isHalfPulse = stepInMeasure % (ts.stepsPerBeat * 2) === 0;
        if (!isHalfPulse) return null;
        if (stepInMeasure === 0 || (stepInMeasure % stepsPerMeasure === 0)) return result(getFrequency(withOctaveJump(baseRoot)), 2, 1.05);
        const hasFlat5 = chord.quality === 'dim' || chord.quality === 'halfdim';
        const hasSharp5 = chord.quality === 'aug' || chord.quality === 'augmaj7';
        return result(getFrequency(clampAndNormalize(withOctaveJump(baseRoot + (hasFlat5 ? 6 : (hasSharp5 ? 8 : 7))))), 2, 1.05);
    }

    if (beatIndex % 1 !== 0) return null;

    if (intBeat === 2 && style === 'quarter' && Math.random() < 0.8) {
        const hasFlat5 = chord.quality === 'dim' || chord.quality === 'halfdim';
        const hasSharp5 = chord.quality === 'aug' || chord.quality === 'augmaj7';
        return result(getFrequency(clampAndNormalize(withOctaveJump(baseRoot + (hasFlat5 ? 6 : (hasSharp5 ? 8 : 7))))), null, velocity);
    }

    if (intBeat === beatsInChord - 1 && nextChord) {
        const nextTarget = nextChord.bassMidi !== null && nextChord.bassMidi !== undefined ? nextChord.bassMidi : nextChord.rootMidi;
        const targetRoot = normalizeToRange(nextTarget);
        const pullTension = (soloist.tension || 0) + (intensity * 0.3) + (playback.complexity * 0.2);
        const chromaticProb = (isSoloistBusy ? 0.1 : 0.25) + (pullTension * 0.3);
        if (Math.random() < chromaticProb && (groove.genreFeel === 'Jazz' || groove.genreFeel === 'Blues' || pullTension > 0.7)) {
            const choices = [{ midi: targetRoot - 5, weight: 1.0 }, { midi: targetRoot - 1, weight: 0.6 }, { midi: targetRoot + 1, weight: 0.4 }];
            let totalWeight = choices.reduce((acc, c) => acc + c.weight, 0);
            let r = Math.random() * totalWeight;
            let approach = targetRoot - 1;
            for (let c of choices) { r -= c.weight; if (r <= 0) { approach = c.midi; break; } }
            approach = clampAndNormalize(withOctaveJump(approach));
            let bend = (Math.random() < 0.2 && !isSoloistBusy) ? (approach < targetRoot ? -1 : 1) : 0;
            return result(getFrequency(approach), null, velocity, false, bend);
        } else {
            let candidates = [targetRoot - 5, targetRoot + 7, targetRoot + 5, targetRoot - 7];
            let valid = candidates.filter(n => n >= absMin && n <= absMax && !isSameAsPrev(n) && (n % 12 !== baseRoot % 12));
            let approach = valid.length > 0 ? valid[Math.floor(Math.random() * valid.length)] : targetRoot - 5;
            return result(getFrequency(withOctaveJump(approach)), null, velocity);
        }
    }

    if (intBeat > 0) {
        let candidates = scale.map(pc => {
            const note = baseRoot + pc;
            const octaves = [0, 12, -12];
            let best = note, minDiff = Math.abs(note - baseRoot);
            for (const o of octaves) { if (Math.abs(note + o - baseRoot) < minDiff) { minDiff = Math.abs(note + o - baseRoot); best = note + o; } }
            return best;
        }).filter(n => n >= absMin && n <= absMax && !isSameAsPrev(n));

        if (isSoloistBusy) {
            candidates = candidates.filter(n => {
                const pc = n % 12;
                const rootPC = baseRoot % 12;
                return pc === rootPC || pc === (rootPC + 7) % 12;
            });
            if (candidates.length === 0) candidates = [baseRoot, baseRoot + 7, baseRoot - 5].map(n => clampAndNormalize(n));
        }

        if (candidates.length > 0) {
            candidates.sort((a, b) => Math.abs(a - (prevMidi || baseRoot)) - Math.abs(b - (prevMidi || baseRoot)));
            return result(getFrequency(withOctaveJump(candidates[Math.floor(Math.random() * Math.min(2, candidates.length))])), null, velocity);
        }
    }

    return result(getFrequency(withOctaveJump(baseRoot)), null, velocity);
}