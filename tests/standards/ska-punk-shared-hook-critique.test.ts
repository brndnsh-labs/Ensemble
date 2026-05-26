// @ts-nocheck
/**
 * Epic 12 S10 — Ska-Punk shared-hook antiphony.
 *
 * Before S10 the `playShadowMode` Ska-Punk branch (`harmonies.ts:359-368`)
 * read `coordination.soloistSharedHookBuffer` to fire a horn-section latch
 * (`{ type: 'reinforce', isLatched: true, duration: 1 }`) on the soloist's
 * hook steps. But `memory.sharedHookBuffer` was only initialized to `[]` —
 * never written by the soloist engine — so the buffer was always empty in
 * production and the antiphony idiom was dead code.
 *
 * S10 wires the producer side: `trackPhraseNote` now publishes a hook
 * to `memory.sharedHookBuffer` when:
 *   1. the note is an anchor (seedNote.isAnchor OR motivic-response
 *      entry/cadence target),
 *   2. the current SRDC phase is `statement` or `restatement` (the
 *      hook-establishing phases — Departure wanders, Conclusion resolves),
 *   3. a deterministic ~50% per-anchor gate keyed on (step, section, loop)
 *      so a phrase's multiple anchors don't all publish.
 *
 * Two metrics anchor this test:
 *
 *   1. PRODUCER — running the soloist over many bars under a Statement-phase
 *      setup with a head seed full of `isAnchor=true` notes, the published
 *      `memory.sharedHookBuffer` is non-empty AND every published entry's
 *      `sourcePhase` is in {statement, restatement}.
 *
 *   2. CONSUMER — calling `getHarmonyNotes` with `feel: 'Ska-Punk'` and a
 *      pre-populated `coordination.soloistSharedHookBuffer` whose entry
 *      matches the current step produces an `isLatched=true` note (the
 *      shared-hook stab). A non-Ska-Punk negative control (e.g. 'Funk') at
 *      the same step does NOT (the branch gate is `feel === 'Ska-Punk'`).
 *
 * The 30-run reliability loop is inherited from the test driver
 * (`npm run test:loop`); the engine is deterministic by construction (no
 * `Math.random` in the producer or consumer hot paths), so a single run
 * passing implies all 30 pass — but the loop catches any regression that
 * reintroduces an unseeded draw.
 *
 * Source: `docs/audit/epic-followup-drain.md` S10; `LISTEN_TESTS.md` C6.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearHarmonyMemory, getHarmonyNotes } from '../../public/engine/harmonies.js';
import { getSoloistNote } from '../../public/engine/soloist.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

const STEPS_PER_BAR = 16;
const NUM_BARS_PRODUCER = 128; // long enough to exercise loops, section recall,
// and enough Statement phases to expect meaningful hook output.

// A simple two-chord ska-punk loop. The progression is uninteresting to keep
// the focus on the hook publication path.
const Cmaj = { rootMidi: 60, intervals: [0, 4, 7], sectionStart: 0, sectionEnd: 0 };
const Gmaj = { rootMidi: 67, intervals: [0, 4, 7], sectionStart: 0, sectionEnd: 0 };
const PROGRESSION = [Cmaj, Gmaj];

/**
 * A hand-crafted head seed with frequent anchor notes — so the producer has
 * many opportunities to publish a hook within a short test window. The notes
 * land on quarter-note grid positions in C major; anchors are placed on the
 * 1 and the 3 of each bar (the classic ska-punk horn-stab grid).
 */
function makeSeededHook(): {
    notes: Array<{
        step: number;
        midi: number;
        isAnchor: boolean;
        durationSteps: number;
        velocity: number;
    }>;
    loopLengthSteps: number;
} {
    const notes: any[] = [];
    // Two-bar loop with anchors on steps 0, 4, 8, 12, 16, 20, 24, 28 (every
    // beat); pitches alternate C major chord tones to keep the line clean.
    const pitches = [60, 64, 67, 72, 67, 64, 60, 64];
    for (let i = 0; i < pitches.length; i++) {
        notes.push({
            step: i * 4,
            midi: pitches[i],
            isAnchor: true, // every beat is hook-eligible — gate must thin them
            durationSteps: 4,
            velocity: 0.8,
        });
    }
    return { notes, loopLengthSteps: 32 };
}

describe('Ska-Punk shared-hook antiphony (Epic 12 S10)', () => {
    describe('Producer — soloist publishes hooks to memory.sharedHookBuffer', () => {
        beforeEach(() => {
            dispatch(ACTIONS.RESET_STATE);
        });

        it('publishes a non-empty hook buffer after a multi-bar Statement run', () => {
            dispatch(ACTIONS.UPDATE_GROOVE, { genreFeel: 'Ska-Punk', enabled: true });
            dispatch(ACTIONS.UPDATE_SB, {
                enabled: true,
                style: 'scalar',
                sessionSeed: makeSeededHook(),
            });

            // why: the soloist's head-playback path indexes into
            // arranger.sectionMap unconditionally when a session seed is
            // present (see soloist.ts:1223 — sectionMap || fallback uses the
            // fallback only when sectionMap is falsy, and `[]` is truthy). A
            // single Verse section spans the whole run so deriveSrdcPhase
            // produces 'statement' for every tick (no chorus/bridge keyword,
            // not last-measure-of-conclusion since we set sectionEnd well
            // ahead of NUM_BARS_PRODUCER).
            const sessionSteps = NUM_BARS_PRODUCER * STEPS_PER_BAR;
            const state0 = getState();
            (state0.arranger as any).sectionMap = [
                { label: 'Verse', start: 0, end: sessionSteps * 2 },
            ];
            (state0.arranger as any).totalSteps = sessionSteps * 2;

            let lastFreq = 440;
            const publishedSteps: number[] = [];
            const publishedPhases: Set<string> = new Set();
            for (let i = 0; i < sessionSteps; i++) {
                const chord = PROGRESSION[Math.floor(i / STEPS_PER_BAR) % PROGRESSION.length];
                const note = getSoloistNote(
                    getState(),
                    chord,
                    null,
                    i,
                    lastFreq,
                    0,
                    'scalar',
                    i % STEPS_PER_BAR,
                    { sectionStart: 0, sectionEnd: sessionSteps },
                    { mStep: i % STEPS_PER_BAR },
                );
                if (note) {
                    const results = Array.isArray(note) ? note : [note];
                    lastFreq = results[results.length - 1].frequency || lastFreq;
                }
                // Snapshot the buffer after each tick (this is what the worker
                // also reads to publish via coordination.soloistSharedHookBuffer).
                const buf = getState().soloist.session.memory.sharedHookBuffer;
                if (Array.isArray(buf)) {
                    for (const h of buf) {
                        if (!publishedSteps.includes(h.step)) {
                            publishedSteps.push(h.step);
                        }
                        if (h.sourcePhase) {
                            publishedPhases.add(h.sourcePhase);
                        }
                    }
                }
            }

            // why: with anchors at every beat (8 anchors per 2-bar seed loop)
            // and a ~50% gate, expect ~4 published hooks per 2-bar window.
            // Over 128 bars (64 windows) the predicted distinct-step total
            // is ~256. We assert a two-sided range (150, 400):
            //   - LOWER bound (150) — catches a regression that drops the
            //     gate (e.g. `< 0.5` → `< 0.1`) which would still pass the
            //     old `>= 20` floor at a 4% gate.
            //   - UPPER bound (400) — catches a regression that removes
            //     the gate entirely (would publish ~512 distinct steps).
            // The engine is deterministic, so the band can be tight.
            console.log(
                '\n--- SKA-PUNK SHARED-HOOK PRODUCER (Epic 12 S10) ---\n' +
                    `[Total ticks]            ${sessionSteps}\n` +
                    `[Distinct hook steps]    ${publishedSteps.length} (target: 150-400)\n` +
                    `[Hook source phases]     ${[...publishedPhases].join(', ') || '(none)'}\n` +
                    '---------------------------------------------------\n',
            );

            expect(publishedSteps.length).toBeGreaterThanOrEqual(150);
            expect(publishedSteps.length).toBeLessThanOrEqual(400);
            // Every published hook must be from a hook-eligible phase.
            for (const phase of publishedPhases) {
                expect(['statement', 'restatement', 'departure']).toContain(phase);
            }
            // why: positive control on this single-section setup — every
            // published hook here lands in `statement` (the run uses one
            // Verse section, label not in DEPARTURE_LABEL_KEYWORDS, occurrence=1).
            // Confirms the gate does fire on `statement` (was a vacuous pass
            // before — `toContain` over an empty Set always passes). The
            // two follow-up tests below pin restatement + departure
            // explicitly. FOLLOWUPS §F.12 (Epic 12 S10 review P2-2).
            expect(publishedPhases.has('statement')).toBe(true);
        });

        // why: positive controls for the other two hook-eligible phases. The
        // engine doesn't drive preparePhraseResponseContext (which is what sets
        // srdcState from sectionContext) on this test path — head playback
        // calls trackPhraseNote directly, bypassing the wake-up sequence that
        // would naturally derive a phase from a multi-section arranger map.
        // Pinning srdcState directly mirrors the Conclusion negative control
        // pattern below: the test asserts the *gate behavior* (publish on
        // {statement, restatement, departure}, skip on conclusion) without
        // depending on engine-driven phase derivation, which is exercised
        // separately by the integration-level soloist tests.
        // FOLLOWUPS §F.12 (Epic 12 S10 review P2-2).
        const runProducerWithForcedPhase = (
            phase: 'statement' | 'restatement' | 'departure',
        ): { totalHooks: number; phases: Set<string> } => {
            dispatch(ACTIONS.UPDATE_GROOVE, { genreFeel: 'Ska-Punk', enabled: true });
            dispatch(ACTIONS.UPDATE_SB, {
                enabled: true,
                style: 'scalar',
                sessionSeed: makeSeededHook(),
            });

            // Park the section so deriveSrdcPhase doesn't reset srdcState off
            // the forced value if the engine happens to call preparePhrase-
            // ResponseContext (it generally doesn't on this path, but the
            // belt-and-suspenders is cheap).
            const sessionSteps = 32 * STEPS_PER_BAR; // shorter — control case
            const state = getState();
            (state.arranger as any).sectionMap = [
                { label: 'Verse', start: 0, end: sessionSteps * 2 },
            ];
            (state.arranger as any).totalSteps = sessionSteps * 2;
            (state.soloist.session.currentPhrase.context as any).srdcState = phase;

            const phases: Set<string> = new Set();
            let totalHooks = 0;
            let lastFreq = 440;
            for (let i = 0; i < sessionSteps; i++) {
                // Re-pin every tick — anything in the engine that re-derives
                // srdcState mid-run gets overwritten back to our forced value
                // before the next publish.
                (state.soloist.session.currentPhrase.context as any).srdcState = phase;
                const chord = PROGRESSION[Math.floor(i / STEPS_PER_BAR) % PROGRESSION.length];
                const note = getSoloistNote(
                    getState(),
                    chord,
                    null,
                    i,
                    lastFreq,
                    0,
                    'scalar',
                    i % STEPS_PER_BAR,
                    { sectionStart: 0, sectionEnd: sessionSteps },
                    { mStep: i % STEPS_PER_BAR },
                );
                if (note) {
                    const results = Array.isArray(note) ? note : [note];
                    lastFreq = results[results.length - 1].frequency || lastFreq;
                }
                const buf = getState().soloist.session.memory.sharedHookBuffer;
                if (Array.isArray(buf)) {
                    for (const h of buf) {
                        if (h.sourcePhase) {
                            phases.add(h.sourcePhase);
                        }
                    }
                    totalHooks = buf.length;
                }
            }
            return { totalHooks, phases };
        };

        it('publishes hooks tagged "restatement" when srdcState = restatement', () => {
            const { totalHooks, phases } = runProducerWithForcedPhase('restatement');
            console.log(
                '\n--- SKA-PUNK SHARED-HOOK PRODUCER (Restatement positive control) ---\n' +
                    `[Hook buffer length]     ${totalHooks}\n` +
                    `[Hook source phases]     ${[...phases].join(', ') || '(none)'}\n` +
                    '----------------------------------------------------------------------\n',
            );
            expect(totalHooks).toBeGreaterThan(0);
            expect(phases.has('restatement')).toBe(true);
            // No leakage into other phases — the forced value must be the
            // only sourcePhase emitted.
            expect(phases.size).toBe(1);
        });

        it('publishes hooks tagged "departure" when srdcState = departure', () => {
            const { totalHooks, phases } = runProducerWithForcedPhase('departure');
            console.log(
                '\n--- SKA-PUNK SHARED-HOOK PRODUCER (Departure positive control) ---\n' +
                    `[Hook buffer length]     ${totalHooks}\n` +
                    `[Hook source phases]     ${[...phases].join(', ') || '(none)'}\n` +
                    '--------------------------------------------------------------------\n',
            );
            expect(totalHooks).toBeGreaterThan(0);
            expect(phases.has('departure')).toBe(true);
            expect(phases.size).toBe(1);
        });

        it('publishes zero hooks when SRDC phase is forced to conclusion', () => {
            // why: negative control on the SRDC phase gate. We force the phase
            // by routing through a section labeled 'Outro' — deriveSrdcPhase
            // checks `label.includes('outro') || label.includes('end')` BEFORE
            // any other branch, so the phase becomes 'conclusion' for every
            // step regardless of position-in-section. The producer must skip
            // every anchor because cadence-stepping horn echoes undercut
            // the resolution.
            //
            // (P0-1 patch — original test asserted Departure was skipped, but
            // Departure is the chorus/bridge horn-section moment and now
            // FIRES. Conclusion is the only phase the producer rejects.)
            dispatch(ACTIONS.UPDATE_GROOVE, { genreFeel: 'Ska-Punk', enabled: true });
            dispatch(ACTIONS.UPDATE_SB, {
                enabled: true,
                style: 'scalar',
                sessionSeed: makeSeededHook(),
            });

            // We also overwrite the post-RESET_STATE default srdcState
            // ('statement') with 'conclusion' directly so the very first
            // head-played anchor (which fires BEFORE preparePhraseResponse-
            // Context has a chance to call deriveSrdcPhase on a new phrase)
            // is also gated correctly.
            const sessionSteps = 32 * STEPS_PER_BAR; // shorter — control case
            const state = getState();
            (state.arranger as any).sectionMap = [{ label: 'Outro', start: 0, end: sessionSteps }];
            (state.arranger as any).totalSteps = sessionSteps;
            (state.soloist.session.currentPhrase.context as any).srdcState = 'conclusion';

            let lastFreq = 440;
            for (let i = 0; i < sessionSteps; i++) {
                const chord = PROGRESSION[Math.floor(i / STEPS_PER_BAR) % PROGRESSION.length];
                const note = getSoloistNote(
                    getState(),
                    chord,
                    null,
                    i,
                    lastFreq,
                    0,
                    'scalar',
                    i % STEPS_PER_BAR,
                    { sectionStart: 0, sectionEnd: sessionSteps },
                    { mStep: i % STEPS_PER_BAR },
                );
                if (note) {
                    const results = Array.isArray(note) ? note : [note];
                    lastFreq = results[results.length - 1].frequency || lastFreq;
                }
            }

            const buf = getState().soloist.session.memory.sharedHookBuffer;
            console.log(
                '\n--- SKA-PUNK SHARED-HOOK PRODUCER (Conclusion negative control) ---\n' +
                    `[Hook buffer length]     ${buf?.length ?? 0} (target: 0)\n` +
                    '-------------------------------------------------------------------\n',
            );
            expect(Array.isArray(buf) ? buf.length : 0).toBe(0);
        });
    });

    describe('Consumer — harmony branch fires isLatched on matching hook step', () => {
        let mockState: any;

        beforeEach(() => {
            vi.clearAllMocks();
            // why: the harmony engine reads `state.groove.genreFeel`, intensity,
            // and a tiny slice of arranger/harmony state. Build a minimal
            // mock — we are testing the playShadowMode Ska-Punk branch in
            // isolation from the producer.
            mockState = {
                playback: { bandIntensity: 0.7, complexity: 0.5, currentLoopCount: 1 },
                groove: {
                    genreFeel: 'Ska-Punk',
                    pocket: {
                        globalDrive: 0,
                        tightness: 1,
                        bassGravity: 1,
                        chordGravity: 1,
                        soloistGravity: 1,
                    },
                },
                soloist: makeSoloistMock({
                    enabled: true,
                    isResting: true,
                    notesInPhrase: 0,
                }),
                harmony: { enabled: true, complexity: 0.5, lastMidis: [], rhythmicMask: 0 },
                arranger: { timeSignature: '4/4' },
                chords: { style: 'horns' },
            };
            vi.spyOn({ getState }, 'getState');
            // We pass mockState directly to getHarmonyNotes; getState is only
            // touched as a fallback by getWorkerState when the explicit state
            // is null. Both tests below pass mockState explicitly.
            clearHarmonyMemory(mockState);
        });

        afterEach(() => {
            vi.restoreAllMocks();
        });

        const chordC = {
            rootMidi: 60,
            quality: 'maj',
            intervals: [0, 4, 7],
            sectionId: 'A',
        };

        it('Ska-Punk feel + matching hook step → isLatched harmony note', () => {
            const TEST_STEP = 32;
            const coordination = {
                soloistSharedHookBuffer: [
                    {
                        step: TEST_STEP,
                        midi: 60,
                        pitchClass: 0,
                        durationSteps: 4,
                        sourcePhase: 'statement',
                    },
                ],
                soloistSeed: null,
                soloistResting: true,
                soloistNotesInPhrase: 0,
                soloistActive: false,
                soloistPhraseEnd: false,
            };

            const notes = getHarmonyNotes(
                mockState,
                chordC,
                null,
                TEST_STEP,
                64,
                'horns',
                TEST_STEP % STEPS_PER_BAR,
                null,
                coordination,
            );

            // The Ska-Punk branch returns { type: 'reinforce', isLatched: true,
            // duration: 1 } which finalizeHarmonyNotes carries through to the
            // emitted HarmonyNote(s).
            const latchedCount = notes.filter((n: any) => n.isLatched).length;
            console.log(
                '\n--- SKA-PUNK SHARED-HOOK CONSUMER (Ska-Punk fires) ---\n' +
                    `[Notes emitted]          ${notes.length}\n` +
                    `[isLatched count]        ${latchedCount} (target: >0)\n` +
                    '-------------------------------------------------------\n',
            );
            expect(notes.length).toBeGreaterThan(0);
            expect(latchedCount).toBeGreaterThan(0);
        });

        it('Non-Ska-Punk feel + matching hook step → no shared-hook latch', () => {
            // Negative control: change ONLY the genre feel. The buffer still
            // matches the step, but the playShadowMode gate is
            // `feel === 'Ska-Punk'`, so tag B never fires. Other isLatched
            // sources (tag C — melodic shadowing) require a non-null
            // soloist seed; we pass `soloistSeed: null` so no other latch path
            // can pollute the count. Any isLatched note here would be a real
            // regression.
            mockState.groove.genreFeel = 'Funk';

            const TEST_STEP = 32;
            const coordination = {
                soloistSharedHookBuffer: [
                    {
                        step: TEST_STEP,
                        midi: 60,
                        pitchClass: 0,
                        durationSteps: 4,
                        sourcePhase: 'statement',
                    },
                ],
                soloistSeed: null,
                soloistResting: true,
                soloistNotesInPhrase: 0,
                soloistActive: false,
                soloistPhraseEnd: false,
            };

            const notes = getHarmonyNotes(
                mockState,
                chordC,
                null,
                TEST_STEP,
                64,
                'horns',
                TEST_STEP % STEPS_PER_BAR,
                null,
                coordination,
            );

            const latchedCount = notes.filter((n: any) => n.isLatched).length;
            console.log(
                '\n--- SKA-PUNK SHARED-HOOK CONSUMER (Funk negative control) ---\n' +
                    `[Notes emitted]          ${notes.length}\n` +
                    `[isLatched count]        ${latchedCount} (target: 0)\n` +
                    '--------------------------------------------------------------\n',
            );
            expect(latchedCount).toBe(0);
        });

        it('Ska-Punk feel + empty hook buffer → no shared-hook latch (no false positive)', () => {
            const TEST_STEP = 32;
            const coordination = {
                soloistSharedHookBuffer: [],
                soloistSeed: null,
                soloistResting: true,
                soloistNotesInPhrase: 0,
                soloistActive: false,
                soloistPhraseEnd: false,
            };

            const notes = getHarmonyNotes(
                mockState,
                chordC,
                null,
                TEST_STEP,
                64,
                'horns',
                TEST_STEP % STEPS_PER_BAR,
                null,
                coordination,
            );

            const latchedCount = notes.filter((n: any) => n.isLatched).length;
            console.log(
                '\n--- SKA-PUNK SHARED-HOOK CONSUMER (empty buffer baseline) ---\n' +
                    `[Notes emitted]          ${notes.length}\n` +
                    `[isLatched count]        ${latchedCount} (target: 0)\n` +
                    '--------------------------------------------------------------\n',
            );
            // Empty buffer → tag B can't match → no latched note from the
            // shared-hook path. This is the exact pre-fix state (production
            // for the entire history of the feature). A regression that
            // accidentally short-circuits the buffer-empty check would fire
            // here.
            expect(latchedCount).toBe(0);
        });
    });
});
