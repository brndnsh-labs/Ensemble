import type { SoloistTradeBars, SoloistTradeChoruses, SoloistTradeWith } from './songbook/types.js';

/**
 * Centralized Action Types for the Ensemble State Manager.
 *
 * State-slice interfaces (ArrangerState, GlobalContext, GrooveState, etc.) live
 * here rather than in their respective `state/*.ts` files. The slices import
 * them back. This keeps the dependency graph one-way (`state/X.ts → types.ts`)
 * instead of the cycle that arose when types.ts imported from each slice.
 */

/**
 * Swing subdivision — which note value the swing ratio is applied to. This is the
 * FEEL of the swing, not its amount (see `docs/guides/` on the swing system): an
 * 8th-note grid and a 16th-note grid at the same `swing` percentage are different
 * idioms, not different intensities of one.
 *
 * Declared as a union rather than `string` (#1264) because it is written by the
 * share-URL writer and read back by an untrusted-input validator; when both sides
 * were `string`, a reader validating against a keyspace the writer never emits was
 * invisible to `tsc`. That is exactly the bug #1257 fixed by hand — the reader
 * checked `[4, 8, 16].includes(...)` against a writer emitting `'8th' | '16th'`, so
 * every share link landed the number `8` and the 16th-note grid was dead for months.
 */
export type SwingSub = '8th' | '16th';

/**
 * Runtime keyspace for {@link SwingSub} — the single source the guard below derives
 * from. Deliberately NOT exported: no caller outside this module needs to enumerate
 * the keyspace today, and exporting it on spec just gives `knip` a dead export to
 * flag. Widen to an export when something actually consumes the list.
 */
const SWING_SUBS: readonly SwingSub[] = ['8th', '16th'];

/**
 * Narrows an untrusted value to {@link SwingSub}. Reducers and the `@direct-mutation`
 * genre-apply path both need this: their payloads arrive as `any` (from `dispatch`,
 * a DOM `<Select>` value, or the e2e bridge), and an `any` assigned through a
 * `Mutable<>` cast type-checks against a narrowed field without complaint — so the
 * union alone does NOT protect those writers. The guard is what makes it real.
 */
export function isSwingSub(value: unknown): value is SwingSub {
    // Derived from SWING_SUBS rather than re-listing the literals: a guard that
    // hardcodes its own copy is the same "two declarations nothing forces to agree"
    // shape this issue exists to remove. The widening cast is safe (readonly
    // SwingSub[] -> readonly string[]) and is what lets `includes` take an unknown.
    return typeof value === 'string' && (SWING_SUBS as readonly string[]).includes(value);
}

/**
 * Chord voicing density, as a saved chart's legacy `density` field spells it (the songbook
 * codec validates it). A keyspace, not a scale; the old voicing stack that branched on
 * `'rich'` / `'thin'` is gone, and nothing in the band reads it.
 *
 * Union rather than `string` for the same reason as `SwingSub` (#1264): the share
 * reader ran this through a numeric `clamp`, which did `parseFloat('rich') → NaN`
 * and substituted `0.5`, silently collapsing every shared rich/thin voicing to
 * standard. Typing the field makes that class of mismatch a compile error.
 */
export type ChordDensity = 'thin' | 'standard' | 'rich';

/** Runtime keyspace for {@link ChordDensity}. See {@link SWING_SUBS} on why it is local. */
const CHORD_DENSITIES: readonly ChordDensity[] = ['thin', 'standard', 'rich'];

/** Narrows an untrusted value to {@link ChordDensity}. See {@link isSwingSub}. */
export function isChordDensity(value: unknown): value is ChordDensity {
    return typeof value === 'string' && (CHORD_DENSITIES as readonly string[]).includes(value);
}

/**
 * One component of a chord display string (root + suffix, with optional slash bass).
 */
export interface ChordNamePart {
    root: string;
    suffix: string;
    bass?: string;
}

/**
 * Pre-formatted chord names in all three notation styles. Built by chords-engine.
 */
export interface FormattedChordNames {
    name: ChordNamePart;
    nns: ChordNamePart;
    roman: ChordNamePart;
}

/**
 * Canonical parsed-chord type produced by `chords-engine.validateProgression()`: the names and
 * the timing a measure-less chart is drawn from. It holds no pitches; the band reads the chord
 * back from its name (`prototypes/v2/lib/legacy-band-chart.ts`'s `legacyChordFacts`). Section-context fields (sectionId, sectionLabel,
 * localIndex, keyIsMinor, repeatIndex) are tagged on by validateProgression after
 * parsing — they're absent on a freshly parsed chord and present once it's been
 * placed in the arrangement.
 */
export interface Chord {
    /** Written measure identity, present for semantic-score playback. */
    measureId?: string;
    // --- Display ---
    absName: string;
    display: FormattedChordNames;

    // --- Temporal / structural ---
    beats: number;
    timeSignature: string;

    // --- Tonal context ---
    key: string;

    // --- Section context (added by validateProgression) ---
    sectionId?: string;
    sectionLabel?: string;
    keyIsMinor?: boolean;
    localIndex?: number;
    repeatIndex?: number;
}

// ---------------------------------------------------------------------------
// State-slice interfaces (lifted here from `state/*.ts` to break the
// state ↔ types cycle the circular-import gate was flagging — dependency-cruiser
// at the time, Biome's `noImportCycles` since #1191).
// ---------------------------------------------------------------------------

export interface Section {
    /** Unique identifier for the section. */
    id: string;
    /** Display name (e.g., "Verse", "Chorus"). */
    label: string;
    /** The chord progression string (e.g., "I | IV"). */
    value: string;
    /** Number of times to repeat this section (default 1). */
    repeat?: number;
    /** Local key for this section (e.g., "G"). */
    key?: string;
    /** Whether the local key should be treated as minor. */
    isMinor?: boolean;
    /** Local time signature for this section (e.g., "3/4"). */
    timeSignature?: string;
    /** Whether this section transitions seamlessly from the previous one (suppresses fills). */
    seamless?: boolean;
    /** Section-local override for the band's target intensity (0–1; read by `band/form/timeline.ts`). Undefined → follow global. */
    targetIntensity?: number;
    /**
     * Per-instrument enabled overrides for this section. Missing keys → follow each
     * instrument's global `enabled` flag. Present keys take precedence.
     */
    instruments?: Partial<Record<SectionInstrumentKey, boolean>>;
}

/**
 * Instrument lanes that a section can override on/off. Names match the state slices
 * (`groove` = drums, `chords` = keys/comping, etc.). `harmony` is kept only because charts
 * store these keys (`Section.instruments`): the band has no harmony lane, but an old chart's
 * override round-trips unchanged rather than being dropped on its next save (#1436).
 */
export type SectionInstrumentKey = 'groove' | 'bass' | 'chords' | 'harmony' | 'soloist';

export interface ArrangerState {
    /** List of song sections. */
    readonly sections: Section[];
    /** Flattened list of parsed chord objects. */
    readonly progression: Chord[];
    /** The global musical key (e.g., "C", "F#"). */
    readonly key: string;
    /** The global time signature (e.g., "4/4", "3/4"). */
    readonly timeSignature: string;
    /** Whether the key is minor. */
    readonly isMinor: boolean;
    /** Notation style ('roman', 'nns', 'name'). */
    readonly notation: string;
    /** Total number of 16th note steps in the song. */
    readonly totalSteps: number;
    /** Map of steps to chord objects. */
    readonly stepMap: Array<{ start: number; end: number; chord: Chord }>;
    /** Map of sections to step ranges. */
    readonly sectionMap: Array<{ id: string; start: number; end: number }>;
    /** Custom rhythmic grouping array (e.g. [3, 2]). */
    readonly grouping: number[] | null;
    /** 6-char hex PRNG seed driving soloist + drum generation for this song. */
    readonly seed: string;
    /** When true, re-roll the seed on every playback instead of reusing a fixed one. */
    readonly randomizeSeed: boolean;
}

/**
 * Which audio source an instrument uses. `synth` is the in-process synthesized
 * voice (the reworked synth-audit voice — the permanent fallback); a
 * `pack:<id>` value names an installed sample pack (synth-audit Epic 6). The
 * legacy `current`/`new` A/B voices were retired in #649 — the reworked voice
 * is now the only synth voice.
 */
export type InstrumentVoice = 'synth' | `pack:${string}`;

/** The four instrument modules that carry a sound source (`voice`). */
export type InstrumentModule = 'groove' | 'bass' | 'chords' | 'soloist';

export interface GrooveState {
    /** Whether the drum engine is active. */
    readonly enabled: boolean;
    /** Which synthesis voice this instrument uses (synth-audit A/B). */
    readonly voice: InstrumentVoice;
    /** Sound-source mode: Auto (follow genre) vs pinned to `voice` (#675). */
    readonly autoSound: boolean;
    /** Volume level. */
    readonly volume: number;
    /** Reverb level. */
    readonly reverb: number;
    /** Humanization percentage (0-100). */
    readonly humanize: number;
    /** Swing percentage (0-100). */
    readonly swing: number;
    /** Swing subdivision ('8th' or '16th'). */
    readonly swingSub: SwingSub;
    /** Cache for decoded drum samples. */
    readonly audioBuffers: any;
    /** Active genre for procedural nuances ('Rock', 'Jazz', 'Funk'). */
    readonly genreFeel: string;
    /** Last gain node for the hi-hat. */
    readonly lastHatGain: GainNode | null;
    /**
     * The currently-ringing *sampled* open/loose hi-hat voice (drum pack #662),
     * eligible to be choked by the next hat hit (#679) — the sample-path analog
     * of `lastHatGain`. Structural `{ choke }` to keep types.ts import-free; a
     * `SampleVoiceHandle` (sample-voice.ts) is assignable to it. Held on state
     * (not module-global) so each engine host has its own, like `lastHatGain`.
     */
    readonly lastSampledHatVoice: { readonly choke: (when: number) => void } | null;
    /** Last gain node for the ride cymbal. */
    readonly lastRideGain: GainNode | null;
    /** Last gain node for the crash cymbal. */
    readonly lastCrashGain: GainNode | null;
    /** Last selected smart genre. */
    readonly lastSmartGenre: string;
    /** Genre queued for the next measure. */
    readonly pendingGenreFeel: { genreName?: string; feel?: string } | null;
}

export interface ChordState {
    /** Whether the accompanist is active. */
    readonly enabled: boolean;
    /** Which synthesis voice this instrument uses (synth-audit A/B). */
    readonly voice: InstrumentVoice;
    /** Sound-source mode: Auto (follow genre) vs pinned to `voice` (#675). */
    readonly autoSound: boolean;
    /** The comping style ('smart', 'pad', etc). */
    readonly style: string;
    /** Output gain multiplier. */
    readonly volume: number;
    /** Reverb send amount. */
    readonly reverb: number;
}

export interface BassState {
    /** Whether the bass engine is active. */
    readonly enabled: boolean;
    /** Which synthesis voice this instrument uses (synth-audit A/B). */
    readonly voice: InstrumentVoice;
    /** Sound-source mode: Auto (follow genre) vs pinned to `voice` (#675). */
    readonly autoSound: boolean;
    /** Volume level. */
    readonly volume: number;
    /** Reverb level. */
    readonly reverb: number;
    /** Playing style ID (e.g., 'walking', 'funk'). */
    readonly style: string;
    /** Last gain node for dynamic continuity. */
    readonly lastBassGain: GainNode | null;
}

/**
 * One active polyphonic voice in the main-thread synth layer. Tracked so the
 * voice manager can release voices when their duration expires.
 */
export interface SoloistVoice {
    gain: GainNode;
    time: number;
    duration: number;
    nodes: AudioNode[];
}

/**
 * Synth voice tracking, mutated by the synth layer. Not persisted.
 */
export interface SoloistAudio {
    /** Active polyphonic voices. */
    readonly activeVoices: SoloistVoice[];
    /** Last frequency actually rendered by the synth (used for portamento). */
    readonly lastRenderedFreq: number | null;
}

export interface SoloistState {
    // === Configuration (user-settable) — flat at the top of the slice. ===

    /** Whether the soloist is active. */
    readonly enabled: boolean;
    /** Which synthesis voice this instrument uses (synth-audit A/B). */
    readonly voice: InstrumentVoice;
    /** Sound-source mode: Auto (follow genre) vs pinned to `voice` (#675). */
    readonly autoSound: boolean;
    /** The soloist mode ('monophonic' or 'guitar'; unknown values normalize to monophonic). */
    readonly mode: string;
    /** #856 — Auto phrasing mode: when true, `mode` is derived from the lead
     *  voice + genre (guitar pack → guitar). An explicit pick pins it (false). */
    readonly autoMode: boolean;
    /** Mix volume (0.0 - 1.0). */
    readonly volume: number;
    /** Reverb level. */
    readonly reverb: number;
    /** Trading with the player on the band engine: 'off', 'soloist' or 'drums'. */
    readonly tradeWith: SoloistTradeWith;
    /** How many bars a traded turn lasts: 2, 4 or 8. */
    readonly tradeBars: SoloistTradeBars;
    /** How many traded choruses before the head returns; 0 keeps trading forever. */
    readonly tradeChoruses: SoloistTradeChoruses;
    // `motifTracking` and `pinnedProfile` were removed in #866, `complexity` in #1070, and
    // `preset`, `octave`, `phrasingIntensity`, `tradeMode` and `tradeSilenced` in #1424:
    // the old engine's settings, which nothing reads since the band engine replaced it.

    // === Main-thread synth / voice tracking ===
    readonly audio: SoloistAudio;
}

/**
 * A single instrument's mix bus: volume gain, reverb send, EQ, and optional
 * stereo panning / sidechain ducking. Built by `initAudio()` in `engine.ts`.
 */
export interface InstrumentBus {
    /** Bus volume gain node — the bus input that the synth voices connect to. */
    readonly gain: GainNode;
    /** Reverb send gain node, tapped off `gain`. */
    readonly reverb: GainNode;
    /** Bus EQ entry node (highpass by default; per-instrument tone shaping follows). */
    readonly eq: BiquadFilterNode;
    /** Stereo panner — populated for chords only, `null` otherwise. */
    readonly panner: StereoPannerNode | null;
    /** Sidechain ducking gain node — populated for bass only, `null` otherwise. */
    readonly sidechain: GainNode | null;
}

/**
 * One preset for the algorithmic reverb: `size` scales the comb delay lengths,
 * `rt60` is the -60 dB decay time in seconds, `damping` is the comb lowpass
 * cutoff in Hz (a darker tail uses a lower cutoff).
 */
export interface ReverbPreset {
    readonly size: number;
    readonly rt60: number;
    readonly damping: number;
}

/**
 * The shared algorithmic (Schroeder/Freeverb) reverb. Exposes `input` and
 * `output` `AudioNode`s — a drop-in replacement for the old convolver. Built in
 * `public/engine/reverb.ts`.
 */
export interface AlgorithmicReverb {
    /** Node bus sends connect here (downstream of the pre-filter). */
    readonly input: AudioNode;
    /** Wet output — connects to the master gain. */
    readonly output: AudioNode;
}

/**
 * The master output chain: every bus sums into `gain`, then runs
 * `gain → glue → saturator → limiter → destination`. `reverb` is the shared
 * reverb return, fed via `reverbPreFilter`.
 */
export interface MasterChain {
    /** Master volume gain node — every instrument bus sums here. */
    readonly gain: GainNode;
    /** Gentle "glue" bus compressor — evens out full-band peaks before the brick-wall limiter. */
    readonly glue: DynamicsCompressorNode;
    /** Master soft-clipper / saturator. */
    readonly saturator: WaveShaperNode;
    /** Master safety limiter. */
    readonly limiter: DynamicsCompressorNode;
    /** The shared algorithmic reverb (replaces the old static convolver). */
    readonly reverb: AlgorithmicReverb;
    /** HPF/LPF pre-filter feeding the reverb (the node bus sends connect to). */
    readonly reverbPreFilter: BiquadFilterNode;
}

/**
 * The full Web Audio routing graph, built once by `initAudio()`. `null` until
 * the audio context exists. Either fully populated or absent — never partial.
 */
export interface AudioGraph {
    /** The master output / reverb-return chain. */
    readonly master: MasterChain;
    /** Per-instrument mix buses. */
    readonly chords: InstrumentBus;
    readonly bass: InstrumentBus;
    readonly soloist: InstrumentBus;
    readonly drums: InstrumentBus;
}

export interface GlobalContext {
    /** The Web Audio API context. */
    readonly audio: AudioContext | null;
    /** The full Web Audio routing graph (master chain + per-instrument buses), or `null` before `initAudio()` runs. */
    readonly audioGraph: AudioGraph | null;
    /** Whether the sequencer is currently playing. */
    readonly isPlaying: boolean;
    /** Beats per minute (40-240). */
    readonly bpm: number;
    /**
     * Section-practice ("drill") — the absolute step at which the next play
     * should begin. Normally 0; set to a section's first step by "start from
     * here" (#1016). `startPlayback` and the count-in
     * completion seed `step` from this, then it resets to 0 on stop.
     */
    readonly startStep: number;
    /** Global band intensity/energy level (0.0 - 1.0). */
    readonly bandIntensity: number;
    /** Whether the intensity automatically drifts over time. */
    readonly autoIntensity: boolean;
    /** Whether the metronome is active. */
    readonly metronome: boolean;
    /** Master output volume. */
    readonly masterVolume: number;
    /** Whether the metronome count-in is enabled. */
    readonly countIn: boolean;
}

/**
 * Strips `readonly` from every field of T. Use sparingly at write sites:
 *
 * - Reducers: alias once at function top — `const g = groove as Mutable<typeof groove>;`
 * - @direct-mutation engine sites: inline — `(groove as Mutable<typeof groove>).lastHatGain = gain;`
 *
 * Dynamic-key writes (`slice[key] = value`) inside reducers may still use
 * `(slice as any)[key]` — those are unchecked by intent.
 */
export type Mutable<T> = { -readonly [K in keyof T]: T[K] };

export interface EnsembleState {
    arranger: ArrangerState;
    playback: GlobalContext;
    groove: GrooveState;
    bass: BassState;
    soloist: SoloistState;
    chords: ChordState;
}

/** The state slice each `SET_PARAM` module names, by its canonical slice name. */
export interface ParamSlices {
    playback: GlobalContext;
    arranger: ArrangerState;
    groove: GrooveState;
    chords: ChordState;
    bass: BassState;
    soloist: SoloistState;
}

/** The slices `SET_PARAM` can write. */
export type ParamModule = keyof ParamSlices;

/**
 * A generic write of one slice field. `param` must be a field the named slice declares, so a
 * dispatch naming a removed or misspelled field fails typecheck, and each reducer drops (and
 * warns about) one that slips past the compiler instead of creating it. `value` is not typed
 * per field.
 */
export type ActionPayloadSetParam = {
    [M in ParamModule]: { module: M; param: keyof ParamSlices[M] & string; value: unknown };
}[ParamModule];

export interface ActionPayloadSetVolume {
    module: InstrumentModule;
    value: number;
}

export interface ActionPayloadSetReverb {
    module: InstrumentModule;
    value: number;
}

export interface ActionPayloadSetInstrumentVoice {
    module: InstrumentModule;
    voice: InstrumentVoice;
    /**
     * Sound-source mode (#675). `true` = Auto (voice follows the genre map);
     * `false` = pinned to this explicit voice. Omitted → `autoSound` unchanged
     * (a bare voice set, e.g. pack eviction reset, doesn't flip the mode).
     */
    auto?: boolean;
}

export interface ActionPayloadSetGenreFeel {
    genreName?: string;
    feel?: string;
    swing?: number;
    sub?: string;
    chord?: string;
    bass?: string;
}

export interface ActionPayloadMap {
    SET_PARAM: ActionPayloadSetParam;
    SET_BAND_INTENSITY: number;
    SET_AUTO_INTENSITY: boolean;
    SET_BPM: number;
    SET_VOLUME: ActionPayloadSetVolume;
    SET_REVERB: ActionPayloadSetReverb;
    SET_SOLOIST_MODE: string;
    SET_SONG_SEED: string;
    SET_INSTRUMENT_VOICE: ActionPayloadSetInstrumentVoice;
    SET_SWING: number;
    SET_SWING_SUB: string;
    SET_HUMANIZE: number;
    SET_GENRE_FEEL: ActionPayloadSetGenreFeel;
    SET_METRONOME: boolean;
    SET_NOTATION: string;
    /** Section-practice: seed the step the next play begins from (#1016). */
    SET_START_STEP: number;
    PROG_VALIDATED?: undefined;
}

/**
 * Canonical public dispatcher. The conditional tuple keeps payload-less
 * actions ergonomic while requiring the matching payload everywhere else.
 */
export type Dispatch = <K extends keyof ActionPayloadMap>(
    ...args: K extends keyof ActionPayloadMap
        ? undefined extends ActionPayloadMap[K]
            ? [action: K, payload?: ActionPayloadMap[K]]
            : [action: K, payload: ActionPayloadMap[K]]
        : never
) => void;

/**
 * Discriminated union over all known actions. Each reducer's switch on
 * `action.type` narrows `action.payload` to the matching payload type.
 * `Dispatch`, `ACTIONS`, and this union all derive from the same payload map.
 */
export type Action = {
    [K in keyof ActionPayloadMap]-?: { type: K; payload: ActionPayloadMap[K] };
}[keyof ActionPayloadMap];

export const ACTIONS = {
    // --- Global ---
    SET_PARAM: 'SET_PARAM',
    SET_BAND_INTENSITY: 'SET_BAND_INTENSITY',
    SET_AUTO_INTENSITY: 'SET_AUTO_INTENSITY',
    SET_BPM: 'SET_BPM',

    // --- Instrument Settings ---
    SET_VOLUME: 'SET_VOLUME',
    SET_REVERB: 'SET_REVERB',
    SET_SOLOIST_MODE: 'SET_SOLOIST_MODE',
    SET_SONG_SEED: 'SET_SONG_SEED',
    SET_INSTRUMENT_VOICE: 'SET_INSTRUMENT_VOICE',

    // --- Groove / Drums ---
    SET_SWING: 'SET_SWING',
    SET_SWING_SUB: 'SET_SWING_SUB',
    SET_HUMANIZE: 'SET_HUMANIZE',
    SET_GENRE_FEEL: 'SET_GENRE_FEEL',

    // --- Options / Arranger ---
    SET_METRONOME: 'SET_METRONOME',
    SET_NOTATION: 'SET_NOTATION',
    SET_START_STEP: 'SET_START_STEP',

    // --- Signal-only / Lifecycle (payload-less notifications) ---
    PROG_VALIDATED: 'PROG_VALIDATED',
} as const satisfies { readonly [K in keyof ActionPayloadMap]-?: K };
