/**
 * Song mode's chorus count (#1784): the number of choruses whose whole performance lands
 * nearest the target, measured on the real compiled timeline.
 */
import type { SemanticScore } from '@core/songbook/score-types';
import { describe, expect, it } from 'vitest';
import { MAX_SONG_CHORUSES, planSong, songPlanText } from './song-mode';

/** A one-section 4/4 chart of `bars` whole-bar chords. */
function form(bars: number, extra: Partial<SemanticScore> = {}): SemanticScore {
    const symbols = ['C', 'F', 'G', 'Am'];
    return {
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
                measures: Array.from({ length: bars }, (_, i) => ({
                    id: `m${i + 1}`,
                    content: {
                        kind: 'events' as const,
                        events: [
                            {
                                kind: 'chord' as const,
                                symbol: symbols[i % symbols.length],
                                duration: [4, 1] as [number, number],
                            },
                        ],
                    },
                })),
            },
        ],
        ...extra,
    };
}

const pick = (score: SemanticScore, bpm: number, seconds: number) => {
    const plan = planSong(score, bpm, seconds);
    // Seconds to the microsecond: a tempo's seconds-per-tick is not exact in binary.
    return plan && { choruses: plan.choruses, seconds: Math.round(plan.seconds * 1e6) / 1e6 };
};

describe('planSong (#1784)', () => {
    it('plays a slow 32-bar tune two or three times', () => {
        // 32 bars at 100 bpm: 76.8s a chorus. Three minutes is nearer 2 (153.6s) than 3 (230.4s);
        // four is nearer 3 than 4 (307.2s).
        expect(pick(form(32), 100, 180)).toEqual({ choruses: 2, seconds: 153.6 });
        expect(pick(form(32), 100, 240)).toEqual({ choruses: 3, seconds: 230.4 });
    });

    it('plays a fast 12-bar blues eleven times in three minutes', () => {
        // 12 bars at 180 bpm: 16s a chorus. 11 is 176s (4s short), 12 is 192s (12s long).
        expect(pick(form(12), 180, 180)).toEqual({ choruses: 11, seconds: 176 });
    });

    it('rounds an exact tie up', () => {
        // 8 bars at 120 bpm: 16s a chorus. A 24s target is 8s from 1 chorus and from 2.
        expect(pick(form(8), 120, 24)).toEqual({ choruses: 2, seconds: 32 });
    });

    it('never asks for more than 16 choruses', () => {
        // One bar at 240 bpm is a second: three minutes would be 180 of them.
        expect(pick(form(1), 240, 180)).toEqual({ choruses: MAX_SONG_CHORUSES, seconds: 16 });
    });

    it('plays a chorus longer than the target once', () => {
        // 64 bars at 60 bpm: 256s, already past three minutes.
        expect(pick(form(64), 60, 180)).toEqual({ choruses: 1, seconds: 256 });
    });

    it('leaves a chart that counts its own choruses alone', () => {
        expect(planSong(form(12, { choruses: 2 }), 120, 180)).toBeNull();
    });

    it('measures every chorus rather than multiplying one: a once-only outro plays once', () => {
        // A 4-bar outro played only on the last chorus (#1483) adds 8s once, not per chorus.
        const score = form(8);
        score.sections.push({
            ...form(4).sections[0],
            id: 'outro',
            label: 'Outro',
            measures: form(4).sections[0].measures.map((measure) => ({
                ...measure,
                id: `outro-${measure.id}`,
            })),
        });
        // 8 bars at 120 bpm is 16s a chorus, plus the 8s outro: 2 choruses are 40s.
        expect(pick(score, 120, 40)).toEqual({ choruses: 2, seconds: 40 });
    });

    it('builds a counted copy and leaves the chart as it was', () => {
        const score = form(8);
        const before = JSON.stringify(score);
        const plan = planSong(score, 120, 60);
        expect(plan?.score.choruses).toBe(plan?.choruses);
        expect(plan?.timeline.ticks).toBeGreaterThan(0);
        expect(JSON.stringify(score)).toBe(before);
    });
});

describe('songPlanText', () => {
    it('reads as minutes and seconds, then the count', () => {
        expect(songPlanText({ choruses: 4, seconds: 192.4 })).toBe('≈3:12 · 4 choruses');
        expect(songPlanText({ choruses: 1, seconds: 59.6 })).toBe('≈1:00 · 1 chorus');
        expect(songPlanText({ choruses: 16, seconds: 16 })).toBe('≈0:16 · 16 choruses');
    });
});
