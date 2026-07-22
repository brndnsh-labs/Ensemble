// #1159 — the Q&A digest must not publish a window whose hang the live engine
// overrides at the apex.
//
// `getSoloistNotePhraseFirst` tests `isApexStep` BEFORE the `qaRole ===
// 'question'` branch, so when a question note is its own development cycle's
// apex the lead emits the MONEY NOTE — a resolved tonic/5th — not the seed's
// soft-color hang. `computeQaWindows` originally excluded only the *dovetail*
// (an apex strictly ahead, within 2 bars) and let the apex-coincident case
// through, so the comper was handed a tension pc the lead never played and
// interjected it a beat later, directly over the climax — the exact thing the
// dovetail exclusion exists to prevent ("the comper must not step on the peak").
//
// Measured before the fix: 29 such windows across a 14,476-window sweep (every
// chord preset × 7 genres × 3 seeds). Rare, but always at the single loudest,
// most exposed moment in the form — so worth its own guard rather than relying
// on the comp critique's seeds happening to land on one.
import { describe, expect, it } from 'vitest';
import { getQaHangAt } from '../../../public/engine/soloist-phrase-first.js';

const SPB = 4; // steps per beat
const SPM = 16; // steps per measure (4/4)
const TOTAL = 64; // arrangement steps per lap

/**
 * One question→answer pair in a 4-bar block. `questionMidi` and `otherHighMidi`
 * decide where the cycle apex lands: the apex is simply the highest note, so
 * raising the question above everything else makes it apex-coincident
 * (`stepsToApex === 0`), which is the case under test.
 */
function makeSeed(questionMidi: number, otherHighMidi: number) {
    const n = (step: number, midi: number, extra: Record<string, unknown> = {}) => ({
        step,
        midi,
        isAnchor: false,
        durationSteps: 8,
        velocity: 0.7,
        ...extra,
    });
    return {
        seedId: questionMidi * 1000 + otherHighMidi,
        loopLengthSteps: TOTAL,
        notes: [
            n(0, 60, { isAnchor: true, durationSteps: 4 }),
            n(4, otherHighMidi),
            n(20, questionMidi, { qaRole: 'question' }),
            n(40, 64, { isAnchor: true }),
            n(44, 60, { qaRole: 'answer' }),
        ],
    };
}

describe('#1159 getQaHangAt — apex-coincident question exclusion', () => {
    it('publishes no window when the question note IS the cycle apex', () => {
        // Question at 84 is the highest note in the loop → it is the apex, so
        // the live engine emits the money note there, not this pc (74 % 12).
        const seed: any = makeSeed(84, 70);
        expect(getQaHangAt(seed, 20, SPB, SPM, TOTAL)).toBeNull();
        // …and nothing later in the block resurrects it: the whole window is
        // gone, not merely shifted (the echo and resolution steps too).
        expect(getQaHangAt(seed, 24, SPB, SPM, TOTAL)).toBeNull();
        expect(getQaHangAt(seed, 44, SPB, SPM, TOTAL)).toBeNull();
    });

    it('still publishes the window when the apex is far enough behind the question', () => {
        // The complement — proves the fix excludes the apex case specifically
        // rather than swallowing ordinary questions. Apex at step 4, question at
        // 20: distance wraps to 48 steps, outside the 2-bar (32-step) guard.
        const seed: any = makeSeed(62, 84);
        const w = getQaHangAt(seed, 20, SPB, SPM, TOTAL);
        expect(w).not.toBeNull();
        expect(w?.pc).toBe(2); // D
        expect(w?.hangStartStep).toBe(20);
    });

    it('excludes the dovetail case too (apex strictly ahead, within 2 bars)', () => {
        // Unchanged behavior, pinned here so the widened comparison can't
        // silently drop the half it already handled. Apex moved to step 36 =
        // 16 steps (1 bar) ahead of the question at 20.
        const seed: any = makeSeed(62, 60);
        seed.notes.push({
            step: 36,
            midi: 88,
            isAnchor: false,
            durationSteps: 4,
            velocity: 0.7,
        });
        expect(getQaHangAt(seed, 20, SPB, SPM, TOTAL)).toBeNull();
    });
});
