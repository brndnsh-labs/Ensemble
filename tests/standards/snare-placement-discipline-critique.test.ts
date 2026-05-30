// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { applyGrooveOverrides } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

// Guards the snare-placement discipline added for the drum audit: the soloist
// "snare-stab" accent (drum-seeder.ts) is applied at velocity 1.2 — as loud as
// the backbeat — at the soloist's peak step, with no beat-position guard. On the
// downbeat it reads as an "early snare"; a 16th from a backbeat it reads as "two
// snares in a row". The discipline (groove-engine.ts, shared isBackbeatAdjacentStep)
// refuses the loud snare in those spots while keeping it for genuine syncopations.
//
// This file is the companion to snare-creativity-integrity.test.ts, which checks
// the soloist-OFF ghost density. Here the SOLOIST IS ENABLED and we inject
// snare-stab accents directly, so the accent path is actually exercised.
describe('Snare Placement Discipline', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    // A snare at/above this velocity reads as a deliberate hit (backbeat ≈ 1.2,
    // accent = 1.2). Blues ghosts top out at scaleVelocity(0.35, 0.8, 0.1) = 0.43,
    // so 0.6 cleanly separates "loud" catches from shuffle ghosting.
    const LOUD = 0.6;
    const ts44 = TIME_SIGNATURES['4/4'];

    // The 16ths flanking beats 2 & 4 (3,5 and 11,13) plus the downbeat (0): a LOUD
    // snare here is the "early snare" / "two snares in a row" the owner reported.
    const DISCIPLINE_STEPS = [0, 3, 5, 11, 13];
    // Syncopations in open space (the "ands") — a snare-stab catch here is musical.
    const OPEN_OFFBEATS = [2, 6, 10];

    const makeState = (accentMap) => ({
        playback: { bandIntensity: 0.8, bpm: 90, songMode: false, currentLoopCount: 2 },
        groove: {
            genreFeel: 'Blues',
            lastDrumPreset: 'Blues',
            instruments: [],
            seedTimelineStartStep: 0,
            accentMap,
        },
        arranger: { timeSignature: '4/4', stepMap: [] },
        soloist: makeSoloistMock({ enabled: true, busySteps: 0 }),
    });

    // Run `numBars` of Blues with a soloist snare-stab accent injected at the given
    // in-bar steps every bar; tally LOUD snare hits (velocity ≥ LOUD) by in-bar step.
    const tallyLoudSnares = (accentInBarSteps, numBars) => {
        const accentMap = {};
        for (let bar = 0; bar < numBars; bar++) {
            for (const s of accentInBarSteps) {
                accentMap[bar * 16 + s] = { type: 'snare-stab', velocity: 1.2 };
            }
        }
        const state = makeState(accentMap);
        getState.mockReturnValue(state);

        const loudByStep = new Array(16).fill(0);
        for (let bar = 0; bar < numBars; bar++) {
            for (let step = 0; step < 16; step++) {
                const globalStep = bar * 16 + step;
                const info = getStepInfo(globalStep, ts44, [], TIME_SIGNATURES);
                const result = applyGrooveOverrides(getState(), {
                    step: globalStep,
                    inst: { name: 'Snare', muted: false, steps: [] },
                    stepVal: 0,
                    playback: state.playback,
                    groove: state.groove,
                    isDownbeat: info.isMeasureStart,
                    isBeatStart: info.isBeatStart,
                    isBackbeat: info.isBackbeat,
                    isGroupStart: info.isGroupStart,
                    beatIndex: info.beatIndex,
                    isOffbeat: info.isOffbeat,
                    isEOfBeat: info.isEOfBeat,
                    isAOfBeat: info.isAOfBeat,
                    tsConfig: info.tsConfig,
                });
                if (result.shouldPlay && result.velocity >= LOUD) {
                    loudByStep[step]++;
                }
            }
        }
        return loudByStep;
    };

    it('suppresses the loud snare-stab on the downbeat and backbeat-flanking 16ths', () => {
        const numBars = 64;
        // Accent on EVERY step so the gate is exercised at all 16 positions.
        const loud = tallyLoudSnares([...Array(16).keys()], numBars);

        console.log(
            '[Snare Discipline] loud snares/bar by step (accent on every step):\n' +
                loud.map((c, s) => `  step ${s}: ${(c / numBars).toFixed(2)}`).join('\n'),
        );

        for (const s of DISCIPLINE_STEPS) {
            // The disciplined positions must never carry a loud snare, even though
            // the soloist peaked there — the backbeat owns that pocket.
            expect(loud[s]).toBe(0);
        }
    });

    it('still lands a snare-stab on syncopations in open space (the "ands")', () => {
        const numBars = 64;
        const loud = tallyLoudSnares(OPEN_OFFBEATS, numBars);

        for (const s of OPEN_OFFBEATS) {
            // Musicality floor: catching a syncopated peak with a snare is the whole
            // point of the accent — the discipline must not over-suppress it.
            expect(loud[s]).toBe(numBars);
        }
    });

    it('never stacks a loud snare a 16th before/after the backbeat (no "two in a row")', () => {
        const numBars = 32;
        // Peaks land on the 16th before beat 2 (step 3) and after beat 4 (step 13).
        const loud = tallyLoudSnares([3, 13], numBars);

        // The flanking accents are refused...
        expect(loud[3]).toBe(0);
        expect(loud[13]).toBe(0);
        // ...so only the backbeats themselves land — a clean single, not a double.
        expect(loud[4]).toBe(numBars);
        expect(loud[12]).toBe(numBars);
    });
});
