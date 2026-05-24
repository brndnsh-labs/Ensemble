/**
 * Centralized Action Types for the Ensemble State Manager.
 *
 * State-slice interfaces (ArrangerState, GlobalContext, GrooveState, etc.) live
 * here rather than in their respective `state/*.ts` files. The slices import
 * them back. This keeps the dependency graph one-way (`state/X.ts → types.ts`)
 * instead of the cycle that arose when types.ts imported from each slice.
 */

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

export interface PlaybackIntent {
    /** 0-1 */
    syncopation: number;
    /** 0-1 */
    anticipation: number;
    /** Dilla feel; 0-1 */
    layBack: number;
    /** 0-1 */
    density: number;
}

export interface ModalsState {
    settings: boolean;
    editor: boolean;
    share: boolean;
    generateSong: boolean;
    manual: boolean;
    /** Audition permalink (?autoplay=1) landing — see AuditionOverlay. */
    audition: boolean;
}

// ---------------------------------------------------------------------------
// State-slice interfaces (lifted here from `state/*.ts` to break the
// state ↔ types cycle that depcruise was flagging).
// ---------------------------------------------------------------------------

export interface Section {
    /** Unique identifier for the section. */
    id: string;
    /** Display name (e.g., "Verse", "Chorus"). */
    label: string;
    /** The chord progression string (e.g., "I | IV"). */
    value: string;
    /** Optional color hex code for UI accent. */
    color?: string;
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
}

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
    /** Whether the current progression is valid. */
    readonly valid: boolean;
    /** Total number of 16th note steps in the song. */
    readonly totalSteps: number;
    /** Map of steps to chord objects. */
    readonly stepMap: Array<{ start: number; end: number; chord: Chord }>;
    /** Map of measures to time signatures. */
    readonly measureMap: Array<{ start: number; end: number; ts: string }>;
    /** Map of sections to step ranges. */
    readonly sectionMap: Array<{ id: string; start: number; end: number; label: string }>;
    /** Undo history stack (JSON strings). */
    readonly history: string[];
    /** ID of the last edited section. */
    readonly lastInteractedSectionId: string;
    /** Name of the last loaded chord preset. */
    readonly lastChordPreset: string;
    /** ID of a section that was programmatically mutated. */
    readonly mutatedSectionId: string | null;
    /** Whether the arrangement has been manually modified. */
    readonly isDirty: boolean;
    /** Custom rhythmic grouping array (e.g. [3, 2]). */
    readonly grouping: number[] | null;
    /** 6-char hex PRNG seed driving soloist + drum generation for this song. */
    readonly seed: string;
}

export interface ConductorState {
    /** Target intensity level for auto-intensity drift. */
    readonly targetIntensity: number;
    /** Internal step size for auto-intensity. */
    readonly stepSize: number;
    /** Structural analysis of the song arrangement. */
    readonly form: object | null;
    /** Number of times the current section has looped. */
    readonly loopCount: number;
    /** Number of times the entire song has looped. */
    readonly formIteration: number;
}

export interface Instrument {
    /** Instrument name (e.g., 'Kick'). */
    name: string;
    /** Display emoji/symbol. */
    symbol: string;
    /** Sequencer steps (0=off, 1=on, 2=accent). */
    steps: number[];
    /** Whether the instrument is muted. */
    muted: boolean;
}

export interface PocketState {
    /** -1.0 (behind) to 1.0 (ahead) */
    globalDrive: number;
    /** 0.0 (loose/jittery) to 1.0 (grid-locked) */
    tightness: number;
    /** 0.0 to 1.0 (how much bass follows Kick) */
    bassGravity: number;
    /** 0.0 to 1.0 (how much chords follow Bass) */
    chordGravity: number;
    /** 0.0 to 1.0 (how much soloist follows Snare/Hats) */
    soloistGravity: number;
}

/**
 * Which synthesis implementation an instrument uses. `current` is the
 * original voice; `new` is the synth-audit reworked voice. The per-instrument
 * settings toggle switches between them for A/B audition. Extended by
 * synth-audit Epic 6 with `pack:<id>` values for sample packs.
 */
export type InstrumentVoice = 'current' | 'new';

export interface GrooveState {
    /** Whether the drum engine is active. */
    readonly enabled: boolean;
    /** Which synthesis voice this instrument uses (synth-audit A/B). */
    readonly voice: InstrumentVoice;
    /** List of drum instruments. */
    readonly instruments: Instrument[];
    /** Volume level. */
    readonly volume: number;
    /** Reverb level. */
    readonly reverb: number;
    /** Number of measures in the loop (1-8). */
    readonly measures: number;
    /** Currently visible measure for editing. */
    readonly currentMeasure: number;
    /** Whether to scroll grid during playback. */
    readonly followPlayback: boolean;
    /** Humanization percentage (0-100). */
    readonly humanize: number;
    /** Swing percentage (0-100). */
    readonly swing: number;
    /** Swing subdivision ('8th' or '16th'). */
    readonly swingSub: string;
    /** Name of the last loaded drum preset. */
    readonly lastDrumPreset: string;
    /** Thematic seed for deterministic generation. */
    readonly seed: string;
    /** Cache for decoded drum samples. */
    readonly audioBuffers: any;
    /** Active genre for procedural nuances ('Rock', 'Jazz', 'Funk'). */
    readonly genreFeel: string;
    /** Whether a drum fill is currently being played. */
    readonly fillActive: boolean;
    /** Transient storage for the generated fill pattern. */
    readonly fillSteps: object;
    /** Last gain node for the hi-hat. */
    readonly lastHatGain: GainNode | null;
    /** Last gain node for the ride cymbal. */
    readonly lastRideGain: GainNode | null;
    /** Last gain node for the crash cymbal. */
    readonly lastCrashGain: GainNode | null;
    /** Step index where the current fill began. */
    readonly fillStartStep: number;
    /** Length of the current fill in steps. */
    readonly fillLength: number;
    /** 16-bit mask of the current snare pattern. */
    readonly snareMask: number;
    /** Whether a crash cymbal is queued for the next downbeat. */
    readonly pendingCrash: boolean;
    /** Whether generative fills/variations are enabled. */
    readonly creativity: boolean;
    /** Random seeds for each song section. */
    readonly sectionSeedMap: object;
    /** Unified rhythmic pocket configuration. */
    readonly pocket: PocketState;
    /** Last selected smart genre. */
    readonly lastSmartGenre: string;
    /** Genre queued for the next measure. */
    readonly pendingGenreFeel: { genreName?: string; feel?: string } | null;
    /** Beats until genre switch. */
    readonly genreSwitchCountdown: number | null;
    /** Pre-calculated section orchestration map. */
    readonly orchestrationMap: any[] | null;
    /** Pre-calculated song-wide fill map. */
    readonly fillMap: Record<number, any> | null;
    /** Pre-calculated soloist accent catching map. */
    readonly accentMap: Record<number, any> | null;
    /** Absolute playback step when the current seed maps were generated. */
    readonly seedTimelineStartStep: number;
    /** Pre-calculated pattern variations for the current preset. */
    readonly variations: any[] | null;
    /** Map of scheduled drum events. */
    readonly buffer: Map<number, any>;
}

export interface ChordState {
    /** Whether the accompanist is active. */
    readonly enabled: boolean;
    /** Which synthesis voice this instrument uses (synth-audit A/B). */
    readonly voice: InstrumentVoice;
    /** The comping style ('smart', 'pad', etc). */
    readonly style: string;
    /** Output gain multiplier. */
    readonly volume: number;
    /** Reverb send amount. */
    readonly reverb: number;
    /** Base MIDI octave for voicing. */
    readonly octave: number;
    /** Voicing density ('thin', 'standard', 'rich'). */
    readonly density: string;
    /** Index of the currently playing chord (UI). */
    readonly lastActiveChordIndex: number | null;
    /** Index of the last scheduled chord (Internal). */
    readonly scheduledChordIndex: number | null;
    /** Scheduled notes buffer. */
    readonly buffer: Map<number, any>;
    /** 16-bit mask of the current comping pattern. */
    readonly rhythmicMask: number;
    /** Optional instrument name. */
    readonly instrument?: string;
}

export interface BassState {
    /** Whether the bass engine is active. */
    readonly enabled: boolean;
    /** Which synthesis voice this instrument uses (synth-audit A/B). */
    readonly voice: InstrumentVoice;
    /** Volume level. */
    readonly volume: number;
    /** Reverb level. */
    readonly reverb: number;
    /** Frequency of the last played note. */
    readonly lastFreq: number | null;
    /** Frequency of the note currently ringing. */
    readonly lastPlayedFreq: number | null;
    /** Map of scheduled notes from the worker. */
    readonly buffer: Map<number, any>;
    /** Base MIDI octave. */
    readonly octave: number;
    /** Playing style ID (e.g., 'walking', 'funk'). */
    readonly style: string;
    /** Counter for "busy" playing periods. */
    readonly busySteps: number;
    /** Last MIDI note value played. */
    readonly lastMidiPlayed: number | null;
    /** Last gain node for dynamic continuity. */
    readonly lastBassGain: GainNode | null;
}

/**
 * The melodic job a seed note plays inside the SRDC head. Used by the
 * arrangement layer to decide which notes get accompaniment / phrasing support.
 */
export type SeedSupportRole = 'pickup' | 'line' | 'accent' | 'anchor' | 'cadence' | 'sustain';

/** Guitar-specific realization hints attached to each seed note. */
export interface SeedGuitarSupportHint {
    allowDoubleStop: boolean;
    intervalPalette: 'tight' | 'open' | 'blues';
    preferBelow: boolean;
}

/** Hints used by accompaniment instruments to support the seed melody without crowding it. */
export interface SeedSupportHints {
    role: SeedSupportRole;
    sustainBias: number;
    guitar: SeedGuitarSupportHint;
}

/**
 * One note in the SRDC head produced by `generateSessionSeed()`. The full session
 * seed is the canonical "Head melody" the soloist re-performs on Loop 0 and
 * paraphrases on later loops.
 */
export interface SeedNote {
    /** Global step target within the loop. */
    step: number;
    /** MIDI note value. */
    midi: number;
    /** True if it's a structural anchor (downbeat / phrase start). */
    isAnchor: boolean;
    /** Suggested duration in steps. */
    durationSteps: number;
    /** Suggested velocity (0.0 - 1.0). */
    velocity: number;
    /** Optional micro-timing offset in seconds for off-grid phrasing. */
    timingOffset?: number;
    /** Optional triplet slot tag for audits and playback. */
    tripletPlacement?: 't1' | 't2';
    /** Optional accompaniment hints that keep the melody primary. */
    supportHints?: SeedSupportHints;
}

export interface SoloistSessionSeed {
    notes: SeedNote[];
    loopLengthSteps: number;
}

/**
 * One note inside a `MotifSignature`. Captures pitch, position relative to the
 * phrase start, and the cues the response engine needs to paraphrase it.
 */
export interface MotifSignatureNote {
    stepOffset: number;
    durationSteps: number;
    pitchClass: number;
    midi: number;
    velocity: number;
    isStrongBeat: boolean;
    tripletPlacement: 't1' | 't2' | null;
    timingOffset: number;
    /** -1 | 0 | 1 — melodic direction from the previous note. */
    direction: number;
    isAnchor: boolean;
}

/**
 * A captured phrase signature used for motivic response (sectionRecall, formArc)
 * and for the soloist's call/response logic across loops. Built by
 * `buildPhraseSignatureFromEvents` / `buildSeedPhraseSignature`.
 */
export interface MotifSignature {
    sourceKind: 'performed' | 'seed';
    sourceLoop: number;
    spanSteps: number;
    entryPitchClass: number;
    cadencePitchClass: number;
    anchorPitchClasses: number[];
    tripletCarry: boolean;
    notes: MotifSignatureNote[];
    /** Tagged on by sectionRecall / formArc bookkeeping. */
    sectionLabel?: string;
    sectionOccurrence?: number;
}

/**
 * Per-section memory used to repeat a phrase shape inside the same loop
 * (e.g. the answer to a Restatement section that already played once).
 */
export interface SectionRecallEntry {
    firstSignature?: MotifSignature;
    firstOccurrence?: number;
    latestSignature?: MotifSignature;
    latestOccurrence?: number;
}

/** One occurrence-bucket inside a FormArcEntry (occurrence index → loop history). */
export interface FormArcOccurrenceEntry {
    firstSignature?: MotifSignature;
    firstLoop?: number;
    latestSignature?: MotifSignature;
    latestLoop?: number;
}

/**
 * Cross-loop section memory. Lets later loops echo a phrase shape that played
 * during the same section in an earlier loop.
 */
export interface FormArcEntry {
    byOccurrence: Record<string, FormArcOccurrenceEntry>;
    firstSignature?: MotifSignature;
    firstLoop?: number;
    firstOccurrence?: number;
    latestSignature?: MotifSignature;
    latestLoop?: number;
    latestOccurrence?: number;
}

/**
 * A planned rhythmic event produced by `generateRhythmPlan()` (and consumed by
 * the pitch engine to decide what to play at that step).
 *
 * Two kinds of node share the field set: response-derived (carrying
 * `responseSource` etc.) and seed-derived (carrying `seedNote` / `responseSource:
 * 'seed'`). Optional fields cover the union.
 */
export interface RhythmNode {
    stepTarget: number;
    velocity: number;
    isStrongBeat: boolean;
    durationSteps: number;
    isSustained: boolean;
    vibrato: boolean;
    /** Omitted by several producers; consumers use `|| null` fallbacks. */
    tripletPlacement?: 't1' | 't2' | null;
    /** Omitted by several producers; consumers use `|| 0` fallbacks. */
    timingOffset?: number;
    responseEntryTarget?: boolean;
    responseCadenceTarget?: boolean;
    responseSource?: 'section' | 'form' | 'recent' | 'seed' | 'free';
    responsePitchClass?: number;
    responseDirection?: number;
    /** Present on seed-derived nodes. */
    seedNote?: SeedNote;
}

/**
 * A short-lived musical "event" buffered for a future step — e.g. a chromatic
 * fall, a grace note pair, a banjo roll. Produced by `soloist-devices.ts` and
 * popped by the pitch engine.
 *
 * Some devices produce double-stop pairs; those are represented as
 * `SoloistDeviceEvent[]` (a tuple of simultaneous notes) inside the buffer.
 */
export interface SoloistDeviceEvent {
    midi: number;
    velocity: number;
    durationSteps: number;
    style: string;
    /** Device kind tag stamped by `soloist-devices.ts` (e.g. 'quartal', 'graceNote'). */
    device?: string;
    bendStartInterval?: number;
    isDoubleStop?: boolean;
}

/** Single event or a double-stop pair. */
export type SoloistBufferedEvent = SoloistDeviceEvent | SoloistDeviceEvent[];

/**
 * Short-term note memory the soloist uses to decide upcoming pitch direction,
 * detect repetition, and build signatures. Pushed each time a note is committed.
 */
export interface RecentSoloistNote {
    step: number;
    durationSteps: number;
    midi: number;
    velocity: number;
    isStrongBeat: boolean;
    tripletPlacement: 't1' | 't2' | null;
    timingOffset: number;
    isAnchor: boolean;
}

/**
 * A short motif retained across phrases — used by groove engines (e.g. Ska-Punk
 * harmony in `harmonies.ts`) to echo soloist hooks. The shape is intentionally
 * loose because producers add genre-specific fields.
 */
export interface SoloistHook {
    step: number;
    [key: string]: unknown;
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
 * A single attack captured from the call's rhythm plan, preserved so the response
 * phrase can paraphrase duration + velocity contour — not just attack positions.
 * See epic-soloist-idiom S5 and `soloist.md` P0 #3.
 */
export interface SkeletonNode {
    /** `stepTarget - phraseStartStep` — relative position inside the phrase. */
    stepOffset: number;
    /** Source duration from the call; the response mirrors this so long-long-short-short survives. */
    durationSteps: number;
    /** Source velocity from the call; mirrored so loud-soft contour also survives. */
    velocity: number;
    /** Whether this attack was on a strong beat in the call (used for the response's accent grid). */
    isStrongBeat: boolean;
}

export interface SoloistPhraseContext {
    role: string;
    /**
     * Skeleton of the active phrase — captured from the rhythm plan so a later "response"
     * phrase can paraphrase the call's shape.
     *
     * Entry shape evolved with the role-skeleton-response fix (epic-soloist-idiom S5):
     *  - Legacy: plain `number` = `stepTarget - phraseStartStep` (offset only). The response
     *    branch in soloist-rhythm-engine used to emit `durationSteps: 1` for every entry,
     *    flattening "long-long-short-short" call shapes into "tick-tick-tick-tick" replies.
     *  - Current: `SkeletonNode = { stepOffset, durationSteps, velocity, isStrongBeat }` so
     *    the response can mirror duration shape AND velocity contour, not just attack
     *    positions. Plain-number entries are still tolerated for back-compat with any
     *    persisted state slice that pre-dates the enrichment.
     */
    skeleton: Array<number | SkeletonNode>;
    /** Direction + interval from the previous note; null until the first note plays. */
    lastInterval: { semitones: number; direction: 1 | -1 } | null;
    profile: string;
    /** The signature currently being tracked for this phrase (committed at phrase end). */
    signature: MotifSignature | null;
    /** The signature being answered, if any (set when this is a response phrase). */
    responseSignature: MotifSignature | null;
    responseMode: 'free' | 'paraphrase' | 'development';
    responseSource: 'free' | 'form' | 'seed' | 'section' | 'recent';
    sectionLabel: string | null;
    sectionOccurrence: number;
    /**
     * SRDC arc position (Statement / Restatement / Departure / Conclusion).
     * Derived per phrase from sectionContext + section labels in soloist.ts
     * (`deriveSrdcPhase`). Read by the pitch picker to bias chord-tone weight
     * — Conclusion lifts, Departure depresses. Lowercase canonical form.
     */
    srdcState: SrdcPhase;
    /**
     * The just-finished Statement phrase's signature, captured when the
     * current phrase derives to `restatement` and the prior phrase was a
     * `statement`. The rhythm engine echoes this signature's attack grid +
     * duration shape and the pitch picker echoes its contour directions, so
     * Restatement audibly *confirms* the Statement instead of sounding like
     * an independent phrase. `null` whenever the current phrase is not a
     * Statement-following Restatement. Set by `setupPhraseContext` in
     * soloist.ts. (SRDC Restatement motif-echo — Epic 11 S4.)
     */
    restatementEcho: MotifSignature | null;
}

/**
 * Phrasing-FSM sub-slice of `SoloistSession`. Tracks the wake/sleep cycle and
 * coordination flags the engine reads each step to decide whether to attack,
 * sustain, or rest.
 */
export interface SoloistPhrasing {
    /** Current state in the phrasing lifecycle. */
    readonly state: string;
    /** Whether currently resting (i.e. not actively phrasing). */
    readonly isResting: boolean;
    /** Phrasing transition state at structural boundaries ('lead_in' | 'rest' | null). */
    readonly transitionState: string | null;
    /** Steps the soloist has been resting. */
    readonly restSteps: number;
    /** Steps the soloist has been active. */
    readonly activeSteps: number;
    /** Counter for "busy" playing periods (sustained notes that block the next attack). */
    readonly busySteps: number;
    /** Whether waiting to start a phrase. */
    readonly isWaitingForEntry: boolean;
    /** Whether yielding space to other instruments. */
    readonly isYielding: boolean;
    /** Step of the last note attack. */
    readonly lastAttackStep: number;
}

/**
 * Tracks the currently-being-performed phrase: when it started, where in the
 * form it lives, and the response context for motivic memory.
 */
export interface SoloistCurrentPhrase {
    /** Step when the current phrase started. */
    readonly startStep: number | null;
    /** Loop index captured for the active phrase. */
    readonly loopCount: number | null;
    /** Section label captured for the active phrase. */
    readonly sectionLabel: string | null;
    /** Section occurrence captured for the active phrase. */
    readonly sectionOccurrence: number;
    /** Number of notes played in the current phrase. */
    readonly notesInPhrase: number;
    /** Context data for the current phrase. */
    readonly context: SoloistPhraseContext;
}

/**
 * Cross-phrase / cross-loop memory used for motivic response and form-arc
 * recall. None of these fields are persisted — they're rebuilt each playback.
 */
export interface SoloistMemory {
    /** Recently played notes. Used for signature building and direction tracking. */
    readonly recentNotes: RecentSoloistNote[];
    /** Short term hook memory (currently always reset to `[]` — kept for future reintroduction). */
    readonly hookBuffer: SoloistHook[];
    /** Hooks shared from other instruments (e.g. Ska-Punk harmonies echoing the soloist). */
    readonly sharedHookBuffer: SoloistHook[];
    /** Current rhythmic motif (subset of the active rhythm plan retained across phrases). */
    readonly rhythmicMotif: RhythmNode[];
    /** Per-loop section signatures keyed by section label. */
    readonly sectionRecall: Record<string, SectionRecallEntry>;
    /** Loop number currently represented in sectionRecall. */
    readonly sectionRecallLoop: number | null;
    /** Cross-loop section signatures keyed by section label. */
    readonly formArcRecall: Record<string, FormArcEntry>;
}

/**
 * Rhythm-planning sub-slice — the planned events the soloist will play this
 * phrase, plus the buffers from device/embellishment selection.
 */
export interface SoloistRhythm {
    /** Planned rhythmic phrase. */
    readonly plan: RhythmNode[];
    /** Entropy level of the current rhythm (mutated at section boundaries). */
    readonly entropy: number;
    /** Buffer of melodic devices (bends, grace notes, rolls) queued for upcoming steps. */
    readonly deviceBuffer: SoloistBufferedEvent[];
    /** Buffer of melodic embellishments queued for upcoming steps. */
    readonly embellishmentBuffer: SoloistBufferedEvent[];
}

/**
 * Melodic-contour tracker used by the pitch engine to bias the next note's
 * direction. Updated each commit.
 */
export interface SoloistContour {
    /** Current contour direction ('Up', 'Down', 'Static'). */
    readonly trend: string;
    /** Melodic direction multiplier (-1 | 0 | 1). */
    readonly direction: number;
    /** Steps matching the current melodic trend. */
    readonly steps: number;
}

/**
 * Per-playback engine runtime. Reset by `resetSoloistState()`; never persisted.
 * Holds the SRDC head seed plus the five FSM/memory sub-slices the engine
 * mutates each tick.
 */
export interface SoloistSession {
    /** Seed melody for the current session (the SRDC "Head" set once per playback). */
    readonly seed: SoloistSessionSeed | null;
    /** Total steps played in the current session. */
    readonly sessionSteps: number;
    /** Total phrases played. */
    readonly phraseCount: number;
    /** Current melodic tension level. */
    readonly tension: number;
    /** Last active smart style. */
    readonly lastSmartStyle: string;

    readonly phrasing: SoloistPhrasing;
    readonly currentPhrase: SoloistCurrentPhrase;
    readonly memory: SoloistMemory;
    readonly rhythm: SoloistRhythm;
    readonly contour: SoloistContour;
}

/**
 * Main-thread synth/voice tracking. Lives on the audio thread (not the worker)
 * and is mutated by the synth layer. Not persisted, not synced to the worker
 * (the worker computes its own `lastFreq` for engine reads).
 */
export interface SoloistAudio {
    /** Active polyphonic voices. */
    readonly activeVoices: SoloistVoice[];
    /** Map of scheduled notes from the worker. */
    readonly buffer: Map<number, any>;
    /** Last frequency played. */
    readonly lastFreq: number | null;
    /** Last MIDI note value played. */
    readonly lastMidiPlayed: number | null;
    /** Last frequency actually rendered by the synth (used for portamento). */
    readonly lastRenderedFreq: number | null;
    /** Last frequency sent to the visualizer. */
    readonly lastPlayedFreq: number | null;
    /** Last note end time. */
    readonly lastNoteEnd: number;
}

/**
 * SRDC arc position — Statement / Restatement / Departure / Conclusion.
 * Lowercase canonical form. Derived per phrase by `deriveSrdcPhase` in
 * soloist.ts and read by the pitch picker to bias chord-tone weight.
 */
export type SrdcPhase = 'statement' | 'restatement' | 'departure' | 'conclusion';

export interface SoloistState {
    // === Configuration (user-settable, persisted) — flat at the top of the
    // slice to preserve persistence / hydration / UI / worker-sync compat.

    /** Whether the soloist is active. */
    readonly enabled: boolean;
    /** Which synthesis voice this instrument uses (synth-audit A/B). */
    readonly voice: InstrumentVoice;
    /** The synth sound profile. Consolidated to 'trumpet' (2026-05-23 mix-pass);
     *  field retained as a string for save/share compat with legacy values. */
    readonly preset: string;
    /** The soloist mode ('monophonic' or 'guitar'; unknown values normalize to monophonic). */
    readonly mode: string;
    /** Optional playing style (e.g. 'jazz', 'blues', 'smart'). */
    readonly style?: string;
    /** Base MIDI octave. */
    readonly octave: number;
    /** Mix volume (0.0 - 1.0). */
    readonly volume: number;
    /** Reverb level. */
    readonly reverb: number;
    /** Local complexity level. */
    readonly complexity: number;
    /** Slider for how dynamic/articulated the phrasing is. */
    readonly phrasingIntensity: number;
    /** Probability of retaining a hook motif. */
    readonly hookRetentionProb: number;
    /** Probability of playing double stops. */
    readonly doubleStopProb: number;
    /** Mode for trading fours ('manual', 'auto'). */
    readonly tradeMode: string;
    /** Whether tracking motifs is enabled. */
    readonly motifTracking: boolean;
    /**
     * User-pinned Greats profile (e.g. 'evans', 'bird'). When non-null and
     * present in the active genre's `INFLUENCE_POOLS` pool, the soloist
     * sticky-retains this profile across section boundaries instead of
     * re-rolling at the default 80% rotation gate (see soloist.ts §
     * "Structural Influence Rotation"). When null (default), section
     * boundaries auto-rotate as before. When set but off-pool for the
     * current genre, falls back to auto-rotation and warns once.
     * Epic 12 S3.
     */
    readonly pinnedProfile: string | null;

    // === Engine runtime (per-playback, transient) ===
    readonly session: SoloistSession;

    // === Main-thread synth / voice tracking ===
    readonly audio: SoloistAudio;

    /**
     * @test-only Top-level SRDC-phase override. Production never writes this —
     * the canonical phase lives at `session.currentPhrase.context.srdcState`
     * (written every tick by `deriveSrdcPhase`). The pitch picker reads this
     * top-level slot FIRST (see `selectPitchAndDevices` in
     * soloist-pitch-engine.ts) so critique tests can pin a phase on the mock
     * without it being clobbered by per-tick production writes.
     */
    readonly srdcState?: SrdcPhase;
}

export interface HarmonyState {
    /** Whether the harmony engine is active. */
    readonly enabled: boolean;
    /** Which synthesis voice this instrument uses (synth-audit A/B). */
    readonly voice: InstrumentVoice;
    /** Volume level. */
    readonly volume: number;
    /** Reverb level. */
    readonly reverb: number;
    /** Map of scheduled notes from the worker. */
    readonly buffer: Map<number, any>;
    /** Base MIDI octave. */
    readonly octave: number;
    /** Playing style ID (e.g., 'horns', 'strings'). */
    readonly style: string;
    /** Local complexity override (0.0 - 1.0). */
    readonly complexity: number;
    /** Short-term memory for current section hooks. */
    readonly motifBuffer: any[];
    /** 16-bit mask of the current rhythmic motif (16th notes). */
    readonly rhythmicMask: number;
    /** Array of recently played MIDI notes. */
    readonly lastMidis: number[];
    /** Currently playing polyphonic voices. */
    readonly activeVoices: any[];
    /** Current micro-timing offset. */
    readonly pocketOffset: number;
}

export interface MidiOutput {
    id: string;
    name: string;
}

export interface MidiState {
    /** Whether Web MIDI output is active. */
    readonly enabled: boolean;
    /** List of available MIDI output ports. */
    readonly outputs: MidiOutput[];
    /** The ID of the currently selected MIDI output. */
    readonly selectedOutputId: string | null;
    /** MIDI channel for Chords (1-16). */
    readonly chordsChannel: number;
    /** MIDI channel for Bass (1-16). */
    readonly bassChannel: number;
    /** MIDI channel for Soloist (1-16). */
    readonly soloistChannel: number;
    /** MIDI channel for Harmonies (1-16). */
    readonly harmonyChannel: number;
    /** MIDI channel for Drums (1-16). */
    readonly drumsChannel: number;
    /** Global MIDI latency offset in ms. */
    readonly latency: number;
    /** Whether to mute internal audio when MIDI is active. */
    readonly muteLocal: boolean;
    /** Octave offset for chords. */
    readonly chordsOctave: number;
    /** Octave offset for bass. */
    readonly bassOctave: number;
    /** Octave offset for soloist. */
    readonly soloistOctave: number;
    /** Octave offset for harmonies. */
    readonly harmonyOctave: number;
    /** Octave offset for drums. */
    readonly drumsOctave: number;
    /** Velocity scaling factor. */
    readonly velocitySensitivity: number;
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
    /** Stereo panner — populated for chords and harmonies only, `null` otherwise. */
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
    readonly harmonies: InstrumentBus;
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
    /** The scheduler time for the next note (swung). */
    readonly nextNoteTime: number;
    /** The scheduler time for the next note (straight/quantized). */
    readonly unswungNextNoteTime: number;
    /** Lookahead time for scheduling (in seconds). */
    readonly scheduleAheadTime: number;
    /** The global step counter. */
    readonly step: number;
    /** Queue of normalized visual events waiting to be rendered. */
    readonly drawQueue: any[];
    /** Whether the metronome count-in is active. */
    readonly isCountingIn: boolean;
    /** Current beat of the count-in (0-3). */
    readonly countInBeat: number;
    /** Whether the visualizer loop is active. */
    readonly isDrawing: boolean;
    /** The current UI theme ('auto', 'light', 'dark'). */
    readonly theme: string;
    /** The screen wake lock object. */
    readonly wakeLock: WakeLockSentinel | null;
    /** Global band intensity/energy level (0.0 - 1.0). */
    readonly bandIntensity: number;
    /** Global complexity level (0.0 - 1.0). */
    readonly complexity: number;
    /** Whether the intensity automatically drifts over time. */
    readonly autoIntensity: boolean;
    /** Whether muted instruments strictly reserve their sonic space. */
    readonly practiceMode: boolean;
    /** Whether the metronome is active. */
    readonly metronome: boolean;
    /** Whether to apply BPM/Style from presets. */
    readonly applyPresetSettings: boolean;
    /** Whether the global sustain pedal is "pressed". */
    readonly sustainActive: boolean;
    /** Whether "Song Mode" (intelligent evolution and endings) is active. */
    readonly songMode: boolean;
    /** Session timer in minutes (0 = infinite). */
    readonly sessionTimer: number;
    /** Whether debug logging for the soloist is active. */
    readonly debugSoloist: boolean;
    /** The performance.now() timestamp when playback started. */
    readonly sessionStartTime: number;
    /** Whether to stop at the end of the current progression/loop. */
    readonly stopAtEnd: boolean;
    /** Whether the resolution sequence is about to trigger. */
    readonly isEndingPending: boolean;
    /** Current rhythmic intent (syncopation, anticipation, etc). */
    readonly intent: PlaybackIntent;
    /** Cache of currently animating drum UI elements. */
    readonly lastActiveDrumElements: HTMLElement[] | null;
    /** Currently sustaining piano notes. */
    readonly heldNotes: Set<any>;
    /** The last step index processed by the UI loop. */
    readonly lastPlayingStep: number;
    /** Whether to log messages from the audio worker. */
    readonly workerLogging: boolean;
    /** ID of the timeout for audio context suspension. */
    readonly suspendTimeout: number | null | any;
    /** The current musical key being tracked by playback. */
    readonly currentKey: string | null;
    /** Dynamic velocity modifier (0.0-1.0) applied by Conductor. */
    readonly conductorVelocity: number;
    /** Bias towards lyrical phrasing in soloist (0.0-1.0). */
    readonly lyricalBias: number;
    /** Master output volume. */
    readonly masterVolume: number;
    /** Whether the metronome count-in is enabled. */
    readonly countIn: boolean;
    /** Whether visual flashing is enabled. */
    readonly visualFlash: boolean;
    /** Whether haptic feedback is enabled. */
    readonly haptic: boolean;
    /** List of active toast notifications. */
    readonly toasts: Array<{ id: string; message: string }>;
    /** Current intensity of the screen flash effect. */
    readonly flashIntensity: number;
    /** Whether a PWA update is pending. */
    readonly updateAvailable: boolean;
    /** Whether the resolution ending sequence has been triggered. */
    readonly resolutionTriggered: boolean;
    /** Whether the scheduler is currently active. */
    readonly isScheduling: boolean;
    /** Visibility state for various UI modals. */
    readonly modals: ModalsState;
    /** Number of loops before stopping (0 = infinite). */
    readonly loopLimit: number;
    /** Current loop iteration counter. */
    readonly currentLoopCount: number;
}

export interface VisualizerState {
    /** Whether the advanced visualizer is active. */
    readonly enabled: boolean;
}

/**
 * Strips `readonly` from every field of T. Use sparingly at write sites:
 *
 * - Reducers: alias once at function top — `const v = vizState as Mutable<typeof vizState>;`
 * - @direct-mutation engine sites: inline — `(vizState as Mutable<typeof vizState>).enabled = true;`
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
    harmony: HarmonyState;
    chords: ChordState;
    conductor: ConductorState;
    vizState: VisualizerState;
    midi: MidiState;
}

export interface StepInfo {
    isMeasureStart: boolean;
    isBeatStart: boolean;
    /** Semantic backbeat (e.g., beats 2 & 4). */
    isBackbeat: boolean;
    /** Rhythmic group boundary (e.g., beats 1 & 3). */
    isGroupStart: boolean;
    /** 8th-note offbeat. */
    isOffbeat: boolean;
    /** "e" of a 16th-note beat. */
    isEOfBeat: boolean;
    /** "a" of a 16th-note beat. */
    isAOfBeat: boolean;
    isCompound?: boolean;
    isPulse?: boolean;
    isPulseStart?: boolean;
    /** Alias for isMeasureStart. */
    isDownbeat?: boolean;
    isTurnaround?: boolean;
    beatIndex: number;
    groupIndex: number;
    stepInGroup: number;
    mStep: number;
    stepInBeat?: number;
    tsConfig?: any;
    tsName?: string;
}

export interface ActionPayloadSetParam {
    module: string;
    param: string;
    value: unknown;
}

export interface ActionPayloadSetStyle {
    module: string;
    style: string;
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
    module: 'groove' | 'bass' | 'chords' | 'harmony' | 'soloist';
    voice: InstrumentVoice;
}

export interface ActionPayloadSetModalOpen {
    modal: keyof ModalsState;
    open: boolean;
}

export interface ActionPayloadLoadTemplate {
    sections: Section[];
    isMinor?: boolean;
}

export interface ActionPayloadSetGenreFeel {
    genreName?: string;
    feel?: string;
    swing?: number;
    sub?: string;
    chord?: string;
    bass?: string;
    soloist?: string;
    harmony?: string;
}

export interface ActionPayloadUpdateConductorDecision {
    velocity?: number;
    lyricalBias?: number;
    intent?: Partial<PlaybackIntent>;
    density?: string;
    hookProb?: number;
    feel?: string;
    genreName?: string;
    swing?: number;
    sub?: string;
}

export interface ActionPayloadTriggerFill {
    steps: Record<number, unknown>;
    startStep: number;
    length: number;
    crash?: boolean;
}

export interface ActionPayloadSetGrooveSeed {
    sectionId: string;
    seed: number | string;
}

export interface ActionPayloadShowToast {
    id?: string;
    message?: string;
    type?: string;
}

export interface ActionPayloadSetMidiConfig {
    enabled?: boolean;
    outputs?: Array<{ id: string; name: string }>;
    selectedOutputId?: string | null;
    chordsChannel?: number;
    bassChannel?: number;
    soloistChannel?: number;
    harmonyChannel?: number;
    drumsChannel?: number;
    latency?: number;
    muteLocal?: boolean;
    chordsOctave?: number;
    bassOctave?: number;
    soloistOctave?: number;
    harmonyOctave?: number;
    drumsOctave?: number;
    velocitySensitivity?: number;
}

export interface ActionPayloadUpdateConductorState {
    targetIntensity?: number;
    stepSize?: number;
    form?: object | null;
    loopCount?: number;
    formIteration?: number;
}

export type ActionPayloadUpdateHB = Partial<HarmonyState>;

/**
 * UPDATE_SB payload — flat-keyed for worker-wire and conductor compatibility.
 * The reducer (`applySoloistPayload`) routes each flat key to its actual
 * nested location under `session` / `audio`. Accepts the union of:
 *
 * - Top-level config fields (Partial<SoloistState>'s flat shape).
 * - Flat engine-runtime aliases: `sessionSeed`, `sessionSteps`, `phraseCount`,
 *   `tension`, `lastSmartStyle`, `phrasingState`, `isResting`, `transitionState`,
 *   `restSteps`, `activeSteps`, `busySteps`, `isWaitingForEntry`, `isYielding`,
 *   `lastAttackStep`, `phraseStartStep`, `phraseLoopCount`, `phraseSectionLabel`,
 *   `phraseSectionOccurrence`, `notesInPhrase`, `phraseContext`, `recentNotes`,
 *   `hookBuffer`, `sharedHookBuffer`, `rhythmicMotif`,
 *   `sectionRecall`, `sectionRecallLoop`, `formArcRecall`,
 *   `rhythmPlan`, `rhythmicEntropy`, `deviceBuffer`, `embellishmentBuffer`,
 *   `melodicTrend`, `direction`, `contourSteps`, `activeVoices`, `buffer`,
 *   `lastFreq`, `lastMidiPlayed`, `lastRenderedFreq`, `lastPlayedFreq`,
 *   `lastNoteEnd`.
 *
 * The full alias union is left as a loose `Record` to keep the contract simple.
 * Unknown keys fall through to a top-level write on the slice (preserves the
 * pre-restructure `instrumentStateMap[mod][param] = v` semantics that a handful
 * of ad-hoc scripts and the `instrument-reducer` test rely on).
 */
export type ActionPayloadUpdateSB = Partial<{
    enabled: boolean;
    preset: string;
    mode: string;
    style: string;
    octave: number;
    volume: number;
    reverb: number;
    complexity: number;
    phrasingIntensity: number;
    hookRetentionProb: number;
    doubleStopProb: number;
    tradeMode: string;
    motifTracking: boolean;
    pinnedProfile: string | null;
    sessionSeed: SoloistSessionSeed | null;
    sessionSteps: number;
    phraseCount: number;
    tension: number;
    lastSmartStyle: string;
    phrasingState: string;
    isResting: boolean;
    transitionState: string | null;
    restSteps: number;
    activeSteps: number;
    busySteps: number;
    isWaitingForEntry: boolean;
    isYielding: boolean;
    lastAttackStep: number;
    phraseStartStep: number | null;
    phraseLoopCount: number | null;
    phraseSectionLabel: string | null;
    phraseSectionOccurrence: number;
    notesInPhrase: number;
    phraseContext: SoloistPhraseContext;
    recentNotes: RecentSoloistNote[];
    hookBuffer: SoloistHook[];
    sharedHookBuffer: SoloistHook[];
    rhythmicMotif: RhythmNode[];
    sectionRecall: Record<string, SectionRecallEntry>;
    sectionRecallLoop: number | null;
    formArcRecall: Record<string, FormArcEntry>;
    rhythmPlan: RhythmNode[];
    rhythmicEntropy: number;
    deviceBuffer: SoloistBufferedEvent[];
    embellishmentBuffer: SoloistBufferedEvent[];
    melodicTrend: string;
    direction: number;
    contourSteps: number;
    activeVoices: SoloistVoice[];
    buffer: Map<number, any>;
    lastFreq: number | null;
    lastMidiPlayed: number | null;
    lastRenderedFreq: number | null;
    lastPlayedFreq: number | null;
    lastNoteEnd: number;
}>;
export type ActionPayloadUpdateGB = Partial<GrooveState>;

export interface ActionPayloadMap {
    SET_PARAM: ActionPayloadSetParam;
    SET_BAND_INTENSITY: number;
    SET_COMPLEXITY: number;
    SET_AUTO_INTENSITY: boolean;
    UPDATE_CONDUCTOR_DECISION: ActionPayloadUpdateConductorDecision;
    UPDATE_CONDUCTOR_STATE: ActionPayloadUpdateConductorState;
    TRIGGER_EMERGENCY_LOOKAHEAD: undefined;
    RESET_SESSION: undefined;
    SHOW_TOAST: ActionPayloadShowToast | string;
    TRIGGER_FLASH?: number;
    SET_UPDATE_AVAILABLE: boolean;
    SET_MODAL_OPEN: ActionPayloadSetModalOpen;
    TOGGLE_PLAY: undefined;
    SET_BPM: number | string;
    SET_STYLE: ActionPayloadSetStyle;
    SET_DENSITY: string;
    SET_VOLUME: ActionPayloadSetVolume;
    SET_REVERB: ActionPayloadSetReverb;
    SET_SOLOIST_MODE: string;
    SET_SONG_SEED: string;
    SET_INSTRUMENT_VOICE: ActionPayloadSetInstrumentVoice;
    UPDATE_SB: ActionPayloadUpdateSB;
    SET_SWING: number;
    SET_SWING_SUB: string;
    SET_HUMANIZE: number;
    SET_GENRE_FEEL: ActionPayloadSetGenreFeel;
    SET_GENRE_COUNTDOWN: number | null;
    SET_ACTIVE_MEASURE: number | string;
    SET_GROOVE_SEED: ActionPayloadSetGrooveSeed;
    TRIGGER_FILL: ActionPayloadTriggerFill;
    UPDATE_HB: ActionPayloadUpdateHB;
    UPDATE_GB: ActionPayloadUpdateGB;
    SET_ARRANGEMENT: Section[];
    SET_SECTIONS: Section[];
    ADD_SECTION: Section;
    REMOVE_SECTION: string;
    UPDATE_SECTION: Section;
    SET_KEY: string;
    SET_TIME_SIGNATURE: string;
    SET_GROUPING: number[] | null;
    SET_IS_MINOR: boolean;
    LOAD_TEMPLATE: ActionPayloadLoadTemplate;
    SET_METRONOME: boolean;
    SET_PRESET_SETTINGS_MODE: boolean;
    SET_NOTATION: string;
    SET_SESSION_TIMER: number;
    SET_SONG_MODE: boolean;
    SET_STOP_AT_END: boolean;
    SET_ENDING_PENDING: boolean;
    RESET_STATE: undefined;
    SET_MIDI_CONFIG: ActionPayloadSetMidiConfig;
    RESTORE_GAINS: undefined;
    INIT_AUDIO: undefined;
    HYDRATE?: undefined;
    TOAST_EXPIRED?: undefined;
    FLASH_EXPIRED?: undefined;
    REL_KEY_TOGGLE?: undefined;
    TRANSPOSE?: undefined;
    VIS_RESET?: undefined;
    VIS_UPDATE?: unknown;
    PROG_VALIDATED?: undefined;
    DRUM_PRESET_LOADED?: undefined;
}

/**
 * Discriminated union over all known actions. Each reducer's switch on
 * `action.type` narrows `action.payload` to the matching payload type.
 * Loose `dispatch(action: string, payload?: any)` calls still flow through
 * the same shape — unmapped strings fall to each reducer's default arm.
 */
export type Action = {
    [K in keyof ActionPayloadMap]-?: { type: K; payload: ActionPayloadMap[K] };
}[keyof ActionPayloadMap];

export const ACTIONS = {
    // --- Global / Conductor ---
    SET_PARAM: 'SET_PARAM',
    SET_BAND_INTENSITY: 'SET_BAND_INTENSITY',
    SET_COMPLEXITY: 'SET_COMPLEXITY',
    SET_AUTO_INTENSITY: 'SET_AUTO_INTENSITY',
    UPDATE_CONDUCTOR_DECISION: 'UPDATE_CONDUCTOR_DECISION',
    UPDATE_CONDUCTOR_STATE: 'UPDATE_CONDUCTOR_STATE',
    TRIGGER_EMERGENCY_LOOKAHEAD: 'TRIGGER_EMERGENCY_LOOKAHEAD',
    RESET_SESSION: 'RESET_SESSION',
    SHOW_TOAST: 'SHOW_TOAST',
    TRIGGER_FLASH: 'TRIGGER_FLASH',
    SET_UPDATE_AVAILABLE: 'SET_UPDATE_AVAILABLE',
    SET_MODAL_OPEN: 'SET_MODAL_OPEN',
    TOGGLE_PLAY: 'TOGGLE_PLAY',
    SET_BPM: 'SET_BPM',

    // --- Instrument Settings ---
    SET_STYLE: 'SET_STYLE',
    SET_DENSITY: 'SET_DENSITY',
    SET_VOLUME: 'SET_VOLUME',
    SET_REVERB: 'SET_REVERB',
    SET_SOLOIST_MODE: 'SET_SOLOIST_MODE',
    SET_SONG_SEED: 'SET_SONG_SEED',
    SET_INSTRUMENT_VOICE: 'SET_INSTRUMENT_VOICE',
    UPDATE_SB: 'UPDATE_SB',

    // --- Groove / Drums ---
    SET_SWING: 'SET_SWING',
    SET_SWING_SUB: 'SET_SWING_SUB',
    SET_HUMANIZE: 'SET_HUMANIZE',
    SET_GENRE_FEEL: 'SET_GENRE_FEEL',
    SET_GENRE_COUNTDOWN: 'SET_GENRE_COUNTDOWN',
    SET_ACTIVE_MEASURE: 'SET_ACTIVE_MEASURE',
    SET_GROOVE_SEED: 'SET_GROOVE_SEED',
    TRIGGER_FILL: 'TRIGGER_FILL',
    UPDATE_HB: 'UPDATE_HB',
    UPDATE_GB: 'UPDATE_GB',

    // --- Options / Arranger ---
    SET_ARRANGEMENT: 'SET_ARRANGEMENT',
    SET_SECTIONS: 'SET_SECTIONS',
    ADD_SECTION: 'ADD_SECTION',
    REMOVE_SECTION: 'REMOVE_SECTION',
    UPDATE_SECTION: 'UPDATE_SECTION',
    SET_KEY: 'SET_KEY',
    SET_TIME_SIGNATURE: 'SET_TIME_SIGNATURE',
    SET_GROUPING: 'SET_GROUPING',
    SET_IS_MINOR: 'SET_IS_MINOR',
    LOAD_TEMPLATE: 'LOAD_TEMPLATE',
    SET_METRONOME: 'SET_METRONOME',
    SET_PRESET_SETTINGS_MODE: 'SET_PRESET_SETTINGS_MODE',
    SET_NOTATION: 'SET_NOTATION',
    SET_SESSION_TIMER: 'SET_SESSION_TIMER',
    SET_SONG_MODE: 'SET_SONG_MODE',
    SET_STOP_AT_END: 'SET_STOP_AT_END',
    SET_ENDING_PENDING: 'SET_ENDING_PENDING',
    RESET_STATE: 'RESET_STATE',

    // --- MIDI ---
    SET_MIDI_CONFIG: 'SET_MIDI_CONFIG',
    RESTORE_GAINS: 'RESTORE_GAINS',
    INIT_AUDIO: 'INIT_AUDIO',

    // --- Signal-only / Lifecycle (payload-less notifications) ---
    HYDRATE: 'HYDRATE',
    TOAST_EXPIRED: 'TOAST_EXPIRED',
    FLASH_EXPIRED: 'FLASH_EXPIRED',
    REL_KEY_TOGGLE: 'REL_KEY_TOGGLE',
    TRANSPOSE: 'TRANSPOSE',
    VIS_RESET: 'VIS_RESET',
    VIS_UPDATE: 'VIS_UPDATE',
    PROG_VALIDATED: 'PROG_VALIDATED',
    DRUM_PRESET_LOADED: 'DRUM_PRESET_LOADED',
} as const;
