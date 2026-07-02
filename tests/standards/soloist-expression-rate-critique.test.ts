// @ts-nocheck
// Soloist genre-idiomatic pitch-expression critique (#771) — PRODUCTION-FAITHFUL
// on the live phrase-first engine (getSoloistNotePhraseFirst).
//
// WHAT THIS LOCKS (the shipped genre-idiomatic expression system): the engine
// attaches pitch-expression metadata to each emitted lead note, and that metadata
// is GENRE-IDIOMATIC (routed through resolveSoloistStyle from the genre feel), not
// uniform decoration sprayed on every genre. The fields (verified against
// soloist-phrase-first.ts):
//   • note.bendStartInterval === -2  — the apex whole-step reach UP into the
//     "money note" (fires on the per-window signature peak; ALL genres).
//   • note.bendStartInterval === -1  — a lighter half-step scoop on ~half the
//     notes in the ±12-step flurry zone around the apex (ALL genres).
//   • note.bendStartInterval === +1  — the COUNTRY grace-slide DOWN into a
//     chord-tone arrival (#870; COUNTRY only, sparse ~10% hash).
//   • note.vibrato === true          — a SUSTAINED note (dur ≥ 1 beat) in the
//     flurry zone sings (ALL genres).
//   • note.expression.bend           — the "cry": a held (≥1.25 beats) note bends
//     up to a chord tone and releases (#869; BLUES / ROCK only).
//
// The harness mirrors funk-soloist-authenticity.test.ts EXACTLY: real dispatch-built
// state, a real session seed (WITHOUT which the engine rests vacuously green — the
// #1 failure mode, guarded by the presence assertions), an absolute advancing `abs`
// step with currentLoopCount per loop (mirrors scheduler-core), scanned across a
// full macro-form (loopLen*3 + 64). Genre→profile goes through resolveSoloistStyle
// (raw style is 'smart'), so Jazz→bird / Funk→funk are "clean" (apex+scoop+vibrato,
// NO cry, NO slide); Blues/Rock add the cry; Country adds the grace-slide.
//
// ONE progression ('12-Bar Blues') is used across every genre so cross-genre RATES
// are honest — only the genre profile differs. Its dom7 harmony gives blues/rock
// their cry targets (b7→root / blue ½-step) and country its chord-tone slide
// landings, so no lane is measured against an empty set.
//
// The metadata is DETERMINISTIC (seeded scrambleHash gate + seeded seed) so the
// per-step expression sequence is identical loop-to-loop and run-to-run — asserted
// directly (§determinism). Thresholds are set BELOW the measured production
// delivery with documented headroom; every "Target:" in the Critique Report matches
// the value asserted (no smell-d report/assert drift).
import { describe, expect, it } from 'vitest';
import { CHORD_PRESETS } from '../../public/data/chord-presets.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { getSoloistNotePhraseFirst } from '../../public/engine/soloist-phrase-first.js';
import { generateSessionSeed } from '../../public/engine/soloist-seeder.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

const PRESET = '12-Bar Blues';

function buildState(genreFeel: string) {
    dispatch(ACTIONS.RESET_STATE);
    dispatch(ACTIONS.SET_TIME_SIGNATURE, '4/4');
    dispatch(ACTIONS.SET_KEY, 'C');
    dispatch(ACTIONS.UPDATE_GB, { enabled: true, genreFeel });
    dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'smart', mode: 'guitar' });
    dispatch(ACTIONS.SET_BAND_INTENSITY, 0.6);
    dispatch(ACTIONS.SET_BPM, 110);
    const state = getState();
    const preset = CHORD_PRESETS.find((p) => p.name === PRESET);
    state.arranger.key = 'C';
    state.arranger.isMinor = false;
    state.arranger.sections = preset.sections.map((s, i) => ({ ...s, id: `p-${i}` }));
    validateProgression(state);
    return state;
}

// Emit one entry per SOUNDING lead note. A double-stop tick returns [harmony, lead]
// (lead always last; the harmony voice carries no expression by contract) — so the
// lead is arr[arr.length - 1] and the denominator counts one lead per emitting tick,
// the melodic line the listener actually hears.
function collect(genreFeel: string, seedStr: string) {
    const state = buildState(genreFeel);
    const seed = generateSessionSeed(state, state.arranger, 'smart', 0.6, seedStr);
    state.soloist.session.seed = seed;
    state.soloist.session.phrasing.isResting = false;

    const loopLen = seed.loopLengthSteps || state.arranger.totalSteps;
    const total = state.arranger.totalSteps;
    const stepMap = state.arranger.stepMap;
    const chordAt = (s: number) => {
        const w = ((s % total) + total) % total;
        return stepMap.find((e: any) => w >= e.start && w < e.end)?.chord || null;
    };

    const notes: Array<{ bsi: number; vib: boolean; cry: boolean }> = [];
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
        const arr = Array.isArray(res) ? res : [res];
        const lead = arr[arr.length - 1];
        notes.push({
            bsi: lead.bendStartInterval ?? 0,
            vib: !!lead.vibrato,
            cry: !!lead.expression?.bend,
        });
    }
    return notes;
}

function rates(notes: Array<{ bsi: number; vib: boolean; cry: boolean }>) {
    const N = notes.length;
    const count = (f: (n: any) => boolean) => notes.filter(f).length;
    const apex = count((n) => n.bsi === -2);
    const scoop = count((n) => n.bsi === -1);
    const slide = count((n) => n.bsi === 1);
    const vib = count((n) => n.vib);
    const cry = count((n) => n.cry);
    const expr = count((n) => n.bsi !== 0 || n.vib || n.cry);
    return { N, apex, scoop, slide, vib, cry, expr, exprRate: expr / N };
}

// Cache one full macro-form scan per genre (each scan is a few thousand ticks).
const SEEDS: Record<string, string> = {
    Jazz: 'EXPR_771_JAZZ',
    Blues: 'EXPR_771_BLUES',
    Country: 'EXPR_771_COUNTRY',
    Funk: 'EXPR_771_FUNK',
};
const _memo: Record<string, ReturnType<typeof rates>> = {};
function measure(genre: string) {
    if (!_memo[genre]) {
        _memo[genre] = rates(collect(genre, SEEDS[genre]));
    }
    return _memo[genre];
}

describe('Soloist Expression Rate Critique (#771)', () => {
    it('prints the per-genre Critique Report', () => {
        const rows = ['Jazz', 'Blues', 'Country', 'Funk'].map((g) => {
            const r = measure(g);
            return `  ${g.padEnd(8)} N=${String(r.N).padStart(4)}  apex=${String(r.apex).padStart(3)}  scoop=${String(r.scoop).padStart(3)}  slide=${String(r.slide).padStart(3)}  vib=${String(r.vib).padStart(3)}  cry=${String(r.cry).padStart(3)}  exprNotes=${String(r.expr).padStart(3)}  exprRate=${(r.exprRate * 100).toFixed(1)}%`;
        });
        console.log(
            [
                '\n===== [expr-rate #771] Critique Report (12-Bar Blues, macro-form) =====',
                ...rows,
                '  --- Genre-idiomatic targets ---',
                '  cry (expression.bend):  Blues >=8  |  Jazz ==0  Funk ==0  Country ==0',
                '  grace-slide (bsi==+1):  Country >=30  |  Jazz ==0  Blues ==0  Funk ==0',
                '  --- §10 restraint (upper bound) ---',
                '  exprRate < 30% for EVERY genre (measured max ~21%, minority guard)',
                '  --- presence (non-vacuous, every genre) ---',
                '  apex(bsi==-2) >=5  AND  scoop(bsi==-1) >=15',
                '=======================================================================\n',
            ].join('\n'),
        );
        expect(true).toBe(true);
    });

    // --- CORE GUARD: the cry is BLUES/ROCK-idiomatic, not sprayed everywhere -----
    // Measured (production): Blues cry=49, Jazz=0, Funk=0, Country=0. This is the
    // differentiation that makes the metadata "genre-idiomatic": the emitted
    // expression.bend field (NOT a re-derivation of the engine's gate) appears only
    // where the idiom calls for it. A regression that removed the genre gate, or
    // mis-resolved Jazz→blues, would fail this.
    it('cry (expression.bend) is idiomatic to Blues and ABSENT from clean genres', () => {
        const blues = measure('Blues');
        const jazz = measure('Jazz');
        const funk = measure('Funk');
        const country = measure('Country');
        // Floor 8: measured 49 with ~41-note headroom. Upper 80 guards against the
        // cry saturating into a constant warble (the §10 "seasick" regression) —
        // measured 49, comfortably under 80.
        expect(blues.cry).toBeGreaterThanOrEqual(8);
        expect(blues.cry).toBeLessThan(80);
        // Clean genres NEVER cry — hard equality (by construction of the genre gate,
        // asserted on the emitted field so a broken gate is caught).
        expect(jazz.cry).toBe(0);
        expect(funk.cry).toBe(0);
        expect(country.cry).toBe(0); // country has its OWN gesture (the slide), not the cry
    });

    // --- CORE GUARD: the grace-slide is COUNTRY-idiomatic ------------------------
    // Measured: Country slide=107, all non-country=0.
    it('grace-slide (bsi==+1) is idiomatic to Country and ABSENT elsewhere', () => {
        const country = measure('Country');
        const jazz = measure('Jazz');
        const blues = measure('Blues');
        const funk = measure('Funk');
        // Floor 30: measured 107 with wide headroom. Upper 220 guards saturation.
        expect(country.slide).toBeGreaterThanOrEqual(30);
        expect(country.slide).toBeLessThan(220);
        expect(jazz.slide).toBe(0);
        expect(blues.slide).toBe(0);
        expect(funk.slide).toBe(0);
    });

    // --- §10 RESTRAINT: expression is a MINORITY of the line for EVERY genre -----
    // The owner loves phrase-first BECAUSE it is sparse; a regression that bends /
    // vibratos every note (the "seasick" failure the issue warns about) must fail.
    // Measured exprRate: Jazz 10.4%, Blues 13.4%, Funk 11.2%, Country 21.2% (country
    // is highest because it stacks the slide). Bound 30% sits ~9pt above the highest
    // observed and far under the 50% "minority" line — a real saturation guard with
    // headroom, not a round-number guess.
    it('keeps expression a sparse minority (< 30%) for every genre (§10 restraint)', () => {
        for (const g of ['Jazz', 'Blues', 'Country', 'Funk']) {
            const r = measure(g);
            expect(r.exprRate, `${g} expression rate`).toBeLessThan(0.3);
            // And a genuine minority (belt-and-braces on the literal §10 claim).
            expect(r.exprRate, `${g} expression rate`).toBeLessThan(0.5);
        }
    });

    // --- PRESENCE: the universal flurry system is actually REACHED in production --
    // apex(-2) and scoop(-1) fire for EVERY genre — proving the assertions above are
    // not measuring an empty set (a seed-less engine rests silently). Measured floors
    // are apex 33-34 and scoop 84-100; thresholds sit well below with headroom.
    it('apex reach (-2) and flurry scoops (-1) appear for every genre', () => {
        for (const g of ['Jazz', 'Blues', 'Country', 'Funk']) {
            const r = measure(g);
            expect(r.N, `${g} produced notes`).toBeGreaterThan(200);
            expect(r.apex, `${g} apex reach`).toBeGreaterThanOrEqual(5);
            expect(r.scoop, `${g} flurry scoops`).toBeGreaterThanOrEqual(15);
            expect(r.vib, `${g} vibrato`).toBeGreaterThan(0);
        }
    });

    // --- DETERMINISM: same genre + seed → identical expression sequence ----------
    // Seeded scrambleHash gate + seeded seed ⇒ loop-to-loop and run-to-run stable.
    // Compares the FULL per-step (bsi, vibrato, cry) sequence, not just aggregate
    // rates, so any nondeterminism (a stray Math.random) is caught.
    it('is fully deterministic across runs (identical expression sequence)', () => {
        for (const g of ['Blues', 'Country']) {
            const a = collect(g, SEEDS[g]);
            const b = collect(g, SEEDS[g]);
            expect(a.length).toBe(b.length);
            const key = (n: any) => `${n.bsi}|${n.vib ? 1 : 0}|${n.cry ? 1 : 0}`;
            expect(a.map(key).join(','), `${g} determinism`).toBe(b.map(key).join(','));
        }
    });
});
