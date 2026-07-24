// @ts-nocheck
/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */

import { render } from 'preact';
import React from 'preact/compat';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Arranger } from '../../public/components/Arranger.jsx';
import { getState } from '../../public/state.js';

const { arranger } = getState();

// Mock dependencies
vi.mock('../../public/state/persistence.js', () => ({
    saveCurrentState: vi.fn(),
}));
vi.mock('../../public/controllers/arranger-controller.js', () => ({
    onSectionUpdate: vi.fn(),
    onSectionDelete: vi.fn(),
    onSectionDuplicate: vi.fn(),
    saveProgression: vi.fn(),
    addSection: vi.fn(),
    refreshArrangerUI: vi.fn(),
    clearChordPresetHighlight: vi.fn(),
    validateAndAnalyze: vi.fn(),
}));

describe('Arranger Grouping Logic', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="sectionList"></div>';
        // Reset global requestAnimationFrame
        global.requestAnimationFrame = (cb) => setTimeout(cb, 0);
    });

    it('should group seamless sections with their predecessor', async () => {
        // Setup state
        arranger.sections = [
            { id: '1', label: 'Start', value: 'I', seamless: false },
            { id: '2', label: 'Linked 1', value: 'IV', seamless: true },
            { id: '3', label: 'New Group', value: 'V', seamless: false },
            { id: '4', label: 'Linked 2', value: 'I', seamless: true },
            { id: '5', label: 'Linked 3', value: 'V', seamless: true },
        ];

        const container = document.getElementById('sectionList');
        render(<Arranger />, container);
        await new Promise((r) => setTimeout(r, 0));

        // We expect groups to be created.
        // Logic: [Start, Linked 1] and [New Group, Linked 2, Linked 3]
        // If grouping is implemented via a wrapper div with class 'section-group'

        const groups = container.querySelectorAll('.section-group');

        expect(groups.length).toBe(2);

        const firstGroup = groups[0];
        const cards1 = firstGroup.querySelectorAll('.section-card');
        expect(cards1.length).toBe(2);
        expect(cards1[0].getAttribute('data-id')).toBe('1');
        expect(cards1[1].getAttribute('data-id')).toBe('2');

        const secondGroup = groups[1];
        const cards2 = secondGroup.querySelectorAll('.section-card');
        expect(cards2.length).toBe(3);
        expect(cards2[0].getAttribute('data-id')).toBe('3');
        expect(cards2[1].getAttribute('data-id')).toBe('4');
        expect(cards2[2].getAttribute('data-id')).toBe('5');
    });
});
