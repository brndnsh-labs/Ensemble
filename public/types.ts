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
    sections: Section[];
    /** Flattened list of parsed chord objects. */
    progression: Chord[];
    /** The global musical key (e.g., "C", "F#"). */
    key: string;
    /** The global time signature (e.g., "4/4", "3/4"). */
    timeSignature: string;
    /** Whether the key is minor. */
    isMinor: boolean;
    /** Notation style ('roman', 'nns', 'name'). */
    notation: string;
    /** Whether the current progression is valid. */
    valid: boolean;
    /** Total number of 16th note steps in the song. */
    totalSteps: number;
    /** Map of steps to chord objects. */
    stepMap: Array<{ start: number; end: number; chord: Chord }>;
    /** Map of measures to time signatures. */
    measureMap: Array<{ start: number; end: number; ts: string }>;
    /** Map of sections to step ranges. */
    sectionMap: Array<{ id: string; start: number; end: number; label: string }>;
    /** Undo history stack (JSON strings). */
    history: string[];
    /** ID of the last edited section. */
    lastInteractedSectionId: string;
    /** Name of the last loaded chord preset. */
    lastChordPreset: string;
    /** ID of a section that was programmatically mutated. */
    mutatedSectionId: string | null;
    /** Whether the arrangement has been manually modified. */
    isDirty: boolean;
    /** Custom rhythmic grouping array (e.g. [3, 2]). */
    grouping: number[] | null;
}

export interface ConductorState {
    /** Target intensity level for auto-intensity drift. */
    targetIntensity: number;
    /** Internal step size for auto-intensity. */
    stepSize: number;
    /** Structural analysis of the song arrangement. */
    form: object | null;
    /** Number of times the current section has looped. */
    loopCount: number;
    /** Number of times the entire song has looped. */
    formIteration: number;
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

export interface GrooveState {
    /** Whether the drum engine is active. */
    enabled: boolean;
    /** List of drum instruments. */
    instruments: Instrument[];
    /** Volume level. */
    volume: number;
    /** Reverb level. */
    reverb: number;
    /** Number of measures in the loop (1-8). */
    measures: number;
    /** Currently visible measure for editing. */
    currentMeasure: number;
    /** Whether to scroll grid during playback. */
    followPlayback: boolean;
    /** Humanization percentage (0-100). */
    humanize: number;
    /** Swing percentage (0-100). */
    swing: number;
    /** Swing subdivision ('8th' or '16th'). */
    swingSub: string;
    /** Name of the last loaded drum preset. */
    lastDrumPreset: string;
    /** Thematic seed for deterministic generation. */
    seed: string;
    /** Cache for decoded drum samples. */
    audioBuffers: any;
    /** Active genre for procedural nuances ('Rock', 'Jazz', 'Funk'). */
    genreFeel: string;
    /** Whether a drum fill is currently being played. */
    fillActive: boolean;
    /** Transient storage for the generated fill pattern. */
    fillSteps: object;
    /** Last gain node for the hi-hat. */
    lastHatGain: GainNode | null;
    /** Last gain node for the ride cymbal. */
    lastRideGain: GainNode | null;
    /** Last gain node for the crash cymbal. */
    lastCrashGain: GainNode | null;
    /** Step index where the current fill began. */
    fillStartStep: number;
    /** Length of the current fill in steps. */
    fillLength: number;
    /** 16-bit mask of the current snare pattern. */
    snareMask: number;
    /** Whether a crash cymbal is queued for the next downbeat. */
    pendingCrash: boolean;
    /** Whether generative fills/variations are enabled. */
    creativity: boolean;
    /** Random seeds for each song section. */
    sectionSeedMap: object;
    /** Unified rhythmic pocket configuration. */
    pocket: PocketState;
    /** Last selected smart genre. */
    lastSmartGenre: string;
    /** Genre queued for the next measure. */
    pendingGenreFeel: { genreName?: string; feel?: string } | null;
    /** Beats until genre switch. */
    genreSwitchCountdown: number | null;
    /** Pre-calculated section orchestration map. */
    orchestrationMap: any[] | null;
    /** Pre-calculated song-wide fill map. */
    fillMap: Record<number, any> | null;
    /** Pre-calculated soloist accent catching map. */
    accentMap: Record<number, any> | null;
    /** Absolute playback step when the current seed maps were generated. */
    seedTimelineStartStep: number;
    /** Pre-calculated pattern variations for the current preset. */
    variations: any[] | null;
    /** Map of scheduled drum events. */
    buffer: Map<number, any>;
}

export interface ChordState {
    /** Whether the accompanist is active. */
    enabled: boolean;
    /** The comping style ('smart', 'pad', etc). */
    style: string;
    /** Output gain multiplier. */
    volume: number;
    /** Reverb send amount. */
    reverb: number;
    /** Base MIDI octave for voicing. */
    octave: number;
    /** Voicing density ('thin', 'standard', 'rich'). */
    density: string;
    /** Index of the currently playing chord (UI). */
    lastActiveChordIndex: number | null;
    /** Index of the last scheduled chord (Internal). */
    scheduledChordIndex: number | null;
    /** Scheduled notes buffer. */
    buffer: Map<number, any>;
    /** 16-bit mask of the current comping pattern. */
    rhythmicMask: number;
    /** Optional instrument name. */
    instrument?: string;
}

export interface BassState {
    /** Whether the bass engine is active. */
    enabled: boolean;
    /** Volume level. */
    volume: number;
    /** Reverb level. */
    reverb: number;
    /** Frequency of the last played note. */
    lastFreq: number | null;
    /** Frequency of the note currently ringing. */
    lastPlayedFreq: number | null;
    /** Map of scheduled notes from the worker. */
    buffer: Map<number, any>;
    /** Base MIDI octave. */
    octave: number;
    /** Playing style ID (e.g., 'walking', 'funk'). */
    style: string;
    /** Counter for "busy" playing periods. */
    busySteps: number;
    /** Last MIDI note value played. */
    lastMidiPlayed: number | null;
    /** Last gain node for dynamic continuity. */
    lastBassGain: GainNode | null;
}

export interface SoloistSessionSeed {
    notes: any[];
    loopLengthSteps: number;
}

export interface SoloistPhraseContext {
    role: string;
    skeleton: any[];
    lastInterval: any;
    profile: string;
    signature: any;
    responseSignature: any;
    responseMode: 'free' | 'paraphrase' | 'development';
    responseSource: 'free' | 'form' | 'seed' | 'section' | 'recent';
    sectionLabel: string | null;
    sectionOccurrence: number;
}

export interface SoloistState {
    /** Whether the soloist is active. */
    enabled: boolean;
    /** Mix volume (0.0 - 1.0). */
    volume: number;
    /** Reverb level. */
    reverb: number;
    /** The synth sound profile ('neo', 'vowel', 'trumpet', 'saxophone'). */
    preset: string;
    /** The soloist mode ('monophonic' or 'guitar'; legacy piano normalizes to monophonic). */
    mode: string;
    /** Thematic seed for deterministic generation. */
    seed: string;
    /** Slider for how dynamic/articulated the phrasing is. */
    phrasingIntensity: number;
    /** Probability of retaining a hook motif. */
    hookRetentionProb: number;
    /** Seed melody for the current session. */
    sessionSeed: SoloistSessionSeed | null;
    /** Planned rhythmic phrase. */
    rhythmPlan: any[];
    /** Buffer for melodic embellishments. */
    deviceBuffer: any[];
    /** Buffer for melodic embellishments. */
    embellishmentBuffer: any[];
    /** Short term hook memory. */
    hookBuffer: any[];
    /** Hooks shared from other instruments. */
    sharedHookBuffer: any[];
    /** Total steps played in current session. */
    sessionSteps: number;
    /** Mode for trading fours ('manual', 'auto'). */
    tradeMode: string;
    /** Whether waiting to start a phrase. */
    isWaitingForEntry: boolean;
    /** Whether yielding space to other instruments. */
    isYielding: boolean;
    /** Whether tracking motifs is enabled. */
    motifTracking: boolean;
    /** Total phrases played. */
    phraseCount: number;
    /** Number of notes played in the current phrase. */
    notesInPhrase: number;
    /** Entropy level of the current rhythm. */
    rhythmicEntropy: number;
    /** Last frequency played. */
    lastFreq: number | null;
    /** Last frequency sent to visualizer. */
    lastPlayedFreq: number | null;
    /** Last frequency sent to visualizer. */
    lastRenderedFreq: number | null;
    /** Current melodic tension level. */
    tension: number;
    /** Steps the soloist has been active. */
    activeSteps: number;
    /** Steps the soloist has been resting. */
    restSteps: number;
    /** Whether currently resting. */
    isResting: boolean;
    /** Steps matching current melodic trend. */
    contourSteps: number;
    /** Current contour direction ('Up', 'Down', 'Static'). */
    melodicTrend: string;
    /** Melodic direction multiplier. */
    direction: number;
    /** Local complexity level. */
    complexity: number;
    /** Step of the last note attack. */
    lastAttackStep: number;
    /** Current state in the phrasing lifecycle. */
    phrasingState: string;
    /** Cached motif data. */
    motifCache: any;
    /** Current rhythmic motif. */
    rhythmicMotif: any[];
    /** Dictionary of loaded licks. */
    lickDictionary: any[];
    /** Recently played notes. */
    recentNotes: any[];
    /** Step when the current phrase started. */
    phraseStartStep: number | null;
    /** Loop index captured for the active phrase. */
    phraseLoopCount: number | null;
    /** Section label captured for the active phrase. */
    phraseSectionLabel: string | null;
    /** Section occurrence captured for the active phrase. */
    phraseSectionOccurrence: number;
    /** Per-loop section signatures keyed by section label. */
    sectionRecall: Record<string, any>;
    /** Loop number currently represented in sectionRecall. */
    sectionRecallLoop: number | null;
    /** Cross-loop section signatures keyed by section label. */
    formArcRecall: Record<string, any>;
    /** Context data for the current phrase. */
    phraseContext: SoloistPhraseContext;
    /** Probability of playing double stops. */
    doubleStopProb: number;
    /** Active polyphonic voices. */
    activeVoices: any[];
    /** Last MIDI note value played. */
    lastMidiPlayed: number | null;
    /** Optional playing style. */
    style?: string;
    /** Map of scheduled notes from the worker. */
    buffer: Map<number, any>;
    /** Base MIDI octave. */
    octave: number;
    /** Last note end time. */
    lastNoteEnd: number;
    /** Optional busy steps counter. */
    busySteps: number;
    /** Phrasing transition state. */
    transitionState: string | null;
    /** Last active smart style. */
    lastSmartStyle: string;
}

export interface HarmonyState {
    /** Whether the harmony engine is active. */
    enabled: boolean;
    /** Volume level. */
    volume: number;
    /** Reverb level. */
    reverb: number;
    /** Map of scheduled notes from the worker. */
    buffer: Map<number, any>;
    /** Base MIDI octave. */
    octave: number;
    /** Playing style ID (e.g., 'horns', 'strings'). */
    style: string;
    /** Local complexity override (0.0 - 1.0). */
    complexity: number;
    /** Short-term memory for current section hooks. */
    motifBuffer: any[];
    /** 16-bit mask of the current rhythmic motif (16th notes). */
    rhythmicMask: number;
    /** Array of recently played MIDI notes. */
    lastMidis: number[];
    /** Currently playing polyphonic voices. */
    activeVoices: any[];
    /** Current micro-timing offset. */
    pocketOffset: number;
}

export interface MidiOutput {
    id: string;
    name: string;
}

export interface MidiState {
    /** Whether Web MIDI output is active. */
    enabled: boolean;
    /** List of available MIDI output ports. */
    outputs: MidiOutput[];
    /** The ID of the currently selected MIDI output. */
    selectedOutputId: string | null;
    /** MIDI channel for Chords (1-16). */
    chordsChannel: number;
    /** MIDI channel for Bass (1-16). */
    bassChannel: number;
    /** MIDI channel for Soloist (1-16). */
    soloistChannel: number;
    /** MIDI channel for Harmonies (1-16). */
    harmonyChannel: number;
    /** MIDI channel for Drums (1-16). */
    drumsChannel: number;
    /** Global MIDI latency offset in ms. */
    latency: number;
    /** Whether to mute internal audio when MIDI is active. */
    muteLocal: boolean;
    /** Octave offset for chords. */
    chordsOctave: number;
    /** Octave offset for bass. */
    bassOctave: number;
    /** Octave offset for soloist. */
    soloistOctave: number;
    /** Octave offset for harmonies. */
    harmonyOctave: number;
    /** Octave offset for drums. */
    drumsOctave: number;
    /** Velocity scaling factor. */
    velocitySensitivity: number;
}

export interface GlobalContext {
    /** The Web Audio API context. */
    audio: AudioContext | null;
    /** The master volume gain node. */
    masterGain: GainNode | null;
    /** The master soft-clipper/saturator. */
    saturator: WaveShaperNode | null;
    /** The master safety limiter. */
    masterLimiter: DynamicsCompressorNode | null;
    /** The global reverb node. */
    reverbNode: ConvolverNode | null;
    /** HPF for reverb cleaning. */
    reverbPreFilter: BiquadFilterNode | null;
    /** The gain node for chords. */
    chordsGain: GainNode | null;
    /** Reverb send for chords. */
    chordsReverb: GainNode | null;
    /** EQ for chords (HP/Notch). */
    chordsEQ: BiquadFilterNode | null;
    /** Stereo panner for chords. */
    chordsPanner: StereoPannerNode | null;
    /** The gain node for drums. */
    drumsGain: GainNode | null;
    /** HP/air EQ for drums bus. */
    drumsEQ: BiquadFilterNode | null;
    /** Reverb send for drums. */
    drumsReverb: GainNode | null;
    /** The gain node for bass. */
    bassGain: GainNode | null;
    /** Reverb send for bass. */
    bassReverb: GainNode | null;
    /** Sidechain ducking gain node for bass. */
    bassSidechain: GainNode | null;
    /** EQ for bass (HPF/Notch). */
    bassEQ: BiquadFilterNode | null;
    /** The gain node for soloist. */
    soloistGain: GainNode | null;
    /** Reverb send for soloist. */
    soloistReverb: GainNode | null;
    /** EQ for soloist (LPF/Shelf). */
    soloistEQ: BiquadFilterNode | null;
    /** The gain node for harmonies. */
    harmoniesGain: GainNode | null;
    /** Reverb send for harmonies. */
    harmoniesReverb: GainNode | null;
    /** EQ for harmonies (HPF). */
    harmoniesEQ: BiquadFilterNode | null;
    /** Stereo panner for harmonies. */
    harmoniesPanner: StereoPannerNode | null;
    /** Whether the sequencer is currently playing. */
    isPlaying: boolean;
    /** Beats per minute (40-240). */
    bpm: number;
    /** The scheduler time for the next note (swung). */
    nextNoteTime: number;
    /** The scheduler time for the next note (straight/quantized). */
    unswungNextNoteTime: number;
    /** Lookahead time for scheduling (in seconds). */
    scheduleAheadTime: number;
    /** The global step counter. */
    step: number;
    /** Queue of normalized visual events waiting to be rendered. */
    drawQueue: any[];
    /** Whether the metronome count-in is active. */
    isCountingIn: boolean;
    /** Current beat of the count-in (0-3). */
    countInBeat: number;
    /** Whether the visualizer loop is active. */
    isDrawing: boolean;
    /** The current UI theme ('auto', 'light', 'dark'). */
    theme: string;
    /** The screen wake lock object. */
    wakeLock: WakeLockSentinel | null;
    /** Global band intensity/energy level (0.0 - 1.0). */
    bandIntensity: number;
    /** Global complexity level (0.0 - 1.0). */
    complexity: number;
    /** Whether the intensity automatically drifts over time. */
    autoIntensity: boolean;
    /** Whether muted instruments strictly reserve their sonic space. */
    practiceMode: boolean;
    /** Whether the metronome is active. */
    metronome: boolean;
    /** Whether to apply BPM/Style from presets. */
    applyPresetSettings: boolean;
    /** Whether the global sustain pedal is "pressed". */
    sustainActive: boolean;
    /** Whether "Song Mode" (intelligent evolution and endings) is active. */
    songMode: boolean;
    /** Session timer in minutes (0 = infinite). */
    sessionTimer: number;
    /** Whether debug logging for the soloist is active. */
    debugSoloist: boolean;
    /** The performance.now() timestamp when playback started. */
    sessionStartTime: number;
    /** Whether to stop at the end of the current progression/loop. */
    stopAtEnd: boolean;
    /** Whether the resolution sequence is about to trigger. */
    isEndingPending: boolean;
    /** Current rhythmic intent (syncopation, anticipation, etc). */
    intent: PlaybackIntent;
    /** Cache of currently animating drum UI elements. */
    lastActiveDrumElements: HTMLElement[] | null;
    /** Currently sustaining piano notes. */
    heldNotes: Set<any>;
    /** The last step index processed by the UI loop. */
    lastPlayingStep: number;
    /** Whether to log messages from the audio worker. */
    workerLogging: boolean;
    /** ID of the timeout for audio context suspension. */
    suspendTimeout: number | null | any;
    /** The current musical key being tracked by playback. */
    currentKey: string | null;
    /** Dynamic velocity modifier (0.0-1.0) applied by Conductor. */
    conductorVelocity: number;
    /** Bias towards lyrical phrasing in soloist (0.0-1.0). */
    lyricalBias: number;
    /** Master output volume. */
    masterVolume: number;
    /** Whether the metronome count-in is enabled. */
    countIn: boolean;
    /** Whether visual flashing is enabled. */
    visualFlash: boolean;
    /** Whether haptic feedback is enabled. */
    haptic: boolean;
    /** List of active toast notifications. */
    toasts: Array<{ id: string; message: string }>;
    /** Current intensity of the screen flash effect. */
    flashIntensity: number;
    /** Whether a PWA update is pending. */
    updateAvailable: boolean;
    /** Whether the resolution ending sequence has been triggered. */
    resolutionTriggered: boolean;
    /** Whether the scheduler is currently active. */
    isScheduling: boolean;
    /** Visibility state for various UI modals. */
    modals: ModalsState;
    /** Number of loops before stopping (0 = infinite). */
    loopLimit: number;
    /** Current loop iteration counter. */
    currentLoopCount: number;
}

export interface VisualizerState {
    /** Whether the advanced visualizer is active. */
    enabled: boolean;
}

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
export type ActionPayloadUpdateSB = Partial<SoloistState>;
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
    SET_SOLOIST_SEED: string;
    SET_SOLOIST_PRESET: string;
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
    KEY_CHANGE?: undefined;
    TIME_SIG_CHANGE?: undefined;
    GROUPING_CHANGE?: undefined;
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
    SET_SOLOIST_SEED: 'SET_SOLOIST_SEED',
    SET_SOLOIST_PRESET: 'SET_SOLOIST_PRESET',
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
    KEY_CHANGE: 'KEY_CHANGE',
    TIME_SIG_CHANGE: 'TIME_SIG_CHANGE',
    GROUPING_CHANGE: 'GROUPING_CHANGE',
    REL_KEY_TOGGLE: 'REL_KEY_TOGGLE',
    TRANSPOSE: 'TRANSPOSE',
    VIS_RESET: 'VIS_RESET',
    VIS_UPDATE: 'VIS_UPDATE',
    PROG_VALIDATED: 'PROG_VALIDATED',
    DRUM_PRESET_LOADED: 'DRUM_PRESET_LOADED',
} as const;
