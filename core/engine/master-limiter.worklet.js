/**
 * The master bus's look-ahead true-peak limiter (#2002), an `AudioWorkletProcessor`.
 *
 * Plain JavaScript on purpose: the browser loads this file as it is, in the audio thread's
 * worklet scope (no bundler, no imports), and node renders load the same file
 * (`scripts/node-webaudio.ts`). `master-limiter.ts` is the main-thread side that registers it and
 * builds the node; read that file first.
 *
 * How it works, per sample:
 *
 * 1. **True peak.** The input is upsampled 4× with the interpolation filter of ITU-R BS.1770-4
 *    Annex 2 — the filter a true-peak meter uses — and the loudest of the four interpolated values
 *    (and the two real samples around them) is the peak of the stretch between two input samples.
 * 2. **Required gain** for that stretch: `min(1, ceiling / peak)`.
 * 3. **Look-ahead.** The audio is delayed by the look-ahead window, so the gain can start falling
 *    before the peak arrives. A running minimum over the window (plus one sample, so both stretches
 *    touching a sample count) holds the lowest gain any sample in the window needs; a release
 *    smoother lets the gain recover exponentially, never faster; and a moving average over the
 *    window turns the held step into a ramp that reaches the needed gain exactly when the peak's
 *    sample leaves the delay line. The average of values each at most the needed gain is at most
 *    the needed gain, so no sample of the peak's stretch passes over the ceiling.
 *
 * A non-finite input sample is read as silence, so one NaN from a voice cannot poison the filter
 * history (and so the whole master) for good. The options are clamped to sane ranges, so a bad
 * caller cannot hand the audio thread a zero-length window or a NaN ceiling.
 */

/** BS.1770-4 Annex 2's 48-tap interpolation filter, as its four 12-tap phases. */
const PHASES = [
    [
        0.001708984375, 0.010986328125, -0.0196533203125, 0.033203125, -0.0594482421875,
        0.1373291015625, 0.97216796875, -0.102294921875, 0.047607421875, -0.026611328125,
        0.014892578125, -0.00830078125,
    ],
    [
        -0.0291748046875, 0.029296875, -0.0517578125, 0.089111328125, -0.16650390625,
        0.465087890625, 0.77978515625, -0.2003173828125, 0.1015625, -0.0582275390625,
        0.0330810546875, -0.0189208984375,
    ],
    [
        -0.0189208984375, 0.0330810546875, -0.0582275390625, 0.1015625, -0.2003173828125,
        0.77978515625, 0.465087890625, -0.16650390625, 0.089111328125, -0.0517578125, 0.029296875,
        -0.0291748046875,
    ],
    [
        -0.00830078125, 0.014892578125, -0.026611328125, 0.047607421875, -0.102294921875,
        0.97216796875, 0.1373291015625, -0.0594482421875, 0.033203125, -0.0196533203125,
        0.010986328125, 0.001708984375,
    ],
];
const TAPS = 12;
/**
 * The filter's centre: the interpolated values a sample's arrival produces lie between the
 * samples `TAP_CENTRE` and `TAP_CENTRE - 1` back in the history.
 */
const TAP_CENTRE = 6;
/**
 * How far under the ceiling the detector aims, in dB. The gain is checked against the peak of
 * each stretch at that stretch's two samples, but it still moves across the filter's other taps,
 * so the output's own interpolated peak can sit a hair above what the detector saw: up to
 * 0.0001 dB on the band's renders and 0.005 dB on a synthetic signal 13 dB over (#2002). The
 * margin keeps the promised ceiling a promise.
 */
const CEILING_MARGIN_DB = 0.05;

function clampOption(value, fallback, min, max) {
    return typeof value === 'number' && Number.isFinite(value)
        ? Math.min(max, Math.max(min, value))
        : fallback;
}

/** The four phases flattened, phase-major, for the audio thread's inner loop. */
const COEFS = new Float64Array(PHASES.flat());

class MasterLimiterProcessor extends AudioWorkletProcessor {
    constructor(options) {
        super();
        const settings = options?.processorOptions || {};
        this.ceiling =
            10 ** ((clampOption(settings.ceilingDb, -1, -24, 0) - CEILING_MARGIN_DB) / 20);
        const lookaheadMs = clampOption(settings.lookaheadMs, 5, 0.5, 50);
        const releaseMs = clampOption(settings.releaseMs, 100, 1, 2000);
        // `sampleRate` is the worklet scope's global.
        const window = Math.max(2, Math.round((lookaheadMs * sampleRate) / 1000));
        this.window = window;
        this.releaseCoef = Math.exp(-1000 / (releaseMs * sampleRate));

        // Filter history per channel, written twice (at `tapPos` and `tapPos + TAPS`) so the
        // newest TAPS samples always sit contiguous, newest last, at `tapPos + 1 … tapPos + TAPS`.
        this.historyL = new Float64Array(2 * TAPS);
        this.historyR = new Float64Array(2 * TAPS);
        this.tapPos = 0;

        // The delay line the audio waits in: window + the filter's centre - 1 samples, so a
        // sample leaves it with the gain both stretches touching it asked for.
        this.delay = window + TAP_CENTRE - 1;
        this.lineL = new Float32Array(this.delay + 1);
        this.lineR = new Float32Array(this.delay + 1);
        this.linePos = 0;

        // Running minimum of the required gain over window + 1 samples: a monotonic deque of
        // (index, gain) in ring buffers sized past the span.
        this.span = window + 1;
        this.dequeCap = this.span + 2;
        this.dequeIndex = new Float64Array(this.dequeCap);
        this.dequeGain = new Float64Array(this.dequeCap);
        this.dequeHead = 0;
        this.dequeSize = 0;
        this.sampleIndex = 0;

        // The release smoother's state, and the moving average's ring and running sum.
        this.released = 1;
        this.avgRing = new Float64Array(window).fill(1);
        this.avgPos = 0;
        this.avgSum = window;
    }

    /** One sample's required gain, through the running minimum, the release and the average. */
    gainFor(required) {
        const index = this.sampleIndex++;
        const cap = this.dequeCap;
        const gains = this.dequeGain;
        // Drop gains at the back that the new one undercuts, then push it.
        while (this.dequeSize > 0) {
            const back = (this.dequeHead + this.dequeSize - 1) % cap;
            if (gains[back] >= required) {
                this.dequeSize--;
            } else {
                break;
            }
        }
        const slot = (this.dequeHead + this.dequeSize) % cap;
        this.dequeIndex[slot] = index;
        gains[slot] = required;
        this.dequeSize++;
        // Drop the front once it has left the span.
        while (this.dequeIndex[this.dequeHead] <= index - this.span) {
            this.dequeHead = (this.dequeHead + 1) % cap;
            this.dequeSize--;
        }
        const held = gains[this.dequeHead];

        // Falls at once (the average spreads the fall over the window); recovers exponentially.
        this.released =
            held < this.released ? held : held + (this.released - held) * this.releaseCoef;

        this.avgSum += this.released - this.avgRing[this.avgPos];
        this.avgRing[this.avgPos] = this.released;
        this.avgPos = this.avgPos + 1 === this.window ? 0 : this.avgPos + 1;
        const gain = this.avgSum / this.window;
        return Math.min(1, Math.max(0, gain));
    }

    process(inputs, outputs) {
        const output = outputs[0];
        if (!output || output.length === 0) {
            return true;
        }
        const input = inputs[0];
        const frames = output[0].length;
        // Nothing connected is silence; a mono input feeds both channels.
        const inL = input && input.length > 0 ? input[0] : null;
        const inR = input && input.length > 1 ? input[1] : inL;
        const outL = output[0];
        const outR = output.length > 1 ? output[1] : null;
        const histL = this.historyL;
        const histR = this.historyR;
        const lineL = this.lineL;
        const lineR = this.lineR;
        const ceiling = this.ceiling;
        const delay = this.delay;
        for (let i = 0; i < frames; i++) {
            let xl = inL ? inL[i] : 0;
            let xr = inR ? inR[i] : 0;
            if (!Number.isFinite(xl)) {
                xl = 0;
            }
            if (!Number.isFinite(xr)) {
                xr = 0;
            }
            const tap = this.tapPos;
            histL[tap] = xl;
            histL[tap + TAPS] = xl;
            histR[tap] = xr;
            histR[tap + TAPS] = xr;
            // The newest sample is at `tap + TAPS`, the one k back at `tap + TAPS - k`.
            const newest = tap + TAPS;
            let peak = 0;
            for (let p = 0; p < 4; p++) {
                const base = p * TAPS;
                let yl = 0;
                let yr = 0;
                for (let k = 0; k < TAPS; k++) {
                    const c = COEFS[base + k];
                    yl += c * histL[newest - k];
                    yr += c * histR[newest - k];
                }
                if (yl < 0) {
                    yl = -yl;
                }
                if (yr < 0) {
                    yr = -yr;
                }
                if (yl > peak) {
                    peak = yl;
                }
                if (yr > peak) {
                    peak = yr;
                }
            }
            // The two real samples the interpolated stretch lies between.
            for (let back = TAP_CENTRE - 1; back <= TAP_CENTRE; back++) {
                const l = Math.abs(histL[newest - back]);
                const r = Math.abs(histR[newest - back]);
                if (l > peak) {
                    peak = l;
                }
                if (r > peak) {
                    peak = r;
                }
            }
            this.tapPos = tap + 1 === TAPS ? 0 : tap + 1;

            const gain = this.gainFor(peak > ceiling ? ceiling / peak : 1);

            const pos = this.linePos;
            const outPos = pos === delay ? 0 : pos + 1;
            lineL[pos] = xl;
            lineR[pos] = xr;
            outL[i] = lineL[outPos] * gain;
            if (outR) {
                outR[i] = lineR[outPos] * gain;
            }
            this.linePos = outPos;
        }
        return true;
    }
}

registerProcessor('ensemble-master-limiter', MasterLimiterProcessor);
