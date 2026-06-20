import type { GlobalContext } from '../state/playback.js';
import type { EnsembleState } from '../types.js';
import { applyBluesBends, calculateTimingOffset, getFrequency } from '../utils.js';
import { ALTERED_HOOK_QUALITIES } from './accompaniment.js';
import { scrambleHash } from './hash-utils.js';
import type { SoloistIntent } from './soloist-config.js';
import { getSoloistRegisterProfile, STYLE_CONFIG } from './soloist-config.js';
import { DEVICE_SPAN_STEPS, generateExtraNotes, generateMelodicDevice } from './soloist-devices.js';
import {
    allowsSoloistPolyphony,
    isSoloistGuitarMode,
    isSoloistMonophonicMode,
    resolveSoloistMode,
} from './soloist-mode-policy.js';
import { getScaleForChord } from './theory-scales.js';

export interface DeviceBufferResult {
    buffer: any[];
    first: any;
    busySteps: number;
}

/**
 * Decide whether `deviceType` fits at `currentStep` given the rhythm plan ahead.
 *
 * Devices have their own internal `durationSteps` budgets (see DEVICE_SPAN_STEPS).
 * When a long device fires mid-phrase, the plan consumer in soloist.ts silently
 * shifts off any planned attack inside the device's span — a real soloist would
 * never plan five attacks and then accidentally play a five-note lick on attack
 * two. The gate keeps long, phrase-substitute devices to positions where the
 * plan has space, and limits medium devices to swallowing at most one planned
 * attack (so they read as expanded ornaments).
 */
function deviceFitsHere(deviceType: string, soloistState: any, currentStep: number): boolean {
    const span = DEVICE_SPAN_STEPS[deviceType] ?? 4;
    if (span <= 3) {
        return true; // Ornaments: always fine
    }
    const plan = soloistState.session?.rhythm?.plan;
    if (!Array.isArray(plan) || plan.length === 0) {
        return true; // No plan ahead — device can run freely
    }
    let buriedAttacks = 0;
    for (const node of plan) {
        const offset = (node?.stepTarget ?? -Infinity) - currentStep;
        if (offset > 0 && offset < span) {
            buriedAttacks++;
        }
    }
    if (span >= 6) {
        return buriedAttacks === 0; // Long devices: only fire when plan is clear
    }
    return buriedAttacks <= 1; // Medium devices: act like one-attack expansion
}

/**
 * Utility to generate a device buffer and compute busy steps.
 */
function applyDeviceBuffer(deviceType: string, contextOptions: any): DeviceBufferResult | null {
    const deviceBuffer = generateMelodicDevice(deviceType, contextOptions);
    if (deviceBuffer && deviceBuffer.length > 0) {
        const first: any = deviceBuffer[0];
        const busySteps =
            (Array.isArray(first) ? first[0].durationSteps : first.durationSteps || 1) - 1;
        return { buffer: deviceBuffer.slice(1), first, busySteps };
    }
    return null;
}

const CANDIDATE_WEIGHTS = new Float32Array(128);

// Stylistic interval arrays (hoisted to module scope to avoid re-allocation on every function call)
const srvIntervals = new Set([0, 3, 5, 6, 7, 10]);
const gilmourIntervals = new Set([0, 7]);
const slashIntervals = new Set([4, 9]);
const alteredHookIntervals = new Set([1, 3, 6, 8]);

// Coarse chord-quality bucket used to gate per-quality legal-extension sets.
// why: the Greats interval sets (`evansIntervals` historically, plus the
// per-quality variants below) are *legal upper-structure colors* — they are
// chord-quality-dependent. The bug fixed in Epic 12 S2: the flat
// `evansIntervals = {2, 5, 6, 9}` set treated interval 6 as a universal Evans
// color, but `6` is the b5 *avoid note* on minor 7th chords (Db over Dm7).
// Per-quality buckets let each profile express its real harmonic vocabulary
// instead of leaking a tritone into ~25% of Evans extensions on min7
// passages (the audit report's "sour b5 color" in Evans-style min7 lines).
//
// Buckets are coarse on purpose — we only need to distinguish the qualities
// whose legal extension vocabularies actually diverge in this code. An
// undefined/empty quality string falls back to 'maj'; a non-empty but
// unrecognized quality falls through to 'dom' (the dominant bucket is the
// most numerically-named family and the most likely match for an unknown
// numeric suffix like '15'). The two fallbacks currently share the same
// Evans/Miles extension sets, so behavior is identical today — split the
// comments if that ever changes.
type ChordQualityClass =
    | 'maj' // major triad, maj7/maj9/maj11/maj13/maj7#11, 6, add9
    | 'min' // m7/m9/m11/m13 and plain minor triad — m7's 6 is b5 (avoid)
    | 'min6' // m6 chord — dorian context, 6 = M6 is the chord tone itself
    | 'dom' // 7, 9, 11, 13 — full dominant extension vocabulary legal
    | 'alt' // 7alt, 7b9, 7#9, 7b13 — altered scale; route via alteredHookIntervals
    | 'halfdim' // halfdim / m7b5 — locrian; 6 = b5 is a chord tone, not an extension
    | 'dim' // dim, dim7 — symmetric, no traditional upper-structure
    | 'sus' // sus2, sus4 — no 3rd, looser palette
    | 'aug'; // aug, augmaj7 — whole-tone / lydian-aug, no perfect 5

function classifyChordQuality(quality: string | undefined): ChordQualityClass {
    if (!quality) {
        return 'maj';
    }
    // why: lowercase-normalize so capital-M strings ('Major', 'Minor') don't
    // fall through to the 'dom' fallback and silently re-introduce the
    // b5-on-m7 bug Epic 12 S2 fixed. Production qualities are all lowercase
    // today, but a future test fixture or chord-source emitting capital-M
    // would defeat the per-quality table. FOLLOWUPS §F (Epic 12 S2 review).
    const q = quality.toLowerCase();
    if (q === '7alt' || q === '7b9' || q === '7#9' || q === '7b13') {
        return 'alt';
    }
    if (q === 'halfdim') {
        return 'halfdim';
    }
    if (q === 'dim' || q === 'dim7' || q === 'diminished') {
        return 'dim';
    }
    if (q === 'sus2' || q === 'sus4') {
        return 'sus';
    }
    if (q === 'aug' || q === 'augmaj7' || q === 'augmented') {
        return 'aug';
    }
    if (q === 'm6') {
        return 'min6';
    }
    // Minor family: 'minor', 'm', 'm7', 'm9', 'm11', 'm13'. Mirrors the
    // theory-scales.ts isMinorQuality predicate: starts with 'm' but NOT 'maj'.
    if (q.startsWith('m') && !q.startsWith('maj')) {
        return 'min';
    }
    if (q.startsWith('maj') || q === 'major' || q === '6' || q === 'add9') {
        return 'maj';
    }
    // Numeric dominant: '7', '9', '11', '13', '7#11'. Default for unrecognized
    // numeric-suffix qualities (treat like a dominant extension chord).
    return 'dom';
}

// --- Per-quality Greats interval sets ---
//
// Each profile keeps its musical character (Evans = upper extensions,
// Miles = modal extensions) but the *specific* intervals rewarded vary
// by chord quality. Sources: standard jazz pedagogy on chord/scale
// relationships + transcription evidence cited in audit FOLLOWUPS §E.

// Evans: 9 (interval 2), 11 (interval 5), #11/13 (interval 6/9 depending on chord).
//   maj-family: 9, 11 (suspended color), #11 (lydian color), 13 — all legal.
//     why interval 6 included: over maj7 the #11 is the canonical lydian color
//     Evans is famous for (Cmaj7 over F, the "So What" voicing's brother).
//   min-family (m7/m9/m11/m13): 9 (legal), 11 (legal), 13 (dorian — favored
//     by Evans on m7 per soloist-config style routing), but NOT 6 (the b5
//     avoid note — the Db over Dm7 collision the audit flagged).
//   min6: 9, 11 — 13 is the chord root's M6 (chord tone), no extension reward
//     needed; 6 (b5) still wrong.
//   dom7: 9, 11 (as sus 4 color), 13, #11 — full upper-structure palette.
//   alt: empty — altered dominants route through `alteredHookIntervals`
//     elsewhere; mixing the diatonic Evans set in would pull toward unaltered
//     9/13 against the chord's stated b9/#9/b13/#11 tensions.
//   halfdim: empty — locrian doesn't admit natural 9 (b9 over m7b5) or
//     natural 13 (b13). The only in-scale Evans extension is the 11
//     (interval 5), and rewarding it alone is noise relative to the chord-
//     tone pull on the four locrian guide tones; intentionally suppress.
//   dim: empty — symmetric diminished is built from the chord tones plus
//     diminished-scale neighbors; there's no traditional upper-structure
//     vocabulary to reward.
//   sus/aug: empty — non-tertian; let the picker's diatonic logic drive.
const EVANS_INTERVALS_BY_QUALITY: Record<ChordQualityClass, ReadonlySet<number>> = {
    maj: new Set([2, 5, 6, 9]),
    min: new Set([2, 5, 9]), // why: drop 6 — b5 avoid note on m7 (Epic 12 S2 fix)
    min6: new Set([2, 5]), // why: drop 6 (avoid) and 9 (chord tone overlap on m6)
    dom: new Set([2, 5, 6, 9]),
    alt: new Set<number>(), // why: alteredHookIntervals handles this surface
    halfdim: new Set<number>(),
    dim: new Set<number>(),
    sus: new Set<number>(),
    aug: new Set<number>(),
};

// Miles: 9 (interval 2), 11 (interval 5), 13 (interval 9). All three are
// legal on the modal vocabulary Miles actually used (Kind of Blue dorian
// vamps, So What, etc.). The flat set was already quality-safe — no
// interval 6 — but we lift it into the same per-quality shape so the
// engine has one consistent surface for "profile extension lookup", and
// so future audit findings on Miles (or new profiles) have a clean place
// to land per-quality nuance.
const MILES_INTERVALS_BY_QUALITY: Record<ChordQualityClass, ReadonlySet<number>> = {
    maj: new Set([2, 5, 9]),
    min: new Set([2, 5, 9]),
    min6: new Set([2, 5]), // why: 9 = M6 = chord tone on m6, no extension lift needed
    dom: new Set([2, 5, 9]),
    alt: new Set<number>(), // why: alteredHookIntervals owns the altered surface
    halfdim: new Set<number>(),
    dim: new Set<number>(),
    sus: new Set([2, 5, 9]),
    aug: new Set<number>(),
};

// Base rarity penalty for chromatic neighbors of chord tones. Scaled by
// per-style config.chromaticism so high-chromaticism profiles (bird 0.9,
// coltrane 0.7, jazz 0.5, bossa 0.5, neo 0.6) admit neighbors freely while
// the admission path is gated off entirely below 0.3 (see
// chromaticNeighborsActive). Final tuning lives downstream — this is the
// per-attack base penalty before the resolution kicker fires; the kicker
// (`weight *= 12.0` when last attack was a chromatic neighbor) is what
// produces the bebop "approach → chord-tone landing" pair shape. Test
// ratchet for the bias delta lives in soloist-jazz-critique.test.ts ("Bird
// produces more chromatic-neighbor attacks than a low-chromaticism baseline"
// and the post-neighbor resolution-uplift assertion). See Epic 4 / S1 in
// docs/audit/epic-soloist-idiom.md.
const CHROMATIC_NEIGHBOR_BASE_PENALTY = 0.5;

function pushUniqueDevice(devices: string[], device: string | null | undefined): void {
    if (device && !devices.includes(device)) {
        devices.push(device);
    }
}

/**
 * Pick one item from a rank-ordered (best-first) list, weighted by rank.
 *
 * why: the device candidate list (`fittedAllowed` in `selectPitchAndDevices`)
 * is ordered best-first — motif priorities, then the profile-prioritized
 * `allowed` list. A uniform draw threw that ranking away and let the lowest-
 * ranked fallback fire as often as the idiomatic top pick. Linear rank
 * weighting gives rank 0 weight N, rank 1 weight N-1, … the last weight 1, so
 * the top device is N× as likely as the worst while every candidate keeps a
 * non-zero chance (variety is preserved — this is a bias, not a hard sort).
 *
 * Exported so the device-selection critique test can measure the distribution
 * deterministically with an injected RNG.
 */
export function pickByRank<T>(ranked: T[], random: () => number = Math.random): T | null {
    if (ranked.length === 0) {
        return null;
    }
    if (ranked.length === 1) {
        return ranked[0];
    }
    const n = ranked.length;
    const totalWeight = (n * (n + 1)) / 2; // sum of N..1
    let roll = random() * totalWeight;
    for (let i = 0; i < n; i++) {
        const weight = n - i; // rank 0 → N (heaviest), last → 1
        if (roll < weight) {
            return ranked[i];
        }
        roll -= weight;
    }
    return ranked[0]; // float-epsilon guard
}

export interface MotifDevicePrioritiesOptions {
    activeStyle: string;
    responseMode: string;
    responseSource: string;
    responseDirection: number;
    responseSignature: any;
    isResponseEntryTarget: boolean;
    isResponseCadenceTarget: boolean;
    intensity: number;
    isLineStyle: boolean;
    supportRole: string;
    seedNote: any;
}

/**
 * Bias later-loop devices toward phrase commentary instead of generic flourish.
 */
function buildMotifDevicePriorities(options: MotifDevicePrioritiesOptions): string[] {
    const {
        activeStyle,
        responseMode,
        responseSource,
        responseDirection,
        responseSignature,
        isResponseEntryTarget,
        isResponseCadenceTarget,
        intensity,
        isLineStyle,
        supportRole,
        seedNote,
    } = options;
    const priorities: string[] = [];
    if (activeStyle === 'rock' || activeStyle === 'shred') {
        return priorities;
    }
    const isLongArcRecall = responseSource === 'section' || responseSource === 'form';
    const hasTripletCarry = Boolean(responseSignature?.tripletCarry || seedNote?.tripletPlacement);
    const isCadenceComment = isResponseCadenceTarget || supportRole === 'cadence';
    const isEntryComment = isResponseEntryTarget || supportRole === 'anchor';

    if (isCadenceComment) {
        if (activeStyle === 'blues') {
            pushUniqueDevice(priorities, 'bluesCurl');
            pushUniqueDevice(priorities, 'slide');
        } else if (activeStyle === 'neo') {
            pushUniqueDevice(priorities, 'quartal');
            pushUniqueDevice(priorities, 'graceNote');
        } else if (activeStyle === 'bossa') {
            pushUniqueDevice(priorities, 'enclosure');
            pushUniqueDevice(priorities, 'slide');
        } else if (activeStyle === 'rock' || activeStyle === 'scalar') {
            pushUniqueDevice(priorities, 'slide');
            pushUniqueDevice(priorities, 'graceNote');
        } else {
            pushUniqueDevice(priorities, 'enclosure');
            pushUniqueDevice(priorities, 'chromaticEnclosure');
        }
    }

    if (hasTripletCarry && isLineStyle) {
        pushUniqueDevice(priorities, 'enclosure');
        pushUniqueDevice(priorities, 'run');
        if (activeStyle === 'jazz') {
            pushUniqueDevice(priorities, 'bebopScale');
        }
    }

    if (isEntryComment && !isCadenceComment) {
        if (activeStyle === 'neo') {
            pushUniqueDevice(priorities, 'graceNote');
            pushUniqueDevice(priorities, 'quartal');
        } else if (isLineStyle) {
            pushUniqueDevice(priorities, 'graceNote');
            pushUniqueDevice(priorities, 'enclosure');
        } else {
            pushUniqueDevice(priorities, 'graceNote');
            pushUniqueDevice(priorities, 'slide');
        }
    }

    if (responseMode === 'development' && !isCadenceComment) {
        if (isLineStyle) {
            pushUniqueDevice(priorities, 'run');
        }
        if (activeStyle === 'neo') {
            pushUniqueDevice(priorities, 'quartal');
        }
        if (activeStyle === 'blues') {
            pushUniqueDevice(priorities, 'slide');
        }
        if (
            activeStyle === 'bird' &&
            intensity > 0.82 &&
            !isLongArcRecall &&
            responseDirection !== 0
        ) {
            pushUniqueDevice(priorities, 'birdFlurry');
        }
    }

    if (responseDirection < 0 && isLineStyle) {
        pushUniqueDevice(priorities, 'chromaticFall');
    }

    return priorities;
}

/**
 * Primary entry point for pitch selection.
 */
export function selectPitchAndDevices(
    state: EnsembleState,
    step: number,
    rhythmNode: any,
    currentChord: any,
    nextChord: any,
    activeStyle: string,
    intensity: number,
    stepInChord: number,
    coordination: any,
    playback: GlobalContext,
    // soloistState is the SoloistState slice, but kept `any` here: the picker
    // performs `@worker-mutation` writes to `readonly` fields (audio.lastMidiPlayed,
    // session.currentPhrase.context.*) that the immutable interface would reject.
    // The test-relevant shape — an optional top-level `srdcState` override — is
    // declared on `SoloistState` in types.ts (`@test-only`) for documentation.
    soloistState: any,
    groove: any,
    _arranger: any,
    stepsPerMeasure: number,
    stepsPerBeat: number,
    intent: SoloistIntent | null = null,
): any {
    if (!currentChord) {
        return null;
    }

    const styleConfigAny: any = STYLE_CONFIG;
    const config = { ...(styleConfigAny[activeStyle] || STYLE_CONFIG.scalar) };
    const registerProfile = getSoloistRegisterProfile(activeStyle);

    // Musical Intent Scaling:
    // Scale stylistic flourishes based on the performance intent (Conservative vs. Exploratory)
    if (intent) {
        config.deviceProb = (config.deviceProb || 0.1) * intent.embellishmentProb;
        config.doubleStopProb = (config.doubleStopProb || 0.1) * (0.5 + intensity * 0.5);
    }

    // Derived from the Rhythm Engine node
    const { velocity, durationSteps, isStrongBeat, vibrato } = rhythmNode;
    const isHeadBypass = Boolean(rhythmNode.isHeadBypass);
    const targetMidi = Number.isFinite(rhythmNode.targetMidi)
        ? Math.round(rhythmNode.targetMidi)
        : null;
    const seedNote = rhythmNode.seedNote || null;
    const sessionSeed = soloistState.session.seed;
    const loopCount = playback.currentLoopCount || 0;

    // why: per-call deterministic seed base (Epic 12 S1). Every `Math.random()`
    // in the picker is migrated onto `scrambleHash(pickerSeedBase + N)`.
    // Keyed on (step, section, loop): `coordination.sectionStart` uniquely
    // identifies the section (each section has a distinct start step) so two
    // sections never share a draw stream; `step` distinguishes grid positions;
    // `loopCount` keeps successive choruses distinct. mulberry32 avalanche
    // (inside `scrambleHash`) means adjacent seeds never sawtooth. No new
    // worker-synced state — all three values are already passed in.
    const pickerSeedBase =
        (step * 2749 + (coordination?.sectionStart | 0 || 0) * 17 + loopCount * 5471) | 0;
    const soloistMode = resolveSoloistMode(soloistState.mode);
    const isGuitarMode = isSoloistGuitarMode(soloistMode);
    const isMonophonicMode = isSoloistMonophonicMode(soloistMode);
    const supportRole =
        seedNote?.supportHints?.role ||
        (rhythmNode.responseCadenceTarget
            ? 'cadence'
            : rhythmNode.responseEntryTarget
              ? 'anchor'
              : durationSteps >= stepsPerBeat * 2
                ? 'sustain'
                : isStrongBeat
                  ? 'accent'
                  : 'line');
    const sustainBias =
        seedNote?.supportHints?.sustainBias ??
        (supportRole === 'accent'
            ? 0.65
            : supportRole === 'sustain'
              ? 0.88
              : supportRole === 'anchor' || supportRole === 'cadence'
                ? 1.0
                : 0.4);

    let targetChord = currentChord;

    // Anticipation (Lookahead)
    const isLateInChord = stepInChord >= currentChord.beats * stepsPerBeat - 2;
    // why: discriminator 1 — chord-anticipation lookahead gate.
    if (
        nextChord &&
        isLateInChord &&
        scrambleHash(pickerSeedBase + 1) < (config.anticipationProb || 0)
    ) {
        targetChord = nextChord;
    }

    const minMidi = registerProfile.liveFloor;
    const maxMidi = registerProfile.liveCeiling;
    const lastMidi = soloistState.audio.lastMidiPlayed || 72;

    // Determine context
    const remainingSteps = coordination.sectionEnd - step;
    const isFinalMeasure = remainingSteps <= stepsPerMeasure && remainingSteps > 0;
    const isSectionDownbeat =
        step === coordination.sectionStart &&
        soloistState.session.phrasing.transitionState === 'lead_in';
    const isBeatStart = isStrongBeat;
    const isProtectedSeedTone = Boolean(
        seedNote?.isAnchor ||
            isStrongBeat ||
            durationSteps >= stepsPerBeat ||
            (seedNote?.durationSteps || 0) >= stepsPerBeat,
    );
    const headMeasureHasTripletSeed = Boolean(
        isHeadBypass &&
            loopCount === 0 &&
            sessionSeed?.notes?.some((note: any) => {
                if (!note.tripletPlacement || sessionSeed.loopLengthSteps <= 0) {
                    return false;
                }
                const stepInLoop =
                    ((step % sessionSeed.loopLengthSteps) + sessionSeed.loopLengthSteps) %
                    sessionSeed.loopLengthSteps;
                const measureStart = stepInLoop - (stepInLoop % stepsPerMeasure);
                const noteStep =
                    ((note.step % sessionSeed.loopLengthSteps) + sessionSeed.loopLengthSteps) %
                    sessionSeed.loopLengthSteps;
                return noteStep >= measureStart && noteStep < measureStart + stepsPerMeasure;
            }),
    );

    // Helper to finalize note (formerly inline in getSoloistNote)
    // why: Epic 10 S2 (c)+(e) — surface a small amount of provenance ONLY
    // when the soloist debug flag is on, so critique tests can isolate the
    // exact engine path being guarded without bloating the production note
    // schema. `source` distinguishes a picker-emitted attack from a
    // device-emitted one (S2.c chromatism metric); `isPhraseEnd` echoes the
    // rhythm engine's phrase-boundary mark so the Evans-cadence test can
    // filter to phrase-end attacks (S2.e). Both are stripped in production
    // (debugSoloist is false on real sessions).
    const testModeInstrumentation = playback.debugSoloist === true;
    const finalizeNote = (res: any, source: 'picker' | 'device'): any => {
        if (!res) {
            return null;
        }
        const primary = Array.isArray(res) ? res[res.length - 1] : res;

        if (testModeInstrumentation) {
            primary.source = source;
            primary.isPhraseEnd = rhythmNode?.isPhraseEnd === true;
            // isHeadBypass distinguishes a seed-tone attack routed through the
            // head-bypass path (selectedMidi = jittered targetMidi) from a
            // generative-picker attack at the same step (the seed note was
            // gated and the engine fell through). The S2.a jitter-determinism
            // test needs that distinction; a gated-then-generative attack is
            // legitimately RNG-driven and not a jitter probe.
            primary.isHeadBypass = isHeadBypass;
        }

        soloistState.audio.lastMidiPlayed = primary.midi; // @worker-mutation

        // Store interval for call & response tracking
        if (activeStyle === 'blues' && soloistState.session.currentPhrase.context) {
            soloistState.session.currentPhrase.context.lastInterval =
                ((primary.midi % 12) - (currentChord.rootMidi % 12) + 12) % 12; // @worker-mutation
        }

        let timingOffset = isHeadBypass
            ? seedNote?.timingOffset || 0
            : rhythmNode.timingOffset || 0;
        // why: discriminator 13 — seeded jitter source for the shared
        // pocket-timing util so the soloist's micro-timing is deterministic.
        timingOffset += calculateTimingOffset('soloist', groove.pocket, intensity, () =>
            scrambleHash(pickerSeedBase + 13),
        );

        // --- Greats Profiles: Timing ---
        if (activeStyle === 'blues' && soloistState.session.currentPhrase.context?.profile) {
            const profile = soloistState.session.currentPhrase.context.profile;
            if (profile === 'armstrong' && isBeatStart) {
                timingOffset += 0.015; // Louis drags behind the beat
            }
            // why: discriminators 2/3 — Monk's behind-the-beat displacement
            // (2 gates whether it fires, 3 sets the ±offset magnitude).
            if (profile === 'monk' && scrambleHash(pickerSeedBase + 2) < 0.3) {
                timingOffset += (scrambleHash(pickerSeedBase + 3) - 0.5) * 0.025; // Monk displacement
            }
        }

        // 1. Genre Gravity
        timingOffset += config.genreGravityOffset || 0;

        // 2. Rhythmic Rolling (Syncopation Lag)
        const stepInBeat = step % stepsPerBeat;
        const isSyncopated = stepInBeat % (stepsPerBeat / 2) !== 0;
        if (isSyncopated) {
            timingOffset += 0.007; // 7ms lag for 'e' and 'a'
        }

        // Ghost notes drag slightly more
        if (primary.velocity < 0.7) {
            timingOffset += 0.005; // 5ms drag
        }

        // 3. Style-Specific Jitter & Intensity-Driven Tightness
        if (config.timingJitter !== undefined) {
            const tightness = intensity;
            const jitterScale = 1.0 - tightness;
            const jitterMs = config.timingJitter * jitterScale;
            // why: discriminator 4 — style-specific micro-timing jitter.
            timingOffset += (scrambleHash(pickerSeedBase + 4) - 0.5) * (jitterMs / 1000);
        }

        primary.timingOffset = (primary.timingOffset || 0) + timingOffset;
        const carriedTripletPlacement = isHeadBypass
            ? seedNote?.tripletPlacement
            : rhythmNode.tripletPlacement;
        if (carriedTripletPlacement && !primary.tripletPlacement) {
            primary.tripletPlacement = carriedTripletPlacement;
        }

        if (!primary.isDoubleStop) {
            soloistState.audio.lastFreq = getFrequency(primary.midi); // @worker-mutation
        }

        // why: discriminator 14 — seeded source for the blues bend direction.
        applyBluesBends(primary, activeStyle, currentChord, () =>
            scrambleHash(pickerSeedBase + 14),
        );

        return res;
    };

    // Harmonic Anticipation for final measures
    if (
        isFinalMeasure &&
        soloistState.session.phrasing.transitionState === 'lead_in' &&
        remainingSteps <= 2 &&
        coordination.stepCoordination?.upcomingSectionFirstChord
    ) {
        targetChord = coordination.stepCoordination.upcomingSectionFirstChord;
    }

    // --- Pitch Selection ---
    CANDIDATE_WEIGHTS.fill(0);

    const scaleIntervals = getScaleForChord(state, targetChord, null, activeStyle);
    let scaleMask = 0;
    for (let i = 0; i < scaleIntervals.length; i++) {
        scaleMask |= 1 << scaleIntervals[i];
    }
    const rootMidi = targetChord.rootMidi;
    let totalWeight = 0;

    const loopLift = Math.min(playback.currentLoopCount || 0, 3) * registerProfile.liveLoopLift;
    const dynamicCenter = registerProfile.liveCenter + intensity * 8 + loopLift;
    const searchMin = Math.max(minMidi, lastMidi - 14);
    const searchMax = Math.min(maxMidi, lastMidi + 14);

    // Optimization: Pre-compute stylistic boolean checks and common tone arrays to avoid allocating inside the hot loop
    const isBluesOrJazz = activeStyle === 'blues' || activeStyle === 'jazz';
    // #564: funk shares the b3/b5 blue-note grit over dominants (and the existing
    // b7 color), but uses the b3 as a passing GRACE into the major 3, not a
    // sustained landing tone. So funk is admitted to blue-note recognition here,
    // then given a tempered reward below (the base color bonus, but NOT the blues
    // +500 b3-landing fixation — that would over-sit on the b3, the opposite of
    // funk). Recognition also (intentionally) excludes funk's blue notes from the
    // bebop chromatic-neighbor resolution lane (via `!lastWasBlueNote` at the
    // `lastWasChromaticNeighbor` calc below), so a funk b3 resolves by grace, not
    // by the ×12 Parker chord-tone snap — the musically-correct behavior for funk.
    const isFunk = activeStyle === 'funk';
    const recognizesBlueNotes = isBluesOrJazz || isFunk;
    const isGreatsProfileEnabled =
        activeStyle === 'blues' ||
        activeStyle === 'jazz' ||
        activeStyle === 'rock' ||
        activeStyle === 'scalar';
    const isDissonantStyle =
        activeStyle === 'jazz' || activeStyle === 'bird' || activeStyle === 'blues';
    const isJazzGuitarStyle =
        activeStyle === 'jazz' || activeStyle === 'bird' || activeStyle === 'bossa';
    const isGrooveGuitarStyle =
        activeStyle === 'funk' || activeStyle === 'reggae' || activeStyle === 'ska';
    const isHighEnergyGuitarStyle =
        activeStyle === 'metal' || activeStyle === 'shred' || activeStyle === 'scalar';
    const stationaryScale = intent?.stationaryScale ?? 0.5;
    const prefersStationaryHook = stationaryScale > 0.7;
    const isJazzHookStyle = activeStyle === 'jazz' || activeStyle === 'bird';
    // why: ALTERED_HOOK_QUALITIES = {7alt, 7b9, 7#9, 7b13} share guide-tone emphasis
    //   plus b9/#9/b13 reward — the alt-scale tensions. 7#11 (lydian dominant) is
    //   excluded: its scale source is root, 3, #11, 5, 6, b7, so rewarding b9/#9/b13
    //   on 7#11 pulls the soloist to foreign tones against bright/colorful intent.
    //   Narrowing to just 7alt/7#9 (the original code) left charts spelled G7b9 or
    //   G7b13 falling through; broadening to 7#11 over-reaches. Source: Epic 9 S3
    //   P1 finding (FOLLOWUPS §C).
    const isAlteredHookQuality = ALTERED_HOOK_QUALITIES.has(targetChord.quality ?? '');
    // Coarse quality bucket for the per-quality Greats interval lookup tables
    // (EVANS_INTERVALS_BY_QUALITY, MILES_INTERVALS_BY_QUALITY). Hoisted once
    // per call so the picker's hot inner loop just does a Set.has() — see the
    // ChordQualityClass type for what each bucket represents.
    const chordQualityClass = classifyChordQuality(targetChord.quality);
    const evansLegalIntervals = EVANS_INTERVALS_BY_QUALITY[chordQualityClass];
    const milesLegalIntervals = MILES_INTERVALS_BY_QUALITY[chordQualityClass];
    const responseConfig = config.motivicResponse || null;
    const hasDynamicHeadSeed = Boolean(sessionSeed?.notes?.length);
    const responseSignature = soloistState.session.currentPhrase.context?.responseSignature || null;
    const responseMode =
        rhythmNode.responseMode ||
        soloistState.session.currentPhrase.context?.responseMode ||
        (isHeadBypass && loopCount > 0 ? (loopCount === 1 ? 'paraphrase' : 'development') : 'free');
    const responseSource =
        rhythmNode.responseSource ||
        soloistState.session.currentPhrase.context?.responseSource ||
        'free';
    const responsePitchClass = Number.isInteger(rhythmNode.responsePitchClass)
        ? rhythmNode.responsePitchClass
        : null;
    const responseDirection = Number.isFinite(rhythmNode.responseDirection)
        ? rhythmNode.responseDirection
        : 0;
    const isResponseEntryTarget = Boolean(rhythmNode.responseEntryTarget);
    const isResponseCadenceTarget = Boolean(rhythmNode.responseCadenceTarget);
    const isMotivicHeadBypass = Boolean(
        hasDynamicHeadSeed &&
            responseConfig?.enabled &&
            isHeadBypass &&
            loopCount > 0 &&
            (responsePitchClass !== null || isResponseEntryTarget || isResponseCadenceTarget),
    );
    const isResponseGuided = Boolean(
        hasDynamicHeadSeed &&
            responseConfig?.enabled &&
            (responsePitchClass !== null || isResponseEntryTarget || isResponseCadenceTarget) &&
            ((soloistState.session.currentPhrase.context?.role === 'response' &&
                responseSignature?.notes?.length) ||
                isMotivicHeadBypass),
    );
    const isRecallSource = responseSource === 'section' || responseSource === 'form';

    // --- SRDC Restatement motif-echo (Epic 11 S4) ---
    // A Restatement phrase echoes the Statement's contour with *looser
    // landings* — "yeah, I meant that." The rhythm engine
    // (buildRestatementEchoPlan) tags each echo node with `responseSource:
    // 'recent'` plus the Statement note's `responsePitchClass` /
    // `responseDirection`. We honor that contour here via a DEDICATED branch,
    // NOT through `isResponseGuided`: that gate is `responseConfig.enabled`-
    // gated and call/response-specific, but SRDC echo is a structural,
    // genre-independent behavior (reviewer-confirmed). The predicate keys
    // purely on the rhythm node's `responseSource === 'recent'` flag the
    // Restatement plan stamps, so it never fires for a genuine call/response
    // node (those use 'section'/'form'/'free').
    const isRestatementEcho =
        responseSource === 'recent' &&
        soloistState.session.currentPhrase.context?.srdcState === 'restatement' &&
        (responsePitchClass !== null || Number.isFinite(rhythmNode.responseDirection));

    const hasGreatsProfile =
        isGreatsProfileEnabled && soloistState.session.currentPhrase.context?.profile;
    const isCallResponse =
        isGreatsProfileEnabled && soloistState.session.currentPhrase.context?.role === 'response';
    const _isFunkOrSka = activeStyle === 'funk' || activeStyle === 'ska';

    // SRDC phase multiplier on chord-tone weight. Lets the soloist resolve
    // harder during Conclusion and explore further during Departure, while
    // Statement / Restatement keep the baseline behavior. Production wiring
    // writes phase into phrase.context.srdcState (see deriveSrdcPhase in
    // soloist.ts); tests can also drop a top-level `srdcState` on the mock
    // soloist to drive this code path. Closes Open finding #1 in
    // docs/archive/MUSICAL_AUDIT.md (the pitch engine previously had no phase
    // awareness — Conclusion and Departure got identical chord-tone pull).
    // Top-level srdcState wins over the nested phrase-context srdcState so
    // tests can drop an explicit phase on the mock soloist without the
    // production derivation overwriting it. Production code only writes
    // the nested location (via deriveSrdcPhase in soloist.ts).
    const srdcPhase: string = (
        soloistState.srdcState ||
        soloistState.session?.currentPhrase?.context?.srdcState ||
        'statement'
    ).toLowerCase();
    // why restatement === 1.0 (was 1.15): Epic 11 S4 moved the SRDC Restatement
    // distinction OUT of this multiplier and INTO structural motif-echo (the
    // rhythm engine now replays the Statement's attack grid + contour — see
    // buildRestatementEchoPlan in soloist-rhythm-engine.ts). A Restatement is
    // the player echoing the idea with *looser landings* — "yeah, I meant
    // that" — so it must NOT pull chord tones harder than the Statement it
    // echoes. The old ×1.15 nudge both (a) did the musically-wrong thing by
    // tightening landings and (b) was noise-floor — drowned by the chord-tone
    // (+150/+300) and strong-beat anchors. Baseline 1.0 keeps Restatement's
    // landings exactly as loose as Statement's; the echoed contour carries the
    // confirmation, not a chord-tone bias.
    const srdcChordToneMult =
        srdcPhase === 'conclusion' ? 1.5 : srdcPhase === 'departure' ? 0.45 : 1.0;

    // Optimization: Pre-compute chord tones into a bitmask to avoid O(N) .some() checks and closure creation in hot loop
    let chordMask = 0;
    for (let i = 0; i < targetChord.intervals.length; i++) {
        const intv = ((targetChord.intervals[i] % 12) + 12) % 12;
        chordMask |= 1 << intv;
    }

    // Chromatic neighbors of chord tones (interval = chord-tone ±1, but not itself a
    // chord tone). Built once per call. Unlocks bebop approach-note vocabulary that
    // was previously blocked by the `!isScaleTone && !isBlueNote` continue — Bird's
    // chromaticism: 0.9 config knob was dead because chromatic neighbors couldn't
    // enter the candidate pool at all (Epic 4 / S1). The intervals selected here
    // include true chromatic approach tones (e.g. b3-to-3 or b5-to-5 on a maj7)
    // that aren't already scale tones.
    let chromaticNeighborMask = 0;
    for (let i = 0; i < 12; i++) {
        if ((chordMask >> i) & 1) {
            chromaticNeighborMask |= 1 << ((i + 1) % 12);
            chromaticNeighborMask |= 1 << ((i + 11) % 12);
        }
    }
    chromaticNeighborMask &= ~chordMask;

    const styleChromaticism: number = config.chromaticism ?? 0;
    // Gate the chromatic-neighbor admission path at a meaningful chromaticism
    // floor. Below 0.3 (country 0.2, default scalar 0.1) chromatic approach is
    // not part of the style idiom and the picker should stay diatonic. Jazz
    // (0.5), bird (0.9), coltrane (0.7), neo (0.6), and bossa (0.5) clear the
    // floor cleanly. Without this threshold every style trickles chromatic
    // approach tones at a low rate (0.1 × 0.5 base penalty = 0.05 weight), which
    // is a country soloist playing Db on a C chord — a vocabulary mistake.
    const chromaticNeighborsActive = styleChromaticism >= 0.3;

    // Detect a "bebop resolution" condition: the previous attack landed on a
    // chromatic neighbor of the current chord's chord-tone PCs (and wasn't a
    // scale tone or blue note). When true we push the current attack hard
    // toward a chord tone — that's the canonical Charlie Parker "approach
    // tone → chord tone on next attack" gesture. Without this, raising the
    // base chromatic-neighbor admission rate just increases neighbor density
    // without lifting the *pair-rate* metric the critique tracks (more
    // approach notes that don't actually approach anything).
    const lastPC = ((lastMidi % 12) + 12) % 12;
    const lastInterval = (lastPC - (rootMidi % 12) + 12) % 12;
    const lastWasScaleTone = ((scaleMask >> lastInterval) & 1) === 1;
    const lastWasBlueNote =
        recognizesBlueNotes && (lastInterval === 3 || lastInterval === 6 || lastInterval === 10);
    const lastWasChromaticNeighbor =
        chromaticNeighborsActive &&
        !lastWasScaleTone &&
        !lastWasBlueNote &&
        ((chromaticNeighborMask >> lastInterval) & 1) === 1;

    // S6: Pre-compute a bitmask of the style's preferred extension intervals so
    // each candidate only needs a single O(1) bitmask test in the hot loop.
    // why: targetExtensions lists the semitone intervals (relative to chord root)
    // that characterize this style's harmonic color — e.g. jazz [2,6,9,11,13]:
    // 9th (2), tritone (6), 13th (9), maj7 (11). Values > 11 are normalized via
    // % 12 because traditional extension notation uses 9/11/13 (jazz convention)
    // while the picker works with 0-11 intervals. Entries that normalize to the
    // same value (e.g. 2 and 14) are deduplicated by the bitmask automatically.
    let targetExtensionsMask = 0;
    for (const ext of (config.targetExtensions as number[] | undefined) ?? []) {
        targetExtensionsMask |= 1 << (((ext % 12) + 12) % 12);
    }

    for (let m = searchMin; m <= searchMax; m++) {
        const pc = ((m % 12) + 12) % 12;
        const interval = (pc - (rootMidi % 12) + 12) % 12;
        let weight = 1.0;

        const isScaleTone = (scaleMask >> interval) & 1;
        const isChordTone = (chordMask >> interval) & 1;
        let isBlueNote = false;
        if (recognizesBlueNotes && (interval === 3 || interval === 6 || interval === 10)) {
            isBlueNote = true;
        }
        // Chromatic neighbor: ±1 semitone from a chord-tone PC, not already a
        // scale tone or blue note. Gated by config.chromaticism so only styles
        // that opt into chromatic vocabulary (bebop, jazz, fusion) admit them.
        const isChromaticNeighbor =
            !isScaleTone &&
            !isBlueNote &&
            chromaticNeighborsActive &&
            ((chromaticNeighborMask >> interval) & 1) === 1;
        if (!isScaleTone && !isBlueNote && !isChromaticNeighbor) {
            continue;
        }

        const dist = Math.abs(m - lastMidi);
        let repetitionPenalty = 1.0;

        // --- Common Tone Repetition Logic (Additive phase) ---
        if (dist === 0) {
            const isStableTone = isChordTone || interval === 7 || interval === 2;

            if (stationaryScale > 0) {
                // Dissonance Protection check
                if ((interval === 1 || interval === 6) && !isDissonantStyle) {
                    repetitionPenalty = 0.01;
                }

                // Reward common tones with a stronger base
                const boost =
                    (config.commonToneWeight || 200) * stationaryScale * (isStableTone ? 2.0 : 0.5);
                weight += boost;
            }

            const isAlteredHookCenter =
                prefersStationaryHook &&
                isJazzHookStyle &&
                isAlteredHookQuality &&
                !isChordTone &&
                alteredHookIntervals.has(interval) &&
                (isStrongBeat ||
                    supportRole === 'accent' ||
                    supportRole === 'sustain' ||
                    durationSteps >= stepsPerBeat);
            if (isAlteredHookCenter) {
                // Let altered tensions function like a bebop hook center on accented conservative phrases.
                weight += (config.commonToneWeight || 200) * 0.2;
            }
        }

        // --- Greats Stylistic Profiles ---
        if (hasGreatsProfile) {
            const profile = soloistState.session.currentPhrase.context.profile;
            switch (profile) {
                case 'srv':
                    // SRV: High energy, favors pentatonic/blues notes
                    if (srvIntervals.has(interval)) {
                        weight *= 1.2;
                    }
                    break;
                case 'gilmour':
                    // Gilmour: Melodic, Root and 5th stability for singsong leads
                    if (gilmourIntervals.has(interval)) {
                        weight *= 1.4;
                    }
                    break;
                case 'slash':
                    // Slash: Classic rock, targets 3rds and 6ths
                    if (slashIntervals.has(interval)) {
                        weight *= 1.3;
                    }
                    break;
                case 'hendrix':
                    // Hendrix: Double stop focus (handled below) and bluesy 3rds
                    if (interval === 3 || interval === 10) {
                        weight *= 1.4;
                    }
                    break;
                case 'evh': {
                    // EVH: Wide intervals, intense
                    const evhDist = Math.abs(m - lastMidi);
                    if (evhDist > 5) {
                        weight *= 1.5;
                    }
                    break;
                }
                case 'beck':
                    // Jeff Beck: Unpredictable intervals, targets #4/b5 for tension
                    if (interval === 6) {
                        weight *= 1.5;
                    }
                    if (interval === 1) {
                        weight *= 1.3;
                    }
                    break;
                case 'monk':
                    // Monk: Dissonant, targets #4 and b2
                    if (interval === 6) {
                        weight *= 1.5;
                    }
                    if (interval === 1) {
                        weight *= 1.3;
                    }
                    break;
                case 'armstrong':
                    // Armstrong: Classic, Major 3rd and 6th
                    if (interval === 4 || interval === 9) {
                        weight *= 1.4;
                    }
                    break;
                case 'miles':
                    // Miles: Modal, targets extensions (9, 11, 13). Per-quality
                    // lookup (Epic 12 S2): the flat {2,5,9} set was already
                    // quality-safe (no interval 6, the avoid-note offender), so
                    // most buckets are unchanged. The lift to per-quality form
                    // matches Evans's surface so the engine has one consistent
                    // "profile extension lookup" shape, and m6/alt/halfdim/dim/
                    // aug now correctly contribute zero (extension idea doesn't
                    // apply on chord tones / fully-tensioned chord families).
                    if (milesLegalIntervals.has(interval)) {
                        weight *= 1.3;
                    }
                    break;
                case 'bird':
                    // Bird: Bebop, high chromaticism
                    if (!isScaleTone) {
                        weight *= 1.5;
                    }
                    break;
                case 'evans': {
                    // Bill Evans: Upper Extensions (9, 11, #11, 13)
                    // why: hybrid additive-floor + final-stage multiplier. The
                    // previous `weight += 500` additive floor (pre-S2) drowned
                    // every other bias and produced ~80% extension caricature.
                    // A pure ×N final-stage multiplier (S2 first pass) needed
                    // ×80 to survive stacked chord-tone biases and over-tuned
                    // past Evans's transcribed signature into stacked-fourths
                    // late-modal caricature (~55% extension blanket).
                    //
                    // Evans's actual playing per transcription evidence sits at
                    // ~25-35% extension landings, with chord-tones (especially
                    // 3rd/7th guide tones) carrying the line. Tuned via 20-run
                    // reliability loop with stabilized fixture (per-iteration
                    // profile pin + 800-step loop + 512-step section). The
                    // engine has two regimes:
                    //   - +60/×3.5 → stable ~25-30% (extensions win weak beats,
                    //     chord-tones win strong beats — matches transcription)
                    //   - +100/×4 → stable ~50-55% (extensions also win strong
                    //     beats → caricature)
                    // No smooth landing in 30-40% band; the regimes are bimodal
                    // because of how chord-tone stacked additives (+150 chord,
                    // +300 strong-beat) interact with the picker. Selected
                    // +60/×3.5 to stay in the musically defensible band.
                    //
                    // why per-quality (Epic 12 S2): the prior flat
                    // `evansIntervals = {2, 5, 6, 9}` set treated interval 6
                    // as a universal color, but 6 is the b5 *avoid note* on
                    // min7 (Db over Dm7). Per-quality lookup drops 6 on the
                    // 'min' bucket while keeping it on 'maj' (lydian #11) and
                    // 'dom' (13/#11). alt/halfdim/dim/sus/aug buckets are
                    // empty by design — see EVANS_INTERVALS_BY_QUALITY table.
                    //
                    // At phrase-end with role === 'response', skip the extension
                    // boost entirely so the V→I cadence can actually land home
                    // — audit P1 #4's original ask. Without this, the extension
                    // boost on the 9 swamps the cadence pull and Evans response
                    // phrases never resolve home.
                    //
                    // why `isEvansCadence` is skip-only (Epic 12 S2 follow-up,
                    // FOLLOWUPS §F): the audit asked whether the cadence guard
                    // should ALSO boost root/5th rather than just skip the
                    // extension boost. Existing engine code already covers
                    // this: the phrase-end role-aware block ~50 lines below
                    // multiplies root/5th by ×4.0 on response phrases
                    // regardless of profile, and the isCallResponse block adds
                    // ×8.0 on resolution tones. Stacking another Evans-specific
                    // root/5th boost on top would over-tune toward a
                    // caricatured "Evans always lands on root" reading — the
                    // soloist-evans-cadence-critique.test.ts already measures a
                    // 43.9% phrase-end home rate post-fix, which transcription
                    // evidence puts in the right band. Skip-only is enough.
                    const phraseRole = soloistState.session.currentPhrase.context?.role;
                    const isEvansCadence =
                        rhythmNode?.isPhraseEnd === true && phraseRole === 'response';
                    if (evansLegalIntervals.has(interval) && !isEvansCadence) {
                        weight += 60;
                        weight *= 3.5;
                    }
                    if (interval === 0 && rhythmNode?.isPhraseEnd !== true) {
                        // why: Evans avoids the root mid-phrase to keep upper-structure
                        // color front and center, but at phrase ends the 'response'
                        // cadence should be allowed to resolve home (V→I beat-1).
                        // Discouraged-not-forbidden: chord-tone resolution still wins
                        // on strong beats / sustains without freezing root out.
                        weight *= 0.1;
                    }
                    break;
                }
                case 'coltrane': {
                    // Coltrane: Wide intervals, intense
                    const coltraneDist = Math.abs(m - lastMidi);
                    if (coltraneDist > 7) {
                        weight *= 1.5;
                    }
                    break;
                }
            }
        }

        // --- Call & Response: Melodic Resolution ---
        if (isCallResponse) {
            const isResolutionTone = interval === 0 || interval === 7; // Root and 5th
            if (isResolutionTone) {
                weight *= 8.0; // Aggressively favor strong resolution
            }
            if (interval === soloistState.session.currentPhrase.context.lastInterval) {
                weight *= 0.5; // Avoid stagnation
            }
        }

        // --- Phrase-End Resolution Asymmetry (role-aware) ---
        // On the LAST attack of a phrase, role drives where we land:
        //   Response = the answer → land at home (root/5th, any chord tone).
        //   Call     = the question → leave it open (suspended 2/4/6, push
        //              the root away so the listener feels the unfinished arc).
        // Without this, every note in a phrase gets the same chord-tone pull
        // and phrase endings don't actually differentiate role — the gap
        // tracked in docs/archive/MUSICAL_AUDIT.md "Open finding #1." Marks come from
        // soloist-rhythm-engine.ts (isPhraseEnd on the last node of a phrase
        // chunk or pre-breath).
        if (rhythmNode?.isPhraseEnd === true) {
            const phraseRole = soloistState.session.currentPhrase.context?.role;
            if (phraseRole === 'response') {
                // Land at home: bias toward root/5th, then 3rd, then any chord
                // tone. Multiplicative only (no large additive floor) so real
                // soloists still occasionally land on a 7th or 9th for color.
                if (interval === 0 || interval === 7) {
                    weight *= 4.0;
                }
                if (interval === 4 || interval === 3) {
                    weight *= 3;
                }
                if (isChordTone) {
                    weight *= 1.4;
                }
            } else if (phraseRole === 'call') {
                // Leave the question open: push away from chord centers and
                // toward suspended tones. Multipliers chosen so resolution
                // tones can still win occasionally — Call phrases sometimes
                // do land on root, just less often than Response.
                if (interval === 0) {
                    weight *= 0.3;
                }
                if (interval === 4 || interval === 3) {
                    weight *= 0.55;
                }
                if (interval === 7) {
                    weight *= 0.6;
                }
                if (interval === 2 || interval === 5 || interval === 9) {
                    weight *= 3; // 2 / 4 / 6: suspended, "to be continued"
                }
            }
        }

        if (isResponseGuided) {
            const responseReuseScale = responseMode === 'paraphrase' ? 1 : 0.78;
            if (responsePitchClass !== null && pc === responsePitchClass) {
                weight += 160 + (responseConfig.pitchReuse || 0) * 320 * responseReuseScale;
                if (dist <= 5) {
                    weight *= 1.18;
                }
            }
            if (responseSignature?.anchorPitchClasses?.includes(pc)) {
                weight += 80 + (responseConfig.contourReuse || 0) * 120;
            }
            if (isResponseEntryTarget && responseSignature?.entryPitchClass === pc) {
                weight += 140 + (responseConfig.pitchReuse || 0) * 180;
            }
            if (isResponseCadenceTarget && responseSignature?.cadencePitchClass === pc) {
                weight += 180 + (responseConfig.cadenceWeight || 0) * 220;
            }
            if (isResponseCadenceTarget && !(isChordTone || interval === 0 || interval === 7)) {
                weight *= 0.88;
            }
            if (responseDirection !== 0) {
                const motionDirection = Math.sign(m - lastMidi);
                if (motionDirection === responseDirection) {
                    weight *= 1 + (responseConfig.contourReuse || 0) * 0.22;
                } else if (motionDirection !== 0) {
                    weight *= 1 - (responseConfig.contourReuse || 0) * 0.14;
                }
            }
        }

        if (dist <= 2) {
            weight += 100;
        }
        if (dist <= 4) {
            weight += 50;
        }

        if (isChordTone) {
            weight += 150;
        }

        // S6: targetExtensions nudge — additive bonus for style-characteristic
        // color tones (e.g. jazz [2, 6, 9, 11], bird [2, 6, 9]). Convention:
        // entries are semitone intervals 0-11; chord tones (0/4/7) and avoid
        // notes are excluded at config-time (see soloist-config.ts comment).
        // why additive (not final-stage *=): the goal is a small color bias
        // that tips otherwise-equal candidates, not a dominator that overrides
        // chord-tone or strong-beat preference. Realized lift depends on which
        // other bonuses fired — chord-tone candidates can't overlap (those PCs
        // are excluded from the config arrays), so +40 mostly acts on weight=1
        // baseline candidates where it's a meaningful tip without overwhelming
        // the chord-tone (+150) or strong-beat (+300) anchors that command on
        // landing positions. Applied before the SRDC multiplier so Departure's
        // chord-tone suppression doesn't also suppress extension color.
        if ((targetExtensionsMask >> interval) & 1) {
            weight += 40;
        }

        // Prioritize chord tones on strong beats or sustained notes
        if (isStrongBeat || durationSteps >= 4) {
            if (isChordTone) {
                weight += 300;
            }
        } else if (durationSteps <= 2 && !isStrongBeat) {
            // Passing tone on weak beat/short duration
            if (!isChordTone) {
                weight += 100; // boost scale notes that aren't chord tones
            }
        }

        // SRDC phase tilt: applied after all additive chord-tone bonuses so
        // it dominates other simultaneous factors (SRV pentatonic boost,
        // common-tone reward, etc). Conclusion lifts chord tones; Departure
        // depresses them and boosts non-chord scale tones so the soloist
        // actually picks extensions during exploration. Values chosen so
        // Departure stays above the random baseline (real soloists still
        // touch chord tones during a chorus) but clearly trails Conclusion.
        if (isChordTone) {
            weight *= srdcChordToneMult;
        } else if (isScaleTone && srdcPhase === 'departure') {
            weight *= 2.0;
        }
        if (isMonophonicMode) {
            if (supportRole === 'pickup' || supportRole === 'line') {
                if (dist <= 2) {
                    weight *= 1.18;
                } else if (dist > 5) {
                    weight *= 0.72;
                }
            }
            if (
                supportRole === 'anchor' ||
                supportRole === 'cadence' ||
                supportRole === 'sustain'
            ) {
                if (isChordTone) {
                    weight += 180;
                }
                if (dist <= 4) {
                    weight *= 1.14;
                } else if (dist > 7) {
                    weight *= 0.72;
                }
            }
            if (
                (isSectionDownbeat || isFinalMeasure || supportRole === 'cadence') &&
                (isChordTone || interval === 0 || interval === 7)
            ) {
                weight += 120;
            }
        }

        const resolutionChord = isSectionDownbeat
            ? targetChord
            : coordination.stepCoordination?.upcomingSectionFirstChord;
        if (
            (isFinalMeasure || isSectionDownbeat) &&
            (soloistState.session.phrasing.transitionState === 'lead_in' || isSectionDownbeat) &&
            resolutionChord
        ) {
            const upcomingRoot = resolutionChord.rootMidi;
            const upcoming3rd =
                resolutionChord.intervals.length > 1 ? resolutionChord.intervals[1] : 4;
            const upcomingInterval = (pc - (upcomingRoot % 12) + 12) % 12;
            if (upcomingInterval === 0 || upcomingInterval === upcoming3rd % 12) {
                if (isSectionDownbeat) {
                    weight += 500;
                } else {
                    weight += 100 + (stepsPerMeasure - remainingSteps) * 10;
                }
            }
        }

        // why: wide-interval profiles (Coltrane "sheets of sound", EVH tapping
        // leaps) explicitly boost specific leap ranges in the profile switch
        // above. The universal large-leap penalties (×0.4 floor, then ×0.1
        // non-octave) stack multiplicatively and reduce the boost (e.g.
        // Coltrane ×1.5) to ×0.06 net — washing the idiom out entirely. Skip
        // the universal penalties only when the active profile's OWN boost
        // condition matches this leap: Coltrane endorses dist > 7, EVH endorses
        // dist > 5. Don't bypass for Coltrane on 6/7-semitone leaps — those
        // aren't part of his transcribed signature and should still be
        // penalized like normal soloist output. Audit P2 #15.
        const activeProfile = hasGreatsProfile
            ? soloistState.session.currentPhrase.context.profile
            : null;
        const skipLargeLeapPenalty =
            (activeProfile === 'coltrane' && dist > 7) || (activeProfile === 'evh' && dist > 5);
        if (dist > 7 && !skipLargeLeapPenalty) {
            weight *= 0.4;
        }
        // Gently encourage stepwise motion and penalize large leaps
        if (dist <= 2) {
            weight *= 1.5;
        } else if (dist <= 4) {
            weight *= 1.2;
        } else if (dist > 7 && dist !== 12 && !skipLargeLeapPenalty) {
            weight *= 0.1; // Moderate penalty for large leaps (not octaves)
        } else if (dist > 5 && dist !== 12 && !skipLargeLeapPenalty) {
            weight *= 0.5; // Slight penalty for medium leaps
        }

        // FINAL REPETITION ADJUSTMENTS
        if (dist === 0) {
            weight *= repetitionPenalty;
            // If intent is stationary AND it's not a penalized note, apply multiplier
            if (stationaryScale > 0.7 && repetitionPenalty >= 1.0) {
                weight *= 1.5 + stationaryScale;
            }
        }

        const distFromCenter = Math.abs(m - dynamicCenter);
        if (distFromCenter <= 7) {
            weight += 100;
        } else if (distFromCenter <= 14) {
            weight += 40;
        }

        if (m >= 84 && intensity < 0.75) {
            weight *= 0.05;
        } else if (m >= 72 && intensity < 0.35) {
            weight *= 0.2;
        }

        if (isBlueNote) {
            weight += 80;
            // #564: funk takes only the base blue-note color (+80) on the b3 — it
            // uses the b3 as a passing grace into the major 3, so the blues
            // b3-landing fixation below would over-sit on it. The b5/b7 grit still
            // reads through the base bonus. Blues/jazz keep the strong b3 landing.
            if (interval === 3 && !isFunk) {
                // Temper the minor 3rd during responses to allow for clearer resolution to Root/5th
                if (soloistState.session.currentPhrase.context?.role === 'response') {
                    weight += 100;
                } else {
                    weight += 500;
                }
            }
        }

        // --- Dynamic Head: Pitch Weighting (Thematic Consistency) ---
        const seed = soloistState.session.seed;
        if (seed?.notes && seed.notes.length > 0) {
            const { notes, loopLengthSteps } = seed;
            const loopCount = playback.currentLoopCount || 0;
            const stepInLoop = step % loopLengthSteps;
            const seedNote = notes.find((n: any) => n.step === stepInLoop);

            if (seedNote) {
                const pcMatch = m % 12 === seedNote.midi % 12;
                const exactMatch = m === seedNote.midi;

                if (pcMatch) {
                    let seedBoost = 0;
                    if (loopCount === 0) {
                        // Chorus 1: The Head. Direct adherence.
                        seedBoost = exactMatch ? 5000 : 1000;
                    } else if (loopCount === 1) {
                        // Chorus 2: Embellished.
                        seedBoost = exactMatch ? 2000 : 500;
                    } else if (loopCount === 2) {
                        // Chorus 3: Departure.
                        seedBoost = exactMatch ? 800 : 200;
                    } else {
                        // Chorus 4+: Thematic Pull.
                        seedBoost = exactMatch ? 300 : 100;
                    }
                    weight += seedBoost;
                }
            }
        }

        // --- Tension-Chord Alteration Bias (final-stage multiplier) ---
        // why: leaning on b9/#9/#11/b13 over V7alt/V7b9/V7#9/etc. is the single most
        // idiomatic move in jazz soloing. Reading `coordination.stepCoordination.{isTensionChord,
        // altPitchClasses}` published by the chord-preamble in tick-logic.ts (see
        // coordination-engine.ts getAltPitchClasses). Applied as a **final-stage** multiplier
        // (not an additive bonus) per CLAUDE.md "final-stage multipliers win" — the chord-tone
        // bonus, SRDC mult, scale-tone boost, profile bonus, and seed boost all push toward
        // diatonic/chord-tone pitches; an additive bias on altered tones gets washed out.
        // Multiplier value 2.0: an earlier 3.0 stacked with Departure's existing scale-tone
        // ×2 multiplier (line ~756) to push altered-PC selection over 60% — "plays mostly
        // alterations" rather than "leans on alterations." 2.0 produces a healthy ≥15pt shift
        // (measured ~25-30pt) while letting chord-tone resolution still dominate strong beats.
        // Gate on `isTensionChord` so plain V7 / maj7 / m7 are unaffected.
        const stepCoordTension = coordination.stepCoordination;
        if (
            stepCoordTension?.isTensionChord &&
            stepCoordTension.altPitchClasses?.length > 0 &&
            stepCoordTension.altPitchClasses.includes(pc)
        ) {
            weight *= 2.0;
        }

        // --- Bebop Resolution Bias (final-stage multiplier) ---
        // why: when the previous attack landed on a chromatic neighbor of the
        // current chord's chord-tone PCs, push HARD toward a chord-tone landing
        // on THIS attack. That's the canonical bebop "approach tone → chord
        // tone" gesture (Parker, Coltrane sheets of sound). Without it, raising
        // the chromatic-neighbor admission rate floods the engine with approach
        // notes that don't actually approach anything. Applied as a final-stage
        // multiplier per CLAUDE.md "final-stage multipliers win" — chord-tone
        // bonuses already accumulate +150 to +450 additive weight, but a 3× on
        // top is what lifts the *pair-rate* metric the critique enforces.
        if (lastWasChromaticNeighbor && isChordTone) {
            weight *= 12.0;
        }

        // --- SRDC Restatement Contour Echo (final-stage multiplier) ---
        // why: a Restatement should re-trace the Statement's melodic shape so
        // it audibly *confirms* the idea rather than playing a fresh line over
        // the echoed rhythm grid. The rhythm engine (buildRestatementEchoPlan)
        // already replays the attack grid; here we echo the *contour*.
        // Applied as a final-stage `weight *= mult` per CLAUDE.md "final-stage
        // multipliers win" — chord-tone bonus (+150/+300), scale-tone boost,
        // strong-beat anchors, and the dist<=2 ×1.5 all push the pitch line
        // their own way; an additive contour bonus gets washed out (see
        // feedback_weight_tuning_multiplier_placement).
        //
        // "Looser landings" — the directional bias is the load-bearing cue,
        // the exact pitch class is a soft secondary nudge:
        //   • interval-direction match (up/down vs the Statement note): ×3.4.
        //     This is the primary echo signal — re-tracing the shape. It has
        //     to be this strong because it competes with the dist<=2 ×1.5
        //     stepwise pull, chord-tone bonuses (+150/+300 additive), and the
        //     dynamic-center pull, all of which can favor a wrong-direction
        //     candidate; an earlier ×1.6 produced only a ~48% contour match
        //     (still a clear +18pt over baseline, but weak as an echo).
        //   • wrong-direction motion: ×0.45 — strongly discourage, don't
        //     forbid (a real paraphrase still drifts).
        //   • exact pitch-class match: a gentle extra ×1.3 on top. Enough to
        //     tip otherwise-equal candidates toward the literal Statement
        //     pitch, not enough to hard-lock it (a real player paraphrasing
        //     lands *near*, not always *on*, the original note).
        // Net swing between a contour-matching and a contour-fighting
        // candidate is ×3.4 vs ×0.45 ≈ 7.5× — a firm shape bias that still
        // lets chord-tone/strong-beat anchors win individual landings.
        if (isRestatementEcho) {
            if (responseDirection !== 0) {
                const motionDirection = Math.sign(m - lastMidi);
                if (motionDirection === responseDirection) {
                    weight *= 3.4;
                } else if (motionDirection !== 0) {
                    weight *= 0.45;
                }
            }
            if (responsePitchClass !== null && pc === responsePitchClass) {
                weight *= 1.3;
            }
        }

        // --- Chromatic Neighbor Rarity Penalty (final-stage multiplier) ---
        // why: chromatic neighbors are now ADMITTED into the candidate pool (Epic 4
        // / S1) so Bird's `chromaticism: 0.9` and Coltrane's `: 0.7` can actually
        // surface bebop approach-note vocabulary. But chord tones and scale tones
        // still need to dominate — chromatic approach is a SEASONING, not a base
        // diet. Applied as a final-stage multiplier per CLAUDE.md "final-stage
        // multipliers win": the +100 weak-beat-passing-tone bonus at line ~742
        // doesn't check isScaleTone, so without this dampener chromatic neighbors
        // would inherit that boost and rate way above the intended 8% acceptance
        // band. Scaling by styleChromaticism means Bird (0.9) lets neighbors
        // through 18× more freely than a low-chromaticism style (0.05). The
        // multiplier value is tuned against the 30-run loop on
        // soloist-jazz-critique.test.ts targeting ≥8% neighbor→chord-tone
        // resolution on Bird.
        if (isChromaticNeighbor) {
            weight *= CHROMATIC_NEIGHBOR_BASE_PENALTY * styleChromaticism;
        }

        // --- Accompaniment Unison Avoidance (final-stage multiplier) ---
        // why: soloist + chord voice landing on the same pitch-class is a registration
        // smear that muddies jazz comping ("playing the chord with the chord"). The
        // `accompanimentMidis` array is published by the chords producer in
        // coordination-engine.ts updateCoordinationContext('chords') and holds the
        // active chord voicing's MIDIs. Producer order is Soloist → Bass → Chords, so
        // here we see the PREVIOUS tick's voicing — but jazz/funk chord stabs sustain
        // across ticks and a re-comp typically picks adjacent voicings, so it remains
        // a reasonable proxy for "what's currently ringing."
        //
        // Final-stage multiplier per CLAUDE.md "final-stage multipliers win" — applied
        // AFTER chord-tone bonus, SRDC mult, scale-tone boost, profile bonus, and
        // alteration mult. Many competing factors push toward chord-tone PCs; an
        // additive penalty on unison PCs gets washed out (see
        // feedback_weight_tuning_multiplier_placement).
        //
        // Multiplier value 0.05: empirically tuned. The story sketch (0.5) is far too
        // gentle — chord-tone bonus (+150), strong-beat chord-tone boost (+300), and
        // SRDC Conclusion ×1.5 multiplier produce a weight stack typically 5-20× larger
        // on chord-tone PCs than on scale-only PCs, so a 0.5× shave barely moves the
        // realized distribution (measured ~4pt drop). At 0.05× the picker's chord-tone
        // unison rate drops from ~35-40% (Conclusion phase) down to ~10-12% — a strong
        // ~60-70% RELATIVE drop. (The residual is mostly device-system fallthrough:
        // enclosures, runs, and approach notes can land on chord tones AFTER the
        // picker has been biased away; out of scope for this story.)
        //
        // Why not lower (0.01, 0.001)? Below 0.05 the gap is bounded by the device
        // floor (~10pt), so further suppression doesn't help and risks breaking
        // chord-tone landings on strong beats (the +300 strong-beat chord-tone bonus
        // should still produce a chord-tone landing on ~beat 1 sustains; cutting too
        // far below 0.05 would let scale-only PCs dominate even strong beats, which
        // sounds rootless and unsettled).
        //
        // EXEMPTION — phrase-end response resolution: when the rhythm engine flags
        // this as `isPhraseEnd` on a `response` phrase, the soloist is rhetorically
        // ANSWERING the call and the listener expects landing at home (root/5th).
        // The response phrase block above (lines ~660-672) applies `weight *= 4.0`
        // on root/5th and `*= 1.4` on chord tones — but those multipliers execute
        // BEFORE this one in candidate-loop order. So without an exemption, a root
        // landing in the chord's voicing gets `4.0 × 1.4 × 0.05 = 0.28` net while a
        // maj7 (PC 11) outside the voicing gets `1.4 × 1.0 = 1.4` net, inverting
        // the resolution. Skip the penalty on phrase-end response so the answer
        // can come home even when the chord is sustaining a tonic voicing — the
        // unison happens for one tick (the landing), which is the moment cohesion
        // is wanted, not the moment to push away from. Reviewer-flagged P0 in
        // initial S5 patch.
        const accompMidis = stepCoordTension?.accompanimentMidis;
        const isPhraseEndResponse =
            rhythmNode?.isPhraseEnd === true &&
            soloistState.session.currentPhrase.context?.role === 'response';
        if (accompMidis && accompMidis.length > 0 && !isPhraseEndResponse) {
            for (let i = 0; i < accompMidis.length; i++) {
                if (((accompMidis[i] % 12) + 12) % 12 === pc) {
                    weight *= 0.05;
                    break;
                }
            }
        }

        CANDIDATE_WEIGHTS[m] = weight;
        totalWeight += weight;
    }

    let selectedMidi = -1;
    if (isHeadBypass && targetMidi !== null) {
        selectedMidi = targetMidi;
    } else if (totalWeight > 0) {
        // why: discriminator 5 — the core weighted pitch-selection roulette.
        // Deterministic per (step, section, loop) so the chosen pitch replays
        // identically; the weight distribution itself still encodes all the
        // additive musical biases, so chromatism/contour stay statistically
        // unchanged.
        let randomVal = scrambleHash(pickerSeedBase + 5) * totalWeight;
        for (let m = searchMin; m <= searchMax; m++) {
            const w = CANDIDATE_WEIGHTS[m];
            if (w > 0) {
                randomVal -= w;
                if (randomVal <= 0) {
                    selectedMidi = m;
                    break;
                }
            }
        }
    }
    if (selectedMidi === -1) {
        selectedMidi = lastMidi;
    }

    const canUseHeadGuitarSupport =
        isGuitarMode && isHeadBypass && seedNote?.supportHints?.guitar?.allowDoubleStop === true;

    // --- Melodic Devices ---
    let deviceBaseProb = config.deviceProb * (0.5 + intensity);
    const isLaterHeadBypass = isHeadBypass && loopCount > 0;
    const isLineStyle = ['jazz', 'bird', 'bossa'].includes(activeStyle);
    const isResponseGuidedPhrase = isResponseGuided && (!isHeadBypass || loopCount > 0);

    // Progressive Ornamentation: Increase device probability by 20% per loop
    deviceBaseProb *= 1.0 + loopCount * 0.2;
    if (isLineStyle) {
        deviceBaseProb *= isLaterHeadBypass ? 0.54 : 0.66;
    }

    if (loopCount === 0 && sessionSeed && sessionSeed.notes.length > 0) {
        deviceBaseProb *= 0.2; // Clean head
    }
    if (isHeadBypass && loopCount === 0) {
        deviceBaseProb = 0;
    }
    // why: an anchor is the structural skeleton of the head. On the FIRST
    // paraphrase loop (loop 1) the listener is hearing the head restated for
    // the first time with variation — the anchors must land their exact head
    // pitch cleanly so the paraphrase still reads as the same melody. Without
    // this hard kill the anchor still carries deviceBaseProb (deviceProb ×
    // (0.5+intensity) × loop-1.2× × thematicBoost 2.4 × anchor 0.35), so a
    // seeded-gated device can fire on top of the pinned selectedMidi
    // and replace the emitted pitch (observed: anchor MIDI 59 -> 65).
    // Loops 2+ are deliberately NOT killed here: by then the soloist is in
    // exploratory territory where ornamenting around the anchor is musically
    // wanted, and the existing anchor ×0.35 multiplier already holds
    // laterLoopAnchorExactRate at ~80% — clean enough to keep the skeleton
    // legible without freezing the line into a mechanical head repeat.
    if (isHeadBypass && seedNote?.isAnchor && loopCount === 1) {
        deviceBaseProb = 0;
    }
    if (isLaterHeadBypass) {
        const thematicBoost = isLineStyle
            ? loopCount === 1
                ? 1.4
                : 1.7
            : loopCount === 1
              ? 2.4
              : 3.1;
        deviceBaseProb *= thematicBoost;
    }
    if (activeStyle === 'neo' && isLaterHeadBypass && !isResponseGuidedPhrase) {
        deviceBaseProb *= 0.58;
    }
    if (loopCount > 1 && !isHeadBypass) {
        deviceBaseProb *= isLineStyle ? 0.95 + intensity * 0.2 : 1.15 + intensity * 0.35;
    }
    if (seedNote?.isAnchor) {
        deviceBaseProb *= 0.35;
    }
    if (
        (activeStyle === 'rock' || activeStyle === 'shred') &&
        loopCount > 0 &&
        seedNote?.isAnchor
    ) {
        deviceBaseProb = 0;
    }
    if (isResponseGuidedPhrase) {
        const deviceDamp =
            responseMode === 'paraphrase'
                ? responseConfig?.deviceDamp || 0.5
                : Math.min(0.88, (responseConfig?.deviceDamp || 0.5) + 0.14);
        deviceBaseProb *= deviceDamp;
        if (responseSource === 'section') {
            deviceBaseProb *= 1 - Math.min(0.22, (responseConfig?.spaceBias || 0) * 0.4);
        } else if (responseSource === 'form') {
            deviceBaseProb *= 1 - Math.min(0.16, (responseConfig?.spaceBias || 0) * 0.28);
        }
        if (isResponseEntryTarget || isResponseCadenceTarget || responsePitchClass !== null) {
            deviceBaseProb *= 0.68;
        }
    }
    deviceBaseProb = Math.min(loopCount === 0 ? 0.4 : isLineStyle ? 0.58 : 0.85, deviceBaseProb);
    const isPolyphonic =
        allowsSoloistPolyphony(soloistMode) &&
        (soloistState.doubleStopProb ?? 1.0) > 0 &&
        config.doubleStopProb > 0 &&
        (loopCount > 0 ||
            !sessionSeed ||
            sessionSeed.notes.length === 0 ||
            canUseHeadGuitarSupport);

    const deviceContextOptions = {
        state,
        selectedMidi,
        targetChord,
        activeStyle,
        effectiveIntensity: intensity,
        minMidi,
        maxMidi,
        lastMidi,
        playback,
        soloist: soloistState,
        isPolyphonic,
        dynamicCenter: 72,
        scaleMask,
        seedNote,
        supportRole,
        sustainBias,
        responseSignature,
        responseSource,
        responseMode,
        responseDirection,
        responseEntryTarget: isResponseEntryTarget,
        responseCadenceTarget: isResponseCadenceTarget,
        // why: #568 — the device generator's velocity humanization was raw
        // Math.random (loop-incoherent, critique-unreliable). Forward the picker's
        // per-call seed so device velocity reads from the same deterministic
        // `scrambleHash(pickerSeedBase + N)` stream as the rest of the picker.
        // The device uses offsets >=40, clear of the picker's +1..14 draws.
        pickerSeedBase,
        // why: epic-coordination-consistency S5.b — the device generator emits
        // neighbor/approach pitches around `selectedMidi` (enclosure ±1, run
        // ±motifApproach × {1,2}). The picker has already biased selectedMidi
        // away from accompaniment PCs (final-stage 0.05× at :1154), but those
        // device-generated neighbor pitches can themselves land on a unison
        // PC, masking the device gesture against the chord stab. Forward the
        // already-published `accompanimentMidis` so the device picker can
        // reject candidate devices whose generated buffer lands on unison PCs.
        accompanimentMidis: coordination.stepCoordination?.accompanimentMidis,
    };

    // --- Structural Awareness: Turnaround Handling ---
    // why: the blues turnaround device emits its own pitch buffer and fully
    // replaces the picker's emission — it bypasses the deviceBaseProb gate via
    // a separate seeded roll (discriminator 6). On the loop-1 paraphrase a head-bypass
    // anchor is the structural skeleton of the head and must state its exact
    // head pitch (selectedMidi = targetMidi), so suppress the turnaround
    // substitution here for the same reason deviceBaseProb is zeroed above.
    // Loops 2+ keep the turnaround — by then exploratory reharmonization of an
    // anchor over a turnaround chord is musically wanted, not a defect.
    const isLoop1AnchorHeadBypass = isHeadBypass && seedNote?.isAnchor === true && loopCount === 1;
    if (
        activeStyle === 'blues' &&
        (coordination as any).isTurnaround &&
        !headMeasureHasTripletSeed &&
        !isResponseGuidedPhrase &&
        !isLoop1AnchorHeadBypass &&
        // why: discriminator 6 — blues turnaround-device trigger gate.
        scrambleHash(pickerSeedBase + 6) < 0.6
    ) {
        const res = applyDeviceBuffer('bluesTurnaround', deviceContextOptions);
        if (res) {
            soloistState.session.rhythm.embellishmentBuffer = res.buffer; // @worker-mutation
            soloistState.session.phrasing.busySteps = res.busySteps; // @worker-mutation
            return finalizeNote(res.first, 'device');
        }
    }

    const canTriggerDevice =
        isBeatStart ||
        (isLaterHeadBypass &&
            !isProtectedSeedTone &&
            (!isLineStyle || durationSteps >= stepsPerBeat / 2)) ||
        (loopCount > 1 && !isStrongBeat && durationSteps <= stepsPerBeat && !isLineStyle);
    // why: discriminator 7 — the main melodic-device trigger gate.
    if (canTriggerDevice && scrambleHash(pickerSeedBase + 7) < deviceBaseProb) {
        let allowed: string[] = [...(config.allowedDevices || [])];

        if (isLaterHeadBypass && !isProtectedSeedTone) {
            const thematicDevices: string[] = [];
            if (!allowed.includes('graceNote')) {
                thematicDevices.push('graceNote');
            }
            if (
                ['jazz', 'bird', 'bossa', 'funk', 'neo', 'scalar'].includes(activeStyle) &&
                !allowed.includes('enclosure')
            ) {
                thematicDevices.push('enclosure');
            }
            if (intensity > 0.7 && (!isLineStyle || isStrongBeat) && !allowed.includes('run')) {
                thematicDevices.push('run');
            }
            if (
                ['rock', 'blues', 'funk', 'scalar'].includes(activeStyle) &&
                !allowed.includes('slide')
            ) {
                thematicDevices.push('slide');
            }
            allowed = [...thematicDevices, ...allowed];
        }

        if (isLineStyle && !isStrongBeat) {
            allowed = allowed.filter(
                (device) =>
                    device !== 'run' && device !== 'birdFlurry' && device !== 'sheetsOfSound',
            );
        }
        const allowHeavyRecallDevice =
            responseMode === 'development' &&
            intensity > 0.82 &&
            (activeStyle === 'bird' || activeStyle === 'jazz') &&
            !isRecallSource;
        if (isResponseGuidedPhrase && (responseMode === 'paraphrase' || isRecallSource)) {
            allowed = allowed.filter(
                (device) =>
                    allowHeavyRecallDevice ||
                    (device !== 'birdFlurry' && device !== 'sheetsOfSound'),
            );
        }
        if (isResponseGuidedPhrase && (isResponseCadenceTarget || supportRole === 'cadence')) {
            allowed = allowed.filter((device) => device !== 'quartalStack');
        }

        // --- Greats Profiles: Device Priority ---
        if (
            (activeStyle === 'blues' ||
                activeStyle === 'jazz' ||
                activeStyle === 'rock' ||
                activeStyle === 'scalar') &&
            soloistState.session.currentPhrase.context?.profile
        ) {
            const profile = soloistState.session.currentPhrase.context.profile;
            const relativeInterval = (selectedMidi - targetChord.rootMidi + 120) % 12;

            if (
                (profile === 'srv' || profile === 'armstrong' || profile === 'slash') &&
                relativeInterval === 3 &&
                intensity > 0.5
            ) {
                allowed = ['bluesCurl', ...allowed]; // Prioritize the curl
            } else if (profile === 'monk' || profile === 'beck') {
                allowed = ['graceNote', ...allowed]; // Prioritize crushed notes
            } else if (profile === 'gilmour' && (durationSteps as any) >= 4) {
                allowed = ['slide', ...allowed];
            }
        }
        if (isResponseGuidedPhrase || (isLaterHeadBypass && loopCount > 0)) {
            const motifPriorities = buildMotifDevicePriorities({
                activeStyle,
                responseMode,
                responseSource,
                responseDirection,
                responseSignature,
                isResponseEntryTarget,
                isResponseCadenceTarget,
                intensity,
                isLineStyle,
                supportRole,
                seedNote,
            });
            const prioritized: string[] = [];
            motifPriorities.forEach((device) => pushUniqueDevice(prioritized, device));
            allowed.forEach((device) => pushUniqueDevice(prioritized, device));
            allowed = prioritized;
        }

        // Gate device choice by how it fits the planned phrase ahead. Long licks
        // (bluesLick, etc.) only get to fire when the plan has space; medium
        // devices swallow at most one planned attack. Without this, a mid-phrase
        // bluesLick silently eats 3-4 plan attacks via the consumer's `step >
        // stepTarget` shift in soloist.ts.
        // why: the bebopScale device is contractual — its passing tone exists
        // to land a chord tone on the strong beat (the buffer's last note IS
        // `selectedMidi`). When the picker chose a non-chord-tone, fall through
        // to `run`/`enclosure` instead of compensating in the device (which
        // would mutate `selectedMidi` by up to a tritone and break the line).
        const selectedPcRel = (((selectedMidi - targetChord.rootMidi) % 12) + 12) % 12;
        const selectedIsChordTone = ((chordMask >> selectedPcRel) & 1) === 1;
        const fittedAllowed = allowed.filter((device) => {
            if (device === 'bebopScale' && !selectedIsChordTone) {
                return false;
            }
            return deviceFitsHere(device, soloistState, step);
        });
        // why: pick weighted by rank, not uniform — `fittedAllowed` is ordered
        // best-first, and a uniform draw discarded that ranking. See `pickByRank`.
        // Discriminator 12: a single seeded draw (`scrambleHash`) supplied as
        // the `random` source so device selection is deterministic per
        // (step, section, loop) — `pickByRank` makes exactly one draw.
        const deviceType = pickByRank(fittedAllowed, () => scrambleHash(pickerSeedBase + 12));
        if (deviceType) {
            const res = applyDeviceBuffer(deviceType, deviceContextOptions);
            if (res) {
                soloistState.session.rhythm.deviceBuffer = res.buffer; // @worker-mutation
                soloistState.session.phrasing.busySteps = res.busySteps; // @worker-mutation
                return finalizeNote(res.first, 'device');
            }
        }
    }

    // Base Result without polyphony
    const result: any = {
        midi: selectedMidi,
        velocity: velocity,
        durationSteps: durationSteps,
        vibrato: vibrato,
        isSustained: rhythmNode.isSustained,
        // why: discriminators 8/9 — guitar bend-in (8 gates whether a long
        // sustained note bends in, 9 picks the bend direction).
        bendStartInterval:
            isGuitarMode && durationSteps >= 4 && scrambleHash(pickerSeedBase + 8) < 0.3
                ? scrambleHash(pickerSeedBase + 9) < 0.5
                    ? -1
                    : 1
                : 0,
        ccEvents: [],
        timingOffset: 0,
        style: activeStyle,
        isDoubleStop: false,
        isLegato: false,
    };

    // Polyphony check (Double Stops)
    let doubleStopChance = config.doubleStopProb * intensity * (soloistState.doubleStopProb ?? 1.0);
    if (isGuitarMode) {
        doubleStopChance =
            config.doubleStopProb *
            (soloistState.doubleStopProb ?? 1.0) *
            (0.35 + intensity * 0.45);

        if (durationSteps >= stepsPerBeat) {
            doubleStopChance *= 1.35;
        }
        if (isStrongBeat) {
            doubleStopChance *= 1.15;
        }
        if (selectedMidi < 64) {
            doubleStopChance *= 0.45;
        }
        if (!isStrongBeat && durationSteps < Math.max(2, stepsPerBeat / 2)) {
            doubleStopChance *= 0.18;
        }
        if (isLineStyle) {
            doubleStopChance *= durationSteps >= stepsPerBeat * 1.5 ? 0.45 : 0.12;
        }
        if (activeStyle === 'country') {
            doubleStopChance *= durationSteps >= stepsPerBeat ? 1.75 : 1.15;
        } else if (activeStyle === 'blues') {
            doubleStopChance *= durationSteps >= stepsPerBeat ? 2.9 : 2.05;
            if (supportRole === 'line' || supportRole === 'accent') {
                doubleStopChance *= 1.5;
            } else if (supportRole === 'anchor' || supportRole === 'cadence') {
                doubleStopChance *= 1.8;
            }
        } else if (isJazzGuitarStyle) {
            doubleStopChance *= durationSteps >= stepsPerBeat * 1.5 ? 0.4 : 0.08;
            if (supportRole === 'anchor' || supportRole === 'cadence') {
                doubleStopChance *= 1.48;
            } else if (supportRole === 'line') {
                doubleStopChance *= 0.5;
            }
        } else if (isGrooveGuitarStyle) {
            doubleStopChance *= durationSteps >= stepsPerBeat ? 0.82 : 0.28;
            if (!isStrongBeat) {
                doubleStopChance *= 0.65;
            }
            if (supportRole === 'line') {
                doubleStopChance *= 0.45;
            }
        } else if (isHighEnergyGuitarStyle) {
            doubleStopChance *= durationSteps >= stepsPerBeat * 1.5 ? 0.58 : 0.18;
            if (supportRole === 'line') {
                doubleStopChance *= 0.38;
            }
        } else if (activeStyle === 'rock') {
            doubleStopChance *= durationSteps >= stepsPerBeat ? 1.2 : 0.92;
        } else if (activeStyle === 'neo') {
            doubleStopChance *= durationSteps >= stepsPerBeat ? 1.08 : 0.68;
        } else if (supportRole === 'line') {
            doubleStopChance *= durationSteps >= stepsPerBeat ? 0.55 : 0.22;
        } else if (supportRole === 'accent') {
            doubleStopChance *= 0.9;
        } else if (supportRole === 'anchor' || supportRole === 'cadence') {
            doubleStopChance *= 1.2;
        }
        if (sustainBias >= 0.85) {
            doubleStopChance *= 1.12;
        }

        if (isHeadBypass) {
            if (seedNote?.supportHints?.guitar?.allowDoubleStop !== true) {
                doubleStopChance = 0;
            } else {
                doubleStopChance *= 0.45 + (seedNote.supportHints.sustainBias || 0.6) * 0.75;
                if (seedNote.isAnchor) {
                    doubleStopChance *= 1.15;
                }
            }
        } else if (loopCount === 0 && sessionSeed?.notes?.length) {
            doubleStopChance = 0;
        }
    }

    // why: discriminator 11 — double-stop / polyphony trigger gate.
    if (isPolyphonic && scrambleHash(pickerSeedBase + 11) < Math.min(0.98, doubleStopChance)) {
        const extra = generateExtraNotes({
            soloist: soloistState,
            currentChord,
            activeStyle,
            effectiveIntensity: intensity,
            selectedMidi,
            seedNote,
            supportRole,
            sustainBias,
        });
        if (extra && extra.length > 0) {
            // Optimization: Replace spread and map with pre-allocated loop to avoid closure overhead and intermediate arrays
            const polyResult: any[] = new Array(extra.length + 1);
            for (let i = 0; i < extra.length; i++) {
                const durationScale = extra[i].durationScale ?? 1;
                const leadDuration = result.durationSteps || 1;
                let supportDuration = Math.max(1, Math.round(leadDuration * durationScale));
                if (durationScale < 1) {
                    supportDuration = Math.min(leadDuration - 1, supportDuration);
                }
                supportDuration = Math.max(1, supportDuration);
                polyResult[i] = {
                    ...result,
                    ...extra[i],
                    durationSteps: supportDuration,
                    isLegato: false,
                };
            }
            polyResult[extra.length] = result;

            // We set busy steps for polyResult because they are playing simultaneously? No, wait.
            // In the original code, we assigned busySteps to result.durationSteps - 1 for polyphony too,
            // but we want to let rhythm node handle timing, EXCEPT polyResult needs busySteps to block if duration > 1?
            // Actually, wait: we said busySteps is obsolete for normal note generation.
            // If the rhythmPlan is handling timing, we shouldn't set busySteps for standard or poly notes
            // unless we want them to block the rhythm plan?
            // "busySteps must be retained exclusively for the melodic devices and embellishments"
            // Wait, double stops are a melodic device of sort (playing two notes at once). Do they block?
            // If they are played simultaneously, their duration doesn't affect the next rhythm plan execution.
            // But if the next rhythm plan step targets the middle of this duration, we just let it interrupt or something?
            // Actually, the rhythm plan already spaced the notes by 'gap', so the next attack is at least 'durationSteps' away.
            // So we don't need to set busySteps for regular single notes or double stops here!
            return finalizeNote(polyResult, 'picker');
        }
    }

    return finalizeNote(result, 'picker');
}
