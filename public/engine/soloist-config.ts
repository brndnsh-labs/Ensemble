import { SMART_GENRES } from '../data/smart-genres.js';

export interface SeedTriplets {
    enabled: boolean;
    cellBias: number;
    pickupBias: number;
    mutationBias: number;
    cadenceBias: number;
    timingStrength: number;
}

export interface MotivicResponse {
    enabled: boolean;
    rhythmReuse: number;
    pitchReuse: number;
    contourReuse: number;
    cadenceWeight: number;
    tripletCarry: number;
    deviceDamp: number;
    delayBias: number;
    echoBias: number;
    compressionBias: number;
    sectionRecall: number;
    formArcRecall: number;
    maxResponseNotes: number;
    spaceBias: number;
}

export interface StyleConfig {
    genreGravityOffset: number;
    restBase: number;
    timingJitter: number;
    maxNotesPerPhrase: number;
    minNotesPerPhrase: number;
    doubleStopProb: number;
    anticipationProb: number;
    // S6: wired in soloist-pitch-engine selectPitchAndDevices as a +weight
    // nudge toward style-characteristic color tones. Convention: semitone
    // intervals 0-11 relative to the chord root. CHORD TONES (0=root, 4=maj3,
    // 7=P5) MUST NOT appear here — they are already heavily rewarded by the
    // chord-tone bonus (+150) and double-rewarding masks the style flavor.
    // Avoid notes (e.g. 5=P4 over most qualities) likewise excluded. Typical
    // values: 1 (b9), 2 (9), 6 (#11/tritone), 8 (b13), 9 (13), 10 (b7),
    // 11 (maj7). Mask normalizes via % 12 so author shorthand is forgiving
    // but you should write in 0-11 to stay readable.
    targetExtensions: number[];
    deviceProb: number;
    allowedDevices: string[];
    sustainProb: number;
    maxSustainSteps: number;
    vibratoIntensity: number;
    commonToneWeight: number;
    stationaryProb: number;
    rhythmicDensity: number;
    syncopationLikelihood: number;
    // S6: wired in soloist-pitch-engine selectPitchAndDevices candidate loop
    // as a final-stage weight *= CHROMATIC_NEIGHBOR_BASE_PENALTY * chromaticism
    // multiplier that controls how freely chromatic approach-note neighbors
    // of chord tones are admitted. Admission is gated off entirely below 0.3
    // so low-chromaticism styles (country 0.2, default scalar 0.1) stay diatonic.
    chromaticism: number;
    seedTriplets: SeedTriplets;
    motivicResponse: MotivicResponse;
    // #555 — hook-lane opt-in. When `hookLoop` is true the soloist captures a
    // short window of the head (`hookBars` bars, default 2) and replays it
    // near-verbatim every bar (Hip Hop). Absent/false on every other profile, so
    // the hook short-circuit in getSoloistNote is a no-op for them.
    hookLoop?: boolean;
    hookBars?: number;
}

const DEFAULT_SEED_TRIPLETS: SeedTriplets = {
    enabled: false,
    cellBias: 0,
    pickupBias: 0,
    mutationBias: 0,
    cadenceBias: 0,
    timingStrength: 0,
};

const DEFAULT_MOTIVIC_RESPONSE: MotivicResponse = {
    enabled: false,
    rhythmReuse: 0.68,
    pitchReuse: 0.42,
    contourReuse: 0.36,
    cadenceWeight: 0.55,
    tripletCarry: 0.35,
    deviceDamp: 0.72,
    delayBias: 0.18,
    echoBias: 0.16,
    compressionBias: 0.12,
    sectionRecall: 0.72,
    formArcRecall: 0.52,
    maxResponseNotes: 8,
    spaceBias: 0,
};

const DEFAULT_STYLE_CONFIG: StyleConfig = {
    genreGravityOffset: 0,
    restBase: 0.1,
    timingJitter: 8,
    maxNotesPerPhrase: 24,
    minNotesPerPhrase: 2,
    doubleStopProb: 0.25,
    anticipationProb: 0.1,
    targetExtensions: [2, 9],
    deviceProb: 0.12,
    allowedDevices: ['run', 'slide', 'guitarDouble'],
    sustainProb: 0.15,
    maxSustainSteps: 8,
    vibratoIntensity: 0.8,
    commonToneWeight: 200,
    stationaryProb: 0.05,
    rhythmicDensity: 0.5,
    syncopationLikelihood: 0.2,
    chromaticism: 0.1,
    seedTriplets: DEFAULT_SEED_TRIPLETS,
    motivicResponse: DEFAULT_MOTIVIC_RESPONSE,
};

const STYLE_OVERRIDES: Record<string, Partial<StyleConfig>> = {
    scalar: {
        motivicResponse: {
            enabled: true,
            rhythmReuse: 0.74,
            pitchReuse: 0.48,
            contourReuse: 0.4,
            cadenceWeight: 0.6,
            tripletCarry: 0.4,
            deviceDamp: 0.68,
            delayBias: 0.16,
            echoBias: 0.14,
            compressionBias: 0.1,
            sectionRecall: 0.76,
            formArcRecall: 0.58,
            maxResponseNotes: 7,
            spaceBias: 0.12,
        },
    },
    rock: {
        doubleStopProb: 0.1,
        allowedDevices: ['run', 'slide', 'guitarDouble', 'bluesCurl'],
        sustainProb: 0.2,
        vibratoIntensity: 1,
        commonToneWeight: 300,
        stationaryProb: 0.15,
        syncopationLikelihood: 0.3,
        motivicResponse: {
            enabled: true,
            rhythmReuse: 0.7,
            pitchReuse: 0.44,
            contourReuse: 0.32,
            cadenceWeight: 0.58,
            tripletCarry: 0.18,
            deviceDamp: 0.62,
            delayBias: 0.14,
            echoBias: 0.18,
            compressionBias: 0.08,
            sectionRecall: 0.84,
            formArcRecall: 0,
            maxResponseNotes: 7,
            spaceBias: 0.14,
        },
    },
    blues: {
        restBase: 0.09,
        timingJitter: 25,
        // Keep the blues line from sagging into too much empty space.
        minNotesPerPhrase: 4,
        doubleStopProb: 0.35,
        anticipationProb: 0.3,
        // S6: was [9, 10]; dropped 10 (b7 already rewarded by blueNote branch).
        targetExtensions: [9],
        deviceProb: 0.4,
        allowedDevices: ['bluesLick', 'slide', 'guitarDouble'],
        sustainProb: 0.22,
        // Shorter sustains keep the phrase moving while preserving a bluesy breath.
        maxSustainSteps: 6,
        vibratoIntensity: 1.2,
        commonToneWeight: 500,
        stationaryProb: 0.1,
        // Lift the attack rate enough to avoid sub-threshold dips, but keep the pocket open.
        rhythmicDensity: 0.82,
        syncopationLikelihood: 0.8,
        chromaticism: 0.6,
        motivicResponse: {
            enabled: true,
            rhythmReuse: 0.88,
            pitchReuse: 0.62,
            contourReuse: 0.46,
            cadenceWeight: 0.82,
            tripletCarry: 0.78,
            deviceDamp: 0.38,
            delayBias: 0.12,
            echoBias: 0.12,
            compressionBias: 0.1,
            sectionRecall: 0.84,
            formArcRecall: 0.72,
            maxResponseNotes: 8,
            spaceBias: 0.06,
        },
        seedTriplets: {
            enabled: true,
            cellBias: 0.72,
            pickupBias: 0.84,
            mutationBias: 0.58,
            cadenceBias: 0.48,
            timingStrength: 1.0,
        },
    },
    neo: {
        genreGravityOffset: 0.015,
        restBase: 0.12,
        timingJitter: 25,
        doubleStopProb: 0.15,
        anticipationProb: 0.45,
        targetExtensions: [2, 6, 9, 11],
        deviceProb: 0.25,
        allowedDevices: ['quartal', 'slide', 'guitarDouble'],
        sustainProb: 0.25,
        maxSustainSteps: 10,
        vibratoIntensity: 0.9,
        commonToneWeight: 350,
        stationaryProb: 0.14,
        rhythmicDensity: 0.68,
        syncopationLikelihood: 0.9,
        chromaticism: 0.4,
        motivicResponse: {
            enabled: true,
            rhythmReuse: 0.64,
            pitchReuse: 0.46,
            contourReuse: 0.38,
            cadenceWeight: 0.52,
            tripletCarry: 0.22,
            deviceDamp: 0.74,
            delayBias: 0.3,
            echoBias: 0.22,
            compressionBias: 0.1,
            sectionRecall: 0.78,
            formArcRecall: 0.44,
            maxResponseNotes: 6,
            spaceBias: 0.36,
        },
    },
    funk: {
        genreGravityOffset: -0.005,
        timingJitter: 5,
        maxNotesPerPhrase: 32,
        minNotesPerPhrase: 3,
        doubleStopProb: 0.15,
        anticipationProb: 0.2,
        // S6: was [9, 13]; dropped 13 (normalized to 1=b9, Phrygian color rare in funk).
        targetExtensions: [9],
        deviceProb: 0.2,
        allowedDevices: ['slide', 'run'],
        commonToneWeight: 300,
        stationaryProb: 0.1,
        rhythmicDensity: 0.8,
        syncopationLikelihood: 0.9,
        chromaticism: 0.3,
        // #563 — funk call-and-response. The answer ECHOES THE RHYTHMIC FIGURE (the
        // horn-stab groove) but NOT the pitches — it's a sparse, percussive reply, not
        // a bebop melodic restatement. So: high rhythmReuse, LOW pitchReuse, HIGH
        // spaceBias (leave air in the answer), few notes. tripletCarry low (funk is
        // sixteenth-based, not triplet). Exact weights are a by-ear tuning item (#563
        // Notes) — these are funk-shaped starting values.
        motivicResponse: {
            enabled: true,
            rhythmReuse: 0.82,
            pitchReuse: 0.28,
            contourReuse: 0.3,
            cadenceWeight: 0.5,
            tripletCarry: 0.2,
            deviceDamp: 0.74,
            delayBias: 0.18,
            echoBias: 0.16,
            compressionBias: 0.12,
            sectionRecall: 0.7,
            formArcRecall: 0.48,
            maxResponseNotes: 5,
            spaceBias: 0.34,
        },
    },
    hiphop: {
        genreGravityOffset: 0.015,
        restBase: 0.15,
        timingJitter: 20,
        maxNotesPerPhrase: 16,
        doubleStopProb: 0.1,
        anticipationProb: 0.3,
        targetExtensions: [2, 9, 11],
        deviceProb: 0.3,
        allowedDevices: ['bluesLick', 'slide', 'quartal'],
        commonToneWeight: 300,
        stationaryProb: 0.15,
        rhythmicDensity: 0.6,
        syncopationLikelihood: 0.7,
        chromaticism: 0.2,
        // #555 — hip-hop melody is a looped 1–2 bar hook, not a through-composed
        // solo. Capture the head's strongest 2-bar window and replay it verbatim.
        hookLoop: true,
        hookBars: 2,
    },
    jazz: {
        restBase: 0.08,
        timingJitter: 15,
        maxNotesPerPhrase: 32,
        minNotesPerPhrase: 3,
        doubleStopProb: 0.35,
        anticipationProb: 0.6,
        // S6: was [2, 6, 9, 11, 13]; dropped 13 (normalized to 1=b9, incidental).
        targetExtensions: [2, 6, 9, 11],
        deviceProb: 0.35,
        allowedDevices: [
            'enclosure',
            'run',
            'birdFlurry',
            'chromaticFall',
            'bebopScale',
            'quartalStack',
            'sheetsOfSound',
        ],
        commonToneWeight: 400,
        stationaryProb: 0.08,
        rhythmicDensity: 0.8,
        syncopationLikelihood: 0.85,
        chromaticism: 0.7,
        motivicResponse: {
            enabled: true,
            rhythmReuse: 0.84,
            pitchReuse: 0.56,
            contourReuse: 0.52,
            cadenceWeight: 0.74,
            tripletCarry: 0.74,
            deviceDamp: 0.46,
            delayBias: 0.18,
            echoBias: 0.16,
            compressionBias: 0.22,
            sectionRecall: 0.86,
            formArcRecall: 0.74,
            maxResponseNotes: 8,
            spaceBias: 0.08,
        },
        seedTriplets: {
            enabled: true,
            cellBias: 0.56,
            pickupBias: 0.62,
            mutationBias: 0.36,
            cadenceBias: 0.28,
            timingStrength: 0.78,
        },
    },
    bird: {
        restBase: 0.05,
        timingJitter: 12,
        maxNotesPerPhrase: 48,
        minNotesPerPhrase: 4,
        doubleStopProb: 0.15,
        anticipationProb: 0.8,
        // S6: was [2, 5, 6, 9]; dropped 5 (P4 avoid note on most qualities).
        targetExtensions: [2, 6, 9],
        deviceProb: 0.4,
        // #573: the Jazz genre runs the `bird` profile (SMART_GENRES.Jazz.soloist),
        // so the line-323 `activeStyle === 'jazz'` bebopScale gate never fired for
        // it — the built-and-wanted bebopScale device was unreachable from the
        // genre. Add it here at the LOWEST pickByRank weight (last position → rank
        // 1 of N) so the genre CAN play it without overwhelming Parker's
        // enclosure/approach-tone lean (the bird idiom leads on those).
        allowedDevices: [
            'enclosure',
            'run',
            'birdFlurry',
            'guitarDouble',
            'chromaticFall',
            'bebopScale',
        ],
        commonToneWeight: 150,
        // Bird phrases stay line-forward, but bebop needs enough surface motion
        // to stay comfortably above the critique's notes-per-bar floor.
        rhythmicDensity: 1.14,
        // Keep Bird from lingering on sustained tones; shorter holds create more attacks.
        sustainProb: 0.08,
        maxSustainSteps: 6,
        syncopationLikelihood: 0.7,
        chromaticism: 0.9,
        motivicResponse: {
            enabled: true,
            rhythmReuse: 0.8,
            pitchReuse: 0.52,
            contourReuse: 0.58,
            cadenceWeight: 0.68,
            tripletCarry: 0.7,
            deviceDamp: 0.5,
            delayBias: 0.22,
            echoBias: 0.2,
            compressionBias: 0.24,
            sectionRecall: 0.84,
            formArcRecall: 0.78,
            maxResponseNotes: 8,
            spaceBias: 0.06,
        },
        seedTriplets: {
            enabled: true,
            cellBias: 0.68,
            pickupBias: 0.74,
            mutationBias: 0.44,
            cadenceBias: 0.24,
            timingStrength: 0.82,
        },
    },
    disco: {
        minNotesPerPhrase: 3,
        doubleStopProb: 0.05,
        anticipationProb: 0.2,
        deviceProb: 0.1,
        allowedDevices: ['run'],
        stationaryProb: 0.1,
        rhythmicDensity: 0.7,
        syncopationLikelihood: 0.6,
        chromaticism: 0.2,
    },
    bossa: {
        restBase: 0.12,
        timingJitter: 15,
        doubleStopProb: 0.08,
        anticipationProb: 0.35,
        targetExtensions: [2, 6, 9],
        deviceProb: 0.2,
        allowedDevices: ['enclosure', 'slide', 'guitarDouble'],
        commonToneWeight: 300,
        stationaryProb: 0.08,
        rhythmicDensity: 0.64,
        syncopationLikelihood: 0.8,
        chromaticism: 0.5,
        motivicResponse: {
            enabled: true,
            rhythmReuse: 0.66,
            pitchReuse: 0.44,
            contourReuse: 0.34,
            cadenceWeight: 0.56,
            tripletCarry: 0.2,
            deviceDamp: 0.76,
            delayBias: 0.24,
            echoBias: 0.2,
            compressionBias: 0.1,
            sectionRecall: 0.86,
            formArcRecall: 0.32,
            maxResponseNotes: 5,
            spaceBias: 0.42,
        },
    },
    country: {
        restBase: 0.08,
        timingJitter: 4,
        maxNotesPerPhrase: 32,
        minNotesPerPhrase: 3,
        doubleStopProb: 0.5,
        anticipationProb: 0.2,
        // S6: was [2, 4, 9]; dropped 4 (maj3 is a chord tone, already +150).
        targetExtensions: [2, 9],
        deviceProb: 0.45,
        allowedDevices: [
            'guitarDouble',
            'slide',
            'countryBend',
            'chickenPick',
            'banjoRoll',
            'graceSlide',
        ],
        rhythmicDensity: 0.7,
        syncopationLikelihood: 0.4,
        chromaticism: 0.3,
    },
    metal: {
        timingJitter: 2,
        maxNotesPerPhrase: 32,
        minNotesPerPhrase: 6,
        doubleStopProb: 0.05,
        anticipationProb: 0.05,
        // S6: was [2, 7]; dropped 7 (P5 is a chord tone, already +150).
        targetExtensions: [2],
        deviceProb: 0.5,
        allowedDevices: ['run'],
        commonToneWeight: 100,
        stationaryProb: 0.02,
        rhythmicDensity: 0.9,
        syncopationLikelihood: 0.3,
        chromaticism: 0.6,
    },
    reggae: {
        restBase: 0.12,
        timingJitter: 20,
        maxNotesPerPhrase: 16,
        doubleStopProb: 0.2,
        targetExtensions: [2, 6, 9],
        deviceProb: 0.15,
        allowedDevices: ['guitarDouble'],
        commonToneWeight: 400,
        stationaryProb: 0.25,
        syncopationLikelihood: 0.9,
        chromaticism: 0.2,
    },
    acoustic: {
        restBase: 0.15,
        timingJitter: 15,
        maxNotesPerPhrase: 12,
        doubleStopProb: 0.1,
        anticipationProb: 0.15,
        deviceProb: 0.1,
        allowedDevices: ['slide', 'run'],
        stationaryProb: 0.1,
        rhythmicDensity: 0.6,
        syncopationLikelihood: 0.4,
        chromaticism: 0.2,
    },
    ska: {
        genreGravityOffset: -0.005,
        timingJitter: 5,
        maxNotesPerPhrase: 32,
        minNotesPerPhrase: 4,
        doubleStopProb: 0.2,
        anticipationProb: 0.3,
        // S6: was [2, 4, 9]; dropped 4 (maj3 is a chord tone, already +150).
        targetExtensions: [2, 9],
        deviceProb: 0.35,
        allowedDevices: ['run', 'slide', 'guitarDouble', 'enclosure', 'chromaticFall'],
        commonToneWeight: 250,
        stationaryProb: 0.12,
        rhythmicDensity: 0.8,
        syncopationLikelihood: 0.8,
        chromaticism: 0.4,
    },
};

export const STYLE_CONFIG: Record<string, StyleConfig> = Object.keys(STYLE_OVERRIDES).reduce(
    (acc: Record<string, StyleConfig>, key) => {
        const styleOverride = (STYLE_OVERRIDES as Record<string, any>)[key];
        acc[key] = {
            ...DEFAULT_STYLE_CONFIG,
            ...styleOverride,
            seedTriplets: {
                ...DEFAULT_SEED_TRIPLETS,
                ...(styleOverride.seedTriplets || {}),
            },
            motivicResponse: {
                ...DEFAULT_MOTIVIC_RESPONSE,
                ...(styleOverride.motivicResponse || {}),
            },
        };
        return acc;
    },
    {} as Record<string, StyleConfig>,
);

const GENRE_STYLE_MAPPING: Record<string, string> = {
    Rock: 'rock',
    Jazz: 'jazz',
    Funk: 'funk',
    Blues: 'blues',
    'Neo-Soul': 'neo',
    'Hip Hop': 'hiphop',
    Disco: 'disco',
    Bossa: 'bossa',
    'Bossa Nova': 'bossa',
    Acoustic: 'acoustic',
    Reggae: 'reggae',
    Country: 'country',
    'Ska-Punk': 'ska',
    Ska: 'ska',
    Metal: 'metal',
};

/**
 * Collective pools of stylistic influences for each genre.
 * The soloist randomly "channels" one of these for the duration of a section.
 */
export const INFLUENCE_POOLS: Record<string, string[]> = {
    rock: ['gilmour', 'slash', 'hendrix', 'evh', 'beck'],
    jazz: ['bird', 'evans', 'coltrane', 'miles'],
    bird: ['bird', 'evans', 'coltrane', 'miles'],
    blues: ['srv', 'monk', 'armstrong', 'miles'],
    neo: ['miles', 'srv'], // Cross-genre influences
    funk: ['srv', 'slash'],
};

export interface SoloistIntent {
    maxIntensity: number;
    thematicAnchorScale: number;
    phrasingBridgeProb: number;
    syncopationBias: number;
    embellishmentProb: number;
    stationaryScale: number;
}

/**
 * Soloist Intent Behaviors
 * Maps intensity ranges to specific performance "intentions".
 * These allow the soloist to "dissolve" the melody or bridge gaps
 * based on musical intent rather than rigid intensity cliffs.
 */
export const SOLOIST_INTENTS: Record<string, SoloistIntent> = {
    CONSERVATIVE: {
        maxIntensity: 0.35,
        thematicAnchorScale: 1.0, // Stick strictly to theme
        phrasingBridgeProb: 0.0, // Always respect structural breaths
        syncopationBias: 0.0, // Prefer downbeats (style-adjusted)
        embellishmentProb: 0.2, // Minimal turns/slides
        stationaryScale: 1.0, // Strong focus on repeating hooks
    },
    CONVERSATIONAL: {
        maxIntensity: 0.75,
        thematicAnchorScale: 0.7, // Start introducing variations
        phrasingBridgeProb: 0.5, // Sometimes push through 8-measure gaps
        syncopationBias: 0.6, // Moderate syncopation
        embellishmentProb: 0.5, // Active phrasing
        stationaryScale: 0.5, // Occasional repetition
    },
    EXPLORATORY: {
        maxIntensity: 1.0,
        thematicAnchorScale: 0.3, // Theme is a secondary anchor
        phrasingBridgeProb: 0.9, // Usually push through boundaries
        syncopationBias: 1.0, // Aggressive off-beats
        embellishmentProb: 0.9, // High-energy runs/flurries
        stationaryScale: 0.1, // Minimal repetition, favor motion
    },
};

export interface RegisterProfile {
    seedFloor: number;
    seedCenter: number;
    seedCeiling: number;
    seedIntroDrop: number;
    seedChorusLift: number;
    seedDepartureLift: number;
    liveFloor: number;
    liveCenter: number;
    liveCeiling: number;
    liveLoopLift: number;
}

const DEFAULT_REGISTER_PROFILE: RegisterProfile = {
    seedFloor: 60,
    seedCenter: 66,
    seedCeiling: 84,
    seedIntroDrop: 4,
    seedChorusLift: 4,
    seedDepartureLift: 3,
    liveFloor: 60,
    liveCenter: 68,
    liveCeiling: 92,
    liveLoopLift: 2,
};

const SOLOIST_REGISTER_PROFILES: Record<string, Partial<RegisterProfile>> = {
    scalar: {},
    acoustic: {
        seedFloor: 60,
        seedCenter: 64,
        seedCeiling: 82,
        liveFloor: 60,
        liveCenter: 66,
        liveCeiling: 88,
    },
    blues: {
        seedFloor: 58,
        seedCenter: 64,
        seedCeiling: 84,
        seedIntroDrop: 3,
        seedChorusLift: 4,
        seedDepartureLift: 4,
        liveFloor: 58,
        liveCenter: 67,
        liveCeiling: 89,
        liveLoopLift: 2,
    },
    bird: {
        seedFloor: 60,
        seedCenter: 66,
        seedCeiling: 86,
        seedIntroDrop: 1,
        seedChorusLift: 4,
        seedDepartureLift: 5,
        liveFloor: 60,
        liveCenter: 70,
        liveCeiling: 92,
        liveLoopLift: 3,
    },
    bossa: {
        seedFloor: 58,
        seedCenter: 62,
        seedCeiling: 82,
        seedIntroDrop: 2,
        seedChorusLift: 2,
        seedDepartureLift: 3,
        liveFloor: 58,
        liveCenter: 65,
        liveCeiling: 88,
        liveLoopLift: 2,
    },
    country: {
        seedFloor: 60,
        seedCenter: 65,
        seedCeiling: 84,
        seedIntroDrop: 3,
        seedChorusLift: 4,
        seedDepartureLift: 3,
        liveFloor: 60,
        liveCenter: 67,
        liveCeiling: 89,
        liveLoopLift: 2,
    },
    disco: {
        seedFloor: 60,
        seedCenter: 66,
        seedCeiling: 86,
        seedIntroDrop: 2,
        seedChorusLift: 4,
        seedDepartureLift: 4,
        liveFloor: 60,
        liveCenter: 69,
        liveCeiling: 90,
        liveLoopLift: 2,
    },
    funk: {
        seedFloor: 60,
        seedCenter: 64,
        seedCeiling: 86,
        seedIntroDrop: 2,
        seedChorusLift: 4,
        seedDepartureLift: 4,
        liveFloor: 60,
        liveCenter: 68,
        liveCeiling: 90,
        liveLoopLift: 2,
    },
    jazz: {
        seedFloor: 58,
        seedCenter: 63,
        seedCeiling: 82,
        seedIntroDrop: 2,
        seedChorusLift: 3,
        seedDepartureLift: 4,
        liveFloor: 58,
        liveCenter: 66,
        liveCeiling: 90,
        liveLoopLift: 2,
    },
    metal: {
        seedFloor: 60,
        seedCenter: 66,
        seedCeiling: 88,
        seedIntroDrop: 2,
        seedChorusLift: 5,
        seedDepartureLift: 5,
        liveFloor: 60,
        liveCenter: 70,
        liveCeiling: 92,
        liveLoopLift: 3,
    },
    neo: {
        seedFloor: 60,
        seedCenter: 65,
        seedCeiling: 84,
        seedIntroDrop: 2,
        seedChorusLift: 3,
        seedDepartureLift: 4,
        liveFloor: 60,
        liveCenter: 68,
        liveCeiling: 90,
        liveLoopLift: 2,
    },
    reggae: {
        seedFloor: 60,
        seedCenter: 64,
        seedCeiling: 82,
        seedIntroDrop: 3,
        seedChorusLift: 3,
        seedDepartureLift: 3,
        liveFloor: 60,
        liveCenter: 66,
        liveCeiling: 88,
        liveLoopLift: 2,
    },
    rock: {
        seedFloor: 60,
        seedCenter: 66,
        seedCeiling: 84,
        seedIntroDrop: 2,
        seedChorusLift: 5,
        seedDepartureLift: 4,
        liveFloor: 60,
        liveCenter: 68,
        liveCeiling: 90,
        liveLoopLift: 2,
    },
    ska: {
        seedFloor: 60,
        seedCenter: 66,
        seedCeiling: 86,
        seedIntroDrop: 1,
        seedChorusLift: 4,
        seedDepartureLift: 4,
        liveFloor: 60,
        liveCenter: 69,
        liveCeiling: 90,
        liveLoopLift: 2,
    },
};

const REGISTER_PROFILE_ALIASES: Record<string, string> = {
    armstrong: 'jazz',
    beck: 'rock',
    coltrane: 'bird',
    evans: 'jazz',
    // why (#628): `evh` aliased to the retired `shred` register profile; now
    // points to `rock` (Shred was always a Metal/Rock-family alias, never live).
    evh: 'rock',
    gilmour: 'rock',
    hendrix: 'rock',
    miles: 'jazz',
    monk: 'jazz',
    slash: 'rock',
    srv: 'blues',
};

const SOLOIST_STYLE_ALIASES: Record<string, string> = {
    ...REGISTER_PROFILE_ALIASES,
    'ska-horns': 'ska',
};

function getSmartGenreSoloistStyle(genreFeel: string | undefined): string | null {
    if (!genreFeel || !Object.hasOwn(SMART_GENRES, genreFeel)) {
        return null;
    }

    const config = Reflect.get(SMART_GENRES, genreFeel);
    if (
        !config ||
        typeof config !== 'object' ||
        !('soloist' in config) ||
        typeof config.soloist !== 'string'
    ) {
        return null;
    }

    return config.soloist;
}

function getGenreMappedSoloistStyle(genreFeel: string | undefined): string {
    if (!genreFeel || !Object.hasOwn(GENRE_STYLE_MAPPING, genreFeel)) {
        return 'scalar';
    }

    return GENRE_STYLE_MAPPING[genreFeel];
}

/**
 * Resolve the effective soloist style for smart-mode playback.
 * The active Studio genre feel should be the source of truth for smart instruments,
 * while a few legacy UI-only style ids still need lightweight aliasing.
 */
export function resolveSoloistStyle(
    style: string | undefined,
    genreFeel: string | undefined,
): string {
    if (!style || style === 'smart') {
        const smartStyle = getSmartGenreSoloistStyle(genreFeel);
        if (smartStyle && smartStyle !== 'smart') {
            return resolveSoloistStyle(smartStyle, genreFeel);
        }
        return getGenreMappedSoloistStyle(genreFeel);
    }

    if (Object.hasOwn(STYLE_CONFIG, style)) {
        return style;
    }

    if (Object.hasOwn(SOLOIST_STYLE_ALIASES, style)) {
        return SOLOIST_STYLE_ALIASES[style];
    }

    return getGenreMappedSoloistStyle(genreFeel);
}

/**
 * Resolve a register profile for the active soloist style.
 * Seeded heads stay within a genre-appropriate singable lane, while live loops
 * can climb a little more with intensity and later choruses.
 */
export function getSoloistRegisterProfile(
    style: string,
    genreFeel?: string | undefined,
): RegisterProfile {
    const effectiveStyle = resolveSoloistStyle(style, genreFeel);
    let resolvedStyle = 'scalar';
    if (Object.hasOwn(SOLOIST_REGISTER_PROFILES, effectiveStyle)) {
        resolvedStyle = effectiveStyle;
    } else if (Object.hasOwn(REGISTER_PROFILE_ALIASES, effectiveStyle)) {
        resolvedStyle = REGISTER_PROFILE_ALIASES[effectiveStyle];
    }

    return {
        ...DEFAULT_REGISTER_PROFILE,
        ...SOLOIST_REGISTER_PROFILES[resolvedStyle],
    };
}
