import { beforeEach, describe, expect, it, vi } from 'vitest';
import { analyzeForm, getSectionEnergy } from '../../public/form-analysis.js';
import { getState } from '../../public/state.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Form Analysis Engine', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getSectionEnergy', () => {
        it('should return correct energy for known labels', () => {
            expect(getSectionEnergy('Verse')).toBe(0.5);
            expect(getSectionEnergy('Chorus')).toBe(0.9);
            expect(getSectionEnergy('Build up')).toBe(0.7);
            expect(getSectionEnergy('Dropping the beat')).toBe(1.0);
        });

        it('should return default energy for unknown labels', () => {
            expect(getSectionEnergy('Unknown')).toBe(0.5);
            expect(getSectionEnergy(null)).toBe(0.5);
        });
    });

    describe('analyzeForm', () => {
        it('should return null if stepMap is empty', () => {
            getState.mockReturnValue({ arranger: { stepMap: [] } });
            expect(analyzeForm()).toBeNull();
        });

        it('should detect functional roles in a simple Verse-Chorus structure', () => {
            const stepMap = [
                // Verse (16 steps)
                ...Array(16)
                    .fill(0)
                    .map((_, _i) => ({
                        chord: { sectionId: 's1', sectionLabel: 'Verse', value: 'C', rootMidi: 60 },
                    })),
                // Chorus (16 steps)
                ...Array(16)
                    .fill(0)
                    .map((_, _i) => ({
                        chord: {
                            sectionId: 's2',
                            sectionLabel: 'Chorus',
                            value: 'F',
                            rootMidi: 65,
                        },
                    })),
            ];
            getState.mockReturnValue({ arranger: { stepMap } });

            const analysis = analyzeForm();
            expect(analysis.sections).toHaveLength(2);
            expect(analysis.sections[0].role).toBe('Main Theme');
            expect(analysis.sections[1].role).toBe('Peak'); // Chorus is Peak
        });

        it('should detect iterations and refrains', () => {
            const v = { sectionId: 'v', sectionLabel: 'Verse', value: 'C', rootMidi: 60 };
            const stepMap = [
                ...Array(16).fill({ chord: v }), // V1
                ...Array(16).fill({ chord: { ...v, sectionId: 'v2' } }), // V2 (Repeat)
                ...Array(16).fill({ chord: { ...v, sectionId: 'v3' } }), // V3 (Repeat)
            ];
            getState.mockReturnValue({ arranger: { stepMap } });

            const analysis = analyzeForm();
            expect(analysis.sections[0].iteration).toBe(1);
            expect(analysis.sections[1].iteration).toBe(2);
            expect(analysis.sections[2].iteration).toBe(3);
            expect(analysis.sections[2].role).toBe('Refrain');
        });

        it('should calculate harmonic flux and detect Variation', () => {
            const stepMap = [
                // Section 1: Low flux (Main Theme)
                ...Array(16).fill({
                    chord: { sectionId: 's1', sectionLabel: 'V', value: 'C', rootMidi: 60 },
                }),
                // Section 2: High flux (Variation)
                ...Array(16)
                    .fill(0)
                    .map((_, i) => ({
                        chord: {
                            sectionId: 'high',
                            sectionLabel: 'Wild',
                            value: i % 2 === 0 ? 'C' : 'G',
                            rootMidi: i % 2 === 0 ? 60 : 67,
                        },
                    })),
            ];
            getState.mockReturnValue({ arranger: { stepMap } });

            const analysis = analyzeForm();
            expect(analysis.sections[1].flux).toBe(16);
            expect(analysis.sections[1].role).toBe('Variation');
        });

        it('should detect Bridge role', () => {
            const stepMap = [
                ...Array(16).fill({ chord: { sectionId: 'v', sectionLabel: 'Verse', value: 'C' } }),
                ...Array(16).fill({
                    chord: { sectionId: 'b', sectionLabel: 'Bridge', value: 'Am' },
                }),
            ];
            getState.mockReturnValue({ arranger: { stepMap } });

            const analysis = analyzeForm();
            expect(analysis.sections[1].role).toBe('Bridge');
        });

        it('should detect Intro and Outro', () => {
            const stepMap = [
                ...Array(16).fill({
                    chord: { sectionId: 'in', sectionLabel: 'The Intro', value: 'C' },
                }),
                ...Array(16).fill({
                    chord: { sectionId: 'out', sectionLabel: 'Final Outro', value: 'C' },
                }),
            ];
            getState.mockReturnValue({ arranger: { stepMap } });

            const analysis = analyzeForm();
            expect(analysis.sections[0].role).toBe('Intro');
            expect(analysis.sections[1].role).toBe('Outro');
        });

        it('should handle "Build" role for repeated high-flux sections', () => {
            const chords = ['C', 'G'];
            const stepMap = [
                // V1: High flux first occurrence (Variation)
                ...Array(16)
                    .fill(0)
                    .map((_, i) => ({
                        chord: {
                            sectionId: 'v1',
                            sectionLabel: 'V',
                            value: chords[i % 2],
                            rootMidi: 60,
                        },
                    })),
                // V2: High flux repeat (Build)
                ...Array(16)
                    .fill(0)
                    .map((_, i) => ({
                        chord: {
                            sectionId: 'v2',
                            sectionLabel: 'V',
                            value: chords[i % 2],
                            rootMidi: 60,
                        },
                    })),
                // V3: Different section to ensure V2 is not "isLastSection"
                ...Array(16).fill({
                    chord: { sectionId: 'v3', sectionLabel: 'Final', value: 'Am' },
                }),
            ];

            getState.mockReturnValue({ arranger: { stepMap } });

            const analysis = analyzeForm();
            expect(analysis.sections[1].iteration).toBe(2);
            expect(analysis.sections[1].role).toBe('Build');
        });
        it('should detect Refrain for high iteration counts', () => {
            const stepMap = [
                ...Array(16).fill({ chord: { sectionId: 's1', sectionLabel: 'V', value: 'C' } }),
                ...Array(16).fill({ chord: { sectionId: 's2', sectionLabel: 'V', value: 'C' } }),
                ...Array(16).fill({ chord: { sectionId: 's3', sectionLabel: 'V', value: 'C' } }),
            ];
            getState.mockReturnValue({ arranger: { stepMap } });
            const analysis = analyzeForm();
            expect(analysis.sections[2].iteration).toBe(3);
            expect(analysis.sections[2].role).toBe('Refrain');
        });
        it('should handle labels named "b" specifically and re-occurrence (Line 131)', () => {
            const stepMap = [
                ...Array(16).fill({ chord: { sectionId: 'v', sectionLabel: 'Verse', value: 'C' } }),
                ...Array(16).fill({
                    chord: { sectionId: 'b1', sectionLabel: 'Bridge', value: 'Am' },
                }),
                ...Array(16).fill({
                    chord: { sectionId: 'b2', sectionLabel: 'Other', value: 'Am' },
                }), // Match chord sig, but not 'b' label
            ];
            getState.mockReturnValue({ arranger: { stepMap } });

            const analysis = analyzeForm();
            expect(analysis.sections[1].role).toBe('Bridge');
            expect(analysis.sections[2].role).toBe('Refrain');
        });

        it('should handle re-occurrence of low-flux sections (Line 135)', () => {
            const stepMap = [
                ...Array(16).fill({ chord: { sectionId: 'v1', sectionLabel: 'V', value: 'C' } }),
                ...Array(16).fill({ chord: { sectionId: 'v2', sectionLabel: 'V', value: 'F' } }),
                ...Array(16).fill({ chord: { sectionId: 'v3', sectionLabel: 'V', value: 'C' } }),
            ];
            getState.mockReturnValue({ arranger: { stepMap } });
            const analysis = analyzeForm();
            expect(analysis.sections[2].role).toBe('Refrain');
        });
    });
});
