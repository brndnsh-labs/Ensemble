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

import { ChordVisualizer } from '../../../public/components/ChordVisualizer.jsx';

describe('ChordVisualizer Component', () => {
    let container;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
    });

    afterEach(() => {
        document.body.removeChild(container);
        vi.restoreAllMocks();
    });

    const setupState = (overrides = {}) => {
        mockUseEnsembleState.mockImplementation((selector) => {
            const state = {
                arranger: {
                    progression: [
                        {
                            sectionId: 's1',
                            sectionLabel: 'Verse',
                            beats: 4,
                            absName: 'C',
                            globalIndex: 0,
                        },
                        {
                            sectionId: 's1',
                            sectionLabel: 'Verse',
                            beats: 4,
                            absName: 'G',
                            globalIndex: 1,
                        },
                    ],
                    timeSignature: '4/4',
                    sections: [{ id: 's1', label: 'Verse', seamless: false }],
                    notation: 'absolute',
                },
                chords: {
                    lastActiveChordIndex: 0,
                },
                soloist: {
                    leadSheetMelody: [],
                    style: 'scalar',
                },
                vizState: {
                    isMaximized: false,
                },
                ...overrides,
            };
            return selector(state);
        });
    };

    it('should render chords based on the progression', () => {
        setupState();

        act(() => {
            render(<ChordVisualizer />, container);
        });

        const cards = container.querySelectorAll('.chord-card');
        expect(cards.length).toBe(2);
        expect(cards[0].textContent).toContain('C');
        expect(cards[1].textContent).toContain('G');
    });

    it('should apply the active class to the correct chord card', () => {
        setupState({
            chords: { lastActiveChordIndex: 1 },
        });

        act(() => {
            render(<ChordVisualizer />, container);
        });

        const cards = container.querySelectorAll('.chord-card');
        expect(cards[0].classList.contains('active')).toBe(false);
        expect(cards[1].classList.contains('active')).toBe(true);
        expect(container.querySelectorAll('.lead-sheet-row--active')).toHaveLength(1);
        expect(container.querySelectorAll('.measure-box--active')).toHaveLength(1);
    });

    it('should render section labels', () => {
        setupState();

        act(() => {
            render(<ChordVisualizer />, container);
        });

        expect(container.textContent).toContain('Verse');
    });

    it('should render a continuous lead-sheet row', () => {
        setupState({
            arranger: {
                progression: [
                    {
                        sectionId: 's1',
                        sectionLabel: 'Verse',
                        beats: 4,
                        absName: 'C',
                        globalIndex: 0,
                    },
                    {
                        sectionId: 's1',
                        sectionLabel: 'Verse',
                        beats: 4,
                        absName: 'G',
                        globalIndex: 1,
                    },
                ],
                timeSignature: '4/4',
                sections: [{ id: 's1', label: 'Verse', seamless: false }],
                notation: 'absolute',
            },
        });

        act(() => {
            render(<ChordVisualizer />, container);
        });

        expect(container.querySelectorAll('.lead-sheet-row')).toHaveLength(1);
        expect(container.querySelectorAll('.lead-sheet-row-marker')).toHaveLength(1);
    });

    it('should render sparklines for short maximized lead sheets', () => {
        setupState({
            soloist: {
                leadSheetMelody: [
                    { globalStep: 0, midi: 60 },
                    { globalStep: 2, midi: 64 },
                ],
                style: 'lead_sheet',
            },
            arranger: {
                progression: [
                    {
                        sectionId: 's1',
                        sectionLabel: 'Verse',
                        beats: 4,
                        absName: 'C',
                        globalIndex: 0,
                    },
                ],
                timeSignature: '4/4',
                sections: [{ id: 's1', label: 'Verse', seamless: false }],
                notation: 'absolute',
            },
            vizState: {
                isMaximized: true,
            },
        });

        act(() => {
            render(<ChordVisualizer />, container);
        });

        const sparklines = container.querySelectorAll('.sparkline-container');
        expect(sparklines.length).toBe(1);
        expect(sparklines[0].querySelectorAll('.sparkline-bar').length).toBe(2);
    });
});
