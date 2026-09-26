/**
 * WAV export for the band engine — the offline sibling of `band-host.ts`'s
 * live scheduling. A `performPass` output is a plain event stream in ticks; this walks the
 * same stream through `playBandEvent` (the one event→voice mapping both paths share) against
 * an `OfflineAudioContext`, so an exported mix or stem is exactly what the live band played.
 *
 * Mirrors `public/export/audio-export.ts`'s mechanics for the old engine — a detached state
 * clone driving `initAudio` with an offline context, then `encodeWav` on the rendered buffer —
 * but skips its step-by-step generation entirely: the band engine already produced its events,
 * so this only needs to schedule them.
 *
 * `renderBandPasses` is the one offline render of band events: the app's WAV and stem exports
 * below encode it, and the listening-gate tools (`render-bridge.ts`, `scripts/mix-report.ts`)
 * measure its raw channel data.
 */
import type { BandEvent, Lane, Timeline } from '@band/index';
import { secondsAt } from '@band/index';
import { initAudio } from '@engine/engine/engine';
import { encodeWav } from '@engine/engine/wav-encoder';
import {
    type AudioExportOptions,
    type AudioExportResult,
    type StemExportOptions,
    type StemExportResult,
    type StemInstrument,
    sanitizeFilename,
} from '@engine/export/audio-export';
import { cloneStateForDetachedGeneration } from '@engine/export/detached-generation-state';
import { getState } from '@engine/state';
import type { EnsembleState } from '@engine/types';
import { legatoLeads, playBandEvent } from './band-host';

/** Matches `audio-export.ts`'s `leadIn` — a hair of silence before the first note. */
const LEAD_IN_S = 0.25;
/** Tail after the last pass ends for release/reverb decay, matching `audio-export.ts`'s own `+2`. */
const RELEASE_TAIL_S = 2;

/** The band's lanes a stem export can isolate; `StemInstrument`'s `harmony` has no band lane
 * (harmony is not a band role — docs/design/band-engine.md). */
const STEM_LANE: Partial<Record<StemInstrument, Lane>> = {
    drums: 'drums',
    bass: 'bass',
    chords: 'comp',
    soloist: 'lead',
};

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
    // A throwaway clone, never the live state tree — same discipline as `audio-export.ts`'s
    // `cloneStateForRender`. Nothing here dispatches or touches the live scheduler/audio graph.
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
        // and may be reclaimed by the context's GC (same note as `audio-export.ts`).
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

/** Downloads-ready mix of one rendered pass — the next-mode sibling of
 * `renderCurrentSessionToWav`. `events`/`timeline` come from `BandHost.render(settings)`. */
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
 * is muted live — callers pass an `events` pass generated with every lane forced on
 * (`renderCurrentSessionToWav`'s sibling contract in `audio-export.ts`'s `renderStemsToWav`,
 * which re-clones state per stem with the target lane forced on instead; the band engine
 * needs only one such pass since lane muting is a settings input, not a state mutation).
 * `harmony` is silently dropped — the band engine has no such lane to render.
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
    const bandInstruments = instruments.filter((instrument) => STEM_LANE[instrument]);
    const total = bandInstruments.length;
    const results: StemExportResult[] = [];

    for (let index = 0; index < total; index++) {
        const instrument = bandInstruments[index];
        opts.onStemProgress?.({ instrument, index, total });
        const lane = STEM_LANE[instrument]!;
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
