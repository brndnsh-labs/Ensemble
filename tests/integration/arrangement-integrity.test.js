/**
 * @vitest-environment happy-dom
 */
import { describe, expect, it, vi } from 'vitest';

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
    const mockGroove = { genreFeel: 'Jazz', pocket: 'ahead', instruments: [] };
    const mockSoloist = { enabled: true, busySteps: 0, lastFreq: 440 };
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

import { compingState, getAccompanimentNotes } from '../../public/accompaniment.js';
import { getBassNote, isBassActive } from '../../public/bass-engine.js';
import { getHarmonyNotes } from '../../public/harmonies.js';
import { getSoloistNote } from '../../public/soloist.js';
import { getState } from '../../public/state.js';

describe('Arrangement Integrity & Clutter Audit', () => {
    it('should measure rhythmic density and collisions across 100 steps', () => {
        const state = getState();
        const steps = 100;
        const collisions = [];
        let totalHits = 0;

        // Mock chord for a Cmaj7
        const chord = {
            rootMidi: 60,
            intervals: [0, 4, 7, 11],
            freqs: [261.63, 329.63, 392.0, 493.88],
            quality: 'maj7',
            beats: 4,
        };
        state.arranger.progression = [chord];

        for (let s = 0; s < steps; s++) {
            const hitsAtStep = [];
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
            if (isBassActive(state.bass.style, s, s)) {
                const b = getBassNote(
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
                chord,
                null,
                s,
                state.soloist.lastFreq,
                60,
                'smart',
                s,
                false,
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
                chord,
                s,
                s,
                s % 16,
                { isBeatStart: s % 4 === 0 },
                coordination,
            );
            acc.forEach((n) => {
                if (n.midi > 0) {
                    hitsAtStep.push({ module: 'chords', midi: n.midi, velocity: n.velocity });
                    coordination.accompanimentHit = true;
                    coordination.accompanimentMidis.push(n.midi);
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
        const steps = 100;
        const chord = {
            rootMidi: 60,
            intervals: [0, 4, 7, 11],
            freqs: [261.63, 329.63, 392.0, 493.88],
            quality: 'maj7',
            beats: 4,
        };
        state.arranger.progression = [chord];
        state.chords.style = 'smart';

        let hitsQuiet = 0;
        let hitsBusy = 0;

        // Force a specific cell for both tests to ensure identical baseline
        compingState.currentCell = new Array(16).fill(1); // 100% density cell
        compingState.lockedUntil = 9999;

        for (let s = 0; s < steps; s++) {
            const coordQuiet = { soloistActive: false };
            const notesQuiet = getAccompanimentNotes(
                chord,
                s,
                s % 16,
                s % 16,
                { isBeatStart: true },
                coordQuiet,
            );
            if (notesQuiet.some((n) => n.midi > 0)) {
                hitsQuiet++;
            }

            const coordBusy = { soloistActive: true };
            const notesBusy = getAccompanimentNotes(
                chord,
                s,
                s % 16,
                s % 16,
                { isBeatStart: true },
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
