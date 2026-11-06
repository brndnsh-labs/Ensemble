/**
 * The master bus's look-ahead true-peak limiter (#2002): the main-thread side.
 *
 * Web Audio has no limiter. A `DynamicsCompressorNode` at a high ratio is not one: it has no
 * true-peak detection, adds its own make-up gain, lets fast transients through, and behaves
 * differently in Chromium, WebKit and node-web-audio-api (node passes transients about 2 dB
 * hotter, `docs/guides/listening-gate-tools.md`). So the limiter is an `AudioWorkletProcessor`
 * (`master-limiter.worklet.js`), the same JavaScript on all three: the live stand, the offline
 * WAV export and the node renders the listening-gate tools make.
 *
 * A worklet module loads asynchronously, and `initAudio` builds the graph synchronously. So the
 * graph is built with a gap where the limiter goes, and {@link wireMasterLimiter} closes it once
 * the module is registered: until then the master is silent, and every path that sounds waits on
 * {@link masterChainReady} first (Play, Start here, Loop and the chord audition in
 * `web/lib/runtime.ts`; `renderBandPasses` before it renders). A browser that cannot run the
 * worklet, or whose module fails or stalls past {@link REGISTER_TIMEOUT_MS}, gets a
 * `DynamicsCompressorNode` safety limiter in its place (a warning in the console): never silence,
 * and never the make-up gain (up to +11.7 dB) clipping straight into the destination.
 */

/** The processor's registered name (`registerProcessor` in the worklet file). */
const PROCESSOR_NAME = 'ensemble-master-limiter';

/**
 * The limiter's settings. The ceiling is the issue's −1 dBTP (the AES/EBU streaming
 * recommendation: room for a lossy encoder's overshoot). The look-ahead is also the attack:
 * 5 ms is long enough that the gain ramps down over a couple of cycles of a bass note instead of
 * stepping inside one (which is the distortion), and short enough to add no latency anyone can
 * play against. The release is 100 ms: fast enough to recover between drum hits so it does not
 * duck the bar, slow enough not to follow a bass waveform. All three are taste calls (#2002).
 */
export const MASTER_LIMITER = {
    ceilingDb: -1,
    lookaheadMs: 5,
    releaseMs: 100,
} as const;

/** The worklet's file, resolved by the bundler (webpack, Vite) to a same-origin URL. */
const MODULE_URL = new URL('./master-limiter.worklet.js', import.meta.url);

/**
 * How long a module load may take before the chain falls back (#2002 review): a stalled fetch
 * would otherwise leave Play waiting on {@link masterChainReady} for good. A same-origin file,
 * precached by the service worker, loads in milliseconds.
 */
const REGISTER_TIMEOUT_MS = 3000;

/** One registration per context: `addModule` twice is harmless but wasteful. */
const registrations = new WeakMap<BaseAudioContext, Promise<boolean>>();
/** One wiring per context, the promise every sounding path waits on. */
const wirings = new WeakMap<BaseAudioContext, Promise<void>>();

function canRunWorklet(ctx: BaseAudioContext): boolean {
    return (
        typeof AudioWorkletNode !== 'undefined' &&
        typeof (ctx as { audioWorklet?: AudioWorklet }).audioWorklet?.addModule === 'function'
    );
}

/** Register the processor on `ctx`; resolves false (never rejects) when it cannot run. */
function registerLimiter(ctx: BaseAudioContext): Promise<boolean> {
    let registration = registrations.get(ctx);
    if (!registration) {
        registration = canRunWorklet(ctx)
            ? new Promise<boolean>((resolve) => {
                  const timer = setTimeout(() => {
                      console.warn('[MasterLimiter] worklet load timed out; safety limiter only');
                      resolve(false);
                  }, REGISTER_TIMEOUT_MS);
                  ctx.audioWorklet.addModule(MODULE_URL.href).then(
                      () => {
                          clearTimeout(timer);
                          resolve(true);
                      },
                      (error: unknown) => {
                          clearTimeout(timer);
                          console.warn(
                              '[MasterLimiter] worklet failed; safety limiter only:',
                              error,
                          );
                          resolve(false);
                      },
                  );
              })
            : Promise.resolve(false);
        registrations.set(ctx, registration);
    }
    return registration;
}

/**
 * The fallback when the worklet cannot run: the brick-wall compressor the master ended in before
 * #2002 (−2 dB threshold, 20:1, 1 ms attack). It detects sample peaks only and adds its own
 * make-up, so it does not hold −1 dBTP, but it keeps the make-up gain from clipping hard.
 */
function connectSafetyLimiter(ctx: BaseAudioContext, input: AudioNode, output: AudioNode): void {
    const safety = ctx.createDynamicsCompressor();
    safety.threshold.setValueAtTime(-2, ctx.currentTime);
    safety.knee.setValueAtTime(3, ctx.currentTime);
    safety.ratio.setValueAtTime(20, ctx.currentTime);
    safety.attack.setValueAtTime(0.001, ctx.currentTime);
    safety.release.setValueAtTime(0.15, ctx.currentTime);
    input.connect(safety);
    safety.connect(output);
}

/**
 * Put the limiter between `input` and `output` on `ctx` once its module is registered; until then
 * nothing passes. Without the worklet, the safety limiter goes there instead.
 */
export function wireMasterLimiter(
    ctx: BaseAudioContext,
    input: AudioNode,
    output: AudioNode,
): Promise<void> {
    const wiring = registerLimiter(ctx).then((registered) => {
        if (!registered) {
            connectSafetyLimiter(ctx, input, output);
            return;
        }
        try {
            const limiter = new AudioWorkletNode(ctx, PROCESSOR_NAME, {
                numberOfInputs: 1,
                numberOfOutputs: 1,
                outputChannelCount: [2],
                channelCount: 2,
                channelCountMode: 'explicit',
                channelInterpretation: 'speakers',
                processorOptions: { ...MASTER_LIMITER },
            });
            input.connect(limiter);
            limiter.connect(output);
        } catch (error) {
            console.warn(
                '[MasterLimiter] could not build the limiter; safety limiter only:',
                error,
            );
            try {
                connectSafetyLimiter(ctx, input, output);
            } catch {
                // A closed context: nothing will play through it anyway.
            }
        }
    });
    wirings.set(ctx, wiring);
    return wiring;
}

/**
 * Resolves once `ctx`'s master chain passes sound (the limiter in place, or skipped). Resolves at
 * once for a context `initAudio` never built a master for, so a caller can always await it.
 */
export function masterChainReady(ctx: BaseAudioContext | null | undefined): Promise<void> {
    return (ctx && wirings.get(ctx)) || Promise.resolve();
}
