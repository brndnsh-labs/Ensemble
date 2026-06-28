// @ts-nocheck
// Definition-of-Done guard for #841 — drums "skip/stutter" mid-pattern.
//
// Root cause: the drum MOTIF index (the kick/snare/hat pattern skeleton, chosen
// by each genre's `getMotif(seed, complexity, intensity)`) was recomputed EVERY
// step from the live, per-step ramping `playback.bandIntensity`. As the conductor
// ramps intensity within a section (~+0.06/bar), crossing a motif tier boundary
// (rock 0.60 / 0.85) or the 0.35 intensity floor MID-BAR flipped the motif index
// for an otherwise-sticky section seed (#791) — the pattern jumped mid-phrase on
// the very lanes you lock to (a drums-only stutter).
//
// Fix: motif selection now reads `motifSelectionIntensity` — the bar-DOWNBEAT
// intensity (reconstructed from the conductor ramp) — so the motif can only
// change AT a bar line (where a real drummer changes patterns), never mid-bar.
// The live `intensity` still drives smooth per-step dynamics (velocity, ghost
// rolls, hat-opens); only the structural motif skeleton is latched.
//
// These tests pin the claim END-TO-END: they drive the REAL production drum path
// (`generateDrumsForStep` → `runDrumTick` → `applyGrooveOverrides` → each genre's
// `applyOverrides`), so a genre that dropped the `context.motifIntensity` wiring
// would FAIL. Genre keys are the engine's strategy keys ('Bossa Nova', 'Ska'),
// not the UI/preset labels — the wrong keys silently fall through to motif 0.

import { describe, expect, it } from 'vitest';
import { generateDrumsForStep } from '../../public/engine/drums-tick.js';
import { getDrumMotif } from '../../public/engine/groove-engine.js';
import {
    motifSelectionIntensity,
    RAMP_INTENSITY_MULTIPLIER,
} from '../../public/engine/section-overrides.js';

const SPB = 16; // 4/4, 16 steps per bar

// The engine's strategy keys (groove-engine.ts strategies map). NOT the UI genre
// labels: 'Latin'/'Ska-Punk' are dead keys that fall through to motif 0.
const STRATEGY_GENRES = [
    'Rock',
    'Funk',
    'Jazz',
    'Blues',
    'Metal',
    'Hip Hop',
    'Reggae',
    'Bossa Nova',
    'Country',
    'Acoustic',
    'Ska',
    'Neo-Soul',
    'Disco',
];

// ---------------------------------------------------------------------------
// Helper-level harness: a state whose conductor ramps `bandIntensity` across a
// bar exactly as `updateAutoConductor` does (shared RAMP_INTENSITY_MULTIPLIER),
// clamped at the target. `barStart` is the bar-downbeat intensity.
// ---------------------------------------------------------------------------
function rampingState(barStart, loopStep, { up = true, stepSize = 0.003, target = 0.95 } = {}) {
    const perStep = stepSize * (up ? RAMP_INTENSITY_MULTIPLIER.up : RAMP_INTENSITY_MULTIPLIER.down);
    const raw = up ? barStart + perStep * loopStep : barStart - perStep * loopStep;
    const bandIntensity = up ? Math.min(raw, target) : Math.max(raw, target);
    return {
        playback: { bandIntensity, autoIntensity: true, step: loopStep },
        conductor: { stepSize, targetIntensity: target },
        arranger: { sectionMap: [], sections: [] },
    };
}

describe('#841 — motifSelectionIntensity reconstructs the bar downbeat', () => {
    it('returns the bar-downbeat value for every step of a ramping bar', () => {
        const barStart = 0.56; // a bar ramping up THROUGH the rock 0.60 tier line
        const recovered = [];
        for (let s = 0; s < SPB; s++) {
            const st = rampingState(barStart, s);
            recovered.push(+motifSelectionIntensity(st, st.playback.bandIntensity, s).toFixed(6));
        }
        expect([...new Set(recovered)]).toEqual([barStart]);
    });

    it('TEETH: the pre-fix live intensity WOULD have flipped the MOTIF mid-bar', () => {
        // Demonstrate the actual artifact removed: same bar, the live per-step
        // intensity yields different motif indices at the bar's start vs end.
        const barStart = 0.56;
        const first = rampingState(barStart, 0).playback.bandIntensity;
        const last = rampingState(barStart, SPB - 1).playback.bandIntensity;
        const seed = 0.7; // a seed that sits on opposite sides of a rock tier
        const motifAtStart = getDrumMotif(seed, 'Rock', 0.8, first);
        const motifAtEnd = getDrumMotif(seed, 'Rock', 0.8, last);
        expect(first).toBeLessThan(0.6);
        expect(last).toBeGreaterThanOrEqual(0.6);
        expect(motifAtEnd).not.toBe(motifAtStart); // the mid-bar flip the fix kills
    });

    it('the settling-bar residual is a SINGLE flip at most (no mid-bar flapping)', () => {
        // The one approximate case: the ramp reaches target mid-bar. Late steps
        // sit at target while the downbeat reconstructs lower → one possible flip
        // on that single bar. The reconstructed intensity is monotonic across the
        // bar, so the motif can change AT MOST ONCE — never flap back and forth,
        // and (unlike the pre-fix per-step path) only on the settling bar, not on
        // every crossing bar. The magnitude of that one flip can exceed a single
        // index where a tier boundary itself jumps the motif >1 (an inherent
        // property of the tier tables, not of the latch) — so we bound the COUNT
        // of flips, not the size.
        const target = 0.62; // just above the rock 0.60 line, reached mid-bar
        const barStart = 0.585; // ramps up into 0.62 within the bar
        const seeds = [0.12, 0.34, 0.55, 0.7, 0.88];
        for (const seed of seeds) {
            const motifs = [];
            for (let s = 0; s < SPB; s++) {
                const st = rampingState(barStart, s, { stepSize: 0.004, target });
                const mi = motifSelectionIntensity(st, st.playback.bandIntensity, s);
                motifs.push(getDrumMotif(seed, 'Rock', 0.8, mi));
            }
            let flips = 0;
            for (let i = 1; i < motifs.length; i++) {
                if (motifs[i] !== motifs[i - 1]) {
                    flips++;
                }
            }
            expect(flips, `seed=${seed} settling-bar flip count`).toBeLessThanOrEqual(1);
        }
    });
});

// ---------------------------------------------------------------------------
// End-to-end harness: drive the REAL production drum path. `generateDrumsForStep`
// internally calls `motifSelectionIntensity(state.conductor, …)` and routes
// `context.motifIntensity` into each genre's `getMotif`.
// ---------------------------------------------------------------------------
const CHORD = {
    rootMidi: 60,
    quality: 'maj7',
    beats: 4,
    intervals: [0, 4, 7, 11],
    freqs: [261.63, 329.63, 392.0, 493.88],
    sectionId: 'A',
    sectionLabel: 'Verse',
};

function kit() {
    const mk = (name, steps) => ({ name, muted: false, steps, volume: 0.8 });
    const grid = (...on) => {
        const a = new Array(SPB).fill(0);
        for (const i of on) {
            a[i] = 2;
        }
        return a;
    };
    return [
        mk('Kick', grid(0, 8)),
        mk('Snare', grid(4, 12)),
        mk('HiHat', grid(0, 2, 4, 6, 8, 10, 12, 14)),
        mk('Open', new Array(SPB).fill(0)),
        mk('Ride', new Array(SPB).fill(0)),
        mk('Crash', new Array(SPB).fill(0)),
        mk('Tom', new Array(SPB).fill(0)),
        mk('Sidestick', new Array(SPB).fill(0)),
        mk('Shaker', new Array(SPB).fill(0)),
        mk('Conga', new Array(SPB).fill(0)),
        mk('Rimshot', new Array(SPB).fill(0)),
        mk('Clap', new Array(SPB).fill(0)),
    ];
}

// A 4-bar section. `withConductor` toggles the bar-stable latch on/off so we can
// contrast the fixed (latched) path against the pre-fix (live per-step) path
// over an identical bandIntensity ramp.
function makeState(genreFeel, bandIntensity, step, { withConductor }) {
    const BARS = 4;
    const TOTAL = SPB * BARS;
    const stepMap = [];
    for (let b = 0; b < BARS; b++) {
        stepMap.push({
            start: b * SPB,
            end: (b + 1) * SPB,
            chord: CHORD,
            sectionStart: 0,
            sectionEnd: TOTAL,
        });
    }
    return {
        arranger: {
            totalSteps: TOTAL,
            timeSignature: '4/4',
            measureMap: Array.from({ length: BARS }, (_, b) => ({
                start: b * SPB,
                end: (b + 1) * SPB,
            })),
            sectionMap: [{ start: 0, end: TOTAL, chord: CHORD, id: 'A' }],
            stepMap,
            sections: [{ id: 'A', label: 'Verse', role: 'Main Theme' }],
            progression: [CHORD],
            seed: 'song-seed-841',
            key: 'C',
            isMinor: false,
        },
        chords: { enabled: false },
        bass: { enabled: false },
        soloist: {
            enabled: false,
            session: {
                phrasing: { isResting: true, busySteps: 0 },
                currentPhrase: { notesInPhrase: 0 },
                memory: { sharedHookBuffer: [] },
                seed: 1,
            },
        },
        harmony: { enabled: false },
        groove: {
            enabled: true,
            genreFeel,
            lastDrumPreset: genreFeel,
            measures: 1,
            instruments: kit(),
            fillActive: false,
            humanize: 0,
            variations: null,
            sectionSeedMap: {},
            orchestrationMap: null,
            accentMap: null,
            seedTimelineStartStep: 0,
        },
        playback: {
            bpm: 120,
            songMode: false,
            bandIntensity,
            currentLoopCount: 2, // loop 2+: motifCeiling = Infinity (full range)
            conductorVelocity: 1,
            autoIntensity: true,
            step,
        },
        // withConductor=false models the conductor-less paths (worker/export) and
        // the pre-fix behavior: the latch can't reconstruct, so motif tracks live.
        conductor: withConductor ? { stepSize: 0.04, targetIntensity: 0.98 } : undefined,
    };
}

// Capture the emitted drum-hit fingerprint per step across one bar, ramping
// bandIntensity from `barStart` upward (a Verse->Chorus lift through the tiers).
function emitBar(genreFeel, barStart, perStep, { withConductor }) {
    const cursors = {
        mainCursor: { index: 0, sectionIndex: 0 },
        lookaheadCursor: { index: 0, sectionIndex: 0 },
    };
    const rows = [];
    for (let s = 0; s < SPB; s++) {
        const bandIntensity = Math.min(0.98, barStart + perStep * s);
        const state = makeState(genreFeel, bandIntensity, s, { withConductor });
        const { drumHits } = generateDrumsForStep(state, s, cursors, null);
        rows.push(
            drumHits
                .filter((h) => h.shouldPlay)
                .map((h) => h.soundName)
                .sort()
                .join('+'),
        );
    }
    return rows.join('|');
}

describe('#841 — every genre consumes the bar-latched motif (real drum path)', () => {
    // A wide single-bar ramp 0.30 -> ~0.94 guarantees the motif tier changes for
    // every intensity-sensitive genre, so latched (motif=0.30) and live (motif
    // ramps through the tiers) MUST diverge if the wiring is in place.
    const perStep = (0.94 - 0.3) / (SPB - 1);

    for (const genre of STRATEGY_GENRES) {
        it(`${genre}: latched bar differs from the live per-step bar (wiring is consumed)`, () => {
            const latched = emitBar(genre, 0.3, perStep, { withConductor: true });
            const live = emitBar(genre, 0.3, perStep, { withConductor: false });

            if (genre === 'Disco') {
                // Disco's getMotif is intentionally intensity-INVARIANT (it ignores
                // the argument), so latching has no effect — there is no motif to
                // stutter. Assert that's still true (no regression), not a diff.
                expect(latched).toBe(live);
                return;
            }
            // For every intensity-sensitive genre the latch changes the emitted
            // pattern: the live path flips the motif mid-bar, the latched path
            // holds the downbeat motif. If a genre dropped `context.motifIntensity`
            // these would be identical and this fails.
            expect(latched, `${genre} latched==live → motifIntensity not consumed`).not.toBe(live);
        });
    }
});

describe('#841 — the motif still OPENS UP across a section, just at bar lines', () => {
    it('Rock: per-bar motif develops monotonically over a Verse->Chorus ramp', () => {
        const seed = 0.7;
        const motifs = [];
        for (let b = 0; b < 6; b++) {
            const barStart = 0.3 + b * 0.085; // crosses the 0.35 floor + 0.60 line at bar lines
            const st = rampingState(barStart, 0);
            const mi = motifSelectionIntensity(st, st.playback.bandIntensity, 0);
            motifs.push(getDrumMotif(seed, 'Rock', 0.8, mi));
        }
        expect(new Set(motifs).size).toBeGreaterThan(1); // it develops…
        for (let i = 1; i < motifs.length; i++) {
            expect(motifs[i]).toBeGreaterThanOrEqual(motifs[i - 1]); // …never simpler as energy rises
        }
    });
});
