// The sampler: it plays a sound by choosing a recording from a pack and
// starting it at an exact time on the audio clock.

import type { LoadedPack } from "./load.ts";
import type { PackLayer, PackVoice, PackZone } from "./pack.ts";
import type { Sound } from "./schedule.ts";

/** How long a choked or silenced sound takes to go, in seconds. Short, but not a step. */
const CUT = 0.03;

interface Sounding {
  readonly source: AudioBufferSourceNode;
  readonly gain: GainNode;
  readonly when: number;
  /** When its release begins. Absent for a strike that rings out. */
  readonly end?: number;
}

interface Instrument {
  readonly loaded: LoadedPack;
  readonly output: AudioNode;
  /** A panner for each voice that sits off centre. */
  readonly panners: Map<string, AudioNode>;
  /** How many times each zone has played, to take its recordings in turn. */
  readonly turns: Map<PackZone, number>;
  /** What has been started and has not ended, by voice. */
  readonly sounding: Map<string, Set<Sounding>>;
}

export class Sampler {
  readonly #context: BaseAudioContext;
  readonly #instruments = new Map<string, Instrument>();

  constructor(context: BaseAudioContext) {
    this.#context = context;
  }

  /** Make a pack playable, sounding into `output`. */
  add(loaded: LoadedPack, output: AudioNode): void {
    this.#instruments.set(loaded.pack.id, {
      loaded,
      output,
      panners: new Map(),
      turns: new Map(),
      sounding: new Map(),
    });
  }

  /** Start a sound at a time on the context's clock. A sound for a pack that is not loaded is skipped. */
  play(sound: Sound, when: number): void {
    const instrument = this.#instruments.get(sound.pack);
    if (!instrument) return;
    const { pack, recordings } = instrument.loaded;
    // A voice the pack lacks is played on the plain one: a dead note becomes a short quiet note.
    const name = sound.voice in pack.voices ? sound.voice : "";
    const voice = pack.voices[name];
    if (!voice) return;
    const zone = nearestZone(layerFor(voice, sound.velocity), sound.pitch);
    if (!zone) return;
    const turn = instrument.turns.get(zone) ?? 0;
    instrument.turns.set(zone, turn + 1);
    const recording = recordings.get(zone.takes[turn % zone.takes.length]!.file);
    if (!recording) return;

    for (const choked of voice.chokes ?? []) this.#cut(instrument, choked, when);

    const context = this.#context;
    const source = context.createBufferSource();
    source.buffer = recording.buffer;
    if (zone.root !== undefined) source.playbackRate.value = 2 ** ((sound.pitch - zone.root) / 12);
    const gain = context.createGain();
    const level = (sound.velocity / 127) ** 2 * 10 ** ((voice.trim ?? 0) / 20);
    gain.gain.setValueAtTime(level, when);
    source.connect(gain).connect(this.#voiceOutput(instrument, name, voice));
    source.start(when, recording.start);
    const end = voice.oneShot ? undefined : when + sound.length;
    if (end !== undefined) release(source, gain, level, end, voice.release ?? 0.1);

    const sounding: Sounding = { source, gain, when, ...(end === undefined ? {} : { end }) };
    const ringing = instrument.sounding.get(name) ?? new Set();
    instrument.sounding.set(name, ringing);
    ringing.add(sounding);
    source.onended = () => {
      ringing.delete(sounding);
      gain.disconnect();
    };
  }

  /** Silence everything at a clock time: what is sounding, and what was handed over and has not started. */
  silence(at: number): void {
    for (const instrument of this.#instruments.values()) {
      for (const ringing of instrument.sounding.values()) {
        for (const sounding of ringing) fade(sounding, at);
      }
    }
  }

  /** Stop one voice's ringing at a time: an open hi-hat closed by the next stroke. */
  #cut(instrument: Instrument, voice: string, at: number): void {
    const ringing = instrument.sounding.get(voice);
    if (!ringing) return;
    for (const sounding of ringing) {
      if (sounding.when >= at) continue;
      fade(sounding, at);
      // It is dealt with: the next stroke need not look at it again.
      ringing.delete(sounding);
    }
  }

  #voiceOutput(instrument: Instrument, name: string, voice: PackVoice): AudioNode {
    if (!voice.pan) return instrument.output;
    let panner = instrument.panners.get(name);
    if (!panner) {
      const node = this.#context.createStereoPanner();
      node.pan.value = voice.pan;
      node.connect(instrument.output);
      instrument.panners.set(name, node);
      panner = node;
    }
    return panner;
  }
}

/** The first layer whose top is at or above the velocity. */
function layerFor(voice: PackVoice, velocity: number): PackLayer | undefined {
  return voice.layers.find((layer) => velocity <= layer.top) ?? voice.layers.at(-1);
}

/** The zone recorded nearest the pitch; the only zone of an unpitched voice. */
function nearestZone(layer: PackLayer | undefined, pitch: number): PackZone | undefined {
  let best: PackZone | undefined;
  let distance = Number.POSITIVE_INFINITY;
  for (const zone of layer?.zones ?? []) {
    const d = zone.root === undefined ? 0 : Math.abs(zone.root - pitch);
    if (d < distance) {
      best = zone;
      distance = d;
    }
  }
  return best;
}

/** The note's end: it dies away over the release, as a damped string or a stopped breath does. */
function release(
  source: AudioBufferSourceNode,
  gain: GainNode,
  level: number,
  end: number,
  seconds: number,
): void {
  gain.gain.setValueAtTime(level, end);
  gain.gain.exponentialRampToValueAtTime(level * 0.01, end + seconds);
  gain.gain.linearRampToValueAtTime(0, end + seconds + 0.01);
  stop(source, end + seconds + 0.02);
}

/**
 * Take a sound out at a time. One that has not started by then never sounds:
 * it is stopped at its own start, since fading in a sound to fade it out clicks.
 */
function fade({ source, gain, when, end }: Sounding, at: number): void {
  if (when >= at) {
    stop(source, when);
    return;
  }
  // Already dying away: its own release is the quicker and the cleaner end.
  if (end !== undefined && at >= end) return;
  gain.gain.cancelScheduledValues(at);
  gain.gain.setTargetAtTime(0, at, CUT / 4);
  stop(source, at + CUT * 2);
}

/** Set when a source stops. Some browsers have refused a second stop time; the first then stands. */
function stop(source: AudioBufferSourceNode, at: number): void {
  try {
    source.stop(at);
  } catch {
    // The earlier stop time holds.
  }
}
