// @ts-nocheck
// Regression guard for the phrase-first soloist duration-overlap bug (found by
// ear on Pop (Standard) / Jazz / 160bpm, then reproduced): as development opened
// the line up over loops, held seed notes overran the next note because their
// `durationSteps` were emitted raw instead of clamped to the next onset. This
// drives the REAL seeder over that exact setup and asserts the monophonic lead
// never overlaps itself.
import { describe, expect, it } from 'vitest';
import { CHORD_PRESETS } from '../../public/data/chord-presets.js';
import { validateProgression } from '../../public/engine/chords-engine.js';
import { getSoloistNotePhraseFirst } from '../../public/engine/soloist-phrase-first.js';
import { generateSessionSeed } from '../../public/engine/soloist-seeder.js';
import { dispatch, getState } from '../../public/state.js';
import { ACTIONS } from '../../public/types.js';

function buildPopJazzState() {
    dispatch(ACTIONS.RESET_STATE);
    dispatch(ACTIONS.SET_TIME_SIGNATURE, '4/4');
    dispatch(ACTIONS.SET_KEY, 'C');
    dispatch(ACTIONS.UPDATE_GB, { enabled: true, genreFeel: 'Jazz' });
    dispatch(ACTIONS.UPDATE_SB, { enabled: true, style: 'smart' });
    dispatch(ACTIONS.SET_BAND_INTENSITY, 0.62);
    dispatch(ACTIONS.SET_BPM, 160);
    const state = getState();
    const preset = CHORD_PRESETS.find((p) => p.name === 'Pop (Standard)');
    state.arranger.key = 'C';
    state.arranger.isMinor = false;
    state.arranger.sections = preset.sections.map((s, i) => ({ ...s, id: `pop-${i}` }));
    validateProgression(state);
    return state;
}

describe('phrase-first soloist · monophonic duration (no overlap)', () => {
    it('never overruns the next note on Pop (Standard) / Jazz / 160bpm across development', () => {
        const state = buildPopJazzState();
        const seed = generateSessionSeed(state, state.arranger, 'smart', 0.62);
        state.soloist.session.seed = seed;
        state.soloist.session.phrasing = { isResting: false };
        state.soloist.phraseFirstSoloist = true;

        const total = state.arranger.totalSteps;
        const stepMap = state.arranger.stepMap;
        const chordAt = (s) => {
            const w = ((s % total) + total) % total;
            return stepMap.find((e) => w >= e.start && w < e.end)?.chord || null;
        };

        const overlaps = [];
        let emittedCount = 0;
        for (let loop = 0; loop <= 5; loop++) {
            state.playback.currentLoopCount = loop;
            const emitted = [];
            for (let s = 0; s < total; s++) {
                const abs = loop * total + s;
                const res = getSoloistNotePhraseFirst(
                    state,
                    chordAt(abs),
                    chordAt(abs + 1),
                    abs,
                    null,
                    state.soloist.octave,
                    'smart',
                    s % 16,
                    {},
                    { isDownbeat: s % 16 === 0, isMeasureStart: s % 16 === 0 },
                );
                if (res) {
                    emitted.push({ step: abs, dur: res.durationSteps });
                }
            }
            emittedCount += emitted.length;
            for (let i = 0; i < emitted.length - 1; i++) {
                if (emitted[i].step + emitted[i].dur > emitted[i + 1].step) {
                    overlaps.push(`loop${loop} step${emitted[i].step}(dur${emitted[i].dur})`);
                }
            }
        }

        // Sanity: the line is actually playing (the bug only shows when it's busy).
        expect(emittedCount).toBeGreaterThan(40);
        expect(overlaps, `overlapping notes: ${overlaps.join(', ')}`).toHaveLength(0);
    });
});
