// @vitest-environment happy-dom
import { describe, it, vi, beforeEach } from 'vitest';
import { onSectionUpdate } from '../../public/arranger-controller.js';
import { getState } from '../../public/state.js';
const { arranger } = getState();

// Mock dependencies to isolate performance of the reorder logic
vi.mock('../../public/history.js', () => ({ pushHistory: vi.fn() }));
vi.mock('../../public/chords.js', () => ({
    validateProgression: vi.fn(cb => cb && cb()),
    transformRelativeProgression: vi.fn()
}));
vi.mock('../../public/instrument-controller.js', () => ({ flushBuffers: vi.fn() }));
vi.mock('../../public/engine/engine.js', () => ({ restoreGains: vi.fn() }));
vi.mock('../../public/worker-client.js', () => ({ syncWorker: vi.fn() }));
vi.mock('../../public/persistence.js', () => ({ saveCurrentState: vi.fn() }));
vi.mock('../../public/form-analysis.js', () => ({ analyzeForm: vi.fn() }));
vi.mock('../../public/ui.js', () => ({ showToast: vi.fn() }));

describe('Arranger Reorder Performance', () => {
    const SECTION_COUNT = 5000;

    beforeEach(() => {
        // Reset arranger sections
        arranger.sections = [];
        for (let i = 0; i < SECTION_COUNT; i++) {
            arranger.sections.push({
                id: `s${i}`,
                label: `Section ${i}`,
                value: 'I',
                repeat: 1
            });
        }
    });

    it('measures section reordering performance', () => {
        // Create a reversed list of IDs
        const reversedIds = [];
        for (let i = SECTION_COUNT - 1; i >= 0; i--) {
            reversedIds.push(`s${i}`);
        }

        const start = performance.now();

        onSectionUpdate(null, 'reorder', reversedIds);

        const end = performance.now();
        const duration = end - start;

        console.log(`Reordering ${SECTION_COUNT} sections took ${duration.toFixed(2)}ms`);

        // Verification (ensure it actually worked)
        if (arranger.sections[0].id !== `s${SECTION_COUNT - 1}`) {
            throw new Error('Reordering failed!');
        }
    });
});
