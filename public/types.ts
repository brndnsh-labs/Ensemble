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
 * Chord voicing density. Consumers in `chords-styles.ts` branch on the literal
 * (`density === 'rich'` / `=== 'thin'`), so this is a keyspace, not a scale.
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
 * The `?bnd=` share-URL wire payload — the base64'd JSON v1's `compressBandSettings`
 * emitted (its writer went with the v1 shell, #1358) and v1's `decompressBandSettings` read
 * back (gone with v1's load/save layer, #1424). `npm run audition-link` still writes it.
 * Keys are deliberately terse; the URL carried them on every share link.
 *
 * WHY THIS EXISTS (#1264). v1's `decompressBandSettings` used to return `any`, so every
 * `band.*` read was untyped and `Object.assign(slice, {...})` accepted it even where
 * the slice field was a narrowed union. Writer/reader keyspace drift was therefore
 * invisible to `tsc`, and the only way to find it was by hand, one field at a time —
 * which is how all three known instances were found:
 *
 *   - `g.ss` — writer emitted `'8th' | '16th'`, reader validated `[4, 8, 16].includes(...)`
 *   - `c.d`  — writer emitted `'thin' | 'standard' | 'rich'`, reader ran a numeric `clamp`
 *   - `c.s`  — reader validated against the picker list, rejecting the genre-routed `'arp'`
 *
 * All three shipped and survived for months (#1257 fixed the instances; this types the
 * cause). BOTH sides are annotated with this interface, which is the point: a writer
 * that starts emitting a different keyspace fails to compile against the reader's
 * expectation, instead of silently landing a default on every recipient's session.
 *
 * This does NOT replace runtime validation — the payload is untrusted input and every
 * reader still guards. It removes the *silent* case, where a guard checks a keyspace
 * the writer never produces and `tsc` says nothing.
 */
export interface SharedBandPayload {
    /** Mixer-settings schema version; volumes/reverbs are ignored unless it matches. */
    mv?: number;
    /** Legacy alias for `mv` accepted by the reader. */
    mixerVersion?: number;
    /** Soloist lane (plus the arranger seed, which rides along here). */
    s?: {
        e?: 0 | 1;
        s?: string;
        p?: string;
        o?: number;
        v?: number;
        r?: number;
        m?: string;
        am?: 0 | 1;
        /** Arranger seed — sanitized and length-capped on read. */
        sd?: string;
    };
    /** Bass lane. */
    b?: { e?: 0 | 1; s?: string; o?: number; v?: number; r?: number };
    /** Chords lane. `d` is a keyspace, not a 0..1 scale — see {@link ChordDensity}. */
    c?: { e?: 0 | 1; s?: string; o?: number; v?: number; r?: number; d?: ChordDensity };
    /** Harmony lane. */
    h?: { e?: 0 | 1; s?: string; o?: number; v?: number; r?: number; c?: number };
    /** Groove lane. `ss` is a subdivision keyspace — see {@link SwingSub}. */
    g?: { e?: 0 | 1; v?: number; r?: number; sw?: number; ss?: SwingSub; hu?: number };
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
 * Canonical parsed-chord type produced by `chords-engine.validateProgression()` and
 * consumed by every musical engine. Section-context fields (sectionId, sectionLabel,
 * localIndex, keyIsMinor, repeatIndex) are tagged on by validateProgression after
 * parsing — they're absent on a freshly parsed chord and present once it's been
 * placed in the arrangement.
 */
export interface Chord {
    /** Written measure identity, present for semantic-score playback. */
    measureId?: string;
    // --- Display ---
    romanName: string;
    absName: string;
    nnsName: string;
    display: FormattedChordNames;

    // --- Pitch content (audio-critical) ---
    rootMidi: number;
    bassMidi: number | null;
    freqs: number[];
    intervals: number[];

    // --- Quality / harmony ---
    quality: string;
    is7th: boolean;
    isMinor: boolean;

    // --- Temporal / structural ---
    beats: number;
    timeSignature: string;

    // --- Tonal context ---
    key: string;

    // --- Parser metadata (used by the chart editor) ---
    charStart: number;
    charEnd: number;

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
    /** Section-local override for conductor target intensity (0–1). Undefined → follow global. */
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
    readonly sectionMap: Array<{ id: string; start: number; end: number; label: string }>;
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
 * is now the only synth voice, and persisted `current`/`new` values migrate to
 * `synth` on hydrate (see `hydrateVoice`).
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
 * A pitch bend-and-release gesture on a soloist note (#744 Slice 2) — the
 * expressive "cry" of a blues lead: the written note bends UP to a peak and
 * (optionally) releases back down to it.
 *
 * This is deliberately **distinct from `bendStartInterval`**, the one-way
 * bend-*in* scalar (start an interval off the written pitch, ramp *to* it) used
 * widely by the bass engine, the soloist device system, and MIDI export. A
 * bend-and-release starts *on* the note and goes *above* it — a different shape
 * the scalar can't represent. Keeping them separate keeps each legible; the
 * scalar stays the ubiquitous simple case, this object the expressive one.
 *
 * Fractions are 0..1 of the note's duration. The AUDIO renderers honor it — the
 * synth voice (`applyPitchEnvelope`), the sampled seam (`scheduleSampleBend`),
 * and offline *audio* export (same scheduler path). MIDI export renders it too
 * (`midi-worker-logic.ts emitBendGesture`, #854). The producer is the live
 * phrase-first engine (#869); pre-#869 only the deleted legacy engine set it, so
 * the whole gesture was dark in production despite the render/export being wired.
 */
export interface PitchBendGesture {
    /** Peak offset above the written note, in semitones (+1 = ½-step, +2 = whole). */
    peakSemitones: number;
    /** When the bend leaves the written pitch (0..1 of duration). */
    onsetFrac: number;
    /** When the bend reaches its peak (0..1; should exceed `onsetFrac`). */
    peakFrac: number;
    /** When the bend returns to the written pitch (0..1; > `peakFrac`). Omit = hold the bend. */
    releaseFrac?: number;
}

/**
 * Continuous-pitch expression on a soloist note (#744). A semantic home for
 * expressive gestures kept off the simple `bendStartInterval` scalar; Slice 3
 * adds slide/scoop/fall fields here.
 */
export interface SoloistExpression {
    bend?: PitchBendGesture;
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
 * Main-thread synth/voice tracking. Lives on the audio thread (not the worker)
 * and is mutated by the synth layer. Not persisted, not synced to the worker
 * (the worker computes its own `lastFreq` for engine reads).
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
    /** Optional playing style (e.g. 'jazz', 'blues', 'smart'). */
    readonly style?: string;
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
 * `output` `AudioNode`s — a drop-in replacement for the old convolver — plus
 * real-time setters that morph the space. Built in `public/engine/reverb.ts`.
 */
export interface AlgorithmicReverb {
    /** Node bus sends connect here (downstream of the pre-filter). */
    readonly input: AudioNode;
    /** Wet output — connects to the master gain. */
    readonly output: AudioNode;
    /** Set the -60 dB decay time in seconds, ramped from `when`. */
    setDecay(rt60: number, when: number): void;
    /** Scale the comb delay lengths (room size), ramped from `when`. */
    setSize(scale: number, when: number): void;
    /** Set the comb damping lowpass cutoff in Hz, ramped from `when`. */
    setDamping(cutoffHz: number, when: number): void;
    /** Apply size + decay + damping from a preset in one call. */
    applyPreset(preset: ReverbPreset, when: number): void;
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

export interface ActionPayloadSetParam {
    module: string;
    param: string;
    value: unknown;
}

export interface ActionPayloadSetVolume {
    module: string;
    value: number;
}

export interface ActionPayloadSetReverb {
    module: string;
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
    soloist?: string;
}

export interface ActionPayloadMap {
    SET_PARAM: ActionPayloadSetParam;
    SET_BAND_INTENSITY: number;
    SET_AUTO_INTENSITY: boolean;
    SET_BPM: number | string;
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
    // --- Global / Conductor ---
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
