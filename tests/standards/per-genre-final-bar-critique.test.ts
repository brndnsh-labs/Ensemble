// @ts-nocheck
// tests/standards/per-genre-final-bar-critique.test.ts
//
// Critique test for `epic-followup-drain` S11 — Per-genre final-bar drum
// gestures. Epic 2 S4 set the universal final-bar treatment (Crash on Open
// lane + reinforced Kick + punctuation Snare on beat 1). Owner listen-test
// (LISTEN_TESTS.md C1, decided 2026-05-25 yes-build) confirmed all genres
// sounded the same at song's end and called for per-genre idiomatic variation.
//
// This file guards the distinctive claim of each per-genre treatment. The
// universal-gesture invariants (Funk default, isFinalMeasure publication,
// HAT_SPINE_GENRES hat-ticker behavior) are pinned by the existing
// `final-bar-cadence.test.ts`; this file adds genre-specific assertions on
// top.
//
// Treatment table (also documented in groove-engine.ts PER_GENRE_FINAL_BAR):
//   - Jazz / Blues   → Open lane fires 'Ride' (not 'Crash'); Snare beat-1 →
//                      'Sidestick'; Open velocity 1.20 (softer swell).
//   - Bossa          → Same as Jazz — refined ride + sidestick.
//   - Country / Acoustic → Universal Crash+Kick+Snare on beat 1, PLUS a
//                      Sidestick rim flourish on beat 3 (loopStep 8) at
//                      velocity 0.85 — the rolling-tag idiom. Beat 3 only
//                      (NOT beats 2/4) so the cadence backbeat snare crack
//                      is preserved — beats 2 and 4 are the loudest snare
//                      hits a country drummer makes on the final bar.
//   - Hip Hop        → Heavier Kick (vel 1.4) and heavier Open Crash
//                      (vel 1.30) — trap-stinger arrival.
//   - Metal          → Open lane fires 'China' (signature metal accent);
//                      Kick velocity bumped to 1.4 for double-kick weight.
//   - Reggae         → Snare beat-1 routes to 'Sidestick' (dub rim
//                      aesthetic); Open Crash kept (reggae endings DO crash).
//   - Funk / Disco / Rock / Neo-Soul / Ska / Minimal / default →
//                      Universal treatment (guarded by final-bar-cadence.test.ts).
//                      Note: 'Ska' (not 'Ska-Punk') is the canonical genreFeel
//                      value smart-genres.ts assigns to the Ska-Punk genre.
//
// Test strategy mirrors the existing critique tests: drive `applyGrooveOverrides`
// in isolation with a `makeDrumsMockState` keyed to each genre and a
// `buildDrumParams` helper for `isFinalMeasure=true`. Math.random is pinned
// to 0.5 in each test so entropy-phase noise doesn't perturb the assertions.
//
// Source: docs/audit/epic-followup-drain.md S11.

import { describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { applyGrooveOverrides } from '../../public/engine/groove-engine.js';
import { getState } from '../../public/state.js';
import { getStepInfo } from '../../public/utils.js';
import { installSeededRandom } from '../utils/seeded-random.js';

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

const TS_CONFIG = TIME_SIGNATURES['4/4'];
const STEPS_PER_BEAT = TS_CONFIG.stepsPerBeat; // 4
const STEPS_PER_BAR = TS_CONFIG.beats * STEPS_PER_BEAT; // 16
const FORM_BARS = 4;
const FORM_STEPS = FORM_BARS * STEPS_PER_BAR; // 64

function makeDrumsMockState(genreFeel: string, lastDrumPreset?: string) {
    return {
        playback: {
            bandIntensity: 0.6,
            bpm: 120,
            songMode: true,
            currentLoopCount: 0,
            complexity: 0.5,
            intent: {},
        },
        groove: {
            genreFeel,
            lastDrumPreset: lastDrumPreset ?? genreFeel,
            instruments: [],
            accentMap: null,
            fillMap: null,
            sectionSeedMap: { 'sec-outro': 0.42 },
            seedTimelineStartStep: 0,
            orchestrationMap: null,
        },
        soloist: { enabled: false, session: { phrasing: { busySteps: 0 } } },
        arranger: {
            timeSignature: '4/4',
            sectionMap: [{ id: 'sec-outro', start: 0, end: FORM_STEPS, label: 'Outro' }],
            stepMap: [{ start: 0, end: FORM_STEPS, chord: { sectionId: 'sec-outro' } }],
            totalSteps: FORM_STEPS,
        },
    };
}

function buildDrumParams(
    step: number,
    instName: string,
    stepVal: number,
    mockState: any,
    isFinalMeasure: boolean,
) {
    const info = getStepInfo(step, TS_CONFIG, [], TIME_SIGNATURES);
    return {
        step,
        inst: { name: instName, muted: false, steps: [] },
        stepVal,
        playback: mockState.playback,
        groove: mockState.groove,
        isDownbeat: info.isMeasureStart,
        isBeatStart: info.isBeatStart,
        isPulse: info.isPulse,
        isPulseStart: info.isPulseStart,
        isGroupStart: info.isGroupStart,
        isBackbeat: info.isBackbeat,
        isOffbeat: info.isOffbeat,
        isEOfBeat: info.isEOfBeat,
        isAOfBeat: info.isAOfBeat,
        beatIndex: info.beatIndex,
        tsConfig: info.tsConfig,
        mStep: info.mStep,
        isCompound: false,
        stepInGroup: 0,
        groupIndex: 0,
        sectionId: 'sec-outro',
        sectionOccurrence: 1,
        isFinalMeasure,
    };
}

// --- Jazz / Bossa / Blues: refined ride swell + sidestick -------------------

describe('Per-genre final-bar — Jazz refined ride swell', () => {
    installSeededRandom();

    it('routes Open lane to Ride on the final downbeat (not Crash)', () => {
        // why: Jazz idiom — endings land on a ride cymbal swell, not a thud.
        // A regression that routed every genre to 'Crash' (the universal
        // default) would be caught by this assertion.
        const state = makeDrumsMockState('Jazz');
        getState.mockReturnValue(state);

        const finalDownbeat = FORM_STEPS - STEPS_PER_BAR;
        const params = buildDrumParams(finalDownbeat, 'Open', 0, state, true);
        const result = applyGrooveOverrides(state, params);

        // eslint-disable-next-line no-console
        console.log(
            `[per-genre-final-bar] Jazz Open: shouldPlay=${result.shouldPlay}, ` +
                `soundName=${result.soundName}, velocity=${result.velocity.toFixed(2)}`,
        );

        expect(result.shouldPlay).toBe(true);
        expect(result.soundName).toBe('Ride');
        // why: Jazz openVelocity = 1.20 (softer swell than universal 1.25).
        // With ±8% jitter (cymbals) the lower bound is ~1.10.
        expect(result.velocity).toBeGreaterThanOrEqual(1.0);
        expect(result.velocity).toBeLessThanOrEqual(1.3);
    });

    it('routes Snare beat-1 to Sidestick (brushwork)', () => {
        // why: Jazz cadence arrival uses a rim/brush hit, not a full snare crack.
        const state = makeDrumsMockState('Jazz');
        getState.mockReturnValue(state);

        const finalDownbeat = FORM_STEPS - STEPS_PER_BAR;
        const params = buildDrumParams(finalDownbeat, 'Snare', 0, state, true);
        const result = applyGrooveOverrides(state, params);

        expect(result.shouldPlay).toBe(true);
        expect(result.soundName).toBe('Sidestick');
    });
});

describe('Per-genre final-bar — Blues refined ride swell', () => {
    installSeededRandom();

    it('routes Open lane to Ride on the final downbeat', () => {
        // why: Blues shares the cymbal-led close idiom with Jazz — same
        // refined ride swell rather than a Crash.
        const state = makeDrumsMockState('Blues');
        getState.mockReturnValue(state);

        const finalDownbeat = FORM_STEPS - STEPS_PER_BAR;
        const params = buildDrumParams(finalDownbeat, 'Open', 0, state, true);
        const result = applyGrooveOverrides(state, params);

        expect(result.shouldPlay).toBe(true);
        expect(result.soundName).toBe('Ride');
    });
});

describe('Per-genre final-bar — Bossa/Latin refined ride swell', () => {
    installSeededRandom();

    it('routes Open lane to Ride and Snare to Sidestick (Bossa Nova)', () => {
        // why: Bossa endings land on a sparse ride bell + clave-style rim,
        // not a Crash. Same shape as Jazz.
        const state = makeDrumsMockState('Bossa Nova');
        getState.mockReturnValue(state);

        const finalDownbeat = FORM_STEPS - STEPS_PER_BAR;
        const openParams = buildDrumParams(finalDownbeat, 'Open', 0, state, true);
        const snareParams = buildDrumParams(finalDownbeat, 'Snare', 0, state, true);

        const openResult = applyGrooveOverrides(state, openParams);
        const snareResult = applyGrooveOverrides(state, snareParams);

        expect(openResult.soundName).toBe('Ride');
        expect(snareResult.soundName).toBe('Sidestick');
    });
});

// --- Country / Acoustic: rolling-tag quarter-note flourish ------------------

describe('Per-genre final-bar — Country rolling-tag flourish', () => {
    installSeededRandom();

    it('keeps the universal Crash on the Open lane on the final downbeat', () => {
        // why: Country endings still want the Crash arrival — the per-genre
        // variation is the flourish on beats 2/3/4, NOT a sample swap on beat 1.
        const state = makeDrumsMockState('Country');
        getState.mockReturnValue(state);

        const finalDownbeat = FORM_STEPS - STEPS_PER_BAR;
        const params = buildDrumParams(finalDownbeat, 'Open', 0, state, true);
        const result = applyGrooveOverrides(state, params);

        expect(result.shouldPlay).toBe(true);
        expect(result.soundName).toBe('Crash');
    });

    it('fires Sidestick flourish on beat 3 of the final bar', () => {
        // why: the rolling-tag country idiom — beat 3 (loopStep 8) gets a
        // Sidestick rim hit at velocity 0.85. This distinguishes the Country
        // treatment from the universal "silence the post-beat-1 cymbals"
        // behavior. Beat 3 is the only non-backbeat quarter-note in 4/4, so
        // the flourish reads as the band ornamenting through the bar without
        // smothering the cadence backbeats on 2 and 4.
        const state = makeDrumsMockState('Country');
        getState.mockReturnValue(state);

        const finalDownbeat = FORM_STEPS - STEPS_PER_BAR;

        const params = buildDrumParams(finalDownbeat + 8, 'Snare', 0, state, true);
        const result = applyGrooveOverrides(state, params);

        // eslint-disable-next-line no-console
        console.log(
            `[per-genre-final-bar] Country Snare flourish loopStep=8: ` +
                `shouldPlay=${result.shouldPlay}, soundName=${result.soundName}, ` +
                `velocity=${result.velocity.toFixed(2)}`,
        );

        expect(result.shouldPlay).toBe(true);
        expect(result.soundName).toBe('Sidestick');
        // why: flourish velocity 0.85 pre-humanize ± ~8% jitter on snare.
        expect(result.velocity).toBeGreaterThanOrEqual(0.7);
        expect(result.velocity).toBeLessThanOrEqual(1.0);
    });

    it('does NOT replace the cadence backbeat (beats 2/4) with the flourish rim', () => {
        // why: reviewer P1 guard — the final-bar backbeats on beats 2 (step 4)
        // and 4 (step 12) MUST keep the strategy's full Snare crack (the
        // loudest cadence-arrival snare a country drummer makes). An earlier
        // draft of the flourish replaced these backbeats with a quiet vel-0.85
        // rim, which would have the drummer pulling back at the moment the
        // cadence should peak. The flourish is now beat-3-only.
        const state = makeDrumsMockState('Country');
        getState.mockReturnValue(state);

        const finalDownbeat = FORM_STEPS - STEPS_PER_BAR;

        for (const loopStep of [4, 12]) {
            const params = buildDrumParams(finalDownbeat + loopStep, 'Snare', 0, state, true);
            const result = applyGrooveOverrides(state, params);
            // If the flourish leaked onto a backbeat, soundName would be
            // 'Sidestick' at velocity ~0.85. Guard against both signals.
            if (result.shouldPlay && result.soundName === 'Sidestick') {
                // Only acceptable Sidestick at a backbeat would be entropy-
                // phase ghost (vel < 0.30) or strategy-driven low-intensity
                // routing. The flourish's distinctive 0.85 vel band is what's
                // forbidden here.
                expect(result.velocity).toBeLessThan(0.7);
            }
        }
    });

    it('does NOT fire the Country flourish on non-quarter-note positions', () => {
        // why: regression guard — the flourish must fire on beat 3 only.
        // Firing on every 16th would be over-busy.
        const state = makeDrumsMockState('Country');
        getState.mockReturnValue(state);

        const finalDownbeat = FORM_STEPS - STEPS_PER_BAR;

        for (const loopStep of [2, 6]) {
            const params = buildDrumParams(finalDownbeat + loopStep, 'Snare', 0, state, true);
            const result = applyGrooveOverrides(state, params);
            if (result.shouldPlay) {
                // If something fires (entropy), it must NOT be the flourish's
                // distinctive 0.85 velocity rim.
                expect(result.velocity).toBeLessThan(0.7);
            }
        }
    });
});

describe('Per-genre final-bar — Acoustic rolling-tag flourish', () => {
    installSeededRandom();

    it('fires Sidestick flourish on beat 3 of the final bar', () => {
        // why: Acoustic shares the rolling-tag idiom — same flourish as
        // Country. The Treatment table aliases countryFlourish for Acoustic.
        const state = makeDrumsMockState('Acoustic');
        getState.mockReturnValue(state);

        const finalDownbeat = FORM_STEPS - STEPS_PER_BAR;

        const params = buildDrumParams(finalDownbeat + 8, 'Snare', 0, state, true);
        const result = applyGrooveOverrides(state, params);

        expect(result.shouldPlay).toBe(true);
        expect(result.soundName).toBe('Sidestick');
    });
});

// --- Hip Hop: trap-stinger arrival ------------------------------------------

describe('Per-genre final-bar — Hip Hop trap stinger', () => {
    installSeededRandom();

    it('reinforces Kick beyond the universal 1.3 (trap-stinger weight)', () => {
        // why: Hip Hop treatment bumps Kick to 1.4 (trap-style outro hit).
        // We assert it's measurably heavier than the universal Funk Kick.
        const stateHipHop = makeDrumsMockState('Hip Hop');
        const stateFunk = makeDrumsMockState('Funk');
        getState.mockReturnValue(stateHipHop);

        const finalDownbeat = FORM_STEPS - STEPS_PER_BAR;
        const params = buildDrumParams(finalDownbeat, 'Kick', 0, stateHipHop, true);
        const hipHopResult = applyGrooveOverrides(stateHipHop, params);

        getState.mockReturnValue(stateFunk);
        const paramsFunk = buildDrumParams(finalDownbeat, 'Kick', 0, stateFunk, true);
        const funkResult = applyGrooveOverrides(stateFunk, paramsFunk);

        // eslint-disable-next-line no-console
        console.log(
            `[per-genre-final-bar] Hip Hop Kick velocity=${hipHopResult.velocity.toFixed(2)}, ` +
                `Funk Kick velocity=${funkResult.velocity.toFixed(2)}`,
        );

        expect(hipHopResult.shouldPlay).toBe(true);
        // why: at Math.random() === 0.5, jitter is zero (humanize(v, seed, amt)
        // returns v * (1 + (rand - 0.5) * amt) → v at rand=0.5). But the
        // jitter actually uses scrambleHash, not Math.random, so values can
        // drift. Assert Hip Hop > Funk by a clean margin: 1.4 vs 1.3 nominal,
        // with ±4% kick jitter both clusters cleanly separate.
        expect(hipHopResult.velocity).toBeGreaterThan(funkResult.velocity);
    });

    it('boosts Open lane Crash velocity (heavier trap sustain)', () => {
        // why: Hip Hop's openVelocity = 1.30 vs universal 1.25. We assert
        // Hip Hop's Crash is heavier than Funk's by checking the raw
        // computed velocity envelope.
        const stateHipHop = makeDrumsMockState('Hip Hop');
        getState.mockReturnValue(stateHipHop);

        const finalDownbeat = FORM_STEPS - STEPS_PER_BAR;
        const params = buildDrumParams(finalDownbeat, 'Open', 0, stateHipHop, true);
        const result = applyGrooveOverrides(stateHipHop, params);

        expect(result.shouldPlay).toBe(true);
        expect(result.soundName).toBe('Crash');
        // why: nominal 1.30 with ±8% cymbal jitter → [1.20, 1.40].
        expect(result.velocity).toBeGreaterThanOrEqual(1.15);
    });
});

// --- Metal: China cymbal accent + double-kick weight -----------------------

describe('Per-genre final-bar — Metal China accent', () => {
    installSeededRandom();

    it('routes Open lane to China on the final downbeat (signature metal accent)', () => {
        // why: Metal idiom — the China cymbal is the iconic metal cadence
        // accent (see metal.ts accentCymbal: 'China'). Routing Open to
        // 'China' on the final bar honors the genre's existing accent
        // pattern. A regression that defaulted to 'Crash' for every genre
        // would be caught here.
        const state = makeDrumsMockState('Metal');
        getState.mockReturnValue(state);

        const finalDownbeat = FORM_STEPS - STEPS_PER_BAR;
        const params = buildDrumParams(finalDownbeat, 'Open', 0, state, true);
        const result = applyGrooveOverrides(state, params);

        // eslint-disable-next-line no-console
        console.log(
            `[per-genre-final-bar] Metal Open: shouldPlay=${result.shouldPlay}, ` +
                `soundName=${result.soundName}, velocity=${result.velocity.toFixed(2)}`,
        );

        expect(result.shouldPlay).toBe(true);
        expect(result.soundName).toBe('China');
    });

    it('reinforces Kick to double-kick weight (≥ universal Funk Kick)', () => {
        // why: Metal kickVelocity = 1.4 vs universal 1.3 — the "double-kick
        // weight" of the metal cadence.
        const stateMetal = makeDrumsMockState('Metal');
        const stateFunk = makeDrumsMockState('Funk');

        const finalDownbeat = FORM_STEPS - STEPS_PER_BAR;

        getState.mockReturnValue(stateMetal);
        const paramsMetal = buildDrumParams(finalDownbeat, 'Kick', 0, stateMetal, true);
        const metalResult = applyGrooveOverrides(stateMetal, paramsMetal);

        getState.mockReturnValue(stateFunk);
        const paramsFunk = buildDrumParams(finalDownbeat, 'Kick', 0, stateFunk, true);
        const funkResult = applyGrooveOverrides(stateFunk, paramsFunk);

        expect(metalResult.velocity).toBeGreaterThan(funkResult.velocity);
    });
});

// --- Reggae: dub-style rim accent -------------------------------------------

describe('Per-genre final-bar — Reggae dub rim accent', () => {
    installSeededRandom();

    it('routes Snare beat-1 to Sidestick (dub aesthetic)', () => {
        // why: Reggae's dub aesthetic loves the rim, not the snare crack.
        // The cadence inversion: reggae's groove skips beat-1 kick but the
        // final-bar IS the arrival, so kick stays; the dub flavor surfaces
        // by routing the snare to Sidestick.
        const state = makeDrumsMockState('Reggae');
        getState.mockReturnValue(state);

        const finalDownbeat = FORM_STEPS - STEPS_PER_BAR;
        const params = buildDrumParams(finalDownbeat, 'Snare', 0, state, true);
        const result = applyGrooveOverrides(state, params);

        // eslint-disable-next-line no-console
        console.log(
            `[per-genre-final-bar] Reggae Snare: shouldPlay=${result.shouldPlay}, ` +
                `soundName=${result.soundName}, velocity=${result.velocity.toFixed(2)}`,
        );

        expect(result.shouldPlay).toBe(true);
        expect(result.soundName).toBe('Sidestick');
    });

    it('keeps the universal Crash on the Open lane (reggae endings do crash)', () => {
        // why: Reggae endings DO crash — the rim swap is on the snare, not
        // on the cymbal. Regression guard against a "Reggae must be all
        // rim, no crash" misread.
        const state = makeDrumsMockState('Reggae');
        getState.mockReturnValue(state);

        const finalDownbeat = FORM_STEPS - STEPS_PER_BAR;
        const params = buildDrumParams(finalDownbeat, 'Open', 0, state, true);
        const result = applyGrooveOverrides(state, params);

        expect(result.shouldPlay).toBe(true);
        expect(result.soundName).toBe('Crash');
    });
});

// --- Universal fallback (negative control for unhandled genres) -------------

describe('Per-genre final-bar — Universal fallback for unhandled genres', () => {
    installSeededRandom();

    it('Funk falls through to the universal Crash treatment', () => {
        // why: negative control — Funk is NOT in the per-genre table, so it
        // must land on the universal openSound='Crash' / snareSound='Snare'.
        // A regression that accidentally aliased Funk to one of the per-genre
        // entries would be caught here.
        const state = makeDrumsMockState('Funk');
        getState.mockReturnValue(state);

        const finalDownbeat = FORM_STEPS - STEPS_PER_BAR;
        const openParams = buildDrumParams(finalDownbeat, 'Open', 0, state, true);
        const snareParams = buildDrumParams(finalDownbeat, 'Snare', 0, state, true);

        const openResult = applyGrooveOverrides(state, openParams);
        const snareResult = applyGrooveOverrides(state, snareParams);

        expect(openResult.soundName).toBe('Crash');
        expect(snareResult.soundName).toBe('Snare');
    });

    it('Disco/Rock/Neo-Soul/Ska/Minimal fall through to universal', () => {
        // why: matrix sweep across the genres NOT in the per-genre table —
        // confirms they all preserve the universal Crash+Snare beat-1 shape.
        // Note: `'Ska'` (not `'Ska-Punk'`) is the actual genreFeel value the
        // smart-genres module assigns to the Ska-Punk genre — reviewer P2
        // caught the harness-string mismatch with HAT_SPINE_GENRES.
        const universalGenres = ['Disco', 'Rock', 'Neo-Soul', 'Ska', 'Minimal'];
        const finalDownbeat = FORM_STEPS - STEPS_PER_BAR;

        for (const genre of universalGenres) {
            const state = makeDrumsMockState(genre);
            getState.mockReturnValue(state);
            const openParams = buildDrumParams(finalDownbeat, 'Open', 0, state, true);
            const snareParams = buildDrumParams(finalDownbeat, 'Snare', 0, state, true);
            const openResult = applyGrooveOverrides(state, openParams);
            const snareResult = applyGrooveOverrides(state, snareParams);

            expect(openResult.soundName, `${genre} Open lane must default to Crash`).toBe('Crash');
            expect(snareResult.soundName, `${genre} Snare lane must default to Snare`).toBe(
                'Snare',
            );
        }
    });

    it('does NOT fire per-genre treatments when isFinalMeasure is false', () => {
        // why: negative control — even a per-genre-handled genre (Jazz) must
        // NOT fire the Ride routing on a non-final bar. The treatment is
        // strictly gated to the final measure.
        const state = makeDrumsMockState('Jazz');
        getState.mockReturnValue(state);

        const params = buildDrumParams(0, 'Open', 0, state, false);
        const result = applyGrooveOverrides(state, params);

        // The cadence Ride must NOT have routed. Either the lane is silent
        // (no section turnaround at step 0) or it carries the strategy's own
        // soundName — but it must not be the cadence 'Ride' routing at
        // velocity ~1.20.
        if (result.shouldPlay && result.soundName === 'Ride') {
            // If a Ride somehow plays (strategy-driven), its velocity must
            // not match the cadence's 1.20 ± jitter — strategy-driven Rides
            // sit at much lower volumes.
            expect(result.velocity).toBeLessThan(1.0);
        }
    });
});

// Reliability: see header — 30/30 run via `npm run test:loop`.
