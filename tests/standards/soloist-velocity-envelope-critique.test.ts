// Critique test for #1006 — within-phrase velocity envelopes (design §4.6).
//
// Melodic-lane dynamics were flat: every existing soloist/bass velocity term moves
// SLOWLY (the arc / band / seam lifts shift across a whole form pass; the soloist's
// apexBoost is one note; the bass odd-beat accent is a per-beat constant), so
// note-to-note the line landed at a near-constant weight — the last place the leads
// sounded quantized. #1006 adds a distance-to-target envelope that swells INTO strong
// beats and the apex and eases off on the release, applied FINAL-STAGE (a
// `velocity *= envelope` after every additive/multiplicative term).
//
// This file replaced an earlier version whose apex claim a music-theory review found
// VACUOUS: it performed with `currentLoopCount` climbing to ~96, which saturated the
// line at the clamp01 ceiling so the apex was "loop max" only because it and dozens of
// other notes were all pinned at 1.0 — the assertion would still pass with the #1006
// apex term deleted. It also mis-identified the apex as one GLOBAL highest note, but the
// engine scans PER development-cycle window (`cycleLen`), firing ~11 local apices per
// seed loop. The rewrite:
//   • performs in an UNSATURATED regime (currentLoopCount pinned to 0) and guards that
//     the OFF-envelope line is genuinely off the ceiling;
//   • replicates the engine's exact per-window apex scan and checks EACH window's local
//     apex is that window's velocity max;
//   • A/Bs the apex MARGIN (apex − runner-up) with the envelope ON vs OFF, so the test
//     isolates the #1006 apex ×1.15 term from the pre-existing `apexBoost`. With the
//     envelope disabled the margin-delta is 0 and the assertion FAILS (verified by hand
//     during authoring) — the anti-vacuous core.
// Bass coverage (also missing before) A/Bs the position-based `bassEnvelope` via a
// seeded, paired ON/OFF run: the per-note ON/OFF velocity RATIO reads out the envelope
// factor directly (strong beats ×1.05, the release note ×0.93), immune to the accent /
// ghost / intensity confounds that live in both runs.

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { CHORD_PRESETS } from '../../public/data/chord-presets.js';
import {
    BASS_VELOCITY_ENVELOPE,
    getBassNote,
    isBassActive,
} from '../../public/engine/bass-engine.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import {
    getSoloistNotePhraseFirst,
    SOLOIST_VELOCITY_ENVELOPE,
} from '../../public/engine/soloist-phrase-first.js';
import { generateSessionSeed } from '../../public/engine/soloist-seeder.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';
import { getFrequency, getStepInfo } from '../../public/utils.js';
import { makeMulberry32 } from '../utils/seeded-random.js';

// A neutral band energy so the shaping isn't measured on top of a saturated
// (clamped-to-1.0) line — bandVel/bandLift both evaluate to 0 at 0.6 (their center).
const PERFORM_INTENSITY = 0.6;
const PRESET = 'Pop (Standard)';

const variance = (xs: number[]): number => {
    if (xs.length === 0) {
        return 0;
    }
    const mean = xs.reduce((s, x) => s + x, 0) / xs.length;
    return xs.reduce((s, x) => s + (x - mean) ** 2, 0) / xs.length;
};
const mean = (xs: number[]): number =>
    xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN;

// ---------------------------------------------------------------------------
// Soloist lane
// ---------------------------------------------------------------------------
function buildSoloState(genre: string): any {
    dispatch(ACTIONS.RESET_STATE);
    dispatch(ACTIONS.SET_TIME_SIGNATURE, '4/4');
    dispatch(ACTIONS.SET_KEY, 'C');
    dispatch(ACTIONS.UPDATE_GB, { enabled: true, genreFeel: genre });
    dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'smart' });
    dispatch(ACTIONS.SET_BAND_INTENSITY, PERFORM_INTENSITY);
    dispatch(ACTIONS.SET_BPM, 120);
    const state: any = getState();
    const preset = CHORD_PRESETS.find((p) => p.name === PRESET);
    if (!preset) {
        throw new Error(`fixture preset "${PRESET}" not found`);
    }
    state.arranger.key = 'C';
    state.arranger.isMinor = false;
    state.arranger.sections = preset.sections.map((s: any, i: number) => ({ ...s, id: `p-${i}` }));
    validateProgression(state);
    return state;
}

// Replicate the engine's per-window apex scan EXACTLY
// (soloist-phrase-first.ts, the `apexStepInLoop` loop): the form is split into
// development-cycle windows of `cycleLen` steps, and each window's local apex is its
// single highest-MIDI seed note (pickups at negative steps excluded). Returns a map of
// window-index -> apex step-in-loop. Values are hard-coded from the engine's arithmetic,
// NOT re-derived from the engine's predicates (smell (a)).
function apexStepsByWindow(seed: any, loopLen: number, totalSteps: number): Map<number, number> {
    const TARGET_PEAK_WINDOW_STEPS = 192; // engine constant
    const loopsPerWindow = Math.max(1, Math.round(TARGET_PEAK_WINDOW_STEPS / totalSteps));
    const cycleLen = loopsPerWindow * totalSteps;
    const bestByWindow = new Map<number, { sil: number; midi: number }>();
    for (const n of seed.notes) {
        if (n.step < 0) {
            continue; // pickup — never a peak
        }
        const sil = ((n.step % loopLen) + loopLen) % loopLen;
        const w = Math.floor(sil / cycleLen);
        const cur = bestByWindow.get(w);
        if (!cur || n.midi > cur.midi) {
            bestByWindow.set(w, { sil, midi: n.midi });
        }
    }
    const out = new Map<number, number>();
    for (const [w, v] of bestByWindow) {
        out.set(w, v.sil);
    }
    return out;
}

// Perform ONE fixed seed across `2 × loopLen` absolute steps (≥2 loop lengths so a
// lap-0-only wrap bug can't hide — the #923 frame guard). `currentLoopCount` is pinned
// LOW so the additive velocity base never reaches the clamp01 ceiling (the unsaturated
// regime the apex claim requires). Returns per emitted note its step-in-loop, its
// development-cycle window, and its lead velocity.
function performSolo(
    state: any,
    seed: any,
    envelopeOn: boolean,
    loopLen: number,
    totalSteps: number,
    cycleLen: number,
): { sil: number; w: number; vel: number }[] {
    SOLOIST_VELOCITY_ENVELOPE.enabled = envelopeOn;
    state.soloist.session.seed = seed;
    state.soloist.session.phrasing = { isResting: false };
    const stepMap = state.arranger.stepMap;
    const chordAt = (s: number) => {
        const w = ((s % totalSteps) + totalSteps) % totalSteps;
        return stepMap.find((e: any) => w >= e.start && w < e.end)?.chord || null;
    };

    const notes: { sil: number; w: number; vel: number }[] = [];
    for (let abs = 0; abs < 2 * loopLen; abs++) {
        state.playback.currentLoopCount = 0; // pinned low → unsaturated
        state.playback.bandIntensity = PERFORM_INTENSITY;
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
        const lead = Array.isArray(res) ? res[res.length - 1] : res;
        const sil = ((abs % loopLen) + loopLen) % loopLen;
        notes.push({ sil, w: Math.floor(sil / cycleLen), vel: lead.velocity });
    }
    return notes;
}

describe.each(['Rock', 'Jazz'])('Soloist within-phrase velocity envelope (#1006) — %s', (genre) => {
    it('swells variance and lands EACH window apex as its window velocity max, by a margin the envelope creates', () => {
        const state = buildSoloState(genre);
        const seed: any = generateSessionSeed(
            state,
            state.arranger,
            'smart',
            PERFORM_INTENSITY,
            'VEL_ENV_SEED',
        );
        const loopLen: number = seed.loopLengthSteps;
        const totalSteps: number = state.arranger.totalSteps;
        const loopsPerWindow = Math.max(1, Math.round(192 / totalSteps));
        const cycleLen = loopsPerWindow * totalSteps;
        const apexByWindow = apexStepsByWindow(seed, loopLen, totalSteps);

        const on = performSolo(state, seed, true, loopLen, totalSteps, cycleLen);
        const off = performSolo(state, seed, false, loopLen, totalSteps, cycleLen);

        // Saturation guard: the OFF line must be genuinely off the clamp01 ceiling, or
        // "apex is loudest" is meaningless (the vacuity the review flagged).
        // intent: prove the unsaturated regime ; measured OFF max ≈ 0.842 ; floor 0.95.
        const maxVelOff = Math.max(...off.map((n) => n.vel));

        // Per-window apex checks (envelope ON) + the A/B margin isolation.
        let windowsChecked = 0;
        let apexIsWindowMax = 0;
        let minMarginOn = Number.POSITIVE_INFINITY;
        let minMarginDelta = Number.POSITIVE_INFINITY;
        for (const [w, apexSil] of apexByWindow) {
            const wOn = on.filter((n) => n.w === w);
            const wOff = off.filter((n) => n.w === w);
            const apexOn = wOn.find((n) => n.sil === apexSil);
            const apexOff = wOff.find((n) => n.sil === apexSil);
            if (!apexOn || wOn.length < 2) {
                continue; // window's apex step didn't sound in this window — exempt
            }
            windowsChecked += 1;
            const maxOn = Math.max(...wOn.map((n) => n.vel));
            if (apexOn.vel >= maxOn - 1e-9) {
                apexIsWindowMax += 1;
            }
            const runnerOn = Math.max(...wOn.filter((n) => n.sil !== apexSil).map((n) => n.vel));
            const runnerOff = Math.max(...wOff.filter((n) => n.sil !== apexSil).map((n) => n.vel));
            const marginOn = apexOn.vel - runnerOn;
            const marginOff = (apexOff?.vel ?? 0) - runnerOff;
            minMarginOn = Math.min(minMarginOn, marginOn);
            minMarginDelta = Math.min(minMarginDelta, marginOn - marginOff);
        }

        const varOff = variance(off.map((n) => n.vel));
        const varOn = variance(on.map((n) => n.vel));

        // Critique Report — targets below MATCH the assertions exactly (smell (d)).
        console.log(
            `[#1006 soloist ${genre}] notesON=${on.length} OFFmaxVel=${maxVelOff.toFixed(4)} (Target <0.95) | ` +
                `variance OFF=${varOff.toFixed(5)} ON=${varOn.toFixed(5)} ratio=${(varOn / (varOff || 1e-9)).toFixed(2)}x (Target ON>OFF×1.4) | ` +
                `windows=${windowsChecked} apexIsMax=${apexIsWindowMax} (Target ==all) ` +
                `minMarginON=${minMarginOn.toFixed(4)} (Target >0.05) minMarginDelta(ON−OFF)=${minMarginDelta.toFixed(4)} (Target >0.03)`,
        );

        // Guards on the harness itself.
        expect(on.length).toBeGreaterThan(200);
        expect(windowsChecked).toBeGreaterThanOrEqual(8); // measured 11 windows

        // Unsaturated regime — the apex claim is only meaningful off the ceiling.
        // intent: OFF line clear of clamp01 ; measured 0.842 ; floor 0.95 (headroom 0.11).
        expect(maxVelOff).toBeLessThan(0.95);

        // (a) Variance rises with the envelope — same seed, same notes, only shaping
        // differs, so any rise is the envelope. intent: line no longer flat ;
        // measured 2.6× ; floor 1.4× (comfortable headroom below measured).
        expect(varOn).toBeGreaterThan(varOff * 1.4);

        // (b) EVERY development-cycle window's local apex is that window's velocity max.
        // intent: each recurring signature peak is the loudest note in its window.
        expect(apexIsWindowMax).toBe(windowsChecked);

        // (b') The apex stands over its runner-up by a real margin — and that margin is
        // MEANINGFULLY LARGER with the envelope on than off. This is the anti-vacuous
        // isolation: it subtracts out the pre-existing apexBoost (present in both runs)
        // and guards specifically the #1006 apex ×1.15 term. With the envelope disabled
        // the delta is 0 and this FAILS (verified during authoring).
        // intent: real apex crest ; measured minMarginON ≈ 0.10 ; floor 0.05 (2× headroom).
        expect(minMarginOn).toBeGreaterThan(0.05);
        // intent: crest is the ENVELOPE's ; measured min delta ≈ 0.070 ; floor 0.03 (2.3× headroom).
        expect(minMarginDelta).toBeGreaterThan(0.03);
    });
});

// ---------------------------------------------------------------------------
// Bass lane
// ---------------------------------------------------------------------------
// getBassNote / isBassActive take `state` as a param (no getState() call), so the bass
// suite builds a plain state and passes it directly — no module mock, so it can coexist
// with the soloist suite's real-state harness in one file.
function buildBassState(genre: string, style: string): any {
    return {
        playback: { bandIntensity: 0.3, bpm: 110, complexity: 0.3, currentLoopCount: 0 },
        groove: { genreFeel: genre, pocket: 0, instruments: [], lastDrumPreset: style },
        soloist: { session: { phrasing: { busySteps: 0 }, tension: 0 } },
        arranger: { timeSignature: '4/4', totalSteps: 64, key: 'C', isMinor: false },
    };
}

// Perform the bass over `bars`, with Math.random driven by a fixed mulberry32 stream so
// the ON and OFF runs draw IDENTICAL sequences (the bass is heavily randomized). The
// envelope multiply is the LAST operation, after every random draw, so toggling it never
// shifts the stream → the two runs emit the same notes and the per-note ON/OFF ratio is
// exactly the envelope factor.
function performBass(state: any, envelopeOn: boolean, bars: number) {
    vi.spyOn(Math, 'random').mockImplementation(makeMulberry32(0xc0ffee));
    BASS_VELOCITY_ENVELOPE.enabled = envelopeOn;
    const ts = TIME_SIGNATURES['4/4'];
    const chord: any = { rootMidi: 48, quality: 'maj', beats: 4, intervals: [0, 4, 7] };
    const notes: { step: number; sim: number; vel: number }[] = [];
    let lastMidi: number | null = null;
    for (let i = 0; i < bars * 16; i++) {
        const sim = i % 16;
        const info = getStepInfo(i, ts, [], TIME_SIGNATURES);
        if (!isBassActive(state, 'smart', i, sim, info, {})) {
            continue;
        }
        const note = getBassNote(
            state,
            chord,
            null,
            (info as any).beatIndex,
            lastMidi ? getFrequency(lastMidi) : 440,
            38,
            'smart',
            0,
            i,
            sim,
            {},
            info,
        );
        if (!note) {
            continue;
        }
        notes.push({ step: i, sim, vel: note.velocity });
        lastMidi = note.midi;
    }
    return notes;
}

describe.each([
    ['Rock', 'rock'],
    ['Metal', 'metal'],
])('Bass within-phrase velocity envelope (#1006) — %s', (genre, style) => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('shapes strong beats above the release notes — a contour the envelope creates', () => {
        const state = buildBassState(genre, style);
        const BARS = 24;
        const on = performBass(state, true, BARS);
        const off = performBass(state, false, BARS);

        // Paired: identical seeded streams + envelope-is-last ⇒ same emitted steps.
        const paired = on.length === off.length && on.every((n, k) => n.step === off[k].step);
        const maxOff = Math.max(...off.map((n) => n.vel));

        // Per-note ON/OFF velocity ratio = the position-based envelope factor. Strong
        // beats (bar start + midpoint, sim 0 & 8) ×1.05; the release window right after
        // (sim 1,2 & 9,10) ≤ ×0.965. The accent / ghost / intensity terms live in BOTH
        // runs and cancel in the ratio.
        const strongR: number[] = [];
        const releaseR: number[] = [];
        for (let k = 0; k < on.length; k++) {
            const r = on[k].vel / (off[k].vel || 1e-9);
            const sim = on[k].sim;
            if (sim === 0 || sim === 8) {
                strongR.push(r);
            } else if (sim === 1 || sim === 2 || sim === 9 || sim === 10) {
                releaseR.push(r);
            }
        }
        const meanStrong = mean(strongR);
        const meanRelease = mean(releaseR);
        const delta = meanStrong - meanRelease;

        console.log(
            `[#1006 bass ${genre}] paired=${paired} notes=${on.length} OFFmaxVel=${maxOff.toFixed(4)} (Target <1.19) | ` +
                `strongRatio=${meanStrong.toFixed(4)} (Target >1.03, n${strongR.length}) ` +
                `releaseRatio=${meanRelease.toFixed(4)} (Target <0.99, n${releaseR.length}) ` +
                `contour delta=${delta.toFixed(4)} (Target >0.04)`,
        );

        // Harness sanity: the ratio only reads the envelope if the runs are paired.
        expect(paired).toBe(true);
        expect(strongR.length).toBeGreaterThan(10);
        expect(releaseR.length).toBeGreaterThan(4);

        // Unsaturated: the bass clamps at `BASS_VELOCITY_DOMAIN_MAX` (1.5 since
        // #1331, 1.25 before it); ON = OFF × 1.05 must stay under that or the ratio
        // understates the envelope. The 1.19 floor is kept as-is rather than
        // relaxed to the new ceiling — it was measured against the ENGINE's output
        // here (1.05), not derived from the clamp, so it stays a tight guard.
        // intent: below clamp ; measured 1.05 ; floor 1.19.
        expect(maxOff).toBeLessThan(1.19);

        // The envelope lifts strong beats and dips the release notes — a contour that is
        // exactly 0 with the envelope OFF (all ratios 1.0), so this is non-vacuous.
        // intent: metric accent ; measured 1.050 ; floor 1.03.
        expect(meanStrong).toBeGreaterThan(1.03);
        // intent: post-beat release ; measured ≈0.963 ; floor 0.99.
        expect(meanRelease).toBeLessThan(0.99);
        // intent: the shaping contrast is the envelope's ; measured ≈0.086 ; floor 0.04 (2× headroom).
        expect(delta).toBeGreaterThan(0.04);
    });
});
