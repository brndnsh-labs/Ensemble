// @ts-nocheck
// Blues soloist idiom critique — PRODUCTION-FAITHFUL on the live engine
// (getSoloistNotePhraseFirst). Rerouted from the retired legacy getSoloistNote
// (epic #10, #863). Real dispatch-built state, a real seed, an absolute advancing
// step with currentLoopCount per loop (mirrors scheduler-core), scanned across a
// full macro-form over a dom7 (12-bar blues) progression — the natural home of
// the blues palette.
//
// What this guards: the blues lead stays on its blues/pentatonic palette and in a
// singable register over a dom7 macro-form.
//
// DROPPED (dark — produced ONLY by the retired legacy engine, never by
// phrase-first; re-added by #869/#870):
//  - Call/Response role alternation + role-aware phrase-end resolution: relied on
//    `soloist.session.currentPhrase.context.role`, which phrase-first never
//    populates (it manages only `phrasing.isResting`).
//  - Device-burying invariant + bluesTurnaround embellishment: relied on
//    `rhythm.plan` / `deviceBuffer` / `embellishmentBuffer` — legacy rhythm-plan
//    machinery phrase-first does not use. Devices (bluesLick, slide, turnarounds)
//    are a legacy-only emission.
// Double-stops (this style sets doubleStopProb 0.35) are guarded by
// phrase-first-double-stop-critique, not here.
import { describe, expect, it } from 'vitest';
import { CHORD_PRESETS } from '../../public/data/chord-presets.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { resolveSoloistStyle } from '../../public/engine/soloist-config.js';
import { getSoloistNotePhraseFirst } from '../../public/engine/soloist-phrase-first.js';
import { generateSessionSeed } from '../../public/engine/soloist-seeder.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

function buildState(presetName: string) {
    dispatch(ACTIONS.RESET_STATE);
    dispatch(ACTIONS.SET_TIME_SIGNATURE, '4/4');
    dispatch(ACTIONS.SET_KEY, 'C');
    dispatch(ACTIONS.UPDATE_GB, { enabled: true, genreFeel: 'Blues' });
    dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'smart', mode: 'guitar' });
    dispatch(ACTIONS.SET_BAND_INTENSITY, 0.85);
    dispatch(ACTIONS.SET_BPM, 100);
    const state = getState();
    const preset = CHORD_PRESETS.find((p) => p.name === presetName);
    state.arranger.key = 'C';
    state.arranger.isMinor = false;
    state.arranger.sections = preset.sections.map((s, i) => ({ ...s, id: `p-${i}` }));
    validateProgression(state);
    return state;
}

function simulate(presetName = '12-Bar Blues') {
    const state = buildState(presetName);
    const seed = generateSessionSeed(state, state.arranger, 'smart', 0.85, 'BLUES_CRITIQUE');
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
                notes.push({ midi: n.midi, chordRoot: chord.rootMidi });
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

describe('Blues Soloist Authenticity (phrase-first)', () => {
    it('keeps the blues lead on its blues/pentatonic palette over a dom7 progression', () => {
        const notes = simulationFor('12-Bar Blues');
        expect(notes.length).toBeGreaterThan(50);

        // Blues scale {0,3,5,6,7,10} (minor pentatonic + the blue b5). PENT_BLUES
        // adds the major-pentatonic color tones {2,4,9} that a blues line freely
        // borrows over dom7. Both are hard-coded target sets (NOT the engine's own
        // scale lookup), so the adherence claim is not a tautology.
        const BLUES_SCALE = new Set([0, 3, 5, 6, 7, 10]);
        const PENT_BLUES = new Set([0, 3, 5, 6, 7, 10, 2, 4, 9]);

        let pentBlues = 0;
        let bluesScale = 0;
        for (const n of notes) {
            const rel = (n.midi - n.chordRoot + 120) % 12;
            if (PENT_BLUES.has(rel)) {
                pentBlues++;
            }
            if (BLUES_SCALE.has(rel)) {
                bluesScale++;
            }
        }
        const pentBluesShare = pentBlues / notes.length;
        const bluesScaleShare = bluesScale / notes.length;

        console.log('\n--- BLUES SOLOIST CRITIQUE (phrase-first) ---');
        console.log(`notes=${notes.length}`);
        console.log(`[Pent/Blues share] ${(pentBluesShare * 100).toFixed(1)}% (baseline 75%)`);
        console.log(`[Blues scale]      ${(bluesScaleShare * 100).toFixed(1)}% (baseline 50%)`);
        console.log('--------------------------------------------\n');

        // Palette adherence: the blues lead stays on the blues/pentatonic palette,
        // spilling chromatic only modestly. baseline = 9/12 = 0.75 chromatic. Live
        // phrase-first delivers 92.2% over the 12-bar dom7 macro-form; >0.85 sits
        // 10pp above baseline with ~7pp headroom, guarding against a regression that
        // lets the line wander atonal. (Deterministic — seeded scrambleHash.)
        expect(pentBluesShare).toBeGreaterThan(0.85);

        // NOTE — the legacy critique leaned on blue-note-core phrasing (call/response
        // resolution onto the b3/b5/b7). Phrase-first is theme-based and draws on the
        // full chord scale, so the blues-scale core share (54.3%) sits only ~4pp above
        // its 6/12 = 50% chromatic baseline — within noise, NOT a real bias. Asserting
        // a blue-note core bias would be a false claim on this engine, so it's dropped
        // (logged for visibility). Restoring the blue-note feel is a candidate for the
        // idiom ports tracked in #870.
        expect(bluesScaleShare).toBeGreaterThan(0); // notes exist; not a palette guard
    });

    it('keeps the blues lead in a singable mid register', () => {
        const notes = simulationFor('12-Bar Blues');
        const midis = notes.map((n) => n.midi);
        const lo = Math.min(...midis);
        const hi = Math.max(...midis);
        const mean = midis.reduce((s, m) => s + m, 0) / midis.length;
        console.log(`[register] lo=${lo} hi=${hi} mean=${mean.toFixed(1)}`);
        // Register-slotting invariant (enforceRegisterSlotting, coordination-engine):
        // soloist priority lane is 60–90, clamped only when a note would fall below
        // MIDI 52. Live phrase-first: lo=52, hi=88, mean=71.9. These assert the slot
        // clamp actually holds in production AND that the line camps in a singable mid
        // register rather than drifting to an extreme.
        expect(lo).toBeGreaterThanOrEqual(52); // slotting floor
        expect(hi).toBeLessThanOrEqual(90); // soloist priority ceiling
        // mean 71.9 sits mid-lane; band gives ~10pt headroom each side.
        expect(mean).toBeGreaterThan(62);
        expect(mean).toBeLessThan(80);
    });

    // Style-resolution guard — does not touch the engine, kept verbatim.
    it('resolves Blues genre/style to the canonical soloist profile', () => {
        expect(resolveSoloistStyle('smart', 'Blues')).toBe('blues');
        expect(resolveSoloistStyle(undefined, 'Blues')).toBe('blues');
        expect(resolveSoloistStyle('blues', 'Blues')).toBe('blues');
    });
});
