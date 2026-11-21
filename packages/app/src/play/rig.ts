// The rig: one audio context, the mixer, the sampler, and every instrument pack
// loaded so far. It outlives a jam, so the next one starts at once.

import type { LoadedPack, Mix, Sound } from "@ensemble/audio";
import { loadPack, Mixer, Player, Sampler } from "@ensemble/audio";

/** An instrument in a band: which pack it is, and the mixer channel it sounds in. */
export interface Chair {
  readonly pack: string;
  readonly channel: string;
}

/** The sampler's name for a chair. The same pack can sit in two chairs: a piano comping and a piano soloing. */
export const chairName = (chair: Chair): string => `${chair.channel}:${chair.pack}`;

/** What a mixer cannot change once it is made: the room, and each channel's filter. */
const fixedParts = (mix: Mix): string =>
  JSON.stringify([
    mix.room.seconds,
    mix.room.predelay,
    Object.entries(mix.channels).map(([name, channel]) => [
      name,
      channel.highpass,
      channel.lowpass,
      channel.pan,
    ]),
  ]);

export class Rig {
  readonly context: AudioContext;
  readonly #packsUrl: string;
  readonly #packs = new Map<string, Promise<LoadedPack>>();
  #mixer: { readonly fixed: string; readonly mixer: Mixer } | undefined;
  /** The mix of the band last seated, as its style has it: what a silenced channel comes back to. */
  #mix: Mix | undefined;
  /** The channels taken down while their parts go on being played. */
  #hushed = new Set<string>();
  #sampler: Sampler | undefined;
  #seated = new Set<string>();
  #player: Player | undefined;
  #wake: WakeLockSentinel | undefined;
  /** Packs being fetched for a band someone is about to hear, and who is waiting for them to land. */
  #fetching = 0;
  #landed: (() => void)[] = [];
  /** Who wants to know when a band starts or stops. */
  readonly #watching = new Set<() => void>();

  constructor(packsUrl: string) {
    this.#packsUrl = packsUrl;
    // Made before anyone has tapped, so the packs can be decoded while the chart is read.
    // It makes no sound until `wake` is called from a tap.
    this.context = new AudioContext({ latencyHint: "playback" });
    // Without this an iPhone's silent switch mutes the band.
    const session = (navigator as { audioSession?: { type: string } }).audioSession;
    if (session) session.type = "playback";
    // A phone that was locked or switched away from stops the audio clock and drops the
    // wake lock. Coming back, a band that was playing carries on.
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState !== "visible" || !this.#player) return;
      void this.context.resume();
      void this.#keepAwake();
    });
  }

  /** Call inside the tap that starts the music, before anything is awaited: a browser lets sound start only then. */
  wake(): void {
    void this.context.resume();
  }

  /** Fetch and decode a pack once; later calls share it. A failed load is forgotten, so it can be tried again. */
  load(pack: string, progress?: (done: number, total: number) => void): Promise<LoadedPack> {
    let loading = this.#packs.get(pack);
    if (!loading) {
      loading = loadPack(this.context, this.#packsUrl + pack, progress ? { progress } : {});
      this.#packs.set(pack, loading);
      loading.catch(() => this.#packs.delete(pack));
      this.#fetching++;
      const land = () => {
        if (--this.#fetching > 0) return;
        for (const tell of this.#landed.splice(0)) tell();
      };
      loading.then(land, land);
    }
    return loading;
  }

  /**
   * Resolves when no band's instruments are on their way. Anything fetched for later waits
   * on this, so the connection is the band's while someone is waiting to hear it.
   */
  idle(): Promise<void> {
    if (this.#fetching === 0) return Promise.resolve();
    return new Promise((resolve) => this.#landed.push(resolve));
  }

  /** Seat a band and set its mix. Resolves when every instrument can play. */
  async seat(chairs: readonly Chair[], mix: Mix): Promise<void> {
    const loaded = await Promise.all(chairs.map((chair) => this.load(chair.pack)));
    const fixed = fixedParts(mix);
    if (this.#mixer?.fixed !== fixed) {
      this.#mixer?.mixer.output.disconnect();
      const mixer = new Mixer(this.context, mix);
      mixer.output.connect(this.context.destination);
      this.#mixer = { fixed, mixer };
      this.#sampler = new Sampler(this.context);
      this.#seated = new Set();
    }
    const { mixer } = this.#mixer;
    this.#mix = mix;
    mixer.adjust(this.#heard(mix));
    chairs.forEach((chair, i) => {
      const name = chairName(chair);
      if (this.#seated.has(name)) return;
      const pack = { ...loaded[i]!.pack, id: name };
      this.#sampler!.add({ ...loaded[i]!, pack }, mixer.input(chair.channel));
      this.#seated.add(name);
    });
  }

  /**
   * Silence a channel, or bring it back, at once and without stopping what is
   * played in it: the part goes on underneath, so it comes back in time. The
   * mixer glides the level, so neither way clicks.
   */
  hush(channel: string, silent: boolean): void {
    if (this.#hushed.has(channel) === silent) return;
    if (silent) this.#hushed.add(channel);
    else this.#hushed.delete(channel);
    if (this.#mix) this.#mixer?.mixer.adjust(this.#heard(this.#mix));
  }

  /** Everyone is heard again: a new take starts with nobody silenced. */
  unhush(): void {
    if (this.#hushed.size === 0) return;
    this.#hushed.clear();
    if (this.#mix) this.#mixer?.mixer.adjust(this.#heard(this.#mix));
  }

  /** A mix with the silenced channels all the way down. The reverb is fed after the level, so it goes quiet with them. */
  #heard(mix: Mix): Mix {
    if (this.#hushed.size === 0) return mix;
    const channels = Object.fromEntries(
      Object.entries(mix.channels).map(([name, channel]) => [
        name,
        this.#hushed.has(name) ? { ...channel, level: Number.NEGATIVE_INFINITY } : channel,
      ]),
    );
    return { ...mix, channels };
  }

  /** Whether a band is playing (for `useSyncExternalStore`, with `subscribe`). */
  readonly playing = (): boolean => this.#player !== undefined;

  /** Be told when a band starts or stops. */
  readonly subscribe = (tell: () => void): (() => void) => {
    this.#watching.add(tell);
    return () => this.#watching.delete(tell);
  };

  /** Play sounds from the top. `seat` must have finished for the band that plays them. */
  play(sounds: readonly Sound[]): Player {
    this.stop();
    const player = new Player(this.context, this.#sampler!, sounds);
    player.start();
    this.#player = player;
    void this.#keepAwake();
    for (const tell of this.#watching) tell();
    return player;
  }

  stop(): void {
    const was = this.#player;
    this.#player?.stop();
    this.#player = undefined;
    void this.#wake?.release();
    this.#wake = undefined;
    if (was) for (const tell of this.#watching) tell();
  }

  /** Seconds between a sound being scheduled and being heard, as far as the browser can say. */
  get latency(): number {
    return this.context.outputLatency || this.context.baseLatency || 0;
  }

  /** A phone on a music stand must not go dark in the middle of a tune. */
  async #keepAwake(): Promise<void> {
    try {
      const lock = await navigator.wakeLock?.request("screen");
      // The band may have stopped while the browser was deciding.
      if (!this.#player) {
        void lock?.release();
        return;
      }
      void this.#wake?.release();
      this.#wake = lock;
    } catch {
      // Refused (a low battery, a hidden tab): the music plays on regardless.
    }
  }
}
