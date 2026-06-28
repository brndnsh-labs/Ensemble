// @ts-nocheck
// Soloist rest-cadence critique — PRODUCTION-FAITHFUL on the live engine
// (getSoloistNotePhraseFirst). Rerouted from the retired legacy getSoloistNote
// (epic #10, #863).
//
// What this guards: the LIVE soloist breathes. Phrase-first emits rests as null
// returns (and publishes phr.isResting) between phrases. The original S14
// motivation was that the retired engine could run 50-90 bars without a rest
// entry over the All Blues reference.
//
// IMPORTANT — the legacy framing of "breath" was WHOLE-BAR rests (rest entries
// per N bars / max active-streak < 16 bars). That framing is FALSE for
// phrase-first: it rests at the SUB-BAR (tick) level — note/rest/note/rest
// inside a phrase — so it plays at least one note in nearly every bar (probed
// max active-streak was 377-425 bars). The whole-bar rest-cadence and
// per-bar-rest-entry assertions are therefore DROPPED (engine breathes at a
// finer granularity now). What survives, and what this test re-asserts, is the
// genuine LIVE breath signal: a substantial fraction of ticks are rests AND the
// engine never runs many consecutive note-ticks without a breath.
//
// The harness mirrors soloist-rock-critique exactly (dispatch-built production
// state, generateSessionSeed, an absolute advancing step with currentLoopCount
// per loop). Rest cadence is read from null returns — the engine's actual rest
// signal — at TICK granularity.
import { describe, expect, it } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { CHORD_PRESETS } from '../../public/data/chord-presets.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { getSoloistNotePhraseFirst } from '../../public/engine/soloist-phrase-first.js';
import { generateSessionSeed } from '../../public/engine/soloist-seeder.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

function buildState(presetName: string, intensity: number) {
    dispatch(ACTIONS.RESET_STATE);
    dispatch(ACTIONS.SET_KEY, 'C');
    dispatch(ACTIONS.UPDATE_GB, { enabled: true, genreFeel: 'Jazz' });
    dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'smart', mode: 'monophonic' });
    dispatch(ACTIONS.SET_BAND_INTENSITY, intensity);
    dispatch(ACTIONS.SET_BPM, 110);
    const state = getState();
    const preset = CHORD_PRESETS.find((p) => p.name === presetName);
    const ts = preset.settings?.timeSignature || preset.sections[0]?.timeSignature || '4/4';
    dispatch(ACTIONS.SET_TIME_SIGNATURE, ts);
    state.arranger.key = 'C';
    state.arranger.isMinor = false;
    state.arranger.sections = preset.sections.map((s, i) => ({ ...s, id: `p-${i}` }));
    validateProgression(state);
    return state;
}

// Drive the live engine over a full macro-form and collect tick-level rest
// cadence. A tick is a rest when the engine returns null. We track the rest
// fraction and the longest unbroken run of note-ticks (the breath gap).
function collectRestCadence(presetName: string, intensity: number, seedStr: string) {
    const state = buildState(presetName, intensity);
    const seed = generateSessionSeed(state, state.arranger, 'smart', intensity, seedStr);
    state.soloist.session.seed = seed;
    state.soloist.session.phrasing.isResting = false;

    const tsName = state.arranger.timeSignature || '4/4';
    const ts = TIME_SIGNATURES[tsName];
    const stepsPerBar = ts.beats * ts.stepsPerBeat;

    const loopLen = seed.loopLengthSteps || state.arranger.totalSteps;
    const total = state.arranger.totalSteps;
    const stepMap = state.arranger.stepMap;
    const chordAt = (s: number) => {
        const w = ((s % total) + total) % total;
        return stepMap.find((e: any) => w >= e.start && w < e.end)?.chord || null;
    };

    const lastAbs = loopLen * 3 + 64;
    const numBars = Math.floor(lastAbs / stepsPerBar);

    let restTicks = 0;
    let noteTicks = 0;
    let maxRunNoteTicks = 0; // longest run of notes with no breath
    let runNoteTicks = 0;

    for (let abs = 0; abs < lastAbs; abs++) {
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
            abs % stepsPerBar,
            {},
            { isDownbeat: abs % stepsPerBar === 0, isMeasureStart: abs % stepsPerBar === 0 },
        );
        const hasNote =
            !!res &&
            (Array.isArray(res)
                ? res.some((n: any) => typeof n?.midi === 'number')
                : typeof res.midi === 'number');
        if (hasNote) {
            noteTicks++;
            runNoteTicks++;
            if (runNoteTicks > maxRunNoteTicks) {
                maxRunNoteTicks = runNoteTicks;
            }
        } else {
            restTicks++;
            runNoteTicks = 0;
        }
    }

    const totalTicks = restTicks + noteTicks;
    const restTickFraction = totalTicks > 0 ? restTicks / totalTicks : 1;

    return { restTicks, noteTicks, restTickFraction, maxRunNoteTicks, numBars, stepsPerBar };
}

describe('Soloist Rest-Cadence Critique (phrase-first)', () => {
    // Baseline reasoning (same for every case below): a soloist that DOESN'T
    // breathe plays a note on every tick -> restTickFraction = 0; one that has
    // gone silent rests on every tick -> restTickFraction = 1. The live-breath
    // claim is two-sided: the engine rests a substantial share of ticks AND
    // still plays a substantial share. The maxRun guard is the faithful
    // translation of the legacy anti-regression ("never runs 50-90 bars without
    // a breath", which was ~800-1440 continuous ticks): here, the longest
    // unbroken note run must stay well under ~2 bars.
    it('All Blues (6/8) at intensity 0.7: the lead breathes at the tick level', () => {
        const r = collectRestCadence('All Blues', 0.7, 'REST_AB_07');
        console.log(
            `\n[AllBlues 0.7] notes=${r.noteTicks} rests=${r.restTicks} restFrac=${r.restTickFraction.toFixed(3)} maxRun=${r.maxRunNoteTicks} (stepsPerBar=${r.stepsPerBar})`,
        );
        // Live: restFrac=0.487. Floor 0.35 (vs 0 non-breathing baseline) ~14pp
        // headroom; ceiling 0.88 (vs 1 silent baseline) guards "still plays".
        expect(r.restTickFraction).toBeGreaterThan(0.35);
        expect(r.restTickFraction).toBeLessThan(0.88);
        // Live: maxRun=9 ticks (<1 bar of 12). <24 catches any regression toward
        // multi-bar continuous runs (legacy bug was ~800+); 15-tick headroom.
        expect(r.maxRunNoteTicks).toBeLessThan(24);
        // Harness-liveness sanity (not a behavior claim): the engine produced
        // notes at all. Live=2620.
        expect(r.noteTicks).toBeGreaterThan(200);
    });

    // NOTE — the legacy test claimed lower intensity breathes MORE. Phrase-first
    // does NOT show that: restFrac at 0.5 (0.503) is within ~1.6pp of 0.7
    // (0.487), well inside noise, so a directional "0.5 > 0.7" assertion would be
    // a false claim on this engine. Dropped; each intensity is asserted to
    // breathe independently instead.
    it('All Blues (6/8) at intensity 0.5: still breathes', () => {
        const r = collectRestCadence('All Blues', 0.5, 'REST_AB_05');
        console.log(
            `\n[AllBlues 0.5] notes=${r.noteTicks} rests=${r.restTicks} restFrac=${r.restTickFraction.toFixed(3)} maxRun=${r.maxRunNoteTicks} (stepsPerBar=${r.stepsPerBar})`,
        );
        // Live: restFrac=0.503, maxRun=8.
        expect(r.restTickFraction).toBeGreaterThan(0.35);
        expect(r.restTickFraction).toBeLessThan(0.88);
        expect(r.maxRunNoteTicks).toBeLessThan(24);
    });

    it('Jazz Blues (4/4) at intensity 0.7: breathes at the tick level', () => {
        const r = collectRestCadence('Jazz Blues', 0.7, 'REST_JB_07');
        console.log(
            `\n[JazzBlues 0.7] notes=${r.noteTicks} rests=${r.restTicks} restFrac=${r.restTickFraction.toFixed(3)} maxRun=${r.maxRunNoteTicks} (stepsPerBar=${r.stepsPerBar})`,
        );
        // Live: restFrac=0.758 (4/4 jazz is breathier than the 6/8 modal vamp).
        // Floor 0.45 (~30pp over 0 baseline); ceiling 0.92 guards "still plays".
        expect(r.restTickFraction).toBeGreaterThan(0.45);
        expect(r.restTickFraction).toBeLessThan(0.92);
        // Live: maxRun=2 ticks — extremely breathy. <24 stays consistent with the
        // 6/8 cases and catches a regression to wall-to-wall runs.
        expect(r.maxRunNoteTicks).toBeLessThan(24);
    });
});
