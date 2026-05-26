// @ts-nocheck
/**
 * @vitest-environment happy-dom
 */
import { render } from 'preact';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SurpriseMe } from '../../../public/components/SurpriseMe.jsx';

const mockDispatch = vi.fn();
const mockClearChordPresetHighlight = vi.fn();
const mockRefreshArrangerUI = vi.fn();
const mockPushHistory = vi.fn();
const mockGenerateSong = vi.fn();
const mockShowToast = vi.fn();
const mockGenerateId = vi.fn(() => 'new-id');

vi.mock('../../../public/state.js', () => ({
    dispatch: (...args: any[]) => mockDispatch(...args),
    stateMap: {},
    getState: () => ({}),
}));

vi.mock('../../../public/arranger-controller.js', () => ({
    clearChordPresetHighlight: () => mockClearChordPresetHighlight(),
    refreshArrangerUI: () => mockRefreshArrangerUI(),
}));

vi.mock('../../../public/history.js', () => ({
    pushHistory: () => mockPushHistory(),
}));

vi.mock('../../../public/song-generator.js', () => ({
    generateSong: (...args: any[]) => mockGenerateSong(...args),
}));

vi.mock('../../../public/ui.js', () => ({
    showToast: (...args: any[]) => mockShowToast(...args),
}));

vi.mock('../../../public/utils.js', () => ({
    generateId: () => mockGenerateId(),
}));

vi.mock('../../../public/ui-bridge.js', () => ({
    useEnsembleState: (selector: any) =>
        selector({
            playback: { modals: { surpriseMe: true } },
            arranger: { key: 'C', isMinor: false, timeSignature: '4/4' },
        }),
}));

vi.mock('../../../public/components/PresetLibrary.jsx', () => ({
    PresetLibrary: ({ mode }: { mode: string }) => (
        <div data-testid="preset-library" data-mode={mode} />
    ),
}));

// Mock the SONG_TEMPLATES data so we get a stable fixture.
vi.mock('../../../public/data/song-templates.js', () => ({
    SONG_TEMPLATES: [
        {
            name: 'Standard Pop',
            sections: [
                { label: 'Verse', value: 'I | V | vi | IV', repeat: 1 },
                { label: 'Chorus', value: 'IV | V | I | vi', repeat: 1 },
            ],
            isMinor: false,
        },
        {
            name: 'Test Template',
            sections: [{ label: 'A', value: 'I', repeat: 1 }],
            isMinor: true,
        },
    ],
}));

describe('SurpriseMe', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        document.body.innerHTML = '<div id="app"></div>';
    });

    function mount() {
        render(<SurpriseMe />, document.getElementById('app'));
    }

    it('renders with Library mode active by default', () => {
        mount();
        const lib = document.querySelector('[data-testid="preset-library"]');
        expect(lib).toBeTruthy();
        expect(lib.getAttribute('data-mode')).toBe('replace');
    });

    it('Roll the Dice calls generateSong with current key/timeSig/isMinor', async () => {
        mockGenerateSong.mockReturnValue([
            { id: 'a', label: 'Verse', value: 'C', key: 'C', timeSignature: '4/4' },
        ]);
        mount();
        // Switch from default Library mode to Roll mode.
        Array.from(document.querySelectorAll('.button-group-btn'))
            .find((b) => b.textContent?.includes('Roll'))!
            .click();
        await new Promise((r) => setTimeout(r, 10));
        document.querySelector('.surprise-me-dice').click();
        expect(mockGenerateSong).toHaveBeenCalledWith(
            expect.objectContaining({
                key: 'C',
                isMinor: false,
                timeSignature: '4/4',
                structure: 'random',
                complexity: 0.3,
            }),
        );
        expect(mockPushHistory).toHaveBeenCalled();
        // Closes the modal after success.
        expect(mockDispatch).toHaveBeenCalledWith('SET_MODAL_OPEN', {
            modal: 'surpriseMe',
            open: false,
        });
    });

    it('switching to Templates mode shows the template grid', async () => {
        mount();
        const buttons = document.querySelectorAll('.button-group-btn');
        const templatesBtn = Array.from(buttons).find((b) => b.textContent?.includes('Templates'));
        templatesBtn.click();
        await new Promise((r) => setTimeout(r, 10));
        const cards = document.querySelectorAll('.template-card-btn');
        expect(cards.length).toBe(2);
        expect(cards[0].textContent).toContain('Standard Pop');
    });

    it('template card requires two clicks (confirm pattern)', async () => {
        mount();
        const buttons = document.querySelectorAll('.button-group-btn');
        Array.from(buttons)
            .find((b) => b.textContent?.includes('Templates'))!
            .click();
        await new Promise((r) => setTimeout(r, 10));

        const firstCard = document.querySelector('.template-card-btn');
        firstCard.click();
        // First click: confirm chip appears, no LOAD_TEMPLATE yet.
        expect(mockDispatch).not.toHaveBeenCalledWith('LOAD_TEMPLATE', expect.anything());
        await new Promise((r) => setTimeout(r, 10));
        expect(firstCard.textContent).toContain('Tap again to replace');

        // Second click loads it.
        firstCard.click();
        expect(mockDispatch).toHaveBeenCalledWith('LOAD_TEMPLATE', expect.any(Object));
    });

    it('switching to Library mode renders PresetLibrary defaulting to replace', async () => {
        mount();
        const buttons = document.querySelectorAll('.button-group-btn');
        Array.from(buttons)
            .find((b) => b.textContent?.includes('Library'))!
            .click();
        await new Promise((r) => setTimeout(r, 10));
        const lib = document.querySelector('[data-testid="preset-library"]');
        expect(lib).toBeTruthy();
        expect(lib.getAttribute('data-mode')).toBe('replace');
    });

    it('Library mode allows toggling to Append mode', async () => {
        mount();
        // Switch to library
        Array.from(document.querySelectorAll('.button-group-btn'))
            .find((b) => b.textContent?.includes('Library'))!
            .click();
        await new Promise((r) => setTimeout(r, 10));
        // Switch sub-mode to Append
        const appendBtn = Array.from(document.querySelectorAll('.button-group-btn')).find((b) =>
            b.textContent?.includes('Append'),
        );
        appendBtn.click();
        await new Promise((r) => setTimeout(r, 10));
        expect(
            document.querySelector('[data-testid="preset-library"]').getAttribute('data-mode'),
        ).toBe('append');
    });

    it('Advanced disclosure reveals structure + complexity controls', async () => {
        mount();
        // Switch from default Library mode to Roll mode.
        Array.from(document.querySelectorAll('.button-group-btn'))
            .find((b) => b.textContent?.includes('Roll'))!
            .click();
        await new Promise((r) => setTimeout(r, 10));
        const toggle = document.querySelector('.surprise-me-advanced-toggle');
        toggle.click();
        await new Promise((r) => setTimeout(r, 10));
        const advanced = document.querySelector('.surprise-me-advanced');
        expect(advanced).toBeTruthy();
        expect(advanced.textContent).toMatch(/Structure/);
        expect(advanced.textContent).toMatch(/Complexity/);
    });
});
