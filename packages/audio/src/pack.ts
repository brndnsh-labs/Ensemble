// A pack: one instrument's recordings, and what a sampler needs to know to
// play them. It is written once, when the pack is cut from its source library
// (scripts/packs), as `pack.json` beside the audio files in `assets/packs/<id>/`.
// The sources' licence texts are copied beside it as `LICENCE`.

export const PACK_FORMAT = 1;

export interface Pack {
  readonly format: typeof PACK_FORMAT;
  /** The folder's name. */
  readonly id: string;
  /** What a person would call it: "Upright bass". */
  readonly name: string;
  /**
   * Where the recordings came from: one credit for each source library, the
   * one most of the pack is cut from first.
   */
  readonly credits: readonly PackCredit[];
  readonly audio: PackAudio;
  readonly level: PackLevel;
  /**
   * The sounds the instrument can make, by name. The plain sound is `""`. A
   * drum kit has one voice per piece ("kick", "ghostSnare"); a pitched
   * instrument may have articulations ("dead", "muted"). A note that asks for
   * a voice the pack lacks is played on the plain voice.
   */
  readonly voices: Readonly<Record<string, PackVoice>>;
}

/** One source library the recordings came from. Shown on the credits page. */
export interface PackCredit {
  readonly title: string;
  readonly author: string;
  readonly url: string;
  /** The commit or version the pack was cut from. */
  readonly version: string;
  /**
   * SPDX name of the licence: "CC0-1.0", "CC-BY-3.0". Its text is in
   * `LICENCE`: each source's in turn, or once when they are the same text.
   */
  readonly licence: string;
  /**
   * What was done to this source's recordings, in a sentence or two, and which
   * voices they are. A licence may require saying so.
   */
  readonly changes: string;
}

/** Every file in a pack has the same encoding. */
export interface PackAudio {
  readonly container: "webm";
  readonly codec: "opus";
  readonly sampleRate: number;
  readonly channels: 1 | 2;
  /** Size of the audio files in bytes, and of the same audio decoded to 32-bit floats. */
  readonly bytes: number;
  readonly decodedBytes: number;
}

/**
 * How loud the files are. Every take in a pack is levelled to one reference
 * when the pack is cut, so that a soft recording and a hard one differ in
 * colour and the player's velocity alone sets the level.
 */
export interface PackLevel {
  /**
   * What was measured. `loudness`: the loudest 400 ms of the take, K-weighted,
   * in LUFS. `peak`: the highest sample, in dBFS.
   */
  readonly measure: "loudness" | "peak";
  /** The value every take was brought to. */
  readonly reference: number;
}

export interface PackVoice {
  /**
   * Recordings by how hard the note was played, softest first. A note plays
   * the first layer whose `top` is at or above its velocity; the last layer's
   * `top` is 127.
   */
  readonly layers: readonly PackLayer[];
  /**
   * This voice's own levelling, when it differs from the pack's: a stroke too
   * short for a loudness to mean much is levelled by its peak.
   */
  readonly level?: PackLevel;
  /** A trim in dB on top of the pack's reference: a hi-hat sits under a snare. */
  readonly trim?: number;
  /** Where the voice sits from left (-1) to right (1). Centre when absent. */
  readonly pan?: number;
  /**
   * True when a strike rings for the length of its recording whatever the
   * note's length: a drum. False or absent when the note's end damps it.
   */
  readonly oneShot?: boolean;
  /** Seconds a note takes to die away once it ends. Not used by a one-shot voice. */
  readonly release?: number;
  /** Voices this one silences when it starts: a closed hi-hat stops an open one. */
  readonly chokes?: readonly string[];
}

export interface PackLayer {
  /** The highest velocity this layer plays, 1 to 127. */
  readonly top: number;
  /**
   * The recordings in the layer. A pitched voice has one zone for each
   * recorded pitch, in rising order, and a note plays the zone whose root is
   * nearest. An unpitched voice has one zone with no root.
   */
  readonly zones: readonly PackZone[];
}

export interface PackZone {
  /**
   * The MIDI pitch the recording sounds at, as measured: it may be a fraction
   * (40.07 is seven cents above E2). Absent on an unpitched voice.
   */
  readonly root?: number;
  /** Recordings of the same note, played in turn so that repeats differ. */
  readonly takes: readonly PackTake[];
}

export interface PackTake {
  /** The file's name in the pack's folder. The sound starts at the file's first sample. */
  readonly file: string;
  /** Its length in seconds. */
  readonly seconds: number;
}
