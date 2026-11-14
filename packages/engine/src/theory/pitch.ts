// Note names, keys, and scale degrees. Spelling matters here (Bb is not A#);
// MIDI pitch numbers appear only once players choose octaves.

export type Letter = "C" | "D" | "E" | "F" | "G" | "A" | "B";

/** A spelled note without an octave. `accidental` is in semitones: -1 is flat, +1 is sharp. */
export interface NoteName {
  readonly letter: Letter;
  readonly accidental: number;
}

export interface Key {
  readonly tonic: NoteName;
  readonly mode: "major" | "minor";
}

/**
 * A scale degree measured from the tonic against the major scale, in major and
 * minor keys alike. In A minor, C is `{ step: 3, accidental: -1 }` (bIII).
 */
export interface Degree {
  readonly step: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  readonly accidental: number;
}

const LETTERS: readonly Letter[] = ["C", "D", "E", "F", "G", "A", "B"];
const LETTER_PITCH_CLASS: Readonly<Record<Letter, number>> = {
  C: 0,
  D: 2,
  E: 4,
  F: 5,
  G: 7,
  A: 9,
  B: 11,
};
const MAJOR_SCALE = [0, 2, 4, 5, 7, 9, 11] as const;

export const mod12 = (n: number): number => ((n % 12) + 12) % 12;

export function pitchClass(note: NoteName): number {
  return mod12(LETTER_PITCH_CLASS[note.letter] + note.accidental);
}

export function noteNameToString(note: NoteName): string {
  const mark = note.accidental < 0 ? "b" : "#";
  return note.letter + mark.repeat(Math.abs(note.accidental));
}

export function keyToString(key: Key): string {
  return noteNameToString(key.tonic) + (key.mode === "minor" ? "m" : "");
}

export function sameNote(a: NoteName, b: NoteName): boolean {
  return a.letter === b.letter && a.accidental === b.accidental;
}

/** Semitones above the tonic, 0 to 11. */
export function degreeSemitones(degree: Degree): number {
  return mod12(MAJOR_SCALE[degree.step - 1]! + degree.accidental);
}

/** The degree a note occupies in a key, keeping its spelling: Db in C is bII, C# is #I. */
export function degreeOf(note: NoteName, key: Key): Degree {
  const stepIndex = (LETTERS.indexOf(note.letter) - LETTERS.indexOf(key.tonic.letter) + 7) % 7;
  const natural = mod12(pitchClass(key.tonic) + MAJOR_SCALE[stepIndex]!);
  return {
    step: (stepIndex + 1) as Degree["step"],
    accidental: signedSemitones(pitchClass(note) - natural),
  };
}

/**
 * The note at a degree of a key. Spelled by letter where that needs at most one
 * accidental; otherwise respelled to the simpler enharmonic (bVI in Db is A, not Bbb).
 */
export function noteAtDegree(degree: Degree, key: Key): NoteName {
  const letter = LETTERS[(LETTERS.indexOf(key.tonic.letter) + degree.step - 1) % 7]!;
  const target = mod12(pitchClass(key.tonic) + degreeSemitones(degree));
  const accidental = signedSemitones(target - LETTER_PITCH_CLASS[letter]);
  if (Math.abs(accidental) <= 1) return { letter, accidental };
  return spellPitchClass(target, accidental < 0 ? "flat" : "sharp");
}

/** Spell a pitch class with at most one accidental, leaning flat or sharp for the black keys. */
export function spellPitchClass(pc: number, lean: "flat" | "sharp"): NoteName {
  const target = mod12(pc);
  for (const letter of LETTERS) {
    if (LETTER_PITCH_CLASS[letter] === target) return { letter, accidental: 0 };
  }
  const accidental = lean === "flat" ? -1 : 1;
  const letter = LETTERS.find((l) => mod12(LETTER_PITCH_CLASS[l] + accidental) === target)!;
  return { letter, accidental };
}

/** Whether a key's signature is written in flats. Decides how chromatic notes lean. */
export function keyLeansFlat(key: Key): boolean {
  // Position on the circle of fifths of the relative major: negative is the flat side.
  const majorTonic =
    key.mode === "minor" ? mod12(pitchClass(key.tonic) + 3) : pitchClass(key.tonic);
  const fifths = mod12(majorTonic * 7);
  const signed = fifths > 6 ? fifths - 12 : fifths;
  if (signed === 6) return key.tonic.accidental < 0;
  return signed < 0;
}

/** Fold a semitone difference into -6..5 so that it reads as an accidental. */
function signedSemitones(diff: number): number {
  const folded = mod12(diff);
  return folded > 6 ? folded - 12 : folded;
}
