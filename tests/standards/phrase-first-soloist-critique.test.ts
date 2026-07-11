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
import { chordTargetTones } from '../../public/engine/soloist-pitch-engine.js';
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
    const loopsPerWindow = Math.max(1, Math.round(384 / total));
    const cycleLen = loopsPerWindow * total;
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
            emitted.push({
                step: abs,
                midi: res.midi,
                dur: res.durationSteps,
                chord: chordAt(abs),
            });
        }
    }
    return { emitted, apexByWindow, apexSteps, cycleLen, loopLen, total, seed };
}

const GENRES = [
    { genre: 'Jazz', preset: 'Pop (Standard)' },
    { genre: 'Neo-Soul', preset: 'Pop (Standard)' },
    { genre: 'Rock', preset: 'Pop (Standard)' },
    // A LONG progression (12-bar) — the case the original window math degraded:
    // tying the peak window to `cyclePeriod × totalSteps` gave a 12-bar form a 72-
    // bar window (~2 peaks/song), so peaks (and the peak-reach bend) were never
    // heard. The fixed ~24-bar window must keep peaks recurring here too.
    { genre: 'Blues', preset: 'Jazz Blues' },
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

            // Peaks must RECUR at a roughly constant musical rate (~24 bars),
            // independent of the progression length — the regression a 12-bar form
            // exposed. A peak window longer than ~32 bars (512 steps) means peaks
            // are too rare to register as a signature gesture (and the bend with
            // them). This is the assertion that actually catches the rate bug —
            // `length > 1` alone passed even at 2 peaks / 3.5 minutes.
            expect(sim.cycleLen, 'peak window must stay ~24 bars (≤32)').toBeLessThanOrEqual(512);
            // The form has multiple cycles, so multiple peaks should recur and sound.
            expect(peakPcs.length, 'cycle peaks should sound').toBeGreaterThan(1);
            expect(offTones, `every cycle peak must land tonic(0)/5th(7)`).toHaveLength(0);
            expect(density).toBeGreaterThan(0.05); // it plays
            expect(density).toBeLessThan(0.9); // …but it breathes
            expect(overlaps).toBe(0);
        });

        it(`${genre}: strong beats land chord tones, with guide tones outlining the changes`, () => {
            const sim = simulate(genre, preset);
            // Voice-leading (§5): strong beats (downbeat + bar midpoint) are
            // TARGETS — they should land functional chord tones, and a healthy
            // share should be GUIDE tones (3rd/7th) that actually define the
            // harmony, not just roots/5ths. (Strong beat = step 0 or 8 of the
            // 16-step bar, matching the engine's stepsPerBar=16, midBeat=8.)
            // #1058 — exclude seed-PINNED steps from the landing stats, like the apex
            // exclusion below: a Q&A question cadence is deliberately pinned to a
            // key-UNSTABLE tone (its strong-beat fallback is a designed appoggiatura,
            // #1009), and a hook cell is pinned to its own chord-tone stepping cycle
            // (#1056) — neither is a decision of the landing snap this test guards.
            // With inherited motifs recurring across sections these pins land on
            // strong beats often enough to dilute the rates the snap is measured by.
            const pinnedSteps = new Set(
                sim.seed.notes.filter((n: any) => n.qaRole || n.hookRole).map((n: any) => n.step),
            );
            let strong = 0;
            let chordTones = 0;
            let guideTones = 0;
            for (const e of sim.emitted as any[]) {
                if (e.step >= sim.loopLen || !e.chord) {
                    continue;
                }
                const sib = e.step % 16;
                if (sib !== 0 && sib !== 8) {
                    continue;
                }
                if (pinnedSteps.has(((e.step % sim.loopLen) + sim.loopLen) % sim.loopLen)) {
                    continue;
                }
                strong++;
                const pc = ((e.midi % 12) + 12) % 12;
                const { guides, pillars } = chordTargetTones(e.chord.rootMidi, e.chord.quality);
                if (pillars.includes(pc)) {
                    chordTones++;
                }
                if (guides.includes(pc)) {
                    guideTones++;
                }
            }
            const chordRate = chordTones / Math.max(1, strong);
            const guideRate = guideTones / Math.max(1, strong);

            // --- Weak-beat APPROACH resolves BY STEP into the landing (§5) ---
            // The landing stats above only sample strong beats; this measures the
            // OTHER half — the approach mechanism on weak beats. A note in the
            // pickup right before a strong beat should resolve INTO that landing by
            // a true scale step (≤2 semitones), not a leap. This is the assertion
            // that guards `diatonicNeighbor` against the chromatic-target minor-
            // third-leap bug the review caught (invisible to the landing stats).
            // Apex notes are excluded — the money-note peak is a deliberate reach,
            // not an approach.
            const apexSet = sim.apexSteps as Set<number>;
            let approaches = 0;
            let byStep = 0;
            const inForm2 = (sim.emitted as any[]).filter((e) => e.step < sim.loopLen);
            for (let i = 0; i < inForm2.length - 1; i++) {
                const a = inForm2[i];
                const b = inForm2[i + 1];
                const bStrong = b.step % 16 === 0 || b.step % 16 === 8;
                const aWeak = a.step % 16 !== 0 && a.step % 16 !== 8;
                const gap = b.step - a.step;
                if (!bStrong || !aWeak || gap < 1 || gap > 2) {
                    continue; // the engine's approach window is the last eighth (≤2 steps)
                }
                if (apexSet.has(((a.step % sim.loopLen) + sim.loopLen) % sim.loopLen)) {
                    continue; // a reach off the peak isn't an approach
                }
                approaches++;
                if (Math.abs(b.midi - a.midi) <= 2) {
                    byStep++;
                }
            }
            const stepRate = byStep / Math.max(1, approaches);

            console.log(
                `[${genre}] strongBeats=${strong} chordTone=${(chordRate * 100).toFixed(0)}% ` +
                    `guideTone=${(guideRate * 100).toFixed(0)}% approaches=${approaches} ` +
                    `byStep=${(stepRate * 100).toFixed(0)}%`,
            );
            // The vast majority of strong beats outline the harmony (observed
            // 97-100%; this guards that voice-leading is active on strong beats —
            // raw contour notes would drop it well below)…
            expect(chordRate).toBeGreaterThan(0.9);
            // …guide tones (3rd/7th) appear on a healthy share, above the random-
            // among-chord-tones baseline (~33% maj / 50% dom) — the line prefers
            // the harmony-defining tones, not just roots/5ths (observed 44-62%)…
            expect(guideRate).toBeGreaterThan(0.4);
            // …and weak-beat approaches resolve INTO the landing BY STEP, not by a
            // leap — the leading-tone mechanism. Observed 70-93%; the shortfall from
            // 100% is the bounded one-point lookahead (a distance-2 "and" before a
            // chord change, or a gated target) — at most a scale-step off, never the
            // minor-third leap the chromatic-target bug produced (which dropped this
            // well below the threshold, especially on dominant-heavy Blues).
            expect(approaches).toBeGreaterThan(5); // the mechanism actually fires
            expect(stepRate).toBeGreaterThan(0.6);
        });
    }
});
