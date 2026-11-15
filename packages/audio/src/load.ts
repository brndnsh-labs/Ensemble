// Loading a pack: its `pack.json`, then every recording decoded into memory.

import type { Pack, PackLayer, PackVoice } from "./pack.ts";
import { PACK_FORMAT } from "./pack.ts";

/** A recording ready to play. */
export interface Recording {
  readonly buffer: AudioBuffer;
  /**
   * Seconds from the start of the buffer to the hit: the moment the sound
   * arrives, which is what a player puts on the beat. A stick on a ride is
   * there at once; a hi-hat closed with the foot hisses for a fortieth of a
   * second before its "chick", and a soft saxophone note takes as long to
   * speak. It is found in the decoded audio, so whatever lead-in a browser's
   * decoder leaves at the front of a file is counted too.
   */
  readonly hit: number;
}

export interface LoadedPack {
  readonly pack: Pack;
  /** By file name. Holds only the files of the layers that were loaded. */
  readonly recordings: ReadonlyMap<string, Recording>;
}

export interface LoadOptions {
  /**
   * How many dynamic layers of each voice to load. Memory is what a pack
   * costs a phone, and layers are most of it. With fewer than a voice has,
   * the ones nearest the middle of the band's dynamics are kept and each
   * covers its neighbours' velocities. All of them when absent.
   */
  readonly layers?: number;
  /** Called as each file finishes: files done, files in all. */
  readonly progress?: (done: number, total: number) => void;
}

/** Where the band's dynamics centre; the layer holding it is the one to keep when only one is. */
const MIDDLE_VELOCITY = 71;

/** `url` is the pack's folder. */
export async function loadPack(
  context: BaseAudioContext,
  url: string,
  options: LoadOptions = {},
): Promise<LoadedPack> {
  const base = url.endsWith("/") ? url : `${url}/`;
  const full = (await (await get(`${base}pack.json`)).json()) as Pack;
  if (full.format !== PACK_FORMAT) {
    throw new Error(`${base}: pack format ${full.format}, and this sampler reads ${PACK_FORMAT}`);
  }
  const pack = options.layers === undefined ? full : thinned(full, options.layers);
  const files = new Set<string>();
  for (const voice of Object.values(pack.voices)) {
    for (const layer of voice.layers) {
      for (const zone of layer.zones) for (const take of zone.takes) files.add(take.file);
    }
  }
  const recordings = new Map<string, Recording>();
  let done = 0;
  await Promise.all(
    [...files].map(async (file) => {
      const bytes = await (await get(base + encodeURIComponent(file))).arrayBuffer();
      const buffer = await context.decodeAudioData(bytes);
      recordings.set(file, { buffer, hit: hitTime(buffer) });
      options.progress?.(++done, files.size);
    }),
  );
  return { pack, recordings };
}

async function get(url: string): Promise<Response> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return response;
}

/** The pack with at most `count` layers a voice, the kept ones stretched to cover every velocity. */
function thinned(pack: Pack, count: number): Pack {
  const voices: Record<string, PackVoice> = {};
  for (const [name, voice] of Object.entries(pack.voices)) {
    voices[name] = { ...voice, layers: middleLayers(voice.layers, Math.max(1, count)) };
  }
  return { ...pack, voices };
}

function middleLayers(layers: readonly PackLayer[], count: number): readonly PackLayer[] {
  if (layers.length <= count) return layers;
  const middle = Math.max(
    0,
    layers.findIndex((layer) => layer.top >= MIDDLE_VELOCITY),
  );
  const first = Math.min(Math.max(0, middle - Math.floor((count - 1) / 2)), layers.length - count);
  const kept = layers.slice(first, first + count);
  // The loudest layer kept plays everything above it too.
  return kept.map((layer, i) => (i === kept.length - 1 ? { ...layer, top: 127 } : layer));
}

/** How far under its peak a recording is when the hit is said to have arrived, in dB. */
const HIT_DB = -12;

/** The time of the first sample within 12 dB of the loudest. */
function hitTime(buffer: AudioBuffer): number {
  let peak = 0;
  const channels: Float32Array[] = [];
  for (let c = 0; c < buffer.numberOfChannels; c++) {
    const data = buffer.getChannelData(c);
    channels.push(data);
    for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i]!));
  }
  if (peak === 0) return 0;
  const floor = peak * 10 ** (HIT_DB / 20);
  for (let i = 0; i < buffer.length; i++) {
    for (const data of channels) {
      if (Math.abs(data[i]!) >= floor) return i / buffer.sampleRate;
    }
  }
  return 0;
}
