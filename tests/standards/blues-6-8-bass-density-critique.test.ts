/**
 * Critique: Blues-genre walking bass in 6/8 (All Blues via the Blues smart-genre).
 *
 * The Blues smart-genre maps the bass to style `'blues'` and `feel: 'Blues'`
 * (smart-genres.ts), NOT to the jazz `'quarter'` / `'Jazz'` pair the
 * compound-meter cycle (S12) tuned. Before §C.85 the `'blues'` style fell to
 * its 4/4 shuffle gate, whose `isQuarter` (= `isBeatStart`) fires on every
 * eighth in 6/8 (mStep 0,2,4,6,8,10 → 6+ onsets/bar) — a running line, not the
 * spare hypnotic All Blues vamp. The fix routes the compound case through the
 * same dotted-quarter walking gate as jazz, so an All Blues progression has the
 * same density whether the user picks Jazz or Blues genre.
 *
 * This guards the density contract (onset count + pulse coverage). The pitch
 * picker is shared with the jazz compound path (covered by
 * all-blues-6-8-critique.test.ts).
 */
import { describe, expect, it } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { isBassActive } from '../../public/engine/bass-engine.js';
import { getStepInfo } from '../../public/utils.js';

const SIX_EIGHT = '6/8';
const STEPS_PER_BAR = 12; // 6 beats × stepsPerBeat 2
const NUM_BARS = 16;
const NUM_SEEDS = 30; // reliability loop over currentLoopCount

function makeBluesState(bandIntensity: number, currentLoopCount: number) {
    return {
        playback: {
            bandIntensity,
            bpm: 60,
            complexity: 0.5,
            currentLoopCount,
        },
        groove: { genreFeel: 'Blues', lastDrumPreset: 'Blues Shuffle' },
        arranger: { timeSignature: SIX_EIGHT },
    } as any;
}

/**
 * Drive isBassActive with the Blues smart-genre's actual bass style ('blues')
 * across NUM_BARS × NUM_SEEDS and return onset stats.
 */
function measure(bandIntensity: number) {
    let totalOnsets = 0;
    const onsetsByStep = new Array(STEPS_PER_BAR).fill(0);
    const perBarCounts: number[] = [];

    for (let seed = 0; seed < NUM_SEEDS; seed++) {
        const state = makeBluesState(bandIntensity, seed);
        for (let bar = 0; bar < NUM_BARS; bar++) {
            let barOnsets = 0;
            for (let mStep = 0; mStep < STEPS_PER_BAR; mStep++) {
                const step = bar * STEPS_PER_BAR + mStep;
                const info = getStepInfo(step, SIX_EIGHT, [], TIME_SIGNATURES);
                if (isBassActive(state, 'blues', step, mStep, info)) {
                    totalOnsets++;
                    barOnsets++;
                    onsetsByStep[mStep]++;
                }
            }
            perBarCounts.push(barOnsets);
        }
    }

    const bars = NUM_BARS * NUM_SEEDS;
    return {
        onsetsPerBar: totalOnsets / bars,
        onsetsByStep,
        maxBar: Math.max(...perBarCounts),
        bars,
    };
}

describe('Blues 6/8 bass density (§C.85)', () => {
    it('moderate intensity (0.7): spare walking line, pulses anchored, not every-eighth', () => {
        const m = measure(0.7);

        console.log('\n[Blues 6/8 bass @ 0.7]');
        console.log(`  onsets/bar: ${m.onsetsPerBar.toFixed(2)} (target ∈ [2, 4])`);
        console.log(`  by mStep:   ${JSON.stringify(m.onsetsByStep)}`);
        console.log(`  maxBar:     ${m.maxBar}`);

        // Pulses (mStep 0, 6) are the dotted-quarter spine — always fire.
        expect(m.onsetsByStep[0]).toBe(m.bars);
        expect(m.onsetsByStep[6]).toBe(m.bars);

        // The bug was 6+ onsets/bar (a note on every eighth). A spare walking
        // waltz sits at ~2 pulses + ~1 pickup ≈ 3/bar.
        expect(m.onsetsPerBar).toBeGreaterThanOrEqual(2);
        expect(m.onsetsPerBar).toBeLessThanOrEqual(4);

        // No bar should hit the running-line density (6 = every eighth).
        expect(m.maxBar).toBeLessThanOrEqual(5);

        // Off-pulse, off-pickup, off-approach steps stay silent: the odd
        // 16th-grid offbeats (mStep 1,3,5,7,9,11) must never fire in compound
        // walking (those are the 4/4-shuffle lope positions we routed away).
        for (const odd of [1, 3, 5, 7, 9, 11]) {
            expect(m.onsetsByStep[odd]).toBe(0);
        }
    });

    it('low intensity (0.4): pulse-only — the bass just marks the changes', () => {
        const m = measure(0.4);
        console.log(`\n[Blues 6/8 bass @ 0.4] onsets/bar: ${m.onsetsPerBar.toFixed(2)}`);
        // At/below 0.5 the gate is pulse-only: exactly the two dotted-quarter pulses.
        expect(m.onsetsPerBar).toBeCloseTo(2, 1);
        expect(m.onsetsByStep[0]).toBe(m.bars);
        expect(m.onsetsByStep[6]).toBe(m.bars);
    });

    it('high intensity (0.85): pickups + occasional approach, still not a running line', () => {
        const m = measure(0.85);
        console.log(`\n[Blues 6/8 bass @ 0.85] onsets/bar: ${m.onsetsPerBar.toFixed(2)}`);
        // Pickups likely (0.8) + approach occasional (0.3) — denser, but tamed
        // to ~4.2/bar (was ~5), bounded well below the 6/bar running line.
        expect(m.onsetsPerBar).toBeGreaterThan(3);
        expect(m.onsetsPerBar).toBeLessThanOrEqual(4.6);
    });
});
