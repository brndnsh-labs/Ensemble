// @ts-nocheck
// Soloist musicality & thematic integrity critique — PRODUCTION-FAITHFUL on the
// live engine (getSoloistNotePhraseFirst). Rerouted from the retired legacy
// getSoloistNote (epic #10, #863). Real dispatch-built state, a real seed, an
// absolute advancing step with currentLoopCount per loop (mirrors scheduler-core),
// scanned across a full macro-form over a jazz progression.
//
// What this guards: the live line RESOLVES ONTO CHORD TONES — phrase-first's §5
// voice-leading keystone pulls strong-beat notes onto guide/functional chord
// tones (landOnTarget), and the developed body stays in-key. And it stays inside
// a sane register.
//
// DROPPED (dark on phrase-first): the legacy "Conclusion vs Departure" SRDC
// asymmetry test mutated `soloist.srdcState` and measured a LIVE per-tick
// chord-tone re-bias. Phrase-first bakes SRDC structure into the SEED at
// generation time and never reads a live `srdcState` per tick, so that
// asymmetry is not a live behavior here — the assertion is intentionally
// dropped, not loosened. (dark; re-added by #869/#870 if a live SRDC tilt is ported)
import { describe, expect, it } from 'vitest';
import { CHORD_PRESETS } from '../../public/data/chord-presets.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { getSoloistNotePhraseFirst } from '../../public/engine/soloist-phrase-first.js';
import { generateSessionSeed } from '../../public/engine/soloist-seeder.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

function buildState(presetName: string) {
    dispatch(ACTIONS.RESET_STATE);
    dispatch(ACTIONS.SET_TIME_SIGNATURE, '4/4');
    dispatch(ACTIONS.SET_KEY, 'C');
    dispatch(ACTIONS.UPDATE_GB, { enabled: true, genreFeel: 'Jazz' });
    dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'smart', mode: 'monophonic' });
    dispatch(ACTIONS.SET_BAND_INTENSITY, 0.6);
    dispatch(ACTIONS.SET_BPM, 120);
    const state = getState();
    const preset = CHORD_PRESETS.find((p) => p.name === presetName);
    state.arranger.key = 'C';
    state.arranger.isMinor = false;
    state.arranger.sections = preset.sections.map((s, i) => ({ ...s, id: `p-${i}` }));
    validateProgression(state);
    return state;
}

function simulate(presetName = 'Jazz Blues') {
    const state = buildState(presetName);
    const seed = generateSessionSeed(state, state.arranger, 'smart', 0.6, 'MUSICALITY_CRITIQUE');
    state.soloist.session.seed = seed;
    state.soloist.session.phrasing.isResting = false;

    const loopLen = seed.loopLengthSteps || state.arranger.totalSteps;
    const total = state.arranger.totalSteps;
    const stepMap = state.arranger.stepMap;
    const chordByStep = Array.from(
        { length: total },
        (_, step) => stepMap.find((entry: any) => step >= entry.start && step < entry.end)?.chord,
    );
    const chordAt = (s: number) => {
        const w = ((s % total) + total) % total;
        return chordByStep[w] || null;
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
            if (typeof n.midi === 'number') {
                notes.push({
                    midi: n.midi,
                    chord,
                    isStrongBeat: abs % 16 === 0 || abs % 16 === 8,
                });
            }
        }
    }
    return notes;
}

const simulations = new Map<string, ReturnType<typeof simulate>>();
function simulationFor(presetName: string) {
    let notes = simulations.get(presetName);
    if (!notes) {
        notes = simulate(presetName);
        simulations.set(presetName, notes);
    }
    return notes;
}

const isChordTone = (n: any) => {
    const rel = (((n.midi - n.chord.rootMidi) % 12) + 12) % 12;
    return (n.chord.intervals ?? []).some((iv: number) => ((iv % 12) + 12) % 12 === rel);
};

describe('Soloist Musicality & Thematic Integrity (phrase-first)', () => {
    it('resolves the line onto chord tones, hardest on strong beats (voice-leading)', () => {
        const notes = simulationFor('Jazz Blues');
        expect(notes.length).toBeGreaterThan(80);

        const strong = notes.filter((n) => n.isStrongBeat);
        expect(strong.length).toBeGreaterThan(20);

        const overallShare = notes.filter(isChordTone).length / notes.length;
        const strongShare = strong.filter(isChordTone).length / strong.length;

        console.log('\n--- SOLOIST MUSICALITY CRITIQUE (phrase-first) ---');
        console.log(`notes=${notes.length} strong=${strong.length}`);
        console.log(`[Overall chord-tone share] ${(overallShare * 100).toFixed(1)}%`);
        console.log(`[Strong-beat chord-tone]   ${(strongShare * 100).toFixed(1)}%`);
        console.log('--------------------------------------------\n');

        // Baseline: a jazz 7th chord covers 4 of 12 chromatic pitch classes →
        // 33% uniform-random chord-tone rate. Live phrase-first lands 59.8%
        // overall and 85.0% on strong beats (the §5 voice-leading keystone pulls
        // downbeat/midpoint notes onto guide/functional chord tones). Deterministic
        // (seeded scrambleHash; identical across runs).
        // Overall: 0.50 is 17pp above the 33% baseline with ~10pp live headroom.
        expect(overallShare).toBeGreaterThan(0.5);
        // Strong beats: 0.72 is 39pp above baseline with ~13pp live headroom —
        // this is the real claim, the line RESOLVES where it matters metrically.
        expect(strongShare).toBeGreaterThan(0.72);
        // And it resolves HARDER on strong beats than overall (the voice-leading
        // asymmetry): live gap is 25.2pp; >0.10 guards the asymmetry with headroom.
        expect(strongShare - overallShare).toBeGreaterThan(0.1);
    });

    it('keeps every note inside the soloist register', () => {
        const notes = simulationFor('Jazz Blues');
        // Register contract (coordination-engine): soloist priority 60-90, clamp
        // only below MIDI 52; the engine caps the apex money note at 90 and folds
        // the developed body under 88. Live range is min=55 max=87 — assert the
        // contract bounds [52, 90] so a regression that lets the line fly out of
        // register (octave-fold bug, runaway apex reach) fails loudly.
        for (const n of notes) {
            expect(n.midi).toBeGreaterThanOrEqual(52);
            expect(n.midi).toBeLessThanOrEqual(90);
        }
        const lo = Math.min(...notes.map((n) => n.midi));
        const hi = Math.max(...notes.map((n) => n.midi));
        console.log(`[Register] min=${lo} max=${hi}`);
        expect(lo).toBeGreaterThanOrEqual(52);
        expect(hi).toBeLessThanOrEqual(90);
    });
});
