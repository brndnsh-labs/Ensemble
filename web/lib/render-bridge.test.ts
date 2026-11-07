/**
 * The render bridge's clone of state matches what the live app hands the voices: a scene's own
 * humanize reaches `groove.humanize` (#2101, the soloist's timbre jitter reads it), and
 * `groove.genreFeel` holds the genre's feel key ('Bossa Nova'), not its canonical name ('Bossa').
 */
import type { SemanticScore } from '@core/songbook/score-types';
import type { EnsembleState } from '@core/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderBand } from './render-bridge';

const captured = vi.hoisted(() => ({ prepare: null as null | ((state: EnsembleState) => void) }));

vi.mock('./band-export', () => ({
    renderBandPasses: vi.fn(
        async (
            _passes: unknown,
            _timeline: unknown,
            _bpm: unknown,
            options: { prepare: (state: EnsembleState) => void },
        ) => {
            captured.prepare = options.prepare;
            return { channels: [], sampleRate: 44100, leadInSeconds: 0, passSeconds: 0 };
        },
    ),
}));

const score: SemanticScore = {
    notation: 'name',
    key: 'C',
    isMinor: false,
    meter: '4/4',
    grouping: null,
    sections: [
        {
            id: 'a',
            label: 'A',
            repeat: 1,
            measures: [
                {
                    id: 'm1',
                    content: {
                        kind: 'events',
                        events: [{ kind: 'chord', symbol: 'C', duration: [4, 1] }],
                    },
                },
            ],
        },
    ],
};

/** Render a request and run its `prepare` hook on a stand-in clone; returns the clone's groove. */
async function cloneGroove(extra: { genreFeel?: string; humanize?: number | null }) {
    await renderBand({
        score,
        passes: [[]],
        bpm: 100,
        sampleRate: 44100,
        intensity: 0.7,
        voices: [],
        randomSeed: 'test',
        ...extra,
    });
    const state = {
        playback: {},
        groove: { humanize: 20, genreFeel: 'Rock', lastSmartGenre: 'Rock' },
    } as unknown as EnsembleState;
    captured.prepare?.(state);
    return state.groove;
}

describe('renderBand clone', () => {
    beforeEach(() => {
        captured.prepare = null;
    });

    it('carries the scene humanize into groove.humanize', async () => {
        expect((await cloneGroove({ humanize: 70 })).humanize).toBe(70);
    });

    it('reads a scene with no humanize (or null) as not set, the stored 20', async () => {
        expect((await cloneGroove({ humanize: null })).humanize).toBe(20);
        expect((await cloneGroove({})).humanize).toBe(20);
    });

    it('writes the genre feel, not the genre name, into groove.genreFeel', async () => {
        const groove = await cloneGroove({ genreFeel: 'Bossa' });
        expect(groove.genreFeel).toBe('Bossa Nova');
        expect(groove.lastSmartGenre).toBe('Bossa');
    });

    it('keeps an unknown or prototype-chain name as given', async () => {
        expect((await cloneGroove({ genreFeel: 'constructor' })).genreFeel).toBe('constructor');
    });
});
