/* eslint-disable */
/**
 * @vitest-environment happy-dom
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    applyConductor,
    checkSectionTransition,
    updateAutoConductor,
} from '../../../public/engine/conductor.js';
import { dispatch, getState } from '../../../public/state.js';

const { makeSoloistMock } = await vi.hoisted(
    async () => await import('../../utils/mock-soloist.js'),
);

vi.mock('../../../public/state.js', async (importOriginal) => {
    const actual = (await importOriginal()) as any;
    const { bass, chords, harmony, soloist } = await import('../../../public/state/instruments.js');
    const { groove } = await import('../../../public/state/groove.js');

    // Create distinct mock objects so we can control them
    const mockPlayback = { ...actual.playback };
    const mockArranger = { ...actual.arranger, sections: [] };
    const mockConductor = {
        targetIntensity: 0.35,
        stepSize: 0.0005,
        form: null,
        formIteration: 0,
    };
    const mockGroove = { ...groove };
    const mockSoloist = makeSoloistMock({ ...soloist });
    const mockHarmony = { ...harmony, enabled: false, buffer: new Map() };
    const mockChords = { ...chords };
    const mockBass = { ...bass };

    const mockStateMap = {
        playback: mockPlayback,
        arranger: mockArranger,
        conductor: mockConductor,
        groove: mockGroove,
        soloist: mockSoloist,
        harmony: mockHarmony,
        chords: mockChords,
        bass: mockBass,
    };

    return {
        ...actual,
        ...mockStateMap,
        stateMap: mockStateMap,
        getState: () => mockStateMap,
        dispatch: vi.fn((action, payload) => {
            if (action === 'SET_BAND_INTENSITY') {
                mockPlayback.bandIntensity = payload;
            } else if (action === 'UPDATE_CONDUCTOR_DECISION') {
                Object.assign(mockPlayback, payload); // Simplistic apply for testing
            } else if (action === 'UPDATE_CONDUCTOR_STATE') {
                Object.assign(mockConductor, payload);
            }
        }),
    };
});

vi.mock('../../../public/ui.js', () => ({
    ui: {
        intensitySlider: { value: 0 },
        densitySelect: { value: 'standard' },
    },
    triggerFlash: vi.fn(),
}));

vi.mock('../../../public/state/persistence.js', () => ({
    debounceSaveState: vi.fn(),
}));

vi.mock('../../../public/engine/fills.js', () => ({
    generateProceduralFill: vi.fn(() => ({})),
    generatePhrasePickup: vi.fn(() => ({ 2: [{ name: 'Snare', vel: 0.6 }] })),
}));

describe('Conductor Logic', () => {
    let arranger: any,
        playback: any,
        groove: any,
        soloist: any,
        conductor: any,
        chords: any,
        bass: any,
        harmony: any;

    beforeEach(() => {
        vi.clearAllMocks();
        const state = getState();
        arranger = state.arranger;
        playback = state.playback;
        groove = state.groove;
        soloist = state.soloist;
        chords = state.chords;
        bass = state.bass;
        harmony = state.harmony;
        conductor = state.conductor;

        playback.autoIntensity = true;
        playback.isPlaying = true;
        playback.bandIntensity = 0.35;
        playback.complexity = 0.5;
        playback.songMode = false;
        playback.isEndingPending = false;
        playback.sessionTimer = 0;
        playback.audio = null;

        conductor.targetIntensity = 0.5;
        conductor.stepSize = 0.01;
        conductor.formIteration = 0;

        groove.fillMap = null;
        groove.orchestrationMap = null;
        groove.seedTimelineStartStep = 0;
        arranger.totalSteps = 16;
        arranger.stepMap = [{ start: 0, end: 16, chord: { sectionId: 's1', sectionLabel: 'A' } }];
    });

    describe('applyConductor', () => {
        it('should dispatch density and velocity based on low intensity', () => {
            playback.bandIntensity = 0.2; // Low
            applyConductor(getState(), dispatch);
            expect(dispatch).toHaveBeenCalledWith(
                'UPDATE_CONDUCTOR_DECISION',
                expect.objectContaining({
                    density: 'thin',
                    velocity: expect.any(Number),
                }),
            );
        });

        it('should dispatch density based on high intensity', () => {
            playback.bandIntensity = 0.9; // High
            applyConductor(getState(), dispatch);
            expect(dispatch).toHaveBeenCalledWith(
                'UPDATE_CONDUCTOR_DECISION',
                expect.objectContaining({
                    density: 'rich',
                }),
            );
        });

        it('should push harmony complexity during final build in song mode', () => {
            playback.songMode = true;
            playback.sessionTimer = 5; // 5 mins
            playback.sessionStartTime = performance.now() - 4 * 60000; // 4 mins elapsed
            playback.isEndingPending = true;

            applyConductor(getState(), dispatch);

            expect(dispatch).toHaveBeenCalledWith(
                'UPDATE_HB',
                expect.objectContaining({
                    complexity: expect.any(Number), // Should be pushed to max(complexity, 0.85)
                }),
            );
        });

        it('does not write the retired bass.pocketOffset mirror param (#1063)', () => {
            // The old conductor block mirrored getBandPocket onto bass.pocketOffset;
            // nothing ever read it (lanes call getBandPocket directly — see
            // docs/design/timing-model.md §4), so the write was deleted.
            groove.genreFeel = 'Neo-Soul';
            applyConductor(getState(), dispatch);
            expect(dispatch).not.toHaveBeenCalledWith(
                'SET_PARAM',
                expect.objectContaining({ param: 'pocketOffset' }),
            );
        });

        it('should adjust master limiter without mutating instrument reverb', () => {
            playback.audio = { currentTime: 1.0 };
            const eqMock = () => ({
                type: '',
                frequency: { setTargetAtTime: vi.fn() },
                gain: { setTargetAtTime: vi.fn() },
            });
            const reverbSend = () => ({ gain: { setTargetAtTime: vi.fn() } });
            const bus = (extra = {}) => ({
                gain: { gain: { setTargetAtTime: vi.fn() } },
                reverb: reverbSend(),
                eq: eqMock(),
                panner: { pan: { setTargetAtTime: vi.fn() } },
                sidechain: null,
                ...extra,
            });
            playback.audioGraph = {
                master: {
                    gain: {},
                    saturator: {},
                    limiter: {
                        threshold: { setTargetAtTime: vi.fn() },
                        ratio: { setTargetAtTime: vi.fn() },
                        release: { setTargetAtTime: vi.fn() },
                    },
                    reverb: { applyPreset: vi.fn() },
                    reverbPreFilter: { frequency: { setTargetAtTime: vi.fn() } },
                },
                chords: bus(),
                bass: bus({ panner: null }),
                soloist: bus({ panner: null }),
                harmonies: bus(),
                drums: bus({ panner: null }),
            };
            chords.reverb = 0.31;
            bass.reverb = 0.07;
            soloist.reverb = 0.64;
            harmony.reverb = 0.42;
            groove.reverb = 0.18;
            playback.bandIntensity = 0.8;

            applyConductor(getState(), dispatch);

            const graph = playback.audioGraph;
            expect(graph.master.limiter.threshold.setTargetAtTime).toHaveBeenCalled();
            expect(graph.master.limiter.ratio.setTargetAtTime).toHaveBeenCalled();
            expect(graph.chords.reverb.gain.setTargetAtTime).not.toHaveBeenCalled();
            expect(graph.bass.reverb.gain.setTargetAtTime).not.toHaveBeenCalled();
            expect(graph.soloist.reverb.gain.setTargetAtTime).not.toHaveBeenCalled();
            expect(graph.harmonies.reverb.gain.setTargetAtTime).not.toHaveBeenCalled();
            expect(graph.drums.reverb.gain.setTargetAtTime).not.toHaveBeenCalled();
            expect(chords.reverb).toBe(0.31);
            expect(bass.reverb).toBe(0.07);
            expect(soloist.reverb).toBe(0.64);
            expect(harmony.reverb).toBe(0.42);
            expect(groove.reverb).toBe(0.18);
        });
    });

    describe('updateAutoConductor', () => {
        it('should ramp intensity towards target', () => {
            conductor.targetIntensity = 0.6;
            updateAutoConductor(getState(), dispatch);
            expect(playback.bandIntensity).toBeGreaterThan(0.35);
        });

        it('should use asymmetric ramping (faster builds, S8 inversion)', () => {
            // why: S8 inverted the prior 2.5×-down / 1.0×-up asymmetry to
            // 0.5×-down / 1.5×-up. Real bands lean into rises and ease out of
            // drops ("settle in and build"), not the other way around. The
            // prior asymmetry, combined with the random jitter at line 445/457,
            // created a structural pull toward floor that parked funk/neo-soul
            // backbeats below the Snare-vs-Sidestick gate. See
            // `docs/audit/epic-form-arrangement.md` S8.
            //
            // Sweep three random fixtures so the random-jitter line can't
            // silently mask a regression — the asymmetric inequality must
            // hold across the full jitter range, not just at the median.
            for (const r of [0.05, 0.5, 0.95]) {
                vi.spyOn(Math, 'random').mockReturnValue(r);

                // Test Build
                playback.bandIntensity = 0.35;
                conductor.targetIntensity = 0.7;
                conductor.stepSize = 0.01;
                updateAutoConductor(getState(), dispatch);
                const buildDiff = playback.bandIntensity - 0.35;

                // Test Drop
                playback.bandIntensity = 0.35;
                conductor.targetIntensity = 0.1; // Lower than 0.35 to ensure a drop
                updateAutoConductor(getState(), dispatch);
                const dropDiff = 0.35 - playback.bandIntensity;

                vi.restoreAllMocks();

                // Build should now be faster (multiplier 1.5 when target > intensity,
                // multiplier 0.5 when target < intensity).
                expect(buildDiff, `build should outpace drop at r=${r}`).toBeGreaterThan(dropDiff);
            }
        });
    });

    describe('checkSectionTransition', () => {
        it('should trigger a fill and update target energy at loop end', () => {
            for (const r of [0.05, 0.5, 0.95]) {
                vi.spyOn(Math, 'random').mockReturnValue(r);
                groove.enabled = true;
                conductor.formIteration = 0;
                checkSectionTransition(getState(), 0, 16, dispatch);
                vi.restoreAllMocks();
                expect(
                    conductor.formIteration,
                    `loop-end should advance formIteration at r=${r}`,
                ).toBeGreaterThan(0);
            }
        });

        it('should prefer seeded fills over procedural fallback when a drum plan is present', () => {
            groove.enabled = true;
            groove.fillMap = {
                0: { steps: { 0: [{ name: 'Snare', vel: 0.9 }] }, length: 16, crash: false },
            };
            groove.orchestrationMap = [
                { start: 0, end: 16, energyLevel: 0.3 },
                { start: 16, end: 32, energyLevel: 0.7 },
            ];
            groove.seedTimelineStartStep = 0;
            arranger.totalSteps = 32;
            arranger.stepMap = [
                { start: 0, end: 16, chord: { sectionId: 's1', sectionLabel: 'Verse' } },
                { start: 16, end: 32, chord: { sectionId: 's2', sectionLabel: 'Chorus' } },
            ];
            arranger.sections = [
                { id: 's1', seamless: false },
                { id: 's2', seamless: false },
            ];

            checkSectionTransition(getState(), 0, 16, dispatch);

            expect(dispatch).toHaveBeenCalledWith('TRIGGER_FILL', {
                steps: { 0: [{ name: 'Snare', vel: 0.9 }] },
                startStep: 0,
                length: 16,
                crash: false,
            });
        });

        it('produces a reproducible macro-arc target (seeded jitter, #793)', () => {
            // #793: the per-section and loop-end energy jitter is now seeded
            // (createPRNG on formIteration / currentLoopCount) instead of raw
            // Math.random, so the open-jam energy arc is reproducible run-to-run
            // rather than acquiring non-repeatable drift. (The old assertion here
            // mocked Math.random to pin the jitter; that mock is now dead.) Drive
            // the open-jam fill path and confirm the same form-cycle yields the
            // identical target on every pass.
            groove.enabled = true;
            groove.fillMap = null;
            groove.orchestrationMap = null;
            playback.sessionStartTime = 0; // open-jam arc, not the session-timer arc
            playback.autoIntensity = true;
            arranger.totalSteps = 16;
            arranger.stepMap = [
                { start: 0, end: 16, chord: { sectionId: 's1', sectionLabel: 'Verse' } },
            ];
            arranger.sections = [{ id: 's1', seamless: false }];
            conductor.form = null;

            const runCycle = (iteration) => {
                conductor.formIteration = iteration;
                checkSectionTransition(getState(), 0, 16, dispatch);
                return conductor.targetIntensity;
            };

            // Same form-cycle → byte-identical target on every pass (was a fresh
            // Math.random draw each time before #793).
            const first = runCycle(2);
            expect(runCycle(2), 'cycle 2 reproduces exactly').toBe(first);
            expect(runCycle(2), 'cycle 2 reproduces again').toBe(first);
            expect(Number.isFinite(first)).toBe(true);
        });

        it('should apply Local Functional Roles when form analysis is present', () => {
            for (const r of [0.05, 0.5, 0.95]) {
                vi.spyOn(Math, 'random').mockReturnValue(r);
                groove.enabled = true;
                conductor.formIteration = 4; // Peak cycle, allows high ceiling
                arranger.totalSteps = 32;

                arranger.stepMap = [
                    { start: 0, end: 16, chord: { sectionId: 's1', sectionLabel: 'Verse' } },
                    { start: 16, end: 32, chord: { sectionId: 's2', sectionLabel: 'Chorus' } },
                ];
                arranger.sections = [
                    { id: 's1', seamless: false },
                    { id: 's2', seamless: false },
                ];

                conductor.form = {
                    sections: [{ id: 's2', role: 'Peak', flux: 3.0, iteration: 2 }],
                };

                // Transitioning from s1 -> s2
                checkSectionTransition(getState(), 0, 16, dispatch);

                // Expected target energy should be influenced by 'Peak' role and high flux
                expect(conductor.targetIntensity, `peak role at r=${r}`).toBeGreaterThan(0.6);

                // Test other roles for coverage — must intersect with analyzeForm's
                // emitted vocabulary (Intro/Outro/Peak/Main Theme/Theme B/Bridge/
                // Variation/Refrain/Build).
                const roles = [
                    'Intro',
                    'Outro',
                    'Main Theme',
                    'Theme B',
                    'Bridge',
                    'Variation',
                    'Refrain',
                    'Build',
                ];
                for (const role of roles) {
                    conductor.form.sections[0].role = role;
                    checkSectionTransition(getState(), 0, 16, dispatch);
                    expect(conductor.targetIntensity, `${role} at r=${r}`).toBeGreaterThan(0);
                }

                vi.restoreAllMocks();
            }
        });

        it('should generate a groove seed on section transition', () => {
            groove.enabled = true;
            groove.sectionSeedMap = {};
            playback.autoIntensity = true;

            arranger.stepMap = [
                { start: 0, end: 16, chord: { sectionId: 's1', sectionLabel: 'A' } },
                { start: 16, end: 32, chord: { sectionId: 's2', sectionLabel: 'B' } },
            ];
            arranger.sections = [{ id: 's1' }, { id: 's2' }];
            arranger.totalSteps = 32;

            checkSectionTransition(getState(), 0, 16, dispatch);

            expect(dispatch).toHaveBeenCalledWith(
                'SET_GROOVE_SEED',
                expect.objectContaining({
                    sectionId: 's2',
                    seed: expect.any(Number),
                }),
            );
        });

        it('should suppress fills if the next section is seamless', () => {
            groove.enabled = true;
            arranger.stepMap = [
                { start: 0, end: 16, chord: { sectionId: 's1', sectionLabel: 'Verse' } },
                { start: 16, end: 32, chord: { sectionId: 's2', sectionLabel: 'Chorus' } },
            ];
            arranger.totalSteps = 32;
            arranger.sections = [
                { id: 's1', seamless: false },
                { id: 's2', seamless: true }, // Target has seamless flag
            ];

            checkSectionTransition(getState(), 0, 16, dispatch);
            expect(dispatch).not.toHaveBeenCalledWith('TRIGGER_FILL', expect.anything());
        });

        it('should trigger harmonic anticipation (ghost kick) at the end of a chord', () => {
            groove.enabled = true;
            groove.fillActive = false;
            playback.bandIntensity = 0.5;
            arranger.totalSteps = 32;
            arranger.stepMap = [
                { start: 0, end: 16, chord: { sectionId: 's1' } },
                { start: 16, end: 32, chord: { sectionId: 's2' } },
            ];

            // Step 15 is the very last step of the first chord (end: 16)
            checkSectionTransition(getState(), 15, 16, dispatch);

            expect(dispatch).toHaveBeenCalledWith(
                'TRIGGER_FILL',
                expect.objectContaining({
                    steps: expect.anything(), // Verification of the anticipation fill
                }),
            );
        });
    });

    describe('within-section phrase pickup', () => {
        // An 8-bar section (one chord/section spanning the whole loop) so the
        // bar-4 phrase boundary is interior, not the section's last bar.
        const setupLongSection = (genreFeel = 'Rock') => {
            groove.enabled = true;
            groove.genreFeel = genreFeel;
            groove.fillActive = false;
            groove.fillMap = null;
            groove.orchestrationMap = null;
            playback.bandIntensity = 0.8;
            arranger.totalSteps = 128;
            arranger.timeSignature = '4/4';
            arranger.stepMap = [
                { start: 0, end: 128, chord: { sectionId: 's1', sectionLabel: 'A' } },
            ];
            arranger.sectionMap = [{ id: 's1', start: 0, end: 128, label: 'A' }];
        };

        const triggerFillCalls = () =>
            (dispatch as any).mock.calls.filter((c: any[]) => c[0] === 'TRIGGER_FILL');

        it('fires a no-crash last-beat pickup at an interior 4-bar phrase boundary', () => {
            setupLongSection();
            // modStep 48 = start of bar 4 (barInSection 3 → phrase end, not section end).
            checkSectionTransition(getState(), 48, 16, dispatch);

            const fills = triggerFillCalls();
            expect(fills).toHaveLength(1);
            const payload = fills[0][1];
            expect(payload.crash).toBe(false);
            expect(payload.length).toBe(4); // stepsPerBeat in 4/4
            expect(payload.startStep).toBe(60); // 48 + (16 - 4): lands on the last beat
        });

        it('does NOT pick up on a non-phrase-boundary bar', () => {
            setupLongSection();
            // modStep 16 = start of bar 2 (barInSection 1 → not a phrase end).
            checkSectionTransition(getState(), 16, 16, dispatch);
            expect(triggerFillCalls()).toHaveLength(0);
        });

        it('does NOT pick up on the section/loop-final bar (transition fill owns it)', () => {
            setupLongSection();
            // modStep 112 = start of bar 8, the last bar (barInSection 7 = measuresInSection-1).
            // The loop-end transition fill fires here (crash:true, full bar); assert the
            // interior pickup signature (crash:false) is NOT among the dispatched fills.
            checkSectionTransition(getState(), 112, 16, dispatch);
            const pickups = triggerFillCalls().filter((c: any[]) => c[1].crash === false);
            expect(pickups).toHaveLength(0);
        });

        it('respects the quiet-section intensity floor', () => {
            setupLongSection();
            playback.bandIntensity = 0.4; // below the 0.45 pickup floor
            checkSectionTransition(getState(), 48, 16, dispatch);
            expect(triggerFillCalls()).toHaveLength(0);
        });

        it('does NOT pick up in brush/sidestick genres (Jazz, Reggae, Bossa)', () => {
            for (const genre of ['Jazz', 'Reggae', 'Bossa Nova']) {
                vi.clearAllMocks();
                setupLongSection(genre);
                checkSectionTransition(getState(), 48, 16, dispatch);
                expect(triggerFillCalls(), `${genre} should suppress the pickup`).toHaveLength(0);
            }
        });

        it('DOES pick up in snare-backbeat genres (Rock, Funk, Country)', () => {
            for (const genre of ['Rock', 'Funk', 'Country']) {
                vi.clearAllMocks();
                setupLongSection(genre);
                checkSectionTransition(getState(), 48, 16, dispatch);
                expect(triggerFillCalls(), `${genre} should allow the pickup`).toHaveLength(1);
            }
        });
    });
});
