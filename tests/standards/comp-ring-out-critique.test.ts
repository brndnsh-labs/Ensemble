// @ts-nocheck
/* eslint-disable */
// Restate-vs-ring critique (#766). Builds directly on the #715 per-hit economy:
// a real accompanist sometimes SUSTAINS a voicing through the next offbeat hit
// instead of re-attacking it — the most spacious breath of all. Because the comp
// is emitted per-step (a note can't be lengthened after it's gone out), the
// engine decides the ring ON THE STATEMENT: it extends that voicing's duration to
// cover the next answer and marks the answer step (compingState.ringSuppressStep)
// so its call suppresses the re-attack.
//
// What this guards:
//  • ring actually engages on a held chord (some offbeat answers are sustained,
//    not re-struck) — for the block-comp genres AND Acoustic's arp;
//  • when it does, the prior statement's duration REACHES the suppressed step
//    (the chord is genuinely still sounding — no audible gap);
//  • it NEVER overruns the chord boundary (the #707 clamp still wins);
//  • it stays the EXCEPTION, not the default (a limp comp is worse than a busy
//    one) — most hits still re-attack;
//  • it LOCKS loop-to-loop (seeded — same step, same ring decision);
//  • percussive-identity genres never engage it (Funk untouched).
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => {
    const mockState = {
        playback: {
            bandIntensity: 0.5,
            bpm: 120,
            complexity: 0.5,
            intent: { syncopation: 0, anticipation: 0, layBack: 0 },
        },
        // totalSteps deliberately LARGE (a multiple of 16 far bigger than the run)
        // so every bar's statements land on a distinct in-loop step → distinct
        // seeded ring draws.
        // compDraw keys off `step % totalSteps` (accompaniment.ts compInLoopStep),
        // so a 16-step loop would make every bar's ring decision identical.
        arranger: { timeSignature: '4/4', progression: [], totalSteps: 512 },
        chords: { enabled: true, style: 'smart', density: 'standard', octave: 60 },
        bass: { enabled: true, lastFreq: 0 },
        soloist: makeSoloistMock({ enabled: false, busySteps: 0 }),
        groove: { genreFeel: 'Jazz' },
        harmony: { enabled: false, buffer: new Map(), rhythmicMask: 0 },
        vizState: {},
        midi: {},
        storage: {},
        dispatch: vi.fn(),
    };
    return { ...mockState, stateMap: mockState, getState: () => mockState };
});
vi.mock('../../public/config.js', () => ({
    TIME_SIGNATURES: {
        '4/4': {
            beats: 4,
            stepsPerBeat: 4,
            subdivision: '16th',
            pulse: [0, 4, 8, 12],
            grouping: [2, 2],
            backbeat: [1, 3],
        },
    },
}));

import { compingState, getAccompanimentNotes } from '../../public/engine/accompaniment.js';
import { getState } from '../../public/state.js';

const { arranger, chords, bass, groove } = getState();

const mockChord = {
    rootMidi: 60,
    freqs: [261.63, 329.63, 392.0, 493.88], // C E G B (Cmaj7)
    intervals: [0, 4, 7, 11],
    quality: 'maj7',
    is7th: true,
    beats: 4,
    sectionId: 'sectionA',
};

function stepInfoFor(step) {
    const m = ((step % 16) + 16) % 16;
    return {
        isBeatStart: m % 4 === 0,
        isGroupStart: m % 8 === 0, // beats 1 & 3 are the "statement" anchors
        isMeasureStart: m === 0,
        isCompound: false,
        stepsPerBeat: 4,
    };
}

function resetComp() {
    compingState.currentCell = new Array(16).fill(0);
    compingState.lockedUntil = 0;
    compingState.grooveRetentionCount = 0;
    compingState.lastSectionId = null;
    compingState.lastVoicingMidis = [];
    compingState.statementVoicingMidis = [];
    compingState.statementChordKey = null;
    compingState.ringSuppressStep = -1;
    compingState.ringSuppressChordKey = null;
}

// Drive `bars` measures of a single HELD chord, capturing per step: whether a
// note-on fired, the longest emitted duration (in steps), and the ring marker as
// it stood BEFORE and AFTER the call (so we can pair a statement's extension with
// the answer it suppresses).
function driveHeldChord(genreName, bars, style = 'smart') {
    groove.genreFeel = genreName;
    chords.style = style;
    resetComp();
    arranger.progression = [mockChord];
    const rows = [];
    for (let bar = 0; bar < bars; bar++) {
        for (let m = 0; m < 16; m++) {
            const step = bar * 16 + m;
            const markerBefore = compingState.ringSuppressStep;
            const notes = getAccompanimentNotes(
                getState(),
                mockChord,
                step,
                m,
                m,
                stepInfoFor(step),
            );
            const pitched = notes.filter(
                (n) => n && n.velocity > 0 && Number.isFinite(n.midi) && n.midi > 0,
            );
            const maxDur = pitched.reduce((mx, n) => Math.max(mx, n.durationSteps || 0), 0);
            rows.push({
                step,
                m,
                hasNote: pitched.length > 0,
                maxDur,
                markerBefore,
                markerAfter: compingState.ringSuppressStep,
                isStructural: stepInfoFor(step).isGroupStart,
            });
        }
    }
    return rows;
}

// A "ring event" = a step whose call arrived with the marker pointing AT it.
function ringEvents(rows) {
    return rows.filter((r) => r.markerBefore === r.step);
}

describe('Comp restate-vs-ring (#766)', () => {
    beforeEach(() => {
        chords.enabled = true;
        chords.style = 'smart';
        bass.enabled = true;
        groove.genreFeel = 'Jazz';
    });

    it('rings through some offbeat answers on a held Jazz chord — and never re-attacks a rung step', () => {
        const rows = driveHeldChord('Jazz', 24);
        const events = ringEvents(rows);

        // Critique Report
        const noteOns = rows.filter((r) => r.hasNote).length;
        console.log(
            `[comp-ring #766] Jazz Cmaj7 (24 bars): ${events.length} ring events across ${noteOns} note-ons`,
        );

        // Ring engaged at least a handful of times over 24 bars (deterministic, so
        // this is a fixed count, not a flaky range) — but stays the EXCEPTION.
        expect(events.length).toBeGreaterThanOrEqual(3);

        // The whole point: a rung step does NOT re-attack.
        for (const e of events) {
            expect(e.hasNote).toBe(false);
        }
    });

    it('the statement that arms a ring lasts long enough to COVER the suppressed step (no gap)', () => {
        const rows = driveHeldChord('Jazz', 24);
        // The arming row is the STATEMENT: the call that newly set the marker to a
        // future step (markerAfter changed AND points ahead). Its note must ring
        // through the suppressed step — statementStep + duration must REACH it (else
        // there's an audible hole where the answer was). A non-hit step merely
        // *carrying* a pending marker has markerAfter === markerBefore, so it's
        // excluded.
        const arming = rows.filter(
            (r) => r.markerAfter > r.step && r.markerAfter !== r.markerBefore,
        );
        expect(arming.length).toBeGreaterThan(0);
        for (const a of arming) {
            const suppressedStep = a.markerAfter;
            const reach = a.step + a.maxDur;
            expect(a.hasNote).toBe(true); // the statement itself sounds
            // The held voicing is still sounding at the suppressed onset.
            expect(reach).toBeGreaterThanOrEqual(suppressedStep);
        }
    });

    it('never rings past the chord boundary (the #707 clamp still wins)', () => {
        const rows = driveHeldChord('Jazz', 24);
        // Each bar is a 4-beat (16-step) held chord: a note starting at in-bar step
        // m must not sound past the bar end (m + duration <= 16). Ring extends the
        // statement but the #707 ceiling clamps it, so this invariant holds even on
        // rung statements.
        for (const r of rows) {
            if (!r.hasNote) {
                continue;
            }
            expect(r.m + r.maxDur).toBeLessThanOrEqual(16 + 1e-6);
        }
    });

    it('stays the exception — the vast majority of hits still re-attack', () => {
        const rows = driveHeldChord('Jazz', 24);
        const noteOns = rows.filter((r) => r.hasNote).length;
        const events = ringEvents(rows);
        // Rung (suppressed) hits are a small minority of what would otherwise sound.
        // Guards against a regression that makes the comp go limp (ring-happy).
        const ringShare = events.length / (noteOns + events.length);
        console.log(
            `[comp-ring #766] ring share ${(ringShare * 100).toFixed(1)}% of would-be hits`,
        );
        expect(ringShare).toBeLessThan(0.25);
    });

    it('engages on Acoustic (arp pluck-per-beat) too — a held pluck rings through the next beat', () => {
        // Acoustic routes through the arp style (isHit = beat starts). The ring
        // there sustains a pluck through the next beat pluck.
        const rows = driveHeldChord('Acoustic', 24, 'arp');
        const events = ringEvents(rows);
        console.log(`[comp-ring #766] Acoustic arp: ${events.length} ring events`);
        expect(events.length).toBeGreaterThanOrEqual(1);
        for (const e of events) {
            expect(e.hasNote).toBe(false);
        }
    });

    it('locks loop-to-loop — the same absolute-step window rings identically twice', () => {
        const a = driveHeldChord('Jazz', 24);
        const b = driveHeldChord('Jazz', 24);
        const sig = (rows) =>
            rows.map((r) => `${r.hasNote ? 1 : 0}:${r.maxDur}:${r.markerAfter}`).join('|');
        expect(sig(a)).toBe(sig(b));
    });

    it('GUARD: Bossa Nova never arms a ring — partido-alto ostinato stays continuous (#766 review P1)', () => {
        // Bossa is in SUSTAINED_COMP_GENRES (it gets the #715 economy) but is
        // deliberately excluded from RING_THROUGH_GENRES: tying through an interior
        // partido-alto attack blurs the ostinato's syncopated-attack identity. This
        // mirrors Bossa's exclusion from PHRASE_END_THIN_GENRES (Epic 12 S4). Driven
        // at intensity 0.5 (ring-active for Jazz/Acoustic) so this proves the genre
        // gate, not the intensity gate.
        const rows = driveHeldChord('Bossa Nova', 24);
        const armed = rows.some((r) => r.markerAfter > r.step);
        expect(armed).toBe(false);
        expect(ringEvents(rows).length).toBe(0);
        expect(compingState.ringSuppressStep).toBe(-1);
    });

    it('GUARD: percussive-identity genres never arm a ring (Funk untouched)', () => {
        const rows = driveHeldChord('Funk', 8);
        // Ring is gated by SUSTAINED_COMP_GENRES; Funk also early-returns in its own
        // lane. The marker is never armed.
        const armed = rows.some((r) => r.markerAfter > r.step);
        expect(armed).toBe(false);
        expect(compingState.ringSuppressStep).toBe(-1);
    });
});
