// @ts-nocheck
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../public/config.js';
import {
    generateCompingPattern,
    getAccompanimentNotes,
} from '../../public/engine/accompaniment.js';
import { getStepInfo } from '../../public/utils.js';

const { makeSoloistMock } = await vi.hoisted(async () => await import('../utils/mock-soloist.js'));

vi.mock('../../public/state.js', () => ({
    getState: vi.fn(() => ({})),
}));

// #554 — Hip Hop piano (sampled-soul Rhodes, boom-bap) was ABSENT from
// `generateCompingPattern`'s genre branches, so it fell through to the generic
// ROCK/POP/DEFAULT downbeat triad pulse. The fix gives it a dedicated SPARSE,
// behind-the-beat stab idiom: 1-2 hits/bar, all OFF the downbeat (offbeats /
// pushed 16ths), seeded deterministically by (sectionId, phraseIndex).
//
// generateCompingPattern is the rhythm-cell source the live piano consumes:
// updateRhythmicIntent -> compingState.currentCell -> getAccompanimentNotes
// gates emission on `currentCell[measureStep % spb]`. We test the cell directly
// so the rhythmic shape (the thing #554 fixed) is measured without the voicing
// layer's noise. The picker reads only `playback.bandIntensity`/`complexity`
// off state, so a minimal stub is enough.
describe('Hip Hop Piano Critique', () => {
    const ts4 = { beats: 4, stepsPerBeat: 4 };
    // Quarter-note pulse steps in 4/4 (spb=4): the downbeat (0) and the beats.
    const PULSE_STEPS = new Set([0, 4, 8, 12]);

    const stateStub = (intensity = 0.5, complexity = 0.5) => ({
        playback: { bandIntensity: intensity, complexity },
    });

    const cellSteps = (cell) => {
        const steps = [];
        cell.forEach((v, idx) => {
            if (v === 1) {
                steps.push(idx);
            }
        });
        return steps;
    };

    // Sweep many phrases x sections at balanced energy — this is the dominant
    // playing condition and the one the "sparse behind-beat" claim is about.
    it('comps sparse, behind-the-beat stabs across the form (balanced energy)', () => {
        const sections = ['A', 'B', 'Verse', 'Chorus'];
        const phrasesPerSection = 16;

        let totalHits = 0;
        let totalBars = 0;
        let offbeatHits = 0;
        let downbeatBars = 0; // bars that hit step 0 (the One) at all

        for (const sid of sections) {
            for (let phrase = 0; phrase < phrasesPerSection; phrase++) {
                const cell = generateCompingPattern(
                    stateStub(0.5),
                    'Hip Hop',
                    'balanced',
                    ts4,
                    16,
                    phrase,
                    sid,
                );
                const steps = cellSteps(cell);
                totalBars++;
                totalHits += steps.length;
                if (cell[0] === 1) {
                    downbeatBars++;
                }
                for (const s of steps) {
                    // why: "behind the beat" = not on a quarter-note pulse position.
                    //      The "&"s and pushed 16ths all qualify; steps 0/4/8/12 do not.
                    if (!PULSE_STEPS.has(s)) {
                        offbeatHits++;
                    }
                }
            }
        }

        const hitsPerBar = totalHits / totalBars;
        const offbeatShare = offbeatHits / totalHits;
        const downbeatBarShare = downbeatBars / totalBars;

        console.log(
            '\n--- HIP HOP PIANO CRITIQUE REPORT ---\n' +
                `[Rhythmic Density]   ${hitsPerBar.toFixed(2)} hits/bar\n` +
                `[Behind-Beat Share]  ${(offbeatShare * 100).toFixed(1)}% of hits off the pulse\n` +
                `[Downbeat Bars]      ${(downbeatBarShare * 100).toFixed(1)}% of bars hit the One\n` +
                '-------------------------------------\n',
        );

        // SPARSENESS: idiomatic boom-bap comping is 1-2 stabs/bar. Lower bound
        // guards against an empty/dropout pattern; the upper bound (2.0) sits
        // well below the rock-pulse baseline (the DEFAULT branch hits the One +
        // every backbeat = 3+ hits/bar) so a regression back to the downbeat
        // pulse fails loudly. Absolute hits/bar, NOT a 4/4 ratio.
        expect(hitsPerBar).toBeGreaterThanOrEqual(1.0);
        expect(hitsPerBar).toBeLessThanOrEqual(2.0);

        // BEHIND-BEAT: the whole idiom is dodging the downbeat. Essentially every
        // hit should land off the quarter-note pulse. Guard at 0.95 to absorb any
        // future cell edge case without flaking; a downbeat-pulse regression lands
        // near 0% off-pulse and fails hard.
        expect(offbeatShare).toBeGreaterThan(0.95);

        // No bar should mark the One — the stab cells deliberately avoid step 0.
        // (Assert actual position, not just a count: a count alone can pass while
        // the comper still thumps the downbeat.)
        expect(downbeatBarShare).toBe(0);
    });

    // High energy must still read as sparse hip-hop, not collapse to a pulse.
    it('stays sparse and behind-the-beat at high intensity', () => {
        let totalHits = 0;
        let totalBars = 0;
        let offbeatHits = 0;

        for (let phrase = 0; phrase < 32; phrase++) {
            const cell = generateCompingPattern(
                stateStub(0.9, 0.8),
                'Hip Hop',
                'active',
                ts4,
                16,
                phrase,
                'A',
            );
            const steps = cellSteps(cell);
            totalBars++;
            totalHits += steps.length;
            expect(cell[0]).toBe(0); // never the One, even when loud
            for (const s of steps) {
                if (!PULSE_STEPS.has(s)) {
                    offbeatHits++;
                }
            }
        }

        const hitsPerBar = totalHits / totalBars;
        const offbeatShare = offbeatHits / totalHits;
        console.log(
            '\n--- HIP HOP PIANO (HIGH INTENSITY) ---\n' +
                `[Rhythmic Density]   ${hitsPerBar.toFixed(2)} hits/bar\n` +
                `[Behind-Beat Share]  ${(offbeatShare * 100).toFixed(1)}%\n` +
                '---------------------------------------\n',
        );
        // why: the active ornament can add one extra 16th, so allow up to 2.5
        //      hits/bar here — still well under the rock-pulse baseline and the
        //      ornament itself lands on a pushed offbeat.
        expect(hitsPerBar).toBeLessThanOrEqual(2.5);
        expect(offbeatShare).toBe(1.0);
    });

    // DETERMINISM: same (sectionId, phraseIndex) -> same cell, so looped playback
    // and loop-comparison critique tests are coherent. NO Math.random in the branch.
    it('is deterministic per (sectionId, phraseIndex)', () => {
        for (let phrase = 0; phrase < 8; phrase++) {
            const a = generateCompingPattern(
                stateStub(),
                'Hip Hop',
                'balanced',
                ts4,
                16,
                phrase,
                'A',
            );
            const b = generateCompingPattern(
                stateStub(),
                'Hip Hop',
                'balanced',
                ts4,
                16,
                phrase,
                'A',
            );
            expect(b).toEqual(a);
        }
    });

    // VARIETY: the bank rotates across phrases so the comp evolves over the form
    // rather than looping a single stab cell.
    it('visits multiple stab cells across a section (variety)', () => {
        const seen = new Set();
        for (let phrase = 0; phrase < 8; phrase++) {
            const cell = generateCompingPattern(
                stateStub(),
                'Hip Hop',
                'balanced',
                ts4,
                16,
                phrase,
                'A',
            );
            seen.add(cell.join(''));
        }
        console.log(
            `\n--- HIP HOP STAB-BANK VARIETY ---\n[Distinct cells / 8 phrases] ${seen.size}\n---------------------------------\n`,
        );
        // why: a 4-cell bank cycled by `phraseIndex*31 % 4` visits all 4 entries
        //      across any 4 consecutive phrases; 8 phrases must hit >=3.
        expect(seen.size).toBeGreaterThanOrEqual(3);
    });

    // DISCRIMINATOR: prove the new branch fires, not the DEFAULT pulse. The
    // DEFAULT/Rock branch always hits the One (step 0); Hip Hop never does, and
    // is far sparser at the same energy.
    it('does not fall through to the downbeat-pulse DEFAULT branch', () => {
        let pulseHitTheOne = 0;
        let hiphopHitTheOne = 0;
        let pulseHits = 0;
        let hiphopHits = 0;
        for (let phrase = 0; phrase < 16; phrase++) {
            // 'Pop' has no branch -> DEFAULT pulse (the pre-#554 Hip Hop behavior).
            const pulse = generateCompingPattern(
                stateStub(0.7),
                'Pop',
                'balanced',
                ts4,
                16,
                phrase,
                'A',
            );
            const hip = generateCompingPattern(
                stateStub(0.7),
                'Hip Hop',
                'balanced',
                ts4,
                16,
                phrase,
                'A',
            );
            if (pulse[0] === 1) {
                pulseHitTheOne++;
            }
            if (hip[0] === 1) {
                hiphopHitTheOne++;
            }
            pulseHits += pulse.reduce((s, v) => s + v, 0);
            hiphopHits += hip.reduce((s, v) => s + v, 0);
        }
        // The DEFAULT pulse marks the One every bar; Hip Hop never does.
        expect(pulseHitTheOne).toBeGreaterThan(0);
        expect(hiphopHitTheOne).toBe(0);
        // And Hip Hop is meaningfully sparser than the pulse it used to share.
        expect(hiphopHits).toBeLessThan(pulseHits);
    });
});

// CONSUMER-LEVEL GUARD (#554 review P0). generateCompingPattern only produces the
// rhythm CELL; the live piano is `getAccompanimentNotes`, which runs a post-cell
// overlay that backfills the One (line ~2677) and group-starts (~2685) for any
// genre without an early-return lane. Because the Hip Hop cell never hits step 0,
// the unguarded overlay re-added a downbeat stab in ~80% of bars — the exact
// generic pulse #554 set out to remove, invisible to the cell-only tests above.
// These tests drive the REAL consumer so that downbeat-suppression is guarded
// where the listener actually hears it.
describe('Hip Hop Piano Critique — live consumer (getAccompanimentNotes)', () => {
    const TS_CONFIG = TIME_SIGNATURES['4/4'];
    const spm = TS_CONFIG.beats * TS_CONFIG.stepsPerBeat; // 16 steps/bar

    const makeState = (genreFeel) => ({
        playback: { bandIntensity: 0.6, complexity: 0.5, step: 0, intent: {} },
        groove: { genreFeel, pocket: 0, instruments: [] },
        soloist: makeSoloistMock({ enabled: false, busySteps: 0, lastFreq: 0 }),
        bass: { enabled: true, lastFreq: 55 },
        harmony: { enabled: false },
        // style 'smart' keeps genre = groove.genreFeel ('Hip Hop' passes through
        // the updateRhythmicIntent override ladder untouched), matching production.
        chords: { enabled: true, style: 'smart', density: 'balanced' },
        arranger: { timeSignature: '4/4', totalSteps: 512, progression: [] },
    });

    const chord = {
        rootMidi: 52,
        quality: 'min7',
        is7th: true,
        intervals: [0, 3, 7, 10],
        freqs: [164.81, 196.0, 246.94, 293.66],
        sectionId: 'A',
    };

    // Drive `bars` measures step-by-step (so updateRhythmicIntent populates the
    // cell per bar) and return the share of bars whose DOWNBEAT (measureStep 0)
    // sounds a real piano note.
    const downbeatBarShare = (genreFeel, bars = 12) => {
        const state = makeState(genreFeel);
        state.arranger.progression = [chord];
        let downbeatBars = 0;
        for (let bar = 0; bar < bars; bar++) {
            let oneFired = false;
            for (let m = 0; m < spm; m++) {
                const step = bar * spm + m;
                state.playback.step = step;
                const stepInfo = getStepInfo(step, TS_CONFIG, [], TIME_SIGNATURES);
                const notes = getAccompanimentNotes(state, chord, step, step, m, stepInfo) || [];
                const realHit = notes.some((n) => typeof n.midi === 'number' && n.midi > 0);
                if (m === 0 && realHit) {
                    oneFired = true;
                }
            }
            if (oneFired) {
                downbeatBars++;
            }
        }
        return downbeatBars / bars;
    };

    beforeEach(() => {
        vi.clearAllMocks();
    });

    // THE P0 FIX: through the real consumer, Hip Hop must NOT thump the One. The
    // overlay's downbeat/group-start backfill is now genre-gated off for Hip Hop,
    // so the sparse off-pulse cell survives to emission.
    it('does not sound the One through the live consumer', () => {
        const share = downbeatBarShare('Hip Hop');
        console.log(
            `\n--- HIP HOP LIVE-CONSUMER DOWNBEAT ---\n[Bars sounding the One] ${(share * 100).toFixed(0)}%\n--------------------------------------\n`,
        );
        expect(share).toBe(0);
    });

    // NON-VACUITY DISCRIMINATOR: the SAME harness on 'Pop' (no genre lane -> the
    // overlay DOES backfill the One) sounds the downbeat in most bars. This proves
    // the assertion above is real: it would fail loudly if the overlay guard were
    // removed (that's exactly the pre-fix Hip Hop behavior).
    it('discriminator: the unguarded DEFAULT path (Pop) DOES sound the One', () => {
        const share = downbeatBarShare('Pop');
        console.log(`\n[Pop live-consumer downbeat] ${(share * 100).toFixed(0)}% of bars\n`);
        expect(share).toBeGreaterThan(0.5);
    });
});
