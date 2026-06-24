// @ts-nocheck
/* eslint-disable */
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
        arranger: { timeSignature: '4/4', progression: [], totalSteps: 16 },
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
    TIME_SIGNATURES: { '4/4': { beats: 4, stepsPerBeat: 4, subdivision: '16th' } },
}));

import { compingState, getAccompanimentNotes } from '../../public/engine/accompaniment.js';
import { isStrummedChordVoice } from '../../public/engine/chords-styles.js';
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
}

// Drive `bars` measures step-by-step; return the emitted chord voicings (sorted
// MIDI arrays) for every step that produced ≥1 pitched note.
function collectVoicings(bars) {
    const hits = [];
    for (let bar = 0; bar < bars; bar++) {
        for (let m = 0; m < 16; m++) {
            const step = bar * 16 + m;
            const notes = getAccompanimentNotes(
                getState(),
                mockChord,
                step,
                m,
                m,
                stepInfoFor(step),
            );
            const midis = notes
                .filter((n) => n && n.velocity > 0 && Number.isFinite(n.midi) && n.midi > 0)
                .map((n) => Math.round(n.midi))
                .sort((a, b) => a - b);
            if (midis.length > 0) {
                hits.push({ step, m, isStructural: stepInfoFor(step).isGroupStart, midis });
            }
        }
    }
    return hits;
}

describe('Comp economy (#715) — intra-bar voicing motion', () => {
    beforeEach(() => {
        resetComp();
        arranger.progression = [mockChord];
        chords.enabled = true;
        chords.style = 'smart';
        bass.enabled = true;
        groove.genreFeel = 'Jazz';
    });

    it('a Jazz bar does NOT re-strike one identical voicing — it states then answers leaner', () => {
        const hits = collectVoicings(4);
        // Critique Report
        const distinct = new Set(hits.map((h) => h.midis.join(',')));
        const sizes = hits.map((h) => h.midis.length);
        console.log(
            `[comp-economy] Jazz Cmaj7: hits=${hits.length} distinct=${distinct.size} sizeRange=[${Math.min(...sizes)}..${Math.max(...sizes)}]`,
        );

        expect(hits.length).toBeGreaterThanOrEqual(4);
        // De-spam: the bar emits more than one distinct voicing (not the same
        // 3-4 notes hammered every hit).
        expect(distinct.size).toBeGreaterThanOrEqual(2);
        // Economy: at least one "answer" is leaner than the fullest "statement".
        expect(Math.min(...sizes)).toBeLessThan(Math.max(...sizes));
    });

    it('answers sit UNDER the statement (structural hits are fuller than offbeat answers)', () => {
        const hits = collectVoicings(4);
        const structuralSizes = hits.filter((h) => h.isStructural).map((h) => h.midis.length);
        const answerSizes = hits.filter((h) => !h.isStructural).map((h) => h.midis.length);
        expect(structuralSizes.length).toBeGreaterThan(0);
        expect(answerSizes.length).toBeGreaterThan(0);
        const avg = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
        expect(avg(structuralSizes)).toBeGreaterThan(avg(answerSizes));
    });

    it('answers MOVE — inner-voice motion makes consecutive answers differ (living, not static)', () => {
        const hits = collectVoicings(4);
        const distinctAnswers = new Set(
            hits.filter((h) => !h.isStructural).map((h) => h.midis.join(',')),
        );
        // At least two distinct answer voicings across the phrase — the top-voice
        // nudge to a neighboring chord tone is firing, so offbeats aren't a static
        // 2-note stamp.
        expect(distinctAnswers.size).toBeGreaterThanOrEqual(2);
    });

    it('locks in loop-to-loop — the same step emits the same voicing every bar', () => {
        const hits = collectVoicings(4);
        // Group by in-bar step m; every occurrence of a given step must match.
        const byStep = new Map();
        for (const h of hits) {
            const key = h.midis.join(',');
            if (!byStep.has(h.m)) {
                byStep.set(h.m, key);
            }
            expect(byStep.get(h.m)).toBe(key);
        }
        expect(byStep.size).toBeGreaterThan(0);
    });

    it('no answer octave-doubles or unisons a voice (review #1 — each hit is all distinct pitch-classes)', () => {
        const hits = collectVoicings(4);
        for (const h of hits) {
            const pcs = new Set(h.midis.map((m) => ((m % 12) + 12) % 12));
            // Same number of distinct pitch-classes as notes → no two voices share
            // a PC (no octave-doubled bare tone, no unison).
            expect(pcs.size).toBe(h.midis.length);
        }
    });

    it('half-diminished answers keep the ♭5 — the tone that names the chord (review #3)', () => {
        groove.genreFeel = 'Jazz';
        resetComp();
        const halfDim = {
            rootMidi: 62, // D
            freqs: [293.66, 349.23, 415.3, 523.25], // D F Ab C (Dm7♭5)
            intervals: [0, 3, 6, 10],
            quality: 'halfdim',
            is7th: true,
            beats: 4,
            sectionId: 'sectionA',
        };
        arranger.progression = [halfDim];
        const flat5PC = (((62 + 6) % 12) + 12) % 12; // ♭5 of D = Ab
        const hits = [];
        for (let bar = 0; bar < 2; bar++) {
            for (let m = 0; m < 16; m++) {
                const step = bar * 16 + m;
                const notes = getAccompanimentNotes(
                    getState(),
                    halfDim,
                    step,
                    m,
                    m,
                    stepInfoFor(step),
                );
                const midis = notes
                    .filter((n) => n && n.velocity > 0 && Number.isFinite(n.midi) && n.midi > 0)
                    .map((n) => Math.round(n.midi));
                if (midis.length > 0 && !stepInfoFor(step).isGroupStart) {
                    hits.push(midis);
                }
            }
        }
        expect(hits.length).toBeGreaterThan(0);
        for (const midis of hits) {
            const pcs = new Set(midis.map((m) => ((m % 12) + 12) % 12));
            expect(pcs.has(flat5PC)).toBe(true);
        }
    });

    it('keys STRIKE a tight block on the statement — no rolled chord on any keyboard genre', () => {
        // Timing spread = max - min timingOffset across the voices of a single hit.
        function statementSpread(genreName) {
            groove.genreFeel = genreName;
            resetComp();
            arranger.progression = [mockChord];
            // step 0 is a group-start (structural) hit → the full statement.
            const notes = getAccompanimentNotes(getState(), mockChord, 0, 0, 0, stepInfoFor(0));
            const offs = notes
                .filter((n) => n && n.velocity > 0 && Number.isFinite(n.timingOffset))
                .map((n) => n.timingOffset);
            return { spread: Math.max(...offs) - Math.min(...offs), count: offs.length };
        }

        // Chords are keyboards today (no guitar chord voice), so every sustained
        // genre strikes a near-block — none should read as a rolled/strummed chord.
        for (const g of ['Jazz', 'Blues', 'Bossa Nova', 'Acoustic']) {
            const { spread, count } = statementSpread(g);
            console.log(
                `[comp-economy] ${g} statement spread ${(spread * 1000).toFixed(1)}ms (${count}v)`,
            );
            expect(count).toBeGreaterThanOrEqual(2);
            expect(spread).toBeLessThan(0.008); // < 8ms — a block strike, not a roll
        }
    });

    it('strum capability is preserved for a future guitar chord voice (isStrummedChordVoice)', () => {
        // Keyboards strike (false); a guitar voice strums (true). Off for everything
        // today; lights up when the electric-guitar chords pack lands (#698).
        expect(isStrummedChordVoice(undefined)).toBe(false);
        expect(isStrummedChordVoice('pack:rhodes')).toBe(false);
        expect(isStrummedChordVoice('grand')).toBe(false);
        expect(isStrummedChordVoice('pack:electric-guitar-clean')).toBe(true);
        expect(isStrummedChordVoice('nylon-guitar')).toBe(true);
    });

    it('GUARD: percussive-identity genres never engage the economy (Funk untouched)', () => {
        groove.genreFeel = 'Funk';
        resetComp();
        for (let m = 0; m < 16; m++) {
            getAccompanimentNotes(getState(), mockChord, m, m, m, stepInfoFor(m));
        }
        // Funk early-returns in its own lane long before applyPerHitEconomy, so the
        // statement memory is never written — proof the sustained-comp economy is
        // scoped out of the percussive lanes.
        expect(compingState.statementChordKey).toBeNull();
    });

    it('grooves by itself — every pulse-genre bar lands a strong beat (no floating bars, soloed)', () => {
        // Isolate the comp: no bass/soloist to borrow a pulse from. Every bar that
        // comps at all must land at least one strong beat (step 0 = beat 1, or
        // step 8 = beat 3 in 4/4) so the groove is self-supporting.
        function anchorCoverage(genreName, bars) {
            groove.genreFeel = genreName;
            bass.enabled = false;
            resetComp();
            arranger.progression = [mockChord];
            let nonEmpty = 0;
            let anchored = 0;
            for (let bar = 0; bar < bars; bar++) {
                const hitSteps = new Set();
                for (let m = 0; m < 16; m++) {
                    const step = bar * 16 + m;
                    const notes = getAccompanimentNotes(
                        getState(),
                        mockChord,
                        step,
                        m,
                        m,
                        stepInfoFor(step),
                    );
                    if (
                        notes.some(
                            (n) => n && n.velocity > 0 && Number.isFinite(n.midi) && n.midi > 0,
                        )
                    ) {
                        hitSteps.add(m);
                    }
                }
                if (hitSteps.size === 0) {
                    continue;
                }
                nonEmpty++;
                if (hitSteps.has(0) || hitSteps.has(8)) {
                    anchored++;
                }
            }
            return { nonEmpty, anchored };
        }

        for (const g of ['Jazz', 'Blues', 'Bossa Nova', 'Rock', 'Country', 'Acoustic']) {
            const { nonEmpty, anchored } = anchorCoverage(g, 24);
            console.log(
                `[comp-groove] ${g}: ${anchored}/${nonEmpty} non-empty bars land a strong beat`,
            );
            expect(nonEmpty).toBeGreaterThan(0);
            expect(anchored).toBe(nonEmpty);
        }
        bass.enabled = true;
    });
});
