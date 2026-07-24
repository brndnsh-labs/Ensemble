// @ts-nocheck
/**
 * @vitest-environment happy-dom
 */
import { render } from 'preact';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SurpriseMe } from '../../../public/components/SurpriseMe.jsx';
import { GENRE_NAMES } from '../../../public/data/smart-genres.js';

const mockDispatch = vi.fn();
const mockClearChordPresetHighlight = vi.fn();
const mockRefreshArrangerUI = vi.fn();
const mockAppendSections = vi.fn();
const mockPushHistory = vi.fn();
const mockUndo = vi.fn();
const mockGenerateSong = vi.fn();
const mockShowToast = vi.fn();
const mockGenerateId = vi.fn(() => 'new-id');

vi.mock('../../../public/state.js', () => ({
    dispatch: (...args: any[]) => mockDispatch(...args),
    stateMap: {},
    getState: () => ({}),
}));

vi.mock('../../../public/controllers/arranger-controller.js', () => ({
    appendSections: (...args: any[]) => mockAppendSections(...args),
    clearChordPresetHighlight: () => mockClearChordPresetHighlight(),
    refreshArrangerUI: () => mockRefreshArrangerUI(),
}));

vi.mock('../../../public/state/history.js', () => ({
    pushHistory: () => mockPushHistory(),
    undo: (...args: any[]) => mockUndo(...args),
}));

vi.mock('../../../public/song/song-generator.js', () => ({
    generateSong: (...args: any[]) => mockGenerateSong(...args),
    predictStructure: () => ['Verse', 'Chorus', 'Verse', 'Chorus'],
}));

vi.mock('../../../public/ui.js', () => ({
    showToast: (...args: any[]) => mockShowToast(...args),
}));

vi.mock('../../../public/state/share-codec.js', () => ({
    generateId: () => mockGenerateId(),
}));

// #1165: the groove slice is mutable per-test so the canon-name vs runtime-feel axis can be
// exercised. `genreFeel` and `lastSmartGenre` diverge for exactly 2 of the 13 genres.
const { mockGroove } = vi.hoisted(() => ({
    mockGroove: { genreFeel: 'Rock', lastSmartGenre: 'Rock' } as Record<string, string>,
}));

vi.mock('../../../public/ui-bridge.js', () => ({
    useEnsembleState: (selector: any) =>
        selector({
            playback: { modals: { surpriseMe: true }, bpm: 100 },
            arranger: { key: 'C', isMinor: false, timeSignature: '4/4', sections: [] },
            groove: mockGroove,
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
        mockGroove.genreFeel = 'Rock';
        mockGroove.lastSmartGenre = 'Rock';
    });

    function mount() {
        render(<SurpriseMe />, document.getElementById('app'));
    }

    async function tick() {
        await new Promise((r) => setTimeout(r, 10));
    }

    function switchTo(label: string) {
        Array.from(document.querySelectorAll('.button-group-btn'))
            .find((b) => b.textContent?.includes(label))!
            .click();
    }

    it('renders with Library mode active by default', () => {
        mount();
        const lib = document.querySelector('[data-testid="preset-library"]');
        expect(lib).toBeTruthy();
        expect(lib.getAttribute('data-mode')).toBe('replace');
    });

    it('Surprise Me calls generateSong with wizard options', async () => {
        mockGenerateSong.mockReturnValue([
            { id: 'a', label: 'Verse', value: 'C', key: 'C', timeSignature: '4/4' },
        ]);
        mount();
        switchTo('Roll');
        await tick();
        document.querySelector('.surprise-me-dice').click();
        expect(mockGenerateSong).toHaveBeenCalledTimes(1);
        const opts = mockGenerateSong.mock.calls[0][0];
        // Defaults at zero-answers: chart key/TS, current bpm, "My groove" feel.
        expect(opts).toMatchObject({
            key: 'C',
            isMinor: false,
            timeSignature: '4/4',
            bpm: 100,
            form: 'verse-chorus',
            feel: 'Rock', // resolved from groove.lastSmartGenre (canon axis, #1165)
            targetMinutes: 3,
        });
        // No seed at zero answers.
        expect(opts.seed).toBeUndefined();
        expect(mockPushHistory).toHaveBeenCalled();
        // Modal closes after success.
        expect(mockDispatch).toHaveBeenCalledWith('SET_MODAL_OPEN', {
            modal: 'surpriseMe',
            open: false,
        });
    });

    it('Surprise Me with Append mode calls appendSections instead of dispatch', async () => {
        mockGenerateSong.mockReturnValue([
            { id: 'a', label: 'Verse', value: 'C', key: 'C', timeSignature: '4/4' },
        ]);
        mount();
        switchTo('Roll');
        await tick();
        // Find the Apply toggle and click "Append".
        const appendBtn = Array.from(document.querySelectorAll('.button-group-btn')).find(
            (b) => b.textContent === 'Append',
        );
        appendBtn!.click();
        await tick();
        document.querySelector('.surprise-me-dice').click();
        expect(mockAppendSections).toHaveBeenCalled();
        // LOAD_TEMPLATE should NOT be dispatched in append mode.
        expect(mockDispatch).not.toHaveBeenCalledWith('LOAD_TEMPLATE', expect.anything());
    });

    it('typing a seed populates seed.chords with the parsed result', async () => {
        mockGenerateSong.mockReturnValue([{ id: 'a', label: 'Verse', value: 'C' }]);
        mount();
        switchTo('Roll');
        await tick();
        // Click "+ Add chords…" to expand the input.
        const addBtn = document.querySelector('.surprise-me-seed-add');
        addBtn.click();
        await tick();
        const input = document.querySelector('.surprise-me-seed-input') as HTMLInputElement;
        input.value = 'C Am F G';
        input.dispatchEvent(new Event('input', { bubbles: true }));
        await tick();
        // Confirm via OK button.
        document.querySelector('.surprise-me-seed-confirm').click();
        await tick();
        // Roll and verify the seed is passed through.
        document.querySelector('.surprise-me-dice').click();
        const opts = mockGenerateSong.mock.calls[0][0];
        expect(opts.seed).toEqual({ chords: ['C', 'Am', 'F', 'G'], role: 'verse' });
    });

    it('suggestion chip populates the seed', async () => {
        mockGenerateSong.mockReturnValue([{ id: 'a', label: 'Verse', value: 'C' }]);
        mount();
        switchTo('Roll');
        await tick();
        // Click the I-V-vi-IV suggest chip.
        const chip = Array.from(document.querySelectorAll('.surprise-me-suggest-chip')).find(
            (b) => b.textContent === 'I-V-vi-IV',
        );
        chip!.click();
        await tick();
        document.querySelector('.surprise-me-dice').click();
        const opts = mockGenerateSong.mock.calls[0][0];
        expect(opts.seed.chords).toEqual(['I', 'V', 'vi', 'IV']);
    });

    it('Reset answers clears seed + restores defaults', async () => {
        mockGenerateSong.mockReturnValue([{ id: 'a', label: 'Verse', value: 'C' }]);
        mount();
        switchTo('Roll');
        await tick();
        // Apply a suggestion to set the seed.
        const chip = Array.from(document.querySelectorAll('.surprise-me-suggest-chip')).find(
            (b) => b.textContent === 'ii-V-I',
        );
        chip!.click();
        await tick();
        // Reset.
        document.querySelector('.surprise-me-reset').click();
        await tick();
        // Now Surprise Me should fire without a seed.
        document.querySelector('.surprise-me-dice').click();
        const opts = mockGenerateSong.mock.calls[0][0];
        expect(opts.seed).toBeUndefined();
    });

    it('switching to Templates mode shows the template grid', async () => {
        mount();
        switchTo('Templates');
        await tick();
        const cards = document.querySelectorAll('.template-card-btn');
        expect(cards.length).toBe(2);
        expect(cards[0].textContent).toContain('Standard Pop');
    });

    it('template card requires two clicks (confirm pattern)', async () => {
        mount();
        switchTo('Templates');
        await tick();
        const firstCard = document.querySelector('.template-card-btn');
        firstCard.click();
        expect(mockDispatch).not.toHaveBeenCalledWith('LOAD_TEMPLATE', expect.anything());
        await tick();
        expect(firstCard.textContent).toContain('Tap again to replace');
        firstCard.click();
        expect(mockDispatch).toHaveBeenCalledWith('LOAD_TEMPLATE', expect.any(Object));
    });

    it('switching to Library mode renders PresetLibrary defaulting to replace', async () => {
        mount();
        switchTo('Library');
        await tick();
        const lib = document.querySelector('[data-testid="preset-library"]');
        expect(lib).toBeTruthy();
        expect(lib.getAttribute('data-mode')).toBe('replace');
    });

    it('Library mode allows toggling to Append mode', async () => {
        mount();
        switchTo('Library');
        await tick();
        const appendBtn = Array.from(document.querySelectorAll('.button-group-btn')).find((b) =>
            b.textContent?.includes('Append'),
        );
        appendBtn.click();
        await tick();
        expect(
            document.querySelector('[data-testid="preset-library"]').getAttribute('data-mode'),
        ).toBe('append');
    });

    // --- #1165 regression -----------------------------------------------------
    //
    // "Match my groove" must feed song-generator the CANON genre name. Its FEEL_BASE_POOL is
    // keyed on GENRE_NAMES, and anything else is silently rerolled to a uniformly random genre.
    // `groove.genreFeel` is the runtime FEEL string, which diverges from canon for exactly two
    // genres — so reading it made "Match my groove" randomize for Bossa and Ska-Punk.
    // The generator-side half of this guard lives in tests/unit/engine/song-generator.test.ts.
    it.each([
        { genreFeel: 'Bossa Nova', lastSmartGenre: 'Bossa' },
        { genreFeel: 'Ska', lastSmartGenre: 'Ska-Punk' },
        { genreFeel: 'Jazz', lastSmartGenre: 'Jazz' },
    ])(
        'passes the canon genre name for a $lastSmartGenre groove, not the runtime feel',
        async ({ genreFeel, lastSmartGenre }) => {
            mockGroove.genreFeel = genreFeel;
            mockGroove.lastSmartGenre = lastSmartGenre;

            mount();
            await tick();
            switchTo('Roll');
            await tick();
            document.querySelector('.surprise-me-dice').click();

            expect(mockGenerateSong).toHaveBeenCalledTimes(1);
            const { feel } = mockGenerateSong.mock.calls[0][0];
            expect(feel).toBe(lastSmartGenre);
            expect(GENRE_NAMES).toContain(feel);
        },
    );
});
