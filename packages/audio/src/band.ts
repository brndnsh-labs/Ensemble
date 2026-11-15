// A band: its packs loaded, each sounding into its channel of the mix. The
// same band plays live against the clock or renders a whole performance at once.

import type { LoadOptions } from "./load.ts";
import { loadPack } from "./load.ts";
import type { Mix } from "./mixer.ts";
import { Mixer } from "./mixer.ts";
import { Sampler } from "./sampler.ts";
import type { Sound } from "./schedule.ts";
import { Scheduler, type SchedulerCount } from "./schedule.ts";

/** Which packs a band plays, and the mixer channel each one sounds in. */
export interface BandSetup {
  /** Pack id to mixer channel. */
  readonly packs: Readonly<Record<string, string>>;
  /** The folder the packs' folders are in. */
  readonly packsUrl: string;
  readonly mix: Mix;
  readonly load?: LoadOptions;
}

/** A band ready to play in a context. */
export interface Band {
  readonly sampler: Sampler;
  readonly mixer: Mixer;
  /** The size of every loaded recording in memory, in bytes. */
  readonly decodedBytes: number;
}

/** Load a band's packs into a context and wire them through the mix to its output. */
export async function assemble(context: BaseAudioContext, setup: BandSetup): Promise<Band> {
  const mixer = new Mixer(context, setup.mix);
  mixer.output.connect(context.destination);
  const sampler = new Sampler(context);
  const base = setup.packsUrl.endsWith("/") ? setup.packsUrl : `${setup.packsUrl}/`;
  let decodedBytes = 0;
  await Promise.all(
    Object.entries(setup.packs).map(async ([id, channel]) => {
      const loaded = await loadPack(context, base + id, setup.load);
      for (const { buffer } of loaded.recordings.values()) {
        decodedBytes += buffer.length * buffer.numberOfChannels * 4;
      }
      sampler.add(loaded, mixer.input(channel));
    }),
  );
  return { sampler, mixer, decodedBytes };
}

/** How often the live player looks ahead, in milliseconds. */
const TICK_MS = 25;

/** A performance playing live. */
export class Player {
  readonly #context: AudioContext;
  readonly #sampler: Sampler;
  readonly #scheduler: Scheduler;
  #timer: ReturnType<typeof setInterval> | undefined;

  /** `sounds` in the order they start. */
  constructor(context: AudioContext, sampler: Sampler, sounds: readonly Sound[]) {
    this.#context = context;
    this.#sampler = sampler;
    this.#scheduler = new Scheduler(sounds, (sound, when) => sampler.play(sound, when));
  }

  /** What has become of the sounds so far: on time, late, dropped. */
  get count(): Readonly<SchedulerCount> {
    return this.#scheduler.count;
  }

  /** Seconds into the performance, or undefined when stopped. */
  get position(): number | undefined {
    return this.#scheduler.position(this.#context.currentTime);
  }

  get finished(): boolean {
    return this.#scheduler.finished;
  }

  /** Play from a point in the performance, in seconds. */
  start(from = 0): void {
    this.stop();
    // A moment's lead, so the first notes are scheduled ahead like the rest.
    this.#scheduler.start(this.#context.currentTime + 0.1, from);
    this.#scheduler.tick(this.#context.currentTime);
    this.#timer = setInterval(() => this.#scheduler.tick(this.#context.currentTime), TICK_MS);
  }

  stop(): void {
    if (this.#timer === undefined) return;
    clearInterval(this.#timer);
    this.#timer = undefined;
    this.#scheduler.stop();
    this.#sampler.silence(this.#context.currentTime);
  }

  /** More to play, for a jam with no set length. */
  append(sounds: readonly Sound[]): void {
    this.#scheduler.append(sounds);
  }
}

/** How often a render pauses to hand over more sounds, in seconds, and how far ahead it hands them. */
const RENDER_STEP = 1;
const RENDER_HORIZON = 2;

/**
 * Render a whole performance to a buffer, faster than real time: the same
 * sampler and mix as live playing. The sounds are handed over a second at a
 * time as the render goes, by the same scheduler that plays live; a context
 * holding every note of a take at once slows with the square of its length.
 */
export async function renderBand(
  setup: BandSetup,
  sounds: readonly Sound[],
  options: {
    readonly sampleRate?: number;
    readonly tail?: number;
    /** Press stop at this second of the performance, to see what is heard afterwards. */
    readonly stopAt?: number;
  } = {},
): Promise<AudioBuffer> {
  const sampleRate = options.sampleRate ?? 48000;
  const last = sounds.reduce((end, sound) => Math.max(end, sound.at + sound.length), 0);
  const seconds = last + (options.tail ?? setup.mix.room.seconds + 1);
  const context = new OfflineAudioContext(2, Math.ceil(seconds * sampleRate), sampleRate);
  const { sampler } = await assemble(context, setup);
  const scheduler = new Scheduler(sounds, (sound, when) => sampler.play(sound, when), {
    horizon: RENDER_HORIZON,
  });
  const step = (now: number): void => {
    scheduler.tick(now);
    if (options.stopAt !== undefined && scheduler.playing && now + RENDER_STEP > options.stopAt) {
      scheduler.stop();
      sampler.silence(options.stopAt);
    }
  };
  scheduler.start(0);
  step(0);
  for (let time = RENDER_STEP; time < seconds; time += RENDER_STEP) {
    void context.suspend(time).then(() => {
      step(time);
      return context.resume();
    });
  }
  return context.startRendering();
}
