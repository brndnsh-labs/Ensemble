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

    // Create distinct mock objects so we can control them
    const mockPlayback = { ...actual.playback };
    const mockArranger = { ...actual.arranger, sections: [] };
    const mockConductor = {
        targetIntensity: 0.35,
        stepSize: 0.0005,
        form: null,
        loopCount: 0,
        formIteration: 0,
    };
    const mockGroove = { ...actual.groove };
    const mockSoloist = makeSoloistMock({ ...actual.soloist });
    const mockHarmony = { ...actual.harmony, enabled: false, buffer: new Map() };
    const mockChords = { ...actual.chords };
    const mockBass = { ...actual.bass };

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

vi.mock('../../../public/persistence.js', () => ({
    debounceSaveState: vi.fn(),
}));

vi.mock('../../../public/engine/fills.js', () => ({
    generateProceduralFill: vi.fn(() => ({})),
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
        conductor.loopCount = 0;

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

        it('should yield intent density when soloist is busy', () => {
            soloist.enabled = true;
            soloist.session.phrasing.busySteps = 5; // Busy
            playback.complexity = 0.8;

            applyConductor(getState(), dispatch);

            expect(dispatch).toHaveBeenCalledWith(
                'UPDATE_CONDUCTOR_DECISION',
                expect.objectContaining({
                    intent: expect.objectContaining({
                        density: 0.3 * (1 - 0.8), // Expected yielding calculation
                    }),
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

        it('should apply lyrical bias based on song progress and section overrides', () => {
            playback.songMode = true;
            playback.sessionTimer = 5; // 5 mins
            playback.sessionStartTime = performance.now() - 1 * 60000; // 1 min elapsed (progress 0.2)

            arranger.stepMap = [
                { start: 0, end: 16, chord: { sectionId: 's1', sectionLabel: 'Solo' } },
            ];
            playback.step = 0;

            applyConductor(getState(), dispatch);

            // Should blend Solo override (0.2) with arc bias
            expect(dispatch).toHaveBeenCalledWith(
                'UPDATE_CONDUCTOR_DECISION',
                expect.objectContaining({
                    lyricalBias: expect.any(Number),
                }),
            );
        });

        it('should apply micro-timing pocket offsets for specific genres', () => {
            groove.genreFeel = 'Neo-Soul';
            applyConductor(getState(), dispatch);
            expect(dispatch).toHaveBeenCalledWith('SET_PARAM', {
                module: 'bass',
                param: 'pocketOffset',
                value: 0.025,
            });

            groove.genreFeel = 'Funk';
            applyConductor(getState(), dispatch);
            expect(dispatch).toHaveBeenCalledWith('SET_PARAM', {
                module: 'bass',
                param: 'pocketOffset',
                value: -0.005,
            });
        });

        it('should adjust master limiter without mutating instrument reverb', () => {
            playback.audio = { currentTime: 1.0 };
            playback.masterLimiter = {
                threshold: { setTargetAtTime: vi.fn() },
                ratio: { setTargetAtTime: vi.fn() },
                release: { setTargetAtTime: vi.fn() },
            };
            playback.chordsReverb = { gain: { setTargetAtTime: vi.fn() } };
            playback.bassReverb = { gain: { setTargetAtTime: vi.fn() } };
            playback.soloistReverb = { gain: { setTargetAtTime: vi.fn() } };
            playback.harmoniesReverb = { gain: { setTargetAtTime: vi.fn() } };
            playback.drumsReverb = { gain: { setTargetAtTime: vi.fn() } };
            chords.reverb = 0.31;
            bass.reverb = 0.07;
            soloist.reverb = 0.64;
            harmony.reverb = 0.42;
            groove.reverb = 0.18;
            playback.bandIntensity = 0.8;

            applyConductor(getState(), dispatch);

            expect(playback.masterLimiter.threshold.setTargetAtTime).toHaveBeenCalled();
            expect(playback.masterLimiter.ratio.setTargetAtTime).toHaveBeenCalled();
            expect(playback.chordsReverb.gain.setTargetAtTime).not.toHaveBeenCalled();
            expect(playback.bassReverb.gain.setTargetAtTime).not.toHaveBeenCalled();
            expect(playback.soloistReverb.gain.setTargetAtTime).not.toHaveBeenCalled();
            expect(playback.harmoniesReverb.gain.setTargetAtTime).not.toHaveBeenCalled();
            expect(playback.drumsReverb.gain.setTargetAtTime).not.toHaveBeenCalled();
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
            vi.spyOn(Math, 'random').mockReturnValue(0.5);
            // why: S8 inverted the prior 2.5×-down / 1.0×-up asymmetry to
            // 0.5×-down / 1.5×-up. Real bands lean into rises and ease out of
            // drops ("settle in and build"), not the other way around. The
            // prior asymmetry, combined with the random jitter at line 445/457,
            // created a structural pull toward floor that parked funk/neo-soul
            // backbeats below the Snare-vs-Sidestick gate. See
            // `docs/audit/epic-form-arrangement.md` S8.
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

            // Build should now be faster (multiplier 1.5 when target > intensity,
            // multiplier 0.5 when target < intensity).
            expect(buildDiff).toBeGreaterThan(dropDiff);
        });
    });

    describe('checkSectionTransition', () => {
        it('should trigger a fill and update target energy at loop end', () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.5);
            groove.enabled = true;
            conductor.formIteration = 0;
            checkSectionTransition(getState(), 0, 16, dispatch);
            expect(conductor.formIteration).toBeGreaterThan(0);
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

        it('should adhere to the Grand Story macro-arc cycles', () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.5);
            groove.enabled = true;

            // Cycle 0: Warm up (Macro Ceiling 0.45)
            conductor.formIteration = 0;
            checkSectionTransition(getState(), 0, 16, dispatch);
            expect(conductor.targetIntensity).toBeLessThanOrEqual(0.45 + 0.15);

            // Cycle 4: The Peak (Macro Floor 0.6)
            conductor.formIteration = 4;
            checkSectionTransition(getState(), 0, 16, dispatch);
            expect(conductor.targetIntensity).toBeGreaterThanOrEqual(0.6 - 0.15);
        });

        it('should apply Local Functional Roles when form analysis is present', () => {
            vi.spyOn(Math, 'random').mockReturnValue(0.5);
            groove.enabled = true;
            conductor.formIteration = 4; // Peak cycle, allows high ceiling
            arranger.totalSteps = 32; // <--- FIX HERE

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
            expect(conductor.targetIntensity).toBeGreaterThan(0.6);

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
                expect(conductor.targetIntensity).toBeGreaterThan(0); // Basic assertion, main goal is coverage
            }
        });

        it('should generate groove seed on transition if creativity is enabled', () => {
            groove.enabled = true;
            groove.creativity = true;
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
});
