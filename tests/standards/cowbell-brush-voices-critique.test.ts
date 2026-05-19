// @ts-nocheck
/**
 * Cowbell + Brush Voices Critique — drums-idiom/S2
 *
 * Verifies the fixes for drums.md P0 #3 and P1 #7:
 *
 * 1. Disco motif 3 ("Octave Cowbells") emits CowbellHigh / CowbellLow on the
 *    `Perc` lane at high intensity + high section seed. Previously these names
 *    routed to a missing synth voice (silent).
 * 2. Jazz at intensity < 0.35 + BPM < 130 routes the Snare lane to a new
 *    `Brush` voice (was Sidestick, which has none of the brush sweep character).
 * 3. KNOWN_SOUND_NAMES registry contains both new voices, so the
 *    `maybeWarnUnknownSound` runtime check does not false-warn on them.
 * 4. KNOWN_SOUND_NAMES registry contains every legacy voice name the codebase
 *    is currently emitting (smoke-test of the warning helper).
 *
 * Reliability: run with
 *   for i in $(seq 1 5); do npx vitest run tests/standards/cowbell-brush-voices-critique.test.ts 2>&1 | grep -E "FAIL|Tests"; done
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { applyGrooveOverrides } from '../../public/engine/groove-engine.js';
import { KNOWN_SOUND_NAMES } from '../../public/engine/synth-drums.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function runStep(step: number, instName: string, mockState: any) {
    const tsConfig = TIME_SIGNATURES['4/4'];
    const info = getStepInfo(step, tsConfig, [], TIME_SIGNATURES);
    const params = {
        step,
        inst: { name: instName, muted: false, steps: [] },
        stepVal: 0,
        playback: mockState.playback,
        groove: mockState.groove,
        isDownbeat: info.isMeasureStart,
        isBeatStart: info.isBeatStart,
        isBackbeat: info.isBackbeat,
        isOffbeat: info.isOffbeat,
        isEOfBeat: info.isEOfBeat,
        isAOfBeat: info.isAOfBeat,
        isPulse: info.isPulse,
        isPulseStart: info.isPulseStart,
        isGroupStart: info.isGroupStart,
        beatIndex: info.beatIndex,
        tsConfig: info.tsConfig,
        mStep: info.mStep ?? 0,
        isCompound: false,
        stepInGroup: 0,
        groupIndex: 0,
    };
    return applyGrooveOverrides(mockState, params);
}

function makeDiscoState(opts: { intensity: number; bpm?: number } = { intensity: 0.95 }) {
    return {
        playback: {
            bandIntensity: opts.intensity,
            bpm: opts.bpm ?? 120,
            songMode: false,
        },
        groove: {
            genreFeel: 'Disco',
            creativity: true,
            lastDrumPreset: 'Disco',
            instruments: [],
            accentMap: null,
            sectionSeedMap: {},
            orchestrationMap: null,
            fillMap: null,
            seedTimelineStartStep: 0,
        },
        soloist: {
            enabled: false,
            session: { phrasing: { busySteps: 0 } },
        },
        arranger: {
            timeSignature: '4/4',
            sectionMap: [{ start: 0, end: 16 * 64 }],
            stepMap: [],
            totalSteps: 16 * 64,
        },
    };
}

function makeJazzState(opts: { intensity: number; bpm: number }) {
    return {
        playback: {
            bandIntensity: opts.intensity,
            bpm: opts.bpm,
            songMode: false,
        },
        groove: {
            genreFeel: 'Jazz',
            creativity: true,
            lastDrumPreset: 'Jazz',
            instruments: [],
            accentMap: null,
            sectionSeedMap: {},
            orchestrationMap: null,
            fillMap: null,
            seedTimelineStartStep: 0,
        },
        soloist: {
            enabled: false,
            session: { phrasing: { busySteps: 0 } },
        },
        arranger: {
            timeSignature: '4/4',
            sectionMap: [{ start: 0, end: 16 * 64 }],
            stepMap: [],
            totalSteps: 16 * 64,
        },
    };
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('Cowbell + Brush Voices Critique', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    // -----------------------------------------------------------------------
    // 1. KNOWN_SOUND_NAMES registry contract
    // -----------------------------------------------------------------------
    describe('KNOWN_SOUND_NAMES registry', () => {
        it('contains the new CowbellHigh, CowbellLow, and Brush voices', () => {
            expect(KNOWN_SOUND_NAMES.has('CowbellHigh')).toBe(true);
            expect(KNOWN_SOUND_NAMES.has('CowbellLow')).toBe(true);
            expect(KNOWN_SOUND_NAMES.has('Brush')).toBe(true);
        });

        it('contains every primary voice the engine emits', () => {
            // why: smoke-test for the audit `KNOWN_SOUND_NAMES` warning helper. If a future
            // refactor renames a voice (e.g. 'HiHat' → 'ClosedHat') without updating this set,
            // the warning would spam the console on every live drum hit. Keep this list in
            // sync with the dispatcher in synth-drums.ts:playDrumSound.
            const primary = [
                'Kick',
                'Snare',
                'Sidestick',
                'HiHat',
                'Open',
                'Ride',
                'Crash',
                'Clave',
                'Guiro',
                'Shaker',
                'Perc',
                'CowbellHigh',
                'CowbellLow',
                'Brush',
            ];
            for (const name of primary) {
                expect(
                    KNOWN_SOUND_NAMES.has(name),
                    `KNOWN_SOUND_NAMES should include "${name}"`,
                ).toBe(true);
            }
        });
    });

    // -----------------------------------------------------------------------
    // 2. Disco — motif 3 emits Cowbell hits on the Perc lane
    // -----------------------------------------------------------------------
    describe('Disco motif 3 (Octave Cowbells)', () => {
        it('emits CowbellHigh / CowbellLow on the Perc lane at high intensity', () => {
            const mockState = makeDiscoState({ intensity: 0.95 });
            getState.mockReturnValue(mockState);

            // Simulate enough bars to land on multiple motif-3 sections.
            // sectionSeed formula (groove-engine.ts:178) cycles every ~32 bars;
            // at intensity 0.95 + seed >= 0.8 disco.getMotif returns 3.
            const numBars = 64;
            const stepsPerBar = 16;
            const cowbellHits: { step: number; sound: string }[] = [];

            for (let bar = 0; bar < numBars; bar++) {
                for (let s = 0; s < stepsPerBar; s++) {
                    const result = runStep(bar * stepsPerBar + s, 'Perc', mockState);
                    if (
                        result.shouldPlay &&
                        (result.soundName === 'CowbellHigh' || result.soundName === 'CowbellLow')
                    ) {
                        cowbellHits.push({ step: bar * stepsPerBar + s, sound: result.soundName });
                    }
                }
            }

            const highHits = cowbellHits.filter((h) => h.sound === 'CowbellHigh').length;
            const lowHits = cowbellHits.filter((h) => h.sound === 'CowbellLow').length;

            console.log(
                `\n--- DISCO COWBELL CRITIQUE ---\n` +
                    `Total cowbell hits: ${cowbellHits.length} over ${numBars} bars\n` +
                    `  CowbellHigh: ${highHits}\n` +
                    `  CowbellLow:  ${lowHits}\n` +
                    `------------------------------\n`,
            );

            // why: at intensity 0.95, the deterministic sectionSeed formula
            // produces seed > 0.8 (motif-3) on roughly 5-7 of every 32 bars. At 8 eighth
            // notes per bar that yields 40+ cowbell hits across 64 bars. Threshold of 20
            // catches the lane firing while tolerating seed-distribution variance.
            expect(cowbellHits.length).toBeGreaterThan(20);
            // Both names should appear — they alternate by beatIndex inside motif 3.
            expect(highHits).toBeGreaterThan(0);
            expect(lowHits).toBeGreaterThan(0);
        });

        it('does NOT emit Cowbell at low intensity (motif locked to 0)', () => {
            const mockState = makeDiscoState({ intensity: 0.3 });
            getState.mockReturnValue(mockState);

            let cowbellHits = 0;
            for (let bar = 0; bar < 32; bar++) {
                for (let s = 0; s < 16; s++) {
                    const result = runStep(bar * 16 + s, 'Perc', mockState);
                    if (
                        result.shouldPlay &&
                        (result.soundName === 'CowbellHigh' || result.soundName === 'CowbellLow')
                    ) {
                        cowbellHits++;
                    }
                }
            }
            console.log(`[Disco low-intensity] Cowbell hits over 32 bars: ${cowbellHits}`);
            // why: disco.getMotif returns 0 when intensity < INTENSITY_BANDS.LOW (0.35).
            // No motif-3 path, so the cowbell lane should be silent.
            expect(cowbellHits).toBe(0);
        });
    });

    // -----------------------------------------------------------------------
    // 3. Jazz — brush texture below intensity 0.35 at slow tempo
    // -----------------------------------------------------------------------
    describe('Jazz brush texture (low intensity + slow tempo)', () => {
        it('routes the Snare lane to Brush at intensity 0.25, BPM 90', () => {
            const mockState = makeJazzState({ intensity: 0.25, bpm: 90 });
            getState.mockReturnValue(mockState);

            const numBars = 64;
            let brushHits = 0;
            let sidestickHits = 0;
            let snareFullHits = 0;
            let totalSnareLaneHits = 0;

            for (let bar = 0; bar < numBars; bar++) {
                for (let s = 0; s < 16; s++) {
                    const result = runStep(bar * 16 + s, 'Snare', mockState);
                    if (result.shouldPlay) {
                        totalSnareLaneHits++;
                        if (result.soundName === 'Brush') {
                            brushHits++;
                        } else if (result.soundName === 'Sidestick') {
                            sidestickHits++;
                        } else if (result.soundName === 'Snare') {
                            snareFullHits++;
                        }
                    }
                }
            }

            console.log(
                `\n--- JAZZ BRUSH CRITIQUE (intensity=0.25, bpm=90) ---\n` +
                    `Total Snare-lane hits over ${numBars} bars: ${totalSnareLaneHits}\n` +
                    `  Brush:     ${brushHits}\n` +
                    `  Sidestick: ${sidestickHits}\n` +
                    `  Snare:     ${snareFullHits}\n` +
                    `Brush share: ${
                        totalSnareLaneHits > 0
                            ? ((brushHits / totalSnareLaneHits) * 100).toFixed(1)
                            : '0'
                    }%\n` +
                    `--------------------------------------------------\n`,
            );

            // why: at intensity 0.25 + bpm 90, every snare lane hit that survives the
            // motif gating should route to Brush. The intensity-band gate is in jazz.ts
            // (intensity < 0.35 && bpm < 130). The whole point of the audit fix is that
            // Brush must be the dominant texture, not just non-zero — observed share is
            // ~100% with comfortable headroom. Assert > 0.95 share so a regression that
            // lets even 5% slip through to Sidestick fails this test.
            expect(brushHits).toBeGreaterThan(0);
            expect(totalSnareLaneHits).toBeGreaterThan(20);
            expect(brushHits / totalSnareLaneHits).toBeGreaterThan(0.95);
            // No full-crack snare in brush territory
            expect(snareFullHits).toBe(0);
        });

        it('does NOT route to Brush at fast bebop tempo (BPM >= 130)', () => {
            const mockState = makeJazzState({ intensity: 0.25, bpm: 180 });
            getState.mockReturnValue(mockState);

            let brushHits = 0;
            let sidestickHits = 0;

            for (let bar = 0; bar < 32; bar++) {
                for (let s = 0; s < 16; s++) {
                    const result = runStep(bar * 16 + s, 'Snare', mockState);
                    if (result.shouldPlay) {
                        if (result.soundName === 'Brush') {
                            brushHits++;
                        } else if (result.soundName === 'Sidestick') {
                            sidestickHits++;
                        }
                    }
                }
            }

            console.log(
                `[Jazz fast-tempo bebop] Brush: ${brushHits}, Sidestick: ${sidestickHits} ` +
                    `(BPM 180 must stay on Sidestick)`,
            );
            // why: bebop tempos need the crisp rhythmic placement of sidestick;
            // brush sweep smears at high BPM. Gate must hold.
            expect(brushHits).toBe(0);
        });

        it('does NOT route to Brush at higher intensity (>= 0.35)', () => {
            const mockState = makeJazzState({ intensity: 0.5, bpm: 90 });
            getState.mockReturnValue(mockState);

            let brushHits = 0;
            for (let bar = 0; bar < 32; bar++) {
                for (let s = 0; s < 16; s++) {
                    const result = runStep(bar * 16 + s, 'Snare', mockState);
                    if (result.shouldPlay && result.soundName === 'Brush') {
                        brushHits++;
                    }
                }
            }

            console.log(
                `[Jazz mid-intensity] Brush: ${brushHits} (intensity 0.5 should stay off Brush)`,
            );
            expect(brushHits).toBe(0);
        });
    });
});
