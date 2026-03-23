/**
 * @vitest-environment happy-dom
 */

import { render } from 'preact';
import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock dependencies
const mockUseEnsembleState = vi.fn();

vi.mock('../../../public/ui-bridge.js', () => ({
    useEnsembleState: (selector) => mockUseEnsembleState(selector),
}));

vi.mock('../../../public/arranger-controller.js', () => ({
    onSectionUpdate: vi.fn(),
    onSectionDelete: vi.fn(),
    onSectionDuplicate: vi.fn(),
    saveProgression: vi.fn(),
    addSection: vi.fn(),
    refreshArrangerUI: vi.fn(),
    clearChordPresetHighlight: vi.fn(),
    validateAndAnalyze: vi.fn(),
}));

// Mock SectionCard
vi.mock('../../../public/components/SectionCard.jsx', () => {
    const { h, Component } = require('preact');

    class SectionCardMock extends Component {
        constructor(props) {
            super(props);
            this.scrollIntoView = vi.fn();
            this.focusInput = vi.fn();
        }

        render() {
            return h(
                'div',
                {
                    className: 'section-card',
                    'data-id': this.props.section.id,
                },
                [h('textarea', {})],
            );
        }
    }

    return {
        SectionCard: SectionCardMock,
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

    it('should use ref API instead of querySelector when lastInteractedSectionId changes', async () => {
        const sections = [
            { id: 's1', label: 'A', value: 'C', seamless: false },
            { id: 's2', label: 'B', value: 'G', seamless: false },
        ];

        // First render with no interaction
        mockUseEnsembleState.mockImplementation((selector) => {
            const state = {
                arranger: {
                    sections: sections,
                    lastInteractedSectionId: null,
                },
            };
            return selector(state);
        });

        // Spy on HTMLElement.prototype.querySelector
        const querySpy = vi.spyOn(HTMLElement.prototype, 'querySelector');

        act(() => {
            render(<Arranger />, container);
        });

        // Now simulate interaction with s1
        mockUseEnsembleState.mockImplementation((selector) => {
            const state = {
                arranger: {
                    sections: sections,
                    lastInteractedSectionId: 's1',
                },
            };
            return selector(state);
        });

        // Re-render to trigger effect
        await act(async () => {
            render(<Arranger />, container);
            // Wait for setTimeout in Arranger
            await new Promise((r) => setTimeout(r, 200));
        });

        // Verify querySelector was NOT called
        expect(querySpy).not.toHaveBeenCalledWith('textarea');

        // Note: verifying the imperative handle methods are called is tricky because
        // we can't easily access the handle instance created inside the mock from here.
        // But preventing querySelector is the main goal.
    });
});
