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

const NATURAL_MINOR = [0, 2, 3, 5, 7, 8, 10] as const;

/**
 * The chromatic degree by which each distance above the tonic is usually
 * called: bII, bIII, #IV, bVI, bVII between the tones of the major scale.
 */
const CONVENTIONAL_DEGREES: readonly Degree[] = [
  { step: 1, accidental: 0 },
  { step: 2, accidental: -1 },
  { step: 2, accidental: 0 },
  { step: 3, accidental: -1 },
  { step: 3, accidental: 0 },
  { step: 4, accidental: 0 },
  { step: 4, accidental: 1 },
  { step: 5, accidental: 0 },
  { step: 6, accidental: -1 },
  { step: 6, accidental: 0 },
  { step: 7, accidental: -1 },
  { step: 7, accidental: 0 },
];

/** Whether a note belongs to a key's own scale: major, or natural minor plus its raised seventh. */
function inScaleOf(key: Key, note: NoteName): boolean {
  const step = (LETTERS.indexOf(note.letter) - LETTERS.indexOf(key.tonic.letter) + 7) % 7;
  const above = mod12(pitchClass(note) - pitchClass(key.tonic));
  if (key.mode === "major") return MAJOR_SCALE[step] === above;
  return NATURAL_MINOR[step] === above || (step === 6 && above === 11);
}

/** Cb, Fb, E#, B#: a white key under a harder name. */
function isDisguisedNatural(note: NoteName): boolean {
  if (note.accidental === -1) return note.letter === "C" || note.letter === "F";
  return note.accidental === 1 && (note.letter === "E" || note.letter === "B");
}

/**
 * The degree a note occupies in a key. It is the inverse of `noteAtDegree`:
 * a degree that spells exactly this note in this key, and of those the one a
 * musician would name first (A in Db is bVI, though by letter it is #V; G# in
 * C stays #V, because bVI would be Ab). A note no degree spells in this key
 * (E# in C) gets the usual degree for its pitch (IV).
 */
export function degreeOf(note: NoteName, key: Key): Degree {
  const conventional = CONVENTIONAL_DEGREES[mod12(pitchClass(note) - pitchClass(key.tonic))]!;
  if (sameNote(noteAtDegree(conventional, key), note)) return conventional;
  const stepIndex = (LETTERS.indexOf(note.letter) - LETTERS.indexOf(key.tonic.letter) + 7) % 7;
  const natural = mod12(pitchClass(key.tonic) + MAJOR_SCALE[stepIndex]!);
  const byLetter: Degree = {
    step: (stepIndex + 1) as Degree["step"],
    accidental: signedSemitones(pitchClass(note) - natural),
  };
  const spellsIt =
    Math.abs(byLetter.accidental) <= 1 && sameNote(noteAtDegree(byLetter, key), note);
  return spellsIt ? byLetter : conventional;
}

/**
 * The note at a degree of a key, spelled by letter. Two kinds of spelling are
 * then traded for the plain note of the same pitch: one that needs a double
 * accidental (bVI in Db is A, not Bbb), and Cb, Fb, E#, or B# where the key's
 * own scale does not have that note (bVII in Db is B; IV in Gb is still Cb).
 */
export function noteAtDegree(degree: Degree, key: Key): NoteName {
  const letter = LETTERS[(LETTERS.indexOf(key.tonic.letter) + degree.step - 1) % 7]!;
  const target = mod12(pitchClass(key.tonic) + degreeSemitones(degree));
  const byLetter: NoteName = {
    letter,
    accidental: signedSemitones(target - LETTER_PITCH_CLASS[letter]),
  };
  const awkward =
    Math.abs(byLetter.accidental) > 1 ||
    (isDisguisedNatural(byLetter) && !inScaleOf(key, byLetter));
  return awkward ? spellPitchClass(target, byLetter.accidental < 0 ? "flat" : "sharp") : byLetter;
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

/**
 * The key on a pitch class as it is conventionally written: the spelling whose
 * signature has fewer accidentals (Db, not C#; B, not Cb; Bbm, not A#m). Six
 * sharps and six flats tie (F# or Gb, D#m or Ebm); `tieGoesFlat` settles it.
 */
export function conventionalKey(pc: number, mode: Key["mode"], tieGoesFlat: boolean): Key {
  const majorTonic = mode === "minor" ? mod12(pc + 3) : mod12(pc);
  const sharps = mod12(majorTonic * 7);
  const fifths = sharps > 6 || (sharps === 6 && tieGoesFlat) ? sharps - 12 : sharps;
  // A fifth up is four letters up; the relative minor is two letters below its major.
  const majorLetter = (((fifths * 4) % 7) + 7) % 7;
  const letter = LETTERS[mode === "minor" ? (majorLetter + 5) % 7 : majorLetter]!;
  const accidental = signedSemitones(mod12(pc) - LETTER_PITCH_CLASS[letter]);
  return { tonic: { letter, accidental }, mode };
}

/** Fold a semitone difference into -6..5 so that it reads as an accidental. */
function signedSemitones(diff: number): number {
  const folded = mod12(diff);
  return folded > 6 ? folded - 12 : folded;
}
