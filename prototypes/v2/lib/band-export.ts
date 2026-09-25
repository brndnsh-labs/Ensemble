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
import { legatoLeads, playBandEvent } from './band-host';

/** Matches `audio-export.ts`'s `leadIn` — a hair of silence before the first note. */
const LEAD_IN_S = 0.25;
/** Tail after the pass ends for release/reverb decay, matching `audio-export.ts`'s own `+2`. */
const RELEASE_TAIL_S = 2;

/** The band's lanes a stem export can isolate; `StemInstrument`'s `harmony` has no band lane
 * (harmony is not a band role — docs/design/band-engine.md). */
const STEM_LANE: Partial<Record<StemInstrument, Lane>> = {
    drums: 'drums',
    bass: 'bass',
    chords: 'comp',
    soloist: 'lead',
};

/**
 * Renders one pass's events to a WAV. Shared core for the mix and per-stem renders below —
 * they differ only in which events they hand it (all of them, or one lane's).
 */
async function renderBandEventsToWav(
    events: BandEvent[],
    timeline: Timeline,
    bpm: number,
    filename: string,
    sampleRate: number,
): Promise<AudioExportResult> {
    // A throwaway clone, never the live state tree — same discipline as `audio-export.ts`'s
    // `cloneStateForRender`. Nothing here dispatches or touches the live scheduler/audio graph.
    const state = cloneStateForDetachedGeneration(getState());

    // The pass end in seconds, honouring fermata stretches (`secondsAt`), plus a release tail —
    // this is the WAV's whole length, computed once so every event schedules against it.
    const renderSeconds = LEAD_IN_S + secondsAt(timeline, timeline.ticks, bpm) + RELEASE_TAIL_S;
    const frameCount = Math.ceil(renderSeconds * sampleRate);
    const offlineCtx = new OfflineAudioContext(2, frameCount, sampleRate);
    // Same offline-context branch `initAudio` already takes for the old engine's export path.
    initAudio(state, {
        audioContext: offlineCtx as unknown as AudioContext,
        enableWatchdog: false,
    });

    // Comp chord sizes by tick, for the voice's per-note gain — same map `BandHost` keeps per
    // segment, rebuilt here from the (possibly lane-filtered) event list being rendered.
    const chordSizes = new Map<number, number>();
    for (const event of events) {
        if (event.lane === 'comp') {
            chordSizes.set(event.tick, (chordSizes.get(event.tick) ?? 0) + 1);
        }
    }
    const legato = legatoLeads(events);
    for (const event of events) {
        // The feel layer's micro-timing (lean, character, the strum roll) rides on
        // `offsetMs`, exactly as the live host schedules it — without it an export is quantized.
        const time = Math.max(
            0,
            LEAD_IN_S + secondsAt(timeline, event.tick, bpm) + event.offsetMs / 1000,
        );
        const durationSeconds =
            event.lane === 'drums'
                ? 0
                : secondsAt(timeline, event.tick + event.dur, bpm) -
                  secondsAt(timeline, event.tick, bpm);
        playBandEvent(
            state,
            event,
            time,
            durationSeconds,
            chordSizes.get(event.tick) ?? 1,
            legato.has(event),
        );
    }

    const rendered = await offlineCtx.startRendering();
    const channels: Float32Array[] = [];
    for (let ch = 0; ch < rendered.numberOfChannels; ch++) {
        // .slice() copies — without it the underlying buffer is shared with the AudioBuffer
        // and may be reclaimed by the context's GC (same note as `audio-export.ts`).
        channels.push(rendered.getChannelData(ch).slice());
    }
    const wav = encodeWav(channels, rendered.sampleRate);
    return {
        blob: new Blob([wav], { type: 'audio/wav' }),
        durationSeconds: rendered.duration,
        sampleRate: rendered.sampleRate,
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
