// @ts-nocheck
/**
 * @vitest-environment happy-dom
 */
import { render } from 'preact';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SectionCard } from '../../../public/components/SectionCard.jsx';
import { dispatch } from '../../../public/state.js';
import { ACTIONS } from '../../../public/types.js';

vi.mock('../../../public/arranger-controller.js', () => ({
    onSectionUpdate: vi.fn(),
    onSectionDelete: vi.fn(),
    onSectionDuplicate: vi.fn(),
}));

describe('SectionCard Mutation Feedback', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="app"></div>';
        // Reset state
        dispatch(ACTIONS.SET_PARAM, {
            module: 'arranger',
            param: 'mutatedSectionId',
            value: null,
        });
    });

    it('should apply the "mutated" class when the section is mutated', async () => {
        const section = { id: 's-test', label: 'Test', value: 'I | IV' };
        const root = document.getElementById('app');

        render(<SectionCard section={section} index={0} totalSections={1} />, root);
        // Wait for mount and subscription
        await new Promise((r) => setTimeout(r, 20));

        let textarea = document.querySelector('textarea');
        expect(textarea.classList.contains('mutated')).toBe(false);

        // Simulate mutation highlight state change
        dispatch(ACTIONS.SET_PARAM, {
            module: 'arranger',
            param: 'mutatedSectionId',
            value: 's-test',
        });

        // Give Preact time to render
        await new Promise((r) => setTimeout(r, 50));

        textarea = document.querySelector('textarea');
        expect(textarea.classList.contains('mutated')).toBe(true);

        // Reset
        dispatch(ACTIONS.SET_PARAM, {
            module: 'arranger',
            param: 'mutatedSectionId',
            value: null,
        });

        await new Promise((r) => setTimeout(r, 10));
        textarea = document.querySelector('textarea');
        expect(textarea.classList.contains('mutated')).toBe(false);
    });
});
