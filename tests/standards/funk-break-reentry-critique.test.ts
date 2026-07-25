// @ts-nocheck
/**
 * Funk break re-entry critique (#1202) — REAL engines, no producer mocks.
 *
 * `drop-breakdown-mechanic.test.ts` mocks every pitched producer as a spy, which is
 * the right tool for the gate (it can prove a producer was never *invoked*). But it
 * cannot answer the musical question this gesture actually turns on: when the band
 * slams back on the One, does anything actually SOUND there? A spy that returns a
 * note when called proves the gate opened, not that the engines emit.
 *
 * So this file drives the real `getBassNote` / `getAccompanimentNotes` /
 * `getHarmonyNotes` / `getSoloistNotePhraseFirst` through a Funk chart with a break
 * at a section boundary, and counts what lands on the downbeat after it.
 *
 * Measured (seeded): bass 1 + chords 3 + harmony 1 attack on the One; the soloist
 * does not. Rock's already-shipped silence gesture measures 1/4/1/0 on the same
 * step — i.e. the funk re-entry is exactly as much of a unison as the drop it was
 * modelled on, because both ride the same un-mute. That equivalence is the assertion
 * below: it guards the funk break against regressing *relative to* the shipped
 * gesture, which is a stabler claim than a hardcoded note count.
 *
 * Deliberately NOT asserted: that the re-entry is *accented*. Nothing in this change
 * forces a velocity bump or a rhythmic unison — the stab is "the un-mute lands on the
 * One", not a shaped accent. Whether it needs to hit harder is an ear question.
 */
import { describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import { generateNotesForStep } from '../../public/engine/tick-logic.js';
import { installSeededRandom } from '../utils/seeded-random.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

const TS = TIME_SIGNATURES['4/4'];
const SPB = TS.beats * TS.stepsPerBeat;
const TOTAL_BARS = 8;
const VERSE_BARS = 4;
const VERSE_STEPS = VERSE_BARS * SPB;
const TOTAL = TOTAL_BARS * SPB;

function makeChord(sectionId, sectionLabel) {
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

function makeState(genreFeel, nextLabel = 'Drop') {
    const firstChord = makeChord('sec-1', 'Verse');
    const secondChord = makeChord('sec-2', nextLabel);
    const splitStep = VERSE_STEPS;
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
                { id: 'sec-1', start: 0, end: splitStep, label: 'Verse' },
                { id: 'sec-2', start: splitStep, end: TOTAL, label: nextLabel },
            ],
            progression: [firstChord, secondChord],
            key: 'C',
            isMinor: false,
        },
        chords: { enabled: true, style: 'smart', volume: 0.5, octave: 60, density: 'standard' },
        bass: { enabled: true, style: 'funk', volume: 0.5, lastFreq: null, octave: 38 },
        soloist: makeSoloistMock({ enabled: true, style: 'smart', isResting: false, busySteps: 0 }),
        harmony: { enabled: true, style: 'strings', volume: 0.5, complexity: 0.5, lastMidis: [] },
        groove: {
            enabled: true,
            genreFeel,
            measures: 1,
            instruments: [
                { name: 'Kick', muted: false, steps: new Array(SPB).fill(0) },
                { name: 'Snare', muted: false, steps: new Array(SPB).fill(0) },
                { name: 'HiHat', muted: false, steps: new Array(SPB).fill(0) },
                { name: 'Crash', muted: false, steps: new Array(SPB).fill(0) },
            ],
            fillActive: false,
            sectionSeedMap: {},
        },
        playback: {
            bpm: 110,
            bandIntensity: 0.8,
            songMode: true,
            isEndingPending: false,
            intent: {},
        },
    };
}

function freshCursors() {
    return { chords: 0, bass: 0, soloist: 0, harmony: 0, drums: 0 };
}

const ALL_ENGINES = {
    includeChords: true,
    includeBass: true,
    includeSoloist: true,
    includeHarmony: true,
    includeDrums: true,
};

/**
 * Plays the break bar in sequence (so the un-mute is reached the way playback
 * reaches it) and returns what lands on the first downbeat of the new section.
 */
function measureReentry(genreFeel) {
    const state = makeState(genreFeel);
    const cursors = freshCursors();
    let breakBarPitched = 0;
    let breakBarDrums = 0;
    for (let step = 3 * SPB; step < VERSE_STEPS; step++) {
        const r = generateNotesForStep(state, step, cursors, ALL_ENGINES);
        breakBarPitched += (r.notes || []).length;
        breakBarDrums += (r.drumHits || []).filter((h) => h.shouldPlay).length;
    }
    const r = generateNotesForStep(state, VERSE_STEPS, cursors, ALL_ENGINES);
    // Only real ATTACKS count. The comp lane also emits release markers shaped
    // `{midi: 0, velocity: 0, durationSteps: 0, muted: true, module: 'chords'}` — an
    // unfiltered lane tally would score one of those as "chords attacked on the One",
    // so a future comp-cell shift that landed a release marker on the section downbeat
    // would keep `lanes.chords >= 1` green with nothing sounding.
    const lanes = {};
    const velocities = {};
    for (const n of r.notes || []) {
        if ((n.velocity ?? 0) <= 0 || (n.midi ?? 0) <= 0 || n.muted) {
            continue;
        }
        const lane = n.module || n.type || 'unknown';
        lanes[lane] = (lanes[lane] || 0) + 1;
        velocities[lane] = Math.max(velocities[lane] ?? 0, n.velocity);
    }
    return {
        lanes,
        velocities,
        pitchedLanesAttacking: Object.keys(lanes).length,
        notes: (r.notes || []).length,
        breakBarPitched,
        breakBarDrums,
    };
}

describe('Funk break re-entry (#1202)', () => {
    installSeededRandom(0xc0ffee);

    it('lands a multi-lane attack on the One, with real engines', () => {
        const funk = measureReentry('Funk');
        console.log(
            `[funk break] re-entry lanes=${JSON.stringify(funk.lanes)} ` +
                `peak velocities=${JSON.stringify(funk.velocities)} notes=${funk.notes}; ` +
                `break bar: pitched=${funk.breakBarPitched} drums=${funk.breakBarDrums}`,
        );
        // Velocities are logged, not asserted, and the balance is worth reading: the
        // audible slam is bass + the comp voicing; harmony contributes a single note at
        // roughly a third of the comp's velocity. "Three lanes" is true but flatters the
        // event. See #1273 — nothing here forces the re-entry to hit HARDER than an
        // ordinary downbeat, which is the gesture's missing payoff.

        // The break bar itself: pitched silent, kit playing. Re-asserted here against
        // REAL engines — the spy-based file can only prove the producers weren't called,
        // which is a different claim from "the engines would have emitted nothing".
        expect(funk.breakBarPitched).toBe(0);
        expect(funk.breakBarDrums).toBeGreaterThan(0);

        // The slam-back. Three lanes (bass + chords + harmony) attack together on the
        // downbeat — that is the unison in the musically meaningful sense: the rhythm
        // section hits as one. A floor rather than the measured exact count, so a chords
        // voicing gaining or losing a note doesn't fail this.
        expect(funk.pitchedLanesAttacking).toBeGreaterThanOrEqual(3);
        expect(funk.lanes.bass).toBeGreaterThanOrEqual(1);
        expect(funk.lanes.chords).toBeGreaterThanOrEqual(1);
        expect(funk.lanes.harmony).toBeGreaterThanOrEqual(1);
    });

    it('shares the re-entry path with the silence gesture (neither lane count is zero)', () => {
        // Retitled after review: this documents that the re-entry path is SHARED, which
        // is weaker than it first reads. There is no funk-specific branch in the
        // re-entry, so no plausible change moves funk without moving rock — and the
        // comparison alone would pass vacuously at `0 >= 0`. Both sides are floored so
        // it cannot be satisfied by a total collapse. Test 1's absolute floors carry the
        // real claim.
        const funk = measureReentry('Funk');
        const rock = measureReentry('Rock');
        console.log(
            `[funk break] re-entry parity — funk lanes=${funk.pitchedLanesAttacking} ` +
                `notes=${funk.notes} vs rock lanes=${rock.pitchedLanesAttacking} notes=${rock.notes}`,
        );

        expect(rock.pitchedLanesAttacking).toBeGreaterThanOrEqual(3);
        expect(funk.pitchedLanesAttacking).toBeGreaterThanOrEqual(rock.pitchedLanesAttacking);
    });

    it('keeps the kit going in the break bar — the difference from the rock drop', () => {
        const funk = measureReentry('Funk');
        const rock = measureReentry('Rock');
        console.log(
            `[funk break] break-bar drums — funk=${funk.breakBarDrums} vs rock=${rock.breakBarDrums}`,
        );

        // Rock's break bar carries only the marking crash; funk's carries a groove. If
        // these ever converge, one of the two gestures has been lost.
        expect(funk.breakBarDrums).toBeGreaterThan(rock.breakBarDrums);
    });
});
