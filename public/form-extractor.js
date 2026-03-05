/**
 * Analyzes a raw sequence of chords to find repeating structures and suggest sections.
 * Optimized for standard song forms (AABA, Blues) and "Lead Sheet" style organization.
 * @param {Array} beatData Array of { chord, energy } objects
 * @param {number|Object} beatsPerMeasure Number of beats per measure, or a pulse object containing beatsPerMeasure
 */
export function extractForm(beatData, options = 4) {
    if (!beatData || beatData.length < 4) {
        return [];
    }

    const beatsPerMeasure = typeof options === 'object' ? options.beatsPerMeasure || 4 : options;

    // Flatten beat results into a full timeline
    const maxBeat = beatData[beatData.length - 1].beat;
    const timeline = new Array(maxBeat + 1).fill(null);
    for (let j = 0; j < beatData.length; j++) {
        const b = beatData[j];
        timeline[b.beat] = b;
    }

    // Fill gaps
    let current = timeline.find((b) => b !== null) || { chord: 'C', energy: 0 };
    for (let i = 0; i < timeline.length; i++) {
        if (timeline[i]) {
            current = timeline[i];
        } else {
            timeline[i] = { ...current, beat: i };
        }
    }

    // 1. HARMONIC SIMPLIFICATION (The "Ear" Pass)
    const simplify = (c) => {
        if (!c || c === 'Rest' || c === '-') {
            return '-';
        }
        // Normalize: Cmaj7 -> C, Cm7 -> Cm, C7 -> C
        // We keep root and quality (major/minor) but drop extensions
        return c
            .replace(/maj7|maj9|m7|m9|m6|m11|7|6|9|11|13|sus4|sus2|dim|aug|5/g, (match) => {
                if (match.startsWith('m')) {
                    return 'm';
                }
                return '';
            })
            .trim();
    };

    // 2. MEASURE CONSOLIDATION
    const measures = [];
    const originalMeasures = [];
    const measureEnergy = [];
    const measurePrimarySimplified = [];
    const measurePrimaryRoots = [];

    for (let i = 0; i < timeline.length; i += beatsPerMeasure) {
        const slice = timeline.slice(i, i + beatsPerMeasure);
        if (slice.length < beatsPerMeasure) {
            break;
        }

        const counts = {};
        let totalEnergy = 0;
        for (let j = 0; j < slice.length; j++) {
            const b = slice[j];
            counts[b.chord] = (counts[b.chord] || 0) + 1;
            totalEnergy += b.energy;
        }

        // Majority vote for the measure's chord
        let majority = '';
        let maxCount = -1;
        for (const chord in counts) {
            if (counts[chord] > maxCount) {
                maxCount = counts[chord];
                majority = chord;
            }
        }
        measureEnergy.push(totalEnergy / beatsPerMeasure);

        // If the majority chord takes up at least half the bar, use it.
        // Otherwise, split measure (e.g. C - G).
        let primary;
        if (counts[majority] >= beatsPerMeasure * 0.5) {
            primary = simplify(majority);
            measures.push(primary);
            originalMeasures.push(majority);
        } else {
            // Split measure logic: First chord + Third chord (beat 1 and 3)
            const c1 = slice[0].chord;
            const c3 = slice[2].chord || slice[1].chord; // Fallback
            primary = simplify(c1);
            measures.push(`${primary} ${simplify(c3)}`);
            originalMeasures.push(`${c1} ${c3}`);
        }
        measurePrimarySimplified.push(primary);
        measurePrimaryRoots.push(primary.replace(/m$/, ''));
    }

    // 3. PATTERN MINING (Multi-scale: 32, 16, 12, 8, 4)
    const sections = [];
    let i = 0;

    // Fuzzy Similarity Check
    const getSimilarity = (idx1, idx2, len) => {
        let error = 0;
        for (let k = 0; k < len; k++) {
            const m1 = measurePrimarySimplified[idx1 + k];
            const m2 = measurePrimarySimplified[idx2 + k];

            if (m1 !== m2) {
                if (measurePrimaryRoots[idx1 + k] === measurePrimaryRoots[idx2 + k]) {
                    error += 0.4;
                } else {
                    error += 1.0;
                }
            }
        }
        // Return similarity score (1.0 = perfect, 0.0 = terrible)
        return 1.0 - error / len;
    };

    const getConsensusValue = (startIdx, len, repeats) => {
        const consensus = [];
        for (let k = 0; k < len; k++) {
            const counts = {};
            for (let r = 0; r < repeats; r++) {
                const measure = originalMeasures[startIdx + r * len + k];
                counts[measure] = (counts[measure] || 0) + 1;
            }
            let bestChord = '';
            let maxCount = -1;
            for (const chord in counts) {
                if (counts[chord] > maxCount) {
                    maxCount = counts[chord];
                    bestChord = chord;
                }
            }
            consensus.push(bestChord);
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
            if (len < 4) {
                continue;
            }

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
        for (const len of [32, 16, 12, 8, 4]) {
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
                const weightedScore = avgScore * Math.sqrt(len);

                if (repeat > 1 && weightedScore > bestScore) {
                    bestLen = len;
                    bestRepeat = repeat;
                    bestScore = weightedScore;
                }
            }
        }

        if (bestLen > 0) {
            const value = getConsensusValue(i, bestLen, bestRepeat);
            let totalEnergy = 0;
            const energyLen = bestLen * bestRepeat;
            for (let k = 0; k < energyLen; k++) {
                totalEnergy += measureEnergy[i + k];
            }
            const avgEnergy = totalEnergy / energyLen;
            sections.push({
                value,
                repeat: bestRepeat,
                energy: avgEnergy,
                startMeasureIndex: i,
                lengthInMeasures: bestLen,
            });
            i += energyLen;
        } else {
            // Fallback: 4-bar chunk
            const len = Math.min(4, measures.length - i);
            const value = originalMeasures.slice(i, i + len).join(' | ');
            let totalEnergy = 0;
            for (let k = 0; k < len; k++) {
                totalEnergy += measureEnergy[i + k];
            }
            const avgEnergy = totalEnergy / len;
            sections.push({
                value,
                repeat: 1,
                energy: avgEnergy,
                startMeasureIndex: i,
                lengthInMeasures: len,
            });
            i += len;
        }
    }

    // 4. AGGRESSIVE CONSOLIDATION (Merging adjacent variations)
    // If Section A (x1) is followed by Section A (x1) [which might be a slight variation], merge them!
    const consolidated = [];

    // Helper to check if two sections are "close enough"
    const areSectionsSimilar = (s1, s2) => {
        if (s1.value === s2.value) {
            return true;
        }

        if (!s1.simplified) {
            s1.simplified = s1.value.split(' | ').map(simplify);
            s1.roots = s1.simplified.map((c) => c.replace(/m$/, ''));
        }
        if (!s2.simplified) {
            s2.simplified = s2.value.split(' | ').map(simplify);
            s2.roots = s2.simplified.map((c) => c.replace(/m$/, ''));
        }

        const m1 = s1.simplified;
        const m2 = s2.simplified;
        if (m1.length !== m2.length) {
            return false;
        }

        let error = 0;
        const r1 = s1.roots;
        const r2 = s2.roots;

        for (let k = 0; k < m1.length; k++) {
            if (m1[k] !== m2[k]) {
                error += r1[k] === r2[k] ? 0.4 : 1.0;
            }
        }
        return 1.0 - error / m1.length >= 0.7;
    };

    for (let j = 0; j < sections.length; j++) {
        const s = sections[j];
        const last = consolidated[consolidated.length - 1];
        if (last && areSectionsSimilar(last, s)) {
            // Merge!
            last.repeat += s.repeat;
            last.energy = (last.energy + s.energy) / 2;
            // Note: We keep the value of the FIRST instance as the "canonical" version.
        } else {
            consolidated.push(s);
        }
    }

    // 5. LABELING (Lead Sheet Style)
    let currentLetter = 'A';

    // Pre-scan for duplicates to assign letters
    const uniqueProgressions = [];
    const progressionMap = new Map();

    for (let j = 0; j < consolidated.length; j++) {
        const s = consolidated[j];
        // Find if this progression matches a known one
        let match = progressionMap.get(s.value);

        if (!match) {
            for (let k = 0; k < uniqueProgressions.length; k++) {
                if (areSectionsSimilar(uniqueProgressions[k], s)) {
                    match = uniqueProgressions[k];
                    progressionMap.set(s.value, match);
                    break;
                }
            }
        }

        if (!match) {
            match = {
                value: s.value,
                simplified: s.simplified,
                roots: s.roots,
                label: `Section ${currentLetter}`,
            };

            // Heuristic Labels
            const isShort = s.lengthInMeasures <= 8;
            const isFirst = uniqueProgressions.length === 0;
            const isLast = j === consolidated.length - 1;
            const isLowEnergy = s.energy < 0.4;

            if (isFirst && isShort && isLowEnergy) {
                match.label = 'Intro';
            } else if (isLast && isShort && isLowEnergy) {
                match.label = 'Outro';
            } else {
                // Advance letter only if it's a "real" section
                currentLetter = String.fromCharCode(currentLetter.charCodeAt(0) + 1);
            }

            uniqueProgressions.push(match);
            progressionMap.set(s.value, match);
        }

        s.label = match.label;
    }

    // 6. FINAL CLEANUP (Formatting)
    return consolidated.map((s) => {
        // Calculate beat ranges
        const totalMeasures = s.value.split('|').length * s.repeat;
        const startBeat = s.startMeasureIndex * beatsPerMeasure;
        const loopLengthBeats = s.lengthInMeasures * beatsPerMeasure;

        return {
            ...s,
            startBeat,
            loopLengthBeats,
            endBeat: startBeat + loopLengthBeats,
            blockEndBeat: startBeat + totalMeasures * beatsPerMeasure,
            isLoop: true, // Everything is a loop candidate in this view
        };
    });
}
