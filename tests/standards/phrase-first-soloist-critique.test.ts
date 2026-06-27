// @ts-nocheck
// Critique test for the phrase-first soloist (getSoloistNotePhraseFirst).
// Guards the MUSICAL fundamentals that green unit tests and the by-ear gate
// can't see — the class of regression the 2026-06-27 code review surfaced (the
// apex silently landing on a tension tone because its reach was decoupled from
// its fixed position in the macro-form). Production-faithful: a real seeder, a
// real progression, an ABSOLUTE advancing step with `currentLoopCount`
// incremented every arrangement loop (mirroring scheduler-core), scanned across
// a full macro-form so the single apex moment is actually exercised.
import { describe, expect, it } from 'vitest';
import { CHORD_PRESETS } from '../../public/data/chord-presets.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { getSoloistNotePhraseFirst } from '../../public/engine/soloist-phrase-first.js';
import { generateSessionSeed } from '../../public/engine/soloist-seeder.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

// Key C major throughout → strong key tones (tonic, 5th) are pitch classes 0 and 7.
const STRONG_PCS = new Set([0, 7]);

function buildState(genre: string, presetName: string) {
    dispatch(ACTIONS.RESET_STATE);
    dispatch(ACTIONS.SET_TIME_SIGNATURE, '4/4');
    dispatch(ACTIONS.SET_KEY, 'C');
    dispatch(ACTIONS.UPDATE_GB, { enabled: true, genreFeel: genre });
    dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'smart' });
    dispatch(ACTIONS.SET_BAND_INTENSITY, 0.62);
    dispatch(ACTIONS.SET_BPM, 120);
    const state = getState();
    const preset = CHORD_PRESETS.find((p) => p.name === presetName);
    state.arranger.key = 'C';
    state.arranger.isMinor = false;
    state.arranger.sections = preset.sections.map((s, i) => ({ ...s, id: `p-${i}` }));
    validateProgression(state);
    return state;
}

// One full pass through the macro-form, production-faithful.
function simulate(genre: string, presetName: string) {
    const state = buildState(genre, presetName);
    const seed = generateSessionSeed(state, state.arranger, 'smart', 0.62, 'CRITIQUE_SEED');
    state.soloist.session.seed = seed;
    state.soloist.session.phrasing = { isResting: false };
    state.soloist.phraseFirstSoloist = true;

    const loopLen = seed.loopLengthSteps || state.arranger.totalSteps;
    const total = state.arranger.totalSteps;
    const stepMap = state.arranger.stepMap;
    const chordAt = (s: number) => {
        const w = ((s % total) + total) % total;
        return stepMap.find((e: any) => w >= e.start && w < e.end)?.chord || null;
    };

    // Recurring signature peaks: the form is divided into development-cycle
    // WINDOWS (~24 bars), each with its OWN local apex (its highest seed note).
    // Mirror the engine's window math so we know where every peak should sound.
    const cyclePeriod = Math.min(Math.max(3 + Math.floor(loopLen / 128), 3), 6);
    const cycleLen = Math.max(cyclePeriod * total, total);
    const apexByWindow = new Map<number, { midi: number; stepInLoop: number }>();
    for (const n of seed.notes) {
        if (n.step < 0) {
            continue;
        }
        const sIL = ((n.step % loopLen) + loopLen) % loopLen;
        const w = Math.floor(sIL / cycleLen);
        const cur = apexByWindow.get(w);
        if (!cur || n.midi > cur.midi) {
            apexByWindow.set(w, { midi: n.midi, stepInLoop: sIL });
        }
    }
    // The set of in-loop steps where SOME window peak should land its money note.
    const apexSteps = new Set([...apexByWindow.values()].map((a) => a.stepInLoop));

    // Scan one full macro-form PLUS a margin: the form is cyclic, so the last
    // notes need a real successor (otherwise a linear scan reports a false
    // "overrun" at the tail). Overlaps are only asserted for steps in [0, loopLen).
    const emitted: any[] = [];
    for (let abs = 0; abs < loopLen + 64; abs++) {
        state.playback.currentLoopCount = Math.floor(abs / total); // increments per arrangement loop
        const res = getSoloistNotePhraseFirst(
            state,
            chordAt(abs),
            chordAt(abs + 1),
            abs,
            null,
            state.soloist.octave,
            'smart',
            abs % 16,
            {},
            { isDownbeat: abs % 16 === 0, isMeasureStart: abs % 16 === 0 },
        );
        if (res) {
            emitted.push({ step: abs, midi: res.midi, dur: res.durationSteps });
        }
    }
    return { emitted, apexByWindow, apexSteps, cycleLen, loopLen, total };
}

const GENRES = [
    { genre: 'Jazz', preset: 'Pop (Standard)' },
    { genre: 'Neo-Soul', preset: 'Pop (Standard)' },
    { genre: 'Rock', preset: 'Pop (Standard)' },
];

describe('phrase-first soloist · musical critique', () => {
    for (const { genre, preset } of GENRES) {
        it(`${genre}: every cycle peak lands a strong tone, line breathes, no self-overlap`, () => {
            const sim = simulate(genre, preset);

            // --- Each development-cycle window's local peak lands on a STRONG key
            // tone (tonic/5th), not a tension tone — the regression the review
            // caught, now asserted for EVERY recurring signature peak, not one
            // global climax. A peak is checked at its fixed in-loop position. ---
            const inLoop = (s: number) => ((s % sim.loopLen) + sim.loopLen) % sim.loopLen;
            const peakPcs: { window: number; midi: number; pc: number }[] = [];
            for (const [window, a] of sim.apexByWindow) {
                const note = sim.emitted.find((e: any) => inLoop(e.step) === a.stepInLoop);
                if (!note) {
                    continue; // a peak whose step the seeder left unfilled — covered by the count check
                }
                peakPcs.push({ window, midi: note.midi, pc: ((note.midi % 12) + 12) % 12 });
            }

            // --- Breath: the line rests; it's neither silent nor a constant stream. ---
            const inForm = sim.emitted.filter((e: any) => e.step < sim.loopLen);
            const density = inForm.length / sim.loopLen;

            // --- Monophonic: no note overruns the next (the duration clamp). ---
            let overlaps = 0;
            const overlapAt: number[] = [];
            for (let i = 0; i < sim.emitted.length - 1; i++) {
                if (sim.emitted[i].step >= sim.loopLen) {
                    break;
                }
                if (sim.emitted[i].step + sim.emitted[i].dur > sim.emitted[i + 1].step) {
                    overlaps++;
                    overlapAt.push(sim.emitted[i].step);
                }
            }

            const offTones = peakPcs.filter((p) => !STRONG_PCS.has(p.pc));
            console.log(
                `[${genre}] windows=${sim.apexByWindow.size} peaksSounded=${peakPcs.length} ` +
                    `offTones=${offTones.length} pcs=${peakPcs.map((p) => p.pc).join(',')} ` +
                    `density=${density.toFixed(2)} notes=${sim.emitted.length} overlaps=${overlaps} at=${overlapAt.join(',')}`,
            );

            // The form has multiple cycles, so multiple peaks should recur and sound.
            expect(peakPcs.length, 'cycle peaks should sound').toBeGreaterThan(1);
            expect(offTones, `every cycle peak must land tonic(0)/5th(7)`).toHaveLength(0);
            expect(density).toBeGreaterThan(0.05); // it plays
            expect(density).toBeLessThan(0.9); // …but it breathes
            expect(overlaps).toBe(0);
        });
    }
});
