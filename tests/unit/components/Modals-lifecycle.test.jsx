/**
 * @vitest-environment happy-dom
 */
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Modals } from '../../../public/components/Modals.jsx';
import { dispatch } from '../../../public/state.js';
import { ACTIONS } from '../../../public/types.js';

// Mock heavy components to avoid complex sub-renders
vi.mock('../../../public/components/Settings.jsx', () => ({
    Settings: () => <div id="settings-mock">Settings</div>,
}));
vi.mock('../../../public/components/EditorModal.jsx', () => ({
    EditorModal: () => <div id="editor-mock">Editor</div>,
}));
vi.mock('../../../public/components/GenerateSongModal.jsx', () => ({
    GenerateSongModal: () => <div id="gen-mock">Gen</div>,
}));
vi.mock('../../../public/components/ExportModal.jsx', () => ({
    ExportModal: () => <div id="export-mock">Export</div>,
}));
vi.mock('../../../public/components/TemplatesModal.jsx', () => ({
    TemplatesModal: () => <div id="templates-mock">Templates</div>,
}));
vi.mock('../../../public/components/AnalyzerModal.jsx', () => ({
    AnalyzerModal: () => <div id="analyzer-mock">Analyzer</div>,
}));

describe('Modal Lifecycle & Animation', () => {
    beforeEach(() => {
        // Reset modal states
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'settings', open: false });
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'editor', open: false });
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'generateSong', open: false });
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'export', open: false });
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'templates', open: false });
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'analyzer', open: false });
        document.body.innerHTML = '<div id="app"></div>';
    });

    it('should correctly handle the entrance and exit lifecycle of modals', async () => {
        const root = document.getElementById('app');

        // 1. Initially no modals
        await act(async () => {
            render(<Modals />, root);
        });

        // Wait for mount and subscription
        await new Promise((r) => setTimeout(r, 20));
        expect(document.querySelector('#settings-mock')).toBeNull();

        // 2. Open Settings
        await act(async () => {
            dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'settings', open: true });
        });

        // Give Preact and Suspense time to catch the state change and render
        await new Promise((r) => setTimeout(r, 100));

        expect(document.querySelector('#settings-mock')).not.toBeNull();
        expect(document.querySelector('.closing')).toBeNull();

        // 3. Close Settings
        await act(async () => {
            dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'settings', open: false });
        });
        await new Promise((r) => setTimeout(r, 50));

        // Should STILL be in DOM with "closing" class (AnimatedModalWrapper keeps it for 300ms)
        expect(document.querySelector('#settings-mock')).not.toBeNull();
        expect(document.querySelector('.closing')).not.toBeNull();

        // 4. Advance time past the 300ms animation buffer
        await new Promise((r) => setTimeout(r, 400));

        // Should be completely unmounted now
        expect(document.querySelector('#settings-mock')).toBeNull();
    });
});
