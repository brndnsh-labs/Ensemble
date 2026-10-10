/**
 * The node render backend of `mix:report`: the same `renderBand` the page's render bridge runs
 * (`prototypes/v2/lib/render-bridge.ts`), on node Web Audio (`./node-webaudio.ts`), measured
 * here with `./audio-analysis.ts` — the functions the page's `renderAndMeasureInPage` mirrors,
 * because channel data could not cross into node from a browser. Here it does not have to.
 *
 * Imported dynamically by `mix-report.ts` only when the engine is `node`, so the Chromium path
 * never loads the native addon.
 */
import {
    classifyArc,
    computePeak,
    computePerLoopRmsDb,
    computeRms,
    computeSpectralProbes,
    computeStereoMetrics,
    computeTransientMetrics,
    toDb,
    toMonoFromChannels,
} from './audio-analysis.js';
import { installDiskPackFetcher } from './node-webaudio.js';

export interface NodeRenderer {
    /** The page's `renderAndMeasureInPage` result shape, from a node render. */
    renderAndMeasure(
        request: Parameters<typeof import('../prototypes/v2/lib/render-bridge.js').renderBand>[0],
        loopCount: number,
    ): Promise<MeasuredRender>;
    loadPack(packId: string): Promise<{ zones: number; loaded: boolean }>;
}

export interface MeasuredRender {
    metrics: {
        peak: number;
        peakDb: number;
        rms: number;
        rmsDb: number;
        crestDb: number;
        probes: ReturnType<typeof computeSpectralProbes>;
        transients: ReturnType<typeof computeTransientMetrics>;
        stereo: ReturnType<typeof computeStereoMetrics>;
        loopRmsDb: number[] | null;
        arc: ReturnType<typeof classifyArc>;
    };
    channels: Float32Array[];
    dispatched: Awaited<
        ReturnType<typeof import('../prototypes/v2/lib/render-bridge.js').renderBand>
    >['dispatched'];
    leadInSeconds: number;
    passSeconds: number;
    sampleRate: number;
}

export async function createNodeRenderer(): Promise<NodeRenderer> {
    const bridge = await import('../prototypes/v2/lib/render-bridge.js');
    // After the bridge's import graph has loaded: the app's `lib/sounds.ts` installs its own
    // fetcher as it loads, and this one has to win.
    installDiskPackFetcher();
    return {
        async renderAndMeasure(request, loopCount) {
            const render = await bridge.renderBand(request);
            const { channels, sampleRate } = render;
            const mono = toMonoFromChannels(channels);
            const peak = computePeak(mono);
            const rms = computeRms(mono);
            const loopRmsDb = computePerLoopRmsDb(
                mono,
                sampleRate,
                render.leadInSeconds,
                render.passSeconds,
                loopCount,
            );
            return {
                metrics: {
                    peak,
                    peakDb: toDb(peak),
                    rms,
                    rmsDb: toDb(rms),
                    crestDb: toDb(peak) - toDb(rms),
                    probes: computeSpectralProbes(mono, sampleRate),
                    transients: computeTransientMetrics(mono, sampleRate),
                    stereo: computeStereoMetrics(channels),
                    loopRmsDb,
                    arc: classifyArc(loopRmsDb),
                },
                channels,
                dispatched: render.dispatched,
                leadInSeconds: render.leadInSeconds,
                passSeconds: render.passSeconds,
                sampleRate,
            };
        },
        loadPack: bridge.loadPack,
    };
}
