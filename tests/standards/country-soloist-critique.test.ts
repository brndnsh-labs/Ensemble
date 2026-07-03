// @ts-nocheck
// Country soloist idiom critique — PRODUCTION-FAITHFUL on the live engine
// (getSoloistNotePhraseFirst). Rerouted from the retired legacy getSoloistNote
// (epic #10, #863). Real dispatch-built state, a real seed, an absolute advancing
// step with currentLoopCount per loop (mirrors scheduler-core), scanned across a
// full macro-form over the major-key I-IV-V 'Country Standard' progression — the
// natural home of the country major-pentatonic palette.
//
// What this guards: the country lead stays on its major-pentatonic / diatonic
// palette and keeps chromaticism low, AND the ported legacy country devices fire
// idiomatically (#870): the chicken-pick (a chord-aware 3rd-ABOVE STATIC snap
// double-stop on structural accents), the countryBend (the same 3rd-above voice but
// BENDING UP into pitch and ringing on a sustained phrase-ender — the oblique pedal-
// steel bend), and the grace-slide (a +1 down-slide grace into the note). All three
// are country-gated — a contrast pass proves they don't leak into Rock (which uses
// the generic 6th-below double-stop, not the 3rd snap). banjoRoll was evaluated and
// deferred (a 4-note roll reads as a banjo/rhythm texture, not a lead device, and
// stacks onto country's already-tightest §10 expression budget — see #870). The bend
// "cry" is blues/rock only (#869, soloist-cry-critique); countryBend is its country
// analogue, which is why the cry gate leaves country's sustained notes open.
import { describe, expect, it } from 'vitest';
import { CHORD_PRESETS } from '../../public/data/chord-presets.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { resolveSoloistStyle } from '../../public/engine/soloist-config.js';
import { getSoloistNotePhraseFirst } from '../../public/engine/soloist-phrase-first.js';
import { generateSessionSeed } from '../../public/engine/soloist-seeder.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

const STEPS_PER_BEAT = 4; // 4/4, 16 steps/bar

function buildState(presetName: string, genreFeel = 'Country') {
    dispatch(ACTIONS.RESET_STATE);
    dispatch(ACTIONS.SET_TIME_SIGNATURE, '4/4');
    dispatch(ACTIONS.SET_KEY, 'C');
    dispatch(ACTIONS.UPDATE_GB, { enabled: true, genreFeel });
    dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'smart', mode: 'guitar' });
    dispatch(ACTIONS.SET_BAND_INTENSITY, 0.85);
    dispatch(ACTIONS.SET_BPM, 100);
    const state = getState();
    const preset = CHORD_PRESETS.find((p) => p.name === presetName);
    state.arranger.key = 'C';
    state.arranger.isMinor = false;
    state.arranger.sections = preset.sections.map((s, i) => ({ ...s, id: `p-${i}` }));
    validateProgression(state);
    return state;
}

function simulate(presetName = 'Country Standard', genreFeel = 'Country') {
    const state = buildState(presetName, genreFeel);
    const seed = generateSessionSeed(state, state.arranger, 'smart', 0.85, 'COUNTRY_CRITIQUE');
    state.soloist.session.seed = seed;
    state.soloist.session.phrasing.isResting = false;

    const loopLen = seed.loopLengthSteps || state.arranger.totalSteps;
    const total = state.arranger.totalSteps;
    const stepMap = state.arranger.stepMap;
    const chordAt = (s: number) => {
        const w = ((s % total) + total) % total;
        return stepMap.find((e: any) => w >= e.start && w < e.end)?.chord || null;
    };

    const notes: any[] = [];
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
        // A double-stop emission is [harmony, lead] (harmony first, lead last). Record
        // the harmony voice's interval ABOVE the lead so the chicken-pick claim (a 3rd
        // above) is measured directly, not inferred from a count.
        const group = Array.isArray(res) ? res : [res];
        const lead = group.find((n: any) => !n.isDoubleStop) ?? group[group.length - 1];
        for (const n of group) {
            if (typeof n.midi !== 'number') {
                continue;
            }
            notes.push({
                midi: n.midi,
                chordRoot: chord.rootMidi,
                chordQuality: chord.quality,
                isDoubleStop: !!n.isDoubleStop,
                bendStartInterval: n.bendStartInterval ?? 0,
                durationSteps: n.durationSteps ?? 0,
                // interval above the lead, for double-stop voices only (else 0)
                intervalAboveLead: n.isDoubleStop ? n.midi - lead.midi : 0,
            });
        }
    }
    return notes;
}

describe('Soloist Country Critique (phrase-first)', () => {
    it('keeps the country lead on its major-pentatonic / diatonic palette', () => {
        const notes = simulate('Country Standard');
        expect(notes.length).toBeGreaterThan(50);

        // Hard-coded target sets (NOT the engine's own scale lookup, so the
        // adherence claim is not a tautology).
        // Signature country lead scale = MAJOR PENTATONIC {0,2,4,7,9}.
        const MAJOR_PENT = new Set([0, 2, 4, 7, 9]);
        // Diatonic major collection — the frame for the low-chromaticism claim.
        const DIATONIC_MAJOR = new Set([0, 2, 4, 5, 7, 9, 11]);

        let majChordNotes = 0;
        let majPentOnMaj = 0;
        let diatonicOnMaj = 0;
        let chromaticOnMaj = 0;

        for (const n of notes) {
            // The 'Country Standard' progression is all major triads (I-IV-V), so
            // measure the major-pentatonic/diatonic claims over the major chords.
            if (n.chordQuality === 'major') {
                const rel = (n.midi - n.chordRoot + 120) % 12;
                majChordNotes++;
                if (MAJOR_PENT.has(rel)) {
                    majPentOnMaj++;
                }
                if (DIATONIC_MAJOR.has(rel)) {
                    diatonicOnMaj++;
                } else {
                    chromaticOnMaj++;
                }
            }
        }

        const majPentShare = majPentOnMaj / majChordNotes;
        const diatonicShare = diatonicOnMaj / majChordNotes;
        const chromaticShare = chromaticOnMaj / majChordNotes;

        // Random baselines (explicit): MAJOR_PENT = 5/12 = 0.4167 uniform-chromatic;
        // DIATONIC_MAJOR = 7/12 = 0.5833 in-scale, so out-of-scale (chromatic)
        // baseline = (12 - 7)/12 = 0.4167.
        const MAJ_PENT_BASELINE = MAJOR_PENT.size / 12; // 0.4167
        const DIATONIC_BASELINE = DIATONIC_MAJOR.size / 12; // 0.5833
        const CHROMATIC_BASELINE = (12 - DIATONIC_MAJOR.size) / 12; // 0.4167

        // The path is fully seeded (scrambleHash over step/section/loop), so these
        // are bit-deterministic across runs; thresholds carry fixed headroom, not a
        // flake band.

        // (a) MAJOR-PENTATONIC SHARE. Live phrase-first delivers 81.9% over the
        // major-key I-IV-V macro-form. Uniform-chromatic baseline is 0.417 (5/12);
        // >0.74 sits ~32pp above baseline with ~8pp headroom below the live value,
        // guarding against a regression that lets the line drift off the
        // major-pentatonic palette. (Hard-coded target set, not the engine's lookup.)
        expect(majPentShare).toBeGreaterThan(0.74);
        expect(majPentShare).toBeGreaterThan(MAJ_PENT_BASELINE);

        // (b) DIATONIC FRAME. Country is strongly diatonic; live output is 96.9%
        // in the major collection. In-scale uniform baseline is 0.583 (7/12); >0.90
        // sits ~32pp above baseline with ~7pp headroom below the live value.
        expect(diatonicShare).toBeGreaterThan(0.9);
        expect(diatonicShare).toBeGreaterThan(DIATONIC_BASELINE);

        // (c) LOW CHROMATICISM. Out-of-scale notes run ~3.1%. The uniform
        // out-of-scale baseline is 0.417, so the engine sits ~39pp BELOW random —
        // the opposite direction from baseline, which is the point. <0.10 guards a
        // regression that lets the line wander chromatic, with ~7pp headroom.
        expect(chromaticShare).toBeLessThan(0.1);
        expect(chromaticShare).toBeLessThan(CHROMATIC_BASELINE);
    });

    it('fires the chicken-pick snap, the countryBend oblique bend, and the grace-slide, country-gated', () => {
        const country = simulate('Country Standard', 'Country');
        const rock = simulate('Country Standard', 'Rock');

        // --- All country double-stops are a chord-aware 3rd ABOVE the lead. ---
        const ds = country.filter((n) => n.isDoubleStop);
        const thirdsAbove = ds.filter(
            (n) => n.intervalAboveLead === 3 || n.intervalAboveLead === 4,
        );
        // Every country double-stop should be a 3rd-above (country never falls to the
        // generic 6th-below), whether it's a chicken-pick snap or a countryBend.
        const dsThirdShare = ds.length ? thirdsAbove.length / ds.length : 0;
        const thirdRate = thirdsAbove.length / country.length;

        // Two 3rd-above devices, told apart by the harmony voice's bend (#870):
        //   • chicken-pick — a STATIC snap (bendStartInterval 0), short pop on
        //     structural accents.
        //   • countryBend  — the harmony voice BENDS UP into pitch (bendStartInterval
        //     -1) and RINGS the full note: the oblique pedal-steel bend on a
        //     sustained phrase-ender.
        const chickenSnaps = thirdsAbove.filter((n) => n.bendStartInterval === 0);
        const countryBends = thirdsAbove.filter((n) => n.bendStartInterval === -1);
        const chickenRate = chickenSnaps.length / country.length;
        const countryBendRate = countryBends.length / country.length;

        // --- Grace-slide: a +1 down-slide grace into the lead note. ---
        const graceSlides = country.filter((n) => !n.isDoubleStop && n.bendStartInterval === 1);
        const graceRate = graceSlides.length / country.length;

        // --- Gate contrast: Rock gets the generic 6th-BELOW, never the 3rd-snap, the
        //     countryBend up-bend, or the +1 grace (rock scoops are its own gesture). ---
        const rockThirdsAbove = rock.filter(
            (n) => n.isDoubleStop && (n.intervalAboveLead === 3 || n.intervalAboveLead === 4),
        );
        const rockUpBendDS = rock.filter((n) => n.isDoubleStop && n.bendStartInterval === -1);
        const rockGrace = rock.filter((n) => !n.isDoubleStop && n.bendStartInterval === 1);

        console.log('--- Country device Critique Report ---');
        console.log(
            `chicken-pick (static snap): ${chickenSnaps.length} / ${country.length} notes ` +
                `(${(chickenRate * 100).toFixed(1)}%)`,
        );
        console.log(
            `countryBend (oblique up-bend): ${countryBends.length} / ${country.length} notes ` +
                `(${(countryBendRate * 100).toFixed(1)}%); durations=${[...new Set(countryBends.map((n) => n.durationSteps))].sort((a, b) => a - b).join(',')} steps`,
        );
        console.log(
            `all 3rd-above: ${thirdsAbove.length} (${(thirdRate * 100).toFixed(1)}%); ` +
                `${dsThirdShare * 100}% of ${ds.length} double-stops are 3rds-above`,
        );
        console.log(
            `grace-slide: ${graceSlides.length} / ${country.length} notes (${(graceRate * 100).toFixed(1)}%)`,
        );
        console.log(
            `rock gate-contrast: ${rockThirdsAbove.length} 3rd-snaps, ${rockUpBendDS.length} up-bend double-stops, ${rockGrace.length} +1 grace-slides (all must be 0)`,
        );

        // The path is fully seeded (scrambleHash over step/loop), so these counts are
        // bit-deterministic; thresholds carry fixed headroom below the observed value,
        // not a flake band.

        // (a) Chicken-pick FIRES — the defining country snap, re-established after the
        //     legacy delete. Observed 69 static snaps / 1440 notes; >25 guards a
        //     regression that silences it, with ~40 headroom. Splitting out the
        //     static-snap count (bend 0) pins it independently of the countryBend so
        //     one device can't silently substitute for the other.
        expect(chickenSnaps.length).toBeGreaterThan(25);
        // ...and stays PUNCTUATION, not a texture (§10): observed 4.8%; <0.10 keeps
        //     the snap a structural accent.
        expect(chickenRate).toBeLessThan(0.1);
        // (b) countryBend FIRES — the oblique pedal-steel up-bend, ported from the
        //     legacy device (#870). Observed 24 up-bend double-stops / 1440 notes
        //     (1.7%); >10 guards it firing, with headroom.
        expect(countryBends.length).toBeGreaterThan(10);
        // ...stays SPARSE per §10 (country is the tightest expr lane) — a lyrical
        //     landing gesture, not every held note. Observed 1.7%; <0.06 ceiling.
        expect(countryBendRate).toBeLessThan(0.06);
        // ...and RINGS: it's a sustained bend (≥1.25 beats = 5 steps in 4/4), not a
        //     short pop — the whole point is the held oblique bend. Every countryBend
        //     harmony voice sustains.
        for (const n of countryBends) {
            expect(n.durationSteps).toBeGreaterThanOrEqual(Math.ceil(1.25 * STEPS_PER_BEAT));
        }
        // (c) Every country double-stop IS a 3rd-above — country never falls to the
        //     generic 6th-below (the whole point of routing it to its own devices).
        //     countryBend preserves this: it's a 3rd-snap that bends, not a new shape.
        expect(dsThirdShare).toBe(1);
        // (d) Grace-slide FIRES but stays SPARSE per the §10 restraint lesson — a
        //     down-slide INTO chord-tone arrivals, not a tic. Observed ~7.9%
        //     (114/1440); >40 guards it firing while <0.10 keeps it from going
        //     mechanical.
        expect(graceSlides.length).toBeGreaterThan(40);
        expect(graceRate).toBeLessThan(0.1);
        // (e) All three devices stay COUNTRY-GATED — zero leak into Rock (which
        //     resolves to 'shred' and takes the generic 6th-below double-stop, never
        //     the 3rd snap, the up-bend double-stop, or the +1 grace).
        expect(rockThirdsAbove.length).toBe(0);
        expect(rockUpBendDS.length).toBe(0);
        expect(rockGrace.length).toBe(0);
    });

    // why: style-resolution guard (the reggae dead-profile / Rock→shred class of
    // bug). Unlike Rock (smart → 'shred', NOT 'rock'), the Country GENRE resolves
    // to the 'country' profile in BOTH paths — SMART_GENRES.Country.soloist =
    // 'country' and GENRE_STYLE_MAPPING.Country = 'country'. This pins that so a
    // future re-route can't silently make this critique test the wrong profile.
    it('resolves Country genre/style to the canonical country soloist profile', () => {
        // Smart mode + Country feel → 'country' (the SMART_GENRES routing).
        expect(resolveSoloistStyle('smart', 'Country')).toBe('country');
        // Absent explicit style also resolves via the genre feel → 'country'.
        expect(resolveSoloistStyle(undefined, 'Country')).toBe('country');
        // An explicit 'country' UI style is honored verbatim and not rewritten.
        expect(resolveSoloistStyle('country', 'Country')).toBe('country');
    });
});
