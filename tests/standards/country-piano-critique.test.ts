// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getAccompanimentNotes } from '../../public/engine/accompaniment.js';
import { getState } from '../../public/state.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
}));

// why: epic-chords-voicing S6 / chords.md P1 #9, #10. The strum-country lane in
// `accompaniment.ts` was probabilistic (90% fifth on beat 3) and strummed raw
// `chord.freqs.slice(0,3)` — which leaked 7ths/9ths into a triadic country idiom.
// This critique pins down the boom-chick + canonical strum voicing.
describe('Country Piano Critique', () => {
    let mockState;

    beforeEach(() => {
        vi.clearAllMocks();
        mockState = {
            playback: { bandIntensity: 0.6, complexity: 0.5, step: 0, intent: {} },
            groove: { genreFeel: 'Country', pocket: 0, instruments: [] },
            soloist: makeSoloistMock({ enabled: false, busySteps: 0, lastFreq: 0 }),
            bass: { enabled: true, lastFreq: 36 },
            harmony: { enabled: false },
            chords: { enabled: true, style: 'strum-country', density: 'balanced' },
            arranger: { timeSignature: '4/4', totalSteps: 512, progression: [] },
        };
        getState.mockReturnValue(mockState);
    });

    function makeStepInfo(measureStep) {
        const stepInBeat = measureStep % 4;
        return {
            isMeasureStart: measureStep === 0,
            isBeatStart: stepInBeat === 0,
            isBackbeat: measureStep === 4 || measureStep === 12,
            isGroupStart: measureStep === 0 || measureStep === 8,
            isOffbeat: stepInBeat === 2,
            isEOfBeat: stepInBeat === 1,
            isAOfBeat: stepInBeat === 3,
            beatIndex: Math.floor(measureStep / 4),
            groupIndex: Math.floor(measureStep / 8),
            stepInGroup: measureStep % 8,
            mStep: measureStep,
            stepInBeat,
        };
    }

    function simulateBars(chord, bars) {
        mockState.arranger.progression = [chord];
        const events: { step: number; measureStep: number; notes: any[] }[] = [];
        const spm = 16; // 4/4
        for (let step = 0; step < bars * spm; step++) {
            const measureStep = step % spm;
            mockState.playback.step = step;
            const notes = getAccompanimentNotes(
                getState(),
                chord,
                step,
                step,
                measureStep,
                makeStepInfo(measureStep),
                {},
            );
            events.push({ step, measureStep, notes });
        }
        return events;
    }

    // why: country boom-chick is a deterministic idiom — beat 1 = root, beat 3 =
    // fifth, 100%. The previous 90% probabilistic gate smeared the train-beat
    // feel by occasionally repeating the root on beat 3. (chords.md P1 #9)
    it('alternates root and fifth strictly on bass beats (100%, not 90%)', () => {
        const cmaj = {
            rootMidi: 48,
            quality: 'maj',
            intervals: [0, 4, 7],
            freqs: [130.81, 164.81, 196.0],
            sectionId: 'A',
        };
        const events = simulateBars(cmaj, 4);
        const beat1Bass = events.filter((e) => e.measureStep === 0);
        const beat3Bass = events.filter((e) => e.measureStep === 8);

        // The bass step returns a single-note event (the lane returns early),
        // so the bass note is the sole entry. Strum steps return 3-4 voices.
        const pickBassPc = (e: any): number => {
            if (e.notes.length !== 1) {
                return -1;
            }
            return ((e.notes[0].midi % 12) + 12) % 12;
        };
        const rootPcs = beat1Bass.map(pickBassPc);
        const fifthPcs = beat3Bass.map(pickBassPc);
        const rootRatio = rootPcs.filter((pc) => pc === 0).length / rootPcs.length;
        const fifthRatio = fifthPcs.filter((pc) => pc === 7).length / fifthPcs.length;

        console.log(
            '\n--- COUNTRY BOOM-CHICK CRITIQUE (R-5 alternation) ---\n' +
                `[Beat 1 hits]           ${rootPcs.length}\n` +
                `[Beat 1 root ratio]     ${(rootRatio * 100).toFixed(1)}%\n` +
                `[Beat 3 hits]           ${fifthPcs.length}\n` +
                `[Beat 3 fifth ratio]    ${(fifthRatio * 100).toFixed(1)}%\n` +
                '------------------------------------------------------\n',
        );
        expect(rootPcs.length).toBe(4);
        expect(fifthPcs.length).toBe(4);
        expect(rootRatio).toBe(1.0);
        expect(fifthRatio).toBe(1.0);
    });

    // why: canonical acoustic-guitar strum is octave-doubled root + 3rd + 5th
    // (e.g. Cmaj: C3-E3-G3-C4). Parameterised over C/D/F/G — rootPCs that do NOT
    // all coincide with the MIDI 60 anchor — so the assertions actually exercise
    // the voicing math rather than tautologically matching a C-only fixture.
    // (chords.md P1 #10)
    it.each([
        { name: 'Cmaj', rootMidi: 48, intervals: [0, 4, 7], thirdPc: 4 },
        { name: 'Dmaj', rootMidi: 50, intervals: [0, 4, 7], thirdPc: 6 },
        { name: 'Fmaj', rootMidi: 53, intervals: [0, 4, 7], thirdPc: 9 },
        { name: 'Gmaj', rootMidi: 55, intervals: [0, 4, 7], thirdPc: 11 },
    ])('strums octave-doubled root + 3rd + 5th on beats 2 and 4 ($name)', (chordSpec) => {
        const chord = {
            rootMidi: chordSpec.rootMidi,
            quality: 'maj',
            intervals: chordSpec.intervals,
            freqs: [200, 250, 300],
            sectionId: 'A',
        };
        const rootPc = chordSpec.rootMidi % 12;
        const fifthPc = (rootPc + 7) % 12;
        const events = simulateBars(chord, 4);
        const strumEvents = events.filter((e) => e.measureStep === 4 || e.measureStep === 12);

        let strumsWithRoot = 0;
        let strumsWithThird = 0;
        let strumsWithFifth = 0;
        let strumsWithDoubledRoot = 0;

        for (const e of strumEvents) {
            const strumNotes = e.notes.filter((n) => n.durationSteps === 2);
            const pcs = strumNotes.map((n) => ((n.midi % 12) + 12) % 12);
            const rootMidis = strumNotes
                .filter((n) => ((n.midi % 12) + 12) % 12 === rootPc)
                .map((n) => n.midi);
            if (pcs.includes(rootPc)) {
                strumsWithRoot++;
            }
            if (pcs.includes(chordSpec.thirdPc)) {
                strumsWithThird++;
            }
            if (pcs.includes(fifthPc)) {
                strumsWithFifth++;
            }
            if (rootMidis.length >= 2) {
                const sortedRoots = [...rootMidis].sort((a, b) => a - b);
                if (sortedRoots[sortedRoots.length - 1] - sortedRoots[0] >= 12) {
                    strumsWithDoubledRoot++;
                }
            }
        }

        console.log(
            `\n--- COUNTRY STRUM VOICING CRITIQUE (${chordSpec.name}) ---\n` +
                `[Strum hits]            ${strumEvents.length}\n` +
                `[With root pc${rootPc}]         ${strumsWithRoot}\n` +
                `[With 3rd pc${chordSpec.thirdPc}]          ${strumsWithThird}\n` +
                `[With 5th pc${fifthPc}]          ${strumsWithFifth}\n` +
                `[With octave-root]      ${strumsWithDoubledRoot}\n` +
                '----------------------------------------------\n',
        );
        expect(strumEvents.length).toBe(8);
        expect(strumsWithRoot).toBe(8);
        expect(strumsWithThird).toBe(8);
        expect(strumsWithFifth).toBe(8);
        expect(strumsWithDoubledRoot).toBe(8);
    });

    // why: P0-1 catch — sus chords are DEFINED by the absence of the 3rd.
    // The previous implementation fell back to a major 3rd when no 3 or 4
    // was found in intervals, silently re-voicing Dsus4 as a D-major triad.
    // Dsus4 → D resolution is one of the most iconic country/rock idioms;
    // the strum must NOT contain pc 6 (F#) on a Dsus4 chord. The middle
    // voice should be the 4 (G, pc 7) for sus4 or the 2 (E, pc 4) for sus2.
    it('does NOT inject a major 3rd into sus chords', () => {
        const dsus4 = {
            rootMidi: 50,
            quality: 'sus4',
            intervals: [0, 5, 7], // root, 4, 5 — no 3rd
            freqs: [146.83, 196.0, 220.0],
            sectionId: 'A',
        };
        const events = simulateBars(dsus4, 4);
        const strumEvents = events.filter((e) => e.measureStep === 4 || e.measureStep === 12);

        let strumsWithMajor3 = 0;
        let strumsWithSusFourth = 0;
        for (const e of strumEvents) {
            const strumNotes = e.notes.filter((n) => n.durationSteps === 2);
            const pcs = strumNotes.map((n) => ((n.midi % 12) + 12) % 12);
            // D = pc 2, so F# (major 3rd) = pc 6, G (perfect 4th) = pc 7
            if (pcs.includes(6)) {
                strumsWithMajor3++;
            }
            if (pcs.includes(7)) {
                strumsWithSusFourth++;
            }
        }

        console.log(
            '\n--- COUNTRY STRUM SUS PRESERVATION (Dsus4) ---\n' +
                `[Strum hits]            ${strumEvents.length}\n` +
                `[Leaked maj3 (pc 6)]    ${strumsWithMajor3}\n` +
                `[Kept sus4  (pc 7)]     ${strumsWithSusFourth}\n` +
                '------------------------------------------------\n',
        );
        expect(strumEvents.length).toBe(8);
        expect(strumsWithMajor3).toBe(0); // no major-3rd leak
        expect(strumsWithSusFourth).toBe(8); // sus4 preserved on every strum
    });

    // why: P0-2 catch — voice leading across chord changes. The previous
    // implementation independently snapped each chord's cluster root to the
    // MIDI-60 anchor, so a I-IV-V-I loop in C walked 60→65→55→60 (a 5-semitone
    // leap every change). The fix uses `compingState.lastVoicingMidis` to pick
    // the octave shift that minimizes centroid distance vs the previous bar.
    // This test pins the centroid-walk distance to a small range.
    it('keeps cluster centroid close across a I-IV-V-I progression (voice leading)', () => {
        const c = { rootMidi: 48, quality: 'maj', intervals: [0, 4, 7], freqs: [200, 250, 300] };
        const f = { rootMidi: 53, quality: 'maj', intervals: [0, 4, 7], freqs: [200, 250, 300] };
        const g = { rootMidi: 55, quality: 'maj', intervals: [0, 4, 7], freqs: [200, 250, 300] };
        const progression = [c, f, g, c];

        // Step through 4 bars, one chord per bar, simulating chord change.
        const events: { step: number; measureStep: number; notes: any[]; bar: number }[] = [];
        const spm = 16;
        for (let bar = 0; bar < progression.length; bar++) {
            const chord = progression[bar];
            mockState.arranger.progression = [chord];
            for (let measureStep = 0; measureStep < spm; measureStep++) {
                const step = bar * spm + measureStep;
                mockState.playback.step = step;
                const notes = getAccompanimentNotes(
                    getState(),
                    chord,
                    step,
                    step,
                    measureStep,
                    makeStepInfo(measureStep),
                    {},
                );
                events.push({ step, measureStep, notes, bar });
            }
        }

        const strumEvents = events.filter((e) => e.measureStep === 4 || e.measureStep === 12);
        const centroids: number[] = [];
        let allInSlot = true;
        for (const e of strumEvents) {
            const strumNotes = e.notes.filter((n) => n.durationSteps === 2);
            if (strumNotes.length === 0) {
                continue;
            }
            const midis = strumNotes.map((n) => n.midi);
            centroids.push(midis.reduce((a, b) => a + b, 0) / midis.length);
            if (Math.min(...midis) < 52 || Math.max(...midis) > 84) {
                allInSlot = false;
            }
        }

        // Step-to-step centroid jumps across chord changes. With voice leading,
        // the cluster picks the octave whose centroid is closest to the previous
        // bar's centroid — so consecutive centroids should be tightly clustered
        // (< 3.5 semitones on average; was ~5+ pre-fix when independent anchoring
        // made the I-IV-V loop walk 60→65→55→60).
        const jumps: number[] = [];
        for (let i = 1; i < centroids.length; i++) {
            jumps.push(Math.abs(centroids[i] - centroids[i - 1]));
        }
        const meanJump = jumps.reduce((a, b) => a + b, 0) / jumps.length;
        const maxJump = Math.max(...jumps);

        console.log(
            '\n--- COUNTRY STRUM VOICE LEADING (I-IV-V-I) ---\n' +
                `[Strum hits]            ${centroids.length}\n` +
                `[Centroid range]        ${Math.min(...centroids).toFixed(1)}-${Math.max(...centroids).toFixed(1)}\n` +
                `[Mean centroid jump]    ${meanJump.toFixed(2)}\n` +
                `[Max centroid jump]     ${maxJump.toFixed(2)}\n` +
                `[All in 52-84]          ${allInSlot}\n` +
                '------------------------------------------------\n',
        );
        expect(allInSlot).toBe(true);
        expect(meanJump).toBeLessThan(3.5);
        expect(maxJump).toBeLessThanOrEqual(5);
    });

    // why: regression guard — the previous lane took `chord.freqs.slice(0,3)`
    // literally. For an extended chord (Cmaj9) the raw slice would surface
    // [c, e, g] in some orderings but a richer chord (e.g. with intervals
    // [0, 4, 7, 11, 14]) could leak the 7th or 9th. The dedicated voicing must
    // ignore positions 3+ of `freqs` entirely and rebuild from `chord.intervals`.
    it('builds canonical strum even for extended chords (Cmaj9 still gives R/3/5)', () => {
        const cmaj9 = {
            rootMidi: 48,
            quality: 'maj7',
            // intervals stretches past the triad — engine must NOT echo them all.
            intervals: [0, 4, 7, 11, 14],
            // freqs list contains the maj7 and the 9 as well — the old code's
            // `slice(0,3)` would have taken [c, e, g] here, but with a different
            // ordering it could surface [c, e, b]. Our fix builds from intervals.
            freqs: [130.81, 164.81, 196.0, 246.94, 293.66],
            sectionId: 'A',
        };
        const events = simulateBars(cmaj9, 4);
        const strumEvents = events.filter((e) => e.measureStep === 4 || e.measureStep === 12);

        let leaks7 = 0;
        let leaks9 = 0;
        for (const e of strumEvents) {
            const strumNotes = e.notes.filter((n) => n.durationSteps === 2);
            const pcs = strumNotes.map((n) => ((n.midi % 12) + 12) % 12);
            if (pcs.includes(11)) {
                leaks7++; // maj7 (B)
            }
            if (pcs.includes(2)) {
                leaks9++; // 9 (D)
            }
        }

        console.log(
            '\n--- COUNTRY STRUM VOICING (Cmaj9 — must stay triadic) ---\n' +
                `[Strum hits]            ${strumEvents.length}\n` +
                `[Leaked maj7 (pc 11)]   ${leaks7}\n` +
                `[Leaked 9 (pc 2)]       ${leaks9}\n` +
                '-----------------------------------------------------------\n',
        );
        expect(strumEvents.length).toBe(8);
        expect(leaks7).toBe(0);
        expect(leaks9).toBe(0);
    });
});
