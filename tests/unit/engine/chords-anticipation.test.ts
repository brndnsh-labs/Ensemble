// @ts-nocheck
/* eslint-disable */
// #719 — within-section chord-change anticipation. In offbeat-comping genres,
// the comp's final-beat hit before a chord change should pre-voice the INCOMING
// chord ("horns punch the change a beat early") instead of stabbing the
// outgoing one — which read as a stray wrong-note hit right before the change
// (the 12-bar blues "quick C7 before the F7"). No anticipation when the next
// chord is the same (no spurious early change).
import { describe, expect, it, vi } from 'vitest';
import { TIME_SIGNATURES } from '../../../public/config.js';
import { CHORD_PRESETS } from '../../../public/data/chord-presets.js';
import { compingState, getAccompanimentNotes } from '../../../public/engine/accompaniment.js';
import { validateProgression } from '../../../public/engine/chords-engine.js';
import { getState } from '../../../public/state.js';
import { getStepInfo } from '../../../public/utils.js';

vi.mock('../../../public/ui.js', () => ({ ui: { updateProgressionDisplay: vi.fn() } }));
vi.mock('../../../public/worker-client.js', () => ({ syncWorker: vi.fn() }));

const pcSet = (freqs) =>
    new Set((freqs || []).map((f) => ((Math.round(69 + 12 * Math.log2(f / 440)) % 12) + 12) % 12));

function setupBlues() {
    const st = getState();
    const { arranger, playback, chords, bass, soloist, harmony, groove } = st;
    const preset = CHORD_PRESETS.find((p) => p.name === '12-Bar Blues');
    arranger.key = 'C';
    arranger.isMinor = false;
    arranger.timeSignature = '4/4';
    arranger.sections = preset.sections;
    groove.genreFeel = 'Blues';
    chords.enabled = true;
    chords.style = 'smart';
    chords.density = 'standard';
    bass.enabled = false;
    soloist.enabled = false;
    harmony.enabled = false;
    playback.bpm = 117;
    playback.bandIntensity = 0.8;
    playback.conductorVelocity = 0.7 + 0.8 * 0.45;
    validateProgression(st);
    compingState.lockedUntil = 0;
    compingState.lastChordIndex = -1;
    return st;
}

// Collect the comp's pitch classes at the final-beat hits of a given bar
// (steps barStart+12 .. barStart+15 in 4/4), walking the whole progression so
// comp state is realistic.
function finalBeatPCs(st, barIndex) {
    const { arranger } = st;
    const ts = TIME_SIGNATURES['4/4'];
    const barStart = barIndex * 16;
    const out = [];
    for (let step = 0; step < arranger.totalSteps; step++) {
        const entry = arranger.stepMap.find((e) => step >= e.start && step < e.end);
        if (!entry) {
            continue;
        }
        const chord = entry.chord;
        const stepInChord = step - entry.start;
        const stepInfo = getStepInfo(step, ts, arranger.measureMap, TIME_SIGNATURES);
        const measureStep = stepInfo.stepInMeasure ?? step % 16;
        const notes = getAccompanimentNotes(
            st,
            chord,
            step,
            stepInChord,
            measureStep,
            stepInfo,
            {},
        ).filter((n) => n.midi > 0);
        if (step >= barStart + 12 && step <= barStart + 15 && notes.length > 0) {
            out.push(...notes.map((n) => ((n.midi % 12) + 12) % 12));
        }
    }
    return out;
}

describe('#719 within-section chord-change anticipation', () => {
    it('voices the INCOMING chord on the final beat before a chord change (bar 4 → F7)', () => {
        const st = setupBlues();
        // Bar 4 (index 3) is C7; bar 5 is F7 — a within-section change.
        const c7 = st.arranger.progression[3];
        const f7 = st.arranger.progression[4];
        expect(c7.absName).toMatch(/^C/);
        expect(f7.absName).toMatch(/^F/);
        const incoming = pcSet(f7.freqs);
        const outgoing = pcSet(c7.freqs);

        const pcs = finalBeatPCs(st, 3);
        expect(pcs.length).toBeGreaterThan(0);
        // Every final-beat pitch class belongs to the INCOMING (F7) voicing...
        for (const pc of pcs) {
            expect(incoming.has(pc), `pc ${pc} not in incoming F7 ${[...incoming]}`).toBe(true);
        }
        // ...and at least one is an F7-only tone absent from C7 (proves it switched).
        const f7Only = [...incoming].filter((pc) => !outgoing.has(pc));
        expect(pcs.some((pc) => f7Only.includes(pc))).toBe(true);
        // ...and NO outgoing-only (C7) tone survives the final beat — the beat-4
        // stab that read as "a C7 before the F7" is suppressed (the pickup rests
        // the rest of the final beat). C7-only = {E, Bb}; the F7 pickup is {A,Eb,G}.
        const c7Only = [...outgoing].filter((pc) => !incoming.has(pc));
        expect(pcs.some((pc) => c7Only.includes(pc))).toBe(false);
    });

    it('does NOT anticipate when the next chord is the same (bar 1 → stays C7)', () => {
        const st = setupBlues();
        // Bars 1-4 are all C7, so bar 1's final beat has no change to anticipate.
        const c7 = st.arranger.progression[0];
        const outgoing = pcSet(c7.freqs);
        const pcs = finalBeatPCs(st, 0);
        expect(pcs.length).toBeGreaterThan(0);
        for (const pc of pcs) {
            expect(outgoing.has(pc), `pc ${pc} drifted off C7 ${[...outgoing]}`).toBe(true);
        }
    });
});
