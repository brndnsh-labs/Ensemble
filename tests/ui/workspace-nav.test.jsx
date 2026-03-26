/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */

import { render } from 'preact';
import React from 'preact/compat';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { WorkspaceNav } from '../../public/components/WorkspaceNav.jsx';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

vi.mock('../../public/persistence.js', () => ({
    saveCurrentState: vi.fn(),
    debounceSaveState: vi.fn(),
}));

describe('Workspace navigation shell', () => {
    beforeEach(() => {
        document.body.innerHTML = '<div id="root"></div>';
        dispatch(ACTIONS.SET_PARAM, {
            module: 'ui',
            param: 'activeWorkspace',
            value: 'arranger',
        });
        dispatch(ACTIONS.SET_PARAM, {
            module: 'playback',
            param: 'isPlaying',
            value: false,
        });
    });

    it('switches the active workspace from the shell nav', async () => {
        render(<WorkspaceNav />, document.getElementById('root'));
        await new Promise((resolve) => setTimeout(resolve, 0));

        document.querySelector('[data-workspace-nav="studio"]').click();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(getState().ui.activeWorkspace).toBe('studio');
    });

    it('shows the live pill while playback is active', async () => {
        dispatch(ACTIONS.SET_PARAM, {
            module: 'playback',
            param: 'isPlaying',
            value: true,
        });

        render(<WorkspaceNav />, document.getElementById('root'));
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(document.querySelector('.workspace-nav-live-pill')?.textContent).toContain('Live');
    });

    it('renders simple workspace labels without descriptions', async () => {
        render(<WorkspaceNav />, document.getElementById('root'));
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(document.querySelectorAll('.workspace-nav-btn')).toHaveLength(4);
        expect(document.querySelectorAll('.workspace-nav-description')).toHaveLength(0);
    });
});
