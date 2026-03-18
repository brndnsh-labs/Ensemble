import { INTERVAL_TO_ROMAN, KEY_ORDER } from './config.js';
import { normalizeKey } from './utils.js';

/**
 * Melody Harmonizer Engine
 * Generates backing chord progressions from a monophonic melody line using Viterbi pathfinding.
 */
export class Harmonizer {
    constructor() {
        // Define strategies with different weights
        this.strategies = {
            Consonant: {
                name: 'Consonant',
                description: 'Safe, diatonic choices that strictly follow the key.',
                weights: {
                    diatonic: 10.0,
                    chromaticPenalty: 25.0,
                    melodyFit: 5.0,
                    rootMatch: 3.0,
                    dominantResolution: 5.0,
                    stepwiseMotion: 2.0,
                    commonProgression: 4.0,
                },
            },
            Balanced: {
                name: 'Balanced',
                description: 'A mix of conventional harmony with some colorful choices.',
                weights: {
                    diatonic: 6.0,
                    chromaticPenalty: 12.0,
                    melodyFit: 8.0,
                    rootMatch: 4.0,
                    dominantResolution: 4.0,
                    stepwiseMotion: 3.0,
                    commonProgression: 3.0,
                },
            },
            Complex: {
                name: 'Complex',
                description: 'Prioritizes melody fit and interesting color over key adherence.',
                weights: {
                    diatonic: 2.0,
                    chromaticPenalty: 4.0,
                    melodyFit: 12.0,
                    rootMatch: 2.0,
                    dominantResolution: 2.0,
                    stepwiseMotion: 1.0,
                    commonProgression: 1.0,
                },
            },
        };

        this.diatonicWeights = {
            major: { 0: 10, 2: 4, 4: 4, 5: 8, 7: 9, 9: 6, 11: 2 }, // I, ii, iii, IV, V, vi, vii
            minor: { 0: 10, 2: 3, 3: 9, 5: 6, 7: 8, 8: 7, 10: 5 }, // i, ii, III, iv, v, VI, VII
        };
    }

    /**
     * Generates multiple options for harmonization.
     * @returns {Array} Array of option objects { name, description, chords, progression }
     */
    generateOptions(melodyLine, key) {
        if (!melodyLine || melodyLine.length === 0) {
            return [];
        }

        const { rootIndex, isMinor } = this.parseKey(key);
        const measures = Math.ceil(melodyLine.length / 4);

        // Pre-calculate prominent notes and structural states per measure
        const measureNotes = [];
        for (let m = 0; m < measures; m++) {
            const measureBeats = melodyLine.slice(m * 4, m * 4 + 4);
            measureNotes.push(this.getProminentNotes(measureBeats));
        }

        const structuralStates = this.detectStructure(measureNotes, measures);

        const options = [];

        Object.values(this.strategies).forEach((strategy) => {
            const result = this.runViterbi(
                measureNotes,
                rootIndex,
                isMinor,
                strategy,
                structuralStates,
            );
            options.push({
                type: strategy.name,
                description: strategy.description,
                chords: result,
                progression: this.formatProgression(result.map((/** @type {any} */ c) => c.roman)),
            });
        });

        return options;
    }

    /**
     * Detects SRDC (Statement, Restatement, Departure, Conclusion) structure.
     */
    detectStructure(_measureNotes, totalMeasures) {
        const states = [];
        for (let m = 0; m < totalMeasures; m++) {
            // Simple 4-bar phrase heuristic
            const phrasePos = m % 4;
            if (phrasePos === 0) {
                states.push('Statement');
            } else if (phrasePos === 1) {
                states.push('Restatement');
            } else if (phrasePos === 2) {
                states.push('Departure');
            } else {
                states.push('Conclusion');
            }
        }
        return states;
    }

    /**
     * Backward compatibility wrapper
     */
    generateProgression(melodyLine, key, creativity = 0.5) {
        const options = this.generateOptions(melodyLine, key);

        if (options.length === 0) {
            return 'I';
        }

        // Map creativity 0.0-1.0 to the 3 options roughly
        if (creativity < 0.35) {
            return options[0].progression;
        }
        if (creativity > 0.65) {
            return options[2].progression;
        }
        return options[1].progression;
    }

    parseKey(key) {
        const normKey = normalizeKey(key);
        const isMinor = key.includes('m') && !key.includes('maj');
        const rootName = normKey.replace('m', '');
        const rootIndex = KEY_ORDER.indexOf(rootName);
        return { rootIndex: rootIndex === -1 ? 0 : rootIndex, isMinor };
    }

    getProminentNotes(beats) {
        const counts = {};
        beats.forEach((b, idx) => {
            if (b.midi && b.energy > 0) {
                const pc = Math.round(b.midi) % 12;
                // Stronger weight for downbeats (Anchor Tones)
                const weight = (idx === 0 ? 3.0 : idx === 2 ? 1.5 : 1.0) * b.energy;
                counts[pc] = (counts[pc] || 0) + weight;
            }
        });

        return Object.entries(counts)
            .map(([pc, weight]) => ({ pc: parseInt(pc, 10), weight }))
            .sort((a, b) => b.weight - a.weight);
    }

    /**
     * Viterbi Algorithm implementation
     */
    runViterbi(measureNotes, keyRoot, isMinor, strategy, structuralStates) {
        const T = measureNotes.length;
        if (T === 0) {
            return [];
        }

        // States: 12 roots * 2 qualities (0=Major, 1=Minor)
        // Encoded as: rootIndex * 2 + qualityIndex
        const numStates = 24;

        // DP Tables
        const V = Array(T)
            .fill(null)
            .map(() => new Float32Array(numStates).fill(-Infinity));
        const path = Array(T)
            .fill(null)
            .map(() => new Int16Array(numStates).fill(0));
        const reasons = Array(T)
            .fill(null)
            .map(() => Array(numStates).fill(null));

        // Initialize t=0
        for (let s = 0; s < numStates; s++) {
            const { root, quality } = this.decodeState(s);
            const emit = this.calculateEmission(
                measureNotes[0],
                root,
                quality,
                keyRoot,
                isMinor,
                strategy,
                structuralStates[0],
            );

            // Start bias: Prefer Tonic (I or i)
            let startBias = 0;
            if (root === keyRoot) {
                startBias = 5.0; // Tonic bonus
            }

            V[0][s] = emit.score + startBias;
            reasons[0][s] = emit.reasons;
        }

        // Iterate time steps
        for (let t = 1; t < T; t++) {
            const state = structuralStates[t];
            for (let s = 0; s < numStates; s++) {
                const { root, quality } = this.decodeState(s);
                const emit = this.calculateEmission(
                    measureNotes[t],
                    root,
                    quality,
                    keyRoot,
                    isMinor,
                    strategy,
                    state,
                );

                let maxScore = -Infinity;
                let bestPrev = -1;
                let bestTransReason = '';

                // Check all previous states
                for (let prevS = 0; prevS < numStates; prevS++) {
                    const { root: prevRoot } = this.decodeState(prevS);
                    const trans = this.calculateTransition(prevRoot, root, strategy, state);

                    const score = V[t - 1][prevS] + trans.score + emit.score;

                    if (score > maxScore) {
                        maxScore = score;
                        bestPrev = prevS;
                        bestTransReason = trans.reason;
                    }
                }

                V[t][s] = maxScore;
                path[t][s] = bestPrev;
                reasons[t][s] = [...emit.reasons];
                if (bestTransReason) {
                    reasons[t][s].push(bestTransReason);
                }
            }
        }

        // Backtrack
        let bestFinalScore = -Infinity;
        let bestFinalState = -1;

        for (let s = 0; s < numStates; s++) {
            const { root } = this.decodeState(s);
            let endBias = 0;
            if (root === keyRoot) {
                endBias = 3.0;
            }

            if (V[T - 1][s] + endBias > bestFinalScore) {
                bestFinalScore = V[T - 1][s] + endBias;
                bestFinalState = s;
            }
        }

        const resultPath = [];
        let currState = bestFinalState;

        for (let t = T - 1; t >= 0; t--) {
            const { root, quality } = this.decodeState(currState);
            const romanInfo = this.convertRootToRoman(root, quality, keyRoot);

            resultPath.unshift({
                roman: romanInfo.roman,
                absRoot: root,
                quality: quality,
                reasons: reasons[t][currState] || [],
                structuralState: structuralStates[t],
            });

            currState = path[t][currState];
        }

        return resultPath;
    }

    decodeState(s) {
        return {
            root: Math.floor(s / 2),
            quality: s % 2 === 0 ? 'major' : 'minor',
        };
    }

    calculateEmission(notes, root, quality, keyRoot, isMinor, strategy, structuralState) {
        let score = 0;
        const reasons = [];
        const w = { ...strategy.weights };

        // --- 1. Structural Weight Adjustment ---
        if (structuralState === 'Departure') {
            w.diatonic *= 0.5; // Allow more chromaticism
            w.melodyFit *= 1.2; // Focus on colorful melody tones
            w.chromaticPenalty *= 0.4; // Reduce chromatic penalty
        } else if (structuralState === 'Conclusion') {
            w.diatonic *= 1.5; // Force diatonic resolution
            w.rootMatch *= 2.0; // Emphasize strong resolution
        }

        // 2. Diatonic Check
        const distFromKey = (root - keyRoot + 12) % 12;
        const diatonicMap = isMinor ? this.diatonicWeights.minor : this.diatonicWeights.major;
        const diatonicVal = diatonicMap[distFromKey];

        if (diatonicVal !== undefined) {
            score += (diatonicVal / 10) * w.diatonic;
        } else {
            score -= w.chromaticPenalty;
        }

        // 3. Melody Fit
        const chordTones = this.getChordTones(root, quality);
        let fitScore = 0;
        const matchedNotes = [];

        notes.forEach((note) => {
            if (chordTones.includes(note.pc)) {
                let boost = note.weight * w.melodyFit;
                if (note.pc === root) {
                    boost += w.rootMatch;
                    matchedNotes.push(this.getNoteName(note.pc));
                } else {
                    matchedNotes.push(this.getNoteName(note.pc));
                }
                fitScore += boost;
            } else {
                // Clash penalty (Tighter in Conclusion, looser in Departure)
                const clashFactor = structuralState === 'Departure' ? 1.0 : 2.5;
                score -= note.weight * clashFactor;
            }
        });

        score += fitScore;
        if (fitScore > 2.0) {
            reasons.push(`Melody matches ${matchedNotes.join(',')}`);
        }

        return { score, reasons };
    }

    calculateTransition(prevRoot, currRoot, strategy, structuralState) {
        let score = 0;
        let reason = '';
        const w = strategy.weights;
        const motion = (currRoot - prevRoot + 12) % 12;

        if (motion === 0) {
            // Static penalty (less penalty in Statement)
            score -= structuralState === 'Statement' ? 0.5 : 2.0;
        } else if (motion === 5) {
            score += w.dominantResolution; // V -> I
            reason = 'Circle of 5ths resolution';
        } else if (motion === 7) {
            score += w.commonProgression; // IV -> I
            reason = 'Plagal/Common motion';
        } else if (motion === 1 || motion === 2 || motion === 10 || motion === 11) {
            score += w.stepwiseMotion;
            reason = 'Stepwise motion';
        }

        // Resolution Bonus
        if (structuralState === 'Conclusion' && motion === 5) {
            score += 5.0;
        }

        return { score, reason };
    }

    getChordTones(root, quality) {
        const third = quality === 'minor' ? 3 : 4;
        return [root, (root + third) % 12, (root + 7) % 12];
    }

    getNoteName(midi) {
        const names = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'];
        return names[midi % 12];
    }

    convertRootToRoman(absRoot, quality, keyRoot) {
        const interval = (absRoot - keyRoot + 12) % 12;
        let roman = INTERVAL_TO_ROMAN[interval] || 'I';
        if (quality === 'minor') {
            roman = roman.toLowerCase();
        }
        return { roman, absRoot };
    }

    formatProgression(chords) {
        // Post-processing: If "I | . | . | IV", fill in
        const res = [...chords];
        for (let i = 1; i < res.length; i++) {
            if (res[i] === '.') {
                res[i] = res[i - 1];
            }
        }
        return res.join(' | ');
    }
}
