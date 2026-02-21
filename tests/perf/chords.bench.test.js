import { describe, expect, it } from 'vitest';
import { validateProgression } from '../../public/chords.js';
import { getState } from '../../public/state.js';

const { arranger } = getState();

describe('Chords Logic Performance', () => {
    it('measures validateProgression performance avoiding redundant parsing', () => {
        // Setup a workload: 500 sections, 1 repeat each.
        // This validates the optimization of updateProgressionCache.
        const sections = [];
        for (let i = 0; i < 500; i++) {
            sections.push({
                id: `s${i}`,
                label: `Section ${i}`,
                value: 'I | IV | V | vi', // 4 chords per section
                repeat: 1,
                timeSignature: '4/4',
                key: 'C',
            });
        }

        arranger.sections = sections;
        arranger.key = 'C';
        arranger.timeSignature = '4/4';

        const start = performance.now();
        validateProgression(() => {});
        const end = performance.now();

        const duration = end - start;
        console.log(
            `validateProgression (500 sections, 1 repeat each) took ${duration.toFixed(2)}ms`,
        );

        // Sanity check
        expect(arranger.progression.length).toBeGreaterThan(0);
        expect(arranger.totalSteps).toBeGreaterThan(0);
        expect(arranger.sectionMap.length).toBe(500);
        expect(arranger.measureMap.length).toBeGreaterThan(0);
    });
});
