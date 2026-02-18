import { getState } from './state.js';
import { getMidi, getFrequency } from './utils.js';
import { TIME_SIGNATURES } from './config.js';

/**
 * ACCOMPANIMENT.JS - Rhythmic Style Engine
 * 
 * Standardized to return Note Objects for the Worker/Scheduler.
 */

export const compingState = {
    currentVibe: 'balanced',
    currentCell: new Array(16).fill(0),
    lockedUntil: 0,
    soloistActivity: 0,
    lastChordIndex: -1,
    lastChordQuality: null, // Track quality for tension resolution
    grooveRetentionCount: 0,
    maxGrooveLength: 4,
    lastSectionId: null
};

const STICKY_GENRES = ['Funk', 'Soul', 'Reggae', 'Neo-Soul', 'Ska'];

/**
 * Algorithmic Pattern Generator
 * Replaces static PIANO_CELLS table to save space and increase variety.
 */
export function generateCompingPattern(genre, vibe, length = 16) {
    const { playback } = getState();
    const pattern = new Array(length).fill(0);
    const intensity = playback.bandIntensity;
    
    // Helper to set a beat if it's within bounds
    const hit = (step) => { if (step < length) pattern[step] = 1; };
    
    // --- GENRE ARCHETYPES ---
    
    if (genre === 'Neo-Soul') {
        // Lay back heavily on the "and" of 2 and 4
        if (length >= 7) hit(6);
        if (length >= 15) hit(14);
        
        // Add random syncopated "filler" at high intensity
        if (intensity > 0.6) {
            const fillers = [3, 9, 11];
            fillers.forEach(f => {
                if (Math.random() < (intensity * 0.4)) hit(f);
            });
        }
        return pattern;
    }

    if (genre === 'Reggae') {
        // Skank on 2 and 4 (Steps 4 and 12 in 16th grid)
        if (length >= 5) hit(4);
        if (length >= 13) hit(12);
        // Sometimes double skank if active
        if (vibe === 'active' || intensity > 0.7) {
            if (length >= 7) hit(6); // The "and" of 2
            if (length >= 15) hit(14); // The "and" of 4
        }
        return pattern;
    }

    if (genre === 'Ska') {
        // Upstroke on every "and" (Steps 2, 6, 10, 14 in 16th grid)
        // For Ska-Punk, these are very consistent.
        [2, 6, 10, 14].forEach(s => { if (s < length) hit(s); });
        
        // Active: Add some 16th syncopations or "double upstrokes"
        if (vibe === 'active' || intensity > 0.7) {
            [3, 7, 11, 15].forEach(s => { if (s < length && Math.random() < 0.3) hit(s); });
        }
        return pattern;
    }
    
    if (genre === 'Disco') {
        // Offbeats (and of every beat)
        for (let i = 2; i < length; i += 4) hit(i);
        // Active: Add 16th syncopation
        if (vibe === 'active') {
            if (length >= 15) hit(14);
            if (length >= 7) hit(6);
        }
        return pattern;
    }
    
    if (genre === 'Funk') {
        // The "One" is often rest in piano comping for Funk to leave space for Bass
        // Focus on "e" and "a" (16th subdivisions)
        if (Math.random() > 0.75) hit(0); // Very optional 1
        
        // Funk Archetype Placements (syncopated clusters)
        const clusters = [
            [3, 4], [6, 7], [10, 11], [14, 15], // The "ah-1" types
            [1, 2], [5, 6], [9, 10], [13, 14]   // The "e-and" types
        ];
        
        let density = 1;
        if (vibe === 'active') density = 3;
        if (vibe === 'sparse' && Math.random() < 0.5) return pattern; // Allow total silence
        
        for (let i = 0; i < density; i++) {
            const cluster = clusters[Math.floor(Math.random() * clusters.length)];
            cluster.forEach(s => { if (Math.random() > 0.3) hit(s); });
        }
        return pattern;
    }
    
    if (genre === 'Jazz' || genre === 'Bossa' || genre === 'Blues') {
        const { arranger } = getState();
        const total = arranger.totalSteps || 0;
        const modStep = playback.step % total;
        // Turnaround detection: last 2 measures of the song loop
        const isTurnaround = (genre === 'Blues') && total > 32 && (modStep >= total - 32);

        const type = Math.random();
        
        if (type > 0.75 || (isTurnaround && Math.random() < 0.5)) { 
            // Charleston: 1 and &2 (Steps 0 and 7)
            hit(0);
            if (vibe !== 'sparse' || isTurnaround) hit(7); 
        } else if (type > 0.5) {
            // Reverse Charleston: &1 and 3 (Steps 3 and 8)
            hit(3);
            if (vibe !== 'sparse') hit(8);
        } else if (type > 0.25) {
            // Syncopated "Ands": &2 and &4 (Steps 7 and 15)
            hit(7);
            if (vibe !== 'sparse') hit(15);
        } else if (type > 0.1) {
            // Red Garland Lite: 1, &2, &3 (Steps 0, 7, 11)
            hit(0);
            hit(7);
            if (vibe === 'active' || isTurnaround) hit(11);
        } else {
            // Sparse Anticipation: &4 (Step 15)
            hit(15);
        }
        
        if (vibe === 'active' || isTurnaround) {
            // Add comping chatter / Turnaround Flourish
            if (length >= 4 && Math.random() > 0.5) hit(4);
            if (length >= 10 && Math.random() > 0.5) hit(10);
            if (length >= 13 && Math.random() > (isTurnaround ? 0.3 : 0.7)) hit(12);
            if (isTurnaround && Math.random() < 0.4) hit(14); // Extra syncopation for turnaround
        }
        return pattern;
    }
    
    // --- ROCK / POP / DEFAULT ---
    // Downbeat focus
    hit(0); // The One
    
    if (vibe === 'sparse') {
        // If low intensity, use arpeggio-style hits on 8ths or 16ths
        if (intensity < 0.4) {
            for (let i = 0; i < length; i += 2) hit(i); // 8th note arpeggio
        }
        return pattern;
    }
    
    // Backbeat support
    if (length >= 5) hit(4); // Beat 2
    if (length >= 9) hit(8); // Beat 3
    if (length >= 13) hit(12); // Beat 4
    
    if (vibe === 'active' || intensity > 0.6) {
        // 8th notes
        for (let i = 2; i < length; i += 2) {
            if (Math.random() > 0.4) hit(i);
        }
    }
    
    // Syncopation
    if (playback.complexity > 0.6 && Math.random() > 0.5) {
        // Remove a downbeat and shift it
        if (pattern[8] === 1) {
            pattern[8] = 0;
            hit(7); // Push to &2
        }
    }

    return pattern;
}

function updateRhythmicIntent(step, soloistBusy, spm = 16, sectionId = null) {
    const { playback, chords, groove } = getState();
    
    // --- Section Change Detection ---
    if (sectionId && compingState.lastSectionId !== sectionId) {
        compingState.grooveRetentionCount = 0;
        compingState.lastSectionId = sectionId;
        compingState.lockedUntil = 0; // Force update
    }

    if (step < compingState.lockedUntil) return;

    // Detect Soloist Falling Edge (Busy -> Not Busy) for "Call & Response"
    const wasBusy = compingState.soloistActivity > 0;
    compingState.soloistActivity = soloistBusy ? 1 : 0;
    const soloistJustStopped = wasBusy && !soloistBusy;

    const intensity = playback.bandIntensity;
    const complexity = playback.complexity;
    let genre = groove.genreFeel;

    // --- Style Override ---
    if (chords.style === 'jazz') genre = 'Jazz';
    else if (chords.style === 'funk') genre = 'Funk';
    else if (chords.style === 'strum8') genre = 'Rock';
    else if (chords.style === 'strum-country') genre = 'Country';
    else if (chords.style === 'power-metal') genre = 'Metal';
    else if (chords.style === 'ska-upstroke') genre = 'Ska';

    if (chords.style === 'smart') {
        const smartMapping = {
            'Afrobeat': 'Funk',
            'Blues': 'Jazz',
            'Country': 'Rock'
        };
        if (smartMapping[genre]) genre = smartMapping[genre];
    }

    // --- Sticky Groove Logic ---
    if (STICKY_GENRES.includes(genre)) {
        compingState.grooveRetentionCount++;
        
        // Only retain if we are NOT on the first bar of the groove
        if (compingState.grooveRetentionCount > 1 && compingState.grooveRetentionCount <= compingState.maxGrooveLength) {
            // RETAIN PATTERN
            compingState.lockedUntil = step + spm;
            return; 
        } 

        // If we exceeded max length, reset and fall through to pick new cell
        if (compingState.grooveRetentionCount > compingState.maxGrooveLength) {
            compingState.grooveRetentionCount = 1; // Start new groove now
            compingState.maxGrooveLength = 4 + Math.floor(Math.random() * 4); // 4-8 bars
        }
    } else {
        // Non-sticky genres (Jazz, Rock, etc.) always refresh or have standard logic
        compingState.grooveRetentionCount = 0;
    }

    if (soloistBusy) {
        compingState.currentVibe = 'sparse';
    } else if (soloistJustStopped) {
        // Soloist is taking a breath -> Fill the space!
        compingState.currentVibe = 'active';
    } else if (intensity > 0.75 || complexity > 0.7) {
        compingState.currentVibe = 'active';
    } else if (intensity < 0.3) {
        compingState.currentVibe = 'sparse';
    } else {
        compingState.currentVibe = 'balanced';
    }

    // Replace static lookup with procedural generation
    // IMPLEMENT NO-REPEAT RULE: Keep trying until we get a different pattern (up to 3 times)
    let newCell = generateCompingPattern(genre, compingState.currentVibe, spm);
    if (JSON.stringify(newCell) === JSON.stringify(compingState.currentCell)) {
        newCell = generateCompingPattern(genre, compingState.currentVibe, spm);
        if (JSON.stringify(newCell) === JSON.stringify(compingState.currentCell)) {
            newCell = generateCompingPattern(genre, compingState.currentVibe, spm);
        }
    }
    compingState.currentCell = newCell;

    // Update global mask for module interaction
    let mask = 0;
    for (let i = 0; i < 16; i++) {
        if (newCell[i] === 1) mask |= (1 << i);
    }
    chords.rhythmicMask = mask; // @worker-mutation

    playback.intent.anticipation = (intensity * 0.2);
    if (genre === 'Jazz' || genre === 'Bossa') playback.intent.anticipation += 0.15;
    
    playback.intent.syncopation = (complexity * 0.4);
    if (genre === 'Funk') playback.intent.syncopation += 0.2;

    playback.intent.layBack = (intensity < 0.4) ? 0.02 : 0; 
    if (genre === 'Neo-Soul') playback.intent.layBack += 0.05; // More lag for Dilla feel

    compingState.lockedUntil = step + spm;
}

function handleSustainEvents(step, measureStep, chordIndex, intensity, genre, stepInfo, currentQuality) {
    const events = [];
    const isNewChord = chordIndex !== compingState.lastChordIndex;
    const isNewMeasure = measureStep === 0;

    if (genre === 'Reggae' || genre === 'Funk' || genre === 'Disco' || genre === 'Ska') {
        events.push({ type: 'cc', controller: 64, value: 0, timingOffset: 0 }); // Sustain Off
        return events; 
    }

    if (isNewMeasure || isNewChord) {
        // BREATH STRATEGY: If coming from a high-tension chord, cut sustain early to clear the air.
        const wasTense = ['7alt', 'dim', 'halfdim', '7b9', '7#9'].includes(compingState.lastChordQuality);
        const clearOffset = wasTense ? -0.15 : 0; // 150ms breath for tension resolution

        events.push({ type: 'cc', controller: 64, value: 0, timingOffset: clearOffset }); // Off
        events.push({ type: 'cc', controller: 64, value: 127, timingOffset: 0.01 }); // On
        
        compingState.lastChordIndex = chordIndex;
        compingState.lastChordQuality = currentQuality;
        return events;
    }
    
    // Update quality tracker even if not new chord (in case of init)
    compingState.lastChordQuality = currentQuality;

    if (stepInfo && stepInfo.isGroupStart && Math.random() < (intensity * 0.5)) {
        events.push({ type: 'cc', controller: 64, value: 0, timingOffset: -0.01 });
        events.push({ type: 'cc', controller: 64, value: 127, timingOffset: 0 });
        return events;
    }

    const isBeat = stepInfo ? stepInfo.isBeatStart : (measureStep % 4 === 0);
    const flutterProb = (intensity * 0.4);
    if (isBeat && Math.random() < flutterProb) {
        events.push({ type: 'cc', controller: 64, value: 0, timingOffset: -0.015 });
        events.push({ type: 'cc', controller: 64, value: 127, timingOffset: 0 });
    }

    if (genre === 'Jazz' && !isBeat) {
        events.push({ type: 'cc', controller: 64, value: 0, timingOffset: 0.1 }); 
    }
    
    return events;
}

/**
 * Main entry point for generating accompaniment notes.
 * Returns an array of standardized Note Objects.
 */
export function getAccompanimentNotes(chord, step, stepInChord, measureStep, stepInfo) {
    const { playback, arranger, chords, bass, soloist, groove, harmony } = getState();
    if (!chords.enabled || !chord) return [];

    const notes = [];
    const genre = groove.genreFeel;
    const intensity = playback.bandIntensity;
    const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
    const spm = ts.beats * ts.stepsPerBeat;
    
    // --- Sustain / CC Handling ---
    const chordIndex = arranger.progression.indexOf(chord);
    const ccEvents = handleSustainEvents(step, measureStep, chordIndex, intensity, genre, stepInfo, chord.quality);
    
    updateRhythmicIntent(step, (soloist.enabled && soloist.busySteps > 0), spm, chord.sectionId);

    // --- GENRE LANES ---

    if (chords.style === 'strum-country') {
        // Boom-Chick Pattern (Root/5th Bass, Chord Strum)
        // Beats 1 and 3 (0 and 8 in 4/4): Bass Note
        // Beats 2 and 4 (4 and 12 in 4/4): Chord Strum
        const ts = TIME_SIGNATURES[arranger.timeSignature] || TIME_SIGNATURES['4/4'];
        const isBass = (measureStep % ts.stepsPerBeat === 0) && ((measureStep / ts.stepsPerBeat) % 2 === 0);
        const isStrum = (measureStep % ts.stepsPerBeat === 0) && ((measureStep / ts.stepsPerBeat) % 2 === 1);
        
        // Train Beat / Bluegrass 16th fills (ghost strums on offbeats)
        const isGhost = (measureStep % 4 !== 0) && (Math.random() < (intensity * 0.6));

        if (isBass) {
            // Alternate Root and Fifth (if possible)
            // measureStep 0 = Root, measureStep 8 (Beat 3) = Fifth
            let note = chord.rootMidi;
            // Simple logic: if it's the second strong beat, try fifth
            if (measureStep > 0 && Math.random() < 0.9) {
                note += 7; // Up a fifth (or down a fourth, logic usually wraps)
                if (note > 60) note -= 12; // Keep it low
            } else {
                // Ensure root is in bass register
                while (note > 55) note -= 12;
            }
            
            notes.push({
                midi: note,
                velocity: 0.6 + (intensity * 0.2),
                durationSteps: 2,
                ccEvents: ccEvents,
                timingOffset: 0.005,
                instrument: 'Piano', // Using piano for "Clean Guitar" approx
                dry: true
            });
            return notes;
        } else if (isStrum || isGhost) {
            const v = isStrum ? (0.5 + intensity * 0.3) : (0.2 + intensity * 0.1);
            let voicing = [...chord.freqs];
            if (voicing.length > 3) voicing = voicing.slice(0, 3); // Simple triads
            
            voicing.forEach((f, i) => {
                notes.push({
                    midi: getMidi(f),
                    velocity: v,
                    durationSteps: isGhost ? 0.5 : 2,
                    ccEvents: (i===0) ? ccEvents : [],
                    timingOffset: (i * 0.015) + (isGhost ? 0.02 : 0), // Slower strum for country
                    instrument: 'Piano',
                    dry: true
                });
            });
            return notes;
        }
        if (ccEvents.length > 0) return [{ midi: 0, velocity: 0, durationSteps: 0, ccEvents, instrument: 'Piano', muted: true }];
        return [];
    }

    if (chords.style === 'power-metal') {
        // Driving 8th notes (chugs) with Power Chords (Root + 5th + Octave)
        // 4/4: 0, 2, 4, 6, 8, 10, 12, 14
        const isEighth = (measureStep % 2 === 0);
        
        if (isEighth) {
            // Power Chord Voicing: Root, 5th, Octave
            const root = chord.rootMidi;
            const voicing = [root, root + 7, root + 12];
            
            const isDownbeat = (measureStep % 4 === 0);
            const isBackbeat = (measureStep === 4 || measureStep === 12);
            
            // "Palm Mute" simulation via velocity/filter in synth
            // Low velocity = Muted, High velocity = Open
            let vel = 0.45; // Default chug
            let dur = 0.8; // Short
            
            if (isDownbeat || isBackbeat) {
                vel = 0.7 + (intensity * 0.3); // Accent
                dur = 1.5; // Let ring slightly more
            } else {
                // Random chug variations
                if (Math.random() < intensity) vel += 0.1;
            }
            
            voicing.forEach((m, i) => {
                notes.push({
                    midi: m,
                    velocity: vel,
                    durationSteps: dur,
                    ccEvents: (i===0) ? ccEvents : [],
                    timingOffset: i * 0.002, // Tight unison
                    instrument: 'Warm', // Warm preset has a saw-like character suitable for distortion
                    dry: false // Use reverb/effects
                });
            });
            return notes;
        }
        if (ccEvents.length > 0) return [{ midi: 0, velocity: 0, durationSteps: 0, ccEvents, instrument: 'Piano', muted: true }];
        return [];
    }

    if (genre === 'Neo-Soul') {
        // "Quartal" and "Rootless" Voicings for Neo-Soul
        // This style favors stacks of 4ths and 2nds (clusters) for that "cloudy" feel.
        const isHit = compingState.currentCell[measureStep % spm] === 1;
        const ghostProb = 0.1 + (intensity * 0.3);
        const isGhost = !isHit && (Math.random() < ghostProb);

        if (isHit || isGhost) {
            let voicing = [];
            // Strategy: Pick the 3rd, 7th, and 9th/11th for a rich, rootless cluster
            const three = chord.intervals.find(i => i === 3 || i === 4);
            const seven = chord.intervals.find(i => i === 10 || i === 11);
            const ext = chord.intervals.find(i => i === 2 || i === 5 || i === 9 || i === 14); // 9, 11, 13
            
            if (three !== undefined && seven !== undefined) {
                voicing = [chord.rootMidi + three, chord.rootMidi + seven];
                if (ext !== undefined) voicing.push(chord.rootMidi + ext);
            } else {
                voicing = chord.freqs.slice(0, 3).map(f => getMidi(f));
            }

            // Neo-Soul "Drunken" Timing (Randomized displacement) - TIGHTENED
            const drunk = (Math.random() - 0.5) * (intensity * 0.02);
            
            voicing.forEach((m, i) => {
                notes.push({
                    midi: m,
                    velocity: (isGhost ? 0.2 : 0.55) * (0.5 + intensity * 0.9),
                    durationSteps: isGhost ? 0.5 : 2.5,
                    ccEvents: (i === 0) ? ccEvents : [],
                    timingOffset: (i * 0.012) + playback.intent.layBack + drunk,
                    instrument: 'Piano',
                    muted: isGhost,
                    dry: true
                });
            });
            return notes;
        }
    }

    if (genre === 'Reggae') {
        // Lane A: The Skank (Staccato chords on 2 & 4)
        const isSkank = (measureStep === 4 || measureStep === 12);
        
        // Lane B: The Bubble (Organ eighth-note patterns)
        const isBubble = (measureStep % 2 === 1); // Only on the "and"
        const bubbleProb = 0.3 + (intensity * 0.5);
        
        if (isSkank) {
            let voicing = [...chord.freqs];
            if (voicing.length > 3) voicing = voicing.slice(0, 3); // Tight skanks
            
            voicing.forEach((f, i) => {
                notes.push({
                    midi: getMidi(f),
                    velocity: (0.4 + (intensity * 0.4)) * (0.9 + Math.random() * 0.2), 
                    durationSteps: 0.5, // Super staccato
                    ccEvents: (i === 0) ? ccEvents : [],
                    timingOffset: (i * 0.005) + 0.01,
                    instrument: 'Piano',
                    dry: true
                });
            });
            return notes;
        }
        
        if (isBubble && Math.random() < bubbleProb) {
            // Bubble uses low-register single notes or dyads
            const bubbleMidi = getMidi(chord.freqs[0]);
            const bubbleMidi2 = chord.freqs[1] ? getMidi(chord.freqs[1]) : null;
            
            const v = (0.3 + (intensity * 0.4)) * (0.9 + Math.random() * 0.2);
            notes.push({
                midi: bubbleMidi,
                velocity: v,
                durationSteps: 0.5,
                ccEvents: ccEvents,
                timingOffset: 0.005,
                instrument: 'Piano',
                dry: true
            });
            if (bubbleMidi2 && Math.random() < 0.4) {
                notes.push({ midi: bubbleMidi2, velocity: v * 0.8, durationSteps: 0.5, ccEvents: [], timingOffset: 0.01, instrument: 'Piano', dry: true });
            }
            return notes;
        }
        
        // Return dummy note if CC events exist but no musical notes
        if (ccEvents.length > 0) {
            return [{ midi: 0, velocity: 0, durationSteps: 0, ccEvents: ccEvents, instrument: 'Piano', muted: true }];
        }
        return [];
    }

    if (genre === 'Funk') {
        // Clav-Style: 16th note syncopation with ghost notes ("chucks")
        let isHit = compingState.currentCell[measureStep % spm] === 1;
        
        // Conversational Displacement: Occasionally shift a hit by 16th if complexity is high
        if (isHit && playback.complexity > 0.7 && soloist.busySteps > 0 && Math.random() < 0.4) {
            isHit = false;
        }

        const ghostProb = 0.15 + (intensity * 0.35);
        const isGhost = !isHit && (Math.random() < ghostProb);

        if (isHit || isGhost) {
            // CLAV-STYLE VOICING: Lean 2-note voicings (Guide Tones: 3rd and 7th)
            // This maintains the "lean, funky pocket" requested.
            let voicing = [];
            
            // Extract 3rd and 7th from intervals if possible, otherwise use slice
            const third = chord.intervals ? chord.intervals.find(i => i === 3 || i === 4) : undefined;
            const seven = chord.intervals ? chord.intervals.find(i => i === 10 || i === 11 || i === 9) : undefined;
            
            if (third !== undefined && seven !== undefined) {
                voicing = [chord.rootMidi + third, chord.rootMidi + seven];
            } else {
                voicing = chord.freqs.slice(0, 2).map(f => getMidi(f));
            }
            
            // Register Slotting: Ensure it stays in a punchy mid-register (C3-C5)
            voicing = voicing.map(m => {
                while (m < 48) m += 12;
                while (m > 72) m -= 12;
                return m;
            });

            voicing.forEach((m, i) => {
                notes.push({
                    midi: m,
                    velocity: (isGhost ? 0.18 : 0.65) * (0.5 + intensity * 0.9) * (0.9 + Math.random() * 0.2),
                    durationSteps: isGhost ? 0.1 : 0.35, // Super short ghost "chucks"
                    ccEvents: (i === 0) ? ccEvents : [],
                    timingOffset: (i * 0.003) + (isGhost ? (0.005 + Math.random() * 0.01) : -0.005),
                    instrument: 'Piano',
                    muted: isGhost,
                    dry: true
                });
            });
            return notes;
        }
        if (ccEvents.length > 0) {
            return [{ midi: 0, velocity: 0, durationSteps: 0, ccEvents: ccEvents, instrument: 'Piano', muted: true }];
        }
        return [];
    }

    // --- STANDARD Pattern Logic ---
    let isHit = compingState.currentCell[measureStep % spm] === 1;

    // Conversational: Listen to Soloist
    // If soloist is busy, suppress hits to avoid clutter (Call & Response)
    if (soloist.enabled && soloist.busySteps > 0 && chords.style === 'smart') {
         if (Math.random() < 0.7) isHit = false; 
    }

    // --- NEW: Harmony Interlocking ---
    // If backgrounds are busy, the main accompanist should find gaps.
    if (isHit && harmony.enabled && harmony.rhythmicMask > 0 && chords.style === 'smart') {
        const hasHarmonyHit = (harmony.rhythmicMask >> (measureStep % 16)) & 1;
        if (hasHarmonyHit && Math.random() < (0.4 + playback.bandIntensity * 0.3)) {
            // Background stab present, suppress piano hit to let it pop
            isHit = false;
        }
    }

    // Force hit on "One" if empty
    if (measureStep === 0 && !isHit && Math.random() < 0.8) isHit = true;
    if (stepInfo && stepInfo.isGroupStart && !isHit && Math.random() < (0.4 + intensity * 0.4)) isHit = true;
    
    if (genre === 'Jazz' || genre === 'Bossa' || genre === 'Blues') {
        // ... (existing logic)
        
        // Conversational Displacement for Jazz/Blues
        if (isHit && soloist.busySteps > 0 && playback.complexity > 0.6 && Math.random() < 0.3) {
            isHit = false;
        }
    }

    // Pad Style Override
    if (chords.style === 'pad') isHit = (stepInChord === 0);

    if (isHit) {
        let timingOffset = 0;
        const isDownbeat = stepInfo ? stepInfo.isBeatStart : (measureStep % 4 === 0);
        const isStructural = stepInfo ? stepInfo.isGroupStart : (measureStep % 8 === 0);
        const intensity = playback.bandIntensity;

        if (chords.style === 'smart') {
            const pushProb = 0.15 + (intensity * 0.2);
            if (!isDownbeat && Math.random() < pushProb) timingOffset = -0.025;
            if (Math.random() < playback.intent.anticipation) timingOffset -= 0.010;
            if (Math.random() < playback.intent.layBack) timingOffset += 0.020;
        }

        let durationSteps = ts.stepsPerBeat * 2; // Default 2 beats
        if (genre === 'Disco' || genre === 'Ska') durationSteps = ts.stepsPerBeat * 0.25; 
        else if (genre === 'Jazz') durationSteps = ts.stepsPerBeat * 1; 
        else if (genre === 'Acoustic') durationSteps = ts.stepsPerBeat * 2.5; 
        else if (genre === 'Rock' || genre === 'Bossa') durationSteps = ts.stepsPerBeat * 1.5;
        
        if (chords.style === 'pad') durationSteps = chord.beats * ts.stepsPerBeat;
        
        durationSteps = Math.max(1, Math.round(durationSteps));

        // Expanded dynamic range: 0.5 + intensity * 0.9 (Range: 0.5 to 1.4)
        const intensityFactor = 0.5 + (intensity * 0.9);
        const velocity = (isStructural ? 0.6 : (isDownbeat ? 0.5 : 0.35)) * intensityFactor;

        // Tighten up durations at high intensity/tempo
        if (intensity > 0.7) durationSteps *= 0.8;
        if (genre === 'Ska' || chords.style === 'ska-upstroke') durationSteps = Math.min(durationSteps, 1.0); // Ensure Ska upstrokes stay tight

        let voicing = [...chord.freqs];
        const complexity = playback.complexity;

        // --- NEW: Harmonic Tension Scaling ---
        // At high complexity, favor 9ths, 11ths, and 13ths (extensions)
        if (complexity > 0.5 && chord.intervals && chord.intervals.length > 3) {
            // If we have extensions beyond the triad/7th, prioritize them in the voicing
            const extensions = chord.intervals.filter(i => i !== 0 && i !== 3 && i !== 4 && i !== 7 && i !== 10 && i !== 11);
            if (extensions.length > 0 && Math.random() < (complexity - 0.4) * 1.5) {
                // Shift voicing to include more color tones
                voicing = voicing.map((f, idx) => {
                    if (idx > 1 && Math.random() < 0.5) {
                        const ext = extensions[Math.floor(Math.random() * extensions.length)];
                        return getFrequency(chord.rootMidi + ext + (Math.random() < 0.5 ? 12 : 0));
                    }
                    return f;
                });
            }
        }

        // --- Low Intensity Arpeggiation / Fingerpicking (Acoustic) ---
        if (genre === 'Acoustic' && intensity < 0.45 && chords.style === 'smart') {
            // Pick a single note or dyad based on the step for a "fingerpicked" feel
            const pattern = [0, 2, 1, 3]; // Bass, High, Mid, High sequence
            const pickIdx = pattern[Math.floor(measureStep / 2) % pattern.length];
            const noteIdx = pickIdx % voicing.length;
            voicing = [voicing[noteIdx]];
            
            // If it's the "One", add the root for foundation
            if (measureStep === 0) voicing.push(chord.freqs[0]);
            
            durationSteps = 4; // Let the strings ring
        }

        // --- Frequency Slotting & Soloist Pocket ---
        const soloistMidi = soloist.enabled ? getMidi(soloist.lastFreq) : 0;
        const bassMidi = bass.enabled ? getMidi(bass.lastFreq) : 0;
        const useClarity = soloistMidi > 72;

        if (chords.style === 'smart') {
            // Jazz Shell Lesson: If things are hot and harmony is complex, stick to shells (3 & 7)
            const isComplex = chord.quality === '7alt' || chord.quality === 'halfdim' || chord.quality === 'dim';
            
            // LOW INTENSITY: Gentle Shells (2 notes)
            if (intensity < 0.4 && genre !== 'Acoustic') {
                 if (voicing.length > 2) voicing = voicing.slice(0, 2);
            }
            // HIGH INTENSITY & COMPLEX: Shells to avoid mud
            else if (genre === 'Jazz' && intensity > 0.6 && isComplex) {
                // Find 3rd and 7th
                const third = chord.intervals.find(i => i === 3 || i === 4);
                const seventh = chord.intervals.find(i => i === 10 || i === 11 || i === 9 || i === 6); // 6 for dim
                if (third !== undefined && seventh !== undefined) {
                    voicing = [getFrequency(chord.rootMidi + third), getFrequency(chord.rootMidi + seventh)];
                }
            }

            // Soloist Pocket: Reduce density or drop velocity when soloist is high
            else if (useClarity && Math.random() < 0.7) {
                if (voicing.length > 3) voicing = voicing.slice(0, 3);
            }

            if (!isStructural && voicing.length > 3 && Math.random() < 0.5) voicing = voicing.slice(0, 3);
            
            // HIGH INTENSITY: Add Octave sparkle
            if (intensity > 0.75 && voicing.length > 0 && Math.random() < 0.6) {
                // Double the highest note up an octave
                const sorted = [...voicing].sort((a,b) => getMidi(a) - getMidi(b));
                const topMidi = getMidi(sorted[sorted.length-1]);
                if (topMidi < 84) { // Don't go too high
                    voicing.push(getFrequency(topMidi + 12));
                }
            }
            
            // Frequency Slotting: Avoid masking the bass
            if (bass.enabled && voicing.length > 0) {
                // Ensure sorted for predictable slotting
                voicing.sort((a, b) => getMidi(a) - getMidi(b));
                
                let lowestMidi = getMidi(voicing[0]);
                if (lowestMidi <= bassMidi + 12) {
                    voicing[0] = getFrequency(lowestMidi + 12);
                    voicing.sort((a, b) => getMidi(a) - getMidi(b));
                }

                if (voicing.length > 3) {
                    voicing.shift(); // Drop the lowest note (often the root) to leave space for bass
                    if ((chord.is7th || chord.quality.includes('9')) && voicing.length > 3) {
                        const rootPC = chord.rootMidi % 12;
                        const fifthPC = (rootPC + 7) % 12;
                        voicing = voicing.filter(f => (getMidi(f) % 12) !== fifthPC);
                    }
                }
            }
        }

        // --- Open Voicings for Jazz/Acoustic ---
        if ((genre === 'Jazz' || genre === 'Acoustic') && chord.quality === 'maj7') {
            if (voicing.length >= 3 && Math.random() < 0.6) {
                const targetIdx = 1;
                const midi = getMidi(voicing[targetIdx]);
                voicing[targetIdx] = getFrequency(midi + 12);
            }
        }

        voicing.forEach((f, i) => {
            const humanShift = (Math.random() * 0.006) - 0.003;
            const humanVol = 0.95 + (Math.random() * 0.1);
            
            // Dynamic Strumming:
            // Low Intensity = Slower (lazier) strum (0.02 - 0.04)
            // High Intensity = Tighter strum (0.005 - 0.01)
            let baseStrum = 0.008;
            if (intensity < 0.4) baseStrum = 0.025; 
            else if (intensity > 0.8) baseStrum = 0.005;
            
            if (genre === 'Acoustic') baseStrum *= 1.5; // Always looser
            
            const stagger = (i * baseStrum) + humanShift;
            const noteCC = (i === 0) ? ccEvents : [];

            notes.push({
                midi: getMidi(f),
                velocity: Math.min(1.0, velocity * humanVol),
                durationSteps,
                bendStartInterval: 0,
                ccEvents: noteCC,
                timingOffset: timingOffset + stagger,
                instrument: 'Piano',
                muted: false,
                dry: (genre === 'Reggae' || genre === 'Funk' || genre === 'Disco')
            });
        });
    }
    
    if (notes.length === 0 && ccEvents.length > 0) {
        notes.push({
            midi: 0,
            velocity: 0,
            durationSteps: 0,
            bendStartInterval: 0,
            ccEvents: ccEvents,
            timingOffset: 0,
            instrument: 'Piano',
            muted: true
        });
    }

    return notes;
}
