// @ts-nocheck
// Critique test for #1020 — "give the soloist ears" (slice B): the lead phrases
// around FORM SEAMS. Slice A made density/weight ride the sustained band energy;
// this reads the section STRUCTURE the band already publishes so the lead does
// what a player does at a seam — breathe on the way into a change, come in strong
// on the far side of a lift.
//
// Production-faithful: a real seeder, a real multi-section progression (Funk Grand
// Groove: Verse → Chorus, a genuine +0.4 energy rise in form-analysis' map), and
// the soloist driven across the whole form with `sectionStart`/`sectionEnd` fed in
// per step exactly as tick-logic supplies them (from `arranger.sectionMap`).
//
// Method: A/B the seam feature on ONE fixed seed. The soloist tolerates an empty
// coordination arg (`{}` — the `multiSection=false` inert path, what pre-seed /
// partial callers pass), so the SAME form is performed twice — once with real
// section boundaries (seam ON, what tick-logic supplies) and once with `{}` (seam
// OFF, pre-#1020 behavior). Comparing the SAME bar across the two runs isolates the
// seam terms' contribution from the seed's own per-bar note structure (a raw
// per-bar count conflates the two — the Verse's turnaround bar simply carries more
// seed notes). Two effects:
//   • REST INTO the change — the Verse's LAST bar (the turnaround into the seam)
//     emits FEWER notes with the seam on than off (the density dip thins it).
//   • ENTER BIG after the rise — the Chorus's FIRST bar is played HARDER (mean
//     velocity) with the seam on than off. On a rise the density gate saturates
//     (see slice A), so weight carries the "dig in"; velocity is the honest metric.
import { describe, expect, it } from 'vitest';
import { CHORD_PRESETS } from '../../public/data/chord-presets.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { getSoloistNotePhraseFirst } from '../../public/engine/soloist-phrase-first.js';
import { generateSessionSeed } from '../../public/engine/soloist-seeder.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

// A moderate, CONSTANT band energy (the conductor doesn't run in the harness), so
// the seam terms are the only thing that moves across the form and there's gate
// headroom for both the dip and the fill to show.
const BAND_INTENSITY = 0.55;

function buildState() {
    dispatch(ACTIONS.RESET_STATE);
    dispatch(ACTIONS.SET_TIME_SIGNATURE, '4/4');
    dispatch(ACTIONS.SET_KEY, 'C');
    dispatch(ACTIONS.UPDATE_GB, { enabled: true, genreFeel: 'Funk' });
    dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'smart' });
    dispatch(ACTIONS.SET_BAND_INTENSITY, BAND_INTENSITY);
    dispatch(ACTIONS.SET_BPM, 108);
    const state = getState();
    // Verse (energy 0.5) → Chorus (energy 0.9): a real +0.4 seam rise.
    const preset = CHORD_PRESETS.find((p) => p.name === 'Funk (Grand Groove)');
    state.arranger.sections = preset.sections.map((s, i) => ({ ...s, id: `s-${i}` }));
    state.arranger.isMinor = true;
    validateProgression(state);
    return state;
}

// Three seeds — the dip/entry effects are deterministic per seed (comfortable
// margins), and running the load-bearing monophonic-overlap invariant across
// several seeds hardens it beyond a single phrase's note placement.
describe.each(['SEAM_SEED', 'SEAM_SEED_2', 'SEAM_SEED_3'])(
    'Soloist phrases around form seams (#1020) — seed %s',
    (seedStr) => {
        it('rests into the change and enters big after a rising boundary', () => {
            const state = buildState();
            const total = state.arranger.totalSteps;
            const sectionMap = state.arranger.sectionMap;
            const stepMap = state.arranger.stepMap;
            const ts = 16; // 4/4, 4 steps/beat
            expect(sectionMap.length).toBe(2); // Verse, Chorus — the seam we're testing

            const secAt = (absInLoop) =>
                sectionMap.find((e) => absInLoop >= e.start && absInLoop < e.end) || null;
            const chordAt = (s) => {
                const w = ((s % total) + total) % total;
                return stepMap.find((e) => w >= e.start && w < e.end)?.chord || null;
            };

            const seed = generateSessionSeed(
                state,
                state.arranger,
                'smart',
                BAND_INTENSITY,
                seedStr,
            );

            // Perform the whole form across loops 0..3 (mirroring scheduler-core's
            // per-loop currentLoopCount). `seamOn` toggles whether real section
            // boundaries are passed (ON) or `{}` (OFF = the pre-#1020 inert path).
            // We AGGREGATE across loops because a single bar's note count is a small,
            // noisy integer and the density gate saturates at late loops (as in slice A);
            // loops 0-1 carry the headroom where the dip has room to thin. Buckets:
            //   • seamBarNotes — notes in any LAST bar before a boundary (the dip target)
            //   • entryVel{Sum,Count} — velocity in the first Chorus bar (the rising entry)
            const LOOPS = [0, 1, 2, 3];
            const perform = (seamOn) => {
                state.soloist.session.seed = seed;
                state.soloist.session.phrasing = { isResting: false };
                let seamBarNotes = 0;
                let entryVelSum = 0;
                let entryVelCount = 0;
                const emitted = []; // { abs, dur } — for the monophonic-overlap check
                for (const LOOP of LOOPS) {
                    for (let s = 0; s < total; s++) {
                        const abs = LOOP * total + s;
                        state.playback.currentLoopCount = LOOP;
                        state.playback.bandIntensity = BAND_INTENSITY;
                        const sec = secAt(s);
                        // LOOP-RELATIVE boundaries — exactly what getChordAtStep/tick-logic
                        // supplies (sectionMap start/end in 0..totalSteps), NOT offset by
                        // the loop. The engine wraps the absolute `abs` step into this
                        // frame; a prior version fed absolute boundaries and so only
                        // exercised lap 0's coincident frame, hiding the #923 loop-frame
                        // bug this now guards.
                        const coord = seamOn
                            ? { sectionStart: sec.start, sectionEnd: sec.end }
                            : {};
                        const res = getSoloistNotePhraseFirst(
                            state,
                            chordAt(abs),
                            chordAt(abs + 1),
                            abs,
                            null,
                            state.soloist.octave,
                            'smart',
                            s % ts,
                            coord,
                            { isDownbeat: s % ts === 0, isMeasureStart: s % ts === 0 },
                        );
                        if (!res) {
                            continue;
                        }
                        const lead = Array.isArray(res) ? res[res.length - 1] : res;
                        emitted.push({ abs, dur: lead.durationSteps ?? 1 });
                        const isLastBarBeforeBoundary = Math.floor((sec.end - 1 - s) / ts) === 0;
                        const isChorusFirstBar = sec.label === 'Chorus' && s - sec.start < ts;
                        if (isLastBarBeforeBoundary) {
                            seamBarNotes += 1;
                        }
                        if (isChorusFirstBar) {
                            entryVelSum += lead.velocity;
                            entryVelCount += 1;
                        }
                    }
                }
                // Monophonic-overlap check: a note must release before the next one
                // speaks. This guards the slice-B risk that the duration-clamp lookahead
                // (which sees only the CURRENT section's boundary) under-predicts an
                // entry-lifted note in the next section's first bar and lets a seam-bar
                // note overrun it. Count any note whose span reaches the next emit.
                let overlaps = 0;
                for (let i = 0; i < emitted.length - 1; i++) {
                    if (emitted[i].abs + emitted[i].dur > emitted[i + 1].abs) {
                        overlaps += 1;
                    }
                }
                return {
                    seamBarNotes,
                    entryVel: entryVelCount ? entryVelSum / entryVelCount : 0,
                    overlaps,
                };
            };

            const on = perform(true);
            const off = perform(false);

            // Critique Report.
            // eslint-disable-next-line no-console
            console.log(
                `[#1020 seam] REST-INTO  last-bar notes (loops 0-3)  off=${off.seamBarNotes}  on=${on.seamBarNotes}`,
            );
            // eslint-disable-next-line no-console
            console.log(
                `[#1020 seam] ENTER-BIG  chorus entry vel  off=${off.entryVel.toFixed(3)}  on=${on.entryVel.toFixed(3)}`,
            );

            // REST INTO (intent): with the seam on, the density dip removes ornament
            // notes from the last bar before each boundary that sounded with it off — the
            // lead breathes into the change. Aggregated over loops 0-3, so this is a
            // stable count, not a single noisy bar.
            expect(on.seamBarNotes).toBeLessThan(off.seamBarNotes);

            // ENTER BIG (intent): with the seam on, the first Chorus bar is played harder
            // than with it off — the entry weight bump. Margin clears per-note jitter.
            expect(on.entryVel).toBeGreaterThan(off.entryVel + 0.02);

            // The seam terms must not silence a section — the theme's bones still sound.
            expect(on.seamBarNotes).toBeGreaterThan(0);

            // INVARIANT: the monophonic lead never overlaps itself, seam active, across
            // every section boundary — the step-dependent seam gate did NOT break the
            // duration-clamp lookahead (the slice-A consistency invariant holds).
            // eslint-disable-next-line no-console
            console.log(`[#1020 seam] OVERLAPS (seam on, loops 0-3) = ${on.overlaps}`);
            expect(on.overlaps).toBe(0);
        });
    },
);
