// The kit: every piece the drummer can strike, and the General MIDI
// percussion note each one is exported on.

export const KIT = {
  kick: 36,
  snare: 38,
  /** A snare ghost note: its own voice so a sampler can use a ghost articulation, on the snare's note. */
  ghostSnare: 38,
  crossStick: 37,
  closedHat: 42,
  /** The hat closed with the foot. */
  pedalHat: 44,
  openHat: 46,
  ride: 51,
  rideBell: 53,
  crash: 49,
  highTom: 50,
  midTom: 47,
  /** The floor tom. */
  lowTom: 43,
  /** General MIDI's maracas: the nearest note every GM kit has. */
  shaker: 70,
  /** The count-in. General MIDI level 1 has no stick click, so this is the side stick's note. */
  sticks: 37,
} as const;

export type DrumVoice = keyof typeof KIT;

export const DRUM_VOICES = Object.keys(KIT) as readonly DrumVoice[];

/** A snare stroke written under this level is a ghost note: a different sound, not a quiet snare (DR-02). */
export const GHOST_BELOW = 50;

/** The arrival crash (DR-20): the cymbal's level, and the kick put under it when the groove has none on 1. */
export const ARRIVAL_CRASH = 112;
export const ARRIVAL_KICK = 100;

/** The sounding name of a stroke: a snare at ghost level is the ghost snare. */
export function voiceName(voice: DrumVoice, level: number): DrumVoice {
  return voice === "snare" && level < GHOST_BELOW ? "ghostSnare" : voice;
}
