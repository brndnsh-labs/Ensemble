import { describe, expect, it } from 'vitest';
import { getIntervals } from '../../public/engine/chords-styles.js';
import type { EnsembleState } from '../../public/types.js';

// #552 (genre-audit Wave 1, Disco/Piano): Disco was excluded from the moderate
// add9 color lane and only reached a 7th/9th at the >=0.6 extension block, so its
// mid-dynamic offbeat stabs comped as BARE TRIADS — missing the lush 6/9 + m9
// color central to disco (Chic, MFSB). The fix gives Disco a loudness-independent
// color lane in the mid band: major -> 6/9, minor -> m9.
//
// getIntervals() is the voicing source the live piano consumes (parseProgressionPart
// -> chord.intervals -> getAccompanimentNotes). Tested directly here.
describe('Disco Piano Critique', () => {
    // getIntervals (and the voicing policy it calls) reads exactly these three fields.
    function pcsFor(quality: string, is7th: boolean, intensity: number, genre = 'Disco') {
        const state = {
            playback: { bandIntensity: intensity },
            groove: { genreFeel: 'Disco' },
            bass: { enabled: true },
        } as unknown as EnsembleState;
        const intervals = getIntervals(state, quality, is7th, genre);
        return new Set(intervals.map((i) => ((i % 12) + 12) % 12));
    }

    // pitch classes: 9 = major 6th, 2 = 9th (14 % 12), 10 = b7, 4 = maj3, 3 = b3.

    // (a) THE FIX: a plain MAJOR triad at mid intensity is a 6/9, not a bare triad.
    it('voices a major triad as 6/9 at mid intensity', () => {
        for (const intensity of [0.4, 0.5, 0.59]) {
            const pcs = pcsFor('major', false, intensity);
            expect(pcs.has(9)).toBe(true); // 6th  (the 6/9 color)
            expect(pcs.has(2)).toBe(true); // 9th
            expect(pcs.has(4)).toBe(true); // major 3rd intact (real triad, not vacuous)
        }
    });

    // (b) THE FIX: a plain MINOR triad at mid intensity is an m9, not a bare triad.
    it('voices a minor triad as m9 at mid intensity', () => {
        for (const intensity of [0.4, 0.5, 0.59]) {
            const pcs = pcsFor('minor', false, intensity);
            expect(pcs.has(10)).toBe(true); // b7  (the m9 color)
            expect(pcs.has(2)).toBe(true); // 9th
            expect(pcs.has(3)).toBe(true); // b3 intact
        }
    });

    // (c) GATING DISCRIMINATOR (not always-on): below the soft-pad floor (0.35) a
    // disco major stays a bare triad — proves the color is mid-band gated, so (a)
    // is a real banded behavior, not a tautology that fires at every intensity.
    it('leaves a major triad bare below the soft-pad floor', () => {
        const pcs = pcsFor('major', false, 0.2);
        expect(pcs.has(9)).toBe(false); // no 6th
        expect(pcs.has(2)).toBe(false); // no 9th
        expect([...pcs].sort((a, b) => a - b)).toEqual([0, 4, 7]); // bare triad
    });

    // (d) GENRE DISCRIMINATOR: the lane is Disco-specific. A genre NOT in the
    // color-friendly set and NOT Disco (Reggae) still comps a bare major triad at
    // the same mid intensity — proves (a) is the new Disco lane firing, not a
    // global change to every genre.
    it('does not color a non-disco, non-color-friendly genre at mid intensity', () => {
        const pcs = pcsFor('major', false, 0.5, 'Reggae');
        expect(pcs.has(9)).toBe(false);
        expect(pcs.has(2)).toBe(false);
    });

    // (e) CONTINUITY: disco stays colored at high intensity too (the >=0.6 block
    // already added the 9th there) — the fix didn't create a mid-only island that
    // drops back to bare when the part gets loud.
    it('keeps extension color at high intensity', () => {
        const pcs = pcsFor('major', false, 0.7);
        expect(pcs.has(2)).toBe(true); // 9th present at high intensity
    });
});
