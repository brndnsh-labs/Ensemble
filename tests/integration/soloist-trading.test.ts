// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { checkSectionTransition } from '../../public/engine/conductor.js';
import { getState } from '../../public/state.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

// Mock State
vi.mock('../../public/state.js', () => {
    const mockState = {
        playback: {
            bandIntensity: 0.5,
            autoIntensity: false,
            isPlaying: true,
            sessionTimer: 0,
        },
        arranger: {
            totalSteps: 128,
            sections: [
                { id: 's1', label: 'A' },
                { id: 's2', label: 'B' },
                { id: 's3', label: 'A' },
            ],
            stepMap: [
                { start: 0, end: 32, chord: { sectionId: 's1', sectionLabel: 'A' } },
                { start: 32, end: 64, chord: { sectionId: 's2', sectionLabel: 'B' } },
                { start: 64, end: 96, chord: { sectionId: 's3', sectionLabel: 'A' } },
            ],
        },
        soloist: makeSoloistMock({
            enabled: true,
            tradeMode: 'sections',
            activeTab: 'smart',
            session: {
                phrasing: {
                    isResting: false,
                    isYielding: false,
                    isWaitingForEntry: false,
                    activeSteps: 0,
                    restSteps: 0,
                    busySteps: 0,
                },
            },
            currentPhraseSteps: 10,
        }),
        groove: { enabled: true, genreFeel: 'Jazz' },
        conductor: {
            targetIntensity: 0.35,
            stepSize: 0.0005,
            form: null,
            loopCount: 0,
            formIteration: 0,
        },
        dispatch: vi.fn((action, payload) => {
            if (action === 'SET_PARAM') {
                if (payload.module && payload.param && mockState[payload.module]) {
                    mockState[payload.module][payload.param] = payload.value;
                }
            } else if (action === 'UPDATE_SB') {
                // Route flat aliases to their nested home (mirrors the prod
                // reducer in public/state/instruments.ts).
                const routes: Record<string, string[]> = {
                    isYielding: ['session', 'phrasing', 'isYielding'],
                    isWaitingForEntry: ['session', 'phrasing', 'isWaitingForEntry'],
                    isResting: ['session', 'phrasing', 'isResting'],
                    activeSteps: ['session', 'phrasing', 'activeSteps'],
                    restSteps: ['session', 'phrasing', 'restSteps'],
                    busySteps: ['session', 'phrasing', 'busySteps'],
                    sessionSeed: ['session', 'seed'],
                    sessionSteps: ['session', 'sessionSteps'],
                    tension: ['session', 'tension'],
                };
                for (const [k, v] of Object.entries(payload)) {
                    const route = routes[k];
                    if (route) {
                        let target: any = mockState.soloist;
                        for (let i = 0; i < route.length - 1; i++) {
                            if (!target[route[i]]) {
                                target[route[i]] = {};
                            }
                            target = target[route[i]];
                        }
                        target[route[route.length - 1]] = v;
                    } else {
                        mockState.soloist[k] = v;
                    }
                }
            }
        }),
    };
    return {
        stateMap: mockState,
        getState: () => mockState,
        dispatch: mockState.dispatch,
    };
});

// Mock dependencies
vi.mock('../../public/state/persistence.js', () => ({
    debounceSaveState: vi.fn(),
    saveCurrentState: vi.fn(),
}));
vi.mock('../../public/worker-client.js', () => ({ syncWorker: vi.fn(), flushWorker: vi.fn() }));
vi.mock('../../public/engine/fills.js', () => ({ generateProceduralFill: vi.fn(() => ({})) }));
vi.mock('../../public/ui.js', () => ({ triggerFlash: vi.fn() }));
// Partial mock: stub getSectionEnergy but keep the real getJamMacroArc — the
// conductor's timer-less fallback (Epic 11 S3) calls it directly, and it is a
// pure, dep-light helper that needs no stubbing.
vi.mock('../../public/song/form-analysis.js', async (importOriginal) => ({
    ...(await importOriginal()),
    getSectionEnergy: vi.fn(() => 0.5),
}));

describe('Soloist Trading Logic', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        const state = getState();
        state.soloist.enabled = true;
        state.soloist.tradeMode = 'sections';
        state.soloist.tradeSilenced = false;
    });

    // #1062 regression: trading must never write the user's own `enabled`
    // field — it's `document`-owned (persisted, shareable). Only the
    // runtime-derived `tradeSilenced` layer may move.
    it('should silence the soloist at the first transition WITHOUT touching enabled', () => {
        const stepsPerMeasure = 16;
        // Step 31 is the last step of the first measure of the first section?
        // No, checkSectionTransition triggers at the START of a measure if it LEADS into a transition.

        // Transition from s1 to s2 happens at step 32.
        // So at step 16 (start of measure 2), we check measureEnd (32).
        // measureEnd - 1 = 31. Step 31 is in s1.
        // measureEnd = 32. Step 32 is in s2.
        // s1 !== s2 -> TRIGGER.

        checkSectionTransition(getState(), 16, stepsPerMeasure, getState().dispatch);

        expect(getState().soloist.enabled).toBe(true);
        expect(getState().soloist.tradeSilenced).toBe(true);
    });

    it('should trade across 3 sections correctly, leaving enabled untouched', () => {
        const state = getState();
        const stepsPerMeasure = 16;

        state.arranger.totalSteps = 96; // 3 sections of 32 steps
        state.arranger.stepMap = [
            { start: 0, end: 32, chord: { sectionId: 's1', sectionLabel: 'A' } },
            { start: 32, end: 64, chord: { sectionId: 's2', sectionLabel: 'B' } },
            { start: 64, end: 96, chord: { sectionId: 's3', sectionLabel: 'C' } },
        ];

        // Transition 1: A -> B (at step 16 triggers for end at 32)
        checkSectionTransition(state, 16, stepsPerMeasure, state.dispatch);
        expect(state.soloist.enabled).toBe(true);
        expect(state.soloist.tradeSilenced).toBe(true);
        expect(state.soloist.session.phrasing.isYielding).toBe(true);

        // Transition 2: B -> C (at step 48 triggers for end at 64)
        checkSectionTransition(state, 48, stepsPerMeasure, state.dispatch);
        expect(state.soloist.enabled).toBe(true);
        expect(state.soloist.tradeSilenced).toBe(false);
        expect(state.soloist.session.phrasing.isYielding).toBe(false);
        expect(state.soloist.session.phrasing.isWaitingForEntry).toBe(true);

        // Transition 3: C -> A (at step 80 triggers for end at 96)
        checkSectionTransition(state, 80, stepsPerMeasure, state.dispatch);
        expect(state.soloist.enabled).toBe(true);
        expect(state.soloist.tradeSilenced).toBe(true);
        expect(state.soloist.session.phrasing.isYielding).toBe(true);

        // #1062 acceptance: across every transition in this run, no dispatched
        // payload ever carried an `enabled` key for the soloist lane.
        const writesEnabled = state.dispatch.mock.calls.some(([action, payload]: [string, any]) => {
            if (!payload || typeof payload !== 'object') {
                return false;
            }
            if (action === 'UPDATE_SB') {
                return Object.hasOwn(payload, 'enabled');
            }
            if (action === 'SET_PARAM') {
                return (
                    (payload.module === 'soloist' || payload.module === 'sb') &&
                    payload.param === 'enabled'
                );
            }
            return false;
        });
        expect(writesEnabled).toBe(false);
    });

    it('is silent (isInstrumentActiveAtStep) during a silenced window and active otherwise', async () => {
        const { isInstrumentActiveAtStep } = await import(
            '../../public/engine/section-overrides.js'
        );
        const state = getState();
        const stepsPerMeasure = 16;

        state.arranger.totalSteps = 96;
        state.arranger.stepMap = [
            { start: 0, end: 32, chord: { sectionId: 's1', sectionLabel: 'A' } },
            { start: 32, end: 64, chord: { sectionId: 's2', sectionLabel: 'B' } },
            { start: 64, end: 96, chord: { sectionId: 's3', sectionLabel: 'C' } },
        ];
        state.arranger.sectionMap = [
            { start: 0, end: 32, id: 's1' },
            { start: 32, end: 64, id: 's2' },
            { start: 64, end: 96, id: 's3' },
        ];
        state.arranger.sections = [
            { id: 's1', label: 'A' },
            { id: 's2', label: 'B' },
            { id: 's3', label: 'C' },
        ];

        expect(isInstrumentActiveAtStep(state, 'soloist', 0)).toBe(true);

        checkSectionTransition(state, 16, stepsPerMeasure, state.dispatch);
        expect(state.soloist.enabled).toBe(true);
        expect(isInstrumentActiveAtStep(state, 'soloist', 40)).toBe(false);

        checkSectionTransition(state, 48, stepsPerMeasure, state.dispatch);
        expect(state.soloist.enabled).toBe(true);
        expect(isInstrumentActiveAtStep(state, 'soloist', 70)).toBe(true);
    });
});
