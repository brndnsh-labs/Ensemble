/**
 * Analyzes a raw sequence of chords to find repeating structures and suggest sections.
 * Optimized for standard song forms (AABA, Blues) and "Lead Sheet" style organization.
 * @param {Array} beatData Array of { chord, energy } objects
 * @param {number|Object} beatsPerMeasure Number of beats per measure, or a pulse object containing beatsPerMeasure
 */
const CHORD_EXTENSION_PATTERN = /maj7|maj9|m7|m9|m6|m11|7|6|9|11|13|sus4|sus2|dim|aug|5/g;

export function extractForm(beatData, options = 4) {
    if (!beatData || beatData.length < 4) {
        return [];
    }

    const beatsPerMeasure = typeof options === 'object' ? options.beatsPerMeasure || 4 : options;

    // Flatten beat results into a full timeline
    const maxBeat = beatData[beatData.length - 1].beat;
    const timeline = new Array(maxBeat + 1).fill(null);
    beatData.forEach((b) => {
        timeline[b.beat] = b;
    });

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
            .replace(CHORD_EXTENSION_PATTERN, (match) => {
                if (match.startsWith('m')) {
                    return 'm';
                }
                return '';
            })
            .trim();
    };

    // Helper: Calculate harmonic distance between two simplified chords
    // 0 = Exact Match, 0.5 = Root Match (different quality), 1.0 = No Match
    const getChordDistance = (c1, c2) => {
        if (c1 === c2) {
            return 0;
        }
        const root1 = c1.replace(/m$/, '');
        const root2 = c2.replace(/m$/, '');
        if (root1 === root2) {
            return 0.4; // Same root, different quality (e.g. C vs Cm)
        }
        return 1.0;
    };

    // 2. MEASURE CONSOLIDATION
    const measures = [];
    const originalMeasures = [];
    const measureEnergy = [];

    for (let i = 0; i < timeline.length; i += beatsPerMeasure) {
        const slice = timeline.slice(i, i + beatsPerMeasure);
        if (slice.length < beatsPerMeasure) {
            break;
        }

        const counts = {};
        let totalEnergy = 0;
        slice.forEach((b) => {
            counts[b.chord] = (counts[b.chord] || 0) + 1;
            totalEnergy += b.energy;
        });

        // Majority vote for the measure's chord
        // Optimization: Replace Object.entries().reduce with standard for...in loop to avoid
        // intermediate array allocations and closure overhead during frequent structural analysis.
        let majority = null;
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
            const sliceLen = bestLen * bestRepeat;
            // Optimization: Replace Array.prototype.slice().reduce with a standard for loop
            // to avoid array allocation and closure overhead per analyzed section block.
            let sumEnergy = 0;
            for (let k = 0; k < sliceLen; k++) {
                sumEnergy += measureEnergy[i + k];
            }
            const avgEnergy = sumEnergy / sliceLen;
            sections.push({
                value,
                repeat: bestRepeat,
                energy: avgEnergy,
                startMeasureIndex: i,
                lengthInMeasures: bestLen,
            });
            i += sliceLen;
        } else {
            // Fallback: 4-bar chunk
            const len = Math.min(4, measures.length - i);
            const value = originalMeasures.slice(i, i + len).join(' | ');
            // Optimization: Replace Array.prototype.slice().reduce with a standard for loop
            // to avoid array allocation and closure overhead per analyzed section block.
            let sumEnergy = 0;
            for (let k = 0; k < len; k++) {
                sumEnergy += measureEnergy[i + k];
            }
            const avgEnergy = sumEnergy / len;
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

    // Helper to check if two values are "close enough"
    const areValuesSimilar = (v1, v2) => {
        const m1 = v1.split(' | ').map(simplify);
        const m2 = v2.split(' | ').map(simplify);
        if (m1.length !== m2.length) {
            return false;
        }

        let error = 0;
        for (let k = 0; k < m1.length; k++) {
            error += getChordDistance(m1[k], m2[k]);
        }
        return 1.0 - error / m1.length >= 0.7;
    };

    sections.forEach((s) => {
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

    consolidated.forEach((s) => {
        // Find if this progression matches a known one
        let match = uniqueProgressions.find((p) => areValuesSimilar(p.value, s.value));

        if (!match) {
            match = {
                value: s.value,
                label: `Section ${currentLetter}`,
            };

            // Heuristic Labels
            const isShort = s.lengthInMeasures <= 8;
            const isFirst = uniqueProgressions.length === 0;
            const isLast = consolidated.indexOf(s) === consolidated.length - 1;
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
        }

        s.label = match.label;
    });

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
