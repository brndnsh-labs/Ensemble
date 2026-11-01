/**
 * The band engine's public surface. Hosts (the v2 runtime, the render CLI, tests) import
 * from here; nothing outside `band/` reaches into its modules.
 */

export type { LeadRole } from './arrange/cycle.js';
export type { PassWindow } from './arrange/plan.js';
export { leadRoleAt } from './arrange/plan.js';
export type {
    BandEvent,
    BandSettings,
    CompInstrument,
    DrumPiece,
    Lane,
    LeadInstrument,
    StyleId,
} from './core/types.js';
export { DEFAULT_SETTINGS, PPQ } from './core/types.js';
export type { Timeline } from './form/timeline.js';
export { barAtTick, compileTimeline, eventBoundaries, secondsAt } from './form/timeline.js';
export type { PassMemory } from './perform.js';
export { performPass } from './perform.js';
export { GM_DRUMS, toMidi } from './sinks/midi.js';
export { STYLE_IDS, STYLES } from './styles/index.js';
export type { ChordFacts } from './theory/chord.js';
export { parseChord } from './theory/chord.js';
export { notePc } from './theory/pitch.js';
