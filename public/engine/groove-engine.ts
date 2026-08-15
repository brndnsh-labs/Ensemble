import {
    GROOVE_STRATEGY_BY_FEEL,
    type GrooveStrategyKey,
    isLatinGrooveFamily,
} from '../data/smart-genres.js';
import type { EnsembleState } from '../types.js';
import {
    binarySearchMap,
    getStepsPerMeasure,
    isSectionTurnaround,
    secondsPerStepFor,
} from '../utils.js';
import type { AccentCatch } from './drum-seeder.js';
import * as acoustic from './grooves/acoustic.js';
import * as blues from './grooves/blues.js';
import * as country from './grooves/country.js';
import * as disco from './grooves/disco.js';
import * as funk from './grooves/funk.js';
import * as hiphop from './grooves/hiphop.js';
import * as jazz from './grooves/jazz.js';
import * as latin from './grooves/latin.js';
import * as metal from './grooves/metal.js';
import * as neoSoul from './grooves/neo-soul.js';
import * as reggae from './grooves/reggae.js';
import * as rock from './grooves/rock.js';
import * as skaPunk from './grooves/ska-punk.js';
import { DEFAULT_CONFIG, isBackbeatAdjacentStep } from './grooves/utils.js';
import { deriveSectionSeed, scrambleHash, stringHash31, stringHash33 } from './hash-utils.js';
import { isInstrumentActiveAtStep, motifSelectionIntensity } from './section-overrides.js';

/**
 * Resolve a seeded soloist accent in the same timeline frame used by the
 * audible drummer. Mid-play reseeds shift the seed origin; callers must not
 * index `accentMap` with the raw transport step directly.
 */
export function getSoloistAccentAtStep(
    groove: EnsembleState['groove'],
    step: number,
): AccentCatch | null {
    const seedTimelineStartStep = groove.seedTimelineStartStep || 0;
    const timelineStep = step - seedTimelineStartStep;
    return timelineStep >= 0
        ? ((groove.accentMap?.[timelineStep] as AccentCatch | undefined) ?? null)
        : null;
}

/**
 * Return the snare catch that the audible drum path can actually add at this
 * position. The crowding discipline is shared with `applyGrooveOverrides` so
 * coordination can never announce a catch the snare itself suppresses.
 */
export function getAudibleSnareCatchAtStep(
    groove: EnsembleState['groove'],
    step: number,
    loopStep: number,
    stepsPerBar: number,
    isDownbeat: boolean,
): AccentCatch | null {
    const accent = getSoloistAccentAtStep(groove, step);
    if (
        accent?.type !== 'snare-stab' ||
        isDownbeat ||
        isBackbeatAdjacentStep(loopStep, stepsPerBar)
    ) {
        return null;
    }
    return accent;
}

/**
 * Groove strategy key → its implementing module. The KEYS are owned by
 * `GrooveStrategyKey` in `smart-genres.ts`; a key added there without a module
 * here (or a module here with no key) is a typecheck error, which is the point.
 *
 * why `latin` has no genre of its own: Bossa is the single selectable
 * Latin-family genre and `latin.ts` is its live engine, including the
 * compound-meter Bembé bell timeline in 6/8 and 12/8. #628 retired the
 * unreachable generic `Latin` genre/feel and the dormant World/Latin drum bank
 * (Salsa, Afro-Cuban 6/8, Samba, Afrobeat). See git history if World/Latin is
 * ever surfaced as real genres — it deserves a fresh, fully-wired story.
 */
const STRATEGY_MODULES: Record<GrooveStrategyKey, any> = {
    acoustic,
    blues,
    country,
    disco,
    funk,
    hiphop,
    jazz,
    latin,
    metal,
    'neo-soul': neoSoul,
    reggae,
    rock,
    'ska-punk': skaPunk,
};

/**
 * genreFeel → strategy module, DERIVED from the naming authority
 * (`GROOVE_STRATEGY_BY_FEEL`, `smart-genres.ts`) rather than hand-keyed — the
 * two feels that diverge from their genre name ('Bossa Nova', 'Ska') are
 * reconciled there, once, instead of by a comment at every table.
 *
 * Exported for the #1130 genreFeel-routing completeness guard
 * (tests/standards/genre-feel-canon-guard.test.ts).
 */
export const strategies: Record<string, any> = Object.fromEntries(
    Object.entries(GROOVE_STRATEGY_BY_FEEL).map(([feel, key]) => [feel, STRATEGY_MODULES[key]]),
);

// why (Epic 12 S6 B6): genres whose hat is part of the foundational spine —
// either a constant 8th/16th ticker or, in ska-punk's skank case, the genre-
// defining offbeat-only pattern. The Epic 2 S4 final-bar resolution gesture
// (Crash + sustained cymbal) suppresses the HiHat universally so the swell
// rings out cleanly — but in these genres the hat ISN'T a separate "would
// the cymbal clutter the swell" decision, it's part of the spine. Suppressing
// it reads as an abrupt drop-out at the moment the band is supposed to land
// hardest.
//
// Membership rule: hat is foundational to the genre's spine at typical
// cadence-arrival intensity. Includes:
//   - Disco (8th hat + 4-on-the-floor)
//   - Funk (16th ghosting)
//   - Rock (driving 8ths)
//   - Metal (8th-note rides)
//   - Ska-Punk (offbeat-only skank — the hat IS the only timekeeper at
//     low intensity, so its absence is even more conspicuous than a ticker
//     dropping out; "spine" rather than "dense" is the accurate framing)
//   - Hip Hop (boom-bap 8ths at motif 0; 16ths at motif ≥ 1, all motifs)
//   - Neo-Soul (8ths at low intensity, 16ths above ~0.58 — and final-bar
//     cadences typically arrive at section climax, where Neo-Soul WILL be
//     ticking 16ths; reviewer-flagged borderline case but the cadence-
//     intensity correlation tips it into the set)
//
// For the OUT genres (Jazz/Bossa/Acoustic/Country/Blues/Reggae) the original
// universal suppression remains correct — but #1216 corrected the reason, which
// used to read "the hat wasn't part of the spine to begin with." That is only
// true of Jazz (whose closed hat is a HiHatPedal chirp on 2 and 4, its real time
// living on the ride). Bossa, Country, Blues, Acoustic and Reggae all tick a
// continuous hat in their own strategy files. The operative test is not hat
// DENSITY but whether the closed hat is the listener's time reference AT
// CADENCE ARRIVAL: in these genres the final bar hands time to the swell/ride,
// so silencing the hat reads as the intended "let the swell breathe" gesture.
// (Distinct from the 'sparse'/'shimmer' split in grooves/utils.ts, which budgets
// compound-meter hat density and deliberately groups differently.)
// Exported for tests/standards/genre-feel-canon-guard.test.ts (#1208) only.
export const HAT_SPINE_GENRES = new Set([
    'Disco',
    'Funk',
    'Rock',
    'Metal',
    // why: genreFeel for the Ska-Punk genre is 'Ska' (smart-genres.ts), not the
    // preset name 'Ska-Punk' this set used before — the dead key meant Ska-Punk's
    // offbeat skank (its sole low-intensity timekeeper) got suppressed on the
    // final bar. Epic 2 S1.
    'Ska',
    'Hip Hop',
    'Neo-Soul',
]);

// why (Epic 12 S11): Epic 2 S4's universal final-bar gesture (Crash on Open
// + reinforced Kick + punctuation Snare) ends every genre the same way. Owner
// listen-test (LISTEN_TESTS.md C1, decided 2026-05-25 yes-build) confirmed
// that all genres currently sound about the same at song's end and there's
// clear room for per-genre idiom — Jazz/Bossa want a refined ride swell, not
// a Crash thud; Country wants a rolling quarter-note tag; Metal wants the
// signature China cymbal; Reggae wants the dub-style rim accent. The table
// below names the per-genre overrides on top of the universal gesture:
//   - openSound       — which sample fires on the Open lane on beat 1
//                       (default 'Crash'; Jazz/Bossa/Blues → 'Ride';
//                        Metal → 'China')
//   - snareSound      — which sample fires on the Snare lane on beat 1
//                       (default 'Snare'; Jazz/Bossa/Blues/Reggae → 'Sidestick')
//   - kickVelocity    — beat-1 Kick reinforcement (default 1.3; Hip Hop /
//                       Metal → 1.4 for trap/double-kick weight)
//   - openVelocity    — beat-1 Open lane velocity (default 1.25;
//                       Jazz/Bossa/Blues lowered to 1.20 — a swell, not a stab;
//                       Hip Hop raised to 1.30 — heavier trap-style sustain)
//   - flourish        — after-beat-1 lane-specific fills. Country/Acoustic
//                       add a Sidestick on quarter-note positions (loopSteps
//                       4/8/12) for the rolling-tag country idiom.
//
// Genres not listed (Funk, Disco, Rock, Neo-Soul, Ska-Punk, Hip Hop's
// flourish, …) fall through to the universal defaults.
//
// Source: docs/audit/epic-followup-drain.md S11.
type FinalBarTreatment = {
    openSound: 'Crash' | 'Ride' | 'China';
    snareSound: 'Snare' | 'Sidestick';
    kickVelocity: number;
    openVelocity: number;
    // why: a 'flourish' is a per-genre per-lane override that fires on the
    // post-beat-1 sub-beats. The function returns either a partial state
    // override (shouldPlay/velocity/soundName) or null to defer to the
    // default after-beat-1 logic (which silences Open + HiHat-in-sparse).
    flourish?: (
        instName: string,
        loopStep: number,
    ) => { shouldPlay: boolean; velocity?: number; soundName?: string } | null;
};

// why: shared country/acoustic flourish — beat 3 (loopStep 8) gets a Sidestick
// rim hit at velocity 0.85 for the "rolling tag" idiom of country/acoustic
// endings. Velocity 0.85 sits below the universal beat-1 hits (Kick 1.3 /
// Crash 1.25 / Snare 1.15) so the downbeat remains the dominant gesture and
// the rim flourish reads as embellishment, not as a competing accent.
//
// Scope (reviewer P1, Epic 12 S11): beat 3 ONLY — beats 2 and 4 are the
// backbeats and must keep the strategy's full Snare crack (~vel 1.15 with
// backbeatCrack multiplier), which is the loudest cadence-arrival snare
// signal a country drummer makes. Replacing the final-bar backbeats with a
// quiet rim-click would have the drummer pulling back at the moment the
// cadence should peak. Beat 3 (the only non-backbeat quarter-note in 4/4)
// is enough to read as a rolling tag without smothering the backbeats.
function countryFlourish(
    instName: string,
    loopStep: number,
): { shouldPlay: boolean; velocity?: number; soundName?: string } | null {
    if (instName !== 'Snare') {
        return null;
    }
    if (loopStep === 8) {
        return { shouldPlay: true, velocity: 0.85, soundName: 'Sidestick' };
    }
    return null;
}

const UNIVERSAL_FINAL_BAR: FinalBarTreatment = {
    openSound: 'Crash',
    snareSound: 'Snare',
    kickVelocity: 1.3,
    openVelocity: 1.25,
};

const PER_GENRE_FINAL_BAR: Record<string, FinalBarTreatment> = {
    // why: Jazz endings — Ride cymbal swell + brushy Sidestick on beat 1,
    // not a Crash thud. A hard Crash is too thudding for a Jazz ending; the
    // idiom is "land on the ride cymbal bell." Snare → Sidestick honors the
    // brushwork aesthetic. Open velocity slightly lower (1.20) — a swell,
    // not a stab.
    //
    // Compromise (Epic 12 S11): the audit asked for ride-BELL specifically;
    // synth-drums.ts has no separate RideBell sample, so we route to plain
    // 'Ride' at high velocity. Future-work: if/when RideBell becomes its own
    // sample, route Jazz/Blues/Bossa Open → 'RideBell' here.
    Jazz: { openSound: 'Ride', snareSound: 'Sidestick', kickVelocity: 1.3, openVelocity: 1.2 },
    // why: Blues — same refined-ride idiom as Jazz (shared cymbal-led close).
    Blues: { openSound: 'Ride', snareSound: 'Sidestick', kickVelocity: 1.3, openVelocity: 1.2 },
    // why: Bossa Nova — Latin endings traditionally close on a sparse ride
    // bell + clave-style rim, not a Crash. Same shape as Jazz.
    'Bossa Nova': {
        openSound: 'Ride',
        snareSound: 'Sidestick',
        kickVelocity: 1.3,
        openVelocity: 1.2,
    },
    // why: Country — universal Crash+Kick+Snare on beat 1 PLUS a sidestick
    // flourish on beats 2/3/4 for the rolling-tag idiom. Country endings are
    // busy, not minimal — the band lands hard then ornaments through the bar.
    Country: {
        openSound: 'Crash',
        snareSound: 'Snare',
        kickVelocity: 1.3,
        openVelocity: 1.25,
        flourish: countryFlourish,
    },
    // why: Acoustic — same rolling-tag idiom as Country (acoustic ballads end
    // with a quarter-note flourish, not a single thud).
    Acoustic: {
        openSound: 'Crash',
        snareSound: 'Snare',
        kickVelocity: 1.3,
        openVelocity: 1.25,
        flourish: countryFlourish,
    },
    // why: Hip Hop — trap-style outro hit. Heavier Kick (1.4) + slightly
    // heavier Crash sustain (1.30) for a trap-stinger arrival. Same gesture
    // shape but harder hit. No sample swaps — Hip Hop endings DO crash.
    'Hip Hop': {
        openSound: 'Crash',
        snareSound: 'Snare',
        kickVelocity: 1.4,
        openVelocity: 1.3,
    },
    // why: Metal — China cymbal is the signature metal cadence accent (see
    // metal.ts accentCymbal: 'China'). Route Open lane to 'China' so the
    // genre's idiomatic accent fires on the final downbeat alongside the
    // reinforced double-kick weight (Kick 1.4). The China sample shares the
    // Crash dispatch in playDrumSoundCurrent's Crash/China block (same buffer chain, bandpass-
    // shaped for the bark-like trash), so no new audio plumbing is needed.
    //
    // Compromise (reviewer P2, Epic 12 S11): the audit spec'd "Crash + China
    // stack." The Open lane dispatcher is single-voice (one sample per tick),
    // so we ship China-alone rather than the layered stack. China's
    // volumeScale=1.0 (vs Crash 0.9) keeps the accent strong; the missing
    // Crash body is the acceptable trade-off for not plumbing multi-sample
    // lanes. Future-work: if multi-sample lane dispatch lands, layer Crash
    // under China here for the full audit spec.
    Metal: { openSound: 'China', snareSound: 'Snare', kickVelocity: 1.4, openVelocity: 1.25 },
    // why: Reggae — dub aesthetic loves the rim, not the snare crack. The
    // cadence inversion: reggae skips beat-1 kick in the groove, but the
    // FINAL bar IS the cadence arrival so we keep the reinforced Kick; the
    // dub flavor surfaces by routing Snare beat-1 to 'Sidestick'. Open
    // Crash stays — reggae endings DO crash.
    Reggae: { openSound: 'Crash', snareSound: 'Sidestick', kickVelocity: 1.3, openVelocity: 1.25 },
};

function getFinalBarTreatment(genreFeel: string | undefined): FinalBarTreatment {
    // why (#628): Bossa is the one Latin-family genre and always sets
    // genreFeel='Bossa Nova', so the standard genreFeel lookup covers it — the
    // old LATIN_PRESETS indirection (for the now-retired World/Latin drum bank)
    // is gone.
    if (!genreFeel) {
        return UNIVERSAL_FINAL_BAR;
    }
    return PER_GENRE_FINAL_BAR[genreFeel] ?? UNIVERSAL_FINAL_BAR;
}

function getStrategy(groove: any): any {
    // why (#628 / #1177): the Latin-family pre-check runs ahead of the feel table
    // so a groove slice carrying only the canon name (`lastSmartGenre='Bossa'`,
    // e.g. a partially-synced mock) still reaches Bossa's own kit instead of
    // falling through to DEFAULT_CONFIG. `isLatinGrooveFamily` is the single
    // canonical predicate (smart-genres.ts) — the same one the snare-syncopation
    // exemption below uses, so a future Latin-family genre updates both at once.
    if (isLatinGrooveFamily(groove.genreFeel, groove.lastSmartGenre)) {
        return latin;
    }

    return strategies[groove.genreFeel] || null;
}

function humanizeVelocity(vel: number, seed: number, amount = 0.05): number {
    return vel * (1.0 + (scrambleHash(seed) - 0.5) * amount);
}

/**
 * Chorus Evolution — entropy ghost-density opening over repeat passes (#806).
 *
 * The drummer establishes a solid pocket on the Head and OPENS UP across loops:
 * `currentLoopCount` ramps the entropy phase's ghost-density scale from
 * `CHORUS_EVOLUTION_HEAD_FLOOR` at loop 0 to full (1.0) by ~loop 2, then holds.
 * It is applied as a multiplier inside the entropy gate, which already scales
 * by `bandIntensity` and respects each genre's `suppressEntropyBelow` floor —
 * so the build is intensity- and genre-aware for free (a quiet ballad chorus
 * opens up far less than a high-energy one, and not at all below its floor).
 *
 * why a ramp, not a motif cap: the prior lever (a per-loop motif-index cap fed
 * to `getMotif` as a complexity float) was inert — `getMotif` treats complexity
 * as a coarse on/off gate, so loop 0 and loop 2 produced identical motifs and
 * Chorus Evolution did nothing for the drums (form-arranger.md P0 #3; the
 * inert-lever finding that motivated this). The entropy phase is the one place
 * a single density signal reaches every genre deterministically.
 */
const CHORUS_EVOLUTION_HEAD_FLOOR = 0.5;
export function chorusEvolutionScale(loopCount: number): number {
    const loopOpenness = Math.min(1, Math.max(0, loopCount) / 2); // 0 head → 1 by loop 2+
    return CHORUS_EVOLUTION_HEAD_FLOOR + (1 - CHORUS_EVOLUTION_HEAD_FLOOR) * loopOpenness;
}

/**
 * Chorus Evolution motif backbone (#806) — the structural half of the build.
 *
 * Caps the motif INDEX each genre's getMotif may reach, by loop, so the kit
 * plays a simpler pattern on The Head and unlocks busier motifs on repeats:
 *   Loop 0  → ceiling 1 (Standard): tight, foundational statement.
 *   Loop 1  → ceiling 2 (Active):   opening up.
 *   Loop 2+ → no cap (genre's full range): the established, full-tilt feel —
 *             so later passes match today's behavior and nothing regresses.
 *
 * Applied as `Math.min(getMotif(...), motifCeiling)` at each genre call site.
 * The orchestration's intrinsic complexity still governs via getMotif's gate
 * (a Pocket section returns motif 0 regardless of loop), so this only ever
 * holds BACK early loops — it never forces a busier motif than the section or
 * the intensity tier already wanted.
 */
export function loopMotifCeiling(loopCount: number): number {
    if (loopCount <= 0) {
        return 1;
    }
    if (loopCount === 1) {
        return 2;
    }
    return Number.POSITIVE_INFINITY; // loop 2+: full genre range (today's feel)
}

// why: tick-logic builds this bag inline for every drum tick. Tightening
// the shape here lets the compiler catch typos in field names (which would
// silently shadow as `undefined` and corrupt the per-tick groove decision).
// Test fixtures pass `params: any`, which remains assignable; production
// `inst` / `tsConfig` keep `any` for compatibility with `Instrument` and
// `TIME_SIGNATURES[...]` shapes without forcing a wider refactor here.
export interface GrooveOverrideOptions {
    stepVal: number;
    step: number;
    inst: any;
    playback: EnsembleState['playback'];
    groove: EnsembleState['groove'];
    isDownbeat: boolean;
    isBeatStart: boolean;
    isPulse?: boolean;
    isPulseStart?: boolean;
    isGroupStart: boolean;
    isBackbeat: boolean;
    isOffbeat: boolean;
    isEOfBeat: boolean;
    isAOfBeat: boolean;
    beatIndex: number;
    tsConfig: any;
    // why: `mStep` / `stepInGroup` / `groupIndex` / `isCompound` are sourced
    // from `stepInfo` (utils.ts `getStepInfo`) and threaded through by the
    // tick-logic.ts production caller (epic-deferred-followups S8(c)). Per-genre
    // strategies (jazz.ts reads all four for compound-meter ride/skip-beat
    // logic) consume them via the `context` bag below. Kept optional so test
    // fixtures that don't exercise compound meters can omit them.
    mStep?: number;
    isCompound?: boolean;
    stepInGroup?: number;
    groupIndex?: number;
    sectionId?: string | null;
    sectionOccurrence: number;
    isFinalMeasure: boolean;
    // tick-logic.ts builds the bag with a few extras (`isTurnaround`,
    // `stepsPerBar`, `loopStep`) that this function recomputes internally
    // and ignores; declared optional so the call site typechecks.
    isTurnaround?: boolean;
    stepsPerBar?: number;
    loopStep?: number;
}

export function applyGrooveOverrides(
    state: any,
    {
        stepVal,
        step,
        inst,
        playback,
        groove,
        isDownbeat,
        isBeatStart,
        isPulse,
        isPulseStart,
        isGroupStart,
        isBackbeat,
        isOffbeat,
        isEOfBeat,
        isAOfBeat,
        beatIndex,
        tsConfig,
        mStep,
        isCompound,
        stepInGroup,
        groupIndex,
        sectionId: sectionIdFromTick,
        sectionOccurrence,
        isFinalMeasure,
    }: GrooveOverrideOptions,
) {
    const { soloist, arranger } = state;
    const arrangerState = { timeSignature: '4/4', ...(arranger || {}) };
    const stepsPerBar = getStepsPerMeasure(arrangerState.timeSignature);
    const loopStep = step % stepsPerBar;

    let currentState = {
        shouldPlay: stepVal > 0,
        velocity: stepVal === 2 ? 1.25 : 0.9,
        soundName: inst.name,
        instTimeOffset: 0,
    };

    const strategy = getStrategy(groove);
    const config = strategy ? strategy.config : DEFAULT_CONFIG;
    // why (#1177): ONE Latin-family predicate for the whole file — kit dispatch
    // (getStrategy) and the entropy snare exemption below read the same call, so
    // a second Latin-family genre can't update one and silently miss the other.
    // Replaces the strategy-config `isLatin` flag, which was a second spelling of
    // exactly this condition and drifted independently.
    const isLatinFamily = isLatinGrooveFamily(groove.genreFeel, groove.lastSmartGenre);

    let pulseWeight = 1.0;
    if ((inst.name === 'HiHat' || inst.name === 'Open') && !config.exemptFromPulseShaping) {
        const isSyncopated = loopStep % 2 === 1;
        if (isOffbeat) {
            pulseWeight = 0.85;
        } else if (isSyncopated) {
            pulseWeight = 0.7;
        }
    }

    // Generative complexity is always engaged — the drummer is a live session
    // player, not a metronome. (Was gated on the removed `groove.creativity`
    // toggle; 0.8 was the toggle-on value.)
    const drumComplexity = 0.8;

    const barIndex = Math.floor(step / stepsPerBar);
    const prevBarIndex = Math.floor((step - 1) / stepsPerBar);
    const isFirstStepOfNewBar = loopStep === 0 && barIndex !== prevBarIndex;
    const seedTimelineStartStep = groove.seedTimelineStartStep || 0;
    const timelineStep = step - seedTimelineStartStep;

    const orchestration: any = groove.orchestrationMap
        ? binarySearchMap(groove.orchestrationMap, timelineStep)
        : null;
    // #806: drumComplexity = the section's intrinsic busy-ness (Pocket 0 /
    // Standard 1 / Active 2 / Busy 3 → /3) RIDING the same Chorus Evolution ramp
    // as the motif ceiling and entropy levers. The genres that read drumComplexity
    // directly in their ghost/comp probabilities (jazz ride+comp, blues + latin
    // gates) therefore hold back on The Head and open up over loops in lockstep
    // with the rest of the kit — rather than sitting at full section density from
    // loop 0. For an Active section this reproduces the prior loop-0/loop-2 values
    // (0.667 × {0.5, 1.0} = 0.333 / 0.667). The fallback (no orchestration) keeps
    // the live-play default unscaled.
    const evoScale = chorusEvolutionScale(playback?.currentLoopCount ?? 0);
    const effectiveComplexity =
        orchestration?.motifComplexity !== undefined
            ? (orchestration.motifComplexity / 3) * evoScale
            : drumComplexity;

    // Calculate current section length to determine turnarounds dynamically instead of hardcoded 4 bars
    const isTurnaround = isSectionTurnaround(step, arrangerState.sectionMap, stepsPerBar, 1);

    // Check if the PREVIOUS bar was a turnaround to determine if we should crash now
    const prevStep = step - stepsPerBar;
    const prevWasTurnaround = isSectionTurnaround(
        prevStep,
        arrangerState.sectionMap,
        stepsPerBar,
        1,
    );

    const justFinishedTurnaround = prevWasTurnaround && isFirstStepOfNewBar;

    const chordEntry: any = binarySearchMap(arrangerState.stepMap || [], step);
    const sectionId = chordEntry?.chord?.sectionId;
    let sectionSeed = groove.sectionSeedMap?.[sectionId];
    // #1266 — `typeof !== 'number'`, not `=== undefined`. `sectionSeedMap` is always a
    // plain, prototype-bearing object by the time it reaches here (`toRaw` in
    // `worker-client.ts` rebuilds every synced object as a fresh `{}` before
    // `postMessage`, and `grooveReducer` re-creates it as `{}` on SET_SONG_SEED), so a
    // section id of 'constructor' returns the `Object` constructor — not `undefined`,
    // and it would sail into `getPhraseSeed` as a function where a number is required.
    // Hydration rejects such ids at the source; this is the second line of defense,
    // and it matches the two reads in `conductor.ts` and the one in `drums-tick.ts`.
    if (typeof sectionSeed !== 'number' || !Number.isFinite(sectionSeed)) {
        // #791: derive the SAME per-section marker the conductor writes into
        // sectionSeedMap — from (sectionId, songSeed) — so the seeded and
        // fallback paths agree (no mid-section groove swap as the lagged
        // conductor write lands) and a pinned song seed reproduces the exact
        // groove across replays and devices. The marker is constant for the
        // whole section, so `getMotif` settles on one pattern instead of
        // re-picking every bar; per-bar breathing still comes from the
        // downstream `getPhraseSeed(sectionSeed, barIndex, …)` draws.
        sectionSeed = deriveSectionSeed(sectionId ?? '', arrangerState.seed ?? '');
    }

    // #790: deterministic base seed for this tick's strategy `roll()` decisions —
    // same (sectionId, barIndex, loopStep, inst.name) fold the entropy phase uses
    // below (`_entropyBaseSeed`). Strategies derive each roll's seed from this via
    // `rollSeed(context, salt)`, so ghost/decoration rolls reproduce across loops
    // and critique runs instead of re-rolling raw Math.random every pass.
    const rollBaseSeed =
        (stringHash33(sectionIdFromTick || sectionId || '') ^
            (barIndex * 0x9e3779b1) ^
            (loopStep * 131) ^
            stringHash31(inst.name ?? '')) |
        0;

    const context = {
        step,
        inst,
        stepVal,
        playback,
        groove,
        isDownbeat,
        isBeatStart,
        isPulse,
        isPulseStart,
        isGroupStart,
        isBackbeat,
        isOffbeat,
        isEOfBeat,
        isAOfBeat,
        beatIndex,
        tsConfig,
        mStep,
        isCompound,
        stepInGroup,
        groupIndex,
        stepsPerBar,
        loopStep,
        drumComplexity: effectiveComplexity,
        // #841: bar-stable intensity for MOTIF selection only — latched to this
        // bar's downbeat instead of the live per-step ramping `bandIntensity`, so
        // the motif (kick/snare/hat skeleton) can only change AT a bar line, never
        // mid-bar (the drums-only "stutter"). Genres pass THIS to `getMotif`, but
        // keep using the live `intensity` for everything that should track the
        // ramp smoothly (velocity scaling, ghost-note roll probabilities). See
        // `motifSelectionIntensity` for the reconstruction.
        motifIntensity: motifSelectionIntensity(state, playback?.bandIntensity ?? 1.0, loopStep),
        // #806: per-loop motif-index ceiling for Chorus Evolution — genres clamp
        // their getMotif result to this so The Head stays simple and later loops
        // open up. Infinity (loop 2+) is a no-op clamp = full genre range.
        motifCeiling: loopMotifCeiling(playback?.currentLoopCount ?? 0),
        orchestration,
        barIndex,
        isFirstStepOfNewBar,
        sectionSeed,
        rollBaseSeed,
        isTurnaround,
        // why: read effective soloist activity (section override may force-off the
        // soloist even when the global flag is on). Without this, drums hear a
        // mid-phrase soloist that isn't producing notes and apply busy-yield
        // behavior in a section that's supposed to feature the drums.
        isSoloistBusy:
            isInstrumentActiveAtStep(state, 'soloist', step) &&
            soloist.session.phrasing.busySteps > 0,
    };

    if (strategy) {
        currentState = strategy.applyOverrides(context, currentState);
    }

    // --- Phase 2b: Section-boundary Crash (applied post-strategy so genre overrides don't clobber it) ---
    // why: the turnaround block previously ran BEFORE strategy.applyOverrides, which unconditionally
    // resets the hat lane (e.g. funk's `applyOverrides` sets shouldPlay=false and rebuilds from scratch), so the
    // Crash routing was always wiped. Moving it here — parallel with the crash-catch accent below —
    // guarantees the Crash fires on the final, post-strategy state.
    if (justFinishedTurnaround && isDownbeat) {
        if (inst.name === 'Kick') {
            currentState.shouldPlay = true;
            currentState.velocity = 1.35;
        } else if (inst.name === 'Open' && playback.bandIntensity > 0.45) {
            // why: route the section-start crash splash on the Open lane only — blues's `applyOverrides`
            // is the reference pattern. Firing on both HiHat and Open lanes (the previous
            // implementation) produces two stacked Crash drumHits per boundary, and the
            // second voice's `lastCrashGain` ramp-down in playDrumSoundCurrent's Crash/China block actively
            // chokes the first voice's tail (audible "flam" + gain stutter). The HiHat lane
            // keeps whatever the genre strategy decided. At intensity < 0.45 we leave the
            // Open lane to its strategy default — no crash on a quiet intro return.
            currentState.shouldPlay = true;
            // why: epic-deferred-followups S8(b) — splash the genre's declared
            // accent cymbal (Metal → China) on the post-turnaround boundary.
            // Default 'Crash' preserves every other genre's behavior.
            currentState.soundName = config.accentCymbal ?? 'Crash';
            currentState.velocity = 1.2;
        }
    }

    // --- Phase 3: Soloist Accent Catching ---
    // why: the soloist snare-stab accent (drum-seeder.ts generateSoloistAccents)
    // lands at the soloist's peak step with no beat-position discipline, and is
    // applied here at velocity 1.2 — as loud as the backbeat. Compute the
    // backbeat-crowding flag so the snare branch below can refuse to drop that
    // loud snare on the downbeat (no backbeat lives on beat 1) or a 16th from
    // beats 2/4 — the "early snare" / "two snares in a row" the owner reported. A
    // snare-stab catching a syncopation in open space is still musical and kept.
    const snareCatch = getAudibleSnareCatchAtStep(groove, step, loopStep, stepsPerBar, isDownbeat);
    const accent = getSoloistAccentAtStep(groove, step);
    if (accent) {
        if (accent.type === 'crash-catch') {
            if (inst.name === 'Kick') {
                currentState.shouldPlay = true;
                currentState.velocity = 1.3;
            } else if (inst.name === 'Open') {
                // why: route crash-catch accents on the Open lane only — same double-fire
                // reasoning as the section-boundary block above. A crash-catch fires every
                // time the soloist hits a peak (velocity > 0.85 or syncopation > 0.75), so
                // the duplicate-Crash artifact cumulatively dominated a song with an active
                // soloist. The HiHat lane stays on whatever the strategy chose.
                currentState.shouldPlay = true;
                // why: S8(b) — crash-catch accents use the genre's declared
                // accent cymbal (Metal → China) so a soloist peak on a metal
                // section splashes China, consistent with the boundary block.
                currentState.soundName = config.accentCymbal ?? 'Crash';
                currentState.velocity = 1.25;
            }
        } else if (accent.type === 'snare-stab') {
            // Catch the peak with a loud snare only in open space — never on the
            // downbeat or a 16th flanking the backbeat. When suppressed we leave
            // currentState as the strategy set it (so a genre that intends a
            // downbeat snare — e.g. a Metal blast — keeps it); we only stop the
            // accent from ADDING a crowding snare. The Kick reinforcement is
            // musical anywhere and is left untouched.
            if (inst.name === 'Snare' && snareCatch) {
                currentState.shouldPlay = true;
                currentState.soundName = 'Snare';
                currentState.velocity = 1.2;
            } else if (inst.name === 'Kick') {
                currentState.shouldPlay = true;
                currentState.velocity = 1.1;
            }
        } else if (accent.type === 'hat-bark') {
            if (inst.name === 'HiHat' || inst.name === 'Open') {
                currentState.shouldPlay = true;
                currentState.soundName = 'Open';
                currentState.velocity = 1.1;
            }
        }
    }

    // --- Entropy Phase (Random Expressivity) ---
    // why: drums.md P0 #2 — per-genre floor on entropy. Reggae One Drop holes
    // at 0.5, Jazz ride emptiness at 0.45, Acoustic ballad at 0.5 all need
    // entropy fully off so the silence reads as silence. `suppressEntropyBelow`
    // defaults to 0 (legacy behavior — entropy always runs); per-genre overrides
    // live in each grooves/*.ts config. Bossa/Latin already exempt via the
    // `isLatinFamily` predicate gating the Snare branch below; this is the
    // broader gate that also covers the HiHat/Open branch.
    const entropyFloor = config.suppressEntropyBelow ?? 0;
    // why: strict `>` so the floor value itself is suppressed. The audit's
    // canonical case (drums.md P0 #2) is "Reggae One Drop at intensity 0.5":
    // with floor=0.5 and `>=` the entropy still fires at 0.5; `>` makes the
    // floor inclusive of the suppressed range, matching the story's phrasing
    // "no entropy sprinkle below the genre's floor" (≤ floor = suppressed).
    const entropyGateActive = playback.bandIntensity > entropyFloor;

    // Suppress entropy during the first iteration to establish a solid 'Pocket'.
    // why: drums.md P0 #2 — when `arrangerState.totalSteps` is unset (early-bar
    // bootstrap or seed paths that haven't filled the timeline length yet), the
    // previous comparison `step < (totalSteps || 0)` collapsed to `step < 0`,
    // which is always false → entropy fired at full strength when it should have
    // been suppressed. Fall back to `seedTimelineStartStep + stepsPerBar`: this
    // suppresses for the first bar after the seed timeline starts whenever the
    // engine doesn't know the total length yet.
    const firstIterBoundary = arrangerState.totalSteps || seedTimelineStartStep + stepsPerBar;
    const firstIterationSuppression = step < firstIterBoundary ? 0.3 : 1.0;

    // Chorus Evolution (#806): the drummer settles into the pocket on the Head
    // and OPENS UP over repeat passes — entropy ghost density ramps from a
    // suppressed floor at loop 0 to full by ~loop 2, then holds. Read
    // currentLoopCount at per-tick time so the same orchestration entry renders
    // busier on later passes. Intensity-/genre-aware downstream: the gate below
    // multiplies by bandIntensity and the per-genre suppressEntropyBelow floor
    // already gates quiet sections out entirely.
    const evolutionScale = chorusEvolutionScale(playback?.currentLoopCount ?? 0);
    // Velocity dynamic-range widening: as the kit opens up, ghost hits gain a
    // little more accent-vs-ghost contrast (a wider velocity ceiling), not just
    // more of them. 0 at the Head floor → full widening by ~loop 2.
    const evolutionVelSpread =
        (evolutionScale - CHORUS_EVOLUTION_HEAD_FLOOR) / (1 - CHORUS_EVOLUTION_HEAD_FLOOR); // 0 at loop 0 → 1 at loop 2+

    // why: Epic 12 S4 — migrate the three entropy-phase Math.random() draws to
    // scrambleHash seeded on (barIndex, sectionId, loopStep, inst.name) so
    // drum-strategy probability and velocity decisions are deterministic across
    // loops and critique tests. Each draw gets a distinct discriminator (1/3/5)
    // so co-located draws don't collide. sectionId hashed with stringHash33 —
    // matching the Imperfect Symmetry block at line ~437; inst.name hashed with
    // stringHash31 (the existing convention at lines 467/597) so the gate
    // decision is INDEPENDENT per lane — without the inst-name fold, Snare and
    // HiHat would see the same hash quantile at the same (barIndex, loopStep)
    // and their entropy decisions would lockstep. Musically minor (Snare/HiHat
    // eligibility conditions are mutually exclusive at any given step), but
    // restoring lane independence preserves the prior per-call statistical
    // shape. Source: FOLLOWUPS §C.
    const _entropySectionIdStr = sectionIdFromTick || sectionId || '';
    const _entropySectionHash = stringHash33(_entropySectionIdStr);
    const _entropyInstHash = stringHash31(inst.name ?? '');
    // Shared base seed: barIndex * large-prime XOR sectionHash XOR loopStep * small-prime XOR instHash.
    // Discriminators are odd primes (1/3/5) so adjacent draws produce unrelated values.
    const _entropyBaseSeed =
        (_entropySectionHash ^ (barIndex * 0x9e3779b1) ^ (loopStep * 131) ^ _entropyInstHash) | 0;

    if (
        entropyGateActive &&
        !currentState.shouldPlay &&
        // why: draw 1 (discriminator 1) — the entropy gate itself. scrambleHash gives
        // a well-distributed float per (barIndex, sectionId, loopStep) tuple so the
        // gate fires at the correct average rate without introducing LCG sawtooth
        // artifacts (see feedback_seeded_prng_mulberry32 project memory).
        scrambleHash((_entropyBaseSeed + 1) | 0) <
            playback.bandIntensity *
                config.entropyMultiplier *
                firstIterationSuppression *
                evolutionScale *
                (config.blockAdjacentSnare && groove.genreFeel !== 'Rock' ? 0.7 : 1.0)
    ) {
        const isSyncopated = loopStep % 2 === 1;
        const subdivision = stepsPerBar / (arrangerState.timeSignature.includes('/8') ? 2 : 4);
        const isHeavySync = loopStep % subdivision === Math.floor(subdivision / 2);

        // why: share the backbeat-crowding definition with the soloist accent
        // gate and the strategy 16th-ghosts via isBackbeatAdjacentStep (4/4:
        // {3,5,11,13}). The e-of-beat steps {1,9} stay an entropy-only extra
        // guard. stepsPerBar === 16 ⇔ 4/4 in TIME_SIGNATURES, so this is exactly
        // the prior `timeSignature === '4/4'` behavior with one shared helper.
        const isBackbeatAdjacent = isBackbeatAdjacentStep(loopStep, stepsPerBar);
        const isEOfBeatCheck = stepsPerBar === 16 && (loopStep === 1 || loopStep === 9);
        const blockSnare = config.blockAdjacentSnare && (isBackbeatAdjacent || isEOfBeatCheck);

        if (inst.name === 'Snare' && isSyncopated && !blockSnare && !isLatinFamily) {
            currentState.shouldPlay = true;
            // why: draw 2 (discriminator 3) — ghost snare velocity in [0.1, 0.25).
            // Must be distinct from draw 1 to avoid correlation; discriminator 3
            // separates the gate decision from the velocity assignment. Base range
            // matches prior Math.random(): 0.1 + r*0.15 ∈ [0.10, 0.25). Chorus
            // Evolution (#806) widens the internal dynamic range of the entropy
            // sprinkle by raising the ceiling up to +0.10 by ~loop 2 — more dynamic
            // life among the ghost hits as the kit opens up: [0.10, 0.35) at full.
            currentState.velocity =
                0.1 + scrambleHash((_entropyBaseSeed + 3) | 0) * (0.15 + 0.1 * evolutionVelSpread);
            // why: gate kept at 0.4 (NOT swept with the per-genre S8 backbeat gates).
            // This fires entropy-phase syncopation hits across ALL genres including ones
            // whose per-genre Snare gates were deliberately preserved (Jazz brushwork,
            // Bossa clave, Acoustic ballad). Blanket-lowering to 0.3 would crack ghost
            // hits where the genre identity is rim. Ghost-fill velocity (0.1-0.25) is
            // quieter than backbeat (~1.2 scaled) — rim is the musical default. (S8 2026-05-17)
            currentState.soundName = playback.bandIntensity < 0.4 ? 'Sidestick' : 'Snare';
        } else if (
            (inst.name === 'HiHat' || inst.name === 'Open') &&
            isHeavySync &&
            !config.blockAdjacentSnare &&
            // Respect phrase-release lane ownership: when the strategy has routed this
            // step to the Open articulation (soundName='Open', shouldPlay=false on the
            // HiHat lane), entropy must not reclaim it as a closed-hat hit.
            currentState.soundName !== 'Open'
        ) {
            currentState.shouldPlay = true;
            // why: draw 3 (discriminator 5) — entropy hihat velocity in [0.2, 0.4).
            // Discriminator 5 separates this from draws 1 and 2. Base range matches
            // prior Math.random(): 0.2 + r*0.2 ∈ [0.20, 0.40). Kept in a separate
            // branch from draw 2 (Snare) so a single step can't trigger both velocity
            // paths. Chorus Evolution (#806) widens the internal dynamic range of the
            // sprinkle by raising the ceiling up to +0.10 by ~loop 2: [0.20, 0.50).
            currentState.velocity =
                0.2 + scrambleHash((_entropyBaseSeed + 5) | 0) * (0.2 + 0.1 * evolutionVelSpread);
            currentState.soundName = 'HiHat';
        }
    }

    // --- Imperfect Symmetry: per-bar ghost-note permutation on repeat passes ---
    // why: epic-form-arrangement S3 — when a section repeats (Verse 2 vs Verse 1),
    // the drums otherwise produce an identical 16-step pattern, making the band
    // sound mechanical on repeated form. On the restatement we permute ONE ghost
    // note per 16-step bar (per Snare/HiHat lane) by toggling its play state at
    // a seeded, non-foundational step. Mirrors the bass S2 pattern; same seed
    // recipe `(sectionIdHash, occurrence, barIndex, instName)`.
    //
    // Musical intent: "this drummer pushed the ghost one 16th later on Verse 2."
    // The skeleton (Kick on 1, Snare backbeat) is preserved — we only touch
    // non-foundational subdivisions where a real drummer would naturally vary
    // the embellishment between passes. Kick lane is exempt entirely so the
    // pocket's bottom never moves.
    //
    // Toggle semantics (musically symmetric — picks the seeded step regardless
    // of whether it's currently a hit, then flips it):
    //   - currently playing → drop to silent (the drummer "skipped" that ghost)
    //   - currently silent  → add a ghost hit at low velocity (the drummer
    //     "added" a ghost where none existed on the Statement pass)
    // Either way the bar's hit distribution changes by exactly one event.
    //
    // Source: docs/audit/form-arranger.md P1 #7;
    //         docs/audit/epic-form-arrangement.md S3.
    const sectionOccurrenceSafe: number = sectionOccurrence ?? 1;
    const isRepeatPassDrums = sectionOccurrenceSafe >= 2;
    const isGhostLane = inst.name === 'Snare' || inst.name === 'HiHat' || inst.name === 'Open';
    // why: epic-form-arrangement S4 precedence — on the form's final bar, the
    // resolution gesture (Crash + sustained cymbal) overrides Imperfect Symmetry.
    // Gating the ghost-permutation block prevents a "skipped ghost" from landing
    // on the same bar as the cadence crash, which would muddy the resolution.
    const isFinalMeasureDrums = isFinalMeasure === true;
    if (
        !isFinalMeasureDrums &&
        isRepeatPassDrums &&
        isGhostLane &&
        arrangerState.timeSignature === '4/4'
    ) {
        // why: skip foundational positions — downbeat (step 0) and backbeats
        // (steps 4, 12 in 4/4) define the genre's groove skeleton; permuting
        // them would read as a glitch, not as expressive variation. Allowed
        // candidates are the 13 remaining 16th positions per bar.
        const FOUNDATIONAL_STEPS_4_4 = new Set([0, 4, 12]);
        if (!FOUNDATIONAL_STEPS_4_4.has(loopStep)) {
            // Hash sectionId string (djb2 ×33-from-5381) for stable per-section
            // variation — canonical helper, see hash-utils.ts.
            const sectionIdStr: string = sectionIdFromTick || sectionId || '';
            const sectionIdHash = stringHash33(sectionIdStr);
            // why: also fold the instrument name so Snare and HiHat each get
            // their own target step within the bar — otherwise both lanes
            // would permute on the same 16th, doubling the gesture. djb2
            // ×31-from-0 variant (stringHash31) — kept distinct from the
            // section hash so this lane's seeded distribution is unchanged.
            const instNameHash = stringHash31(inst.name ?? '');
            // why: a bare djb-style polynomial hash of short instrument names
            // ("Snare" vs "HiHat") leaves the low bits poorly distributed, so
            // the XOR below can correlate adjacent lanes. Run it through the
            // canonical mulberry32 scramble first so each lane gets a
            // well-mixed 32-bit integer to fold into targetSeed.
            const instHash = (scrambleHash(instNameHash) * 0x100000000) | 0;
            const targetSeed = scrambleHash(
                (sectionIdHash ^
                    (sectionOccurrenceSafe * 0x9e3779b1) ^
                    (barIndex * 0x85ebca77) ^
                    (instHash * 0x27d4eb2f)) |
                    0,
            );
            // 13 non-foundational candidate steps: [1,2,3,5,6,7,8,9,10,11,13,14,15]
            const candidateSteps = [1, 2, 3, 5, 6, 7, 8, 9, 10, 11, 13, 14, 15];
            const targetStep = candidateSteps[Math.floor(targetSeed * candidateSteps.length)];
            if (loopStep === targetStep && !inst.muted) {
                if (currentState.shouldPlay) {
                    // why: drop this ghost — the drummer skipped it on the repeat.
                    // Preserve soundName so logging stays informative.
                    currentState.shouldPlay = false;
                } else {
                    // why: add a ghost at low velocity. 0.18 sits in the ghost-velocity
                    // band used elsewhere in this engine (entropy ghost = 0.1+rand*0.15,
                    // entropy hat = 0.2+rand*0.2). For Snare, route to Sidestick at low
                    // intensity to match the entropy-phase convention at line 304.
                    // S8 2026-05-17: this gate stays at 0.4 by design (see line 304 rationale);
                    // per-genre gates were swept to 0.3, ghost-fills across all genres stay rim.
                    currentState.shouldPlay = true;
                    currentState.velocity = 0.18;
                    if (inst.name === 'Snare') {
                        currentState.soundName =
                            playback.bandIntensity < 0.4 ? 'Sidestick' : 'Snare';
                    } else {
                        currentState.soundName = 'HiHat';
                    }
                }
            }
        }
    }

    // --- Final-Bar Resolution Cymbal (epic-form-arrangement S4) ---
    // why: form-arranger.md P1 #6 — when song-mode playback is ending, the band
    // should signal the ending across all instruments. Today the drum engine
    // only signals via the section-boundary Crash (line ~221) — which fires on
    // every section turnaround, not on the song's last bar. Add an explicit
    // final-bar gesture: Crash + sustained Open cymbal on beat 1, plus a
    // reinforced Kick. The "final cymbal swell" of the audit doc.
    //
    // Lane assignments mirror the section-boundary Crash routing (line ~221)
    // and `crash-routing-critique.test.ts`: route the crash on the Open lane to
    // avoid the double-Crash audio artifact (playDrumSoundCurrent's Crash/China-block
    // lastCrashGain ramp-down would otherwise choke the second voice's tail).
    // Kick gets a reinforced thump for arrival weight. The HiHat lane is left
    // alone — its closed-hat ticking on the final bar would clutter the swell.
    // Snare gets a final accent on the downbeat (a "punctuation snare hit") if
    // present.
    //
    // Suppressing other voices on the final bar: we ALSO drop HiHat hits past
    // beat 1, so the Open/Crash swell rings out cleanly. Snare backbeats are
    // left alone (a real drummer keeps the backbeat through the final bar's
    // hit; only the cymbal stops ticking).
    //
    // Precedence: this block runs AFTER imperfect-symmetry (which itself is
    // gated off above on the final bar), AFTER section-boundary crash routing,
    // and BEFORE velocity humanization — so the seed-jitter still applies for
    // a natural feel even on the cadence hit.
    //
    // Source: docs/audit/form-arranger.md P1 #6;
    //         docs/audit/epic-form-arrangement.md S4.
    if (isFinalMeasureDrums) {
        // why (Epic 12 S11): per-genre treatment selected once, then applied
        // to whichever lane this tick is voicing. Universal fallback shape
        // is preserved for any genre not in the table.
        const treatment = getFinalBarTreatment(groove.genreFeel);
        if (isDownbeat) {
            // Beat 1 of the final bar: fire the resolution gesture per-lane.
            if (inst.name === 'Open') {
                // why: Open lane carries the per-genre accent — universal
                // 'Crash', Jazz/Bossa/Blues 'Ride' (refined swell), Metal
                // 'China' (signature metal trash accent). Velocity
                // sourced from the treatment so Jazz lands softer (1.20)
                // and Hip Hop lands heavier (1.30), with universal default
                // 1.25 — all kept below the synth ceiling 1.4 so they
                // don't clip.
                currentState.shouldPlay = true;
                currentState.soundName = treatment.openSound;
                currentState.velocity = treatment.openVelocity;
            } else if (inst.name === 'Kick') {
                // why: reinforced kick on the final downbeat — universal
                // 1.3; Hip Hop / Metal / Shred bump to 1.4 for trap stinger
                // / double-kick weight.
                currentState.shouldPlay = true;
                currentState.velocity = treatment.kickVelocity;
            } else if (inst.name === 'Snare') {
                // why: a punctuation snare on the final downbeat (a real
                // drummer would not skip the backbeat-arrival accent). 1.15 —
                // strong but below the kick/crash so the swell remains the
                // dominant gesture. Jazz/Bossa/Blues/Reggae route to
                // 'Sidestick' to honor brushwork / dub rim aesthetics on
                // the cadence arrival.
                currentState.shouldPlay = true;
                currentState.soundName = treatment.snareSound;
                currentState.velocity = 1.15;
            } else if (inst.name === 'HiHat' && !HAT_SPINE_GENRES.has(groove.genreFeel)) {
                // why: suppress the closed-hat on beat 1 — the Open Crash is
                // what we want ringing through the bar. Closed hat overlay
                // would clutter the swell. Gated per-genre (Epic 12 S6 B6):
                // in 8th-note-hat genres (HAT_SPINE_GENRES) the hat is part of
                // the spine, so silencing it reads as an abrupt drop-out
                // rather than a swell-breathing decision.
                currentState.shouldPlay = false;
            }
        } else {
            // After beat 1: silence Open (the Crash's tail rings on its own)
            // and the HiHat in sparse-hat genres. In HAT_SPINE_GENRES we let
            // the hat ticker continue through the final bar (Epic 12 S6 B6) —
            // chopping it for a swell that doesn't fit the genre would read
            // as the band dropping out, not as a cadence gesture.
            //
            // why (Epic 12 S11): per-genre flourish first — Country/Acoustic
            // add a Sidestick rim hit on beats 2/3/4 for the rolling-tag
            // idiom. The flourish takes precedence over the Open/HiHat
            // suppression because it operates on the Snare lane only.
            const flourish = treatment.flourish?.(inst.name ?? '', loopStep);
            if (flourish !== null && flourish !== undefined) {
                currentState.shouldPlay = flourish.shouldPlay;
                if (flourish.velocity !== undefined) {
                    currentState.velocity = flourish.velocity;
                }
                if (flourish.soundName !== undefined) {
                    currentState.soundName = flourish.soundName;
                }
            } else if (inst.name === 'Open') {
                currentState.shouldPlay = false;
            } else if (inst.name === 'HiHat' && !HAT_SPINE_GENRES.has(groove.genreFeel)) {
                currentState.shouldPlay = false;
            }
            // Snare/Kick: let the strategy/entropy decide as usual (when no
            // per-genre flourish applies) — a real drummer might add a
            // backbeat or a kick echo on beat 3 of the final bar. We don't
            // actively suppress those.
        }
    }

    if (currentState.shouldPlay && !inst.muted) {
        if (inst.name === 'HiHat' || inst.name === 'Open') {
            currentState.velocity *= pulseWeight;
        }

        if (inst.name === 'Snare' && isBackbeat && config.backbeatCrack) {
            currentState.velocity *= 1.15;
        }

        const jitterAmount = inst.name === 'Kick' ? 0.04 : 0.08;
        // why: seed by (step, full instrument name hash) so each instrument's
        // jitter is independent but reproducible. Folding the full string is
        // required because charCodeAt(0) alone collides on real lane pairs:
        // Clave/Conga (C), HiHat/HighTom (H), Snare/Shaker (S) — see S5 review P1.
        // djb2 ×31-from-0 (stringHash31) — preserves this site's prior output.
        const nameHash = stringHash31(inst.name ?? '');
        const humanSeed = step * 41 + nameHash * 7;
        currentState.velocity = humanizeVelocity(currentState.velocity, humanSeed, jitterAmount);
    }

    return currentState;
}

export function calculateStepDuration(step: number, bpm: number, ts: any, groove: any): number {
    // BPM is quarter-notes/min for every meter, so one step (a 16th) is
    // (60/bpm)/4 in all meters; swing below is applied per stepsPerBeat.
    const stepSec = secondsPerStepFor(bpm);
    let duration = stepSec;

    if (groove.swing > 0) {
        if (ts.stepsPerBeat === 4) {
            const shift = (stepSec / 3) * (groove.swing / 100);
            if (groove.swingSub === '16th') {
                duration += step % 2 === 0 ? shift : -shift;
            } else {
                // 8th note swing logic: Weighted 'Loping' distribution across 4 subdivisions
                const subIndex = step % ts.stepsPerBeat;
                const weights = [1.5, 0.5, -0.5, -1.5];
                duration += shift * weights[subIndex];
            }
        } else if (ts.stepsPerBeat === 3) {
            const shift = (stepSec / 3) * (groove.swing / 100);
            duration +=
                groove.swingSub === '16th'
                    ? step % 2 === 0
                        ? shift
                        : -shift // 16th note swing over compound meters doesn't map exactly to '8th note' logic the same way
                    : step % ts.stepsPerBeat === 0
                      ? shift // on macro beat
                      : step % ts.stepsPerBeat === 2
                        ? -shift // 3rd triplet part
                        : 0; // middle triplet stays same or slightly nudged based on deeper logic, simple offset for now
        }
    }

    return duration;
}

export function getDrumMotif(
    seed: number,
    genreFeel: string,
    complexity: number,
    intensity = 1.0,
): number {
    const mockGroove = { genreFeel };
    const strategy = getStrategy(mockGroove);
    if (strategy?.getMotif) {
        return strategy.getMotif(seed, complexity, intensity);
    }
    return 0;
}
