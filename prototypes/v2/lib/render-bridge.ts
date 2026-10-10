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
import { type BandEvent, type BandSettings, compileTimeline, type Lane } from '@band/index';
import { isPackLoaded } from '@engine/engine/instrument-registry';
import { ensurePackLoaded, getPackZones } from '@engine/engine/pack-runtime';
import type { SemanticScore } from '@engine/songbook/score-types';
import type { AudioGraph, EnsembleState, InstrumentVoice, Mutable } from '@engine/types';
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

/** What the runtime lends the bridge so a tool can drive the LIVE transport (#1562). */
export interface BridgeLive {
    /** Bring the audio graph up without playing (`warmAudio`), so a capture can start first. */
    prime: () => void;
    /** Start the stand playing the open chart; resolves once the band is scheduled. */
    play: () => Promise<void>;
    stop: () => void;
    /** The live context and graph, or nulls before audio is up. */
    audio: () => { audio: AudioContext | null; graph: AudioGraph | null };
    /** The sound each lane plays on the stand right now, so an offline comparison can match it. */
    voices: () => Array<{ module: string; voice: string }>;
    /** The band settings the stand plays with right now, to compare against a scene's. */
    settings: () => BandSettings;
    /** Whether a fresh Play counts a bar in first (`playback.countIn`), which shifts the music. */
    countIn: () => boolean;
}

/** One marker on the live audio clock, and where it lands in the captured samples. */
export interface CaptureMarker {
    label: string;
    time: number;
    sample: number;
}

export interface CaptureResult {
    /** One base64 string of little-endian float32 per channel: compact to hand to node. */
    channels: string[];
    sampleRate: number;
    /** The audio-clock time captured sample 0 was rendered at. */
    anchorTime: number;
    markers: CaptureMarker[];
    /** Blocks whose `playbackTime` did not follow the one before: the main thread stalled and the
     * capture has a seam there, so its timeline is not contiguous. */
    dropouts: number;
}

export interface LiveCapture {
    /** Attach a tap to the master limiter's output. Needs the graph up (`prime` or `play`). */
    start: () => { sampleRate: number };
    /** Note the audio clock now under `label`; returns the time. */
    mark: (label: string) => number;
    /** Detach the tap and hand back everything captured since `start`. */
    stop: () => CaptureResult;
}

interface RenderBridge {
    id: string;
    renderBand: (request: BandRenderRequest) => Promise<BandRenderResult>;
    loadPack: (packId: string) => Promise<{ zones: number; loaded: boolean }>;
    /** Present when the runtime lent its transport (#1562). */
    transport?: Pick<BridgeLive, 'prime' | 'play' | 'stop' | 'voices' | 'settings' | 'countIn'>;
    capture?: LiveCapture;
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
export async function loadPack(packId: string): Promise<{ zones: number; loaded: boolean }> {
    // A throwaway context: decoded buffers are shared across contexts through the cache.
    await ensurePackLoaded(new OfflineAudioContext(1, 44100, 44100), packId);
    const zones = getPackZones(packId)?.length ?? 0;
    // A pitched pack proves it loaded by its zones; a percussion pack (#662) builds none and
    // proves it by its registered buffers.
    return { zones, loaded: zones > 0 || isPackLoaded(packId) };
}

export async function renderBand(request: BandRenderRequest): Promise<BandRenderResult> {
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

/**
 * A tap on the live master bus (#1562): a `ScriptProcessorNode` fed by the master limiter —
 * the node that feeds `destination` — copying every input block, with the audio clock of the
 * first block as the anchor so a marker taken from `currentTime` maps onto a sample index. The
 * processor's output stays silent, so the tap adds nothing to what is heard. ScriptProcessor is
 * deprecated but runs in every engine the suite drives (Chromium and WebKit), which an
 * AudioWorklet module would need a served file for.
 */
function createCapture(live: BridgeLive): LiveCapture {
    const BUFFER_SIZE = 4096;
    let processor: ScriptProcessorNode | null = null;
    let audio: AudioContext | null = null;
    let chunks: Float32Array[][] = [];
    let anchorTime: number | null = null;
    let lastPlaybackTime: number | null = null;
    let dropouts = 0;
    let markers: Array<{ label: string; time: number }> = [];

    const encode = (samples: Float32Array): string => {
        const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
        let binary = '';
        for (let i = 0; i < bytes.length; i += 0x8000) {
            binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
        }
        return btoa(binary);
    };

    return {
        start() {
            const current = live.audio();
            if (!current.audio || !current.graph) {
                throw new Error('capture.start: audio is not up — prime() or play() first');
            }
            audio = current.audio;
            markers = [];
            chunks = [[], []];
            anchorTime = null;
            lastPlaybackTime = null;
            dropouts = 0;
            processor = audio.createScriptProcessor(BUFFER_SIZE, 2, 2);
            const blockSeconds = BUFFER_SIZE / audio.sampleRate;
            processor.onaudioprocess = (event) => {
                // `playbackTime` is when this call's OUTPUT plays; the INPUT block it hands over
                // was rendered two buffers earlier (the processor double-buffers). Measured on
                // the stand: the count-in's first click, scheduled 100 ms after Play, landed
                // 287 ms after the marker with the raw time and 76 ms with this correction.
                anchorTime ??= event.playbackTime - 2 * blockSeconds;
                if (
                    lastPlaybackTime !== null &&
                    Math.abs(event.playbackTime - lastPlaybackTime - blockSeconds) >
                        blockSeconds / 2
                ) {
                    dropouts++;
                }
                lastPlaybackTime = event.playbackTime;
                for (let channel = 0; channel < 2; channel++) {
                    chunks[channel].push(
                        new Float32Array(event.inputBuffer.getChannelData(channel)),
                    );
                }
            };
            current.graph.master.limiter.connect(processor);
            processor.connect(audio.destination);
            return { sampleRate: audio.sampleRate };
        },
        mark(label) {
            if (!audio) {
                throw new Error('capture.mark: no capture running');
            }
            const time = audio.currentTime;
            markers.push({ label, time });
            return time;
        },
        stop() {
            if (!audio || !processor) {
                throw new Error('capture.stop: no capture running');
            }
            processor.disconnect();
            live.audio().graph?.master.limiter.disconnect(processor);
            processor.onaudioprocess = null;
            const sampleRate = audio.sampleRate;
            const anchor = anchorTime ?? audio.currentTime;
            const channels = chunks.map((blocks) => {
                const total = blocks.reduce((sum, block) => sum + block.length, 0);
                const joined = new Float32Array(total);
                let offset = 0;
                for (const block of blocks) {
                    joined.set(block, offset);
                    offset += block.length;
                }
                return encode(joined);
            });
            const result: CaptureResult = {
                channels,
                sampleRate,
                anchorTime: anchor,
                markers: markers.map((marker) => ({
                    ...marker,
                    sample: Math.round((marker.time - anchor) * sampleRate),
                })),
                dropouts,
            };
            processor = null;
            audio = null;
            return result;
        },
    };
}

export function installRenderBridge(live?: BridgeLive): void {
    if (typeof window === 'undefined') {
        return;
    }
    window.ensemble = {
        id: RENDER_BRIDGE_ID,
        renderBand,
        loadPack,
        ...(live
            ? {
                  transport: {
                      prime: live.prime,
                      play: live.play,
                      stop: live.stop,
                      voices: live.voices,
                      settings: live.settings,
                      countIn: live.countIn,
                  },
                  capture: createCapture(live),
              }
            : {}),
    };
}
