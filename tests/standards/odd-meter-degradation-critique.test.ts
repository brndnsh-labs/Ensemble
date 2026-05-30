// @ts-nocheck
/**
 * Critique: every drum genre must produce a NON-DEGENERATE groove in odd meters
 * (5/4, 7/4, 7/8) — epic-2 S10 (Phase 5).
 *
 * The shared compound* density filters are inert in odd simple meters (they only
 * fire when isCompound). So odd-meter coherence rests on each strategy reading
 * isBeatStart/isBackbeat/isPulse (meter-relative) rather than hardcoding a 4-beat
 * bar via `beatIndex === N`. The odd-meter TS configs are sane (backbeat [1,3] /
 * [1,3,5] / [1,2]; pulse + grouping per meter), so most genres degrade gracefully
 * and only explicit `=== N` predicates are at risk.
 *
 * Acceptance (audit S10): each genre produces a non-degenerate groove —
 *   (1) the downbeat (mStep 0) is present,
 *   (2) onsets are distributed across the bar (span >1 distinct beat, not piled
 *       on beat 1),
 *   (3) no core lane (Kick / Snare / HiHat) is completely silent.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { checkBassActiveStyle } from '../../public/engine/bass-styles.js';
import { applyGrooveOverrides } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

const GENRES = [
    'Jazz',
    'Blues',
    'Rock',
    'Funk',
    'Neo-Soul',
    'Hip Hop',
    'Acoustic',
    'Disco',
    'Reggae',
    'Bossa Nova',
    'Latin',
    'Ska',
    'Country',
    'Metal',
    'Minimal',
];
const ODD_METERS = ['5/4', '7/4', '7/8'];
const CORE_LANES = ['Kick', 'Snare', 'HiHat'];
// NOTE: the pooled sweep drives only the core kit + Open. Non-core structural
// timelines on other lane names (Cowbell, Perc, Shaker, Ride) are NOT exercised
// here — verified at S10 review that none collapse in odd meters today (disco
// cowbell + latin shaker are meter-relative density/timbre lanes), but a FUTURE
// structural pattern on those names would be invisible to this guard. The one
// structural secondary lane that DID collapse — the Latin/Bossa son-clave
// (Sidestick) — has its own dedicated coverage block below.
const ALL_LANES = ['Kick', 'Snare', 'HiHat', 'Open'];

const simulate = (genreFeel, tsKey, intensity, numBars) => {
    const ts = TIME_SIGNATURES[tsKey];
    const stepsPerBar = ts.beats * ts.stepsPerBeat;
    const mockState = {
        playback: { bandIntensity: intensity, complexity: 0.6, bpm: 110, songMode: false },
        groove: {
            genreFeel,
            lastDrumPreset: genreFeel,
            instruments: [],
        },
        // why: applyGrooveOverrides reads arranger.timeSignature and recomputes
        // stepsPerBar/loopStep INTERNALLY (groove-engine.ts:369-371) — without this it
        // falls back to 4/4 (16 steps) and the whole sweep silently measures a 4/4
        // engine while iterating odd-meter bars. [[tests-passing-on-wrong-path]] (S10 review).
        arranger: { timeSignature: tsKey, totalSteps: numBars * stepsPerBar },
        soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
    };
    getState.mockReturnValue(mockState);

    // lane -> Set of mStep positions that fired (across all bars)
    const laneSteps = {};
    // lane -> Set of beatIndex values that fired
    const laneBeats = {};
    for (const l of ALL_LANES) {
        laneSteps[l] = new Set();
        laneBeats[l] = new Set();
    }
    let downbeatBars = 0;

    for (let bar = 0; bar < numBars; bar++) {
        let barHadDownbeatOnset = false;
        for (let s = 0; s < stepsPerBar; s++) {
            const abs = bar * stepsPerBar + s;
            const info = getStepInfo(abs, ts, [], TIME_SIGNATURES);
            for (const inst of ALL_LANES) {
                const params = {
                    step: abs,
                    inst: { name: inst, muted: false, steps: [] },
                    stepVal: 0,
                    playback: mockState.playback,
                    groove: mockState.groove,
                    isDownbeat: info.isDownbeat,
                    isBeatStart: info.isBeatStart,
                    isBackbeat: info.isBackbeat,
                    isGroupStart: info.isGroupStart,
                    isPulse: info.isPulse,
                    isPulseStart: info.isPulseStart,
                    isCompound: info.isCompound,
                    isOffbeat: info.isOffbeat,
                    isEOfBeat: info.isEOfBeat,
                    isAOfBeat: info.isAOfBeat,
                    beatIndex: info.beatIndex,
                    groupIndex: info.groupIndex,
                    stepInGroup: info.stepInGroup,
                    tsConfig: info.tsConfig,
                    isTurnaround: false,
                };
                const r = applyGrooveOverrides(getState(), params);
                if (r.shouldPlay) {
                    laneSteps[inst].add(info.mStep);
                    laneBeats[inst].add(info.beatIndex);
                    if (info.mStep === 0) {
                        barHadDownbeatOnset = true;
                    }
                }
            }
        }
        if (barHadDownbeatOnset) {
            downbeatBars++;
        }
    }
    return { laneSteps, laneBeats, downbeatBars, numBars };
};

describe('Odd-meter degradation critique (epic-2 S10)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    for (const genre of GENRES) {
        for (const tsKey of ODD_METERS) {
            // Verify at a representative playing intensity (0.85, where all lanes are
            // active — below that some genres legitimately rest the snare as dynamics,
            // which is not a meter-degradation). Downbeat presence is also checked at a
            // lower intensity (0.5) to confirm the foundation never collapses.
            it(`${genre} in ${tsKey}: non-degenerate groove`, () => {
                const hi = simulate(genre, tsKey, 0.85, 24);
                const distinctBeatsAnyLane = new Set(
                    ALL_LANES.flatMap((l) => [...hi.laneBeats[l]]),
                );
                const silentCore = CORE_LANES.filter((l) => hi.laneSteps[l].size === 0);
                console.log(
                    `[${genre} ${tsKey}] downbeat=${hi.downbeatBars}/${hi.numBars}, distinctBeats=${distinctBeatsAnyLane.size}, ` +
                        `Kick=${[...hi.laneSteps.Kick].sort((a, b) => a - b)}, ` +
                        `Snare=${[...hi.laneSteps.Snare].sort((a, b) => a - b)}, ` +
                        `HiHat=${[...hi.laneSteps.HiHat].sort((a, b) => a - b)}` +
                        (silentCore.length ? ` SILENT_CORE=${silentCore}` : ''),
                );

                // (1) Downbeat present on (nearly) every bar, at BOTH a low and a high
                //     intensity — the foundation never collapses to a meter artifact.
                const lo = simulate(genre, tsKey, 0.5, 24);
                expect(lo.downbeatBars).toBeGreaterThan(lo.numBars * 0.8);
                expect(hi.downbeatBars).toBeGreaterThan(hi.numBars * 0.8);
                // (2) Onsets distributed across the bar — not piled on beat 1. Require
                //     coverage of most of the bar's beats (≥ beats-1), which catches a
                //     `beatIndex === N` predicate that silently drops the bar's tail.
                const ts = TIME_SIGNATURES[tsKey];
                expect(distinctBeatsAnyLane.size).toBeGreaterThanOrEqual(ts.beats - 1);
                // (3) No core lane (Kick / Snare / HiHat) completely silent at playing intensity.
                expect(silentCore).toEqual([]);
            });
        }
    }
});

// --- Bass styles (the other half of S10's "grooves/*.ts + bass-styles.ts" scope) ---
// The bossa + dub styles got their compound/odd fix in S9 (covered by
// bossa-dub-compound-bass-critique). Here we verify the remaining groove-bearing
// styles don't degrade in odd meters — their active gates key on isEighthBoundary /
// isQuarter / isOffbeat (meter-relative) rather than hardcoding a 4-beat bar.
describe('Odd-meter bass-style degradation critique (epic-2 S10)', () => {
    // Sustained styles (whole/half/arp) are intentionally sparse — excluded; this
    // checks the rhythmically-active styles where a 4/4 assumption could degrade.
    const BASS_STYLES = ['rock', 'funk', 'blues', 'metal', 'walking-ska', 'quarter'];

    const driveBass = (style, tsKey, intensity, numBars) => {
        const ts = TIME_SIGNATURES[tsKey];
        const stepsPerBar = ts.beats * ts.stepsPerBeat;
        const playback = {
            bandIntensity: intensity,
            complexity: 0.6,
            bpm: 110,
            currentLoopCount: 0,
        };
        // Rock feel keeps 'quarter' on the simple-meter walking path (not re-routed
        // to the Jazz branch); matches the bass-density-lock harness.
        const groove = { genreFeel: 'Rock' };
        const onsetSteps = new Set();
        const onsetBeats = new Set();
        const perBar = [];
        for (let bar = 0; bar < numBars; bar++) {
            let n = 0;
            for (let s = 0; s < stepsPerBar; s++) {
                const step = bar * stepsPerBar + s;
                const info = getStepInfo(step, ts, [], TIME_SIGNATURES);
                const active = checkBassActiveStyle(
                    style,
                    step,
                    step,
                    info,
                    ts,
                    info.beatIndex,
                    info.isBeatStart,
                    info.isEighthBoundary,
                    playback,
                    groove,
                );
                if (active) {
                    onsetSteps.add(info.mStep);
                    onsetBeats.add(info.beatIndex);
                    n++;
                }
            }
            perBar.push(n);
        }
        return { onsetSteps, onsetBeats, perBar };
    };

    for (const style of BASS_STYLES) {
        for (const tsKey of ODD_METERS) {
            it(`${style} bass in ${tsKey}: non-degenerate, no disproportionate flood, no dropout`, () => {
                const ts = TIME_SIGNATURES[tsKey];
                const { onsetSteps, onsetBeats, perBar } = driveBass(style, tsKey, 0.7, 24);
                const avg = perBar.reduce((a, b) => a + b, 0) / perBar.length;
                const perBeat = avg / ts.beats;
                // Baseline: the SAME style in 4/4. funk slap + metal gallop are
                // inherently dense 16th-note styles in 4/4 too, so the meaningful flood
                // check is "odd-meter per-beat density ≈ the 4/4 per-beat density", not
                // an absolute ceiling. A genuine meter bug (e.g. isOffbeat flooding the
                // 8th grid disproportionately) shows up as odd-meter per-beat >> 4/4.
                const base = driveBass(style, '4/4', 0.7, 24);
                const basePerBeat = base.perBar.reduce((a, b) => a + b, 0) / base.perBar.length / 4;
                console.log(
                    `[bass ${style} ${tsKey}] avg/bar=${avg.toFixed(2)} (${perBeat.toFixed(2)}/beat vs 4/4 ${basePerBeat.toFixed(2)}/beat), distinctBeats=${onsetBeats.size}, steps=${[...onsetSteps].sort((a, b) => a - b)}`,
                );
                // No silent bar (the bass holds the groove).
                expect(Math.min(...perBar)).toBeGreaterThan(0);
                // Distributed across the bar — not collapsed onto a single beat.
                expect(onsetBeats.size).toBeGreaterThanOrEqual(ts.beats - 1);
                // No disproportionate flood: odd-meter per-beat density within 30% of
                // the same style's 4/4 per-beat density.
                expect(perBeat).toBeLessThanOrEqual(basePerBeat * 1.3);
            });
        }
    }
});

// --- Structural-lane coverage: the Latin/Bossa son-clave timeline ---
// The pooled-lane checks above can't see a STRUCTURAL secondary lane (the clave
// Sidestick) collapse to the front of the bar while Kick/HiHat fill the pool. The
// son-clave (motif 0/1, the default Latin/Bossa feel) was keyed on 4/4 16th literals
// (0,6,12 / 4,8) gated only on !isCompound, so in odd simple meters it fired 4/4
// positions then DROPPED THE BAR'S TAIL (5/4 left beats 4-5 silent, 7/4 beats 4-7).
// epic-2 S10 derives it from the grouping instead. This guard drives the clave lane
// directly (low intensity → motif 0/1) and asserts it covers the bar's final group.
describe('Odd-meter Latin/Bossa clave timeline coverage (epic-2 S10)', () => {
    // Per-bar Sidestick (clave) onsets at low intensity (motif 0/1 — the clave path).
    const driveClave = (genre, tsKey, numBars) => {
        const ts = TIME_SIGNATURES[tsKey];
        const stepsPerBar = ts.beats * ts.stepsPerBeat;
        const mockState = {
            playback: { bandIntensity: 0.45, complexity: 0.3, bpm: 100, songMode: false },
            groove: { genreFeel: genre, lastDrumPreset: genre, instruments: [] },
            // why: see simulate() — arranger.timeSignature drives the engine's internal
            // stepsPerBar; without it the clave runs on a 4/4 grid. (S10 review P0).
            arranger: { timeSignature: tsKey, totalSteps: numBars * stepsPerBar },
            soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
        };
        getState.mockReturnValue(mockState);
        const bars = [];
        for (let bar = 0; bar < numBars; bar++) {
            const hits = [];
            for (let s = 0; s < stepsPerBar; s++) {
                const abs = bar * stepsPerBar + s;
                const info = getStepInfo(abs, ts, [], TIME_SIGNATURES);
                const params = {
                    step: abs,
                    inst: { name: 'Snare', muted: false, steps: [] },
                    stepVal: 0,
                    playback: mockState.playback,
                    groove: mockState.groove,
                    isDownbeat: info.isDownbeat,
                    isBeatStart: info.isBeatStart,
                    isBackbeat: info.isBackbeat,
                    isGroupStart: info.isGroupStart,
                    isPulse: info.isPulse,
                    isPulseStart: info.isPulseStart,
                    isCompound: info.isCompound,
                    isOffbeat: info.isOffbeat,
                    isEOfBeat: info.isEOfBeat,
                    isAOfBeat: info.isAOfBeat,
                    beatIndex: info.beatIndex,
                    groupIndex: info.groupIndex,
                    stepInGroup: info.stepInGroup,
                    stepsPerBar,
                    tsConfig: info.tsConfig,
                    isTurnaround: false,
                };
                const r = applyGrooveOverrides(getState(), params);
                if (r.shouldPlay) {
                    hits.push(info.mStep);
                }
            }
            bars.push(hits);
        }
        return bars;
    };

    for (const genre of ['Latin', 'Bossa Nova']) {
        for (const tsKey of ODD_METERS) {
            it(`${genre} son-clave spans EVERY bar in ${tsKey} (no 2-side tail dropout)`, () => {
                const ts = TIME_SIGNATURES[tsKey];
                // mStep where the bar's final grouping begins.
                const lastGroupStart =
                    ts.grouping.slice(0, -1).reduce((a, b) => a + b, 0) * ts.stepsPerBeat;
                const bars = driveClave(genre, tsKey, 8);
                console.log(
                    `[${genre} clave ${tsKey}] lastGroupStart=${lastGroupStart}, bar0=${bars[0]}, bar1=${bars[1]}`,
                );
                // PER-BAR (catches the 2-side bar, which under the old 4/4 literals was
                // {4,8} — no downbeat, no tail). Every bar must (a) fire and (b) reach the
                // bar's final group. The old code's 2-side {4,8} fails (b) in 5/4 + 7/4.
                for (let i = 0; i < bars.length; i++) {
                    expect(bars[i].length, `bar ${i} clave silent`).toBeGreaterThan(0);
                    const tail = bars[i].filter((m) => m >= lastGroupStart);
                    expect(
                        tail.length,
                        `bar ${i} clave drops the tail: ${bars[i]}`,
                    ).toBeGreaterThan(0);
                }
            });
        }
    }
});
