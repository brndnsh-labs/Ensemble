// The scheduler: it hands each sound to the sampler a little before it is due.
//
// A browser's timers are loose (tens of milliseconds late on a good day, a
// second apart in a background tab), and its audio clock is exact. So nothing
// is played "now": on every timer tick the scheduler looks ahead of the audio
// clock by a horizon and hands over every sound that starts inside it, each
// with the exact clock time it is to sound at. The clock is passed in, so all
// of this can be checked with a made-up one.

/** One sound to make: which pack, which of its voices, how high, how hard, when, how long. */
export interface Sound {
  /** Seconds from the start of the performance. */
  readonly at: number;
  /** Seconds it lasts. */
  readonly length: number;
  readonly pack: string;
  /** The pack's voice; `""` is the plain one. */
  readonly voice: string;
  /** MIDI pitch. A drum voice ignores it. */
  readonly pitch: number;
  /** 1 to 127. */
  readonly velocity: number;
  /**
   * How hard the instrument was struck, 1 to 127, where that is not how loud
   * it is heard: the recording played is the one made at this dynamic, at the
   * level `velocity` gives. A string plucked gently and turned up. Left out,
   * it is `velocity`.
   */
  readonly touch?: number;
  /**
   * Where the pitch moves while it sounds: cents away from `pitch`, one value
   * every `step` seconds from its start. After the last, it stays there.
   */
  readonly bend?: { readonly step: number; readonly cents: readonly number[] };
}

export interface SchedulerOptions {
  /**
   * How far ahead of the clock sounds are handed over, in seconds. It has to
   * be longer than the longest gap between timer ticks that should pass
   * unheard: a background tab's timers fire once a second.
   */
  readonly horizon: number;
  /**
   * A sound found after its time has passed is still played, at once, when it
   * is no later than this many seconds; later than that it is dropped. This
   * is what happens after a stall longer than the horizon.
   */
  readonly grace: number;
}

export const SCHEDULER_DEFAULTS: SchedulerOptions = { horizon: 1.5, grace: 0.05 };

/** What became of the sounds so far. A clean performance has no late and no dropped. */
export interface SchedulerCount {
  /** Handed over ahead of time. */
  onTime: number;
  /** Found after their time, within the grace, and played at once. */
  late: number;
  /** Found too late to play. */
  dropped: number;
  /** The most any played sound was late by, in seconds. */
  worst: number;
}

/** Plays a sound at a clock time. `when` is never in the past. */
export type Play = (sound: Sound, when: number) => void;

export class Scheduler {
  readonly count: SchedulerCount = { onTime: 0, late: 0, dropped: 0, worst: 0 };
  readonly #sounds: Sound[];
  readonly #play: Play;
  readonly #options: SchedulerOptions;
  /** The next sound to hand over. */
  #next = 0;
  /** The clock time at which second zero of the performance sounds, while playing. */
  #origin: number | undefined;

  /** `sounds` must be in the order they start. */
  constructor(sounds: readonly Sound[], play: Play, options: Partial<SchedulerOptions> = {}) {
    this.#sounds = [...sounds];
    this.#play = play;
    this.#options = { ...SCHEDULER_DEFAULTS, ...options };
  }

  get playing(): boolean {
    return this.#origin !== undefined;
  }

  /** True when every sound has been handed over or passed by. */
  get finished(): boolean {
    return this.#next >= this.#sounds.length;
  }

  /**
   * Start playing: second `from` of the performance sounds at clock time
   * `at`. Sounds that begin before `from` are not played. Give `at` a moment
   * after now so the first notes can be scheduled ahead like every other.
   */
  start(at: number, from = 0): void {
    this.#origin = at - from;
    this.#next = firstAtOrAfter(this.#sounds, from);
  }

  /** Stop handing sounds over. What has been handed over already is the sampler's to silence. */
  stop(): void {
    this.#origin = undefined;
  }

  /** Where the performance is, in its own seconds, at a clock time. Undefined when stopped. */
  position(now: number): number | undefined {
    return this.#origin === undefined ? undefined : now - this.#origin;
  }

  /** More of the performance, for a jam with no set length. Each must start no earlier than the last. */
  append(sounds: readonly Sound[]): void {
    this.#sounds.push(...sounds);
  }

  /**
   * Change what is to come: from second `from` of the performance on, these
   * sounds are played in place of the ones that were there. A sound already
   * handed over cannot be taken back, so give a `from` further off than the
   * horizon. Given a nearer one, the change takes hold just after the last
   * sound handed over instead: late, but nothing sounds twice.
   */
  replace(from: number, sounds: readonly Sound[]): void {
    let kept = firstAtOrAfter(this.#sounds, from);
    let after = from;
    if (kept < this.#next) {
      kept = this.#next;
      after = Math.max(from, nextAfter(this.#sounds[kept - 1]!.at));
    }
    this.#sounds.length = kept;
    this.#sounds.push(...sounds.slice(firstAtOrAfter(sounds, after)));
  }

  /** Hand over everything that starts inside the horizon. Call it on any timer, however uneven. */
  tick(now: number): void {
    if (this.#origin === undefined) return;
    const { horizon, grace } = this.#options;
    for (; this.#next < this.#sounds.length; this.#next++) {
      const sound = this.#sounds[this.#next]!;
      const when = this.#origin + sound.at;
      if (when > now + horizon) break;
      const lateBy = now - when;
      if (lateBy <= 0) {
        this.count.onTime++;
        this.#play(sound, when);
      } else if (lateBy <= grace) {
        this.count.late++;
        this.count.worst = Math.max(this.count.worst, lateBy);
        this.#play(sound, now);
      } else {
        this.count.dropped++;
      }
    }
  }
}

/** The index of the first sound starting at or after a time; the list is in starting order. */
function firstAtOrAfter(sounds: readonly Sound[], time: number): number {
  let low = 0;
  let high = sounds.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (sounds[middle]!.at < time) low = middle + 1;
    else high = middle;
  }
  return low;
}

/** The smallest time later than a time. */
function nextAfter(time: number): number {
  return time + Math.max(Number.EPSILON, Math.abs(time) * Number.EPSILON);
}
