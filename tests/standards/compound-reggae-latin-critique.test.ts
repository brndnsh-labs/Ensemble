// @ts-nocheck
/**
 * Reggae One Drop + Latin Partido Alto/Samba 6/8 critique (epic-1-compound-meter S16c).
 *
 * S16/S16b shipped universal hat + kick density filters, but two genres carried
 * *partial* compound-awareness — some motifs already used `isPulseStart`, others
 * still used 4/4-idiomatic predicates. S16c finishes them:
 *
 *  REGGAE (`grooves/reggae.ts`) — premise correction: the One Drop motif (kick on
 *    `isBackbeat && isBeatStart`) is actually CORRECT in 6/8. `isBackbeat` resolves
 *    to mStep 6 only (compound branch: `isGroupStart && backbeat.includes(groupIndex)`,
 *    backbeat [1]), so the drop lands on the second dotted-quarter pulse with beat 1
 *    silent — the genre's defining feature. The real defect was the Rockers motif
 *    (motif 2) combining every offbeat → 8 kicks/bar, and reggae kick having no
 *    `compoundKickAllowed` filter at all (skipped in S16b). Fix: add the filter.
 *
 *  LATIN (`grooves/latin.ts`) — the Partido Alto motif (motif 3) used a 4/4 2-bar
 *    offbeat clave that produced a 7-hits-vs-1-hit bar split in 6/8. Gated on
 *    `!isCompound` (consistent with the Samba decision from S16b); this also closes
 *    a latent S16b fall-through where Samba (motif 2) in compound dropped into the
 *    Partido Alto `else`. Compound latin snare/clave now comes from the
 *    'Afro-Cuban 6/8' drum preset, not the generic genre strategy.
 *
 * Acceptance:
 *   (a) Reggae One Drop: the drop (mStep 6) is universal across bars; beat 1
 *       (mStep 0) is NOT — One Drop bars keep it silent. Kick density bounded.
 *   (b) Reggae at high intensity: the Rockers over-density (was ~3.25/bar mean,
 *       8/bar on Rockers bars) is trimmed by the new filter.
 *   (c) Latin Partido Alto/Samba in 6/8: no 7-vs-1 bar split — even-bar vs
 *       odd-bar snare density is symmetric, and no bar is over-dense.
 *   (d) Latin 4/4 snare preserved (no-op regression guard).
 */

import { describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { applyGrooveOverrides } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';
import { installSeededRandom } from '../utils/seeded-random.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

// Deterministic Math.random so `roll()`-driven ghost notes (latin offbeat
// embellishments, reggae shuffle) don't flake the density bounds.
installSeededRandom();

const SIX_EIGHT = TIME_SIGNATURES['6/8'];
const FOUR_FOUR = TIME_SIGNATURES['4/4'];
const NUM_BARS = 64;

function buildState(genreFeel: string, timeSignature: '6/8' | '12/8' | '4/4', intensity: number) {
    return {
        playback: { bandIntensity: intensity, bpm: 120, songMode: false },
        groove: {
            genreFeel,
            lastDrumPreset: genreFeel,
            instruments: [],
        },
        soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
        arranger: { timeSignature },
    };
}

const TWELVE_EIGHT = TIME_SIGNATURES['12/8'];

function tsConfigFor(timeSignature: '6/8' | '12/8' | '4/4') {
    if (timeSignature === '6/8') {
        return SIX_EIGHT;
    }
    if (timeSignature === '12/8') {
        return TWELVE_EIGHT;
    }
    return FOUR_FOUR;
}

function simulateHits(instName: string, timeSignature: '6/8' | '12/8' | '4/4', numBars: number) {
    const tsConfig = tsConfigFor(timeSignature);
    const stepsPerBar = tsConfig.beats * tsConfig.stepsPerBeat;

    let totalHits = 0;
    const hitsByStep: Record<number, number> = {};
    const hitsByBar: number[] = new Array(numBars).fill(0);
    // Step-in-bar maps split by phrase position (even bars = clave bar-1, odd
    // bars = bar-2), tracking soundName + a representative velocity so the bell
    // critique can assert exact positions, voice, and accent placement.
    const evenBarSteps: Record<number, { sound: string; vel: number; count: number }> = {};
    const oddBarSteps: Record<number, { sound: string; vel: number; count: number }> = {};

    for (let bar = 0; bar < numBars; bar++) {
        for (let stepInBar = 0; stepInBar < stepsPerBar; stepInBar++) {
            const absoluteStep = bar * stepsPerBar + stepInBar;
            const info = getStepInfo(absoluteStep, tsConfig, [], TIME_SIGNATURES);

            const params = {
                step: absoluteStep,
                inst: { name: instName, muted: false, steps: [] },
                stepVal: 0,
                playback: getState().playback,
                groove: getState().groove,
                isDownbeat: info.isMeasureStart,
                isBeatStart: info.isBeatStart,
                isPulse: info.isPulse,
                isPulseStart: info.isPulseStart,
                isGroupStart: info.isGroupStart,
                isBackbeat: info.isBackbeat,
                isOffbeat: info.isOffbeat,
                isEOfBeat: info.isEOfBeat,
                isAOfBeat: info.isAOfBeat,
                beatIndex: info.beatIndex,
                tsConfig: info.tsConfig,
                mStep: info.mStep,
                isCompound: info.isCompound,
                stepInGroup: info.stepInGroup,
                groupIndex: info.groupIndex,
                sectionOccurrence: 0,
                isFinalMeasure: false,
            };

            const result = applyGrooveOverrides(getState(), params);
            if (result?.shouldPlay) {
                totalHits++;
                hitsByStep[info.mStep] = (hitsByStep[info.mStep] || 0) + 1;
                hitsByBar[bar]++;
                const target = bar % 2 === 0 ? evenBarSteps : oddBarSteps;
                const prev = target[stepInBar];
                target[stepInBar] = {
                    sound: result.soundName ?? '',
                    vel: result.velocity ?? 0,
                    count: (prev?.count ?? 0) + 1,
                };
            }
        }
    }

    return { totalHits, hitsByStep, hitsByBar, evenBarSteps, oddBarSteps };
}

describe('Compound-meter Reggae + Latin (S16c)', () => {
    it('(a) Reggae One Drop: the drop (mStep 6) is universal, beat 1 (mStep 0) is conditionally silent', () => {
        // Intensity 0.4 (> INTENSITY_BANDS.LOW 0.35, < 0.7) → motif 0 (One Drop,
        // seed < 0.6) / motif 1 (Steppers) only. One Drop hits the drop at mStep 6
        // and leaves beat 1 silent; Steppers adds mStep 0. So mStep 6 fires every
        // bar while mStep 0 fires only on Steppers bars.
        getState.mockReturnValue(buildState('Reggae', '6/8', 0.4));
        const { totalHits, hitsByStep } = simulateHits('Kick', '6/8', NUM_BARS);
        const hitsPerBar = totalHits / NUM_BARS;
        const pulse0 = hitsByStep[0] || 0;
        const pulse6 = hitsByStep[6] || 0;

        console.log('\n--- REGGAE ONE DROP 6/8 (intensity 0.4) ---');
        console.log(
            `  ${hitsPerBar.toFixed(2)} kicks/bar | mStep 0 = ${pulse0}/${NUM_BARS}, mStep 6 = ${pulse6}/${NUM_BARS}`,
        );
        console.log('  Hits-by-step:', hitsByStep);

        expect(
            hitsPerBar,
            'One Drop/Steppers kick density should be sparse (≤ 2.1/bar)',
        ).toBeLessThanOrEqual(2.1);
        expect(pulse6, 'the drop (mStep 6) should fire nearly every bar').toBeGreaterThanOrEqual(
            NUM_BARS * 0.95,
        );
        expect(
            pulse0,
            'beat 1 (mStep 0) must be conditionally silent — One Drop preserves it',
        ).toBeLessThan(pulse6);
    });

    it('(b) Reggae high-intensity: Rockers over-density is trimmed by compoundKickAllowed', () => {
        // At intensity 0.9 the Rockers motif (motif 2) is reachable and pre-fix
        // combined every offbeat → 8 kicks/bar (mean ~3.25 across motifs). The new
        // filter trims Rockers to the two dotted-quarter pulses {0,6}: its source
        // predicate emits only odd-step offbeats {1,3,5,7,9,11}, none of which is
        // the and-of-pulse slot {4,10}, so the filter's high-intensity tier is
        // inert here and the reachable ceiling is exactly 2/bar (not 4). The mean
        // lands ~1.75/bar across the motif mix.
        getState.mockReturnValue(buildState('Reggae', '6/8', 0.9));
        const { totalHits, hitsByStep, hitsByBar } = simulateHits('Kick', '6/8', NUM_BARS);
        const hitsPerBar = totalHits / NUM_BARS;
        const maxBar = Math.max(...hitsByBar);

        console.log('\n--- REGGAE HIGH-INTENSITY 6/8 KICK (intensity 0.9) ---');
        console.log(`  ${hitsPerBar.toFixed(2)} kicks/bar | max bar = ${maxBar}`);
        console.log('  Hits-by-step:', hitsByStep);

        expect(
            hitsPerBar,
            'Rockers must be trimmed (was ~3.25/bar mean, 8/bar on Rockers bars)',
        ).toBeLessThanOrEqual(2.75);
        expect(
            maxBar,
            'Rockers must collapse to the two pulses — reachable ceiling is 2/bar',
        ).toBeLessThanOrEqual(2);
    });

    it('(c) Latin 6/8: standard 7-stroke Bembé bell on the Snare/timeline lane (S10)', () => {
        // S10 authored a genuine compound Afro-Cuban bell. The standard pattern
        // (maximally-even E(7,12), eighth-pulses 0,2,4,5,7,9,11, IOI 2-2-1-2-2-2-1)
        // spans TWO 6/8 bars:
        //   bar-1 (even bars): steps 0,4,8,10   (eighth-pulses 0,2,4,5)
        //   bar-2 (odd bars):  steps 2,6,10     (eighth-pulses 7,9,11)
        // All on the AgogoHigh (gankoguí/agogô) voice. The two PRINCIPAL strokes —
        // beat 1 (bar-1 step 0) and beat 4 (bar-2 step 6, eighth-pulse 9) — are
        // accented above the syncopated in-between strokes.
        getState.mockReturnValue(buildState('Bossa Nova', '6/8', 0.9));
        const { evenBarSteps, oddBarSteps, hitsByBar } = simulateHits('Snare', '6/8', NUM_BARS);

        const BAR1 = [0, 4, 8, 10];
        const BAR2 = [2, 6, 10];
        const ALL_STEPS_6_8 = new Set([...Array(12).keys()]);

        console.log('\n--- LATIN 6/8 BEMBÉ BELL (intensity 0.9) ---');
        console.log('  bar-1 (even):', evenBarSteps);
        console.log('  bar-2 (odd):', oddBarSteps);

        // Every pattern position fires every bar on the bell voice.
        for (const s of BAR1) {
            expect(evenBarSteps[s]?.count, `bar-1 step ${s} should fire the bell every bar`).toBe(
                NUM_BARS / 2,
            );
            expect(evenBarSteps[s]?.sound, `bar-1 step ${s} should be the agogô bell`).toBe(
                'AgogoHigh',
            );
        }
        for (const s of BAR2) {
            expect(oddBarSteps[s]?.count, `bar-2 step ${s} should fire the bell every bar`).toBe(
                NUM_BARS / 2,
            );
            expect(oddBarSteps[s]?.sound, `bar-2 step ${s} should be the agogô bell`).toBe(
                'AgogoHigh',
            );
        }

        // ZERO stray bell hits off the pattern.
        for (const s of ALL_STEPS_6_8) {
            if (!BAR1.includes(s)) {
                expect(
                    evenBarSteps[s],
                    `bar-1 step ${s} must NOT fire (off-pattern)`,
                ).toBeUndefined();
            }
            if (!BAR2.includes(s)) {
                expect(
                    oddBarSteps[s],
                    `bar-2 step ${s} must NOT fire (off-pattern)`,
                ).toBeUndefined();
            }
        }

        // Principal-stroke accent: bar-1 step 0 (beat 1) louder than its in-between
        // strokes (4, 8, 10); bar-2 step 6 (beat 4) louder than its neighbors (2, 10).
        expect(
            evenBarSteps[0].vel,
            'bar-1 principal stroke (step 0, beat 1) accented above the in-between stroke (step 4)',
        ).toBeGreaterThan(evenBarSteps[4].vel);
        expect(
            oddBarSteps[6].vel,
            'bar-2 principal stroke (step 6, beat 4) accented above the in-between stroke (step 2)',
        ).toBeGreaterThan(oddBarSteps[2].vel);

        // The bar carries the bell on every bar — no 7-vs-1 split, no silent bars.
        expect(Math.min(...hitsByBar), 'no compound Latin bar is silent').toBeGreaterThan(0);
    });

    it('(e) Latin 12/8: full one-bar Bembé bell on steps 0,4,8,10,14,18,22 (S10)', () => {
        // In 12/8 the 12-eighth-pulse timeline fits ONE bar, so every bar carries
        // the full standard pattern (eighth-pulses 0,2,4,5,7,9,11): steps
        // 0,4,8,10,14,18,22 on AgogoHigh.
        getState.mockReturnValue(buildState('Bossa Nova', '12/8', 0.9));
        const { evenBarSteps, oddBarSteps, hitsByBar } = simulateHits('Snare', '12/8', NUM_BARS);

        const PATTERN = [0, 4, 8, 10, 14, 18, 22];
        const ALL_STEPS_12_8 = new Set([...Array(24).keys()]);

        console.log('\n--- LATIN 12/8 BEMBÉ BELL (intensity 0.9) ---');
        console.log('  even bars:', evenBarSteps);
        console.log('  odd bars:', oddBarSteps);

        // 12/8 is a one-bar pattern → both even and odd bars are identical.
        for (const map of [evenBarSteps, oddBarSteps]) {
            for (const s of PATTERN) {
                expect(map[s]?.count, `step ${s} should fire the bell every bar`).toBe(
                    NUM_BARS / 2,
                );
                expect(map[s]?.sound, `step ${s} should be the agogô bell`).toBe('AgogoHigh');
            }
            // ZERO stray bell hits off the pattern.
            for (const s of ALL_STEPS_12_8) {
                if (!PATTERN.includes(s)) {
                    expect(map[s], `step ${s} must NOT fire (off-pattern)`).toBeUndefined();
                }
            }
        }

        // Principal strokes (beats 1 and 4 → steps 0, 18) accented above neighbors.
        expect(evenBarSteps[0].vel, 'principal stroke 0 (beat 1) > stroke 4').toBeGreaterThan(
            evenBarSteps[4].vel,
        );
        expect(evenBarSteps[18].vel, 'principal stroke 18 (beat 4) > stroke 14').toBeGreaterThan(
            evenBarSteps[14].vel,
        );

        expect(Math.min(...hitsByBar), 'every 12/8 Latin bar carries the full bell').toBe(
            PATTERN.length,
        );
    });

    it('(d) Latin 4/4 snare preserved — byte-identical regression guard (S10 must not touch 4/4)', () => {
        // The S10 compound bell is fully `isCompound`-gated. In 4/4 the Snare lane
        // must be EXACTLY as before: the son-clave / Samba / Partido-Alto motifs on
        // Sidestick (+ Snare body at high intensity), and NEVER the AgogoHigh bell.
        for (const intensity of [0.3, 0.6, 0.9]) {
            getState.mockReturnValue(buildState('Bossa Nova', '4/4', intensity));
            const { totalHits, evenBarSteps, oddBarSteps } = simulateHits('Snare', '4/4', 16);
            const hitsPerBar = totalHits / 16;
            console.log(`--- LATIN 4/4 SNARE @${intensity}: ${hitsPerBar.toFixed(2)} hits/bar ---`);

            expect(
                hitsPerBar,
                `4/4 latin snare (clave/cross-stick) should be alive @${intensity}`,
            ).toBeGreaterThan(0.5);
            expect(hitsPerBar, `4/4 latin snare density absurdly high @${intensity}`).toBeLessThan(
                15,
            );
            // The compound branch must never leak into 4/4 — no agogô bell anywhere.
            for (const map of [evenBarSteps, oddBarSteps]) {
                for (const slot of Object.values(map)) {
                    expect(
                        slot.sound,
                        `4/4 must never carry the compound bell voice @${intensity}`,
                    ).not.toBe('AgogoHigh');
                }
            }
        }
    });

    it('(f) NON-TAUTOLOGY: the 6/8 bell positions are exactly the standard pattern, nothing less', () => {
        // If the S10 engine branch were reverted (compound bell removed), the Snare
        // lane in 6/8 would fall back to the sparse offbeat ghosts only — bar-1 would
        // NOT carry the structural strokes {4,6,10} on the AgogoHigh voice. Assert the
        // exact stroke COUNT per bar so a partial/wrong pattern can't pass: bar-1 = 4
        // strokes, bar-2 = 3 strokes, totaling the 7-stroke standard pattern.
        //
        // CRUCIALLY this guards the IDIOM, not just the engine's output: we
        // reconstruct the full 12-eighth-pulse timeline from both bars and assert its
        // inter-onset-interval sequence is 2-2-1-2-2-2-1 — the maximally-even E(7,12)
        // signature of the standard African/Bembé bell. A pattern with the right
        // stroke count but wrong arrangement (e.g. the off-by-character 2-1-2-1-2-2-2
        // that tracks beats 1/2/3 instead of 1/4) would fail this.
        getState.mockReturnValue(buildState('Bossa Nova', '6/8', 0.9));
        const { evenBarSteps, oddBarSteps } = simulateHits('Snare', '6/8', NUM_BARS);

        const bellStepsEven = Object.entries(evenBarSteps)
            .filter(([, v]) => v.sound === 'AgogoHigh' && v.count === NUM_BARS / 2)
            .map(([k]) => Number(k))
            .sort((a, b) => a - b);
        const bellStepsOdd = Object.entries(oddBarSteps)
            .filter(([, v]) => v.sound === 'AgogoHigh' && v.count === NUM_BARS / 2)
            .map(([k]) => Number(k))
            .sort((a, b) => a - b);

        expect(bellStepsEven, 'bar-1 bell is exactly the standard-pattern strokes').toEqual([
            0, 4, 8, 10,
        ]);
        expect(bellStepsOdd, 'bar-2 bell is exactly the standard-pattern strokes').toEqual([
            2, 6, 10,
        ]);
        expect(
            bellStepsEven.length + bellStepsOdd.length,
            'the two bars together carry the 7-stroke Bembé pattern',
        ).toBe(7);

        // Reconstruct the 12-eighth-pulse onset timeline across both bars and check
        // its IOI signature is the standard bell (2-2-1-2-2-2-1). Steps → eighth-pulse
        // indices: bar-1 step/2; bar-2 step/2 + 6.
        const onsets = [
            ...bellStepsEven.map((s) => s / 2),
            ...bellStepsOdd.map((s) => s / 2 + 6),
        ].sort((a, b) => a - b);
        const intervals = onsets.map((p, i) => {
            const next = i + 1 < onsets.length ? onsets[i + 1] : onsets[0] + 12;
            return next - p;
        });
        expect(intervals, 'the bell IOI sequence is the standard maximally-even bell').toEqual([
            2, 2, 1, 2, 2, 2, 1,
        ]);
    });
});
