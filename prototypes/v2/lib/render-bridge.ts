/**
 * The offline-render bridge: what the listening-gate tools (`scripts/mix-report.ts` and the
 * scripts built on it — `mix:ab`, `mix:verify`, `mix:spectro`, `mix:plant`) need from the page
 * to render the band engine, on `window.ensemble`. The tools compose the music themselves in
 * node (`scripts/band-scene.ts`: a scene's chart → `compileTimeline` → `performPass`); the page
 * only has what node lacks — Web Audio, today's voices and the sample packs — so this renders
 * events it is handed through `renderBandPasses`, the same offline render the app's WAV export
 * uses, and hands back raw channel data plus every event as its voice received it.
 *
 * The v2 runtime installs it only in a build made with `NEXT_PUBLIC_RENDER_BRIDGE=1`, which
 * `mix:report` makes for itself; a production build never sets the flag, so the branch and this
 * module are compiled out of it (`RENDER_BRIDGE_ID` is the string to grep an export for).
 */
import { type BandEvent, compileTimeline, type Lane } from '@band/index';
import { isPackLoaded } from '@engine/engine/instrument-registry';
import { ensurePackLoaded, getPackZones } from '@engine/engine/pack-runtime';
import type { SemanticScore } from '@engine/songbook/score-types';
import type { EnsembleState, InstrumentVoice, Mutable } from '@engine/types';
import { type BandRender, renderBandPasses } from './band-export';
import { bandEventLevel } from './band-host';

/** Names this bridge in a build, and its request contract's version. */
const RENDER_BRIDGE_ID = 'ensemble-band-render-bridge/1';

/**
 * The state modules that hold a band lane's sound: drums, bass, comp, lead. Allowlisted
 * because a request's pins come from external scene files (`--scenes-from`), and
 * `state['constructor']` is a truthy hit (the #1266 `TABLE[untrusted]` rule).
 */
const LANE_MODULES = ['groove', 'bass', 'chords', 'soloist'] as const;
type LaneModule = (typeof LANE_MODULES)[number];

function isLaneModule(module: string): module is LaneModule {
    return (LANE_MODULES as readonly string[]).includes(module);
}

export interface BandRenderRequest {
    score: SemanticScore;
    /** The passes to render back to back, each already filtered to the lanes wanted. */
    passes: BandEvent[][];
    bpm: number;
    sampleRate: number;
    /** The band's energy as the voices read it (`playback.bandIntensity`). */
    intensity: number;
    /** Which sound each lane plays (`'synth'` or `'pack:<id>'`), by state module. */
    voices: Array<{ module: string; voice: string }>;
    /** Zero every lane's reverb send (the dry leg of `--cohesion`'s wet/dry proxy). */
    muteReverb?: boolean;
    /** Seeds `Math.random` for the voices' own humanising, so a render repeats. */
    randomSeed: string;
}

/** One event as its voice received it: where, how long, and at what level. */
export interface DispatchedBandEvent {
    pass: number;
    lane: Lane;
    tick: number;
    bar: number;
    time: number;
    durationSeconds: number;
    midi: number | null;
    piece: string | null;
    velocity: number;
    /** The scalar handed to the voice (`bandEventLevel`). */
    level: number;
    /** The mute's gain on a palm-muted bass note; absent when the voice plays it open. */
    levelScale: number | null;
    muted: boolean;
    palm: boolean;
}

export interface BandRenderResult extends BandRender {
    dispatched: DispatchedBandEvent[];
}

interface RenderBridge {
    id: string;
    renderBand: (request: BandRenderRequest) => Promise<BandRenderResult>;
    loadPack: (packId: string) => Promise<{ zones: number; loaded: boolean }>;
}

declare global {
    interface Window {
        ensemble?: RenderBridge;
    }
}

/** FNV-1a over the seed text, the same hash the tools always keyed their renders on. */
function hashSeed(seed: string): number {
    let hash = 2166136261;
    for (const char of seed) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function mulberry32(seed: number): () => number {
    let t = seed >>> 0;
    return () => {
        t += 0x6d2b79f5;
        let x = Math.imul(t ^ (t >>> 15), 1 | t);
        x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
        return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
    };
}

/** Load a pack into the module-global cache the voices read, and say whether it arrived. */
async function loadPack(packId: string): Promise<{ zones: number; loaded: boolean }> {
    // A throwaway context: decoded buffers are shared across contexts through the cache.
    await ensurePackLoaded(new OfflineAudioContext(1, 44100, 44100), packId);
    const zones = getPackZones(packId)?.length ?? 0;
    // A pitched pack proves it loaded by its zones; a percussion pack (#662) builds none and
    // proves it by its registered buffers.
    return { zones, loaded: zones > 0 || isPackLoaded(packId) };
}

async function renderBand(request: BandRenderRequest): Promise<BandRenderResult> {
    const pins = request.voices.filter((pin) => isLaneModule(pin.module));
    for (const pin of pins) {
        if (!pin.voice.startsWith('pack:')) {
            continue;
        }
        const packId = pin.voice.slice(5);
        const { zones, loaded } = await loadPack(packId);
        // `ensurePackLoaded` swallows failure — right for the live app's graceful synth
        // fallback, wrong for an audit tool: a typo'd id would render the synth and stamp
        // evidence over the wrong claim. A pitched lane must show zones; a kit, its buffers.
        if (pin.module === 'groove' ? !loaded : zones === 0) {
            throw new Error(
                `pack "${packId}" for ${pin.module} did not load — refusing to render the synth fallback as pack evidence`,
            );
        }
    }

    const timeline = compileTimeline(request.score);
    const dispatched: DispatchedBandEvent[] = [];
    const prepare = (state: EnsembleState): void => {
        // The render's detached clone (`renderBandPasses`), never the live tree — the
        // "detached render clone" category of the `@direct-mutation` policy.
        const playback = state.playback as Mutable<EnsembleState['playback']>;
        playback.bpm = request.bpm;
        playback.bandIntensity = request.intensity;
        for (const pin of pins) {
            (state[pin.module as LaneModule] as { voice: InstrumentVoice }).voice =
                pin.voice as InstrumentVoice;
        }
        if (request.muteReverb) {
            for (const module of LANE_MODULES) {
                (state[module] as { reverb: number }).reverb = 0;
            }
        }
    };

    const random = Math.random;
    Math.random = mulberry32(hashSeed(request.randomSeed));
    try {
        const render = await renderBandPasses(request.passes, timeline, request.bpm, {
            sampleRate: request.sampleRate,
            prepare,
            onSchedule: ({ event, pass, time, durationSeconds }) => {
                const { level, levelScale } = bandEventLevel(event);
                dispatched.push({
                    pass,
                    lane: event.lane,
                    tick: event.tick,
                    bar: event.bar,
                    time,
                    durationSeconds,
                    midi: event.lane === 'drums' ? null : event.midi,
                    piece: event.lane === 'drums' ? event.piece : null,
                    velocity: event.velocity,
                    level,
                    levelScale: levelScale ?? null,
                    muted: event.lane !== 'drums' && event.muted === true,
                    palm: event.lane !== 'drums' && event.palm === true,
                });
            },
        });
        return { ...render, dispatched };
    } finally {
        Math.random = random;
    }
}

export function installRenderBridge(): void {
    if (typeof window === 'undefined') {
        return;
    }
    window.ensemble = { id: RENDER_BRIDGE_ID, renderBand, loadPack };
}
