// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getBassNote, isBassActive } from '../../public/engine/bass-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Rock Bassist Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.5, bpm: 120 },
            groove: {
                genreFeel: 'Rock',
                creativity: true,
                lastDrumPreset: 'Rock',
                instruments: [],
            },
            arranger: {
                timeSignature: '4/4',
                totalSteps: numBars * 16,
                stepMap: [],
            },
            soloist: { enabled: false, busySteps: 0 },
            ...stateOverrides,
        };

        // Populate step map for chord change detection
        const chordC = { rootMidi: 48, quality: 'maj', beats: 4 };
        const chordG = { rootMidi: 55, quality: 'maj', beats: 4 };
        for (let m = 0; m < numBars; m++) {
            mockState.arranger.stepMap.push({
                start: m * 16,
                end: (m + 1) * 16,
                chord: m % 2 === 0 ? chordC : chordG,
            });
        }

        getState.mockReturnValue(mockState);

        const tsConfig = TIME_SIGNATURES['4/4'];
        const performance = [];
        let prevFreq = 0;

        for (let i = 0; i < numBars * 16; i++) {
            const stepInMeasure = i % 16;
            const measure = Math.floor(i / 16);
            const currentChord = measure % 2 === 0 ? chordC : chordG;
            const nextChord = (measure + 1) % 2 === 0 ? chordC : chordG;
            const info = getStepInfo(i, tsConfig, [], TIME_SIGNATURES);

            const active = isBassActive(getState(), 'rock', i, stepInMeasure, info, {});
            if (active) {
                const note = getBassNote(
                    getState(),
                    currentChord,
                    nextChord,
                    info.beatIndex,
                    prevFreq,
                    48,
                    'rock',
                    0,
                    i,
                    stepInMeasure,
                    {},
                    info,
                );
                if (note) {
                    performance.push({ step: i, info, note, chord: currentChord });
                    prevFreq = note.freq;
                }
            }
        }
        return performance;
    };

    it('should maintain driving 8th notes at high intensity', () => {
        const performance = simulatePerformance(16, { playback: { bandIntensity: 0.9 } });

        const eighthNoteHits = performance.filter((p) => p.step % 2 === 0);
        const totalPossibleEighths = 16 * 8;

        const ratio = eighthNoteHits.length / totalPossibleEighths;
        console.log(`[Rock Critique] 8th Note Continuity: ${(ratio * 100).toFixed(1)}%`);

        expect(ratio).toBeGreaterThan(0.9);
    });

    it('should stay grounded on the root most of the time', () => {
        const performance = simulatePerformance(16);

        let rootHits = 0;
        performance.forEach((p) => {
            if (p.note.midi % 12 === p.chord.rootMidi % 12) {
                rootHits++;
            }
        });

        const ratio = rootHits / (performance.length || 1);
        console.log(`[Rock Critique] Root Grounding: ${(ratio * 100).toFixed(1)}%`);
        expect(ratio).toBeGreaterThan(0.8);
    });

    it('should occasionally add 5ths or Octaves at high intensity', () => {
        const performance = simulatePerformance(32, { playback: { bandIntensity: 0.95 } });

        let nonRootHits = 0;
        performance.forEach((p) => {
            const pc = p.note.midi % 12;
            const rootPc = p.chord.rootMidi % 12;
            if (pc !== rootPc) {
                nonRootHits++;
            }
        });

        console.log(`[Rock Critique] Melodic Variation Hits: ${nonRootHits}`);
        expect(nonRootHits).toBeGreaterThan(5);
    });
});
