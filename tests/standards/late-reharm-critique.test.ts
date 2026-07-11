// @ts-nocheck
/**
 * Critique (#1011): late-pass reharmonization — ephemeral in-place turnaround
 * substitutions at high loopCount, Jazz/Blues only.
 *
 * The changes play verbatim until the listener has learned them (loops 0–1,
 * the soloist's strict-Head contract); from loop 2 the turnaround occasionally
 * substitutes — tritone sub on a functioning V7 (both genres) or dominantization
 * of a m7 resolving down a fifth (Jazz only) — published through the chord
 * preamble so every engine outlines the same substituted chord. Never written
 * back to the chart: the substitution exists only in the played tick.
 *
 * Guards:
 *   (A) HEAD IS SACRED — loops 0 and 1 publish the written changes verbatim.
 *   (B) VOCABULARY + PLACEMENT — every divergence sits in the final-2-bar
 *       turnaround window and is EXACTLY one of the two shapes; the in-window
 *       control chord (root motion ≠ down-a-fifth) never substitutes.
 *   (C) REACHABILITY + CADENCE — subs genuinely occur across loops 2..24
 *       (the path is reachable through the production preamble), but stay
 *       sparse: some passes always play verbatim (band-gets-ideas, not
 *       new-arrangement).
 *   (D) ONE IDEA AT A TIME — at most one substituted chord per pass.
 *   (E) CONSUMER COHERENCE — the bass, driven through the REAL pipeline
 *       (generateNotesForStep), lands on the substituted root, not the written
 *       one: one harmonic truth, no split-brain.
 *   (F) DETERMINISM — same loop ⇒ identical substitutions, run twice.
 *   (G) IMMUNITY + EPHEMERALITY — Rock never substitutes; an active practice
 *       section-loop (#1016) never substitutes; a pending song ending never
 *       substitutes; `arranger.stepMap` is never mutated.
 *   (H) BLUES VOCABULARY — Blues gets the tritone sub only (dominantization is
 *       Jazz's move).
 */
import { describe, expect, it } from 'vitest';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { runDrumTick } from '../../public/engine/drums-tick.js';
import { generateNotesForStep } from '../../public/engine/tick-logic.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

const STEPS_PER_BAR = 16;
// 12-bar jazz blues in C. Turnaround window = bars 11–12 (steps 160..191):
//   bar 11: C7 (control: next root A = down a m3rd — NOT functioning, never
//           subs even though it sits in the window) then A7 (→Dm7, down a P5:
//           tritone-eligible),
//   bar 12: Dm7 (→G7, down a P5: dominantize-eligible, Jazz only) then G7
//           (→C7 at the form top via wrap, down a P5: tritone-eligible).
const TWELVE_BAR = 'C7 | F7 | C7 | C7 | F7 | F7 | C7 | C7 | Dm7 | G7 | C7 A7 | Dm7 G7';
const TOTAL = 12 * STEPS_PER_BAR;
const WINDOW_START = TOTAL - 2 * STEPS_PER_BAR;

const pc = (midi: number) => ((midi % 12) + 12) % 12;

function buildState(genre: string) {
    dispatch(ACTIONS.RESET_STATE);
    dispatch(ACTIONS.SET_TIME_SIGNATURE, '4/4');
    dispatch(ACTIONS.SET_KEY, 'C');
    dispatch(ACTIONS.UPDATE_GB, { enabled: true, genreFeel: genre, lastDrumPreset: genre });
    const state = getState();
    state.arranger.key = 'C';
    state.arranger.isMinor = false;
    state.arranger.sections = [{ id: 's-0', label: 'Main', value: TWELVE_BAR }];
    validateProgression(state);
    return state;
}

function freshCursors() {
    return {
        mainCursor: { index: 0, sectionIndex: 0 },
        lookaheadCursor: { index: 0, sectionIndex: 0 },
    };
}

/**
 * The published chord per stepMap entry on loop `loop`, observed at each
 * entry's first step through the production preamble (runDrumTick). Steps are
 * absolute (loop * TOTAL + entry.start) — the same monotonic frame the live
 * worker and export drive.
 */
function publishedChordsAtLoop(state: any, loop: number): Map<number, any> {
    (state.playback as any).currentLoopCount = loop;
    const cursors = freshCursors();
    const out = new Map<number, any>();
    state.arranger.stepMap.forEach((entry: any, i: number) => {
        const tick = runDrumTick(state, loop * TOTAL + entry.start, cursors, null);
        if (tick.chordData?.chord) {
            out.set(i, tick.chordData.chord);
        }
    });
    return out;
}

/** stepMap indices whose published chord differs from the written chart. */
function divergences(state: any, published: Map<number, any>): number[] {
    const out: number[] = [];
    for (const [i, chord] of published) {
        if (chord !== state.arranger.stepMap[i].chord) {
            out.push(i);
        }
    }
    return out;
}

describe('Late-pass reharmonization — ephemeral turnaround subs (#1011)', () => {
    const report: string[] = [];

    it('(A) loops 0–1 publish the written changes verbatim', () => {
        const state = buildState('Jazz');
        for (const loop of [0, 1]) {
            const published = publishedChordsAtLoop(state, loop);
            expect(published.size, 'preamble publishes chords').toBeGreaterThan(0);
            expect(divergences(state, published), `loop ${loop} verbatim`).toEqual([]);
        }
    });

    it('(B)+(C)+(D) from loop 2: vocabulary, placement, reachability, sparse cadence, one idea per pass', () => {
        const state = buildState('Jazz');
        const stepMap = state.arranger.stepMap;
        let subbedLoops = 0;
        const seenKinds = new Set<string>();

        for (let loop = 2; loop <= 24; loop++) {
            const published = publishedChordsAtLoop(state, loop);
            const divs = divergences(state, published);

            // (D) one idea at a time.
            expect(divs.length, `loop ${loop} subs at most one chord`).toBeLessThanOrEqual(1);
            if (divs.length === 0) {
                continue;
            }
            subbedLoops++;

            const i = divs[0];
            const written = stepMap[i].chord;
            const sub = published.get(i);

            // (B) placement: inside the final-2-bar window only.
            expect(stepMap[i].start, `loop ${loop} sub in window`).toBeGreaterThanOrEqual(
                WINDOW_START,
            );
            // (B) the in-window control chord (bar-11 C7 → A7, down a m3rd) never subs.
            expect(
                written.quality === '7' && pc(written.rootMidi) === 0,
                `loop ${loop} control C7 untouched`,
            ).toBe(false);

            // (B) vocabulary: exactly tritone or dominantization.
            expect(sub.quality, `loop ${loop} sub is a dominant`).toBe('7');
            expect(sub.is7th).toBe(true);
            if (written.quality === '7') {
                // Tritone sub: root moves 6 semitones, still a dominant.
                expect(pc(sub.rootMidi), `loop ${loop} tritone root`).toBe(
                    (pc(written.rootMidi) + 6) % 12,
                );
                seenKinds.add('tritone');
            } else {
                // Dominantization: same root, m7 → 7 (the b3 raised in place).
                expect(written.quality, `loop ${loop} dominantized source is m7`).toBe('minor');
                expect(pc(sub.rootMidi), `loop ${loop} dominantize keeps root`).toBe(
                    pc(written.rootMidi),
                );
                seenKinds.add('dominantize');
            }
            report.push(
                `  loop ${String(loop).padStart(2)}  ${written.absName} → ${sub.absName}` +
                    `  (${written.quality === '7' ? 'tritone' : 'dominantize'})`,
            );
        }

        // (C) reachable AND sparse: with the 0.35→0.65 ramp, a healthy majority
        // of the 23 passes get an idea, but a meaningful share stays verbatim.
        expect(subbedLoops, 'subs actually occur (reachability)').toBeGreaterThanOrEqual(4);
        expect(subbedLoops, 'some passes always play verbatim').toBeLessThanOrEqual(21);
        // Both vocabulary shapes are alive in Jazz across the sweep.
        expect(seenKinds, 'both shapes reachable').toEqual(new Set(['tritone', 'dominantize']));
        report.push(`  cadence  ${subbedLoops}/23 passes carried a substitution`);
    });

    it('(E) the bass lands on the substituted root through the real pipeline', () => {
        const state = buildState('Jazz');
        dispatch(ACTIONS.UPDATE_BASS, { enabled: true, style: 'quarter' });

        // Find a loop whose sub is a TRITONE (root actually moves — the
        // audible split-brain case a written-chord bass would betray).
        let target: { loop: number; index: number; sub: any } | null = null;
        for (let loop = 2; loop <= 24 && !target; loop++) {
            const published = publishedChordsAtLoop(state, loop);
            for (const i of divergences(state, published)) {
                const written = state.arranger.stepMap[i].chord;
                if (written.quality === '7') {
                    target = { loop, index: i, sub: published.get(i) };
                }
            }
        }
        expect(target, 'a tritone-subbed pass exists in the sweep').not.toBeNull();

        const { loop, index, sub } = target as any;
        (state.playback as any).currentLoopCount = loop;
        const entry = state.arranger.stepMap[index];
        const r = generateNotesForStep(state, loop * TOTAL + entry.start, freshCursors(), {}, null);
        const bassNotes = r.notes.filter((n: any) => n.module === 'bass' && n.midi > 0);
        expect(bassNotes.length, 'bass emits on the sub downbeat').toBeGreaterThan(0);
        // One harmonic truth: the bass states the SUB's root on its downbeat.
        expect(pc(bassNotes[0].midi), 'bass root = substituted root').toBe(pc(sub.rootMidi));
        report.push(
            `  coherence  loop ${loop}: bass downbeat pc ${pc(bassNotes[0].midi)} = ${sub.absName} root`,
        );
    });

    it('(F) deterministic: the same loop substitutes identically, run twice', () => {
        const state = buildState('Jazz');
        for (const loop of [2, 5, 9]) {
            const a = publishedChordsAtLoop(state, loop);
            const b = publishedChordsAtLoop(state, loop);
            expect(divergences(state, a)).toEqual(divergences(state, b));
            for (const [i, chord] of a) {
                expect(b.get(i).rootMidi, `loop ${loop} idx ${i} same root`).toBe(chord.rootMidi);
                expect(b.get(i).quality, `loop ${loop} idx ${i} same quality`).toBe(chord.quality);
            }
        }
    });

    it('(G) immunity: non-pilot genre, practice loop, pending ending — and the chart is never mutated', () => {
        // Non-pilot genre: Rock never substitutes, any loop.
        const rock = buildState('Rock');
        for (const loop of [2, 5, 9]) {
            expect(divergences(rock, publishedChordsAtLoop(rock, loop)), 'Rock verbatim').toEqual(
                [],
            );
        }

        // Jazz state: find a loop that substitutes, then prove each gate kills it.
        const state = buildState('Jazz');
        const writtenRefs = state.arranger.stepMap.map((e: any) => e.chord);
        let subbedLoop = -1;
        for (let loop = 2; loop <= 24 && subbedLoop < 0; loop++) {
            if (divergences(state, publishedChordsAtLoop(state, loop)).length > 0) {
                subbedLoop = loop;
            }
        }
        expect(subbedLoop, 'a substituting loop exists').toBeGreaterThan(0);

        // Practice section-loop active (#1016): drilling the truth — no subs.
        (state.playback as any).loopStartStep = WINDOW_START;
        (state.playback as any).loopEndStep = TOTAL;
        expect(
            divergences(state, publishedChordsAtLoop(state, subbedLoop)),
            'practice loop verbatim',
        ).toEqual([]);
        (state.playback as any).loopStartStep = -1;
        (state.playback as any).loopEndStep = -1;

        // Song ending pending: the resolution lands on the REAL changes.
        (state.playback as any).songMode = true;
        (state.playback as any).isEndingPending = true;
        expect(
            divergences(state, publishedChordsAtLoop(state, subbedLoop)),
            'ending verbatim',
        ).toEqual([]);
        (state.playback as any).isEndingPending = false;

        // Ephemerality: after every sweep above, the written chart is untouched —
        // same chord OBJECTS, same roots (the sub is a new object, never a write).
        state.arranger.stepMap.forEach((e: any, i: number) => {
            expect(e.chord, `stepMap[${i}] object identity`).toBe(writtenRefs[i]);
        });
    });

    it('(H) Blues vocabulary is tritone-only (dominantization is a Jazz move)', () => {
        const state = buildState('Blues');
        let subbed = 0;
        for (let loop = 2; loop <= 24; loop++) {
            const published = publishedChordsAtLoop(state, loop);
            for (const i of divergences(state, published)) {
                const written = state.arranger.stepMap[i].chord;
                // Only written dominants may sub in Blues — the Dm7 never does.
                expect(written.quality, `loop ${loop} Blues subs a dominant only`).toBe('7');
                expect(pc(published.get(i).rootMidi)).toBe((pc(written.rootMidi) + 6) % 12);
                subbed++;
            }
        }
        expect(subbed, 'Blues tritone subs are reachable').toBeGreaterThanOrEqual(1);

        // Review P2 (#1011): Blues ramps at HALF Jazz's rate (0.2→0.4 vs
        // 0.35→0.65) — the blues turnaround is the song's signature, so subs
        // stay an occasional wink. Same seeded draws, lower threshold ⇒ Blues
        // must substitute on strictly fewer passes than Jazz over the sweep.
        const jazz = buildState('Jazz');
        let jazzSubbed = 0;
        for (let loop = 2; loop <= 24; loop++) {
            jazzSubbed += divergences(jazz, publishedChordsAtLoop(jazz, loop)).length;
        }
        expect(subbed, 'Blues recomposes less than Jazz').toBeLessThan(jazzSubbed);
        report.push(
            `  blues    ${subbed} tritone subs across loops 2..24 (Jazz: ${jazzSubbed}), zero dominantizations`,
        );
    });

    it('Critique Report', () => {
        console.log('\n=== Late-pass reharmonization (#1011) — turnaround subs ===');
        for (const line of report) {
            console.log(line);
        }
        console.log('==========================================================\n');
        expect(true).toBe(true);
    });
});
