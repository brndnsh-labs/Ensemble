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
 *       never rhythmic displacement), and getBandPocket is a pure fn of genre so
 *       it can't touch the swing grid (the swing-ratio-audit oracle, run
 *       separately, stays the subdivision authority).
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

function makeC7() {
    const intervals = [0, 4, 7, 10];
    return {
        rootMidi: 60,
        quality: '7',
        intervals,
        is7th: true,
        beats: 4,
        freqs: intervals.map((iv) => midiToFreq(60 + iv)),
        sectionId: 'Head',
    };
}

function resetCompingState() {
    compingState.currentCell = new Array(16).fill(1);
    compingState.lockedUntil = 0;
    compingState.grooveRetentionCount = 0;
    compingState.lastSectionId = null;
    compingState.lastVoicingMidis = [];
    compingState.lastChordIndex = -1;
    compingState.lastChordQuality = null;
    compingState.funkRotationIndex = 0;
    compingState.bossaRotationIndex = 0;
    compingState.currentVibe = 'balanced';
    compingState.soloistActivity = 0;
    compingState.maxGrooveLength = 4;
    // Statement / ring-suppress memory — must clear too, or a prior genre's call
    // at this step suppresses the next genre's onset (the comp mutes it).
    compingState.statementVoicingMidis = [];
    compingState.statementChordKey = null;
    compingState.ringSuppressStep = -1;
    compingState.ringSuppressChordKey = null;
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
function bassTiming(genre: string): number | null {
    const state = makeState(genre);
    const chord = makeC7();
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
function chordLeadTiming(genre: string): number | null {
    resetCompingState();
    const state = makeState(genre);
    const chord = makeC7();
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
    const report: string[] = [];

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
            report.push(`  bass    ${g.padEnd(10)} ${((t as number) * 1000).toFixed(1)} ms`);
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
                report.push(`  comp    ${g.padEnd(10)} (no downbeat onset — skipped)`);
                continue;
            }
            covered++;
            compByGenre.set(g, t);
            expect(Math.abs(t - getBandPocket(g)), `comp pocket for ${g}`).toBeLessThan(HUMANIZE);
            report.push(`  comp    ${g.padEnd(10)} ${(t * 1000).toFixed(1)} ms`);
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
            report.push(
                `  solo    ${g.padEnd(10)} +${(getBandPocket(g) * 1000).toFixed(1)} ms vs neutral (${deltas.length} steps)`,
            );
        }
    });

    it('(E) every palette lean is feel-sized (micro-timing, never rhythmic displacement)', () => {
        // The lean must stay a FEEL — a few ms against the drums — not a rhythmic
        // event. 30 ms is well under any subdivision at playable tempos (a 16th at
        // 200 BPM is 75 ms), so a palette entry that crosses it has stopped being
        // micro-timing and become a flam/displacement. Guards future palette tuning
        // (#1064 energy modulation included) from silently leaving feel territory.
        for (const g of GENRES) {
            expect(Math.abs(getBandPocket(g)), `|lean| for ${g}`).toBeLessThan(0.03);
        }
        // Constant offset (metronome-core): getBandPocket is a pure fn of genre —
        // it takes no step/tempo/state, so it can't be tempo breathing or a
        // swing-grid term. The swing subdivision lives entirely in the
        // swing-ratio-audit oracle (run separately, unedited) and is orthogonal to
        // this ± ms offset. (#1063 deleted the band-global groove pocket this once
        // composed with — the palette is now the ONLY band-level term; see
        // docs/design/timing-model.md §2/§4.)
        expect(getBandPocket.length).toBe(1); // arity: (genreFeel) only
    });

    it('Critique Report', () => {
        console.log('\n=== Band Pocket Palette (#1005) — realized per-lane offsets ===');
        console.log('Palette (getBandPocket, ms behind[+]/ahead[−]):');
        for (const g of GENRES) {
            console.log(`  ${g.padEnd(10)} ${(getBandPocket(g) * 1000).toFixed(1)} ms`);
        }
        console.log('Per-lane realized offsets at a downbeat:');
        for (const line of report) {
            console.log(line);
        }
        console.log('=============================================================\n');
        expect(true).toBe(true);
    });
});
