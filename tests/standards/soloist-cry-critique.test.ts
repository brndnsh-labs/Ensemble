// @ts-nocheck
// Soloist "cry" critique — PRODUCTION-FAITHFUL on the live engine
// (getSoloistNotePhraseFirst). Guards the #869 port + the #960 resolution fix:
// the expressive blues/rock cry — a sustained note bends UP to a chord tone
// mid-ring — must fire SPARINGLY on structural landings, target a real chord
// tone, stay OFF non-bend genres (the genre gate), and by default HOLD the bent
// target (the destination note is the point). Bend-and-release (returning to the
// pre-bend pitch) is a minority flutter, not the default. Re-establishes the
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

function simulate(genreFeel: string, presetName: string, seedStr = `CRY_${genreFeel}`) {
    const state = buildState(genreFeel, presetName);
    const seed = generateSessionSeed(state, state.arranger, 'smart', 0.85, seedStr);
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
    // 60s timeout (#1188): this test drives the real seeder + live phrase-first
    // engine over a 6-seed sweep of ~3.5 loops each — ~17s idle, ~21s in-suite on
    // a 7-core box, against the global 30s testTimeout. That margin evaporates
    // under machine load (a concurrent test process roughly doubles wall time),
    // so it reddened full runs intermittently on any branch. The runtime is
    // legitimate work, not a hang — the assertions below are seeded and
    // deterministic. Raised here per-test rather than globally so a genuine hang
    // anywhere else still trips at 30s. The other two tests in this file (~1-4s)
    // deliberately keep the global limit.
    it('fires sparingly on sustained blues landings, targeting a chord tone', {
        timeout: 60_000,
    }, () => {
        // 6-seed sweep (#1058): a single seed now yields only ~8-10 cries — far too
        // small a sample for the hold-vs-release ratio below to mean anything (the
        // flutter is a fixed 25% per-(step,loop) hash in the engine, so which cries
        // flutter is hash-POSITION luck per seed). Aggregate across seeds so both the
        // presence floor and the ratio converge toward the mechanism's real numbers.
        const notes = ['', '_B', '_C', '_D', '_E', '_F'].flatMap((sfx) =>
            simulate('Blues', '12-Bar Blues', `CRY_Blues${sfx}`),
        );
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
        // Deterministic (seeded, no Math.random): 91 observed across the 6-seed
        // aggregate (~15/seed; pre-#1058 a single seed gave ~33 — inherited
        // restatements subdivide/displace some of the long landings the cry fed on,
        // so per-seed counts vary more now). Floor 45 guards the dark-in-production
        // regression (~0) with 2× headroom; whether the new sparser per-seed cadence
        // is ENOUGH blues punctuation is an ear call flagged at the #1058 listen gate.
        expect(cries.length).toBeGreaterThanOrEqual(45);
        // SPARSE — a punctuation, not a constant trill (§10 restraint). 2.1%
        // observed; the ceiling catches a regression that sprays the cry on every
        // sustained note (it lives only on phrase-enders between peaks).
        expect(rate).toBeLessThan(0.06);
        // #960: bend-up-and-HOLD is the default resolution — a bend's point is its
        // destination chord tone, so a player bends up and sustains it; releasing
        // back down (bend-and-release) is a MINORITY flutter, not every cry. The
        // held cries omit releaseFrac (the synth/sampled voice sustains the peak).
        const held = cries.filter((c) => !Number.isFinite(c.expression.bend.releaseFrac));
        const released = cries.filter((c) => Number.isFinite(c.expression.bend.releaseFrac));
        console.log(`held=${held.length} released=${released.length}`);
        // Most cries hold the bent target (arrive-and-sustain, not up-and-down) —
        // hold should be the clear default (~75/25), not a bare coin-flip majority.
        expect(held.length).toBeGreaterThan(released.length * 2);
        // ...but the expressive flutter still fires occasionally — don't kill it.
        expect(released.length).toBeGreaterThanOrEqual(1);

        for (const c of cries) {
            const b = c.expression.bend;
            // Bend up to a chord tone 1–2 semitones above the written note.
            expect([1, 2]).toContain(b.peakSemitones);
            // The note speaks first, then bends up to the tone.
            expect(b.onsetFrac).toBeLessThan(b.peakFrac);
            // A held cry sustains the peak (no release); a flutter releases back
            // down, strictly after the peak.
            if (Number.isFinite(b.releaseFrac)) {
                expect(b.peakFrac).toBeLessThan(b.releaseFrac);
            }
            // Only on a note with room to bend up (sustained ≥ 1.25 beats).
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
