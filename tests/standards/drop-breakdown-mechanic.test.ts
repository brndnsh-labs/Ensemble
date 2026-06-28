// @ts-nocheck
// tests/standards/drop-breakdown-mechanic.test.ts
//
// Critique test for `epic-deferred-followups` S1 — Section-boundary lookahead +
// Drop/Breakdown structural mechanic.
//
// A "Drop" is not a loud chorus and a "Breakdown" is not a quiet verse — they
// are STRUCTURAL EVENTS. The idiomatic gesture: in the last bar before the drop
// the whole band CUTS, a single crash marks the empty bar, then every engine
// SLAMS back together on the drop's downbeat.
//
// This file guards two pieces:
//
//   (a) Section-boundary lookahead — `generateNotesForStep` (engines disabled)
//       must publish `upcomingSectionLabel` / `upcomingSectionEnergyDelta` /
//       `barsUntilSectionChange` on the coordination context in the last
//       measure of a section, and the sentinels (null / 0 / -1) elsewhere.
//
//   (b) Drop/Breakdown mechanic — in the last bar before a Drop section the
//       bass / chords / harmony / soloist producers must NOT run (the cut),
//       a Crash must appear in `drumHits` on that bar's downbeat, and on the
//       Drop's own downbeat every producer must run again (the slam-back).
//
// Strategy for (b): the mute is implemented as a producer-call-site gate in
// tick-logic.ts (a uniform band-wide 1-bar silence, unlike the staggered
// per-engine intro/outro mutes). The cleanest, fully-deterministic guard is
// therefore to mock each engine as a spy and assert call/no-call — exactly the
// pattern `producer-order.test.ts` uses. The drum layer is left REAL so the
// Crash emission is exercised end-to-end.
//
// Determinism: the mechanic is structural (label + energy-map driven), not
// stochastic — no Math.random in the gate path — so strict assertions are
// correct here (cf. CLAUDE.md: deterministic-by-construction engines).
//
// Source: docs/audit/FOLLOWUPS.md §A (drop/breakdown — DECIDED 2026-05-20);
//         docs/audit/epic-deferred-followups.md S1.

import { beforeEach, describe, expect, it, vi } from 'vitest';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

// --- Engine spies (for the gate-behavior block) ------------------------------
// why: mock each non-drum engine as a deterministic spy returning a single
// note. The S1(b) gate lives in tick-logic's producer dispatch — if the gate
// works, these spies are NOT called during the cut bar and ARE called on the
// drop downbeat. The drum/groove engine is left REAL so the Crash is exercised.
const soloistSpy = vi.fn(() => ({
    midi: 72,
    freq: 523.25,
    velocity: 0.7,
    durationSteps: 2,
    isBusy: false,
    isDoubleStop: false,
}));
const bassSpy = vi.fn(() => ({ midi: 40, freq: 82.41, velocity: 0.8, durationSteps: 2 }));
const accompSpy = vi.fn(() => [{ midi: 64, freq: 329.63, velocity: 0.6, durationSteps: 4 }]);
const harmonySpy = vi.fn(() => [{ midi: 67, freq: 392.0, velocity: 0.5, durationSteps: 4 }]);

// Mock THE production soloist producer (tick-logic calls getSoloistNotePhraseFirst,
// not the retired legacy getSoloistNote; epic #10).
vi.mock('../../public/engine/soloist-phrase-first.js', () => ({
    getSoloistNotePhraseFirst: (...a: any[]) => soloistSpy(...a),
}));
vi.mock('../../public/engine/bass-engine.js', () => ({
    getBassNote: (...a: any[]) => bassSpy(...a),
    isBassActive: vi.fn(() => true),
}));
vi.mock('../../public/engine/accompaniment.js', () => ({
    getAccompanimentNotes: (...a: any[]) => accompSpy(...a),
}));
vi.mock('../../public/engine/harmonies.js', () => ({
    getHarmonyNotes: (...a: any[]) => harmonySpy(...a),
    clearHarmonyMemory: vi.fn(),
}));

import { TIME_SIGNATURES } from '../../public/config.js';
import { generateNotesForStep } from '../../public/engine/tick-logic.js';

const TS = TIME_SIGNATURES['4/4'];
const SPB = TS.beats * TS.stepsPerBeat; // 16 steps per bar

// --- Chart fixtures ----------------------------------------------------------
// Form: 8 bars total. By default a 4-bar first section → 4-bar second section,
// so the cut bar is bar 3 (steps 48..63) and the boundary sits at form-fraction
// 0.5. `makeState({ firstSectionBars })` slides the boundary: a large first
// section pushes the cut bar past `DROP_INFERRED_MIN_FORM_PROGRESS` (0.6), a
// small one keeps it early — used to exercise the form-position gate on the
// energy-delta-inferred cut.
const TOTAL_BARS = 8;
const VERSE_BARS = 4; // default first-section length
const VERSE_STEPS = VERSE_BARS * SPB; // 64
const TOTAL = TOTAL_BARS * SPB; // 128

function makeChord(sectionId: string, sectionLabel: string) {
    return {
        rootMidi: 60,
        quality: 'maj7',
        beats: 4,
        intervals: [0, 4, 7, 11],
        freqs: [261.63, 329.63, 392.0, 493.88],
        sectionId,
        sectionLabel,
    };
}

// `currentLabel` / `nextLabel` let us swap either section (Verse / Pre-Chorus /
// Drop / Breakdown / Chorus) without rebuilding the whole chart.
function makeState(
    opts: {
        currentLabel?: string;
        nextLabel?: string;
        genreFeel?: string;
        includeDrums?: boolean;
        firstSectionBars?: number;
    } = {},
) {
    const currentLabel = opts.currentLabel ?? 'Verse';
    const nextLabel = opts.nextLabel ?? 'Drop';
    const firstChord = makeChord('sec-1', currentLabel);
    const secondChord = makeChord('sec-2', nextLabel);
    // Boundary step — where the first section ends / the second begins.
    const splitStep = (opts.firstSectionBars ?? VERSE_BARS) * SPB;
    // why: include the full base kit (Kick/Snare/HiHat) — not just the Crash —
    // so the cut-bar silence assertion is real. With only a Crash instrument
    // present, "no base groove" would be vacuously true; the base voices must
    // be available-but-suppressed for the test to mean anything.
    const drumInstruments = [
        { name: 'Kick', muted: false, steps: new Array(SPB).fill(0) },
        { name: 'Snare', muted: false, steps: new Array(SPB).fill(0) },
        { name: 'HiHat', muted: false, steps: new Array(SPB).fill(0) },
        { name: 'Crash', muted: false, steps: new Array(SPB).fill(0) },
    ];
    return {
        arranger: {
            totalSteps: TOTAL,
            timeSignature: '4/4',
            measureMap: [],
            stepMap: [
                {
                    start: 0,
                    end: splitStep,
                    chord: firstChord,
                    sectionStart: 0,
                    sectionEnd: splitStep,
                },
                {
                    start: splitStep,
                    end: TOTAL,
                    chord: secondChord,
                    sectionStart: splitStep,
                    sectionEnd: TOTAL,
                },
            ],
            sectionMap: [
                { id: 'sec-1', start: 0, end: splitStep, label: currentLabel },
                { id: 'sec-2', start: splitStep, end: TOTAL, label: nextLabel },
            ],
            progression: [firstChord, secondChord],
            key: 'C',
            isMinor: false,
        },
        chords: { enabled: true, style: 'smart', volume: 0.5, octave: 60 },
        bass: { enabled: true, style: 'rock', volume: 0.5, lastFreq: null, octave: 0 },
        soloist: makeSoloistMock({ enabled: true, style: 'smart', isResting: false, busySteps: 4 }),
        harmony: { enabled: true, style: 'strings', volume: 0.5, complexity: 0.5, lastMidis: [] },
        groove: {
            enabled: opts.includeDrums ?? false,
            genreFeel: opts.genreFeel ?? 'Rock',
            measures: 1,
            instruments: opts.includeDrums ? drumInstruments : [],
            fillActive: false,
            sectionSeedMap: {},
        },
        playback: {
            bpm: 120,
            bandIntensity: 0.7,
            songMode: true,
            isEndingPending: false,
            intent: {},
        },
    } as any;
}

function freshCursors() {
    return {
        mainCursor: { index: 0, sectionIndex: 0 },
        lookaheadCursor: { index: 0, sectionIndex: 0 },
    };
}

const ALL_ENGINES = {
    includeSoloist: true,
    includeBass: true,
    includeChords: true,
    includeHarmony: true,
    includeDrums: false,
};

// ============================================================================
// (a) Section-boundary lookahead — coordination publication
// ============================================================================
describe('Drop/Breakdown S1(a) — section-boundary lookahead publication', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('publishes upcomingSectionLabel / energyDelta / barsUntilChange only in the last measure', () => {
        const state = makeState({ nextLabel: 'Drop' });
        const cursors = freshCursors();
        const NONE = {
            includeSoloist: false,
            includeBass: false,
            includeChords: false,
            includeHarmony: false,
            includeDrums: false,
        };

        // Probe the downbeat of each Verse bar (0..3). The lookahead is only
        // populated when `remainingSteps <= stepsPerMeasure`, i.e. the LAST
        // bar of the section (bar 3, step 48).
        const probes: any[] = [];
        for (let bar = 0; bar < VERSE_BARS; bar++) {
            const r = generateNotesForStep(state, bar * SPB, cursors, NONE);
            probes.push({
                bar,
                label: r.coordination.upcomingSectionLabel,
                delta: r.coordination.upcomingSectionEnergyDelta,
                bars: r.coordination.barsUntilSectionChange,
            });
        }
        // eslint-disable-next-line no-console
        console.log(
            `[drop-mechanic] lookahead probes: ${probes
                .map((p) => `bar${p.bar}:label=${p.label},delta=${p.delta},bars=${p.bars}`)
                .join(' ')}`,
        );

        // Bars 0..1: not yet within the 2-bar window — full sentinels.
        for (let bar = 0; bar < VERSE_BARS - 2; bar++) {
            expect(probes[bar].label).toBeNull();
            expect(probes[bar].delta).toBe(0);
            expect(probes[bar].bars).toBe(-1);
        }
        // Bar 2 (penultimate bar): Epic 3 S12 widened ONLY the structural counter
        // to the penultimate bar, so `barsUntilSectionChange` reads 1 here — but the
        // harmonic-lookahead fields stay final-bar-only (decouple guard), so label /
        // delta are still sentinel. This proves voice-leading anticipation did NOT widen.
        const penult = probes[VERSE_BARS - 2];
        expect(penult.label).toBeNull();
        expect(penult.delta).toBe(0);
        expect(penult.bars).toBe(1);
        // Bar 3 (last bar of the Verse): full lookahead is live.
        const last = probes[VERSE_BARS - 1];
        expect(last.label).toBe('Drop');
        // Verse energy 0.5 → Drop energy 1.0 = +0.5.
        expect(last.delta).toBeCloseTo(0.5, 5);
        // We are IN the last bar before the change.
        expect(last.bars).toBe(0);
    });

    it('reports a NEGATIVE energy delta into a Breakdown (breakdown is the energy floor)', () => {
        // why: a Breakdown maps to energy 0.3 in form-analysis.ts — LOWER than
        // a Verse (0.5). The lookahead must report the real signed delta so a
        // consumer can tell a lift from a drop-to-quiet.
        const state = makeState({ nextLabel: 'Breakdown' });
        const cursors = freshCursors();
        const r = generateNotesForStep(state, 3 * SPB, cursors, {
            includeSoloist: false,
            includeBass: false,
            includeChords: false,
            includeHarmony: false,
            includeDrums: false,
        });
        expect(r.coordination.upcomingSectionLabel).toBe('Breakdown');
        // Verse 0.5 → Breakdown 0.3 = -0.2.
        expect(r.coordination.upcomingSectionEnergyDelta).toBeCloseTo(-0.2, 5);
    });
});

// ============================================================================
// (b) Drop/Breakdown mechanic — the 1-bar cut + crash + slam-back
// ============================================================================
describe('Drop/Breakdown S1(b) — pre-drop mute window', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('CUTS bass/chords/harmony/soloist for the whole last bar before the Drop', () => {
        const state = makeState({ nextLabel: 'Drop', genreFeel: 'Rock' });
        const cursors = freshCursors();

        // The cut bar is the last Verse bar: steps 48..63.
        let totalNotes = 0;
        for (let step = 3 * SPB; step < VERSE_STEPS; step++) {
            const r = generateNotesForStep(state, step, cursors, ALL_ENGINES);
            totalNotes += r.notes.length;
        }
        // eslint-disable-next-line no-console
        console.log(`[drop-mechanic] notes emitted across the cut bar: ${totalNotes}`);

        // The whole bar is silent — no engine emitted, and crucially the
        // engine spies were never even invoked (the gate short-circuits).
        expect(totalNotes).toBe(0);
        expect(soloistSpy).not.toHaveBeenCalled();
        expect(bassSpy).not.toHaveBeenCalled();
        expect(accompSpy).not.toHaveBeenCalled();
        expect(harmonySpy).not.toHaveBeenCalled();
    });

    it('fires exactly one Crash on the downbeat of the cut bar (drums exempt)', () => {
        const state = makeState({ nextLabel: 'Drop', genreFeel: 'Rock', includeDrums: true });
        const cursors = freshCursors();

        const crashSteps: number[] = [];
        let baseGrooveHits = 0; // Kick/Snare/HiHat etc. — must stay silent.
        for (let step = 3 * SPB; step < VERSE_STEPS; step++) {
            const r = generateNotesForStep(state, step, cursors, {
                ...ALL_ENGINES,
                includeDrums: true,
            });
            const played = r.drumHits.filter((h: any) => h.shouldPlay);
            if (played.some((h: any) => h.soundName === 'Crash')) {
                crashSteps.push(step);
            }
            baseGrooveHits += played.filter((h: any) => h.soundName !== 'Crash').length;
        }
        // eslint-disable-next-line no-console
        console.log(
            `[drop-mechanic] cut-bar crash steps: ${crashSteps.join(',')}; ` +
                `base-groove hits: ${baseGrooveHits}`,
        );

        // Exactly one Crash, on the downbeat (step 48 = first step of the bar).
        expect(crashSteps).toEqual([3 * SPB]);
        // The base groove (Kick/Snare/HiHat) is fully suppressed across the cut
        // bar — the Crash marks the void alone. Guards against a future change
        // leaking a base voice below the `fillPlayed` gate (the engine claims
        // `kickHit`/`snareHit` stay false; this asserts it).
        expect(baseGrooveHits).toBe(0);
    });

    it('SLAMS BACK — every producer runs again on the Drop downbeat', () => {
        const state = makeState({ nextLabel: 'Drop', genreFeel: 'Rock' });
        const cursors = freshCursors();

        // Walk the cut bar first so the cursor advances naturally.
        for (let step = 3 * SPB; step < VERSE_STEPS; step++) {
            generateNotesForStep(state, step, cursors, ALL_ENGINES);
        }
        vi.clearAllMocks();

        // Drop downbeat = step 64.
        const r = generateNotesForStep(state, VERSE_STEPS, cursors, ALL_ENGINES);

        // Every engine ran again — the band is back.
        expect(soloistSpy).toHaveBeenCalled();
        expect(bassSpy).toHaveBeenCalled();
        expect(accompSpy).toHaveBeenCalled();
        expect(harmonySpy).toHaveBeenCalled();
        expect(r.notes.length).toBeGreaterThan(0);
        expect(r.coordination.dropMuteActive).toBe(false);
    });

    it('does NOT mute earlier bars of the Verse (mute is exactly 1 bar)', () => {
        // why: regression guard — the cut must be exactly the LAST bar. If the
        // gate fired on `barsUntilSectionChange >= 0` instead of `=== 0` it
        // would silence the whole final-measure-lookahead window. Bar 2 here is
        // now the penultimate bar (Epic 3 S12: `barsUntilSectionChange === 1`);
        // `shouldFireDropMute` still returns false there because it gates strictly
        // on `=== 0`, so the drop mechanic did NOT widen with the structural counter.
        const state = makeState({ nextLabel: 'Drop', genreFeel: 'Rock' });
        const cursors = freshCursors();

        // Bars 0..2 of the Verse must all play normally.
        let notesBeforeCut = 0;
        for (let step = 0; step < 3 * SPB; step++) {
            const r = generateNotesForStep(state, step, cursors, ALL_ENGINES);
            notesBeforeCut += r.notes.length;
            expect(r.coordination.dropMuteActive).toBe(false);
        }
        expect(notesBeforeCut).toBeGreaterThan(0);
    });

    it('CUTS into a Breakdown too — the gesture is reused, not drop-only', () => {
        // why: a Breakdown is the energy FLOOR (0.3) — the delta into it is
        // negative — so it cannot trigger via the energy-delta threshold. It
        // fires purely on the literal label match. The gesture (1-bar cut +
        // crash + downbeat re-entry) is deliberately identical to a Drop's:
        // reusing one code path is a stated S1 decision (2026-05-20). This
        // guards the breakdown branch the spec names but no other test reached.
        const state = makeState({ nextLabel: 'Breakdown', genreFeel: 'Rock' });
        const cursors = freshCursors();

        let totalNotes = 0;
        for (let step = 3 * SPB; step < VERSE_STEPS; step++) {
            const r = generateNotesForStep(state, step, cursors, ALL_ENGINES);
            totalNotes += r.notes.length;
            expect(r.coordination.dropMuteActive).toBe(true);
        }
        // The whole cut bar is silent, exactly as for a Drop.
        expect(totalNotes).toBe(0);
        expect(soloistSpy).not.toHaveBeenCalled();
        expect(bassSpy).not.toHaveBeenCalled();
        expect(accompSpy).not.toHaveBeenCalled();
        expect(harmonySpy).not.toHaveBeenCalled();
    });
});

describe('Drop/Breakdown S1(b) — trigger gating', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('does NOT fire on a Verse→Verse change (no drop, no energy lift)', () => {
        // Negative control — equal-energy section change must not cut.
        const state = makeState({ nextLabel: 'Verse', genreFeel: 'Rock' });
        const cursors = freshCursors();

        let totalNotes = 0;
        for (let step = 3 * SPB; step < VERSE_STEPS; step++) {
            const r = generateNotesForStep(state, step, cursors, ALL_ENGINES);
            totalNotes += r.notes.length;
            expect(r.coordination.dropMuteActive).toBe(false);
        }
        expect(totalNotes).toBeGreaterThan(0);
    });

    it('FIRES an energy-delta-inferred cut LATE in the form (+0.4, past 0.6)', () => {
        // why: the mechanic catches a structural lift even without a literal
        // "drop" label (Verse 0.5 → Chorus 0.9 = +0.4). But an inferred cut is
        // a back-half gesture — gated on form position. Here the first section
        // is 7 bars, so the cut bar (bar 6, downbeat step 96) sits at
        // form-fraction 0.75, past DROP_INFERRED_MIN_FORM_PROGRESS (0.6).
        const state = makeState({ nextLabel: 'Chorus', genreFeel: 'Rock', firstSectionBars: 7 });
        const cursors = freshCursors();

        const r = generateNotesForStep(state, 6 * SPB, cursors, ALL_ENGINES);
        expect(r.coordination.upcomingSectionEnergyDelta).toBeCloseTo(0.4, 5);
        expect(r.coordination.dropMuteActive).toBe(true);
    });

    it('does NOT fire an energy-delta-inferred cut EARLY in the form (+0.4, before 0.6)', () => {
        // why: the listen-test (2026-05-20) flagged the inferred cut firing on
        // early choruses as too aggressive — the gesture spends its payoff
        // before a chorus norm is even established. Here the first section is
        // only 2 bars, so the cut bar (bar 1, steps 16..31) sits at
        // form-fraction ~0.12, well below 0.6 — the +0.4 lift still qualifies on
        // energy, but the position gate suppresses it. This is the core guard
        // for the form-position fix.
        const state = makeState({ nextLabel: 'Chorus', genreFeel: 'Rock', firstSectionBars: 2 });
        const cursors = freshCursors();

        let totalNotes = 0;
        for (let step = 1 * SPB; step < 2 * SPB; step++) {
            const r = generateNotesForStep(state, step, cursors, ALL_ENGINES);
            totalNotes += r.notes.length;
            // Energy delta still qualifies — only position holds the cut back.
            expect(r.coordination.upcomingSectionEnergyDelta).toBeCloseTo(0.4, 5);
            expect(r.coordination.dropMuteActive).toBe(false);
        }
        expect(totalNotes).toBeGreaterThan(0);
    });

    it('FIRES a literal Drop EARLY in the form (authored intent is not position-gated)', () => {
        // why: the form-position gate applies ONLY to the energy-delta-inferred
        // cut. A section explicitly labelled "Drop" is authored intent and must
        // fire wherever it sits — even as the second section of the form. Cut
        // bar is bar 1 (steps 16..31), form-fraction ~0.12.
        const state = makeState({ nextLabel: 'Drop', genreFeel: 'Rock', firstSectionBars: 2 });
        const cursors = freshCursors();

        let totalNotes = 0;
        for (let step = 1 * SPB; step < 2 * SPB; step++) {
            const r = generateNotesForStep(state, step, cursors, ALL_ENGINES);
            totalNotes += r.notes.length;
            expect(r.coordination.dropMuteActive).toBe(true);
        }
        expect(totalNotes).toBe(0);
    });

    it('does NOT fire on a Pre-Chorus→Chorus change (+0.3 exactly — strict `>`)', () => {
        // why: the energy threshold uses a STRICT `>` 0.3, not `>=`. The
        // canonical pre-chorus→chorus lift is +0.3 exactly (0.6 → 0.9). A
        // pre-chorus IS already the build into the chorus — cutting the whole
        // band before every chorus entry would make the gesture ambient. Only
        // harder, multi-step lifts (+0.4 and up) qualify. Boundary regression
        // guard: if this flips to `>=`, the cut fires on every chorus.
        //
        // firstSectionBars: 7 puts the cut bar at form-fraction 0.75 — PAST the
        // position gate — so the strict `>` is the ONLY thing suppressing it.
        // (At the default early position the position gate would mask this.)
        const state = makeState({
            currentLabel: 'Pre-Chorus',
            nextLabel: 'Chorus',
            genreFeel: 'Rock',
            firstSectionBars: 7,
        });
        const cursors = freshCursors();

        let totalNotes = 0;
        for (let step = 6 * SPB; step < 7 * SPB; step++) {
            const r = generateNotesForStep(state, step, cursors, ALL_ENGINES);
            totalNotes += r.notes.length;
            expect(r.coordination.upcomingSectionEnergyDelta).toBeCloseTo(0.3, 5);
            expect(r.coordination.dropMuteActive).toBe(false);
        }
        expect(totalNotes).toBeGreaterThan(0);
    });

    it('does NOT fire for a non-drop-friendly genre (Jazz) even into a Drop', () => {
        // why: a 1-bar full-band cut is idiomatic for rock/metal/EDM/hip-hop and
        // alien to jazz — the genre gate must hold even when the label says Drop.
        const state = makeState({ nextLabel: 'Drop', genreFeel: 'Jazz' });
        const cursors = freshCursors();

        let totalNotes = 0;
        for (let step = 3 * SPB; step < VERSE_STEPS; step++) {
            const r = generateNotesForStep(state, step, cursors, ALL_ENGINES);
            totalNotes += r.notes.length;
            expect(r.coordination.dropMuteActive).toBe(false);
        }
        // Jazz plays straight through the boundary — no cut.
        expect(totalNotes).toBeGreaterThan(0);
        expect(soloistSpy).toHaveBeenCalled();
    });
});

// Reliability: the mechanic is deterministic (structural, no Math.random in the
// gate path) — a single run is authoritative. Run via
//   for i in $(seq 1 30); do npx vitest run tests/standards/drop-breakdown-mechanic.test.ts; done
// to confirm 30/30 anyway.
