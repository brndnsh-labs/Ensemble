/**
 * Builds a soloist-state mock with the C2 nested `session` / `audio` shape
 * populated from a legacy flat input. Tests can keep writing flat properties
 * (e.g. `{ isResting: true, busySteps: 0, sessionSeed: ... }`) and this helper
 * lifts each known key into its real home — so that engine code reading
 * `soloist.session.phrasing.isResting` etc. sees the value.
 *
 * Unknown keys are kept at the top level (for forward compat with tests that
 * stash bespoke fields on the soloist mock — these don't cross the engine
 * boundary).
 */
export function makeSoloistMock<T extends Record<string, unknown>>(flat: T): T {
    const out: any = {};

    // Config (flat at the top)
    const CONFIG = new Set([
        'enabled',
        'preset',
        'mode',
        'style',
        'octave',
        'volume',
        'reverb',
        'complexity',
        'phrasingIntensity',
        'hookRetentionProb',
        'doubleStopProb',
        'tradeMode',
        'motifTracking',
        'seed',
    ]);

    // Default nested skeleton — engine code only reads, so we provide the
    // shape; tests overwrite specific leaves via the flat input below.
    const session: any = {
        seed: null,
        sessionSteps: 0,
        phraseCount: 0,
        tension: 0,
        lastSmartStyle: 'scalar',
        phrasing: {
            state: 'rest',
            isResting: true,
            transitionState: null,
            restSteps: 0,
            activeSteps: 0,
            busySteps: 0,
            isWaitingForEntry: false,
            isYielding: false,
            lastAttackStep: -100,
        },
        currentPhrase: {
            startStep: null,
            loopCount: null,
            sectionLabel: null,
            sectionOccurrence: 0,
            notesInPhrase: 0,
            context: {
                role: 'call',
                skeleton: [],
                lastInterval: null,
                profile: 'srv',
                signature: null,
                responseSignature: null,
                responseMode: 'free',
                responseSource: 'free',
                sectionLabel: null,
                sectionOccurrence: 0,
            },
        },
        memory: {
            recentNotes: [],
            hookBuffer: [],
            sharedHookBuffer: [],
            motifCache: null,
            rhythmicMotif: [],
            lickDictionary: [],
            sectionRecall: {},
            sectionRecallLoop: null,
            formArcRecall: {},
        },
        rhythm: {
            plan: [],
            entropy: 0,
            deviceBuffer: [],
            embellishmentBuffer: [],
        },
        contour: {
            trend: 'Static',
            direction: 1,
            steps: 0,
        },
    };
    const audio: any = {
        activeVoices: [],
        buffer: new Map(),
        lastFreq: null,
        lastMidiPlayed: null,
        lastRenderedFreq: null,
        lastPlayedFreq: null,
        lastNoteEnd: 0,
    };

    // Routing: flat alias -> path in the nested shape.
    const ROUTES: Record<string, (v: unknown) => void> = {
        sessionSeed: (v) => {
            session.seed = v;
        },
        sessionSteps: (v) => {
            session.sessionSteps = v;
        },
        phraseCount: (v) => {
            session.phraseCount = v;
        },
        tension: (v) => {
            session.tension = v;
        },
        lastSmartStyle: (v) => {
            session.lastSmartStyle = v;
        },
        phrasingState: (v) => {
            session.phrasing.state = v;
        },
        isResting: (v) => {
            session.phrasing.isResting = v;
        },
        transitionState: (v) => {
            session.phrasing.transitionState = v;
        },
        restSteps: (v) => {
            session.phrasing.restSteps = v;
        },
        activeSteps: (v) => {
            session.phrasing.activeSteps = v;
        },
        busySteps: (v) => {
            session.phrasing.busySteps = v;
        },
        isWaitingForEntry: (v) => {
            session.phrasing.isWaitingForEntry = v;
        },
        isYielding: (v) => {
            session.phrasing.isYielding = v;
        },
        lastAttackStep: (v) => {
            session.phrasing.lastAttackStep = v;
        },
        phraseStartStep: (v) => {
            session.currentPhrase.startStep = v;
        },
        phraseLoopCount: (v) => {
            session.currentPhrase.loopCount = v;
        },
        phraseSectionLabel: (v) => {
            session.currentPhrase.sectionLabel = v;
        },
        phraseSectionOccurrence: (v) => {
            session.currentPhrase.sectionOccurrence = v;
        },
        notesInPhrase: (v) => {
            session.currentPhrase.notesInPhrase = v;
        },
        phraseContext: (v) => {
            session.currentPhrase.context = v as any;
        },
        recentNotes: (v) => {
            session.memory.recentNotes = v as any;
        },
        hookBuffer: (v) => {
            session.memory.hookBuffer = v as any;
        },
        sharedHookBuffer: (v) => {
            session.memory.sharedHookBuffer = v as any;
        },
        motifCache: (v) => {
            session.memory.motifCache = v;
        },
        rhythmicMotif: (v) => {
            session.memory.rhythmicMotif = v as any;
        },
        lickDictionary: (v) => {
            session.memory.lickDictionary = v as any;
        },
        sectionRecall: (v) => {
            session.memory.sectionRecall = v as any;
        },
        sectionRecallLoop: (v) => {
            session.memory.sectionRecallLoop = v as any;
        },
        formArcRecall: (v) => {
            session.memory.formArcRecall = v as any;
        },
        rhythmPlan: (v) => {
            session.rhythm.plan = v as any;
        },
        rhythmicEntropy: (v) => {
            session.rhythm.entropy = v as any;
        },
        deviceBuffer: (v) => {
            session.rhythm.deviceBuffer = v as any;
        },
        embellishmentBuffer: (v) => {
            session.rhythm.embellishmentBuffer = v as any;
        },
        melodicTrend: (v) => {
            session.contour.trend = v as any;
        },
        direction: (v) => {
            session.contour.direction = v as any;
        },
        contourSteps: (v) => {
            session.contour.steps = v as any;
        },
        activeVoices: (v) => {
            audio.activeVoices = v as any;
        },
        buffer: (v) => {
            audio.buffer = v as any;
        },
        lastFreq: (v) => {
            audio.lastFreq = v as any;
        },
        lastMidiPlayed: (v) => {
            audio.lastMidiPlayed = v as any;
        },
        lastRenderedFreq: (v) => {
            audio.lastRenderedFreq = v as any;
        },
        lastPlayedFreq: (v) => {
            audio.lastPlayedFreq = v as any;
        },
        lastNoteEnd: (v) => {
            audio.lastNoteEnd = v as any;
        },
    };

    for (const [k, v] of Object.entries(flat)) {
        if (CONFIG.has(k)) {
            out[k] = v;
        } else if (ROUTES[k]) {
            ROUTES[k](v);
        } else if (k === 'session' && v && typeof v === 'object') {
            // Deep-merge caller-supplied nested session shape on top of the defaults.
            deepMerge(session, v as Record<string, unknown>);
        } else if (k === 'audio' && v && typeof v === 'object') {
            deepMerge(audio, v as Record<string, unknown>);
        } else {
            // Unknown key — preserve at top level for back-compat with tests
            // that stash bespoke fields here.
            out[k] = v;
        }
    }

    // Legacy inference: tests written for the flat-state era often set
    // `phrasingState` without explicitly setting `isResting`. The old engine
    // treated `isResting === undefined` as "infer from phrasingState"; mock
    // that by deriving isResting when only one of the pair was specified.
    if (
        'phrasingState' in flat &&
        !('isResting' in flat) &&
        flat.phrasingState !== 'rest' &&
        flat.phrasingState !== undefined
    ) {
        session.phrasing.isResting = false;
    }

    out.session = session;
    out.audio = audio;
    return out as T;
}

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): void {
    for (const [k, v] of Object.entries(source)) {
        if (
            v &&
            typeof v === 'object' &&
            !Array.isArray(v) &&
            target[k] &&
            typeof target[k] === 'object' &&
            !Array.isArray(target[k])
        ) {
            deepMerge(target[k] as Record<string, unknown>, v as Record<string, unknown>);
        } else {
            target[k] = v;
        }
    }
}
