/**
 * The soloist's per-note timbre jitter scales with the humanize the band plays (#2055): the
 * chart's own amount once set, the style's own while it is not (a stored 20, #2010). Pinned at
 * the one place a band note reaches the soloist voice, `playBandEvent`, by the value it hands
 * `playSoloNote` — the voice divides it by 100 for `soloistTimbreJitter`.
 */
import { type BandEvent, compileTimeline, STYLES } from '@band/index';
import { playSoloNote } from '@core/engine/synth-soloist';
import { UNSET_HUMANIZE } from '@core/songbook/humanize';
import type { SemanticScore } from '@core/songbook/score-types';
import type { EnsembleState } from '@core/types';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { playBandEvent } from './band-host';

vi.mock('@core/engine/synth-soloist', () => ({ playSoloNote: vi.fn() }));

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

const lead: BandEvent = {
    lane: 'lead',
    midi: 72,
    dur: 240,
    tick: 0,
    offsetMs: 0,
    velocity: 90,
    bar: 0,
};

/** The humanize `playBandEvent` hands the soloist voice for a chart of this genre and stored amount. */
function handedHumanize(genre: string, stored: number): number | undefined {
    const state = {
        groove: { humanize: stored, lastSmartGenre: genre },
    } as unknown as EnsembleState;
    playBandEvent(state, lead, 1, 0.5, 1, compileTimeline(score));
    return vi.mocked(playSoloNote).mock.calls.at(-1)?.[9];
}

describe("the soloist's timbre jitter follows the humanize the band plays", () => {
    beforeEach(() => vi.mocked(playSoloNote).mockClear());

    it("hands the style's own humanize on a chart that has not set one", () => {
        expect(handedHumanize('Neo-Soul', UNSET_HUMANIZE)).toBe(STYLES.neosoul.feel.humanize);
        expect(STYLES.neosoul.feel.humanize).toBe(60);
        expect(handedHumanize('Metal', UNSET_HUMANIZE)).toBe(STYLES.metal.feel.humanize);
    });

    it("hands the chart's own humanize once it is set, whatever the style", () => {
        expect(handedHumanize('Neo-Soul', 35)).toBe(35);
        expect(handedHumanize('Neo-Soul', 0)).toBe(0);
        expect(handedHumanize('Metal', 21)).toBe(21);
    });
});
