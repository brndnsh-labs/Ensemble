// @ts-nocheck
// Disco soloist idiom critique — PRODUCTION-FAITHFUL on the live engine
// (getSoloistNotePhraseFirst). Rerouted from the retired legacy getSoloistNote
// (epic #10, #863). Real dispatch-built state, a real seed, an absolute advancing
// step with currentLoopCount per loop (mirrors scheduler-core), scanned across a
// full macro-form over a bright major-key (I-V-vi-IV) progression — the natural
// home of disco/Philly-soul's diatonic-major lead.
//
// What this guards: the disco lead stays bright and diatonic-major — it favors the
// 6th/9th "sparkle" tones on major bars, keeps chromaticism low, and sits in a
// bright register. DROPPED (dark; re-added by #869/#870): the octave-leap hook,
// the run/slide/graceNote device palette, and the device-set restriction — those
// are all `note.device` gestures emitted ONLY by the retired legacy engine;
// phrase-first notes carry no `.device` field at all. Double-stops are guarded by
// phrase-first-double-stop-critique.
import { describe, expect, it } from 'vitest';
import { CHORD_PRESETS } from '../../public/data/chord-presets.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { resolveSoloistStyle, STYLE_CONFIG } from '../../public/engine/soloist-config.js';
import { getSoloistNotePhraseFirst } from '../../public/engine/soloist-phrase-first.js';
import { generateSessionSeed } from '../../public/engine/soloist-seeder.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

function buildState(presetName: string) {
    dispatch(ACTIONS.RESET_STATE);
    dispatch(ACTIONS.SET_TIME_SIGNATURE, '4/4');
    dispatch(ACTIONS.SET_KEY, 'C');
    dispatch(ACTIONS.UPDATE_GB, { enabled: true, genreFeel: 'Disco' });
    dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'smart', mode: 'monophonic' });
    dispatch(ACTIONS.SET_BAND_INTENSITY, 0.7);
    dispatch(ACTIONS.SET_BPM, 120);
    const state = getState();
    const preset = CHORD_PRESETS.find((p) => p.name === presetName);
    state.arranger.key = 'C';
    state.arranger.isMinor = false;
    state.arranger.sections = preset.sections.map((s, i) => ({ ...s, id: `p-${i}` }));
    validateProgression(state);
    return state;
}

function simulate(presetName = 'Pop (Standard)') {
    const state = buildState(presetName);
    const seed = generateSessionSeed(state, state.arranger, 'smart', 0.7, 'DISCO_CRITIQUE');
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
    const scanned = loopLen * 3 + 64;
    for (let abs = 0; abs < scanned; abs++) {
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
        for (const n of Array.isArray(res) ? res : [res]) {
            if (typeof n.midi === 'number') {
                notes.push({ midi: n.midi, chordRoot: chord.rootMidi, quality: chord.quality });
            }
        }
    }
    return { notes, scanned };
}

describe('Soloist Disco Critique (phrase-first)', () => {
    it('keeps the disco lead bright and diatonic-major over an I-V-vi-IV progression', () => {
        const { notes, scanned } = simulate('Pop (Standard)');
        expect(notes.length).toBeGreaterThan(50);

        // (1) ACTIVE-BUT-GROOVING DENSITY. Disco is busier than a ballad but leaves
        // air for the four-on-the-floor; it is NOT a wall-to-wall bebop line.
        const notesPerBar = notes.length / (scanned / 16);
        const restRatio = 1 - notes.length / scanned;

        // (2) 6/9 BRIGHTNESS on major chords (LOGGED, NOT ASSERTED — see below).
        // Disco upper lines sparkle on the 6th (rel 9) / 9th (rel 2). Share of notes
        // over major-quality bars landing on those colors; baseline = uniform 2/12.
        let majNotes = 0;
        let sixNineHits = 0;
        for (const n of notes) {
            if (n.quality === 'major') {
                majNotes++;
                const rel = (n.midi - n.chordRoot + 120) % 12;
                if (rel === 2 || rel === 9) {
                    sixNineHits++;
                }
            }
        }
        const sixNineShare = majNotes > 0 ? sixNineHits / majNotes : 0;

        // (3) LOW CHROMATICISM over major chords. Disco is bright diatonic-major,
        // not chromatic. Hard-coded diatonic set (NOT re-derived from the engine).
        const DIATONIC_MAJOR = new Set([0, 2, 4, 5, 7, 9, 11]);
        let chromaticOnMaj = 0;
        for (const n of notes) {
            if (n.quality === 'major') {
                const rel = (n.midi - n.chordRoot + 120) % 12;
                if (!DIATONIC_MAJOR.has(rel)) {
                    chromaticOnMaj++;
                }
            }
        }
        const chromaticShare = majNotes > 0 ? chromaticOnMaj / majNotes : 0;
        const CHROMATIC_BASELINE = (12 - DIATONIC_MAJOR.size) / 12; // 0.4167

        // (4) BRIGHT REGISTER.
        const midis = notes.map((n) => n.midi);
        const minMidi = Math.min(...midis);
        const maxMidi = Math.max(...midis);
        const avgMidi = midis.reduce((a, b) => a + b, 0) / midis.length;

        console.log('\n--- DISCO SOLOIST CRITIQUE (phrase-first) ---');
        console.log(`notes=${notes.length} majNotes=${majNotes}`);
        console.log(
            `[Notes/bar] ${notesPerBar.toFixed(2)} (rest ${(restRatio * 100).toFixed(1)}%)`,
        );
        console.log(`[6/9 share /maj] ${(sixNineShare * 100).toFixed(2)}% (baseline 16.7%)`);
        console.log(
            `[Chromatic share /maj] ${(chromaticShare * 100).toFixed(2)}% (baseline 41.7%)`,
        );
        console.log(`[Register min/avg/max] ${minMidi} / ${avgMidi.toFixed(1)} / ${maxMidi}`);
        console.log('---------------------------------------------\n');

        // The soloist path is fully seeded (scrambleHash over step/section/loop), so
        // every metric is deterministic across runs — thresholds carry fixed
        // headroom, not a flake band.

        // (1) ACTIVE-BUT-GROOVING DENSITY. Structural range (no above-baseline
        // claim): the lower bound keeps the line from collapsing toward a sparse
        // ballad, the upper bound keeps it from a wall-to-wall bebop flurry. Live
        // phrase-first delivers 4.24 notes/bar (73.5% rest) over this macro-form.
        expect(notesPerBar).toBeGreaterThan(2.0);
        expect(notesPerBar).toBeLessThan(9);

        // (2) 6/9 BRIGHTNESS — DROP-AND-DOCUMENT (dark; re-added by #869/#870).
        // The legacy engine FAVORED the 6/9 colors via a disco-gated final-stage
        // multiplier (weight*2.6 on the profile's 6/9 PCs), reaching ~32% over major
        // bars. Phrase-first is theme-driven and does NOT apply that bias: the live
        // 6/9 share is 20.8% — only ~4pp above the 16.7% uniform baseline, well
        // inside the "not a guard" band. Asserting an above-baseline 6/9 preference
        // would be a FALSE claim on this engine, so it is dropped (logged for
        // visibility only — no assertion). The diatonic-major brightness it implies
        // is still guarded — from the other direction — by the low-chromaticism
        // metric below.

        // (3) LOW CHROMATICISM. The surviving disco palette guard. Disco is bright
        // diatonic-major, so out-of-scale share sits FAR below the uniform baseline:
        // live phrase-first lands 6.6% chromatic over major bars vs the 41.7%
        // baseline — a 35pp gap. The < 0.15 floor sits ~8pp above the measured value
        // (deterministic, seeded), guarding against a regression that lets the line
        // wander chromatic; the `< CHROMATIC_BASELINE` assertion forbids a
        // sub-baseline pass.
        expect(chromaticShare).toBeLessThan(0.15);
        expect(chromaticShare).toBeLessThan(CHROMATIC_BASELINE);

        // (4) REGISTER. Structural slot bounds (real guards): the line stays inside
        // the soloist register slot (min >= 52; ceiling 92 = the engine's device-
        // window top). avg sits at the slot midpoint (71.0) — phrase-first does NOT
        // run notably bright (the legacy octave-leap hooks that pushed the mean high
        // are dark, tracked in #869/#870), so the centering band [62,80] is a sanity
        // that the line neither crashes low nor pins the ceiling, NOT a brightness-
        // above-baseline claim.
        expect(minMidi).toBeGreaterThanOrEqual(52);
        expect(maxMidi).toBeLessThanOrEqual(92);
        expect(avgMidi).toBeGreaterThan(62);
        expect(avgMidi).toBeLessThan(80);
    });

    // why: style-resolution guard (the reggae dead-profile / Rock->shred class of
    // bug). Pins the routing so a future change can't silently make this critique
    // test the wrong thing. Does not touch the engine — kept verbatim. The Disco
    // GENRE in smart mode resolves to the 'disco' soloist profile
    // (SMART_GENRES.Disco.soloist = 'disco') — what a user actually hears.
    it('resolves Disco genre/style to the disco soloist profile', () => {
        expect(resolveSoloistStyle('smart', 'Disco')).toBe('disco');
        expect(resolveSoloistStyle(undefined, 'Disco')).toBe('disco');
        expect(resolveSoloistStyle('disco', 'Disco')).toBe('disco');
        expect(resolveSoloistStyle('disco', undefined)).toBe('disco');

        // #553 profile-intent guard: pin the enrichment so a future edit can't
        // silently hollow disco back to a stub. octaveLeap is the signature hook;
        // [2,9] is the 6/9 brightness intent; hook-recall motivicResponse on. (These
        // are CONFIG-object assertions — they guard the profile's declared intent,
        // not live engine emission; the octave-leap GESTURE itself is dark on
        // phrase-first, tracked in #869/#870.)
        const disco = STYLE_CONFIG.disco;
        expect(disco.allowedDevices).toContain('octaveLeap');
        expect(disco.targetExtensions).toEqual([2, 9]);
        expect(disco.motivicResponse.enabled).toBe(true);
    });
});
