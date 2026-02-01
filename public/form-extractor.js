/**
 * Analyzes a raw sequence of chords to find repeating structures and suggest sections.
 * Optimized for standard song forms (AABA, Blues) and "Lead Sheet" style organization.
 * @param {Array} beatData Array of { chord, energy } objects
 */
export function extractForm(beatData, beatsPerMeasure = 4) {
    if (!beatData || beatData.length < 4) return [];

    // Flatten beat results into a full timeline
    const maxBeat = beatData[beatData.length - 1].beat;
    const timeline = new Array(maxBeat + 1).fill(null);
    beatData.forEach(b => { timeline[b.beat] = b; });
    
    // Fill gaps
    let current = timeline.find(b => b !== null) || { chord: "C", energy: 0 };
    for (let i = 0; i < timeline.length; i++) {
        if (timeline[i]) current = timeline[i];
        else timeline[i] = { ...current, beat: i };
    }

    // 1. HARMONIC SIMPLIFICATION (The "Ear" Pass)
    const simplify = (c) => {
        if (!c || c === 'Rest' || c === '-') return '-';
        // Normalize: Cmaj7 -> C, Cm7 -> Cm, C7 -> C
        // We keep root and quality (major/minor) but drop extensions
        return c.replace(/maj7|maj9|m7|m9|m6|m11|7|6|9|11|13|sus4|sus2|dim|aug|5/g, (match) => {
            if (match.startsWith('m')) return 'm'; 
            return ''; 
        }).trim();
    };

    // Helper: Calculate harmonic distance between two simplified chords
    // 0 = Exact Match, 0.5 = Root Match (different quality), 1.0 = No Match
    const getChordDistance = (c1, c2) => {
        if (c1 === c2) return 0;
        const root1 = c1.replace(/m$/, '');
        const root2 = c2.replace(/m$/, '');
        if (root1 === root2) return 0.4; // Same root, different quality (e.g. C vs Cm)
        return 1.0;
    };

    // 2. MEASURE CONSOLIDATION
    const measures = [];
    const originalMeasures = []; 
    const measureEnergy = [];
    
    for (let i = 0; i < timeline.length; i += beatsPerMeasure) {
        const slice = timeline.slice(i, i + beatsPerMeasure);
        if (slice.length < beatsPerMeasure) break;

        const counts = {};
        let totalEnergy = 0;
        slice.forEach(b => {
            counts[b.chord] = (counts[b.chord] || 0) + 1;
            totalEnergy += b.energy;
        });
        
        // Majority vote for the measure's chord
        const majority = Object.entries(counts).reduce((a, b) => a[1] > b[1] ? a : b)[0];
        measureEnergy.push(totalEnergy / beatsPerMeasure);

        // If the majority chord takes up at least half the bar, use it.
        // Otherwise, split measure (e.g. C - G).
        if (counts[majority] >= beatsPerMeasure * 0.5) {
            measures.push(simplify(majority));
            originalMeasures.push(majority);
        } else {
            // Split measure logic: First chord + Third chord (beat 1 and 3)
            const c1 = slice[0].chord;
            const c3 = slice[2].chord || slice[1].chord; // Fallback
            measures.push(`${simplify(c1)} ${simplify(c3)}`);
            originalMeasures.push(`${c1} ${c3}`);
        }
    }

    // 3. PATTERN MINING (Multi-scale: 32, 16, 12, 8, 4)
    const sections = [];
    let i = 0;

    // Fuzzy Similarity Check
    const getSimilarity = (idx1, idx2, len) => {
        let error = 0;
        for (let k = 0; k < len; k++) {
            const m1 = measures[idx1 + k];
            const m2 = measures[idx2 + k];

            // Handle split measures ("C G" vs "C")
            const sub1 = m1.split(' ');
            const sub2 = m2.split(' ');

            // Compare primary chords (first beat)
            const dist = getChordDistance(sub1[0], sub2[0]);

            // If completely different, penalty 1.0
            // If partial (same root), penalty 0.4
            error += dist;
        }
        // Return similarity score (1.0 = perfect, 0.0 = terrible)
        return 1.0 - (error / len);
    };

    const getConsensusValue = (startIdx, len, repeats) => {
        const consensus = [];
        for (let k = 0; k < len; k++) {
            const counts = {};
            for (let r = 0; r < repeats; r++) {
                const measure = originalMeasures[startIdx + r * len + k];
                counts[measure] = (counts[measure] || 0) + 1;
            }
            const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
            consensus.push(best);
        }
        return consensus.join(' | ');
    };

    while (i < measures.length) {
        let bestLen = 0;
        let bestRepeat = 0;
        let bestScore = 0;

        // A. EXISTING SECTION MATCH (Global Consistency)
        // Prioritize matching the current block to an already identified section (e.g. A3 -> A1)
        // This prevents A3 from being interpreted as a local loop if it matches the global structure.
        for (const s of sections) {
             const len = s.lengthInMeasures;
             // We only care about sections that are "significant" (>= 4 bars)
             if (len < 4) continue;

             if (i + len <= measures.length) {
                 const sim = getSimilarity(s.startMeasureIndex, i, len);
                 if (sim >= 0.7) {
                     // Found a match!
                     // Is this better than what we have? (Longer is better)
                     if (len >= bestLen) {
                         let currentRepeat = 1;
                         // Check for repeats of this existing section structure
                         let lookAheadIdx = i + len;
                         while (lookAheadIdx + len <= measures.length) {
                             if (getSimilarity(s.startMeasureIndex, lookAheadIdx, len) >= 0.7) {
                                 currentRepeat++;
                                 lookAheadIdx += len;
                             } else {
                                 break;
                             }
                         }

                         // Score Bonus for Global Consistency
                         // A local loop of 4 bars x 2 has score ~2.0.
                         // A Global match of 8 bars should beat it.
                         // Base score 5.0 ensures it wins against most local loops.
                         const score = 5.0 + len + currentRepeat;

                         if (score > bestScore) {
                             bestLen = len;
                             bestRepeat = currentRepeat;
                             bestScore = score;
                         }
                     }
                 }
             }
        }

        // B. LOCAL PATTERN MINING (New Sections)
        for (let len of [32, 16, 12, 8, 4]) {
            if (i + len <= measures.length) {
                // Check for immediate repetition
                let currentScore = 0;
                let repeat = 1;

                let lookAheadIdx = i + len;
                while (lookAheadIdx + len <= measures.length) {
                    const sim = getSimilarity(i, lookAheadIdx, len);
                    if (sim >= 0.7) {
                        repeat++;
                        currentScore += sim;
                        lookAheadIdx += len;
                    } else {
                        break;
                    }
                }

                // Normalize score
                const avgScore = repeat > 1 ? currentScore / (repeat - 1) : 0;
                // Local loop score
                let weightedScore = avgScore * Math.sqrt(len);

                if (repeat > 1 && weightedScore > bestScore) {
                    bestLen = len;
                    bestRepeat = repeat;
                    bestScore = weightedScore;
                }
            }
        }

        if (bestLen > 0) {
            const value = getConsensusValue(i, bestLen, bestRepeat);
            const avgEnergy = measureEnergy.slice(i, i + bestLen * bestRepeat).reduce((a, b) => a + b, 0) / (bestLen * bestRepeat);
            sections.push({ 
                value, 
                repeat: bestRepeat, 
                energy: avgEnergy,
                startMeasureIndex: i,
                lengthInMeasures: bestLen
            });
            i += bestLen * bestRepeat;
        } else {
            // Fallback: 4-bar chunk
            const len = Math.min(4, measures.length - i);
            const value = originalMeasures.slice(i, i + len).join(' | ');
            const avgEnergy = measureEnergy.slice(i, i + len).reduce((a, b) => a + b, 0) / len;
            sections.push({ 
                value, 
                repeat: 1, 
                energy: avgEnergy,
                startMeasureIndex: i,
                lengthInMeasures: len
            });
            i += len;
        }
    }

    // 4. AGGRESSIVE CONSOLIDATION (Merging adjacent variations)
    // If Section A (x1) is followed by Section A (x1) [which might be a slight variation], merge them!
    let consolidated = [];

    // Helper to check if two values are "close enough"
    const areValuesSimilar = (v1, v2) => {
        const m1 = v1.split(' | ').map(simplify);
        const m2 = v2.split(' | ').map(simplify);
        if (m1.length !== m2.length) return false;

        let error = 0;
        for (let k = 0; k < m1.length; k++) {
            error += getChordDistance(m1[k], m2[k]);
        }
        return (1.0 - (error / m1.length)) >= 0.7;
    };

    sections.forEach(s => {
        const last = consolidated[consolidated.length - 1];
        if (last && areValuesSimilar(last.value, s.value)) {
            // Merge!
            last.repeat += s.repeat;
            last.energy = (last.energy + s.energy) / 2;
            // Note: We keep the value of the FIRST instance as the "canonical" version.
        } else {
            consolidated.push(s);
        }
    });

    // 5. LABELING (Lead Sheet Style)
    let currentLetter = 'A';
    
    // Pre-scan for duplicates to assign letters
    const uniqueProgressions = [];

    consolidated.forEach(s => {
        // Find if this progression matches a known one
        let match = uniqueProgressions.find(p => areValuesSimilar(p.value, s.value));
        
        if (!match) {
            match = {
                value: s.value,
                label: `Section ${currentLetter}`
            };
            
            // Heuristic Labels
            const isShort = s.lengthInMeasures <= 8;
            const isFirst = uniqueProgressions.length === 0;
            const isLast = consolidated.indexOf(s) === consolidated.length - 1;
            const isLowEnergy = s.energy < 0.4;
            
            if (isFirst && isShort && isLowEnergy) {
                match.label = "Intro";
            } else if (isLast && isShort && isLowEnergy) {
                match.label = "Outro";
            } else {
                // Advance letter only if it's a "real" section
                currentLetter = String.fromCharCode(currentLetter.charCodeAt(0) + 1);
            }
            
            uniqueProgressions.push(match);
        }
        
        s.label = match.label;
    });

    // 6. FINAL CLEANUP (Formatting)
    return consolidated.map(s => {
        // Calculate beat ranges
        const totalMeasures = s.value.split('|').length * s.repeat;
        const startBeat = s.startMeasureIndex * beatsPerMeasure;
        const loopLengthBeats = s.lengthInMeasures * beatsPerMeasure;
        
        return {
            ...s,
            startBeat,
            loopLengthBeats,
            endBeat: startBeat + loopLengthBeats,
            blockEndBeat: startBeat + (totalMeasures * beatsPerMeasure),
            isLoop: true // Everything is a loop candidate in this view
        };
    });
}

/**
 * Analyzes a sequence of melody notes to find repeating phrases and heal variations.
 * @param {Array<{beat: number, midi: number, energy: number}>} melodyLine
 * @param {number} beatsPerMeasure
 */
export function extractMelodyForm(melodyLine, beatsPerMeasure = 4) {
    if (!melodyLine || melodyLine.length < 8) return melodyLine;

    const healedMelody = [...melodyLine];
    const numBeats = melodyLine.length;
    const numMeasures = Math.floor(numBeats / beatsPerMeasure);

    // 1. Phrasing Analysis (Multi-scale similarity check)
    // We look for repeating 4-bar or 8-bar melodic phrases.
    const measureHashes = [];
    for (let m = 0; m < numMeasures; m++) {
        const slice = melodyLine.slice(m * beatsPerMeasure, (m + 1) * beatsPerMeasure);
        // Create a fuzzy representation: Round MIDI to help with similarity
        // but keep raw values for the consensus pass later.
        measureHashes.push(slice.map(b => b.midi ? Math.round(b.midi) : 'R').join(','));
    }

    const getMelodySimilarity = (m1, m2, len) => {
        let matches = 0;
        for (let k = 0; k < len; k++) {
            // Fuzzy match: allowing for 1-semitone drift in the hash
            const h1 = measureHashes[m1 + k].split(',');
            const h2 = measureHashes[m2 + k].split(',');
            
            let beatMatches = 0;
            for (let b = 0; b < beatsPerMeasure; b++) {
                if (h1[b] === h2[b]) {
                    beatMatches++;
                } else if (h1[b] !== 'R' && h2[b] !== 'R') {
                    // Allow small drift
                    if (Math.abs(parseInt(h1[b]) - parseInt(h2[b])) <= 1) beatMatches++;
                }
            }
            if (beatMatches / beatsPerMeasure >= 0.75) matches++;
        }
        return matches / len;
    };

    // Find and group repeating phrases
    const phrases = [];
    const phraseLen = 4; // Standard 4-bar phrase check
    const usedMeasures = new Set();

    for (let m = 0; m <= numMeasures - phraseLen; m++) {
        if (usedMeasures.has(m)) continue;

        const currentPhraseMeasures = [m];
        for (let nextM = m + phraseLen; nextM <= numMeasures - phraseLen; nextM += phraseLen) {
            if (usedMeasures.has(nextM)) continue;

            // If 70% of the measures in the phrase match, it's a repetition!
            if (getMelodySimilarity(m, nextM, phraseLen) >= 0.70) {
                currentPhraseMeasures.push(nextM);
                for (let k = 0; k < phraseLen; k++) usedMeasures.add(nextM + k);
            }
        }

        if (currentPhraseMeasures.length > 1) {
            phrases.push(currentPhraseMeasures);
            for (let k = 0; k < phraseLen; k++) usedMeasures.add(m + k);
        }
    }

    // 2. MELODY CONSENSUS HEALING
    // For each repeating phrase group, determine the "Consensus Melody"
    phrases.forEach(phraseStarts => {
        const consensusPhrase = [];
        for (let b = 0; b < phraseLen * beatsPerMeasure; b++) {
            const votes = {};
            phraseStarts.forEach(startM => {
                const beatIdx = startM * beatsPerMeasure + b;
                const note = melodyLine[beatIdx]?.midi || 'R';
                votes[note] = (votes[note] || 0) + 1;
            });
            // Winner takes the beat
            const winner = Object.entries(votes).sort((a, b) => b[1] - a[1])[0][0];
            consensusPhrase.push(winner === 'R' ? null : parseInt(winner));
        }

        // Apply consensus to all instances
        phraseStarts.forEach(startM => {
            for (let b = 0; b < phraseLen * beatsPerMeasure; b++) {
                const beatIdx = startM * beatsPerMeasure + b;
                if (healedMelody[beatIdx]) {
                    healedMelody[beatIdx].midi = consensusPhrase[b];
                }
            }
        });
    });

    return healedMelody;
}
