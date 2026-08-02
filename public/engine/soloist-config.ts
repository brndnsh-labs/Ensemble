import { resolveGenre, SMART_GENRES } from '../data/smart-genres.js';

export interface SeedTriplets {
    enabled: boolean;
    cellBias: number;
    pickupBias: number;
    mutationBias: number;
    cadenceBias: number;
    timingStrength: number;
}

export interface StyleConfig {
    restBase: number;
    timingJitter: number;
    // #591: the base *duration* (in beats) a phrase stays active, NOT a note
    // count. Read at soloist.ts as `baseLength = phraseActiveBeats * (0.3 +
    // intensity*0.7)`, then `baseLength * stepsPerBeat * roll` → active-window
    // steps. Renamed from `maxNotesPerPhrase` (which read like a per-phrase note
    // ceiling but never capped note count — the acoustic profile runs ~13.6
    // notes/phrase against an old value of 12). Contrast `minNotesPerPhrase`
    // below, which IS a genuine note-count floor.
    phraseActiveBeats: number;
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
}

const DEFAULT_SEED_TRIPLETS: SeedTriplets = {
    enabled: false,
    cellBias: 0,
    pickupBias: 0,
    mutationBias: 0,
    cadenceBias: 0,
    timingStrength: 0,
};

const DEFAULT_STYLE_CONFIG: StyleConfig = {
    restBase: 0.1,
    timingJitter: 8,
    phraseActiveBeats: 24,
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
};

const STYLE_OVERRIDES: Record<string, Partial<StyleConfig>> = {
    scalar: {},
    rock: {
        doubleStopProb: 0.1,
        allowedDevices: ['run', 'slide', 'guitarDouble', 'bluesCurl'],
        sustainProb: 0.2,
        vibratoIntensity: 1,
        commonToneWeight: 300,
        stationaryProb: 0.15,
        syncopationLikelihood: 0.3,
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
    },
    funk: {
        timingJitter: 5,
        phraseActiveBeats: 32,
        minNotesPerPhrase: 3,
        doubleStopProb: 0.15,
        anticipationProb: 0.2,
        // S6: was [9, 13]; dropped 13 (normalized to 1=b9, Phrygian color rare in funk).
        targetExtensions: [9],
        deviceProb: 0.2,
        // #565 — funk articulation. Funk's vocabulary is short percussive stabs and
        // curls, NOT scalar flurries: `run` (the least funk-idiomatic device) is
        // dropped from the base palette in favor of `bluesCurl` (half-step blue-note curl)
        // and `graceNote` (the ghosted grace 'pop' into the note). The high-intensity
        // head-bypass thematic path (soloist-pitch-engine) still re-adds `run` above
        // intensity 0.7, so funk keeps the *occasional* energetic run — it's just no
        // longer base vocabulary.
        allowedDevices: ['slide', 'bluesCurl', 'graceNote'],
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
    },
    hiphop: {
        restBase: 0.15,
        timingJitter: 20,
        phraseActiveBeats: 16,
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
    },
    jazz: {
        restBase: 0.08,
        timingJitter: 15,
        phraseActiveBeats: 32,
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
        phraseActiveBeats: 48,
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
        // #553: enriched from a 9-field stub to a full phrasing identity. Disco
        // upper lines (Chic / MFSB strings, EW&F horns) are bright, diatonic-major,
        // tightly-timed, syncopated, and HOOK-driven — a recurring figure that
        // returns each section rather than a through-composed bebop line.
        restBase: 0.12,
        // Disco is metronomic four-on-the-floor — keep the line tightly gridded.
        timingJitter: 6,
        phraseActiveBeats: 24,
        minNotesPerPhrase: 3,
        // String sections double the line (octaves/3rds) — more than the old 0.05.
        doubleStopProb: 0.2,
        anticipationProb: 0.3,
        // 6/9 brightness: 2 = the 9th, 9 = the added 6th. Disco harmony is major-6/9
        // rich, not lydian — no #11, no chromatic upper structures.
        targetExtensions: [2, 9],
        deviceProb: 0.28,
        // run (rapid string runs) leads; octaveLeap (the signature octave hook) is
        // prominent but second so runs keep the string character; slide (string
        // glissando) and graceNote (horn grace 'pop') fill out the palette.
        allowedDevices: ['run', 'octaveLeap', 'slide', 'graceNote'],
        // Hooks pedal/recur over the changes — reward common tones across chords.
        commonToneWeight: 300,
        stationaryProb: 0.1,
        rhythmicDensity: 0.8,
        syncopationLikelihood: 0.7,
        chromaticism: 0.2,
        // Hook recall — disco is riff-driven: the syncopated figure recurs nearly
        // verbatim and returns each section. Higher pitchReuse than funk's
        // pitch-shy percussive reply; tripletCarry near zero (disco is 16th-based).
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
        // #572 — bossa's hallmark is LYRICAL RESTRAINT: singable, held color tones (the
        // 6/9 it targets) with space between phrases, not a flowing bebop line. Bossa's
        // sparse density (rhythmicDensity 0.64 + restBase 0.12) already gives the space
        // (~29% fewer notes than jazz); the generic default (sustainProb 0.15) gave no
        // lyrical-sustain bias. This lifts the mean note duration. NOTE: the additive
        // sustain stack (rhythm engine) absorbs much of it, so it nudges the MEAN rather
        // than spawning many whole-note holds — a stronger long-hold lever would be a
        // bossa-specific boost in that block, deferred as by-ear. Exact value is a by-ear
        // tuning item (verify-by-ear).
        sustainProb: 0.42,
        maxSustainSteps: 16,
    },
    country: {
        restBase: 0.08,
        timingJitter: 4,
        phraseActiveBeats: 32,
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
        phraseActiveBeats: 32,
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
        phraseActiveBeats: 16,
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
        phraseActiveBeats: 12,
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
        timingJitter: 5,
        phraseActiveBeats: 32,
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

/**
 * Null-prototype, per #1266 and the prototype-guard rule in CLAUDE.md: this table
 * has several `STYLE_CONFIG[style] || STYLE_CONFIG.scalar` consumers
 * (`soloist-seeder.ts` ×2, `synth-soloist.ts`), and `style` is a *persisted*
 * value. On a plain literal, `STYLE_CONFIG['constructor']` returns the `Object`
 * constructor — a truthy hit that sails past the `||` and is then read as a style
 * config, so `styleConfig.seedTriplets` is `undefined` and every numeric knob
 * (`syncopationLikelihood`, `chromaticism`, …) silently falls to its `|| default`.
 * With many fallback-style consumers, hardening the declaration once beats an
 * `Object.hasOwn` at each of them.
 *
 * (The persist reader now validates `soloist.style` against `SOLOIST_STYLES`
 * too — but this table is read on the *worker's* mirror of the slice, so it
 * keeps its own guard rather than trusting a main-thread reader two hops away.)
 */
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
        };
        return acc;
    },
    Object.create(null) as Record<string, StyleConfig>,
);

/**
 * genreFeel → soloist profile, the fallback when a genre declares no `soloist`
 * (or declares one this file has no STYLE_CONFIG for). NOT derived from
 * `GENRE_OVERRIDES[*].soloist`: this table speaks STYLE_CONFIG keys, and one
 * genre's declared style is a UI-facing alias of a different profile name
 * (Ska-Punk declares 'ska-horns', which aliases to the 'ska' profile).
 *
 * Keys are FEELS. The two that diverge from their picker name ('Bossa Nova',
 * 'Ska') are reconciled by the naming authority in `data/smart-genres.ts` — see
 * the GENRE-NAMING AUTHORITY block there rather than restating the alias here.
 *
 * Exported for the #1130 genreFeel-routing completeness guard
 * (tests/standards/genre-feel-canon-guard.test.ts).
 */
export const GENRE_STYLE_MAPPING: Record<string, string> = {
    Rock: 'rock',
    Jazz: 'jazz',
    Funk: 'funk',
    Blues: 'blues',
    'Neo-Soul': 'neo',
    'Hip Hop': 'hiphop',
    Disco: 'disco',
    'Bossa Nova': 'bossa',
    Acoustic: 'acoustic',
    Reggae: 'reggae',
    Country: 'country',
    Ska: 'ska',
    Metal: 'metal',
};

// INFLUENCE_POOLS (per-genre "channeled greats" pools) removed in epic #10 — it
// was read only by the retired legacy soloist engine. Phrase-first does not model
// per-section influence channeling.

// SoloistIntent + SOLOIST_INTENTS (intensity→"intention" behavior table) removed in
// epic #10/#866 — read only by the retired legacy picker (selectPitchAndDevices).
// Phrase-first drives intensity through its own arc/development model.

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
    // why (#1177): SMART_GENRES is keyed by canon genre NAME while this function is
    // handed a FEEL, so before the authority existed the lookup silently missed for
    // the two genres whose feel ≠ name (Bossa → 'Bossa Nova', Ska-Punk → 'Ska') and
    // they reached their profile only via the GENRE_STYLE_MAPPING fallback below.
    // `resolveGenre` normalizes EITHER keyspace to the canon name, which keeps the
    // old accidental name-tolerance (callers/harnesses that pass a picker name here)
    // while making the feel path a deliberate hit. Behavior-frozen: all 13 genres
    // converged to the same profile either way — pinned by
    // tests/standards/soloist-routing-guard.test.ts.
    const genreName = resolveGenre(genreFeel)?.name;
    if (!genreName || !Object.hasOwn(SMART_GENRES, genreName)) {
        return null;
    }

    const config = Reflect.get(SMART_GENRES, genreName);
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
