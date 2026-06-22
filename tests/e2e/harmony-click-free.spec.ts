// @ts-nocheck
import pkg from '@playwright/test';

const { expect, test } = pkg;

/**
 * Click-free retirement guard for the production harmony voice
 * (`playHarmonyNoteNew` in `public/engine/synth-harmonies.ts`) — #601.
 *
 * The harmony voice retires sounding voices in three places: the same-MIDI
 * retrigger ("steal"), the 3-voice polyphony cap ("cull"), and the per-note
 * release. The pre-fix voice used `killActiveVoices`, whose
 * `setTargetAtTime` fade never reaches 0 and then hard-stops the oscillators at
 * ~3% of peak — an audible click + "suck", which the #561 acoustic fingerpick
 * (≥1 same-MIDI retrigger per bar) exposed once the other parts were muted.
 * #601 routes cull + steal through `killHarmonyVoice` (a linear ramp to *true*
 * zero before `osc.stop()`) and floors the release start at the attack peak.
 *
 * This renders a worst-case scenario offline — rapid same-MIDI retriggers (the
 * steal path) interleaved with a denser passage that overflows the 3-voice cap
 * (the cull path) — and scans the output. Scope note: the stab voice is
 * sawtooth-rich, so its legitimate slew (~0.3×peak per sample) buries a
 * retirement click that fades from only ~3% of peak — a global first-difference
 * scan cannot *isolate* that click. What this guard catches is the gross
 * failure modes the fix must never reintroduce: a NaN/Inf reaching the output,
 * and a *full-scale* discontinuity (a voice hard-stopped at or near full gain
 * with no fade). The fine-grained click-free retirement *mechanism* — a linear
 * ramp to true zero before `osc.stop()` — is asserted deterministically at the
 * unit level in `tests/unit/engine/harmonies-synthesis.test.ts` (Voice
 * Management). The by-ear audition remains the owner's hard listening gate.
 *
 * Runs against the Vite dev server (it serves the `.ts` module directly), so it
 * is `@diagnostic`-tagged — a fast offline render, not a UI smoke test.
 */
test('@diagnostic harmony voice retires same-MIDI retriggers + cap culls click-free', async ({
    page,
}) => {
    await page.goto('/');

    const metrics = await page.evaluate(async () => {
        // Seed the render (#654). The harmony voice's per-note panning + timbre
        // jitter draw unseeded `Math.random()`, so both `maxStep` and `maxAbs`
        // varied run-to-run and the deliberately-thin 0.5×peak margin tripped
        // ~1-in-N on an unlucky roll (unseeded-statistical flake). A fixed
        // mulberry32 stub makes the metric reproducible without weakening the
        // guard — the same idea as `installSeededRandom`, applied inside the
        // page context where the voice actually runs.
        let seed = 0x9e3779b9;
        Math.random = () => {
            seed = (seed + 0x6d2b79f5) | 0;
            let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };

        const mod = await import('/engine/synth-harmonies.ts');
        const { playHarmonyNote } = mod;

        const sampleRate = 48000;
        const seconds = 4;
        const ctx = new OfflineAudioContext(1, sampleRate * seconds, sampleRate);

        // A bus gain the voice connects into, wired to the render destination.
        const busGain = ctx.createGain();
        busGain.connect(ctx.destination);

        // Minimal state stub — only the fields the voice reads.
        const state = {
            playback: {
                audio: ctx,
                bandIntensity: 0.6,
                audioGraph: { harmonies: { gain: busGain } },
            },
            harmony: { voice: 'synth', activeVoices: [] },
            groove: { genreFeel: '', audioBuffers: {} },
        };

        // Schedule: a stream of stabs that (a) revisits the same MIDI while it is
        // still ringing (forces the steal path) and (b) stacks > 3 simultaneous
        // voices (forces the cap cull). All non-legato, default 'stabs' style.
        const midiToFreq = (m: number) => 440 * 2 ** ((m - 69) / 12);
        // C4 E4 G4 — a triad, plus repeated C4 hits to retrigger the same MIDI.
        const repeated = 60; // C4 — hammered every 0.12 s
        const stackMidis = [60, 64, 67, 72]; // overflows the 3-voice cap
        for (let i = 0; i < 24; i++) {
            const t = 0.1 + i * 0.12;
            // Same-MIDI hammer — revisits while the prior C4 is still ringing.
            playHarmonyNote(state, midiToFreq(repeated), t, 0.3, 0.5, 'stabs', repeated);
            // A near-simultaneous extra voice from the rotating stack to overflow
            // the polyphony cap (4 distinct MIDIs in a 3-voice budget).
            const stackMidi = stackMidis[i % stackMidis.length];
            if (stackMidi !== repeated) {
                playHarmonyNote(
                    state,
                    midiToFreq(stackMidi),
                    t + 0.01,
                    0.3,
                    0.5,
                    'stabs',
                    stackMidi,
                );
            }
        }

        const data = (await ctx.startRendering()).getChannelData(0);

        // Scan the output: worst adjacent-sample step, peak, and any non-finite
        // sample. The step metric is a coarse full-scale-discontinuity guard
        // (see the file header) — not a fine click isolator.
        let maxStep = 0;
        let maxAbs = 0;
        let nonFinite = 0;
        for (let i = 1; i < data.length; i++) {
            const x = data[i];
            if (!Number.isFinite(x)) {
                nonFinite++;
                continue;
            }
            const a = Math.abs(x);
            if (a > maxAbs) {
                maxAbs = a;
            }
            const step = Math.abs(x - data[i - 1]);
            if (step > maxStep) {
                maxStep = step;
            }
        }
        return { maxStep, maxAbs, nonFinite };
    });

    // eslint-disable-next-line no-console
    console.log('harmony-click-free metrics:', JSON.stringify(metrics));

    // No NaN/Inf ever reaches the output.
    expect(metrics.nonFinite, 'output must be finite').toBe(0);
    // Sanity: the render actually produced sound.
    expect(metrics.maxAbs, 'render must be audible').toBeGreaterThan(0.01);
    // No full-scale discontinuity: the worst single-sample step must stay a
    // fraction of peak. A voice hard-stopped at/near full gain injects a step
    // ≈ peak (ratio ~1.0). On the seeded render above, the legitimate worst
    // step — sawtooth slew plus constructive overlap of the stacked stab voices
    // — measures ~0.60×peak. The old 0.5×peak bound was calibrated against a
    // couple of lucky unseeded renders and sat *below* that legitimate content,
    // which is what made this the #654 flake. 0.7×peak clears the measured
    // content (margin ~0.10) while still failing a true full-scale hard-stop
    // (~1.0×peak, margin ~0.30) — the gross regression this guard exists for.
    expect(
        metrics.maxStep,
        'no full-scale discontinuity: worst sample step must stay below 0.7×peak',
    ).toBeLessThan(metrics.maxAbs * 0.7);
});
