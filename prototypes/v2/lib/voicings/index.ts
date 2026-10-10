// The voicings engine's public surface (shell voicings and triad grips, #1585/#1588). The music
// stand reaches it through here: `voiceBandChart` voices a whole chart, `NECK_INSTRUMENTS` maps a
// pref to its instrument, and the neck view (#1586) and stand integration (#1587) read grips,
// fingers and motion from the rest.

export type { VoicingChord } from './adapter';
export { spellRoot, voicingChord } from './adapter';
export type { Barre } from './fingering';
export { barres, fingerMap, fingerNotes } from './fingering';
export { GUITAR, UKULELE, UKULELE_LOW_G } from './instruments';
export type { FingerMove, FingerMoveKind, RootMove, TravelSummary } from './motion';
export { barreStrings, fingerMoves, handTravel, rootMove } from './motion';
export { DEGREES, QUALITIES, spellDegree } from './theory';
export * from './types';
export type { NeckPrefs, VoicedBandChord } from './voice-chart';
export { NECK_INSTRUMENTS, voiceBandChart } from './voice-chart';
export {
    allPositions,
    build,
    center,
    inHome,
    inversionOf,
    voiceChart,
    voiceNext,
} from './voicing';
