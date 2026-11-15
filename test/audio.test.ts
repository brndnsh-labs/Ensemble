// The scheduler's timing, checked with a made-up clock. Nothing here makes a
// sound: the rule is about when each note is handed over, which is the one
// part of playback that can be wrong without anyone being able to hear why.

import assert from "node:assert/strict";
import { test } from "node:test";
import { SCHEDULER_DEFAULTS, Scheduler, type Sound } from "@ensemble/audio";
import { createRng, type Rng } from "@ensemble/engine";

const { horizon, grace } = SCHEDULER_DEFAULTS;

/** A few minutes of sounds, some together and some far apart, in starting order. */
function someSounds(rng: Rng, count = 400): Sound[] {
  const sounds: Sound[] = [];
  let at = 0;
  for (let i = 0; i < count; i++) {
    // Chords land together; a rest can outlast the look-ahead.
    at += rng.chance(0.3) ? 0 : rng.chance(0.05) ? rng.next() * 4 : rng.next() * 0.4;
    sounds.push({ at, length: 0.2, pack: "p", voice: "", pitch: 60, velocity: 80 });
  }
  return sounds;
}

interface Handed {
  readonly sound: Sound;
  readonly when: number;
  /** The clock when it was handed over. */
  readonly now: number;
}

/** Runs a scheduler against timer ticks at the given gaps until the performance is over. */
function run(
  sounds: readonly Sound[],
  gap: (now: number) => number,
  setUp: (scheduler: Scheduler, handed: Handed[]) => number,
) {
  const handed: Handed[] = [];
  let now = 100;
  // The scheduler starts with the first half; a set-up may append the rest.
  const scheduler = new Scheduler(sounds.slice(0, sounds.length / 2), (sound, when) =>
    handed.push({ sound, when, now }),
  );
  const origin = setUp(scheduler, handed);
  const end = origin + sounds.at(-1)!.at + 1;
  while (now < end) {
    scheduler.tick(now);
    now += gap(now);
  }
  return { handed, scheduler, origin };
}

test("whatever the browser's timers do short of a stall, every note is handed over once, in order, ahead of its time", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const rng = createRng(seed);
    const sounds = someSounds(rng.fork("sounds"));
    const timer = rng.fork("timer");
    // Ticks anywhere from a millisecond to just under the look-ahead apart.
    const { handed, scheduler, origin } = run(
      sounds,
      () => 0.001 + timer.next() * (horizon - 0.002),
      (s) => {
        s.start(100.1);
        // An open jam is given the rest of its notes as it goes.
        s.append(sounds.slice(sounds.length / 2));
        return 100.1;
      },
    );
    assert.deepEqual(
      handed.map((h) => h.sound),
      sounds,
      "each sound once, in order",
    );
    for (const { sound, when, now } of handed) {
      assert.ok(Math.abs(when - (origin + sound.at)) < 1e-9, "at its own time on the clock");
      assert.ok(when >= now, "handed over before it is due");
    }
    assert.deepEqual(
      { ...scheduler.count },
      { onTime: sounds.length, late: 0, dropped: 0, worst: 0 },
    );
  }
});

test("after a stall longer than the look-ahead, nothing is played twice or more than a moment late, and the notes after it are in time", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const rng = createRng(seed);
    const sounds = someSounds(rng.fork("sounds"));
    const stallAt = 100 + rng.between(5, 30);
    const stall = horizon + 0.1 + rng.next() * 5;
    let stalled = false;
    const { handed, scheduler, origin } = run(
      sounds,
      (now) => {
        if (!stalled && now >= stallAt) {
          stalled = true;
          return stall;
        }
        return 0.025;
      },
      (s) => {
        s.append(sounds.slice(sounds.length / 2));
        s.start(100.1);
        return 100.1;
      },
    );
    const played = new Set(handed.map((h) => h.sound));
    assert.equal(played.size, handed.length, "nothing twice");
    const { onTime, late, dropped } = scheduler.count;
    assert.equal(onTime + late + dropped, sounds.length, "every sound is accounted for");
    assert.equal(handed.length, onTime + late);
    for (const { sound, when, now } of handed) {
      const due = origin + sound.at;
      assert.ok(when >= now, "never asked to sound in the past");
      assert.ok(when - due <= grace + 1e-9, "no more than a moment late");
      assert.ok(when - due >= -1e-9, "never early");
    }
    // Everything due once the stall is over and the look-ahead has caught up is on time.
    const after = stallAt + 0.025 + stall;
    for (const sound of sounds) {
      if (origin + sound.at >= after) assert.ok(played.has(sound), "back in time after the stall");
    }
  }
});

test("starting part-way through plays nothing from before that point, and stopping hands nothing more over", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const rng = createRng(seed);
    const sounds = someSounds(rng.fork("sounds"));
    const from = sounds[rng.between(50, 150)]!.at + 0.001;
    const stopAt = 100.1 + rng.between(10, 20);
    let scheduler: Scheduler | undefined;
    const { handed } = run(
      sounds,
      (now) => {
        if (now >= stopAt) scheduler?.stop();
        return 0.025;
      },
      (s) => {
        scheduler = s;
        s.append(sounds.slice(sounds.length / 2));
        s.start(100.1, from);
        return 100.1 - from;
      },
    );
    assert.ok(handed.length > 0);
    for (const { sound, when, now } of handed) {
      assert.ok(sound.at >= from, "nothing from before the starting point");
      assert.ok(
        Math.abs(when - (100.1 + sound.at - from)) < 1e-9,
        "the starting point sounds first",
      );
      assert.ok(now <= stopAt + 0.025, "nothing after stop");
    }
    assert.equal(
      handed[0]!.sound,
      sounds.find((s) => s.at >= from),
    );
  }
});

test("when what is to come is changed, everything before the change is played as it was and everything after as it now is, once each and in time", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const rng = createRng(seed);
    const sounds = someSounds(rng.fork("sounds"));
    const instead = someSounds(rng.fork("instead"));
    const changeAt = 100.1 + rng.between(5, 30);
    let scheduler: Scheduler | undefined;
    let cut: number | undefined;
    const { handed, origin } = run(
      sounds,
      (now) => {
        if (cut === undefined && now >= changeAt) {
          // The band is told now; the change takes hold just past what is already handed over.
          cut = now - 100.1 + horizon + 0.001;
          scheduler?.replace(cut, instead);
        }
        return 0.025;
      },
      (s) => {
        scheduler = s;
        s.append(sounds.slice(sounds.length / 2));
        s.start(100.1);
        return 100.1;
      },
    );
    assert.ok(cut !== undefined);
    const expected = [
      ...sounds.filter((s) => s.at < cut!),
      ...instead.filter((s) => s.at >= cut! && s.at < sounds.at(-1)!.at),
    ];
    assert.deepEqual(
      handed.map((h) => h.sound).filter((s) => s.at < sounds.at(-1)!.at),
      expected,
      "the old before the change, the new after, each once and in order",
    );
    for (const { sound, when, now } of handed) {
      assert.ok(Math.abs(when - (origin + sound.at)) < 1e-9, "at its own time on the clock");
      assert.ok(when >= now, "handed over before it is due");
    }
  }
});
