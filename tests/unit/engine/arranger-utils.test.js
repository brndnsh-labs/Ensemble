import { describe, expect, it } from 'vitest';
import { unrollArrangement } from '../../../public/engine/arranger-utils.js';

describe('Arranger Utils', () => {
    const mockArranger = {
        timeSignature: '4/4',
        totalSteps: 64, // 4 bars
        stepMap: [
            { start: 0, end: 16, chord: { root: 'C', label: 'I' } },
            { start: 16, end: 32, chord: { root: 'F', label: 'IV' } },
            { start: 32, end: 48, chord: { root: 'C', label: 'I' } },
            { start: 48, end: 64, chord: { root: 'G', label: 'V' } },
        ],
        sectionMap: [{ id: 's1', start: 0, end: 64, label: 'Main' }],
    };

    it('should unroll short arrangements into multiple iterations', () => {
        const unrolled = unrollArrangement(mockArranger, 16); // 16 bars target

        // 16 bars target / 4 bars original = 4 iterations
        expect(unrolled.totalSteps).toBe(64 * 4);
        expect(unrolled.sectionMap.length).toBe(4);
        expect(unrolled.originalSteps).toBe(64);
    });

    it('should not unroll arrangements that are already long enough', () => {
        const longArranger = {
            ...mockArranger,
            totalSteps: 1024, // 64 bars
        };
        const unrolled = unrollArrangement(longArranger, 64);

        expect(unrolled.totalSteps).toBe(1024);
        expect(unrolled.sectionMap.length).toBe(1);
    });

    it('should assign musical roles to unrolled sections', () => {
        const unrolled = unrollArrangement(mockArranger, 32); // 8 iterations (32 bars / 4 bars)

        expect(unrolled.sectionMap[0].label).toBe('Intro');
        expect(unrolled.sectionMap[unrolled.sectionMap.length - 1].label).toBe('Outro');

        const chorus = unrolled.sectionMap.find((s) => s.label === 'Chorus');
        expect(chorus).toBeDefined();
    });
});
