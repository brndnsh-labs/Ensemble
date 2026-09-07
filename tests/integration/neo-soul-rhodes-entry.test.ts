/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { refreshArrangerUI } from '../../public/controllers/arranger-controller.js';
import { getChordPlayerChoices } from '../../public/data/instrument-styles.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { resetHiddenGenerationMemory } from '../../public/engine/generation-run.js';
import {
    __resetPackCacheForTest,
    markPackInstalled,
} from '../../public/engine/instrument-registry.js';
import { generateNotesForStep } from '../../public/engine/tick-logic.js';
import { cloneStateForDetachedGeneration } from '../../public/export/detached-generation-state.js';
import { MIXER_SETTINGS_VERSION } from '../../public/state/instruments.js';
import { encodeBase64Unicode } from '../../public/state/share-codec.js';
import {
    handleEffects,
    reconcileUrlGenreOnBoot,
    resolveAutoVoices,
} from '../../public/state/state-effects.js';
import { hydrateState, loadFromUrl } from '../../public/state/state-hydration.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';
import { enterGenre } from '../utils/genre-entry.js';

// Keep the real controller, reducers, genre effects and buffer clearing. Capture
// only the worker transport so the test can inspect the state sent to refill.
const { syncWorker, flushWorker } = vi.hoisted(() => ({
    syncWorker: vi.fn(),
    flushWorker: vi.fn(),
}));
vi.mock('../../public/worker-client.js', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../../public/worker-client.js')>()),
    syncWorker,
    flushWorker,
}));

const CHART = [
    { id: 'rhodes-entry', label: 'Verse', value: 'Dm9 | G13 | Cmaj9 | Am9', timeSignature: '4/4' },
];

beforeEach(() => {
    const saved = new Map<string, string>();
    vi.stubGlobal('localStorage', {
        getItem: (key: string) => saved.get(key) ?? null,
        setItem: (key: string, value: string) => saved.set(key, String(value)),
        removeItem: (key: string) => saved.delete(key),
        clear: () => saved.clear(),
    });
    localStorage.clear();
    window.history.replaceState(null, '', '/');
    __resetPackCacheForTest();
    vi.clearAllMocks();
});

afterEach(() => {
    __resetPackCacheForTest();
    vi.restoreAllMocks();
    localStorage.clear();
    vi.unstubAllGlobals();
});

async function boot() {
    await enterGenre('Neo-Soul');
    dispatch(ACTIONS.SET_SECTIONS, CHART);
    validateProgression(getState());
    dispatch(ACTIONS.SET_PARAM, { module: 'playback', param: 'bandIntensity', value: 0.55 });
    return getState();
}

function selectPlayer(style: string) {
    const payload = { module: 'chords', style };
    dispatch(ACTIONS.SET_STYLE, payload);
    handleEffects({ type: ACTIONS.SET_STYLE, payload }, getState(), { dispatch });
    // Same sequence as ChordsControls: rebuild -> sync -> bundled refill.
    refreshArrangerUI();
}

function generatedChords() {
    const state = cloneStateForDetachedGeneration(getState());
    resetHiddenGenerationMemory(state);
    const cursors = {
        mainCursor: { index: 0, sectionIndex: 0 },
        lookaheadCursor: { index: 0, sectionIndex: 0 },
    };
    return Array.from(
        { length: state.arranger.totalSteps },
        (_, step) =>
            generateNotesForStep(
                state,
                step,
                cursors,
                {
                    includeBass: false,
                    includeChords: true,
                    includeSoloist: false,
                    includeHarmony: false,
                    includeDrums: false,
                    noLiveConductor: true,
                },
                { lastActiveSoloistMidi: 0, lastActiveSoloistStep: 0 },
            ).notes,
    )
        .flat()
        .filter((note) => note.module === 'chords' && (note.midi ?? 0) > 0 && !note.muted);
}

function expectRhodesOutput() {
    const notes = generatedChords();
    expect(notes.length).toBeGreaterThan(0);
    expect(new Set(notes.map((note) => note.chordPerformance?.player))).toEqual(
        new Set(['neo-soul-rhodes']),
    );
    expect(notes.every((note) => Number.isFinite(note.velocity) && note.velocity! > 0)).toBe(true);
    expect(
        notes.every((note) => Number.isFinite(note.durationSteps) && note.durationSteps! > 0),
    ).toBe(true);
}

describe('Neo-Soul Rhodes explicit entry (#1163)', () => {
    it('keeps the default, then sends the selected player and Rhodes sound through the real controller refill', async () => {
        markPackInstalled('rhodes', true);
        markPackInstalled('grand', true);
        const state = await boot();
        expect(state.chords.style).toBe('smart');
        expect(getChordPlayerChoices('Neo-Soul', state.chords.style)).toEqual([
            { value: 'smart', label: 'Neo-Soul comping' },
            { value: 'neo-soul-rhodes', label: 'Neo-Soul Rhodes' },
        ]);
        const chart = state.arranger.stepMap.map(({ start, end, chord }) => ({
            start,
            end,
            name: chord.absName,
        }));
        selectPlayer('modern-piano');
        expect(state.chords.voice).toBe('pack:grand');
        vi.clearAllMocks();
        selectPlayer('neo-soul-rhodes');
        expect(state.chords.style).toBe('neo-soul-rhodes');
        expect(state.chords.voice).toBe('pack:rhodes');
        expect(state.chords.autoSound).toBe(true);
        expect(syncWorker).toHaveBeenCalledOnce();
        expect(flushWorker).toHaveBeenCalledOnce();
        expect(syncWorker.mock.invocationCallOrder[0]).toBeLessThan(
            flushWorker.mock.invocationCallOrder[0],
        );
        expect(flushWorker.mock.calls[0][1].chords).toMatchObject({
            style: 'neo-soul-rhodes',
            voice: 'pack:rhodes',
        });
        expect(
            state.arranger.stepMap.map(({ start, end, chord }) => ({
                start,
                end,
                name: chord.absName,
            })),
        ).toEqual(chart);
        expectRhodesOutput();
    });

    it('generates the same named player with missing-pack fallback and preserves a pinned sound', async () => {
        const state = await boot();
        selectPlayer('neo-soul-rhodes');
        expect(state.chords.voice).toBe('synth');
        expect(state.chords.autoSound).toBe(true);
        expectRhodesOutput();
        markPackInstalled('grand', true);
        dispatch(ACTIONS.SET_INSTRUMENT_VOICE, {
            module: 'chords',
            voice: 'pack:grand',
            auto: false,
        });
        markPackInstalled('rhodes', true);
        selectPlayer('smart');
        selectPlayer('neo-soul-rhodes');
        expect(state.chords.voice).toBe('pack:grand');
        expect(state.chords.autoSound).toBe(false);
        expect(flushWorker.mock.calls.at(-1)![1].chords.voice).toBe('pack:grand');
        expectRhodesOutput();
    });

    it.each(['permalink', 'band payload'] as const)(
        "restores %s above genre defaults and retains another genre's existing choices",
        async (source) => {
            await boot();
            markPackInstalled('rhodes', true);
            const bnd = encodeBase64Unicode(
                JSON.stringify({
                    mv: MIXER_SETTINGS_VERSION,
                    c: { e: 1, s: 'neo-soul-rhodes' },
                }),
            );
            const suffix =
                source === 'permalink'
                    ? 'style=neo-soul-rhodes'
                    : `style=modern-piano&bnd=${encodeURIComponent(bnd)}`;
            window.history.replaceState(null, '', `/?genre=Acoustic&${suffix}`);
            const result = loadFromUrl();
            await reconcileUrlGenreOnBoot(
                getState(),
                result.genreName!,
                result.genreGrooveOverrides,
                dispatch,
            );
            expect(getState().groove.lastSmartGenre).toBe('Acoustic');
            expect(getState().chords.style).toBe('neo-soul-rhodes');
            expect(getState().chords.voice).toBe('pack:rhodes');
            expect(
                getChordPlayerChoices('Acoustic', getState().chords.style).map(
                    ({ value }) => value,
                ),
            ).toEqual(['neo-soul-rhodes', 'arp', 'acoustic-strum', 'modern-piano', 'open-modal']);
            expectRhodesOutput();
        },
    );

    it('round-trips the selected player and explicit sound pin through saved-session hydration', async () => {
        const state = await boot();
        markPackInstalled('grand', true);
        dispatch(ACTIONS.SET_INSTRUMENT_VOICE, {
            module: 'chords',
            voice: 'pack:grand',
            auto: false,
        });
        selectPlayer('neo-soul-rhodes'); // real controller also saves the session
        expect(JSON.parse(localStorage.getItem('ensemble_currentState')!).chords.style).toBe(
            'neo-soul-rhodes',
        );
        dispatch(ACTIONS.RESET_STATE);
        hydrateState();
        markPackInstalled('rhodes', true);
        resolveAutoVoices(state, state.groove.lastSmartGenre, dispatch);
        expect(state.chords.style).toBe('neo-soul-rhodes');
        expect(state.chords.voice).toBe('pack:grand');
        expect(state.chords.autoSound).toBe(false);
        validateProgression(state);
        expectRhodesOutput();
    });
});
