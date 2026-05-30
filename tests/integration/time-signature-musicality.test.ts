// @ts-nocheck
import { describe, expect, it } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { applyGrooveOverrides } from '../../public/engine/groove-engine.js';
import { generateSessionSeed } from '../../public/engine/soloist-seeder.js';
import { getStepInfo, getStepsPerMeasure } from '../../public/utils.js';
import { makeSoloistMock } from '../utils/mock-soloist.js';

describe('Time Signature Musicality Audit', () => {
    const genres = ['Jazz', 'Rock', 'Funk'];
    const signatures = Object.keys(TIME_SIGNATURES);

    const createMockState = (tsName: string) => {
        const ts = (TIME_SIGNATURES as any)[tsName];
        const spm = getStepsPerMeasure(tsName);
        const totalSteps = spm * 16; // 16 bars
        return {
            soloist: makeSoloistMock({
                enabled: true,
                busySteps: 0,
                phraseContext: { role: 'call', profile: 'srv' },
            }),
            arranger: {
                timeSignature: tsName,
                sectionMap: [{ start: 0, end: totalSteps, label: 'Verse' }],
                totalSteps: totalSteps,
                stepMap: Array.from({ length: totalSteps }, (_, i) => ({
                    start: i,
                    end: i + 1,
                    chord: {
                        rootMidi: 60,
                        intervals: [0, 4, 7],
                        beats: ts.beats,
                        quality: 'major',
                    },
                })),
            },
            playback: { bandIntensity: 0.5, currentLoopCount: 0 },
            groove: {
                genreFeel: 'Rock',
                instruments: [
                    { name: 'Kick' },
                    { name: 'Snare' },
                    { name: 'HiHat' },
                    { name: 'Open' },
                ],
            },
        };
    };

    signatures.forEach((tsName) => {
        describe(`Signature: ${tsName}`, () => {
            const ts = (TIME_SIGNATURES as any)[tsName];
            const spm = getStepsPerMeasure(tsName);

            it('should have correct pulses defined', () => {
                expect(ts.pulse).toBeDefined();
                expect(ts.pulse.length).toBeGreaterThan(0);
                // Pulses should be within measure bounds
                ts.pulse.forEach((p: any) => {
                    expect(p).toBeLessThan(spm);
                });
            });

            it('should place backbeats on valid beats', () => {
                if (ts.backbeat) {
                    ts.backbeat.forEach((bbIndex: any) => {
                        expect(bbIndex).toBeLessThan(ts.beats);
                    });
                }
            });

            genres.forEach((genre) => {
                it(`should maintain pulse adherence for ${genre} drums`, () => {
                    const state = createMockState(tsName);
                    state.groove.genreFeel = genre;
                    const kickHits = [];

                    for (let step = 0; step < spm; step++) {
                        const stepInfo = getStepInfo(step, ts, [], TIME_SIGNATURES);
                        const res = applyGrooveOverrides(state as any, {
                            step,
                            inst: { name: 'Kick' },
                            stepVal: 0,
                            playback: state.playback,
                            groove: state.groove,
                            ...stepInfo,
                        });
                        if (res.shouldPlay) {
                            kickHits.push(step);
                        }
                    }

                    // Kick should at least hit the downbeat (step 0) or follow pulse
                    // (Some genres like Reggae might be exceptions but we're testing Jazz/Rock/Funk)
                    if (genre !== 'Reggae') {
                        expect(kickHits).toContain(0);
                    }
                });

                it(`should generate a non-empty dynamic head for ${genre}`, () => {
                    const state = createMockState(tsName);
                    const seed = generateSessionSeed(
                        state as any,
                        state.arranger,
                        genre.toLowerCase(),
                        0.5,
                        `TEST_SEED_${tsName}`,
                    );

                    expect(seed.notes.length).toBeGreaterThan(0);
                    // The seeder unrolls to 128 bars by default (see soloist-seeder.js unrollArrangement call)
                    const expectedSteps = spm * 128;
                    expect(seed.loopLengthSteps).toBe(expectedSteps);
                });
            });

            it('should have consistent StepInfo properties', () => {
                for (let step = 0; step < spm; step++) {
                    const stepInfo = getStepInfo(step, ts, [], TIME_SIGNATURES);
                    expect(stepInfo.mStep).toBe(step);
                    expect(stepInfo.beatIndex).toBeLessThan(ts.beats);

                    if (ts.isCompound) {
                        expect(stepInfo.isCompound).toBe(true);
                        expect(stepInfo.groupIndex).toBeDefined();
                    }
                }
            });
        });
    });
});
