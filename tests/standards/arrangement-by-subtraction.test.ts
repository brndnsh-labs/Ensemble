// @ts-nocheck
// tests/standards/arrangement-by-subtraction.test.ts
//
// Critique test for story #1008 — Arrangement by subtraction: seeded
// instrumentation plan per (section, occurrence).
//
// The whole macro-arc otherwise projects onto one scalar (bandIntensity) — a
// big chorus is "the same band, louder." Real arrangements evolve by TEXTURE:
// verse 2 drops the comp, the bridge floats on pads, the final chorus is tutti.
// The most audible arrangement gesture is an instrument NOT playing.
//
// Starter subtraction table (implemented in arrangement-layering.ts
// `getSubtractionMutes`, gated to pilot genres Rock / Neo-Soul / Jazz):
//   - Verse, 1st pass    → full band                → mute []
//   - Verse, 2nd pass    → comp tacet               → mute ['chords']
//   - Bridge, any pass   → harmony pads only, no comp→ mute ['chords']
//   - Chorus, final pass → tutti                    → mute []
//   - every other (section, occurrence)             → mute []
//
// #1027 (never-mute-the-last-pitched-lane guard): the plan additionally
// receives the enabled-pitched-lane flags from the publish site and drops any
// mute whose removal would leave zero enabled pitched lanes — so an unusual
// config (comp + drums only) can never be stripped to drums-only. Block (3).
//
// Test strategy (mirrors intro-outro-layering.test.ts):
//   (1) Coordination publication via `generateNotesForStep` with all engines
//       disabled — drive a REAL multi-section macro-form (repeated Verse,
//       a Bridge, a final Chorus) and assert the published
//       `coordination.subtractionMutedLanes` — and hence the ACTIVE-LANE SET —
//       differs by section occurrence, production-faithful across the form.
//   (2) Engine-isolated gates: feed each engine a coordination object with the
//       plan set and confirm the muted lane REALLY produces no note (a hard
//       rest, not a quieter note) while the section's bones + pads still sound.
//
// Determinism: the plan is a pure (section, occurrence, genre) lookup — no
// Math.random. The engine-isolation blocks still stub Math.random at 0.05 and
// 0.95 so a seed quirk in a downstream engine can't fake a passing gate
// (memory:feedback_determinism_test_pattern).
//
// Source: story #1008 (Forgejo); docs/audit/epic-form-arrangement.md (S5 lineage).

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { getAccompanimentNotes } from '../../public/engine/accompaniment.js';
import {
    getSubtractionMutes,
    SUBTRACTION_PILOT_GENRES,
} from '../../public/engine/arrangement-layering.js';
import { isBassActive } from '../../public/engine/bass-engine.js';
import { getHarmonyNotes } from '../../public/engine/harmonies.js';
import { generateNotesForStep } from '../../public/engine/tick-logic.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

// --- Fixtures ----------------------------------------------------------------

const TS_CONFIG = TIME_SIGNATURES['4/4'];
const STEPS_PER_BEAT = TS_CONFIG.stepsPerBeat; // 4
const STEPS_PER_BAR = TS_CONFIG.beats * STEPS_PER_BEAT; // 16
const SEC_BARS = 4;
const SEC_STEPS = SEC_BARS * STEPS_PER_BAR; // 64

// All five band lanes. The subtraction plan lists MUTED lanes; the active set is
// this list minus the muted lanes. Drums + soloist are never subtractable by the
// starter table (the section's rhythmic + melodic bones must sound).
const ALL_LANES = ['bass', 'drums', 'chords', 'harmony', 'soloist'] as const;

function activeLanes(mutedLanes: string[]): string[] {
    return ALL_LANES.filter((l) => !mutedLanes.includes(l));
}

const CHORD_C_CHORDS = {
    rootMidi: 60,
    quality: 'maj7',
    is7th: true,
    beats: 4,
    intervals: [0, 4, 7, 11],
    freqs: [261.63, 329.63, 392.0, 493.88],
    sectionId: 'sec',
    sectionLabel: 'Verse',
};

// A real macro-form with a repeated Verse, a Bridge, and a repeated (→final)
// Chorus so occurrence counting is exercised end-to-end:
//   Verse(1) → Chorus(1) → Verse(2) → Bridge → Chorus(2 = final)
const FORM = [
    { label: 'Verse', occ: 1, final: false },
    { label: 'Chorus', occ: 1, final: false },
    { label: 'Verse', occ: 2, final: false },
    { label: 'Bridge', occ: 1, final: false },
    { label: 'Chorus', occ: 2, final: true },
] as const;

function makeMacroFormState(genreFeel = 'Rock') {
    const total = FORM.length * SEC_STEPS;
    const stepMap: any[] = [];
    const sectionMap: any[] = [];
    const progression: any[] = [];
    FORM.forEach((sec, i) => {
        const start = i * SEC_STEPS;
        const end = start + SEC_STEPS;
        const chord = {
            ...CHORD_C_CHORDS,
            sectionId: `sec-${i}`,
            sectionLabel: sec.label,
        };
        stepMap.push({ start, end, chord, sectionStart: start, sectionEnd: end });
        sectionMap.push({ id: `sec-${i}`, start, end, label: sec.label });
        progression.push(chord);
    });

    return {
        arranger: {
            totalSteps: total,
            timeSignature: '4/4',
            stepMap,
            sectionMap,
            progression,
            key: 'C',
            isMinor: false,
        },
        chords: { enabled: false, style: 'smart', volume: 0.5 },
        bass: { enabled: false, style: 'smart', volume: 0.5, lastFreq: null, octave: 0 },
        soloist: makeSoloistMock({
            enabled: false,
            style: 'smart',
            busySteps: 0,
            notesInPhrase: 0,
        }),
        harmony: { enabled: false, style: 'smart', complexity: 0.5, lastMidis: [] },
        groove: {
            enabled: false,
            genreFeel,
            measures: 1,
            instruments: [],
            fillActive: false,
            sectionSeedMap: {},
        },
        playback: {
            bpm: 120,
            bandIntensity: 0.6,
            songMode: true,
            isEndingPending: false,
            intent: {},
        },
    } as any;
}

// --- (0) Pure plan-function contract ----------------------------------------

describe('Arrangement by subtraction — plan table (#1008)', () => {
    it('applies the exact starter table for each pilot genre', () => {
        for (const genre of SUBTRACTION_PILOT_GENRES) {
            // Verse 1st pass → full band.
            expect(getSubtractionMutes('Verse', 1, 2, genre)).toEqual([]);
            // Verse 2nd pass → comp tacet.
            expect(getSubtractionMutes('Verse', 2, 2, genre)).toEqual(['chords']);
            // Verse 3rd+ pass → full band (table only specifies the 2nd).
            expect(getSubtractionMutes('Verse', 3, 3, genre)).toEqual([]);
            // Bridge, any pass → pads only, no comp.
            expect(getSubtractionMutes('Bridge', 1, 1, genre)).toEqual(['chords']);
            // Chorus, final pass → tutti.
            expect(getSubtractionMutes('Chorus', 2, 2, genre)).toEqual([]);
            // Chorus, earlier pass → full band.
            expect(getSubtractionMutes('Chorus', 1, 2, genre)).toEqual([]);
        }
    });

    it('is inert (full band) for every non-pilot genre', () => {
        for (const genre of ['Funk', 'Disco', 'Reggae', 'Metal', 'Bossa Nova', undefined]) {
            // Even the most-subtracted cell (Verse 2nd pass) stays full band.
            expect(getSubtractionMutes('Verse', 2, 2, genre as any)).toEqual([]);
            expect(getSubtractionMutes('Bridge', 1, 1, genre as any)).toEqual([]);
        }
    });
});

// --- (1) Coordination publication (production-faithful, end-to-end) ---------

describe('Arrangement by subtraction — coordination publication (#1008)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('publishes an active-lane set that differs by section occurrence', () => {
        const state = makeMacroFormState('Rock');
        const cursors = {
            mainCursor: { index: 0, sectionIndex: 0 },
            lookaheadCursor: { index: 0, sectionIndex: 0 },
        };

        const report: { label: string; occ: number; muted: string[]; active: string[] }[] = [];
        FORM.forEach((sec, i) => {
            const step = i * SEC_STEPS; // first downbeat of each section
            const r = generateNotesForStep(state, step, cursors, {
                includeSoloist: false,
                includeBass: false,
                includeChords: false,
                includeHarmony: false,
                includeDrums: false,
            });
            const muted = r.coordination.subtractionMutedLanes as string[];
            report.push({
                label: sec.label,
                occ: sec.occ,
                muted,
                active: activeLanes(muted),
            });
            // The published plan carries the right occurrence too (sanity).
            expect(r.coordination.sectionOccurrence).toBe(sec.occ);
        });

        // eslint-disable-next-line no-console
        console.log(
            `[subtraction] Critique Report — active lanes per (section, occurrence):\n${report
                .map(
                    (p) =>
                        `  ${p.label} #${p.occ}: active={${p.active.join(',')}}` +
                        (p.muted.length ? ` muted={${p.muted.join(',')}}` : ' (full band)'),
                )
                .join('\n')}`,
        );

        const [verse1, chorus1, verse2, bridge, chorusFinal] = report;

        // Verse 1st pass → full band (all five lanes).
        expect(verse1.muted).toEqual([]);
        expect(verse1.active).toEqual([...ALL_LANES]);

        // Chorus 1st (non-final) pass → full band.
        expect(chorus1.muted).toEqual([]);

        // Verse 2nd pass → comp tacet: chords lane gone, bones + pads remain.
        expect(verse2.muted).toEqual(['chords']);
        expect(verse2.active).not.toContain('chords');
        expect(verse2.active).toEqual(
            expect.arrayContaining(['bass', 'drums', 'soloist', 'harmony']),
        );

        // Bridge → pads only, no comp: chords gone, harmony (pads) present.
        expect(bridge.muted).toEqual(['chords']);
        expect(bridge.active).not.toContain('chords');
        expect(bridge.active).toContain('harmony');
        expect(bridge.active).toEqual(expect.arrayContaining(['bass', 'drums']));

        // Chorus final pass → tutti (all five lanes back).
        expect(chorusFinal.muted).toEqual([]);
        expect(chorusFinal.active).toEqual([...ALL_LANES]);

        // The CRUX: the active-lane set differs by occurrence of the SAME section.
        expect(verse1.active).not.toEqual(verse2.active); // Verse 1 ≠ Verse 2
        expect(chorus1.active).toEqual(chorusFinal.active); // both choruses full…
        expect(verse2.active).not.toEqual(chorusFinal.active); // …but ≠ the stripped verse
    });

    it('is inert across the whole form for a non-pilot genre (full band throughout)', () => {
        const state = makeMacroFormState('Funk'); // not a pilot genre
        const cursors = {
            mainCursor: { index: 0, sectionIndex: 0 },
            lookaheadCursor: { index: 0, sectionIndex: 0 },
        };
        FORM.forEach((_sec, i) => {
            const step = i * SEC_STEPS;
            const r = generateNotesForStep(state, step, cursors, {
                includeSoloist: false,
                includeBass: false,
                includeChords: false,
                includeHarmony: false,
                includeDrums: false,
            });
            expect(r.coordination.subtractionMutedLanes).toEqual([]);
        });
    });
});

// --- (2) Engine-isolated gates: the muted lane is REALLY silent -------------

function makeCoord(mutedLanes: string[]) {
    return {
        sectionStart: 0,
        sectionEnd: SEC_STEPS,
        sectionOccurrence: 2,
        introBarsElapsed: -1,
        outroBarsRemaining: -1,
        isFinalMeasure: false,
        subtractionMutedLanes: mutedLanes,
        kickHit: false,
        snareHit: false,
        soloistBusy: false,
        soloistMidi: 0,
        bassHit: false,
        bassMidi: 0,
    };
}

function makeStepInfoForBeat(measureStep: number) {
    return {
        isMeasureStart: measureStep === 0,
        isBeatStart: measureStep % STEPS_PER_BEAT === 0,
        isGroupStart: measureStep === 0,
        isBackbeat: measureStep === 4 || measureStep === 12,
        isPulse: measureStep % 4 === 0,
        isPulseStart: measureStep === 0,
        isOffbeat: measureStep % 4 !== 0,
        isEOfBeat: false,
        isAOfBeat: false,
        beatIndex: Math.floor(measureStep / STEPS_PER_BEAT),
        mStep: measureStep,
        tsConfig: { beats: 4, stepsPerBeat: 4 },
    };
}

function makeChordsMockState() {
    return {
        playback: {
            bandIntensity: 0.55,
            bpm: 120,
            complexity: 0.4,
            intent: { syncopation: 0, anticipation: 0, layBack: 0 },
        },
        arranger: {
            timeSignature: '4/4',
            totalSteps: SEC_STEPS,
            progression: [CHORD_C_CHORDS],
        },
        chords: { enabled: true, style: 'smart', density: 'standard', octave: 60 },
        bass: { enabled: false, lastFreq: null },
        soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
        groove: { genreFeel: 'Rock', instruments: [] },
        harmony: { enabled: false, buffer: new Map(), rhythmicMask: 0 },
    };
}

function makeHarmonyMockState() {
    return {
        playback: { bandIntensity: 0.7, bpm: 120, complexity: 0.5, intent: {} },
        arranger: {
            timeSignature: '4/4',
            totalSteps: SEC_STEPS,
            progression: [CHORD_C_CHORDS],
        },
        chords: { enabled: false, style: 'smart' },
        bass: { enabled: false, lastFreq: null, lastMidiPlayed: null },
        soloist: makeSoloistMock({ enabled: false, busySteps: 0, notesInPhrase: 0 }),
        groove: { genreFeel: 'Rock', instruments: [] },
        harmony: {
            enabled: true,
            style: 'strings',
            complexity: 0.5,
            buffer: new Map(),
            rhythmicMask: 0,
            lastMidis: [],
            octave: 72,
        },
    };
}

function makeBassMockState() {
    return {
        playback: { bandIntensity: 0.6, bpm: 120, complexity: 0.4, intent: {} },
        groove: { genreFeel: 'Rock', instruments: [], measures: 1 },
        soloist: makeSoloistMock({ busySteps: 0, tension: 0, enabled: false }),
        arranger: { timeSignature: '4/4', totalSteps: SEC_STEPS, stepMap: [], sectionMap: [] },
        bass: { lastFreq: null, busySteps: 0, lastMidiPlayed: null },
    };
}

describe.each([0.05, 0.95])('Arrangement by subtraction — comp gate (Math.random=%s)', (rnd) => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(Math, 'random').mockReturnValue(rnd);
    });

    it("comp is a HARD rest when 'chords' is subtracted (Verse-2 / Bridge)", () => {
        const state = makeChordsMockState();
        getState.mockReturnValue(state);
        const stepInfo = makeStepInfoForBeat(0);
        const notes = getAccompanimentNotes(
            state,
            CHORD_C_CHORDS,
            0,
            0,
            0,
            stepInfo,
            makeCoord(['chords']),
        );
        // Real silence: no musical voicings and no CC/sustain events either.
        const musical = notes.filter((n: any) => !n.muted && n.midi > 0);
        expect(musical.length).toBe(0);
        expect(notes.length).toBe(0);
    });

    it('comp plays when the plan is empty (full-band section)', () => {
        const state = makeChordsMockState();
        getState.mockReturnValue(state);
        const stepInfo = makeStepInfoForBeat(0);
        const notes = getAccompanimentNotes(
            state,
            CHORD_C_CHORDS,
            0,
            0,
            0,
            stepInfo,
            makeCoord([]),
        );
        const musical = notes.filter((n: any) => !n.muted && n.midi > 0);
        expect(musical.length).toBeGreaterThan(0);
    });
});

describe.each([
    0.05, 0.95,
])('Arrangement by subtraction — bones + pads survive (Math.random=%s)', (rnd) => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.spyOn(Math, 'random').mockReturnValue(rnd);
    });

    it("bass still plays when only 'chords' is subtracted (bones sound)", () => {
        const state = makeBassMockState();
        getState.mockReturnValue(state);
        const stepInfo = getStepInfo(0, TS_CONFIG, [], TIME_SIGNATURES);
        expect(isBassActive(state, 'rock', 0, 0, stepInfo, makeCoord(['chords']))).toBe(true);
    });

    it("harmony/pads still play on the Bridge (only 'chords' subtracted)", () => {
        const state = makeHarmonyMockState();
        getState.mockReturnValue(state);
        // Sample across the bar to dodge style-driven single-step exits — the
        // KEY claim is "pads are NOT categorically silenced when chords is muted."
        let total = 0;
        for (let ms = 0; ms < STEPS_PER_BAR; ms++) {
            const si = makeStepInfoForBeat(ms);
            const n = getHarmonyNotes(
                state,
                CHORD_C_CHORDS,
                null,
                ms,
                72,
                'strings',
                0,
                null,
                makeCoord(['chords']),
                si,
            );
            total += n.length;
        }
        expect(total).toBeGreaterThan(0);
    });

    it("harmony IS silent when 'harmony' itself is subtracted (gate wired)", () => {
        const state = makeHarmonyMockState();
        getState.mockReturnValue(state);
        for (let ms = 0; ms < STEPS_PER_BAR; ms++) {
            const si = makeStepInfoForBeat(ms);
            const n = getHarmonyNotes(
                state,
                CHORD_C_CHORDS,
                null,
                ms,
                72,
                'strings',
                0,
                null,
                makeCoord(['harmony']),
                si,
            );
            expect(n.length).toBe(0);
        }
    });
});

// --- (3) Never-mute-the-last-pitched-lane guard (#1027) ----------------------
//
// The subtraction table is blind to which lanes the user has ENABLED. An
// unusual config (comp + drums only) would let "Verse 2 drops the comp" strip
// the section to drums-only — a harmonic hole. The guard drops any mute whose
// removal would leave zero enabled pitched lanes (bass/chords/harmony/soloist;
// drums are unpitched and never count).

const FULL_BAND = { bass: true, chords: true, harmony: true, soloist: true };
const NO_PITCHED = { bass: false, chords: false, harmony: false, soloist: false };

describe('Arrangement by subtraction — last-pitched-lane guard (#1027, plan table)', () => {
    it('drops the comp mute when the comp is the only enabled pitched lane', () => {
        const compOnly = { ...NO_PITCHED, chords: true };
        for (const genre of SUBTRACTION_PILOT_GENRES) {
            // Verse 2 and the Bridge both want ['chords'] — the guard rescues both.
            expect(getSubtractionMutes('Verse', 2, 2, genre, compOnly)).toEqual([]);
            expect(getSubtractionMutes('Bridge', 1, 1, genre, compOnly)).toEqual([]);
        }
    });

    it('keeps the comp mute when ANY other pitched lane still sounds', () => {
        // Each pitched lane alone is enough to justify the subtraction — the
        // soloist counts (a comp+lead band keeps its stripped Verse 2).
        for (const survivor of ['bass', 'harmony', 'soloist'] as const) {
            const enabled = { ...NO_PITCHED, chords: true, [survivor]: true };
            expect(getSubtractionMutes('Verse', 2, 2, 'Rock', enabled)).toEqual(['chords']);
            expect(getSubtractionMutes('Bridge', 1, 1, 'Rock', enabled)).toEqual(['chords']);
        }
    });

    it('keeps a mute of an already-disabled lane (silences nothing; plan byte-stable)', () => {
        // All pitched lanes off: muting the (already-silent) comp changes
        // nothing audible, and keeping it preserves the published plan for
        // every config the guard does not need to rescue.
        expect(getSubtractionMutes('Verse', 2, 2, 'Rock', NO_PITCHED)).toEqual(['chords']);
    });

    it('omitted enabled-lanes param = plain table (full band assumed)', () => {
        expect(getSubtractionMutes('Verse', 2, 2, 'Rock')).toEqual(['chords']);
        expect(getSubtractionMutes('Verse', 2, 2, 'Rock', FULL_BAND)).toEqual(['chords']);
    });
});

describe('Arrangement by subtraction — guard publication (#1027, production-faithful)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    function freshCursors() {
        return {
            mainCursor: { index: 0, sectionIndex: 0 },
            lookaheadCursor: { index: 0, sectionIndex: 0 },
        };
    }

    const LANES_OFF = {
        includeSoloist: false,
        includeBass: false,
        includeChords: false,
        includeHarmony: false,
        includeDrums: false,
    };

    it('comp+drums-only config keeps the comp through Verse 2 and the Bridge', () => {
        const state = makeMacroFormState('Rock');
        state.chords.enabled = true; // the ONLY enabled pitched lane
        const cursors = freshCursors();

        const report: string[] = [];
        FORM.forEach((sec, i) => {
            const r = generateNotesForStep(state, i * SEC_STEPS, cursors, LANES_OFF);
            const muted = r.coordination.subtractionMutedLanes as string[];
            report.push(`  ${sec.label} #${sec.occ}: muted={${muted.join(',')}}`);
            // The guard rescues EVERY section — the comp can never be stripped.
            expect(muted).toEqual([]);
        });
        // eslint-disable-next-line no-console
        console.log(
            `[subtraction] Critique Report — comp+drums-only config (#1027 guard):\n${report.join('\n')}`,
        );
    });

    it('full-band config still gets the plain table (guard inert)', () => {
        const state = makeMacroFormState('Rock');
        state.chords.enabled = true;
        state.bass.enabled = true;
        state.harmony.enabled = true;
        state.soloist.enabled = true;
        const cursors = freshCursors();

        // Verse 2 (FORM[2]) and the Bridge (FORM[3]) keep their comp subtraction.
        expect(
            generateNotesForStep(state, 2 * SEC_STEPS, cursors, LANES_OFF).coordination
                .subtractionMutedLanes,
        ).toEqual(['chords']);
        expect(
            generateNotesForStep(state, 3 * SEC_STEPS, cursors, LANES_OFF).coordination
                .subtractionMutedLanes,
        ).toEqual(['chords']);
    });

    it('a per-section instrument override counts against the guard', () => {
        const state = makeMacroFormState('Rock');
        state.chords.enabled = true;
        state.bass.enabled = true; // globally on…
        // …but overridden OFF for the Verse-2 section (sec-2) — so inside that
        // section the comp is the last pitched lane and the guard must rescue it.
        state.arranger.sections = [{ id: 'sec-2', instruments: { bass: false } }];
        const cursors = freshCursors();

        expect(
            generateNotesForStep(state, 2 * SEC_STEPS, cursors, LANES_OFF).coordination
                .subtractionMutedLanes,
        ).toEqual([]);
        // The Bridge (sec-3) has no override — bass survives there, comp mute kept.
        expect(
            generateNotesForStep(state, 3 * SEC_STEPS, cursors, LANES_OFF).coordination
                .subtractionMutedLanes,
        ).toEqual(['chords']);
    });
});

// Reliability target: 30/30. Run via
//   npm run test:loop -- tests/standards/arrangement-by-subtraction.test.ts
