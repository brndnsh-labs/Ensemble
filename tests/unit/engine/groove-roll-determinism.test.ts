// @ts-nocheck
/**
 * #790: `roll()` (the genre strategies' ghost/decoration die) used raw
 * `Math.random()`, so a looped bar re-rolled every pass and never settled. It
 * now draws `scrambleHash(rollSeed(context, salt))`, seeded off the tick's
 * (barIndex, sectionId, loopStep, inst.name). This guard proves the seam is
 * reproducible: two identical passes through `applyGrooveOverrides` produce
 * byte-identical drum output. Before the fix this test would flake on every
 * roll-gated step.
 */
import { describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../../public/config.js';
import { applyGrooveOverrides } from '../../../public/engine/groove-engine.js';
import { getState } from '../../../public/state.js';
import { getStepInfo } from '../../../public/utils.js';
import { sectionSweepArranger } from '../../utils/groove-seed.js';

vi.mock('../../../public/state.js', () => ({ getState: vi.fn() }));

const LANES = ['Kick', 'Snare', 'HiHat', 'Open', 'Tom1'];

// Roll-heavy genres at high intensity — exercises the most roll() branches.
const GENRES = ['Rock', 'Funk', 'Jazz', 'Blues'];

function runPass(genre, numBars) {
    const mockState = {
        playback: { bandIntensity: 0.85, bpm: 110, songMode: false },
        groove: { genreFeel: genre, lastDrumPreset: genre, instruments: [] },
        soloist: { enabled: false, session: { phrasing: { busySteps: 0 } } },
        arranger: sectionSweepArranger(numBars),
    };
    getState.mockReturnValue(mockState);

    const out = [];
    for (let bar = 0; bar < numBars; bar++) {
        for (let step = 0; step < 16; step++) {
            const absStep = bar * 16 + step;
            const info = getStepInfo(absStep, TIME_SIGNATURES['4/4'], [], TIME_SIGNATURES);
            for (const name of LANES) {
                const r = applyGrooveOverrides(getState(), {
                    step: absStep,
                    inst: { name, muted: false, steps: [] },
                    stepVal: 0,
                    playback: mockState.playback,
                    groove: mockState.groove,
                    isDownbeat: info.isMeasureStart,
                    isPulse: info.isPulse,
                    isPulseStart: info.isPulseStart,
                    isBeatStart: info.isBeatStart,
                    isBackbeat: info.isBackbeat,
                    isGroupStart: info.isGroupStart,
                    isOffbeat: info.isOffbeat,
                    isEOfBeat: info.isEOfBeat,
                    isAOfBeat: info.isAOfBeat,
                    beatIndex: info.beatIndex,
                    tsConfig: info.tsConfig,
                });
                // #790 gates `shouldPlay` (and routes `soundName`); velocity
                // still carries #792's unseeded `Math.random` micro-jitter in
                // some genres, so it is deliberately excluded here — this guard
                // isolates the roll() determinism #790 owns.
                out.push(`${r.shouldPlay ? 1 : 0}:${r.soundName}`);
            }
        }
    }
    return out.join('|');
}

describe('Groove roll() determinism (#790)', () => {
    for (const genre of GENRES) {
        it(`${genre}: two identical passes produce byte-identical drum output`, () => {
            const a = runPass(genre, 8);
            const b = runPass(genre, 8);
            expect(a).toBe(b);
        });
    }

    it('the seeded path actually fires roll-gated hits (guard is not vacuous)', () => {
        // If roll() never fired, the test above would pass trivially. Confirm the
        // high-intensity Rock pass contains decoration hits beyond the bare spine.
        const pass = runPass('Rock', 8);
        const hits = pass.split('|').filter((c) => c.startsWith('1:')).length;
        expect(hits).toBeGreaterThan(8 * 4); // more than ~4 structural hits/bar
    });
});
