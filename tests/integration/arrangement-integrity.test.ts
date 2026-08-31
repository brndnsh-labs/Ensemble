/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from 'vitest';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

// Mock state and global modules
vi.mock('../../public/state.js', () => {
    const mockArranger = {
        totalSteps: 16,
        timeSignature: '4/4',
        stepMap: [],
        sectionMap: [],
        progression: [],
    };
    const mockPlayback = {
        bandIntensity: 0.8,
        complexity: 0.8,
        bpm: 120,
        intent: { soloistMod: 0, anticipation: 0, syncopation: 0, layBack: 0 },
    };
    const mockGroove = { genreFeel: 'Jazz', instruments: [] };
    const mockSoloist = makeSoloistMock({
        enabled: true,
        busySteps: 0,
        lastFreq: 440,
        phraseContext: {
            role: 'call',
            skeleton: [],
            lastInterval: null,
            profile: 'srv',
        },
        // Phrase-first performs a seeded theme (it rests without one); give it a small
        // theme over the 16-step loop so the soloist lane stays active in the
        // cross-lane coordination scan (epic #10 — mirrors production's synced seed).
        sessionSeed: {
            loopLengthSteps: 16,
            notes: [
                { step: 0, midi: 67, durationSteps: 2, velocity: 0.8 },
                { step: 4, midi: 71, durationSteps: 2, velocity: 0.8 },
                { step: 8, midi: 67, durationSteps: 2, velocity: 0.8 },
                { step: 12, midi: 64, durationSteps: 2, velocity: 0.8 },
            ],
        },
        isResting: false,
    });
    const mockBass = { enabled: true, lastFreq: 110 };
    const mockChords = { enabled: true, rhythmicMask: 0, style: 'smart' };
    const mockHarmony = { enabled: true, rhythmicMask: 0 };

    const mockStateMap = {
        arranger: mockArranger,
        playback: mockPlayback,
        groove: mockGroove,
        soloist: mockSoloist,
        bass: mockBass,
        chords: mockChords,
        harmony: mockHarmony,
    };

    return {
        ...mockStateMap,
        stateMap: mockStateMap,
        getState: () => mockStateMap,
        dispatch: vi.fn(),
    };
});

import { compingState, getAccompanimentNotes } from '../../public/engine/accompaniment.js';
import { getBassNote, isBassActive } from '../../public/engine/bass-engine.js';
import { getHarmonyNotes } from '../../public/engine/harmonies.js';
// THE live soloist engine (epic #10 — legacy getSoloistNote retired).
import { getSoloistNotePhraseFirst as getSoloistNote } from '../../public/engine/soloist-phrase-first.js';
import { getState } from '../../public/state.js';
import type { Mutable } from '../../public/types.js';

type MutableArranger = Mutable<ReturnType<typeof getState>['arranger']>;
type MutableChords = Mutable<ReturnType<typeof getState>['chords']>;

describe('Arrangement Integrity & Clutter Audit', () => {
    it('should measure rhythmic density and collisions across 100 steps', () => {
        const state = getState();
        const arranger = state.arranger as MutableArranger;
        const steps = 100;
        const collisions: any[] = [];
        let totalHits = 0;

        // Mock chord for a Cmaj7
        const chord = {
            rootMidi: 60,
            intervals: [0, 4, 7, 11],
            freqs: [261.63, 329.63, 392.0, 493.88],
            quality: 'maj7',
            beats: 4,
        } as any;
        arranger.progression = [chord];

        for (let s = 0; s < steps; s++) {
            const hitsAtStep: any[] = [];
            const coordination = {
                step: s,
                bassHit: false,
                bassMidi: 0,
                soloistActive: false,
                soloistMidi: 0,
                accompanimentHit: false,
                accompanimentMidis: [],
            };

            // 1. Bass
            if (isBassActive(getState(), state.bass.style, s, s)) {
                const b = getBassNote(
                    getState(),
                    chord,
                    null,
                    s / 4,
                    state.bass.lastFreq,
                    48,
                    'smart',
                    0,
                    s,
                    s,
                    { stepCoordination: coordination },
                );
                if (b?.midi) {
                    hitsAtStep.push({ module: 'bass', midi: b.midi, velocity: b.velocity });
                    coordination.bassHit = true;
                    coordination.bassMidi = b.midi;
                }
            }

            // 2. Soloist
            const sol = getSoloistNote(
                getState(),
                chord,
                null,
                s,
                state.soloist.audio.lastFreq,
                60,
                'smart',
                s,
                { stepCoordination: coordination },
            );
            if (sol) {
                const results = Array.isArray(sol) ? sol : [sol];
                results.forEach((r) => {
                    if (r.midi) {
                        hitsAtStep.push({ module: 'soloist', midi: r.midi, velocity: r.velocity });
                        coordination.soloistActive = true;
                        coordination.soloistMidi = r.midi;
                    }
                });
            }

            // 3. Accompaniment
            const acc = getAccompanimentNotes(
                getState(),
                chord,
                s,
                s,
                s % 16,
                { isBeatStart: s % 4 === 0 } as any,
                coordination,
            );
            acc.forEach((n) => {
                if (n.midi > 0) {
                    hitsAtStep.push({ module: 'chords', midi: n.midi, velocity: n.velocity });
                    coordination.accompanimentHit = true;
                    (coordination.accompanimentMidis as any[]).push(n.midi);
                }
            });

            // 4. Harmony
            const harm = getHarmonyNotes(
                getState(),
                chord,
                null,
                s,
                60,
                'smart',
                s,
                sol,
                coordination,
            );
            harm.forEach((n) => {
                if (n.midi > 0) {
                    hitsAtStep.push({ module: 'harmony', midi: n.midi, velocity: n.velocity });
                }
            });

            if (hitsAtStep.length > 1) {
                // Check for frequency collisions (within 2 semitones)
                for (let i = 0; i < hitsAtStep.length; i++) {
                    for (let j = i + 1; j < hitsAtStep.length; j++) {
                        const diff = Math.abs(hitsAtStep[i].midi - hitsAtStep[j].midi);
                        if (diff <= 2) {
                            collisions.push({
                                step: s,
                                m1: hitsAtStep[i],
                                m2: hitsAtStep[j],
                                diff,
                            });
                        }
                    }
                }
            }
            totalHits += hitsAtStep.length;
        }

        const collisionRate = collisions.length / steps;
        const avgHits = totalHits / steps;
        console.log(
            `[Audit] Avg Hits: ${avgHits.toFixed(2)}, Collisions: ${collisions.length}, Rate: ${collisionRate.toFixed(2)}`,
        );

        expect(avgHits).toBeLessThan(3.0);
        expect(collisionRate).toBeLessThan(0.5);
    });

    it('should verify that Accompaniment explicitly yields to Soloist active signal', () => {
        const state = getState();
        const arranger = state.arranger as MutableArranger;
        const chords = state.chords as MutableChords;
        const steps = 100;
        const chord = {
            rootMidi: 60,
            intervals: [0, 4, 7, 11],
            freqs: [261.63, 329.63, 392.0, 493.88],
            quality: 'maj7',
            beats: 4,
        } as any;
        arranger.progression = [chord];
        chords.style = 'smart';

        let hitsQuiet = 0;
        let hitsBusy = 0;

        // Force a specific cell for both tests to ensure identical baseline
        compingState.currentCell = new Array(16).fill(1); // 100% density cell
        compingState.lockedUntil = 9999;

        for (let s = 0; s < steps; s++) {
            const coordQuiet = { soloistActive: false };
            const notesQuiet = getAccompanimentNotes(
                getState(),
                chord,
                s,
                s % 16,
                s % 16,
                { isBeatStart: true } as any,
                coordQuiet,
            );
            if (notesQuiet.some((n) => n.midi > 0)) {
                hitsQuiet++;
            }

            const coordBusy = { soloistActive: true };
            const notesBusy = getAccompanimentNotes(
                getState(),
                chord,
                s,
                s % 16,
                s % 16,
                { isBeatStart: true } as any,
                coordBusy,
            );
            if (notesBusy.some((n) => n.midi > 0)) {
                hitsBusy++;
            }
        }

        console.log(`[Yield Check] Hits Quiet: ${hitsQuiet}, Hits Busy: ${hitsBusy}`);
        // With 100 steps and 50% base skip probability (at 0.8 intensity it's 0.5 + 0.8*0.3 = 0.74 skip prob),
        // hitsBusy should be significantly less than hitsQuiet (which should be 100).
        expect(hitsBusy).toBeLessThan(hitsQuiet);
    });
});
