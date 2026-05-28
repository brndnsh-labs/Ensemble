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
                creativity: true,
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

    it('dub: odd meters stay on the felt pulse (no 8th-grid running line, no dropout)', () => {
        // S9 review P0: feltBeat keyed on isBeatStart + pickup on isOffbeat flooded
        // the 8th grid in odd meters (7/8 → 14/bar, 5/4 → 10/bar) — a running line, the
        // opposite of dub. The fix routes simple-meter feltBeat off isPulse (the true
        // felt pulse) and drops the simple-meter pickup. The strongest guard: EVERY
        // onset must land on a felt-pulse position (tsConfig.pulse), in every meter at
        // every riddim intensity. That directly proves "no 8th-grid flood".
        // NOTE: 7/8 is the load-bearing discriminator here. In 16th-grid 5/4 + 7/4,
        // tsConfig.pulse IS every quarter, so "onset ∈ pulses" can't distinguish isPulse
        // from a regression to isBeatStart — only 7/8 (8th-grid: isBeatStart fires every
        // eighth, isPulse only on 0,4,8) catches that. Keep 7/8 in this list.
        for (const tsKey of ['5/4', '7/4', '7/8']) {
            const pulses = new Set(TIME_SIGNATURES[tsKey].pulse ?? []);
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
                    `[Dub ${tsKey} @${intensity}] firing mSteps: ${JSON.stringify(firingSteps)} avg/bar=${avg.toFixed(2)} (pulses: ${JSON.stringify([...pulses])})`,
                );
                // Every onset is on a pulse-grid position — no 8th-grid flooding.
                for (const m of firingSteps) {
                    expect(pulses.has(m)).toBe(true);
                }
                // No silent bars (the bass holds the groove).
                expect(Math.min(...perBarOnsets)).toBeGreaterThan(0);
                // Density ceiling: at most one onset per pulse-grid position. Pins the
                // current "quarter pedal in 16th-grid odd meters" behavior so an S10
                // grouping-pulse refinement (sparser) is a deliberate test edit, and an
                // isOffbeat-style flood (denser) fails here. (S9 review P2.)
                expect(avg).toBeLessThanOrEqual(pulses.size);
            }
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
