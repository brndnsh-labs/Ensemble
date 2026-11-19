// A Standard MIDI File writer, type 1. It knows the file format and nothing
// about music: callers hand it tracks of timed notes and meta events.

export interface SmfNote {
  readonly tick: number;
  readonly duration: number;
  /** MIDI note number, 0 to 127. */
  readonly pitch: number;
  /** 1 to 127. */
  readonly velocity: number;
}

export type SmfMeta =
  | { readonly tick: number; readonly type: "tempo"; readonly bpm: number }
  | {
      readonly tick: number;
      readonly type: "timeSignature";
      readonly beats: number;
      readonly unit: number;
      /** MIDI clocks (24 to a quarter note) between metronome clicks. Left out: a quarter note. */
      readonly click?: number;
    }
  | { readonly tick: number; readonly type: "marker" | "text"; readonly text: string };

export interface SmfTrack {
  readonly name: string;
  /** 0 to 15. General MIDI drums are channel 9 (shown as "10" in most software). */
  readonly channel: number;
  /** General MIDI program number, 0 to 127. Omit for drums. */
  readonly program?: number;
  readonly notes: readonly SmfNote[];
  /**
   * Where the channel's pitch is bent, in semitones either way (twelve at
   * most). A track with any sets its bend range to an octave first.
   */
  readonly bends?: readonly { readonly tick: number; readonly semitones: number }[];
  /** Controller changes on the channel: a controller's number and its value, 0 to 127. */
  readonly controls?: readonly {
    readonly tick: number;
    readonly number: number;
    readonly value: number;
  }[];
}

export interface SmfFile {
  readonly ppq: number;
  /** Tempo, time signature, markers, and text. Written as the first track. */
  readonly conductor: readonly SmfMeta[];
  readonly tracks: readonly SmfTrack[];
}

export function writeSmf(file: SmfFile): Uint8Array {
  const chunks = [
    conductorTrack(file.conductor),
    ...file.tracks.map((track) => instrumentTrack(track)),
  ];
  const header = [...ascii("MThd"), ...u32(6), ...u16(1), ...u16(chunks.length), ...u16(file.ppq)];
  return Uint8Array.from([...header, ...chunks.flat()]);
}

interface Timed {
  readonly tick: number;
  /** Ties at the same tick are written in this order: note-offs, then meta, then note-ons. */
  readonly order: number;
  readonly bytes: readonly number[];
}

function conductorTrack(events: readonly SmfMeta[]): number[] {
  const timed: Timed[] = events.map((event) => ({
    tick: Math.max(0, Math.round(event.tick)),
    order: 1,
    bytes: metaBytes(event),
  }));
  return trackChunk([{ tick: 0, order: 0, bytes: meta(0x03, utf8("Ensemble")) }, ...timed]);
}

/** Semitones a full pitch bend moves a channel, either way. */
const BEND_RANGE = 12;

function instrumentTrack(track: SmfTrack): number[] {
  const timed: Timed[] = [{ tick: 0, order: 0, bytes: meta(0x03, utf8(track.name)) }];
  if (track.program !== undefined) {
    timed.push({ tick: 0, order: 1, bytes: [0xc0 | track.channel, track.program & 0x7f] });
  }
  if (track.bends && track.bends.length > 0) {
    // Registered parameter 0, the bend range: twelve semitones, so a slide of several frets fits.
    const control = (number: number, value: number) => [0xb0 | track.channel, number, value];
    for (const [number, value] of [
      [101, 0],
      [100, 0],
      [6, BEND_RANGE],
      [38, 0],
    ] as const) {
      timed.push({ tick: 0, order: 1, bytes: control(number, value) });
    }
    for (const bend of track.bends) {
      const value = clamp(8192 + Math.round((bend.semitones / BEND_RANGE) * 8191), 0, 16383);
      timed.push({
        tick: Math.max(0, Math.round(bend.tick)),
        order: 1,
        bytes: [0xe0 | track.channel, value & 0x7f, value >> 7],
      });
    }
  }
  for (const change of track.controls ?? []) {
    timed.push({
      tick: Math.max(0, Math.round(change.tick)),
      order: 1,
      bytes: [0xb0 | track.channel, change.number & 0x7f, clamp(Math.round(change.value), 0, 127)],
    });
  }
  for (const note of withoutSelfOverlap(track.notes)) {
    const pitch = clamp(note.pitch, 0, 127);
    timed.push({
      tick: note.tick,
      order: 2,
      bytes: [0x90 | track.channel, pitch, clamp(note.velocity, 1, 127)],
    });
    timed.push({
      tick: note.tick + note.duration,
      order: 0,
      bytes: [0x80 | track.channel, pitch, 0],
    });
  }
  return trackChunk(timed);
}

/**
 * Clean notes for one channel: whole ticks, nothing before zero, at least one
 * tick long, and a note cut short where the same pitch is struck again before
 * it ends (one channel cannot hold a pitch twice).
 */
function withoutSelfOverlap(notes: readonly SmfNote[]): SmfNote[] {
  const sorted = notes
    .map((note) => {
      const tick = Math.max(0, Math.round(note.tick));
      const end = Math.max(tick + 1, Math.round(note.tick + note.duration));
      return { ...note, tick, duration: end - tick };
    })
    .sort((a, b) => a.tick - b.tick || a.pitch - b.pitch);
  const lastByPitch = new Map<number, number>();
  const result: SmfNote[] = [];
  for (const note of sorted) {
    const previousIndex = lastByPitch.get(note.pitch);
    if (previousIndex !== undefined) {
      const previous = result[previousIndex]!;
      if (previous.tick === note.tick) continue;
      if (previous.tick + previous.duration > note.tick) {
        result[previousIndex] = { ...previous, duration: note.tick - previous.tick };
      }
    }
    lastByPitch.set(note.pitch, result.length);
    result.push(note);
  }
  return result;
}

function trackChunk(events: readonly Timed[]): number[] {
  const sorted = events
    .map((event, index) => ({ event, index }))
    .sort(
      (a, b) => a.event.tick - b.event.tick || a.event.order - b.event.order || a.index - b.index,
    );
  const body: number[] = [];
  let now = 0;
  for (const { event } of sorted) {
    body.push(...variableLength(event.tick - now), ...event.bytes);
    now = event.tick;
  }
  body.push(0x00, 0xff, 0x2f, 0x00);
  return [...ascii("MTrk"), ...u32(body.length), ...body];
}

function metaBytes(event: SmfMeta): number[] {
  switch (event.type) {
    case "tempo": {
      const microsPerQuarter = Math.round(60_000_000 / event.bpm);
      return meta(0x51, [
        (microsPerQuarter >> 16) & 0xff,
        (microsPerQuarter >> 8) & 0xff,
        microsPerQuarter & 0xff,
      ]);
    }
    case "timeSignature":
      // Numerator, denominator as a power of two, MIDI clocks per click, 32nds per quarter.
      return meta(0x58, [event.beats, Math.round(Math.log2(event.unit)), event.click ?? 24, 8]);
    case "marker":
      return meta(0x06, utf8(event.text));
    case "text":
      return meta(0x01, utf8(event.text));
  }
}

function meta(type: number, data: readonly number[]): number[] {
  return [0xff, type, ...variableLength(data.length), ...data];
}

function variableLength(value: number): number[] {
  const bytes = [value & 0x7f];
  let rest = value >>> 7;
  while (rest > 0) {
    bytes.unshift((rest & 0x7f) | 0x80);
    rest >>>= 7;
  }
  return bytes;
}

function utf8(text: string): number[] {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (code < 0x80) bytes.push(code);
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000)
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
  }
  return bytes;
}

const ascii = (text: string): number[] => [...text].map((c) => c.charCodeAt(0));
const u16 = (n: number): number[] => [(n >> 8) & 0xff, n & 0xff];
const u32 = (n: number): number[] => [
  (n >>> 24) & 0xff,
  (n >>> 16) & 0xff,
  (n >>> 8) & 0xff,
  n & 0xff,
];
const clamp = (n: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, Math.round(n)));
