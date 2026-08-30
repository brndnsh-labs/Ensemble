// @ts-nocheck
// SWING RATIO AUDIT — the oracle for the per-genre swing model.
//
// Ensemble's swing engine (`calculateStepDuration`, groove-engine.ts) is sound: it
// maps a 0–100 `swing` knob linearly onto a tempo-preserving offset, anchored at the
// musically-correct endpoints — swing 0 = straight (1.000:1), swing 100 = a perfect
// 2:1 triplet. The risk was never the formula; it was the per-genre VALUES drifting
// on vibes with nothing to catch a mis-dial (e.g. Country shipped swing:60 on the
// 16th grid = a 1.5:1 laid-back-SIXTEENTHS lurch, wrong for a two-step).
//
// This test codifies the intended swing FEEL per genre as a measured onset-ratio band
// + the grid (sub) it lives on, and asserts the live engine produces it ON THE 4/4
// (16th-resolution, stepsPerBeat===4) grid — the path the canonical genre presets run.
// It is the reference table made executable: change a genre's swing/sub out of its
// idiomatic band and this fails. Bands carry headroom (the values are deterministic
// functions of swing/sub), not a flake margin.
//
// SCOPE (#1065): every live meter in TIME_SIGNATURES (config.ts) is stepsPerBeat 4
// (2/4, 3/4, 4/4, 5/4, 7/4) or stepsPerBeat 2 (6/8, 7/8, 12/8) — there is no
// stepsPerBeat===3 meter, so the old "===3" branch here was dead code that never
// matched anything, and 6/8/7/8/12/8 all silently ran ZERO swing (the branching
// matched neither `=== 4` nor the dead `=== 3`). The fix splits the stepsPerBeat:2
// group by `ts.isCompound`: 7/8 (not flagged compound) gets real swing — asserted
// below to hit the same 2:1 ratio as the working stepsPerBeat===4 case — while 6/8
// and 12/8 (`isCompound: true`) deliberately stay straight at any swing value,
// because their dotted-quarter pulse already notates the shuffle feel; a second
// swing interpretation on top would double it up. The Swing UI control is disabled
// for 6/8/12/8 (InstrumentSettings.tsx `GrooveControls`) to match.
//
// Ratio reference: 1.000 straight · ~1.1 light lilt · ~1.2 laid-back pocket ·
// ~1.5 medium swing · ~1.86 hard shuffle · 2.000 triplet (the swing=100 limit).
import { describe, expect, it } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { GENRE_NAMES, SMART_GENRES } from '../../public/data/smart-genres.js';
import { calculateStepDuration } from '../../public/engine/groove-engine.js';

// expectedSub: the grid the genre's swing should live on (only asserted for genres
//   that actually swing — at swing 0 the sub is inaudible). '8th' = swung eighths
//   (jazz/shuffle/country lilt); '16th' = laid-back sixteenths (funk/hip-hop/neo).
// band: [min, max] inclusive on the ACTIVE ratio (the ratio on `expectedSub`).
const SWING_SPEC: Record<
    string,
    { swung: boolean; expectedSub?: string; band: [number, number]; note: string }
> = {
    Rock: { swung: false, band: [1.0, 1.0], note: 'straight rock' },
    Disco: { swung: false, band: [1.0, 1.0], note: 'straight four-on-the-floor' },
    Bossa: { swung: false, band: [1.0, 1.0], note: 'straight 16ths (the clave is even)' },
    Metal: { swung: false, band: [1.0, 1.0], note: 'straight, driving' },
    'Ska-Punk': { swung: false, band: [1.0, 1.0], note: 'straight upstrokes' },
    Acoustic: { swung: true, expectedSub: '8th', band: [1.05, 1.2], note: 'light 8th lilt' },
    Funk: { swung: true, expectedSub: '16th', band: [1.05, 1.2], note: 'light laid-back 16ths' },
    Reggae: { swung: true, expectedSub: '16th', band: [1.05, 1.25], note: 'gentle one-drop swing' },
    Country: {
        swung: true,
        expectedSub: '8th',
        band: [1.12, 1.35],
        note: 'light 8th-note two-step lilt — NOT a heavy swing, and NOT on the 16th grid',
    },
    'Hip Hop': { swung: true, expectedSub: '16th', band: [1.1, 1.3], note: 'boom-bap 16th pocket' },
    'Neo-Soul': {
        swung: true,
        expectedSub: '16th',
        band: [1.15, 1.32],
        note: 'signature laid-back 16ths',
    },
    Jazz: { swung: true, expectedSub: '8th', band: [1.4, 1.65], note: 'medium 8th swing' },
    Blues: { swung: true, expectedSub: '8th', band: [1.72, 2.0], note: 'hard 8th shuffle' },
};

function ratios(swing: number, swingSub: string) {
    const ts = { stepsPerBeat: 4 }; // 16th-resolution grid (4 steps per beat)
    const d = [0, 1, 2, 3].map((s) => calculateStepDuration(s, 120, ts, { swing, swingSub }));
    return {
        // ratio of a swung 16th PAIR (sub:'16th') vs a swung 8th PAIR (sub:'8th').
        ratio16: d[0] / d[1],
        ratio8: (d[0] + d[1]) / (d[2] + d[3]),
    };
}

describe('Swing ratio audit (per-genre oracle)', () => {
    it('covers every canonical genre', () => {
        // Guards the canon ↔ spec from drifting: a new genre must get a swing band.
        for (const g of GENRE_NAMES) {
            expect(SWING_SPEC[g], `missing swing spec for genre "${g}"`).toBeDefined();
        }
        expect(Object.keys(SWING_SPEC).length).toBe(GENRE_NAMES.length);
    });

    it('every genre swing ratio sits in its idiomatic band', () => {
        const report: string[] = [];
        for (const g of GENRE_NAMES) {
            const sg = SMART_GENRES[g];
            const swing = sg.swing ?? 0;
            const sub = sg.sub ?? '16th';
            const spec = SWING_SPEC[g];
            const r = ratios(swing, sub);
            const active = sub === '16th' ? r.ratio16 : r.ratio8;
            report.push(
                `${g.padEnd(10)} swing=${String(swing).padStart(3)} sub=${sub.padEnd(4)} ` +
                    `ratio=${active.toFixed(3)} band=[${spec.band[0]},${spec.band[1]}] — ${spec.note}`,
            );

            if (!spec.swung) {
                // Deliberately straight — assert no swing at all (the dial is 0).
                expect(active, `${g} should be straight`).toBe(1.0);
                continue;
            }
            // Swung genres: on the right GRID, and the active ratio in its band.
            expect(sub, `${g} should swing on the ${spec.expectedSub} grid`).toBe(spec.expectedSub);
            expect(
                active,
                `${g} ratio ${active.toFixed(3)} outside ${JSON.stringify(spec.band)}`,
            ).toBeGreaterThanOrEqual(spec.band[0]);
            expect(
                active,
                `${g} ratio ${active.toFixed(3)} outside ${JSON.stringify(spec.band)}`,
            ).toBeLessThanOrEqual(spec.band[1]);
        }
        console.log(`\n=== SWING RATIO AUDIT ===\n${report.join('\n')}\n`);
    });

    it('the swing engine is anchored at the musically-correct endpoints', () => {
        // The contract that makes the 0–100 knob trustworthy, asserted directly so a
        // refactor of calculateStepDuration that breaks the model is caught here.
        const ts = { stepsPerBeat: 4 };
        const straight = [0, 1, 2, 3].map((s) =>
            calculateStepDuration(s, 120, ts, { swing: 0, swingSub: '8th' }),
        );
        // swing 0 → every step equal (straight).
        expect(straight[0]).toBeCloseTo(straight[1], 10);
        expect(straight[0]).toBeCloseTo(straight[2], 10);

        // swing 100 → a perfect 2:1 triplet on BOTH grids, tempo preserved.
        const r100_8 = ratios(100, '8th');
        const r100_16 = ratios(100, '16th');
        expect(r100_8.ratio8).toBeCloseTo(2.0, 6);
        expect(r100_16.ratio16).toBeCloseTo(2.0, 6);

        // Tempo preservation: a full beat (4 steps) sums to 4× the straight step,
        // regardless of swing — swing redistributes, never drifts the pulse.
        for (const [swing, sub] of [
            [60, '8th'],
            [90, '8th'],
            [30, '16th'],
        ] as const) {
            const beat = [0, 1, 2, 3].reduce(
                (acc, s) => acc + calculateStepDuration(s, 120, ts, { swing, swingSub: sub }),
                0,
            );
            expect(beat, `beat duration drifted at swing ${swing}/${sub}`).toBeCloseTo(
                4 * straight[0],
                8,
            );
        }
    });

    it('8th swing keeps each inner 16th evenly spaced within its own swung eighth (#1067)', () => {
        // The beat's two swung EIGHTH-note pulses are subIndex {0,1} (the "1"+"e")
        // and {2,3} (the "&"+"a"). Each pulse's own two 16ths must split evenly —
        // the "e"/"a" sits at the true midpoint of its swung eighth, not skewed
        // toward either end. Regression guard for the old [1.5, 0.5, -0.5, -1.5]
        // weights, which gave each pulse a 3:1 internal split (over-displacing the
        // inner 16th by an extra 50%) and sounded like a dotted-eighth + sixteenth
        // rather than a genuine shuffle, even though the OUTER 2:1 pulse-to-pulse
        // ratio (asserted above) happened to come out correct either way.
        const ts = { stepsPerBeat: 4 };
        for (const swing of [10, 30, 60, 100]) {
            const d = [0, 1, 2, 3].map((s) =>
                calculateStepDuration(s, 120, ts, { swing, swingSub: '8th' }),
            );
            expect(d[0], `swing ${swing}: "1"/"e" (first pulse) should split evenly`).toBeCloseTo(
                d[1],
                10,
            );
            expect(d[2], `swing ${swing}: "&"/"a" (second pulse) should split evenly`).toBeCloseTo(
                d[3],
                10,
            );
        }
    });
});

describe('Compound/odd meter swing (#1065)', () => {
    it('every live TIME_SIGNATURES entry has a stepsPerBeat calculateStepDuration actually handles', () => {
        // calculateStepDuration's swing switch is exhaustive over exactly stepsPerBeat
        // 4 and 2 — the only two values the real config table produces. If a future
        // meter introduces a third value without a new case, this fails loudly here
        // instead of the meter silently getting zero swing in production.
        for (const [name, ts] of Object.entries(TIME_SIGNATURES)) {
            expect([2, 4], `${name} has an unhandled stepsPerBeat: ${ts.stepsPerBeat}`).toContain(
                ts.stepsPerBeat,
            );
        }
    });

    it('7/8 swings — swing:100 produces the same 2:1 ratio as the working stepsPerBeat===4 case', () => {
        const ts = TIME_SIGNATURES['7/8'];
        expect(ts.isCompound).toBeFalsy(); // the signal calculateStepDuration branches on
        const d = [0, 1].map((s) =>
            calculateStepDuration(s, 120, ts, { swing: 100, swingSub: '16th' }),
        );
        expect(d[0] / d[1]).toBeCloseTo(2.0, 6);

        // Tempo preservation holds here too: a beat (2 steps at stepsPerBeat:2) sums
        // to 2× the straight step.
        const straightStep = calculateStepDuration(0, 120, ts, { swing: 0, swingSub: '16th' });
        expect(d[0] + d[1]).toBeCloseTo(2 * straightStep, 8);
    });

    it('6/8 and 12/8 stay straight (no swing) at any swing value — the meter already notates the shuffle', () => {
        for (const name of ['6/8', '12/8']) {
            const ts = TIME_SIGNATURES[name];
            expect(ts.isCompound, `${name} should be flagged isCompound`).toBe(true);
            const straightStep = calculateStepDuration(0, 120, ts, { swing: 0, swingSub: '16th' });
            for (const swing of [1, 25, 50, 75, 100]) {
                for (const swingSub of ['8th', '16th']) {
                    for (const step of [0, 1, 2, 3]) {
                        const d = calculateStepDuration(step, 120, ts, { swing, swingSub });
                        expect(
                            d,
                            `${name} step ${step} swing ${swing}/${swingSub} should stay straight`,
                        ).toBeCloseTo(straightStep, 10);
                    }
                }
            }
        }
    });
});
