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
    let originalInnerWidth;
    let originalInnerHeight;

    beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
        originalInnerWidth = window.innerWidth;
        originalInnerHeight = window.innerHeight;
    });

    afterEach(() => {
        document.body.removeChild(container);
        Object.defineProperty(window, 'innerWidth', {
            value: originalInnerWidth,
            configurable: true,
        });
        Object.defineProperty(window, 'innerHeight', {
            value: originalInnerHeight,
            configurable: true,
        });
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
                    style: 'scalar',
                },
                vizState: {},
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

    it('exposes layout profile attributes on the visualizer container', () => {
        Object.defineProperty(window, 'innerWidth', { value: 390, configurable: true });
        Object.defineProperty(window, 'innerHeight', { value: 844, configurable: true });
        setupState({
            arranger: {
                progression: Array.from({ length: 32 }, (_, index) => ({
                    sectionId: `s${Math.floor(index / 8)}`,
                    sectionLabel: ['A', 'A', 'B', 'A'][Math.floor(index / 8)],
                    beats: 4,
                    absName: `Chord ${index + 1}`,
                    globalIndex: index,
                })),
                timeSignature: '4/4',
                sections: [
                    { id: 's0', label: 'A', seamless: false },
                    { id: 's1', label: 'A', seamless: false },
                    { id: 's2', label: 'B', seamless: false },
                    { id: 's3', label: 'A', seamless: false },
                ],
                notation: 'absolute',
            },
            chords: {
                lastActiveChordIndex: -1,
            },
        });

        act(() => {
            render(<ChordVisualizer />, container);
        });

        const visualizer = container.querySelector('#chordVisualizer');
        expect(visualizer?.getAttribute('data-density')).toBe('ultra-compact');
        expect(visualizer?.getAttribute('data-measures-per-row')).toBe('4');
        expect(visualizer?.getAttribute('data-row-count')).toBe('8');
        expect(visualizer?.getAttribute('data-scroll-mode')).toBe('fit');
        expect(visualizer?.getAttribute('data-viewport')).toBe('mobile');
        expect(visualizer?.getAttribute('data-vertical-fill')).toBe('paper-fill');
    });

    it('applies vertical fill styling for short charts that fit the viewport', () => {
        Object.defineProperty(window, 'innerWidth', { value: 1440, configurable: true });
        Object.defineProperty(window, 'innerHeight', { value: 900, configurable: true });
        setupState({
            arranger: {
                progression: Array.from({ length: 8 }, (_, index) => ({
                    sectionId: 's1',
                    sectionLabel: 'Verse',
                    beats: 4,
                    absName: `Chord ${index + 1}`,
                    globalIndex: index,
                })),
                timeSignature: '4/4',
                sections: [{ id: 's1', label: 'Verse', seamless: false }],
                notation: 'absolute',
            },
            chords: {
                lastActiveChordIndex: -1,
            },
        });

        act(() => {
            render(<ChordVisualizer />, container);
        });

        const visualizer = container.querySelector('#chordVisualizer');
        expect(visualizer?.getAttribute('data-vertical-fill')).toBe('paper-fill');
        expect(visualizer?.style.getPropertyValue('--lead-vertical-fill')).toBe('1.45');
        expect(visualizer?.style.getPropertyValue('--lead-vertical-type-fill')).toBe('1.26');
    });
});
