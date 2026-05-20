import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getSoloistNote } from '../../public/engine/soloist.js';
import { getState } from '../../public/state.js';
import { makeSoloistMock } from '../utils/mock-soloist.js';
import { makeMulberry32 } from '../utils/seeded-random.js';

// Mock state.js / config.js the same way soloist-jazz-critique does.
vi.mock('../../public/state.js', () => ({
    getState: vi.fn(),
    dispatch: vi.fn(),
}));
vi.mock('../../public/config.js', () => ({
    TIME_SIGNATURES: {
        '4/4': { beats: 4, stepsPerBeat: 4 },
    },
    KEY_ORDER: ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'],
}));

/**
 * Epic 10 S2 (a) — Head-bypass / themed-improv jitter PRNG determinism.
 *
 * The fix under test: `soloist.ts` head-bypass jitter draws (the `< jitterProb`
 * gate and the `stepOffset` pick) were migrated from un-seeded `Math.random()`
 * to a `scrambleHash`-seeded source keyed by (barIndex, sectionId, headNote.step).
 *
 * Isolation strategy — why this test catches a revert:
 *   The jitter only mutates the *pitch* of a head-bypass attack at a seed step.
 *   For a head-bypass attack `selectedMidi = targetMidi` directly (no picker
 *   roulette), so a device-free seed-step note's emitted MIDI IS the jittered
 *   `targetMidi`. We run the engine TWICE with two DIFFERENT seeded
 *   `Math.random` streams. The seeded jitter does not touch `Math.random` at
 *   all, so a device-free seed-step attack must emit the SAME MIDI in both
 *   runs. If the jitter still drew from `Math.random()` (pre-fix), the two
 *   streams would feed it different values and the device-free seed-step
 *   MIDIs would diverge.
 *
 * `debugSoloist: true` surfaces `note.source` so we can identify
 * picker-emitted (device-free) attacks precisely.
 */
function buildSoloistState() {
    return makeSoloistMock({
        enabled: true,
        style: 'jazz',
        mode: 'monophonic',
        octave: 64,
        sessionSteps: 0,
        currentPhraseSteps: 0,
        notesInPhrase: 0,
        srdcState: 'Statement',
        qaState: 'Question',
        isResting: true,
        motifBuffer: [],
        thematicSeed: [],
        thematicSeedRoot: 0,
        isReplayingMotif: false,
        isReplayingSeed: false,
        busySteps: 0,
        pitchHistory: [],
        lastInterval: 0,
        stagnationCount: 0,
        deviceBuffer: [],
        lastFreq: 0,
        currentCell: null,
        phraseContext: {
            role: 'call',
            skeleton: [],
            lastInterval: null,
            profile: 'srv',
        },
    });
}

// All-scale C-major seed; no anchors, so every seed note is jitter-eligible.
const SEED_NOTES = [
    { step: 0, midi: 60, durationSteps: 2, velocity: 0.8, isAnchor: false },
    { step: 4, midi: 64, durationSteps: 2, velocity: 0.8, isAnchor: false },
    { step: 8, midi: 67, durationSteps: 2, velocity: 0.8, isAnchor: false },
    { step: 12, midi: 69, durationSteps: 2, velocity: 0.8, isAnchor: false },
];
const SEED_STEPS = new Set([0, 4, 8, 12]);

const Dm7 = { rootMidi: 62, quality: 'm7', intervals: [0, 3, 7, 10], beats: 4 };
const G7 = { rootMidi: 67, quality: '7', intervals: [0, 4, 7, 10], beats: 4 };
const Cmaj7 = { rootMidi: 60, quality: 'maj7', intervals: [0, 4, 7, 11], beats: 4 };
const PROGRESSION = [Dm7, G7, Cmaj7, Cmaj7];

/**
 * Run the engine for `numBars` bars with `Math.random` driven by a mulberry32
 * stream seeded at `rngSeed`. Returns one entry per emitted note at a seed
 * step, tagged with bar/step/midi/source.
 */
function runSeedStepPass(
    numBars: number,
    rngSeed: number,
): Array<{ key: string; midi: number; source: string; isHeadBypass: boolean }> {
    const soloistState = buildSoloistState();
    soloistState.session.seed = { loopLengthSteps: 16, notes: SEED_NOTES.map((n) => ({ ...n })) };

    getState.mockReturnValue({
        playback: {
            bandIntensity: 0.7,
            bpm: 140,
            complexity: 0.7,
            intent: {},
            lyricalBias: 0.1,
            currentLoopCount: 2, // isThemedImprov, jitterProb 0.32, jitterRange 3
            debugSoloist: true, // surfaces note.source
        },
        groove: { genreFeel: 'Jazz', pocket: 0 },
        soloist: soloistState,
        harmony: { enabled: false },
        arranger: { timeSignature: '4/4' },
    });

    const prng = makeMulberry32(rngSeed);
    const spy = vi.spyOn(Math, 'random').mockImplementation(prng);
    const out: Array<{ key: string; midi: number; source: string; isHeadBypass: boolean }> = [];
    try {
        let lastFreq = 0;
        for (let bar = 0; bar < numBars; bar++) {
            const chord = PROGRESSION[bar % 4];
            for (let step = 0; step < 16; step++) {
                const note = getSoloistNote(
                    getState(),
                    chord,
                    chord,
                    bar * 16 + step,
                    lastFreq,
                    64,
                    'jazz',
                    step,
                );
                if (note) {
                    // engine tags res[res.length-1]; match that for multi-note emissions
                    const primary = Array.isArray(note) ? note[note.length - 1] : note;
                    if (typeof primary.midi === 'number') {
                        if (SEED_STEPS.has(step)) {
                            out.push({
                                key: `${bar}:${step}`,
                                midi: primary.midi,
                                source: primary.source || 'unknown',
                                isHeadBypass: primary.isHeadBypass === true,
                            });
                        }
                        lastFreq = primary.frequency || 0;
                    }
                }
                soloistState.session.sessionSteps++;
            }
        }
    } finally {
        spy.mockRestore();
    }
    return out;
}

describe('Soloist head-bypass jitter — PRNG determinism (Epic 10 S2.a)', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    it('device-free seed-step attacks are byte-identical across two different RNG streams', () => {
        const numBars = 64;
        // Two DELIBERATELY different RNG seeds. Anything the engine draws from
        // Math.random differs between the two passes; only the seeded jitter
        // (and other seeded paths) stay stable.
        const runA = runSeedStepPass(numBars, 0x1111_1111);
        const runB = runSeedStepPass(numBars, 0x9e37_79b9);

        const byKeyA = new Map(runA.map((n) => [n.key, n]));
        const byKeyB = new Map(runB.map((n) => [n.key, n]));

        // A seed-step attack is a clean jitter probe only when BOTH runs
        // emitted a picker-sourced, head-bypass note at that (bar,step):
        //   - device-emitted notes have had their MIDI rewritten by the buffer,
        //   - non-head-bypass notes mean the seed tone was gated by survivalProb
        //     (an RNG-driven decision) and the engine fell through to the
        //     generative picker — legitimately stream-dependent, not a jitter
        //     probe. Only `selectedMidi = jittered targetMidi` head-bypass
        //     attacks isolate the jitter.
        let comparable = 0;
        let mismatches = 0;
        const mismatchSamples: string[] = [];
        for (const [key, a] of byKeyA) {
            const b = byKeyB.get(key);
            if (!b) {
                continue;
            }
            if (a.source !== 'picker' || b.source !== 'picker') {
                continue;
            }
            if (!a.isHeadBypass || !b.isHeadBypass) {
                continue;
            }
            comparable++;
            if (a.midi !== b.midi) {
                mismatches++;
                if (mismatchSamples.length < 8) {
                    mismatchSamples.push(`${key}: A=${a.midi} B=${b.midi}`);
                }
            }
        }

        console.log(
            '\n--- HEAD-BYPASS JITTER DETERMINISM (S2.a) ---\n' +
                `[Seed-step attacks run A]   ${runA.length}\n` +
                `[Seed-step attacks run B]   ${runB.length}\n` +
                `[Comparable (picker/both)]  ${comparable}\n` +
                `[MIDI mismatches]           ${mismatches}\n` +
                (mismatchSamples.length > 0
                    ? `[Samples]                   ${mismatchSamples.join(', ')}\n`
                    : '') +
                '---------------------------------------------\n',
        );

        // Need a non-trivial sample of picker-sourced seed-step attacks for the
        // assertion to mean anything. 64 bars × 4 seed steps = 256 attacks;
        // device firings on the loop-2 (exploratory) head-bypass notes claim a
        // share of them. Floor lowered 100 → 80 (measured 92, deterministic
        // fixed seeds): later-Epic-11 device-distribution changes raised the
        // loop-2 device rate, which is by-design progressive ornamentation —
        // 80+ clean probes is still a decisive sample for the 0-mismatch check.
        expect(comparable).toBeGreaterThan(80);
        // The jitter is seeded by (barIndex, sectionId, headNote.step) — no
        // dependence on the Math.random stream. Two different streams MUST
        // produce identical device-free seed-step MIDIs. Pre-fix (un-seeded
        // jitter) every jitter draw consumed the divergent stream, so a
        // meaningful fraction of these attacks would mismatch. Zero mismatches
        // is the only acceptable result; there is no headroom argument because
        // determinism is exact, not statistical.
        expect(mismatches).toBe(0);
    });
});
