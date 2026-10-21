// The voicings engine's public surface (shell voicings and triad grips, #1585/#1588). The music
// stand reaches it through here: `voiceBandChart` voices a whole chart, `NECK_INSTRUMENTS` maps a
// pref to its instrument, and the neck view (#1586) and stand integration (#1587) read grips,
// fingers and motion from the rest. Tests import internals from their own modules.

export type { Barre } from './fingering';
export { barres, fingerMap } from './fingering';
export { HOME_FRETS } from './home-window';
export { GUITAR, UKULELE } from './instruments';
export type { FingerMove, SharedNote } from './motion';
export {
    COUNT_WORDS,
    fingerMoves,
    rootMove,
    sharedNotes,
    spokenDegree,
} from './motion';
export { DEGREES, spellDegree } from './theory';
export type { Degree, HomeWindow, InstrumentDef, Note, Voicing } from './types';
export type { NeckPrefs, VoicedBandChord } from './voice-chart';
export { NECK_INSTRUMENTS, voiceBandChart } from './voice-chart';
export { allPositions, build, gripMidis, inHome, inversionOf, voiceChart } from './voicing';
