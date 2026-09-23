/**
 * The band engine's public surface. Hosts (the v2 runtime, the render CLI, tests) import
 * from here; nothing outside `band/` reaches into its modules.
 */

export type { BarPlan, PassWindow } from './arrange/plan.js';
export type {
    BandEvent,
    BandSettings,
    DrumHit,
    DrumPiece,
    Lane,
    PitchedNote,
    StyleId,
} from './core/types.js';
export { DEFAULT_SETTINGS, LANES, PPQ } from './core/types.js';
export type { Bar, Timeline } from './form/timeline.js';
export { compileTimeline, secondsAt } from './form/timeline.js';
export type { PassMemory, PassResult } from './perform.js';
export { performPass } from './perform.js';
export { toMidi } from './sinks/midi.js';
export { STYLE_IDS, STYLES } from './styles/index.js';
