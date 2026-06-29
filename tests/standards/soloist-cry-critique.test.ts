// @ts-nocheck
// Soloist "cry" (bend-and-release) critique — PRODUCTION-FAITHFUL on the live
// engine (getSoloistNotePhraseFirst). Guards the #869 port: the expressive
// blues/rock cry — a sustained note bends UP to a chord tone mid-ring, then
// releases — must fire SPARINGLY on structural landings, target a real chord
// tone, and stay OFF non-bend genres (the genre gate). Re-establishes the
// coverage the deleted legacy soloist-bend-expression.test.ts had.
//
// The cry is `note.expression.bend` (PitchBendGesture), distinct from the
// one-way `bendStartInterval` entry-scoop. Whole downstream (synth render +
// .mid export) was already wired (#744/#854); #869 added the producer.
import { describe, expect, it } from 'vitest';
import { CHORD_PRESETS } from '../../public/data/chord-presets.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { getSoloistNotePhraseFirst } from '../../public/engine/soloist-phrase-first.js';
import { generateSessionSeed } from '../../public/engine/soloist-seeder.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

function buildState(genreFeel: string, presetName: string) {
    dispatch(ACTIONS.RESET_STATE);
    dispatch(ACTIONS.SET_TIME_SIGNATURE, '4/4');
    dispatch(ACTIONS.SET_KEY, 'C');
    dispatch(ACTIONS.UPDATE_GB, { enabled: true, genreFeel });
    dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'smart', mode: 'guitar' });
    dispatch(ACTIONS.SET_BAND_INTENSITY, 0.85);
    dispatch(ACTIONS.SET_BPM, 100);
    const state = getState();
    const preset = CHORD_PRESETS.find((p) => p.name === presetName);
    state.arranger.key = 'C';
    state.arranger.isMinor = presetName === 'Minor Blues';
    state.arranger.sections = preset.sections.map((s, i) => ({ ...s, id: `c-${i}` }));
    validateProgression(state);
    return state;
}

function simulate(genreFeel: string, presetName: string) {
    const state = buildState(genreFeel, presetName);
    const seed = generateSessionSeed(state, state.arranger, 'smart', 0.85, `CRY_${genreFeel}`);
    state.soloist.session.seed = seed;
    state.soloist.session.phrasing.isResting = false;

    const loopLen = seed.loopLengthSteps || state.arranger.totalSteps;
    const total = state.arranger.totalSteps;
    const stepMap = state.arranger.stepMap;
    const chordAt = (s: number) => {
        const w = ((s % total) + total) % total;
        return stepMap.find((e: any) => w >= e.start && w < e.end)?.chord || null;
    };

    const notes: any[] = [];
    for (let abs = 0; abs < loopLen * 3 + 64; abs++) {
        state.playback.currentLoopCount = Math.floor(abs / total);
        const chord = chordAt(abs);
        const res = getSoloistNotePhraseFirst(
            state,
            chord,
            chordAt(abs + 1),
            abs,
            null,
            state.soloist.octave,
            'smart',
            abs % 16,
            {},
            { isDownbeat: abs % 16 === 0, isMeasureStart: abs % 16 === 0 },
        );
        if (!res || !chord) {
            continue;
        }
        for (const n of Array.isArray(res) ? res : [res]) {
            if (typeof n.midi === 'number' && !n.isDoubleStop) {
                notes.push(n);
            }
        }
    }
    return notes;
}

const STEPS_PER_BEAT = 4; // 4/4, 16 steps/bar

function cryStats(notes: any[]) {
    const cries = notes.filter((n) => n.expression?.bend);
    return { total: notes.length, cries };
}

describe('Soloist cry — bend-and-release (#869)', () => {
    it('fires sparingly on sustained blues landings, targeting a chord tone', () => {
        const notes = simulate('Blues', '12-Bar Blues');
        const { total, cries } = cryStats(notes);
        const rate = cries.length / total;

        console.log('\n--- SOLOIST CRY CRITIQUE: BLUES ---');
        console.log(`notes=${total} cries=${cries.length} rate=${(rate * 100).toFixed(1)}%`);
        console.log(
            `peakSemitones seen: ${[...new Set(cries.map((c) => c.expression.bend.peakSemitones))].join(',')}`,
        );
        console.log(
            `cry durations (steps): ${[...new Set(cries.map((c) => c.durationSteps))].sort((a, b) => a - b).join(',')}`,
        );

        // Fires as a real presence (the whole point — dark in production pre-#869).
        // Deterministic (seeded, no Math.random): 33 observed; floor leaves headroom
        // for engine evolution without letting it silently fall back to ~nothing.
        expect(cries.length).toBeGreaterThanOrEqual(12);
        // SPARSE — a punctuation, not a constant trill (§10 restraint). 2.1%
        // observed; the ceiling catches a regression that sprays the cry on every
        // sustained note (it lives only on phrase-enders between peaks).
        expect(rate).toBeLessThan(0.06);
        // Every cry is a real bend-and-release to a chord tone 1–2 semitones up.
        for (const c of cries) {
            const b = c.expression.bend;
            expect([1, 2]).toContain(b.peakSemitones);
            // The vocal arc: leave the pitch, peak, then release back down.
            expect(b.onsetFrac).toBeLessThan(b.peakFrac);
            expect(b.peakFrac).toBeLessThan(b.releaseFrac);
            // Only on a note with room to bend up and release (sustained ≥ 1.25 beats).
            expect(c.durationSteps).toBeGreaterThanOrEqual(Math.ceil(1.25 * STEPS_PER_BEAT));
            // The cry owns the lead voice — never stacked on an entry-scoop.
            expect(c.bendStartInterval || 0).toBe(0);
        }
    });

    it('also cries in rock (the other string-bend idiom)', () => {
        const notes = simulate('Rock', '50s Rock');
        const { cries } = cryStats(notes);
        console.log(`\n--- SOLOIST CRY CRITIQUE: ROCK --- cries=${cries.length}`);
        expect(cries.length).toBeGreaterThanOrEqual(10); // 26 observed
    });

    it('does NOT cry in jazz (genre gate — jazz does not bend-and-release)', () => {
        const notes = simulate('Jazz', 'Jazz Blues');
        const { cries } = cryStats(notes);
        console.log(`\n--- SOLOIST CRY CRITIQUE: JAZZ (control) --- cries=${cries.length}`);
        expect(cries.length).toBe(0);
    });
});
