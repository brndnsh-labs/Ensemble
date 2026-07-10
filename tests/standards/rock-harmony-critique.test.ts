// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getHarmonyNotes } from '../../public/engine/harmonies.js';
import { getState } from '../../public/state.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

/**
 * Rock harmony critique (#557).
 *
 * Before #557, Rock harmony fell through to a generic triadic string `pad` —
 * none of rock's signature harmonized-guitar 3rds/6ths (Thin Lizzy, Maiden,
 * Allmans) was expressed. Rock harmony now plays a parallel 2-voice line: a
 * diatonic 3rd (3rd+5th) or 6th (3rd+upper-root), alternating per bar, that
 * tracks the chord — and at high band intensity it thickens to a power-5th
 * double for the wall-of-guitar push.
 *
 * The voicing test treats both 3rds (3–4 st) and 6ths (8–9 st) as "harmonized"
 * because getBestInversion may voice a 3rd as its 6th inversion (musically the
 * same twin-guitar move). Power intervals (P5 = 7, its P4 inversion = 5) mark
 * the high-intensity double.
 */
describe('Rock Harmony Critique', () => {
    let mockState;

    const I = { rootMidi: 60, quality: '', intervals: [0, 4, 7], sectionId: 'A', beats: 4 };
    const IV = { rootMidi: 65, quality: '', intervals: [0, 4, 7], sectionId: 'A', beats: 4 };
    const V = { rootMidi: 67, quality: '', intervals: [0, 4, 7], sectionId: 'A', beats: 4 };
    const vi6 = { rootMidi: 69, quality: 'm', intervals: [0, 3, 7], sectionId: 'A', beats: 4 };
    const PROG = [I, IV, V, vi6];

    beforeEach(() => {
        vi.clearAllMocks();
        mockState = {
            playback: { bandIntensity: 0.55, complexity: 0.5 },
            groove: {
                genreFeel: 'Rock',
            },
            soloist: makeSoloistMock({ enabled: true, isResting: true, notesInPhrase: 0 }),
            harmony: {
                enabled: true,
                complexity: 0.5,
                volume: 0.6,
                lastMidis: [],
                rhythmicMask: 0,
            },
            arranger: { timeSignature: '4/4' },
        };
        getState.mockReturnValue(mockState);
    });

    // Sorted pairwise interval (mod-12) between two voices.
    const dyadInterval = (midis) => {
        const s = [...midis].sort((a, b) => a - b);
        return (s[s.length - 1] - s[0]) % 12;
    };

    // All pairwise mod-12 intervals present in a voicing.
    const pairwiseIntervals = (midis) => {
        const ivs = new Set();
        for (let i = 0; i < midis.length; i++) {
            for (let j = i + 1; j < midis.length; j++) {
                ivs.add(Math.abs(midis[i] - midis[j]) % 12);
            }
        }
        return ivs;
    };
    const hasAny = (set, members) => members.some((m) => set.has(m));

    function runProgression(bars) {
        const emissions = [];
        for (let bar = 0; bar < bars; bar++) {
            const chord = PROG[bar % PROG.length];
            for (let s = 0; s < 16; s++) {
                const step = bar * 16 + s;
                const notes = getHarmonyNotes(getState(), chord, null, step, 64, 'smart', s, null, {
                    soloistResting: true,
                    soloistNotesInPhrase: 0,
                });
                if (notes.length > 0) {
                    emissions.push(notes.map((n) => n.midi));
                }
            }
        }
        return emissions;
    }

    it('plays harmonized 3rds/6ths (not triadic pads) at mid intensity', () => {
        mockState.playback.bandIntensity = 0.55;
        const emissions = runProgression(128);

        const dyads = emissions.filter((m) => m.length === 2);
        const harmonized = dyads.filter((m) => [3, 4, 8, 9].includes(dyadInterval(m)));
        const triads = emissions.filter((m) => new Set(m.map((x) => x % 12)).size >= 3);

        const dyadShare = dyads.length / emissions.length;
        const harmonizedShare = harmonized.length / dyads.length;
        const triadShare = triads.length / emissions.length;

        console.log(
            '\n--- ROCK HARMONY CRITIQUE REPORT (mid) ---\n' +
                `[Emissions]           ${emissions.length}\n` +
                `[2-Voice Dyad Share]  ${(dyadShare * 100).toFixed(1)}% (Target: high)\n` +
                `[3rd/6th Share]       ${(harmonizedShare * 100).toFixed(1)}% of dyads (Target: ~100%)\n` +
                `[Triad Share]         ${(triadShare * 100).toFixed(1)}% (Target: ~0%)\n` +
                '------------------------------------------\n',
        );

        // The harmony is a 2-voice harmonized line, not a 3-note triadic pad.
        expect(dyadShare).toBeGreaterThan(0.9);
        expect(harmonizedShare).toBeGreaterThan(0.9);
        expect(triadShare).toBeLessThan(0.05);
    });

    it('thickens to power-5th doubling at high intensity', () => {
        mockState.playback.bandIntensity = 0.82;
        const emissions = runProgression(128);

        // Power interval present: P5 (7) or its P4 inversion (5).
        const powered = emissions.filter((m) => hasAny(pairwiseIntervals(m), [5, 7]));
        // No 3rd anywhere in the voicing — the power chord omits the 3rd.
        const noThirds = emissions.filter((m) => !hasAny(pairwiseIntervals(m), [3, 4]));

        const poweredShare = powered.length / emissions.length;
        const noThirdShare = noThirds.length / emissions.length;

        console.log(
            '\n--- ROCK HARMONY CRITIQUE REPORT (high) ---\n' +
                `[Emissions]            ${emissions.length}\n` +
                `[Power-Interval Share] ${(poweredShare * 100).toFixed(1)}% (Target: ~100%)\n` +
                `[No-3rd Share]         ${(noThirdShare * 100).toFixed(1)}% (Target: ~100%)\n` +
                '-------------------------------------------\n',
        );

        // High-intensity rock harmony is a power chord — fifths, no 3rds.
        expect(poweredShare).toBeGreaterThan(0.9);
        expect(noThirdShare).toBeGreaterThan(0.9);
    });
});
