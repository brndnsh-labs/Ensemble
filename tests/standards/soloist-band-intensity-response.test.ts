// @ts-nocheck
// Critique test for #1004 — "give the soloist ears" (slice A).
//
// The band already moves with `bandIntensity` (density tiers, limiter, motif
// ceilings); before this change the foreground voice was deaf to it, playing the
// same density and weight through a build, a drop, a breakdown. This guards the
// live arc-response: holding the phrase seed FIXED and varying only the live
// `playback.bandIntensity`, the lead must get sparser + softer at low energy and
// busier + harder at high energy — MONOTONICALLY. It isolates the live gate
// (activityAt) and velocity terms, which is exactly what slice A adds; the
// coordination-transition read (rest into turnarounds) is a separate slice (#1020).
//
// Production-faithful: a real seeder, a real progression, an ABSOLUTE advancing
// step with `currentLoopCount` incremented every arrangement loop (mirroring
// scheduler-core), scanned across a full macro-form. The ONLY variable across the
// three runs is `playback.bandIntensity` — same seed, same steps, same loop counts.
import { describe, expect, it } from 'vitest';
import { CHORD_PRESETS } from '../../public/data/chord-presets.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { getSoloistNotePhraseFirst } from '../../public/engine/soloist-phrase-first.js';
import { generateSessionSeed } from '../../public/engine/soloist-seeder.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

// Two genres in different energy regimes: Rock (the #1004 listen-checklist setting,
// a busy line with ornament headroom to thin and fill) and Jazz (legitimately
// quiet — a sparse bed, where the thinning has to still read at low intensity). The
// terms are genre-agnostic, so both must show the same monotonic arc.
const PRESET = 'Pop (Standard)';

// The seed is conceived once, at a neutral energy, then PERFORMED at three live
// intensities — matching production, where the phrase is seeded on play and the
// conductor moves the intensity underneath it.
const SEED_INTENSITY = 0.6;

function buildState(genre: string) {
    dispatch(ACTIONS.RESET_STATE);
    dispatch(ACTIONS.SET_TIME_SIGNATURE, '4/4');
    dispatch(ACTIONS.SET_KEY, 'C');
    dispatch(ACTIONS.UPDATE_GB, { enabled: true, genreFeel: genre });
    dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'smart' });
    dispatch(ACTIONS.SET_BAND_INTENSITY, SEED_INTENSITY);
    dispatch(ACTIONS.SET_BPM, 120);
    const state = getState();
    const preset = CHORD_PRESETS.find((p) => p.name === PRESET);
    state.arranger.key = 'C';
    state.arranger.isMinor = false;
    state.arranger.sections = preset.sections.map((s, i) => ({ ...s, id: `p-${i}` }));
    validateProgression(state);
    return state;
}

// Perform ONE fixed seed across a full macro-form at a given live intensity.
// Returns emitted-note count (density) and mean lead velocity (weight).
function performAt(state: any, seed: any, intensity: number) {
    state.soloist.session.seed = seed;
    state.soloist.session.phrasing = { isResting: false };
    state.playback.bandIntensity = intensity; // the ONE variable under test

    const loopLen = seed.loopLengthSteps || state.arranger.totalSteps;
    const total = state.arranger.totalSteps;
    const stepMap = state.arranger.stepMap;
    const chordAt = (s: number) => {
        const w = ((s % total) + total) % total;
        return stepMap.find((e: any) => w >= e.start && w < e.end)?.chord || null;
    };

    let count = 0;
    let velSum = 0;
    for (let abs = 0; abs < loopLen; abs++) {
        state.playback.currentLoopCount = Math.floor(abs / total);
        state.playback.bandIntensity = intensity; // re-assert: the engine reads it live
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
        if (!res) {
            continue;
        }
        // A double-stop returns [harmony, lead]; the lead is the last element.
        const lead = Array.isArray(res) ? res[res.length - 1] : res;
        count += 1;
        velSum += lead.velocity;
    }
    return { count, meanVel: count > 0 ? velSum / count : 0 };
}

describe.each(['Rock', 'Jazz'])('Soloist rides the band arc (#1004) — %s', (genre) => {
    it('note density and mean velocity rise monotonically with bandIntensity', () => {
        const state = buildState(genre);
        // One seed, generated once — every run performs the SAME phrase.
        const seed = generateSessionSeed(state, state.arranger, 'smart', SEED_INTENSITY, 'BI_SEED');

        const low = performAt(state, seed, 0.3);
        const mid = performAt(state, seed, 0.6);
        const high = performAt(state, seed, 0.9);

        // Critique Report — read these to sanity-check the arc, not just pass/fail.
        // eslint-disable-next-line no-console
        console.log(
            `[#1004 band-arc ${genre}] density  low(0.3)=${low.count}  mid(0.6)=${mid.count}  high(0.9)=${high.count}`,
        );
        // eslint-disable-next-line no-console
        console.log(
            `[#1004 band-arc ${genre}] meanVel  low(0.3)=${low.meanVel.toFixed(3)}  mid(0.6)=${mid.meanVel.toFixed(3)}  high(0.9)=${high.meanVel.toFixed(3)}`,
        );

        // DENSITY arc. The gate SATURATES at high energy — once most ornament steps
        // already sound, a bigger build can't add notes that are already there — so
        // the real density headroom is in THINNING on the way down, not thickening at
        // the top (that's what the velocity term below is for). Assert accordingly:
        //   • low→mid: strict, with a real margin — this is where the headroom is and
        //     where a quiet passage audibly thins (intent; measured ~33 notes, floor
        //     the assertion well below that so it's robust, not ossified).
        //   • mid→high: MONOTONIC (non-decreasing) — the saturating region; a strict
        //     gap here would ossify a ~3-note margin that's just seed noise.
        //   • low→high: strict overall — the macro claim that the arc moves density.
        expect(mid.count).toBeGreaterThan(low.count + 8);
        expect(high.count).toBeGreaterThanOrEqual(mid.count);
        expect(high.count).toBeGreaterThan(low.count);

        // MONOTONIC WEIGHT (intent): the lead digs in as the band lifts. Two terms
        // drive this — activity feeds the 0.7+0.3·activity multiply, and the direct
        // final-stage bandVel keeps it moving when activity saturates. The step is
        // deliberately gentle (weight, not a cliff), so assert order + a floor gap
        // that comfortably clears float noise but doesn't ossify the exact gain.
        expect(mid.meanVel).toBeGreaterThan(low.meanVel + 0.01);
        expect(high.meanVel).toBeGreaterThan(mid.meanVel + 0.01);

        // Sanity: the skeleton still sounds even at low energy (we thin, we don't
        // mute the lead) — guards against a future gain that over-subtracts.
        expect(low.count).toBeGreaterThan(0);
    });
});
