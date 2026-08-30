// @ts-nocheck
/**
 * Critique (#1005/#1063): band-wide pocket palette — one per-genre micro-timing
 * the whole band respects.
 *
 * Before #1005 the melodic lanes each carried their own scattered feel constant
 * (bass +5 ms, comp +4 ms, a harmony-only Neo-Soul +20 ms) and the soloist wasn't
 * pocket-locked at all, so "the band's pocket" was not provably one value. #1005
 * introduced `getBandPocket(genreFeel)` in coordination-engine.ts as the SINGLE
 * per-genre authority; #1063 then deleted the band-global groove pocket that once
 * layered underneath (a uniform whole-band shift, inaudible by construction — see
 * docs/design/timing-model.md §2/§4). Every melodic lane (bass, comper/chords,
 * harmony, soloist) now adds EXACTLY getBandPocket + its own lane character; the
 * drums stay on the grid, and that asymmetry is what makes the lean audible.
 *
 * Guards:
 *   (A) AUTHORITY — the palette returns the documented per-genre ms offsets with
 *       the right sign semantics (behind = +, on-top/ahead = −, neutral = 0), and
 *       is a CONSTANT offset (a pure fn of genre — metronome-core: not tempo/step
 *       breathing).
 *   (B) BASS propagation — the bass note's timingOffset IS getBandPocket (plus the
 *       bounded Neo-Soul lane residual).
 *   (C) COMPER propagation — the comp onset's timingOffset picks up getBandPocket.
 *   (D) SOLOIST propagation — the lead's timingOffset picks up getBandPocket
 *       (differential with the seed held fixed).
 *   (E) MICRO-TIMING BOUND — every palette lean stays feel-sized (|lean| < 30 ms,
 *       never rhythmic displacement), and getBandPocket is a pure fn of
 *       (genre, section label) so it can't touch the swing grid (the
 *       swing-ratio-audit oracle, run separately, stays the subdivision
 *       authority).
 *   (F) ENERGY MODULATION (#1064) — section energy scales the lean as a bounded
 *       final-stage multiplier (scale ∈ [0.6, 1.4], exactly 1.0 at verse/default
 *       energy, hard 30 ms feel-ceiling): the genre's character AMPLIFIES as the
 *       arrangement builds — never sign-flipping, monotonic in energy,
 *       deterministic per section, neutral genres untouched.
 *   (G) ENERGY DIFFERENTIAL AT THE LANES — the same downbeat played in a Verse
 *       vs a Chorus section shifts the bass/comp onset by exactly the scaled
 *       differential (drums stay on the grid — tier 2 stays a differential).
 *
 * HARMONY propagation (the 4th lane) is pinned exactly — including the bandPocket
 * term — in tests/integration/melodic-harmony-support.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { CHORD_PRESETS } from '../../public/data/chord-presets.js';
import { compingState, getAccompanimentNotes } from '../../public/engine/accompaniment.js';
import { getBassNote } from '../../public/engine/bass-engine.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { resetCompingState as resetCanonicalCompingState } from '../../public/engine/comping-state.js';
import { getBandPocket } from '../../public/engine/coordination-engine.js';
import { getSoloistNotePhraseFirst } from '../../public/engine/soloist-phrase-first.js';
import { generateSessionSeed } from '../../public/engine/soloist-seeder.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';
import { getStepInfo } from '../../public/utils.js';

const FOUR_FOUR = '4/4';
const STEPS_PER_BAR = 16;
const NUM_BARS = 12;
const TOTAL = STEPS_PER_BAR * NUM_BARS;
const midiToFreq = (m: number) => 440 * 2 ** ((m - 69) / 12);

// The 13 canonical `groove.genreFeel` keys (strategies table in groove-engine.ts;
// note 'Bossa Nova' and 'Ska' NOT 'Bossa'/'Ska-Punk') → documented pocket (s).
const EXPECTED_POCKET: Record<string, number> = {
    'Neo-Soul': 0.025,
    Funk: -0.005,
    Jazz: 0.008,
    'Bossa Nova': -0.003,
    Metal: -0.004,
    Ska: -0.004,
    Acoustic: 0,
    Country: 0,
    Rock: 0.003,
    Disco: -0.002,
    'Hip Hop': 0.012,
    Blues: 0.01,
    Reggae: 0.008,
};
const GENRES = Object.keys(EXPECTED_POCKET);

// #1064 energy modulation — hardcoded mirrors of the SECTION_ENERGY_MAP entries
// this guard drives (pinned here, NOT imported from form-analysis, so the guard
// stays non-tautological: if the energy map or the slope drifts, this fails
// loudly instead of silently tracking the implementation).
const ENERGY_BY_LABEL: Record<string, number> = {
    Breakdown: 0.3,
    Verse: 0.5,
    Chorus: 0.9,
    Drop: 1.0,
};
const POCKET_ENERGY_SLOPE = 0.8; // scale ∈ [0.6, 1.4] over energy ∈ [0, 1]
const FEEL_CEILING = 0.03; // |lean| hard cap — micro-timing, never displacement
function expectedModulated(genre: string, label: string): number {
    const scale = 1 + (ENERGY_BY_LABEL[label] - 0.5) * POCKET_ENERGY_SLOPE;
    const scaled = EXPECTED_POCKET[genre] * scale;
    return Math.sign(scaled) * Math.min(Math.abs(scaled), FEEL_CEILING);
}

function makeC7(sectionLabel: string | null = null) {
    const intervals = [0, 4, 7, 10];
    return {
        rootMidi: 60,
        quality: '7',
        intervals,
        is7th: true,
        beats: 4,
        freqs: intervals.map((iv) => midiToFreq(60 + iv)),
        sectionId: 'Head',
        ...(sectionLabel ? { sectionLabel } : {}),
    };
}

function resetCompingState() {
    resetCanonicalCompingState(compingState);
    // Deliberate fixture override: palette tests force an all-hit current cell
    // so the downbeat onset timing is measured for every genre.
    compingState.currentCell = new Array(16).fill(1);
}

function makeState(genre: string) {
    return {
        playback: {
            bandIntensity: 0.6,
            bpm: 110,
            complexity: 0.5,
            currentLoopCount: 0,
            // intent all-0 → the comp's intensity pushes (gated on
            // intent.anticipation / layBack) never fire, and the offbeat push is
            // skipped on a downbeat. So at a downbeat the comp's timingOffset is
            // exactly getBandPocket(genre) with no residual.
            intent: { syncopation: 0, anticipation: 0, layBack: 0 },
            audio: { currentTime: 0 },
        },
        groove: { genreFeel: genre, lastDrumPreset: genre, enabled: true },
        soloist: {
            enabled: false,
            style: 'smart',
            session: { tension: 0, phrasing: { busySteps: 0, isResting: true } },
            audio: { lastFreq: 0 },
        },
        arranger: {
            timeSignature: FOUR_FOUR,
            totalSteps: TOTAL,
            stepMap: [],
            measureMap: [],
            key: 'C',
            isMinor: false,
            progression: [],
        },
        chords: { enabled: true, style: 'smart', density: 'standard', octave: 60 },
        bass: { enabled: true, style: 'rock', lastFreq: null, octave: 38 },
        harmony: { enabled: false, rhythmicMask: 0 },
        vizState: { enabled: false },
        midi: {},
    } as any;
}

// Bass note timingOffset at a bar downbeat.
function bassTiming(
    genre: string,
    sectionLabel: string | null = null,
    bandIntensity: number | null = null,
): number | null {
    const state = makeState(genre);
    if (bandIntensity !== null) {
        state.playback.bandIntensity = bandIntensity;
    }
    const chord = makeC7(sectionLabel);
    const ctx = {
        sectionStart: 0,
        sectionEnd: TOTAL,
        stepCoordination: { kickHit: false },
    };
    const step = STEPS_PER_BAR;
    const info = getStepInfo(step, FOUR_FOUR, [], TIME_SIGNATURES);
    const res = getBassNote(state, chord, null, 0, null, 38, 'rock', 0, step, 0, ctx, info);
    return res ? (res.timingOffset ?? Number.NaN) : null;
}

// Comp lead-onset timingOffset at a bar downbeat. The lead (voice 0) onset =
// getBandPocket(genre) + a DETERMINISTIC per-voice keyboard humanization
// (`humanShift`, ±3 ms, seeded off the step — not random, so not flaky). Intent
// is all-0 and it's a downbeat, so the smart-path intensity pushes never fire.
function chordLeadTiming(genre: string, sectionLabel: string | null = null): number | null {
    resetCompingState();
    const state = makeState(genre);
    const chord = makeC7(sectionLabel);
    const coord: any = { soloistBusy: false, sectionOccurrence: 1 };
    const step = STEPS_PER_BAR;
    const info = getStepInfo(step, FOUR_FOUR, [], TIME_SIGNATURES);
    const notes = getAccompanimentNotes(state, chord, step, 0, 0, info, coord);
    const lead = notes.find((n: any) => n && n.midi > 0 && !n.muted);
    return lead ? lead.timingOffset : null;
}

// --- Soloist harness (production-faithful real seed) ------------------------
function buildSoloistState(genre: string) {
    dispatch(ACTIONS.RESET_STATE);
    dispatch(ACTIONS.SET_TIME_SIGNATURE, '4/4');
    dispatch(ACTIONS.SET_KEY, 'C');
    dispatch(ACTIONS.UPDATE_GB, { enabled: true, genreFeel: genre });
    dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'smart' });
    dispatch(ACTIONS.SET_BAND_INTENSITY, 0.62);
    dispatch(ACTIONS.SET_BPM, 120);
    const state = getState();
    const preset = CHORD_PRESETS.find((p) => p.name === 'Jazz Blues in F') || CHORD_PRESETS[0];
    state.arranger.key = 'C';
    state.arranger.isMinor = false;
    state.arranger.sections = preset.sections.map((s: any, i: number) => ({ ...s, id: `p-${i}` }));
    validateProgression(state);
    return state;
}

// Collect the lead's timingOffset per absolute step across one macro-form, with
// `state.groove.genreFeel` overridden to `genre` but the SAME seed held fixed, so
// the seed-authored per-note offset cancels in a cross-genre differential.
function soloistTimingByStep(state: any, genre: string): Map<number, number> {
    state.groove.genreFeel = genre;
    const seed = state.soloist.session.seed;
    const total = state.arranger.totalSteps;
    const loopLen = seed.loopLengthSteps || total;
    const stepMap = state.arranger.stepMap;
    const chordAt = (s: number) => {
        const w = ((s % total) + total) % total;
        return stepMap.find((e: any) => w >= e.start && w < e.end)?.chord || null;
    };
    const byStep = new Map<number, number>();
    for (let abs = 0; abs < loopLen; abs++) {
        state.playback.currentLoopCount = Math.floor(abs / total);
        state.soloist.session.phrasing = { isResting: false };
        const res = getSoloistNotePhraseFirst(
            state,
            chordAt(abs),
            chordAt(abs + 1),
            abs,
            null,
            state.soloist.octave,
            'smart',
            abs % 16,
            { stepCoordination: {} },
            { isDownbeat: abs % 16 === 0, isMeasureStart: abs % 16 === 0 },
        );
        if (!res) {
            continue;
        }
        const arr = Array.isArray(res) ? res : [res];
        const lead = arr[arr.length - 1]; // lead is last (double-stops prepend the harmony voice)
        if (lead && typeof lead.timingOffset === 'number') {
            byStep.set(abs, lead.timingOffset);
        }
    }
    return byStep;
}

describe('Band-wide pocket palette — one per-genre pocket every lane respects (#1005)', () => {
    it('(A) getBandPocket is the single authority: documented values + sign semantics', () => {
        for (const g of GENRES) {
            expect(getBandPocket(g)).toBeCloseTo(EXPECTED_POCKET[g], 9);
        }
        // Unknown / undefined genres → neutral (on the grid).
        expect(getBandPocket('NotAGenre')).toBe(0);
        expect(getBandPocket(undefined)).toBe(0);
        expect(getBandPocket(null)).toBe(0);

        // Sign semantics: behind = +, on-top/ahead = −, neutral = 0.
        for (const g of ['Neo-Soul', 'Jazz', 'Hip Hop', 'Blues', 'Reggae', 'Rock']) {
            expect(getBandPocket(g)).toBeGreaterThan(0);
        }
        for (const g of ['Funk', 'Bossa Nova', 'Metal', 'Ska', 'Disco']) {
            expect(getBandPocket(g)).toBeLessThan(0);
        }
        for (const g of ['Acoustic', 'Country']) {
            expect(getBandPocket(g)).toBe(0);
        }
        // Neo-Soul (Dilla) is the deepest lay-back; nothing leans further back.
        const maxBehind = Math.max(...GENRES.map((g) => getBandPocket(g)));
        expect(getBandPocket('Neo-Soul')).toBe(maxBehind);
    });

    it('(B) the bass note timingOffset picks up the genre pocket', () => {
        for (const g of GENRES) {
            const t = bassTiming(g);
            expect(t, `bass emits a note for ${g}`).not.toBeNull();
            if (g === 'Neo-Soul') {
                // Neo-Soul layers an ADDITIONAL intensity-scaled Dilla lag on the
                // bass (pre-existing, separate from the fixed palette), so the bass
                // sits at LEAST the palette's 25 ms behind — deeper, never less.
                expect(t as number).toBeGreaterThanOrEqual(getBandPocket(g) - 1e-9);
                // ...but BOUNDED. #1005 retuned that residual against the 25 ms palette
                // base, so at the harness's 0.6 intensity the neo-soul bass lands ~33 ms —
                // under 40 ms (deliberate, deeper than the 25 ms comp), not the ~44 ms an
                // un-retuned stack produced. Guards the consolidation from silently
                // re-introducing the over-drag.
                expect(t as number, 'neo-soul bass drag stays bounded').toBeLessThan(0.04);
            } else {
                // Downbeat, intent-0 → timingOffset IS the band pocket, exactly
                // (#1063: no band-global term underneath — see timing-model.md).
                expect(t as number, `bass pocket for ${g}`).toBeCloseTo(getBandPocket(g), 9);
            }
        }
    });

    it('(C) the comp onset timingOffset picks up the genre pocket', () => {
        // The comp lead centers on the band pocket within the ±3 ms per-voice
        // keyboard humanization envelope (deterministic — seeded off the step).
        const HUMANIZE = 0.0035; // ±3 ms humanShift band + a hair of margin
        const compByGenre = new Map<string, number>();
        let covered = 0;
        for (const g of GENRES) {
            const t = chordLeadTiming(g);
            if (t === null) {
                continue;
            }
            covered++;
            compByGenre.set(g, t);
            expect(Math.abs(t - getBandPocket(g)), `comp pocket for ${g}`).toBeLessThan(HUMANIZE);
        }
        // The comp must emit on the downbeat for the large majority of genres.
        expect(covered).toBeGreaterThanOrEqual(GENRES.length - 3);

        // Relative ordering across WELL-SEPARATED genres that all strike on this
        // downbeat (gaps ≫ the ±3 ms envelope) proves the genre pocket genuinely
        // shifts the comp behind→ahead. (Neo-Soul/Hip-Hop/Reggae comps rest on this
        // syncopated bar-downbeat — hence they're absent from compByGenre.)
        const behindDeep = compByGenre.get('Blues') as number; // +10 ms
        const behind = compByGenre.get('Jazz') as number; //     +8 ms
        const neutral = compByGenre.get('Acoustic') as number; //  0 ms
        const ahead = compByGenre.get('Funk') as number; //       −5 ms
        expect(behindDeep).toBeGreaterThan(behind);
        expect(behind).toBeGreaterThan(neutral);
        expect(neutral).toBeGreaterThan(ahead);
    });

    it('(D) the soloist lead timingOffset picks up the genre pocket (seed held fixed)', () => {
        const state = buildSoloistState('Acoustic');
        const seed = generateSessionSeed(state, state.arranger, 'smart', 0.62, 'POCKET_SEED');
        state.soloist.session.seed = seed;

        // Baseline: neutral genre (band pocket 0) → emitted offset == seed offset.
        const base = soloistTimingByStep(state, 'Acoustic');
        expect(base.size, 'soloist emits notes').toBeGreaterThan(4);

        for (const g of ['Jazz', 'Funk', 'Hip Hop', 'Reggae', 'Metal']) {
            const cur = soloistTimingByStep(state, g);
            const deltas: number[] = [];
            for (const [step, v] of cur) {
                if (base.has(step)) {
                    deltas.push(v - (base.get(step) as number));
                }
            }
            expect(deltas.length, `shared soloist steps for ${g}`).toBeGreaterThan(4);
            // Every shared step shifts by EXACTLY the band pocket (seed cancels).
            for (const d of deltas) {
                expect(d, `soloist pocket delta for ${g}`).toBeCloseTo(getBandPocket(g), 9);
            }
        }
    });

    it('(F) #1064: section energy modulates the lean — amplify direction, bounded, no sign flip', () => {
        const LABELS = Object.keys(ENERGY_BY_LABEL);
        for (const g of GENRES) {
            const base = EXPECTED_POCKET[g];
            // Back-compat: a verse (energy 0.5), a label-less chord, and an unknown
            // label all yield the palette value VERBATIM — pre-#1064 behavior.
            expect(getBandPocket(g, 'Verse'), `${g} verse`).toBeCloseTo(base, 9);
            expect(getBandPocket(g, null), `${g} null label`).toBeCloseTo(base, 9);
            expect(getBandPocket(g, 'Interlude Q'), `${g} unknown label`).toBeCloseTo(base, 9);

            for (const label of LABELS) {
                const lean = getBandPocket(g, label);
                // Exact final-stage-multiplier math, saturating at the feel ceiling.
                expect(lean, `${g} @ ${label}`).toBeCloseTo(expectedModulated(g, label), 9);
                if (base === 0) {
                    // Neutral genres (Acoustic/Country) are untouched at EVERY energy —
                    // energy amplifies a character; it never invents one.
                    expect(lean, `${g} stays neutral @ ${label}`).toBe(0);
                } else {
                    // The lean never sign-flips: a laid-back genre can never be pushed
                    // ahead of the beat by a quiet section, nor vice versa.
                    expect(Math.sign(lean), `${g} sign @ ${label}`).toBe(Math.sign(base));
                }
                // Bounded band: within ±40% of the palette value AND feel-sized.
                expect(Math.abs(lean)).toBeLessThanOrEqual(Math.abs(base) * 1.4 + 1e-12);
                expect(Math.abs(lean)).toBeLessThanOrEqual(FEEL_CEILING + 1e-12);
                // Deterministic per section: pure fn of (genre, label), no state.
                expect(getBandPocket(g, label)).toBe(lean);
            }

            if (base !== 0) {
                // Amplify direction: |lean| grows as the arrangement builds —
                // breakdown < verse < chorus ≤ drop (≤ because Neo-Soul's top end
                // saturates at the 30 ms feel ceiling: 25 ms × 1.32 and × 1.4 both cap).
                const bd = Math.abs(getBandPocket(g, 'Breakdown'));
                const v = Math.abs(getBandPocket(g, 'Verse'));
                const ch = Math.abs(getBandPocket(g, 'Chorus'));
                const dr = Math.abs(getBandPocket(g, 'Drop'));
                expect(bd, `${g} breakdown < verse`).toBeLessThan(v);
                expect(v, `${g} verse < chorus`).toBeLessThan(ch);
                expect(ch, `${g} chorus <= drop`).toBeLessThanOrEqual(dr);
            }
        }
    });

    it('(G) #1064: the lane-level verse→chorus lean delta is exactly the scaled differential', () => {
        // Bass, Blues (+10 ms palette; the only lane residual is Neo-Soul's, so
        // Blues isolates the pocket): the SAME bar downbeat rendered in a Verse vs
        // a Chorus section deepens the lay-back by exactly palette × (1.32 − 1.0).
        const bluesDelta = expectedModulated('Blues', 'Chorus') - EXPECTED_POCKET.Blues;
        const bassVerse = bassTiming('Blues', 'Verse');
        const bassChorus = bassTiming('Blues', 'Chorus');
        expect(bassVerse, 'bass emits on the verse downbeat').not.toBeNull();
        expect(bassChorus, 'bass emits on the chorus downbeat').not.toBeNull();
        expect(
            (bassChorus as number) - (bassVerse as number),
            'bass verse→chorus delta',
        ).toBeCloseTo(bluesDelta, 9);

        // Comp, same differential: the per-voice keyboard humanShift is seeded off
        // the STEP, and both renders use the same step, so it cancels exactly.
        const compVerse = chordLeadTiming('Blues', 'Verse');
        const compChorus = chordLeadTiming('Blues', 'Chorus');
        expect(compVerse, 'comp emits on the verse downbeat').not.toBeNull();
        expect(compChorus, 'comp emits on the chorus downbeat').not.toBeNull();
        expect(
            (compChorus as number) - (compVerse as number),
            'comp verse→chorus delta',
        ).toBeCloseTo(bluesDelta, 9);

        // Push genre: the chorus digs in HARDER ahead of the beat (more negative),
        // and stays ahead — the build never drags a pushing band behind the kit.
        const funkVerse = bassTiming('Funk', 'Verse') as number;
        const funkChorus = bassTiming('Funk', 'Chorus') as number;
        expect(funkChorus, 'funk chorus pushes harder').toBeLessThan(funkVerse);
        expect(funkChorus).toBeLessThan(0);

        // THE PALETTE'S ABSOLUTE FLOOR — the deepest onset any lane can produce:
        // Neo-Soul bass at a Drop, full intensity. The pocket term saturates at
        // the 30 ms feel ceiling (25 ms × 1.4 = 35 → capped) and the tier-3 bass
        // residual (+0.005 + 1.0 × 0.005) stacks on top → exactly 40 ms. #1064
        // deepened this worst case from 35 ms (review P2-1) — pinned EXACTLY so
        // any future stacking that pushes the band deeper fails loud here.
        const worst = bassTiming('Neo-Soul', 'Drop', 1.0);
        expect(worst, 'neo-soul drop bass emits').not.toBeNull();
        expect(worst as number, 'deepest possible lane onset').toBeCloseTo(0.04, 9);
    });

    it('(E) every palette lean is feel-sized (micro-timing, never rhythmic displacement)', () => {
        // The lean must stay a FEEL — a few ms against the drums — not a rhythmic
        // event. 30 ms is well under any subdivision at playable tempos (a 16th at
        // 200 BPM is 75 ms), so a palette entry that crosses it has stopped being
        // micro-timing and become a flam/displacement. Guards future palette tuning
        // (#1064 energy modulation included) from silently leaving feel territory.
        for (const g of GENRES) {
            expect(Math.abs(getBandPocket(g)), `|lean| for ${g}`).toBeLessThan(0.03);
            // #1064: the energy-modulated lean saturates at the 30 ms feel ceiling —
            // no section can push any genre's lean out of micro-timing territory.
            for (const label of Object.keys(ENERGY_BY_LABEL)) {
                expect(
                    Math.abs(getBandPocket(g, label)),
                    `modulated |lean| for ${g} @ ${label}`,
                ).toBeLessThanOrEqual(FEEL_CEILING + 1e-12);
            }
        }
        // Constant per (genre, section) — metronome-core: getBandPocket is a pure
        // fn of genre + section label. It takes no step/tempo/state, so it can't
        // be tempo breathing or a swing-grid term; #1064's section-energy input is
        // STRUCTURAL (the label), not temporal. The swing subdivision lives
        // entirely in the swing-ratio-audit oracle (run separately, unedited) and
        // is orthogonal to this ± ms offset. (#1063 deleted the band-global groove
        // pocket this once composed with — the palette is now the ONLY band-level
        // term; see docs/design/timing-model.md §2/§4.)
    });
});
