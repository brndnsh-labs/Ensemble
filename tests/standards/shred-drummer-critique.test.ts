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

describe('Shred Drummer Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    const simulatePerformance = (numBars, stateOverrides = {}) => {
        const mockState = {
            playback: { bandIntensity: 0.9, bpm: 180, songMode: false },
            groove: {
                genreFeel: 'Shred',
                creativity: true,
                lastDrumPreset: 'Shred',
                instruments: [],
            },
            soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
            ...stateOverrides,
        };
        getState.mockReturnValue(mockState);

        const history = [];
        for (let bar = 0; bar < numBars; bar++) {
            const barSteps = [];
            for (let step = 0; step < 16; step++) {
                const stepData = { step: bar * 16 + step, loopStep: step, instruments: {} };
                for (const instName of ['Kick', 'Snare', 'HiHat', 'Open']) {
                    const info = getStepInfo(
                        bar * 16 + step,
                        TIME_SIGNATURES['4/4'],
                        [],
                        TIME_SIGNATURES,
                    );
                    const params = {
                        step: bar * 16 + step,
                        inst: { name: instName, muted: false, steps: [] },
                        stepVal: 0,
                        playback: mockState.playback,
                        groove: mockState.groove,
                        isDownbeat: info.isMeasureStart,
                        isBeatStart: info.isBeatStart,
                        isBackbeat: info.isBackbeat,
                        isGroupStart: info.isGroupStart,
                        beatIndex: info.beatIndex,
                        isOffbeat: info.isOffbeat,
                        isEOfBeat: info.isEOfBeat,
                        isAOfBeat: info.isAOfBeat,
                        tsConfig: info.tsConfig,
                    };
                    const result = applyGrooveOverrides(getState(), params);
                    if (result.shouldPlay && result.soundName === instName) {
                        stepData.instruments[instName] = {
                            velocity: result.velocity,
                            sound: result.soundName,
                            offset: result.instTimeOffset,
                        };
                    }
                }
                barSteps.push(stepData);
            }
            history.push(barSteps);
        }
        return history;
    };

    it('should pass an authenticity critique for a 128-bar Shred performance', () => {
        // Shred delegates to the Metal engine (shred.ts:6-13). Verify the aliased
        // engine still delivers metal-quality density and backbeat at intensity 0.95.
        const numBars = 128;
        const performance = simulatePerformance(numBars, {
            playback: { bandIntensity: 0.95 },
            groove: { creativity: true, genreFeel: 'Shred' },
        });

        let kickHits = 0;
        let backbeatHits = 0;
        let blastBars = 0;

        performance.forEach((bar) => {
            let snareKickLocks = 0;
            bar.forEach((stepData) => {
                const s = stepData.loopStep;
                if ((s === 4 || s === 12) && stepData.instruments.Snare) {
                    backbeatHits++;
                }
                if (stepData.instruments.Kick) {
                    kickHits++;
                    if (stepData.instruments.Snare) {
                        snareKickLocks++;
                    }
                }
            });
            if (snareKickLocks >= 4) {
                blastBars++;
            }
        });

        const totalBars = performance.length;
        const kickDensity = kickHits / totalBars;

        console.log('\n--- SHRED DRUMMER CRITIQUE REPORT ---');
        console.log(
            `[Kick Density (Double Bass)] ${kickDensity.toFixed(2)} kicks/bar (Target: >12)`,
        );
        console.log(`[Backbeat (non-blast bars)]  ${backbeatHits} hits over ${totalBars} bars`);
        console.log(`[Blast Bars]                 ${blastBars}/${totalBars} (Target: >30)`);
        console.log('-------------------------------------\n');

        // Metal motifs 3-4 fire continuous 16th kicks at intensity 0.95 → ~14-15/bar.
        // Prior threshold > 6 left 8pt of unused headroom.
        expect(kickDensity).toBeGreaterThan(12);
        // Blast Beat motif (4) overrides backbeat with eighth-note snare. Across
        // 128 bars expect ~50 blast bars and ~78 non-blast bars. Backbeat lane fires
        // on every non-blast bar's steps 4 and 12 → ~156 hits. Floor accounts for
        // motif distribution variance.
        expect(backbeatHits).toBeGreaterThan(120);
        // Blast beat threshold same as metal — engine should select motif 4 at high
        // intensity often enough to register.
        expect(blastBars).toBeGreaterThan(30);
    });

    it('should increase kick density monotonically with intensity (Metal alias)', () => {
        const lowPerf = simulatePerformance(64, { playback: { bandIntensity: 0.3 } });
        const highPerf = simulatePerformance(64, { playback: { bandIntensity: 0.95 } });

        const kickCount = (perf) => {
            let h = 0;
            perf.forEach((b) => b.forEach((s) => s.instruments.Kick && h++));
            return h;
        };

        const lowK = kickCount(lowPerf);
        const highK = kickCount(highPerf);
        console.log(
            `[Shred Intensity] Kicks 0.3=${lowK} → 0.95=${highK}, ratio: ${(highK / (lowK || 1)).toFixed(2)}x`,
        );
        // Metal motif 0 fires kick on every beat + & of 3 (5/16). Motif 3/4 fire on
        // every 16th. Expected ratio ~3.2x. Conservative threshold 2x.
        expect(highK).toBeGreaterThan(lowK * 2);
    });
});
