/**
 * The band engine's public surface. Hosts (the v2 runtime, the render CLI, tests) import
 * from here; nothing outside `band/` reaches into its modules.
 */

export type { BarPlan, PassWindow } from './arrange/plan.js';
export type {
    BandEvent,
    BandSettings,
    CompInstrument,
    DrumHit,
    DrumPiece,
    Lane,
    LeadInstrument,
    PitchedNote,
    StyleId,
} from './core/types.js';
export { DEFAULT_SETTINGS, LANES, PPQ } from './core/types.js';
export type { Bar, Timeline } from './form/timeline.js';
export { compileTimeline, secondsAt } from './form/timeline.js';
export type { PassMemory, PassResult } from './perform.js';
export { performPass } from './perform.js';
export { LEAD_INSTRUMENTS } from './players/lead/instruments.js';
export { toMidi } from './sinks/midi.js';
export { STYLE_IDS, STYLES } from './styles/index.js';
export type { ChordFacts } from './theory/chord.js';
export { parseChord } from './theory/chord.js';
export type { KeyContext } from './theory/pitch.js';
export { notePc } from './theory/pitch.js';
