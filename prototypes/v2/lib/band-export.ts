/**
 * WAV export for the band engine — the offline sibling of `band-host.ts`'s
 * live scheduling. A `performPass` output is a plain event stream in ticks; this walks the
 * same stream through `playBandEvent` (the one event→voice mapping both paths share) against
 * an `OfflineAudioContext`, so an exported mix or stem is exactly what the live band played.
 *
 * A detached state clone drives `initAudio` with an offline context, then `encodeWav` packs the
 * rendered buffer. The band already produced its events, so this only needs to schedule them.
 *
 * `renderBandPasses` is the one offline render of band events: the app's WAV and stem exports
 * below encode it, and the listening-gate tools (`render-bridge.ts`, `scripts/mix-report.ts`)
 * measure its raw channel data.
 */
import type { BandEvent, Lane, Timeline } from '@band/index';
import { secondsAt } from '@band/index';
import { initAudio } from '@engine/engine/engine';
import { encodeWav } from '@engine/engine/wav-encoder';
import { cloneStateForDetachedGeneration } from '@engine/export/detached-generation-state';
import { getState } from '@engine/state';
import type { EnsembleState } from '@engine/types';
import { legatoLeads, playBandEvent } from './band-host';

/** A hair of silence before the first note. */
const LEAD_IN_S = 0.25;
/** Tail after the last pass ends, for release and reverb decay. */
const RELEASE_TAIL_S = 2;

export interface AudioExportOptions {
    /** Sample rate for the render. Defaults to 44100. */
    sampleRate?: number;
    /** Filename hint for the resulting Blob (used by the UI for the download). */
    filename?: string;
}

export interface AudioExportResult {
    blob: Blob;
    durationSeconds: number;
    sampleRate: number;
    filename: string;
}

/** The stems a chart exports as, named by the app's lanes: one per band lane. */
export type StemInstrument = 'soloist' | 'bass' | 'chords' | 'drums';

export const STEM_INSTRUMENTS: StemInstrument[] = ['soloist', 'bass', 'chords', 'drums'];

/** The band lane each stem isolates. */
const STEM_LANE: Record<StemInstrument, Lane> = {
    drums: 'drums',
    bass: 'bass',
    chords: 'comp',
    soloist: 'lead',
};

export interface StemExportOptions extends AudioExportOptions {
    /** Called right before each stem starts rendering. */
    onStemProgress?: (progress: {
        instrument: StemInstrument;
        index: number;
        total: number;
    }) => void;
}

export interface StemExportResult extends AudioExportResult {
    instrument: StemInstrument;
}

/** A filename safe for any download: letters, digits, spaces, `-_()`, at most 64 characters. */
export function sanitizeFilename(input: string): string {
    const cleaned = input
        .replace(/[^a-zA-Z0-9\s\-_()]/g, '')
        .substring(0, 64)
        .trim();
    return cleaned || 'ensemble-export';
}

/** Triggers a browser download for an export result, and returns it. */
export function downloadExportResult(result: AudioExportResult): AudioExportResult {
    const url = URL.createObjectURL(result.blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = result.filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    // Defer revoke so Chromium gets a chance to start the download.
    setTimeout(() => URL.revokeObjectURL(url), 1500);
    return result;
}

/** The state module that holds each band lane's bus and sound. */
const LANE_MODULE = {
    drums: 'groove',
    bass: 'bass',
    comp: 'chords',
    lead: 'soloist',
} as const satisfies Record<Lane, keyof EnsembleState>;

/** One event as it was handed to its voice: the render-absolute time and written length. */
export interface ScheduledBandEvent {
    event: BandEvent;
    /** Which of the rendered passes it belongs to. */
    pass: number;
    time: number;
    durationSeconds: number;
}

export interface BandRenderOptions {
    sampleRate: number;
    /**
     * Edits the render's detached state clone before its audio graph is built — which sound
     * each lane plays, reverb sends, the level the voices read. Never the live state tree.
     */
    prepare?: (state: EnsembleState) => void;
    /** Called once per event, with the time and length its voice is played with. */
    onSchedule?: (scheduled: ScheduledBandEvent) => void;
}

export interface BandRender {
    /** One Float32Array per channel, copied out of the rendered buffer. */
    channels: Float32Array[];
    sampleRate: number;
    durationSeconds: number;
    leadInSeconds: number;
    /** The length of one pass at this tempo, fermatas included. */
    passSeconds: number;
}

/**
 * Renders passes of the band offline, back to back, each starting where the one before ended —
 * the same arithmetic the live host uses to queue its segments. One pass is the app's export; the
 * listening-gate tools render several (a chorus each, `render-bridge.ts`). Every event goes
 * through `playBandEvent`, the voice mapping `BandHost` schedules live with, feel offsets
 * included.
 *
 * Everything before `startRendering` is synchronous, so a caller that seeds `Math.random`
 * around this call seeds exactly the draws the voices make while scheduling.
 */
export async function renderBandPasses(
    passes: BandEvent[][],
    timeline: Timeline,
    bpm: number,
    options: BandRenderOptions,
): Promise<BandRender> {
    const { sampleRate } = options;
    // A throwaway clone, never the live state tree. Nothing here dispatches or touches the live
    // band or audio graph.
    const state = cloneStateForDetachedGeneration(getState());
    // A lane with events in this render is heard. `initAudio` holds a lane's bus at silence
    // (0.0001) while its state is disabled, which is right live and wrong here: a stem renders
    // its lane even when that lane is off live (`renderBandStemsToWav`), and without this the
    // lead's stem — off by default — rendered at −80 dB. A mix loses nothing: a lane that is off
    // live has no events in its pass. Writes the detached clone only.
    const heard = new Set(passes.flat().map((event) => LANE_MODULE[event.lane]));
    for (const module of heard) {
        (state[module] as { enabled: boolean }).enabled = true;
    }
    options.prepare?.(state);

    // The pass length in seconds, honouring fermata stretches (`secondsAt`); the render is every
    // pass plus a release tail, computed once so every event schedules against it.
    const passSeconds = secondsAt(timeline, timeline.ticks, bpm);
    const renderSeconds = LEAD_IN_S + passSeconds * passes.length + RELEASE_TAIL_S;
    const frameCount = Math.ceil(renderSeconds * sampleRate);
    const offlineCtx = new OfflineAudioContext(2, frameCount, sampleRate);
    // Same offline-context branch `initAudio` already takes for the old engine's export path.
    initAudio(state, {
        audioContext: offlineCtx as unknown as AudioContext,
        enableWatchdog: false,
    });

    passes.forEach((events, pass) => {
        const passStart = LEAD_IN_S + pass * passSeconds;
        // Comp chord sizes by tick, for the voice's per-note gain — same map `BandHost` keeps
        // per segment, rebuilt here from the (possibly lane-filtered) events being rendered.
        const chordSizes = new Map<number, number>();
        for (const event of events) {
            if (event.lane === 'comp') {
                chordSizes.set(event.tick, (chordSizes.get(event.tick) ?? 0) + 1);
            }
        }
        const legato = legatoLeads(events);
        for (const event of events) {
            // The feel layer's micro-timing (lean, character, the strum roll) rides on
            // `offsetMs`, exactly as the live host schedules it — without it a render is
            // quantized.
            const time = Math.max(
                0,
                passStart + secondsAt(timeline, event.tick, bpm) + event.offsetMs / 1000,
            );
            const durationSeconds =
                event.lane === 'drums'
                    ? 0
                    : secondsAt(timeline, event.tick + event.dur, bpm) -
                      secondsAt(timeline, event.tick, bpm);
            options.onSchedule?.({ event, pass, time, durationSeconds });
            playBandEvent(
                state,
                event,
                time,
                durationSeconds,
                chordSizes.get(event.tick) ?? 1,
                legato.has(event),
            );
        }
    });

    const rendered = await offlineCtx.startRendering();
    const channels: Float32Array[] = [];
    for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
        // .slice() copies — without it the underlying buffer is shared with the AudioBuffer
        // and may be reclaimed by the context's GC.
        channels.push(rendered.getChannelData(ch).slice());
    }
    return {
        channels,
        sampleRate: rendered.sampleRate,
        durationSeconds: rendered.duration,
        leadInSeconds: LEAD_IN_S,
        passSeconds,
    };
}

/** Renders one pass's events to a WAV: the shared core for the mix and per-stem exports below,
 * which differ only in which events they hand it (all of them, or one lane's). */
async function renderBandEventsToWav(
    events: BandEvent[],
    timeline: Timeline,
    bpm: number,
    filename: string,
    sampleRate: number,
): Promise<AudioExportResult> {
    const render = await renderBandPasses([events], timeline, bpm, { sampleRate });
    const wav = encodeWav(render.channels, render.sampleRate);
    return {
        blob: new Blob([wav], { type: 'audio/wav' }),
        durationSeconds: render.durationSeconds,
        sampleRate: render.sampleRate,
        filename: `${filename}.wav`,
    };
}

/** A download-ready mix of one rendered pass. `events`/`timeline` come from
 * `BandHost.render(settings)`. */
export async function renderBandMixToWav(
    events: BandEvent[],
    timeline: Timeline,
    bpm: number,
    opts: AudioExportOptions = {},
): Promise<AudioExportResult> {
    const sampleRate = opts.sampleRate ?? 44100;
    const filename = sanitizeFilename(opts.filename ?? 'ensemble-export');
    return renderBandEventsToWav(events, timeline, bpm, filename, sampleRate);
}

/**
 * One WAV per requested lane, each rendered from `events` with every other lane's notes
 * filtered out. Unlike the mix, a stem always renders its lane's instrument even if that lane
 * is muted live — callers pass an `events` pass generated with every lane forced on (lane
 * muting is a settings input, so one such pass serves every stem).
 */
export async function renderBandStemsToWav(
    events: BandEvent[],
    timeline: Timeline,
    bpm: number,
    instruments: StemInstrument[],
    opts: StemExportOptions = {},
): Promise<StemExportResult[]> {
    const sampleRate = opts.sampleRate ?? 44100;
    const baseFilename = sanitizeFilename(opts.filename ?? 'ensemble-export');
    const total = instruments.length;
    const results: StemExportResult[] = [];

    for (let index = 0; index < total; index++) {
        const instrument = instruments[index];
        opts.onStemProgress?.({ instrument, index, total });
        const lane = STEM_LANE[instrument];
        const filename = `${baseFilename}-stem-${instrument}`;
        const result = await renderBandEventsToWav(
            events.filter((event) => event.lane === lane),
            timeline,
            bpm,
            filename,
            sampleRate,
        );
        results.push({ ...result, instrument });
    }

    return results;
}
