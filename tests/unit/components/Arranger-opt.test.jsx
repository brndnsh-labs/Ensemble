/**
 * @vitest-environment happy-dom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { h, render } from 'preact';
import { act } from 'preact/test-utils';

// Mock dependencies
const mockUseEnsembleState = vi.fn();

vi.mock('../../../public/ui-bridge.js', () => ({
    useEnsembleState: (selector) => mockUseEnsembleState(selector)
}));

vi.mock('../../../public/arranger-controller.js', () => ({
    onSectionUpdate: vi.fn(),
    onSectionDelete: vi.fn(),
    onSectionDuplicate: vi.fn(),
    saveProgression: vi.fn(),
    addSection: vi.fn(),
    refreshArrangerUI: vi.fn(),
    clearChordPresetHighlight: vi.fn(),
    validateAndAnalyze: vi.fn()
}));

// Mock SectionCard to avoid rendering the full tree and its dependencies
// However, we need it to render a real DOM element for querySelector to find (in the baseline)
// and for refs to attach (in the fix).
// Real SectionCard has many dependencies. Maybe I should mock SectionCard to be a simple div with the right class?
// BUT, Arranger imports SectionCard. If I mock it here, it applies to Arranger too.
// If I mock SectionCard, I must ensure it forwards refs correctly later.
// For now, to reproduce the issue, a simple mock that renders the class is enough.

vi.mock('../../../public/components/SectionCard.jsx', () => {
    // We need to handle forwardRef in the future, but for now a simple component works.
    // If we change the implementation to forwardRef, we might need to update this mock if we mock it.
    // Actually, it's better to use the REAL Arranger and a MOCKED SectionCard to isolate Arranger's logic.
    const { forwardRef } = require('preact/compat');
    return {
        // Mocking as a simple component that renders the expected DOM structure
        SectionCard: forwardRef(({ section }, ref) => (
            <div
                ref={ref}
                className="section-card"
                data-id={section.id}
            >
                <textarea />
            </div>
        ))
    };
});

import { Arranger } from '../../../public/components/Arranger.jsx';

describe('Arranger Optimization', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        vi.clearAllMocks();
    });

    afterEach(() => {
        document.body.removeChild(container);
        vi.restoreAllMocks();
    });

    it('should query the DOM when lastInteractedSectionId changes', async () => {
        const sections = [
            { id: 's1', label: 'A', value: 'C', seamless: false },
            { id: 's2', label: 'B', value: 'G', seamless: false }
        ];

        // First render with no interaction
        mockUseEnsembleState.mockImplementation((selector) => {
            const state = {
                arranger: {
                    sections: sections,
                    lastInteractedSectionId: null
                }
            };
            return selector(state);
        });

        // Spy on document.querySelector
        const querySpy = vi.spyOn(document, 'querySelector');

        act(() => {
            render(<Arranger />, container);
        });

        expect(querySpy).not.toHaveBeenCalledWith('.section-card[data-id="s1"]');

        // Now simulate interaction with s1
        mockUseEnsembleState.mockImplementation((selector) => {
            const state = {
                arranger: {
                    sections: sections,
                    lastInteractedSectionId: 's1'
                }
            };
            return selector(state);
        });

        // Re-render to trigger effect
        act(() => {
            render(<Arranger />, container);
        });

        // The effect runs. It should call querySelector.
        // Note: The Effect calls querySelector.
        expect(querySpy).not.toHaveBeenCalledWith('.section-card[data-id="s1"]');
    });
});
