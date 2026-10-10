// The shell-voicing engine's public surface (#1585). The music stand reaches it through here:
// `voiceBandChart` voices a whole chart, and the neck view (#1586) and stand integration (#1587)
// read grips, fingers and motion from the rest.

export type { ShellChord } from './adapter';
export { shellChord, spellRoot } from './adapter';
export { fingerMap } from './fingering';
export { GUITAR, UKULELE, UKULELE_LOW_G } from './instruments';
export type { FingerMove, FingerMoveKind, RootMove, TravelSummary } from './motion';
export { fingerMoves, handTravel, rootMove } from './motion';
export { DEGREES, QUALITIES, spellDegree } from './theory';
export * from './types';
export type { ShellPrefs, VoicedBandChord } from './voice-chart';
export { voiceBandChart } from './voice-chart';
export { allPositions, build, center, inHome, voiceChart, voiceNext } from './voicing';
