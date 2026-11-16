// The mixer: what makes instruments recorded in different rooms, by different
// people, at different levels, sound like one band. Each instrument has a
// channel with a level, a place from left to right, and a send to one reverb
// that everybody shares; the sum goes through light compression and a limiter.

/** One channel's settings. */
export interface ChannelMix {
  /** Level in dB. Packs are levelled to one reference, so this is the balance itself. */
  readonly level: number;
  /** Left (-1) to right (1). Centre when absent. */
  readonly pan?: number;
  /** How much of the channel goes to the shared reverb, in dB under its level. Absent for none. */
  readonly reverb?: number;
  /** Cut everything under this many Hz. The low end belongs to the bass and the kick. */
  readonly highpass?: number;
  /** Roll off what is over this many Hz, 12 dB an octave: an instrument's tone control turned down. */
  readonly lowpass?: number;
}

/** A mix: a channel for each name, the room, and the master level. */
export interface Mix {
  readonly channels: Readonly<Record<string, ChannelMix>>;
  readonly room: RoomMix;
  /** Gain in dB before the limiter. */
  readonly master: number;
}

export interface RoomMix {
  /** How long the room rings, in seconds, to 60 dB down. */
  readonly seconds: number;
  /** Seconds before the room answers. A short gap keeps the instruments in front of it. */
  readonly predelay: number;
  /** The reverb's own level in dB. */
  readonly level: number;
}

const db = (value: number): number => 10 ** (value / 20);

export class Mixer {
  /** Connect this to the context's destination. */
  readonly output: AudioNode;
  readonly #context: BaseAudioContext;
  readonly #mix: Mix;
  readonly #bus: GainNode;
  readonly #send: GainNode;
  readonly #room: GainNode;
  readonly #channels = new Map<string, Channel>();

  constructor(context: BaseAudioContext, mix: Mix) {
    this.#context = context;
    this.#mix = mix;
    this.#bus = context.createGain();
    this.#bus.gain.value = db(mix.master);

    // One room for everyone.
    this.#send = context.createGain();
    const predelay = context.createDelay(0.2);
    predelay.delayTime.value = mix.room.predelay;
    const room = context.createConvolver();
    room.buffer = roomImpulse(context, mix.room.seconds);
    this.#room = context.createGain();
    this.#room.gain.value = db(mix.room.level);
    this.#send.connect(predelay).connect(room).connect(this.#room).connect(this.#bus);

    // Light compression to hold the band together, then a limiter so nothing clips.
    const glue = context.createDynamicsCompressor();
    glue.threshold.value = -20;
    glue.knee.value = 12;
    glue.ratio.value = 2;
    glue.attack.value = 0.03;
    glue.release.value = 0.25;
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -3;
    limiter.knee.value = 0;
    limiter.ratio.value = 20;
    limiter.attack.value = 0.002;
    limiter.release.value = 0.1;
    this.output = this.#bus.connect(glue).connect(limiter);
  }

  /** Where an instrument's sound goes in. A name the mix does not list gets a plain channel. */
  input(name: string): AudioNode {
    const existing = this.#channels.get(name);
    if (existing) return existing.input;
    const context = this.#context;
    const settings = this.#mix.channels[name] ?? { level: 0 };
    const input = context.createGain();
    let tail: AudioNode = input;
    if (settings.highpass !== undefined) {
      const filter = context.createBiquadFilter();
      filter.type = "highpass";
      filter.frequency.value = settings.highpass;
      filter.Q.value = Math.SQRT1_2;
      tail = tail.connect(filter);
    }
    if (settings.lowpass !== undefined) {
      const filter = context.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = settings.lowpass;
      filter.Q.value = Math.SQRT1_2;
      tail = tail.connect(filter);
    }
    const level = context.createGain();
    level.gain.value = db(settings.level);
    tail = tail.connect(level);
    if (settings.pan) {
      const pan = context.createStereoPanner();
      pan.pan.value = settings.pan;
      tail = tail.connect(pan);
    }
    tail.connect(this.#bus);
    const send = context.createGain();
    send.gain.value = sendGain(settings);
    tail.connect(send).connect(this.#send);
    this.#channels.set(name, { input, level, send });
    return input;
  }

  /**
   * Change the levels while the band plays: each channel's level and reverb
   * send, the room's level, the master. The room's length and the filters are
   * fixed when the mixer is made.
   */
  adjust(mix: Mix): void {
    const now = this.#context.currentTime;
    const glide = (param: AudioParam, value: number) => param.setTargetAtTime(value, now, 0.02);
    glide(this.#bus.gain, db(mix.master));
    glide(this.#room.gain, db(mix.room.level));
    for (const [name, channel] of this.#channels) {
      const settings = mix.channels[name];
      if (!settings) continue;
      glide(channel.level.gain, db(settings.level));
      glide(channel.send.gain, sendGain(settings));
    }
  }
}

interface Channel {
  readonly input: AudioNode;
  readonly level: GainNode;
  readonly send: GainNode;
}

const sendGain = (settings: ChannelMix): number =>
  settings.reverb === undefined ? 0 : db(settings.reverb);

/**
 * A room's ring as an impulse response: noise dying away evenly, darker as it
 * goes, a little different on each side. Made here, the same every time, so no
 * recording of a real room (with a licence of its own) is needed.
 */
function roomImpulse(context: BaseAudioContext, seconds: number): AudioBuffer {
  const rate = context.sampleRate;
  const length = Math.ceil(rate * seconds * 1.2);
  const impulse = context.createBuffer(2, length, rate);
  // 60 dB down after `seconds`.
  const decay = Math.log(1000) / (seconds * rate);
  for (let channel = 0; channel < 2; channel++) {
    const data = impulse.getChannelData(channel);
    const noise = whiteNoise(channel + 1);
    let low = 0;
    for (let i = 0; i < length; i++) {
      // The highs die first: the filter closes as the ring goes on.
      const open = 0.25 + 0.75 * Math.exp((-3 * i) / length);
      low += open * (noise() - low);
      data[i] = low * Math.exp(-decay * i);
    }
  }
  return impulse;
}

/** Repeatable noise between -1 and 1 (mulberry32). */
function whiteNoise(seed: number): () => number {
  let state = seed * 0x9e3779b9;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 2147483648 - 1;
  };
}
