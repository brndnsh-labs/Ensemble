// @ts-nocheck
/**
 * Critique: bossa + dub bass must groove in compound meters (epic-2 S9).
 *
 * Both styles were 4/4-position-hardcoded in `checkBassActiveStyle`:
 *   - bossa keyed its "beat 3" root on `intBeat === 2` (mStep 4 in 6/8 — a
 *     mid-group weak step, not a pulse) and assumed a 4-beat bar.
 *   - dub indexed REGGAE_RIDDIMS by 0–15 mStep literals on a 16-step bar, which
 *     never align in a 12-step 6/8 bar (dropped onsets, mis-placed hits).
 *
 * S9 derives both from the pulse structure outside 4/4. This test drives the
 * FULL pipeline (isBassActive → checkBassActiveStyle, then getBassNote →
 * getBassNoteStyle), so it also guards the PAIRED note-sites: the gate now fires
 * at pulse/pickup positions that the old 4/4 note-pickers returned `null` for.
 * An onset only lands in `performance` when the gate fired AND the note is
 * non-null — so a missing expected position fails the test either way.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getBassNote, isBassActive } from '../../public/engine/bass-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

describe('Bossa + Dub compound-meter bass critique (epic-2 S9)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    // Drive the full bass pipeline for `style` in `tsKey`, returning the set of
    // mStep positions that produced an actual note, with per-mStep bar counts.
    const collectOnsets = (tsKey, style, genreFeel, intensity, numBars) => {
        const ts = TIME_SIGNATURES[tsKey];
        const stepsPerBar = ts.beats * ts.stepsPerBeat;
        const mockState = {
            playback: { bandIntensity: intensity, complexity: 0.5, bpm: 90 },
            groove: {
                genreFeel,
                lastDrumPreset: genreFeel,
                instruments: [],
                measures: numBars,
            },
            arranger: { timeSignature: tsKey, totalSteps: numBars * stepsPerBar },
            soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
        };
        getState.mockReturnValue(mockState);

        const chord = { rootMidi: 36, intervals: [0, 4, 7, 10], quality: '7', beats: ts.beats };
        const counts = new Map(); // mStep -> bars with a note
        const perBarOnsets = []; // onsets per bar (for density + dropout checks)
        let prevFreq = 0;

        for (let bar = 0; bar < numBars; bar++) {
            let barOnsets = 0;
            for (let s = 0; s < stepsPerBar; s++) {
                const globalStep = bar * stepsPerBar + s;
                const info = getStepInfo(globalStep, ts, [], TIME_SIGNATURES);
                const active = isBassActive(getState(), style, globalStep, s, info, {});
                if (!active) {
                    continue;
                }
                const note = getBassNote(
                    getState(),
                    chord,
                    null,
                    info.beatIndex,
                    prevFreq,
                    32,
                    style,
                    0,
                    globalStep,
                    s,
                    { stepCoordination: {} },
                    info,
                );
                if (note) {
                    counts.set(info.mStep, (counts.get(info.mStep) ?? 0) + 1);
                    barOnsets++;
                    prevFreq = note.freq ?? prevFreq;
                }
            }
            perBarOnsets.push(barOnsets);
        }
        return { counts, perBarOnsets, numBars };
    };

    // --- DUB ---
    // 6/8 pulses are mStep 0 (beat 1) and mStep 6 (the second dotted quarter).
    // Intensity selects the riddim: <0.45 One Drop, 0.45–0.65 54-46, 0.65–0.85
    // Stalag, >0.85 Steppers (checkBassActiveStyle + getBassNoteStyle ladders).
    it('dub: One Drop in 6/8 plays the "drop" (mStep 6), beat 1 silent, every bar', () => {
        const { counts, numBars } = collectOnsets('6/8', 'dub', 'Reggae', 0.4, 32);
        console.log(`[Dub 6/8 One Drop] onsets by mStep: ${JSON.stringify([...counts])}`);
        expect(counts.get(6)).toBe(numBars); // the drop on every bar (gate fired + note non-null)
        expect(counts.get(0) ?? 0).toBe(0); // beat 1 stays silent — the One Drop signature
    });

    it('dub: Steppers in 6/8 plays every pulse (mStep 0 + 6)', () => {
        const { counts, numBars } = collectOnsets('6/8', 'dub', 'Reggae', 0.95, 32);
        console.log(`[Dub 6/8 Steppers] onsets by mStep: ${JSON.stringify([...counts])}`);
        expect(counts.get(0)).toBe(numBars);
        expect(counts.get(6)).toBe(numBars);
    });

    it('dub: syncopated riddims in 6/8 add the pickup (mStep 0,4,6,10)', () => {
        // 54-46 (intensity 0.5): pulses + the and-of-pulse pickup slot.
        const { counts } = collectOnsets('6/8', 'dub', 'Reggae', 0.5, 32);
        console.log(`[Dub 6/8 54-46] onsets by mStep: ${JSON.stringify([...counts])}`);
        for (const m of [0, 4, 6, 10]) {
            expect(counts.get(m) ?? 0).toBeGreaterThan(0);
        }
    });

    it('dub: never drops out and stays sparse in 6/8 (paired note-site intact)', () => {
        // Every riddim must yield at least one note per bar (no silent bars), and
        // stay well under the 12-step every-eighth ceiling. A null note at a fired
        // position (the paired-site bug) would show up as a zero-onset bar.
        for (const intensity of [0.4, 0.5, 0.7, 0.95]) {
            const { perBarOnsets } = collectOnsets('6/8', 'dub', 'Reggae', intensity, 24);
            const minOnsets = Math.min(...perBarOnsets);
            const avg = perBarOnsets.reduce((a, b) => a + b, 0) / perBarOnsets.length;
            console.log(`[Dub 6/8 @${intensity}] min/bar=${minOnsets}, avg/bar=${avg.toFixed(2)}`);
            expect(minOnsets).toBeGreaterThan(0); // no dropout
            expect(avg).toBeLessThan(6); // not a running line
        }
    });

    it('dub: 4/4 One Drop is byte-identical (the literal mStep-8 drop)', () => {
        const { counts, numBars } = collectOnsets('4/4', 'dub', 'Reggae', 0.4, 32);
        console.log(`[Dub 4/4 One Drop] onsets by mStep: ${JSON.stringify([...counts])}`);
        expect(counts.get(8)).toBe(numBars); // 4/4 One Drop literal
        expect(counts.get(0) ?? 0).toBe(0);
        expect(counts.get(6) ?? 0).toBe(0); // the 6/8 drop position is NOT used in 4/4
    });

    it('dub: odd meters use grouping-pulse onsets (epic-3 S5)', () => {
        // epic-3-followup-cleanup S5: dub now keys feltBeat off isPulseStart (the
        // grouping pulse) for any meter with a non-trivial grouping (length > 1).
        //
        // Before this fix, 16th-grid odd meters (5/4, 7/4) used isPulse = every
        // quarter ({0,4,8,12,16} / {…,24}), producing a locked quarter-note root
        // pedal — on-pulse but much denser than the sparse 3+2 / 4+3 grouping-pulse
        // idiom dub actually uses. After the fix:
        //   5/4 (grouping [3,2]): isPulseStart → {0, 12}         (was {0,4,8,12,16})
        //   7/4 (grouping [4,3]): isPulseStart → {0, 16}         (was {0,4,8,12,16,20,24})
        //   7/8 (grouping [2,2,3]): isPulseStart → {0,4,8}       (unchanged — matches isPulse)
        //
        // Grouping-pulse positions: derived from cumulative group starts
        // (grouping[i] * stepsPerBeat accumulated). These are the expected onset
        // ceilings for Steppers; One Drop drops beat 1 (mStep 0) → one onset/bar.
        const GROUPING_PULSES: Record<string, number[]> = {
            '5/4': [0, 12], // 3*4=12
            '7/4': [0, 16], // 4*4=16
            '7/8': [0, 4, 8], // 2*2=4, 2*2+2*2=8
        };

        // 7/8: 8th-grid discriminator — isBeatStart fires every eighth (0,2,4,6,8,10,12),
        // isPulseStart only on {0,4,8}; this still catches any regression to isBeatStart.
        // 5/4 + 7/4: the grouping-pulse set ({0,12}/{0,16}) is now tighter than isPulse,
        // so the subset assertion directly proves the fix.
        for (const tsKey of ['5/4', '7/4', '7/8']) {
            const groupingPulses = new Set(GROUPING_PULSES[tsKey]);
            for (const intensity of [0.4, 0.5, 0.7, 0.95]) {
                const { counts, perBarOnsets } = collectOnsets(
                    tsKey,
                    'dub',
                    'Reggae',
                    intensity,
                    24,
                );
                const firingSteps = [...counts.keys()];
                const avg = perBarOnsets.reduce((a, b) => a + b, 0) / perBarOnsets.length;
                console.log(
                    `[Dub ${tsKey} @${intensity}] firing mSteps: ${JSON.stringify(firingSteps)} avg/bar=${avg.toFixed(2)} (grouping pulses: ${JSON.stringify([...groupingPulses])})`,
                );
                // Every onset must be within the grouping-pulse set — no quarter-grid flood.
                for (const m of firingSteps) {
                    expect(groupingPulses.has(m)).toBe(true);
                }
                // No silent bars (the bass holds the groove).
                expect(Math.min(...perBarOnsets)).toBeGreaterThan(0);
                // Density ceiling: at most one onset per grouping-pulse position.
                // In 5/4: Steppers ≤ 2/bar, One Drop = 1/bar (beat 1 dropped → mStep 12 only).
                // In 7/4: Steppers ≤ 2/bar, One Drop = 1/bar (mStep 16 only).
                // In 7/8: Steppers ≤ 3/bar (unchanged).
                // why: grouping-pulse size is the correct ceiling — far sparser than the
                // old isPulse ceiling (5 or 7 pulses/bar in 5/4 and 7/4 respectively).
                expect(avg).toBeLessThanOrEqual(groupingPulses.size);
            }
        }
    });

    it('dub: 5/4 Steppers onsets ⊆ {0,12}; One Drop = {12} only', () => {
        // Confirm the exact grouping-pulse positions for 5/4 (grouping [3,2]).
        // Steppers: all grouping-pulse positions {0, 12} — up to 2 onsets/bar.
        const { counts: steppersCounts } = collectOnsets('5/4', 'dub', 'Reggae', 0.95, 32);
        console.log(`[Dub 5/4 Steppers] onsets: ${JSON.stringify([...steppersCounts])}`);
        for (const m of [...steppersCounts.keys()]) {
            expect([0, 12]).toContain(m); // only grouping-pulse positions
        }
        // One Drop: beat 1 (mStep 0) is silent; only mStep 12 fires (the "drop").
        // This IS the dub "one drop" idiom — one sparse onset per bar. Keep it.
        const { counts: dropCounts54 } = collectOnsets('5/4', 'dub', 'Reggae', 0.4, 32);
        console.log(`[Dub 5/4 One Drop] onsets: ${JSON.stringify([...dropCounts54])}`);
        expect(dropCounts54.get(0) ?? 0).toBe(0); // beat 1 is silent
        expect(dropCounts54.get(12)).toBeGreaterThan(0); // the drop
        for (const m of [...dropCounts54.keys()]) {
            expect([12]).toContain(m); // strictly one-onset-per-bar drop
        }
    });

    it('dub: 7/4 Steppers onsets ⊆ {0,16}; One Drop = {16} only', () => {
        // Confirm the exact grouping-pulse positions for 7/4 (grouping [4,3]).
        // Steppers: all grouping-pulse positions {0, 16}.
        const { counts: steppersCounts } = collectOnsets('7/4', 'dub', 'Reggae', 0.95, 32);
        console.log(`[Dub 7/4 Steppers] onsets: ${JSON.stringify([...steppersCounts])}`);
        for (const m of [...steppersCounts.keys()]) {
            expect([0, 16]).toContain(m); // only grouping-pulse positions
        }
        // One Drop: mStep 0 silent; only mStep 16 fires.
        const { counts: dropCounts74 } = collectOnsets('7/4', 'dub', 'Reggae', 0.4, 32);
        console.log(`[Dub 7/4 One Drop] onsets: ${JSON.stringify([...dropCounts74])}`);
        expect(dropCounts74.get(0) ?? 0).toBe(0);
        expect(dropCounts74.get(16)).toBeGreaterThan(0);
        for (const m of [...dropCounts74.keys()]) {
            expect([16]).toContain(m);
        }
    });

    // --- BOSSA ---
    it('bossa: 6/8 anchors both pulses (mStep 0,6) + pickups (mStep 4,10), every onset noted', () => {
        const { counts, numBars, perBarOnsets } = collectOnsets(
            '6/8',
            'bossa',
            'Bossa Nova',
            0.7,
            32,
        );
        console.log(`[Bossa 6/8] onsets by mStep: ${JSON.stringify([...counts])}`);
        // Pulses fire every bar (root); pickups fire every bar (fifth). All four
        // positions must carry a NOTE — proving the paired note-site (which used to
        // return null off the 4/4 isOne/isThree/isOffbeat positions) is fixed.
        expect(counts.get(0)).toBe(numBars);
        expect(counts.get(6)).toBe(numBars);
        expect(counts.get(4)).toBe(numBars);
        expect(counts.get(10)).toBe(numBars);
        // Sparse — ~4/bar, not a running line.
        const avg = perBarOnsets.reduce((a, b) => a + b, 0) / perBarOnsets.length;
        expect(avg).toBeLessThanOrEqual(4.5);
        expect(Math.min(...perBarOnsets)).toBeGreaterThan(0);
    });

    it('bossa: 4/4 is byte-identical (1, 2&, 3, 4& → mStep 0,6,8,14)', () => {
        const { counts, numBars } = collectOnsets('4/4', 'bossa', 'Bossa Nova', 0.7, 32);
        console.log(`[Bossa 4/4] onsets by mStep: ${JSON.stringify([...counts])}`);
        for (const m of [0, 6, 8, 14]) {
            expect(counts.get(m)).toBe(numBars);
        }
        // The 6/8-specific pickup positions must NOT appear in 4/4 (mStep 4, 10).
        expect(counts.get(4) ?? 0).toBe(0);
        expect(counts.get(10) ?? 0).toBe(0);
    });
});
