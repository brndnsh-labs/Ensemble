/**
 * BandEvent[] → Standard MIDI File (type 1). The same events the live host plays, so a
 * `.mid` is a faithful record of the performance, not a re-interpretation of it.
 * Micro-timing (lean + character) is baked into tick positions at the given tempo; bar
 * meters and fermata stretches are written as meta events so a DAW's grid lines up.
 */
import {
    type BandEvent,
    type CompInstrument,
    type DrumPiece,
    type LeadInstrument,
    PPQ,
} from '../core/types.js';
import type { Timeline } from '../form/timeline.js';
import { COMP_INSTRUMENTS } from '../players/comp/instruments.js';
import { LEAD_INSTRUMENTS } from '../players/lead/instruments.js';

/** General MIDI percussion keys. */
const GM_DRUMS: Record<DrumPiece, number> = {
    kick: 36,
    snare: 38,
    ghost: 38,
    rim: 37,
    hat: 42,
    hatOpen: 46,
    hatPedal: 44,
    ride: 51,
    rideBell: 53,
    crash: 49,
    tomHigh: 50,
    tomMid: 47,
    tomLow: 43,
    shaker: 70,
};
const DRUM_LENGTH = PPQ / 8;

function vlq(n: number): number[] {
    const bytes = [n & 0x7f];
    let v = n >> 7;
    while (v > 0) {
        bytes.unshift((v & 0x7f) | 0x80);
        v >>= 7;
    }
    return bytes;
}

interface Timed {
    tick: number;
    order: number;
    data: number[];
}

function track(events: Timed[]): number[] {
    events.sort((a, b) => a.tick - b.tick || a.order - b.order);
    const body: number[] = [];
    let now = 0;
    for (const e of events) {
        const tick = Math.max(now, Math.round(e.tick));
        body.push(...vlq(tick - now), ...e.data);
        now = tick;
    }
    body.push(0, 0xff, 0x2f, 0);
    const len = body.length;
    return [
        0x4d,
        0x54,
        0x72,
        0x6b,
        (len >>> 24) & 255,
        (len >>> 16) & 255,
        (len >>> 8) & 255,
        len & 255,
        ...body,
    ];
}

function text(type: number, value: string): number[] {
    const bytes = [...new TextEncoder().encode(value)];
    return [0xff, type, ...vlq(bytes.length), ...bytes];
}

export interface MidiOptions {
    bpm: number;
    title?: string;
    /** The comp lane's instrument, for its General MIDI program. */
    comp?: CompInstrument;
    /** The lead's instrument, for its General MIDI program. */
    lead?: LeadInstrument;
}

export function toMidi(
    events: BandEvent[],
    timeline: Timeline,
    { bpm, title = 'Ensemble', comp = 'piano', lead = 'sax' }: MidiOptions,
): Uint8Array<ArrayBuffer> {
    const msToTicks = (ms: number) => (ms / 1000) * (bpm / 60) * PPQ;
    // Conductor track: tempo, meters, stretches.
    const conductor: Timed[] = [{ tick: 0, order: 0, data: text(0x03, title) }];
    const tempo = (tick: number, factor: number) => {
        const micros = Math.round((60_000_000 / bpm) * factor);
        conductor.push({
            tick,
            order: 1,
            data: [0xff, 0x51, 3, (micros >> 16) & 255, (micros >> 8) & 255, micros & 255],
        });
    };
    tempo(0, 1);
    for (const s of timeline.stretches) {
        tempo(s.start, s.factor);
        tempo(s.end, 1);
    }
    let meter = '';
    for (const bar of timeline.bars) {
        if (bar.meter.name !== meter) {
            meter = bar.meter.name;
            conductor.push({
                tick: bar.start,
                order: 2,
                data: [0xff, 0x58, 4, bar.meter.counts, Math.log2(bar.meter.unit), 24, 8],
            });
        }
    }
    const lanes: Partial<
        Record<BandEvent['lane'], { channel: number; program: number; name: string; out: Timed[] }>
    > = {
        drums: { channel: 9, program: 0, name: 'Drums', out: [] },
        bass: { channel: 0, program: 33, name: 'Bass', out: [] },
        comp: { channel: 1, program: COMP_INSTRUMENTS[comp].program, name: 'Comp', out: [] },
    };
    // A lead track only when the lead played: a band-only file keeps its three tracks.
    if (events.some((e) => e.lane === 'lead')) {
        lanes.lead = { channel: 2, program: LEAD_INSTRUMENTS[lead].program, name: 'Lead', out: [] };
    }
    for (const lane of Object.values(lanes)) {
        if (!lane) {
            continue;
        }
        lane.out.push({ tick: 0, order: 0, data: text(0x03, lane.name) });
        if (lane.channel !== 9) {
            lane.out.push({ tick: 0, order: 0, data: [0xc0 | lane.channel, lane.program] });
        }
    }
    // Onsets first (with micro-timing baked in), so each note can end no later than the next
    // strike of the same pitch in its lane — humanize can pull a re-strike ahead of the
    // written end, and a late note-off would otherwise cut the new note short.
    const notes = events
        .map((e) => ({
            e,
            start: Math.max(0, e.tick + msToTicks(e.offsetMs)),
            note: e.lane === 'drums' ? GM_DRUMS[e.piece] : e.midi,
        }))
        .sort((a, b) => a.start - b.start);
    const nextStrike = new Map<string, number>();
    const ends: number[] = [];
    for (let i = notes.length - 1; i >= 0; i--) {
        const { e, start, note } = notes[i];
        const key = `${e.lane}:${note}`;
        const length = e.lane === 'drums' ? DRUM_LENGTH : Math.max(1, e.dur);
        ends[i] = Math.max(start + 1, Math.min(start + length, nextStrike.get(key) ?? Infinity));
        nextStrike.set(key, start);
    }
    notes.forEach(({ e, start, note }, i) => {
        const lane = lanes[e.lane];
        if (!lane) {
            return;
        }
        lane.out.push({ tick: start, order: 2, data: [0x90 | lane.channel, note, e.velocity] });
        // Note-offs sort before note-ons at the same tick, so a re-strike is never swallowed.
        lane.out.push({ tick: ends[i], order: 1, data: [0x80 | lane.channel, note, 0] });
    });
    const chunks = [
        header(Object.keys(lanes).length + 1),
        track(conductor),
        ...Object.values(lanes).map((l) => track(l?.out ?? [])),
    ];
    const out = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.length;
    }
    return out;
}

function header(tracks: number): number[] {
    return [0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 1, 0, tracks, (PPQ >> 8) & 255, PPQ & 255];
}
