// The PURE half of `mix:ab`: the null-test arithmetic, the bar bucketing, the
// threshold decision and the event diff. No git, no renders — this file must never
// move HEAD, and a test that shelled out to `git checkout` could strand the repo on
// another ref when it failed.
//
// Every expected value below is HAND-COMPUTED from the definition and written as a
// literal. Re-deriving one by calling the implementation
// (`expect(result.rms).toBeCloseTo(Math.sqrt(sum / n))`) passes for whatever the
// implementation happens to do, which is not a test. Signals are built at a 1000 Hz
// sample rate and 0.125 s steps so every boundary lands on a whole frame and the
// arithmetic can be checked by eye.

import { describe, expect, it } from 'vitest';
import {
    DEFAULT_THRESHOLD_DB,
    type DumpEvent,
    diffEvents,
    exceedsThreshold,
    formatAbReport,
    formatPosition,
    loudestBars,
    MOVE_WINDOW_STEPS,
    matchesStemFilter,
    parseMixAbArgs,
    parseRefsSpec,
    positionOf,
    residualByBar,
    residualRms,
    rmsToDbfs,
    type StemResidual,
    subtractStems,
} from '../../scripts/mix-ab.js';

/**
 * 1000 Hz, 0.125 s steps, 0.25 s lead-in, 40 steps of form.
 *
 * 16 steps to a bar → a bar is 2.000 s = 2000 frames, and 40 steps is TWO AND A HALF
 * bars, so bar 3 is deliberately partial (1.000 s). Music ends at 0.25 + 5.00 = 5.25 s.
 */
const META = {
    sampleRate: 1000,
    leadInSeconds: 0.25,
    stepSeconds: 0.125,
    stepsPerLoop: 40,
    loopCount: 1,
    bpm: 120,
};

/** A mono buffer with `value` written into the half-open frame span. */
function withSpan(length: number, spans: Array<[number, number, number]>): Float32Array[] {
    const channel = new Float32Array(length);
    for (const [from, to, value] of spans) {
        channel.fill(value, from, to);
    }
    return [channel];
}

function mono(values: number[]): { channels: Float32Array[]; sampleRate: number } {
    return { channels: [Float32Array.from(values)], sampleRate: 1000 };
}

describe('mix:ab — residual level', () => {
    it('reports dBFS with a true -Infinity at zero, not a clamped floor', () => {
        // 20·log10(1) = 0; 20·log10(0.5) = -6.0205999…; 20·log10(1/32768) = -90.3089…
        // The last is the 16-bit LSB the residual WAV is written at, and the reason
        // the default threshold sits where it does.
        expect(rmsToDbfs(1)).toBe(0);
        expect(rmsToDbfs(0.5)).toBeCloseTo(-6.0206, 4);
        expect(rmsToDbfs(1 / 32768)).toBeCloseTo(-90.309, 3);
        // A byte-identical pair is a distinct, reportable outcome. `audio-analysis`'s
        // `toDb` would return -120 here, which is indistinguishable from a real
        // -120 dBFS measurement.
        expect(rmsToDbfs(0)).toBe(Number.NEGATIVE_INFINITY);
    });

    it('subtracts sample-wise: four samples 0.25 apart give exactly 0.25 RMS', () => {
        // diff = [0.25, -0.25, 0.25, -0.25] → mean square 0.0625 → RMS 0.25 → -12.0412 dBFS
        const result = subtractStems(
            mono([0.5, -0.5, 0.5, -0.5]),
            mono([0.25, -0.25, 0.25, -0.25]),
        );
        expect(result.rms).toBeCloseTo(0.25, 12);
        expect(result.rmsDb).toBeCloseTo(-12.0412, 4);
        expect(result.maxAbsDiff).toBeCloseTo(0.25, 12);
        expect(Array.from(result.residual[0])).toEqual([0.25, -0.25, 0.25, -0.25]);
    });

    it('averages the mean square over every channel, not per channel', () => {
        // L is identical, R differs by 0.5 throughout. Sum of squares is 4 × 0.25 = 1
        // over 4 frames × 2 channels = 8 slots → RMS = sqrt(1/8) = 0.35355339.
        // Averaging per channel and then across channels would give 0.25.
        const a = {
            channels: [Float32Array.from([0, 0, 0, 0]), Float32Array.from([0.5, 0.5, 0.5, 0.5])],
            sampleRate: 1000,
        };
        const b = {
            channels: [Float32Array.from([0, 0, 0, 0]), Float32Array.from([0, 0, 0, 0])],
            sampleRate: 1000,
        };
        const result = subtractStems(a, b);
        expect(result.rms).toBeCloseTo(0.353553390593, 10);
        expect(result.comparedChannels).toBe(2);
    });

    it('nulls an identical pair to exact silence', () => {
        const result = subtractStems(mono([0.3, -0.7, 0.1]), mono([0.3, -0.7, 0.1]));
        expect(result.rms).toBe(0);
        expect(result.rmsDb).toBe(Number.NEGATIVE_INFINITY);
        expect(result.maxAbsDiff).toBe(0);
    });
});

describe('mix:ab — differing lengths', () => {
    it('compares the common prefix and reports both lengths', () => {
        // A is 5 frames, B is 3. Over the prefix the diff is [0.2, 0.2, 0.2] → RMS 0.2.
        // Zero-padding B to A's length instead would give sqrt((3·0.04 + 2)/5) = 0.651,
        // so this expectation actually distinguishes the two behaviors.
        const result = subtractStems(mono([0.2, 0.2, 0.2, 1, 1]), mono([0, 0, 0]));
        expect(result.framesA).toBe(5);
        expect(result.framesB).toBe(3);
        expect(result.comparedFrames).toBe(3);
        expect(result.residual[0].length).toBe(3);
        expect(result.rms).toBeCloseTo(0.2, 6);
    });

    it('compares the common channel count when one render is mono', () => {
        const stereo = {
            channels: [Float32Array.from([1, 1]), Float32Array.from([1, 1])],
            sampleRate: 1000,
        };
        const result = subtractStems(stereo, mono([0, 0]));
        expect(result.channelsA).toBe(2);
        expect(result.channelsB).toBe(1);
        expect(result.comparedChannels).toBe(1);
        expect(result.rms).toBeCloseTo(1, 12);
    });

    it('refuses to subtract renders at different sample rates', () => {
        const other = { channels: [Float32Array.from([0, 0])], sampleRate: 48000 };
        expect(() => subtractStems(mono([0, 0]), other)).toThrow(/sample rates differ/);
    });
});

describe('mix:ab — per-bar bucketing', () => {
    // 6.000 s of residual. Bar spans at this geometry are hand-computed:
    //   lead-in [0, 250)   — belongs to NO bar
    //   bar 1   [250, 2250)
    //   bar 2   [2250, 4250)
    //   bar 3   [4250, 5250)  ← partial: the form ends at 5.25 s, mid-bar
    //   tail    [5250, 6000)
    const RESIDUAL = withSpan(6000, [
        [0, 250, 1],
        [2250, 4250, 0.5],
        [4250, 5250, 0.25],
        [5250, 6000, 0.125],
    ]);

    it('starts bar 1 at the lead-in, not at t=0', () => {
        const bars = residualByBar(RESIDUAL, META.sampleRate, META);
        // The full-scale burst sits entirely inside the 0.25 s lead-in. A bucketing
        // that ignored `leadInSeconds` would open bar 1 at frame 0, swallow it, and
        // report bar 1 as the loudest bar in the render.
        expect(bars[0].bar).toBe(1);
        expect(bars[0].startSec).toBeCloseTo(0.25, 12);
        expect(bars[0].frameCount).toBe(2000);
        expect(bars[0].rms).toBe(0);
        expect(bars[0].rmsDb).toBe(Number.NEGATIVE_INFINITY);
    });

    it('measures each bar over its own span', () => {
        const bars = residualByBar(RESIDUAL, META.sampleRate, META);
        expect(bars[1].bar).toBe(2);
        expect(bars[1].startSec).toBeCloseTo(2.25, 12);
        expect(bars[1].endSec).toBeCloseTo(4.25, 12);
        expect(bars[1].frameCount).toBe(2000);
        expect(bars[1].rms).toBeCloseTo(0.5, 6);
        expect(bars[1].rmsDb).toBeCloseTo(-6.0206, 3);
    });

    it('cuts the final bar at the end of the form when the form ends mid-bar', () => {
        const bars = residualByBar(RESIDUAL, META.sampleRate, META);
        // 40 steps is two and a half bars, so bar 3 is 1.000 s — half the frames of
        // bar 2 — and stops at 5.25 s rather than running to 6.25 s.
        expect(bars[2].bar).toBe(3);
        expect(bars[2].endSec).toBeCloseTo(5.25, 12);
        expect(bars[2].frameCount).toBe(1000);
        expect(bars[2].rms).toBeCloseTo(0.25, 6);
    });

    it('buckets the post-form tail separately, numbered one past the last bar', () => {
        const bars = residualByBar(RESIDUAL, META.sampleRate, META);
        const tail = bars[bars.length - 1];
        expect(tail.tail).toBe(true);
        expect(tail.bar).toBe(4);
        expect(tail.startSec).toBeCloseTo(5.25, 12);
        expect(tail.frameCount).toBe(750);
        expect(tail.rms).toBeCloseTo(0.125, 6);
        expect(bars.filter((bar) => bar.tail)).toHaveLength(1);
    });

    it('omits buckets with no compared samples rather than calling them silent', () => {
        // Only 3.000 s survived the common-prefix trim: bar 1 is whole, bar 2 keeps
        // 750 of its 2000 frames, bar 3 and the tail were never compared at all.
        // Emitting them at -Inf would read as "identical here" when the truth is
        // "not measured here".
        const bars = residualByBar(withSpan(3000, [[2250, 3000, 0.5]]), META.sampleRate, META);
        expect(bars.map((bar) => bar.bar)).toEqual([1, 2]);
        expect(bars[1].frameCount).toBe(750);
        expect(bars[1].rms).toBeCloseTo(0.5, 6);
    });

    it('ranks the loudest buckets first, breaking ties by bar order', () => {
        const bars = residualByBar(RESIDUAL, META.sampleRate, META);
        expect(loudestBars(bars, 2).map((bar) => bar.bar)).toEqual([2, 3]);
        expect(loudestBars(bars, 99)).toHaveLength(bars.length);
    });

    it('measures a span directly over a half-open frame range', () => {
        // 1000 frames of 0.5 → RMS 0.5; the 250 frames of 1.0 before it are excluded
        // because the range is half-open at the start too.
        const { rms, frameCount } = residualRms(
            withSpan(2000, [
                [0, 250, 1],
                [250, 1250, 0.5],
            ]),
            250,
            1250,
        );
        expect(frameCount).toBe(1000);
        expect(rms).toBeCloseTo(0.5, 6);
        expect(residualRms(RESIDUAL, 500, 500)).toEqual({ rms: 0, frameCount: 0 });
    });
});

describe('mix:ab — threshold decision', () => {
    it('defaults to -90 dBFS, which is deliberately not zero', () => {
        // The renderer is not bit-reproducible (worst measured identity residual:
        // -99.0 dBFS on the full stem). A zero threshold would flag every run.
        expect(DEFAULT_THRESHOLD_DB).toBe(-90);
    });

    it('brackets the boundary: at the threshold is silent, one epsilon above reports', () => {
        const epsilon = 1e-9;
        expect(exceedsThreshold(DEFAULT_THRESHOLD_DB - epsilon, DEFAULT_THRESHOLD_DB)).toBe(false);
        expect(exceedsThreshold(DEFAULT_THRESHOLD_DB, DEFAULT_THRESHOLD_DB)).toBe(false);
        expect(exceedsThreshold(DEFAULT_THRESHOLD_DB + epsilon, DEFAULT_THRESHOLD_DB)).toBe(true);
    });

    it('honours an overridden threshold at its own boundary', () => {
        expect(exceedsThreshold(-80, -80)).toBe(false);
        expect(exceedsThreshold(-79.999999, -80)).toBe(true);
        // A byte-identical stem is below every threshold.
        expect(exceedsThreshold(Number.NEGATIVE_INFINITY, -200)).toBe(false);
    });
});

describe('mix:ab — musical position', () => {
    it('maps play time to bar / beat / sixteenth against the lead-in', () => {
        const at = (step: number) => positionOf(META.leadInSeconds + step * META.stepSeconds, META);
        expect(at(0)).toEqual({ step: 0, bar: 1, beat: 1, sixteenth: 1 });
        expect(at(6)).toEqual({ step: 6, bar: 1, beat: 2, sixteenth: 3 });
        expect(at(15)).toEqual({ step: 15, bar: 1, beat: 4, sixteenth: 4 });
        expect(at(17)).toEqual({ step: 17, bar: 2, beat: 1, sixteenth: 2 });
        expect(at(36)).toEqual({ step: 36, bar: 3, beat: 2, sixteenth: 1 });
    });

    it('rounds humanized times onto the nearest step', () => {
        // A step is 0.125 s here, so ±0.05 s of humanization must still read as step 4.
        expect(positionOf(0.25 + 4 * 0.125 + 0.05, META).step).toBe(4);
        expect(positionOf(0.25 + 4 * 0.125 - 0.05, META).step).toBe(4);
    });

    it('names the beat plainly, and only decorates off-beat sixteenths', () => {
        expect(formatPosition({ step: 4, bar: 1, beat: 2, sixteenth: 1 })).toBe('bar 1 beat 2');
        expect(formatPosition({ step: 6, bar: 1, beat: 2, sixteenth: 3 })).toBe('bar 1 beat 2.3');
    });
});

describe('mix:ab — event delta', () => {
    const at = (step: number, jitter = 0): number =>
        META.leadInSeconds + step * META.stepSeconds + jitter;
    const note = (track: string, step: number, midi: number, jitter = 0): DumpEvent => ({
        track,
        time: at(step, jitter),
        midi,
    });

    it('matches humanized copies of the same note instead of reporting churn', () => {
        const a = [note('bass', 0, 45), note('drums', 4, 38), note('bass', 8, 45)];
        const b = [
            note('bass', 0, 45, 0.012),
            note('drums', 4, 38, -0.02),
            note('bass', 8, 45, 0.03),
        ];
        const delta = diffEvents(a, b, META);
        expect(delta.matched).toBe(3);
        expect(delta.added).toHaveLength(0);
        expect(delta.removed).toHaveLength(0);
        expect(delta.moved).toHaveLength(0);
        expect(delta.repitched).toHaveLength(0);
    });

    it('reports a note only A has as removed, and only B has as added', () => {
        const shared = note('drums', 0, 36);
        const delta = diffEvents(
            [shared, note('drums', 8, 42)],
            [shared, note('drums', 12, 51)],
            META,
        );
        expect(delta.matched).toBe(1);
        expect(delta.removed).toHaveLength(1);
        expect(delta.removed[0].midi).toBe(42);
        expect(formatPosition(delta.removed[0].position)).toBe('bar 1 beat 3');
        expect(delta.added).toHaveLength(1);
        expect(delta.added[0].midi).toBe(51);
        expect(formatPosition(delta.added[0].position)).toBe('bar 1 beat 4');
    });

    it('pairs a same-pitch note that slid within the move window', () => {
        const delta = diffEvents([note('drums', 4, 38)], [note('drums', 6, 38)], META);
        expect(delta.moved).toHaveLength(1);
        expect(delta.moved[0]).toMatchObject({ track: 'drums', midi: 38 });
        expect(delta.moved[0].from.step).toBe(4);
        expect(delta.moved[0].to.step).toBe(6);
        expect(delta.added).toHaveLength(0);
        expect(delta.removed).toHaveLength(0);
    });

    it('refuses to call a slide past the window a move', () => {
        // MOVE_WINDOW_STEPS is one beat. At exactly the window it is still the same
        // note; one step past it, calling it "moved" would be a guess, so it splits
        // into a removal and an addition.
        const inside = diffEvents(
            [note('drums', 4, 38)],
            [note('drums', 4 + MOVE_WINDOW_STEPS, 38)],
            META,
        );
        expect(inside.moved).toHaveLength(1);
        const outside = diffEvents(
            [note('drums', 4, 38)],
            [note('drums', 5 + MOVE_WINDOW_STEPS, 38)],
            META,
        );
        expect(outside.moved).toHaveLength(0);
        expect(outside.removed).toHaveLength(1);
        expect(outside.added).toHaveLength(1);
    });

    it('reports a same-step pitch change as one moved note, not an add plus a remove', () => {
        // The #1278 shape: the bass anchor drops an octave on the same step. Two
        // lines ("45 gone, 33 appeared") bury the one fact worth reading.
        const delta = diffEvents([note('bass', 8, 45)], [note('bass', 8, 33)], META);
        expect(delta.repitched).toHaveLength(1);
        expect(delta.repitched[0]).toMatchObject({ track: 'bass', midiA: 45, midiB: 33 });
        expect(formatPosition(delta.repitched[0].position)).toBe('bar 1 beat 3');
        expect(delta.added).toHaveLength(0);
        expect(delta.removed).toHaveLength(0);
    });

    it('keeps a doubled note doubled', () => {
        // Two identical notes in A against one in B is a dropped unison, not a match.
        const delta = diffEvents(
            [note('chords', 0, 60), note('chords', 0, 60)],
            [note('chords', 0, 60)],
            META,
        );
        expect(delta.matched).toBe(1);
        expect(delta.removed).toHaveLength(1);
        expect(delta.repitched).toHaveLength(0);
    });

    it('does not pair notes across tracks', () => {
        const delta = diffEvents([note('bass', 0, 45)], [note('soloist', 0, 45)], META);
        expect(delta.matched).toBe(0);
        expect(delta.moved).toHaveLength(0);
        expect(delta.repitched).toHaveLength(0);
        expect(delta.removed[0].track).toBe('bass');
        expect(delta.added[0].track).toBe('soloist');
    });
});

describe('mix:ab — argument parsing', () => {
    it('splits --refs into the two refs', () => {
        const options = parseMixAbArgs(['--refs=main..HEAD']);
        expect(options.fromRef).toBe('main');
        expect(options.toRef).toBe('HEAD');
        expect(options.identity).toBeNull();
    });

    it('accepts --from-ref / --to-ref as the long form', () => {
        const options = parseMixAbArgs(['--from-ref=0f0b3a4c~1', '--to-ref=0f0b3a4c']);
        expect(options.fromRef).toBe('0f0b3a4c~1');
        expect(options.toRef).toBe('0f0b3a4c');
    });

    it.each([
        ['main', 'no separator'],
        ['main..', 'empty right side'],
        ['..HEAD', 'empty left side'],
        ['main...HEAD', 'three dots'],
        ['a..b..c', 'two separators'],
        ['', 'empty'],
    ])('rejects a malformed --refs=%s (%s)', (spec) => {
        expect(() => parseRefsSpec(spec)).toThrow(/--refs must look like/);
        expect(() => parseMixAbArgs([`--refs=${spec}`])).toThrow(/--refs must look like/);
    });

    it('rejects an unknown flag rather than silently comparing the wrong thing', () => {
        expect(() => parseMixAbArgs(['--refs=a..b', '--stem=bass'])).toThrow(
            /Unknown flag: --stem=bass/,
        );
    });

    it('requires a pair of refs or an identity ref', () => {
        expect(() => parseMixAbArgs(['--scene=funk-pocket'])).toThrow(/pass --refs=A\.\.B/);
        expect(() => parseMixAbArgs(['--from-ref=main'])).toThrow(/pass --refs=A\.\.B/);
    });

    it('refuses --identity alongside refs', () => {
        expect(() => parseMixAbArgs(['--identity=HEAD', '--refs=a..b'])).toThrow(
            /cannot be combined with refs/,
        );
        expect(() => parseMixAbArgs(['--identity='])).toThrow(/--identity needs a ref/);
    });

    it('parses the render and reporting flags', () => {
        const options = parseMixAbArgs([
            '--refs=a..b',
            '--scene=funk-pocket',
            '--seed=MIX_AUDIT',
            '--loops=3',
            '--stems=bass, drums',
            '--threshold-db=-80.5',
            '--out=tmp/elsewhere',
            '--keep',
        ]);
        expect(options.scene).toBe('funk-pocket');
        expect(options.seed).toBe('MIX_AUDIT');
        expect(options.loops).toBe(3);
        expect(options.stems).toEqual(['bass', 'drums']);
        expect(options.thresholdDb).toBe(-80.5);
        expect(options.out).toBe('tmp/elsewhere');
        expect(options.keep).toBe(true);
    });

    it('defaults the threshold and keeps nothing', () => {
        const options = parseMixAbArgs(['--refs=a..b']);
        expect(options.thresholdDb).toBe(DEFAULT_THRESHOLD_DB);
        expect(options.loops).toBe(1);
        expect(options.keep).toBe(false);
        expect(options.stems).toEqual([]);
    });

    it('rejects a non-numeric threshold instead of falling back to the default', () => {
        expect(() => parseMixAbArgs(['--refs=a..b', '--threshold-db=quiet'])).toThrow(
            /--threshold-db must be a number/,
        );
    });
});

describe('mix:ab — stem filter', () => {
    it('matches on the dumped stem id', () => {
        const entry = { stem: 'bass', label: 'funk-pocket-bass-MIX_AUDIT' };
        expect(matchesStemFilter(entry, [])).toBe(true);
        expect(matchesStemFilter(entry, ['bass', 'drums'])).toBe(true);
        expect(matchesStemFilter(entry, ['drums'])).toBe(false);
    });

    it('falls back to the file name only when there was no dump to read', () => {
        // Without a dump the loader sets `stem` to the label; scene ids contain
        // hyphens too, so the name cannot be split reliably and a substring test is
        // the honest fallback.
        const nameOnly = {
            stem: 'funk-pocket-bass-MIX_AUDIT',
            label: 'funk-pocket-bass-MIX_AUDIT',
        };
        expect(matchesStemFilter(nameOnly, ['bass'])).toBe(true);
        expect(matchesStemFilter(nameOnly, ['chords'])).toBe(false);
    });
});

describe('mix:ab — report discipline', () => {
    const residual = (rmsDb: number): StemResidual => ({
        residual: [new Float32Array(0)],
        sampleRate: 1000,
        rms: 0,
        rmsDb,
        maxAbsDiff: 0,
        framesA: 100,
        framesB: 100,
        comparedFrames: 100,
        channelsA: 2,
        channelsB: 2,
        comparedChannels: 2,
    });
    const stem = (name: string, rmsDb: number) => ({
        label: `funk-pocket-${name}-MIX_AUDIT`,
        stem: name,
        residual: residual(rmsDb),
        bars: [
            { bar: 3, tail: false, startSec: 0, endSec: 2, frameCount: 100, rms: 0, rmsDb: -41 },
            { bar: 1, tail: false, startSec: 0, endSec: 2, frameCount: 100, rms: 0, rmsDb: -70 },
        ],
        delta: null,
        notVerifiable: {},
        residualWavPath: null,
    });
    const report = {
        identity: false,
        refA: { spec: 'main', sha: 'd44dee78a1c3', detached: false },
        refB: { spec: 'HEAD', sha: '795baf1b2e4d', detached: true },
        thresholdDb: DEFAULT_THRESHOLD_DB,
        stems: [stem('bass', -40), stem('drums', -102.9)],
        onlyInA: [],
        onlyInB: [],
    };

    it('refuses to attribute a sub-floor residual, and localizes one above it', () => {
        const text = formatAbReport(report);
        expect(text).toContain('indistinguishable from render noise');
        expect(text).toContain('ABOVE THRESHOLD by 50.0 dB');
        // Localization is printed for the stem that cleared the floor…
        expect(text).toContain('loudest: bar 3 -41.0, bar 1 -70.0 dBFS');
        // …and exactly once, so the sub-floor stem got no "loudest bar" claim.
        expect(text.match(/loudest:/g)).toHaveLength(1);
        expect(text).toContain('1 of 2 stem(s) above -90.0 dBFS: bass');
    });

    it('emits no better/worse judgement anywhere', () => {
        expect(formatAbReport(report)).not.toMatch(/better|worse|improve|regress/i);
    });

    it('names a missing counterpart rather than dropping the stem', () => {
        const text = formatAbReport({ ...report, onlyInA: ['funk-pocket-kick-MIX_AUDIT'] });
        expect(text).toContain(
            'NOT VERIFIABLE: funk-pocket-kick-MIX_AUDIT — rendered at A only, nothing at B to subtract',
        );
    });
});
