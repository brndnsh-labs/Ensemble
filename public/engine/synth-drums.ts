import type { GrooveState } from '../state/groove.js';
import type { EnsembleState, Mutable } from '../types.js';
import { safeDisconnect } from '../utils.js';
import {
    createSimplePanner,
    duckGain,
    playPercussiveStrike,
    playResonantTone,
    rampGain,
    updateDensityDucking,
} from './synth-utils.js';

type CymbalName = 'HiHat' | 'Open' | 'Ride' | 'Crash' | 'China';

interface CymbalBufferProfile {
    key: string;
    duration: number;
    baseFreq: number;
    partials: number[];
    metalMix: number;
    noiseMix: number;
    transientMix: number;
    partialDecay: number;
    partialSpread: number;
    noiseDecay: number;
    smooth: number;
    saturation: number;
    jitter: number;
}

interface CymbalRuntimeProfile {
    volumeScale: number;
    playbackRate: number;
    playbackVariance: number;
    bandpassBase: number;
    bandpassVelocity: number;
    bandpassCap: number;
    highpassBase: number;
    highpassVelocity: number;
    highpassCap: number;
    q: number;
    attack: number;
    decayDelay: number;
    decayBase: number;
    decayVelocityFocus: number;
    decayIntensityFocus: number;
    minDecay: number;
    stopTime: number;
    pingFreq?: number;
    pingVolume?: number;
}

interface TomVoiceProfile {
    baseFreq: number;
    stickRatioBase: number;
    stickRatioVelocity: number;
    stickVolume: number;
    skinFreqMultiplier: number;
    skinVolume: number;
    skinQ: number;
    bodyStartRatio: number;
    bodyVolume: number;
    bodyDecay: number;
    bodyDuration: number;
    shellVolume: number;
    shellDecay: number;
    shellDuration: number;
    shellAttack: number;
}

interface CymbalVoiceConfig {
    volumeScale: number;
    playbackRate: number;
    playbackVariance: number;
    q: number;
    attack: number;
    decayDelay: number;
    decayTime: number;
    stopTime: number;
    bandpassFreq: number;
    highpassFreq: number;
    pingFreq?: number;
    pingVolume?: number;
}

interface KickVoiceConfig {
    beaterFreq: number;
    beaterEndFreq: number;
    beaterVolume: number;
    beaterDecay: number;
    skinVolume: number;
    skinFreq: number;
    knockStartFreq: number;
    knockEndFreq: number;
    knockVolume: number;
    knockDecay: number;
    shellFreq: number;
    shellVolume: number;
    shellDecay: number;
    shellDuration: number;
}

interface SnareVoiceConfig {
    lowBodyFreq: number;
    highBodyFreq: number;
    lowBodyVolume: number;
    highBodyVolume: number;
    bodyDecay: number;
    wiresVolume: number;
    wiresFreq: number;
    wiresQ: number;
    wiresDecay: number;
    wiresDuration: number;
    crackFreq: number;
    crackEndFreq: number;
    crackVolume: number;
    crackDecay: number;
}

type TomRegister = 'High' | 'Mid' | 'Low';

interface TomVoiceConfig {
    register: TomRegister;
    baseFreq: number;
    stickFreqStart: number;
    stickFreqEnd: number;
    stickVolume: number;
    skinVolume: number;
    skinFreq: number;
    skinQ: number;
    bodyFreqStart: number;
    bodyFreqEnd: number;
    bodyVolume: number;
    bodyDecay: number;
    bodyDuration: number;
    shellFreq: number;
    shellVolume: number;
    shellDecay: number;
    shellDuration: number;
    shellAttack: number;
}

interface DrumMixState {
    recentHits: number;
    densityDuck: number;
    lastTick: number;
}

const RIGHT_PANNED_INSTRUMENTS = new Set([
    'HiHat',
    'Open',
    'Crash',
    'China',
    'Shaker',
    'Agogo',
    'Perc',
    'Guiro',
    'Clave',
    // why: cowbell typically sits to the drummer's right alongside the agogo/shaker bed;
    // matching that placement keeps the disco "Octave Cowbells" out of the kick/snare center.
    'CowbellHigh',
    'CowbellLow',
]);

/**
 * Registry of every soundName the synth-drums dispatcher knows how to render.
 * If a groove writes a soundName not in this set, we warn once per name per session
 * — surfaces typos and stub voices without spamming the console or throwing.
 * Keep this in sync with the if/else chain in `playDrumSound`.
 */
const KNOWN_SOUND_NAMES = new Set<string>([
    'Kick',
    'Snare',
    'Sidestick',
    'HiHat',
    'Open',
    'Ride',
    'Crash',
    'China',
    'Clave',
    'Guiro',
    'Shaker',
    'Perc',
    'AgogoHigh',
    'AgogoLow',
    'Agogo',
    'CowbellHigh',
    'CowbellLow',
    'Cowbell',
    'Brush',
    // why: no-space tom variants are inert — every fill template emits the
    // space-form (`'High Tom'`/`'Mid Tom'`/`'Low Tom'`). The
    // `name.includes('Tom')` substring exemption in `maybeWarnUnknownSound`
    // also catches the space-form, so the no-space entries added literally
    // nothing to the warning suppression. Removed to keep the registry honest.
    // Conga / Bongo families — handled by `name.startsWith('Conga'|'Bongo')`.
    // why: S8(d) — suffix-first (`<Root><Variant>`), matching Agogo/Cowbell
    // above and DRUM_MAP / DISPATCHER_FAMILIES. The three layers now agree.
    'CongaHigh',
    'CongaLow',
    'CongaOpen',
    'CongaMute',
    'CongaSlap',
    'Conga',
    'BongoHigh',
    'BongoLow',
    'Bongo',
]);

const warnedUnknownSounds = new Set<string>();

// why: enumerate the exact suffix vocabulary that each per-family dispatcher
// branch in `playDrum` actually recognizes. Substring matching like
// `name.startsWith('Cowbell')` was too lax — a typo like `'CowbellMid'` would
// be exempt from the warning AND would silently render as the low-bias variant
// because the dispatcher's `isHigh = (name === 'CowbellHigh')` check returns
// false. Listing the legal suffixes here makes typos warn loudly while
// preserving the exemption for canonical names. Each entry is a tuple of
// `{ root, suffixes, spacedForm }`:
//   - `root` matches both the bare name (`'Cowbell'`) and `<root><suffix>`.
//   - `suffixes` are the exact dispatcher-recognized variants.
//   - `spacedForm` allows the `'<Suffix> <Root>'` emission style used by Toms
//     (live grooves emit `'High Tom'`, which the dispatcher matches via
//     `name.includes('Tom')`).
const DISPATCHER_FAMILIES: ReadonlyArray<{
    root: string;
    suffixes: readonly string[];
    spacedForm?: boolean;
}> = [
    { root: 'Tom', suffixes: ['High', 'Mid', 'Low'], spacedForm: true },
    { root: 'Conga', suffixes: ['High', 'Low', 'Open', 'Mute', 'Slap'] },
    { root: 'Bongo', suffixes: ['High', 'Low'] },
    { root: 'Agogo', suffixes: ['High', 'Low'] },
    { root: 'Cowbell', suffixes: ['High', 'Low'] },
];

function isDispatcherRecognizedFamilyName(name: string): boolean {
    for (const { root, suffixes, spacedForm } of DISPATCHER_FAMILIES) {
        if (name === root) {
            return true;
        }
        for (const sfx of suffixes) {
            if (name === root + sfx) {
                return true;
            }
            if (spacedForm && name === `${sfx} ${root}`) {
                return true;
            }
        }
    }
    return false;
}

/**
 * Emit a single console.warn for any unknown drum soundName. Once per name
 * per session — drummer engines should never crash playback, just degrade.
 * Family names (Tom/Conga/Bongo/Agogo/Cowbell) are exempted only for the
 * exact suffix variants the dispatcher actually renders (see
 * `DISPATCHER_FAMILIES` above); typos like `'CowbellMid'` will warn.
 */
function maybeWarnUnknownSound(name: string): void {
    if (KNOWN_SOUND_NAMES.has(name) || isDispatcherRecognizedFamilyName(name)) {
        return;
    }
    if (warnedUnknownSounds.has(name)) {
        return;
    }
    warnedUnknownSounds.add(name);
    // eslint-disable-next-line no-console
    console.warn(`[synth-drums] unknown soundName "${name}" — no audio voice will play.`);
}

/** Test hook: clears the "already warned" registry so each test sees fresh warnings. */
export function _resetUnknownSoundWarnings(): void {
    warnedUnknownSounds.clear();
}

export { KNOWN_SOUND_NAMES };

const TAU = Math.PI * 2;

const CYMBAL_BUFFER_PROFILES: Record<CymbalName, CymbalBufferProfile> = {
    HiHat: {
        key: 'hihatMetal',
        duration: 0.6,
        baseFreq: 2050,
        partials: [1, 1.29, 1.67, 2.18, 2.86, 3.62],
        metalMix: 0.61,
        noiseMix: 0.17,
        transientMix: 0.18,
        partialDecay: 14,
        partialSpread: 4.2,
        noiseDecay: 22,
        smooth: 0.17,
        saturation: 1.18,
        jitter: 0.018,
    },
    Open: {
        key: 'openHatMetal',
        duration: 3.0,
        baseFreq: 1700,
        partials: [1, 1.24, 1.63, 2.09, 2.71, 3.32, 4.07],
        metalMix: 0.54,
        noiseMix: 0.17,
        transientMix: 0.13,
        partialDecay: 4.2,
        partialSpread: 1.2,
        noiseDecay: 7.0,
        smooth: 0.16,
        saturation: 1.12,
        jitter: 0.016,
    },
    Ride: {
        key: 'rideMetal',
        duration: 4.4,
        baseFreq: 1120,
        partials: [1, 1.19, 1.49, 1.98, 2.57, 3.19, 3.89],
        metalMix: 0.48,
        noiseMix: 0.14,
        transientMix: 0.09,
        partialDecay: 2.0,
        partialSpread: 0.8,
        noiseDecay: 4.6,
        smooth: 0.19,
        saturation: 1.03,
        jitter: 0.02,
    },
    Crash: {
        key: 'crashMetal',
        duration: 9.0,
        baseFreq: 860,
        partials: [1, 1.34, 1.79, 2.27, 2.96, 3.56, 4.23, 5.02],
        metalMix: 0.38,
        noiseMix: 0.28,
        transientMix: 0.22,
        partialDecay: 0.8,
        partialSpread: 0.5,
        noiseDecay: 1.0,
        smooth: 0.22,
        saturation: 0.98,
        jitter: 0.024,
    },
    China: {
        // why: trashier, darker sibling to Crash (drums.md P1 #6). Higher baseFreq (1100 vs
        // 860) gives upper-mid bite; more inharmonic partials (wider ratios than Crash,
        // around the trash-china reference timbre). Duration 5.0s (vs Crash 9.0s) —
        // the China "trash" lives in the attack + noise sweep, not the long metallic tail.
        // partialDecay 1.6 (vs Crash 0.8) chokes partials twice as fast so by t≈2.5s the
        // noiseMix dominates — that's the splash-bark character. Higher noiseMix (0.42) and
        // transientMix (0.30) push the noise/transient layers forward vs the metal partials.
        key: 'chinaMetal',
        duration: 5.0,
        baseFreq: 1100,
        partials: [1, 1.41, 1.93, 2.51, 3.17, 3.94, 4.83],
        metalMix: 0.32,
        noiseMix: 0.42,
        transientMix: 0.3,
        partialDecay: 1.6,
        partialSpread: 0.9,
        noiseDecay: 1.4,
        smooth: 0.18,
        saturation: 1.05,
        jitter: 0.03,
    },
};

const CYMBAL_RUNTIME_PROFILES: Record<CymbalName, CymbalRuntimeProfile> = {
    HiHat: {
        volumeScale: 0.69,
        playbackRate: 1.0,
        playbackVariance: 0.022,
        bandpassBase: 6500,
        bandpassVelocity: 520,
        bandpassCap: 7600,
        highpassBase: 3600,
        highpassVelocity: 220,
        highpassCap: 4200,
        q: 0.85,
        attack: 0.0015,
        decayDelay: 0.006,
        decayBase: 0.058,
        decayVelocityFocus: 0.01,
        decayIntensityFocus: 0.006,
        minDecay: 0.041,
        stopTime: 0.46,
    },
    Open: {
        volumeScale: 0.62,
        playbackRate: 1.0,
        playbackVariance: 0.02,
        bandpassBase: 5150,
        bandpassVelocity: 380,
        bandpassCap: 5900,
        highpassBase: 2700,
        highpassVelocity: 160,
        highpassCap: 3150,
        q: 0.72,
        attack: 0.01,
        decayDelay: 0.07,
        decayBase: 0.62,
        decayVelocityFocus: 0.06,
        decayIntensityFocus: 0.03,
        minDecay: 0.42,
        stopTime: 3.1,
    },
    Ride: {
        volumeScale: 0.74,
        playbackRate: 1.0,
        playbackVariance: 0.015,
        bandpassBase: 4300,
        bandpassVelocity: 340,
        bandpassCap: 5200,
        highpassBase: 2100,
        highpassVelocity: 130,
        highpassCap: 2550,
        q: 0.46,
        attack: 0.004,
        decayDelay: 0.1,
        decayBase: 1.55,
        decayVelocityFocus: 0.08,
        decayIntensityFocus: 0.04,
        minDecay: 1.1,
        stopTime: 4.8,
        pingFreq: 1580,
        pingVolume: 0.05,
    },
    Crash: {
        volumeScale: 0.9,
        playbackRate: 1.0,
        playbackVariance: 0.02,
        bandpassBase: 3500,
        bandpassVelocity: 260,
        bandpassCap: 4300,
        highpassBase: 1450,
        highpassVelocity: 100,
        highpassCap: 1750,
        q: 0.45,
        attack: 0.004,
        decayDelay: 0.16,
        decayBase: 3.5,
        decayVelocityFocus: 0.08,
        decayIntensityFocus: 0.05,
        minDecay: 2.8,
        stopTime: 9.0,
    },
    China: {
        // why: China filter shaping (drums.md P1 #6). bandpassBase 4200 / highpassBase 1900
        // sit ~700 Hz above Crash — keeps the trashy upper-mid bite and removes the deep
        // boom that Crash has. q 0.55 (vs Crash 0.45) is nasal and bright. decayBase 0.95s
        // and stopTime 2.4s — China is a fast, bark-like accent cymbal; the "trash" is in
        // the attack, not the sustain (matches reference trash chinas at ~2-3s ring-out).
        // volumeScale 0.85 trims slightly under Crash (0.9) to avoid clipping
        // when it stacks with the steady-state Open/Ride pulse on metal section downbeats.
        volumeScale: 0.85,
        playbackRate: 1.0,
        playbackVariance: 0.022,
        bandpassBase: 4200,
        bandpassVelocity: 300,
        bandpassCap: 5100,
        highpassBase: 1900,
        highpassVelocity: 120,
        highpassCap: 2300,
        q: 0.55,
        attack: 0.004,
        decayDelay: 0.08,
        decayBase: 0.95,
        decayVelocityFocus: 0.06,
        decayIntensityFocus: 0.04,
        minDecay: 0.7,
        stopTime: 2.4,
    },
};

const TOM_VOICE_PROFILES: Record<TomRegister, TomVoiceProfile> = {
    High: {
        baseFreq: 188,
        stickRatioBase: 4.1,
        stickRatioVelocity: 1.7,
        stickVolume: 0.34,
        skinFreqMultiplier: 11.5,
        skinVolume: 0.18,
        skinQ: 1.45,
        bodyStartRatio: 1.24,
        bodyVolume: 0.96,
        bodyDecay: 0.11,
        bodyDuration: 0.42,
        shellVolume: 0.58,
        shellDecay: 0.24,
        shellDuration: 1.0,
        shellAttack: 0.006,
    },
    Mid: {
        baseFreq: 140,
        stickRatioBase: 3.5,
        stickRatioVelocity: 1.5,
        stickVolume: 0.36,
        skinFreqMultiplier: 9.5,
        skinVolume: 0.2,
        skinQ: 1.35,
        bodyStartRatio: 1.2,
        bodyVolume: 1.04,
        bodyDecay: 0.16,
        bodyDuration: 0.56,
        shellVolume: 0.74,
        shellDecay: 0.36,
        shellDuration: 1.3,
        shellAttack: 0.008,
    },
    Low: {
        baseFreq: 94,
        stickRatioBase: 2.9,
        stickRatioVelocity: 1.3,
        stickVolume: 0.38,
        skinFreqMultiplier: 7.8,
        skinVolume: 0.24,
        skinQ: 1.2,
        bodyStartRatio: 1.16,
        bodyVolume: 1.14,
        bodyDecay: 0.22,
        bodyDuration: 0.7,
        shellVolume: 0.9,
        shellDecay: 0.52,
        shellDuration: 1.75,
        shellAttack: 0.012,
    },
};

function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
}

function getCymbalBuffer(groove: GrooveState, name: CymbalName): AudioBuffer | null {
    const profile = CYMBAL_BUFFER_PROFILES[name];
    return profile ? groove.audioBuffers[profile.key] || null : null;
}

function ensureCymbalBuffer(
    audioCtx: AudioContext,
    groove: GrooveState,
    name: CymbalName,
): AudioBuffer {
    const profile = CYMBAL_BUFFER_PROFILES[name];
    if (!profile) {
        return groove.audioBuffers.noise;
    }
    if (!groove.audioBuffers[profile.key]) {
        groove.audioBuffers[profile.key] = createMetallicBuffer(audioCtx, profile);
    }
    return groove.audioBuffers[profile.key];
}

function getBandLayerCount(state: EnsembleState): number {
    let layers = 0;
    if ((state as any).bass?.enabled) {
        layers++;
    }
    if ((state as any).chords?.enabled) {
        layers++;
    }
    if ((state as any).harmony?.enabled) {
        layers++;
    }
    if ((state as any).soloist?.enabled) {
        layers++;
    }
    return layers;
}

/**
 * Keep cymbals supportive when the full arrangement is active.
 */
export function getCymbalMixScale(state: EnsembleState, name: CymbalName): number {
    const bandIntensity = clamp01((state.playback as any)?.bandIntensity ?? 0.5);
    const crowding = getBandLayerCount(state) / 4;
    const genreFeel = (state.groove as any)?.genreFeel;
    const instrumentBase =
        name === 'HiHat' ? 0.96 : name === 'Ride' ? 0.92 : name === 'Open' ? 0.82 : 0.95;
    const intensityTrim = 1 - Math.max(0, bandIntensity - 0.6) * 0.18;
    const crowdingTrim =
        1 -
        crowding *
            (name === 'HiHat' ? 0.05 : name === 'Ride' ? 0.09 : name === 'Open' ? 0.16 : 0.14);
    const genreBoost = name === 'Ride' && genreFeel === 'Jazz' ? 1.03 : 1;

    return Math.max(0.55, instrumentBase * intensityTrim * crowdingTrim * genreBoost);
}

/**
 * Keep the snare present as the backbeat anchor, with a small lift for rock/blues.
 */
export function getSnareMixScale(state: EnsembleState, velocity: number): number {
    const bandIntensity = clamp01((state.playback as any)?.bandIntensity ?? 0.5);
    const genreFeel = (state.groove as any)?.genreFeel;
    const genreBoost =
        genreFeel === 'Rock' || genreFeel === 'Blues' ? 1.06 : genreFeel === 'Jazz' ? 1.03 : 1;
    const intensityLift = 1 + Math.max(0, bandIntensity - 0.55) * 0.04;
    const velocityLift = 1 + Math.max(0, velocity - 0.9) * 0.08;

    return Math.max(0.94, genreBoost * intensityLift * velocityLift);
}

/**
 * Keep the rhythm section's low-mid body a touch more forward in Blues/Jazz without
 * inflating cymbal presence.
 */
export function getRhythmBodyMixScale(state: EnsembleState, name: string): number {
    const genreFeel = (state.groove as any)?.genreFeel;

    if (name === 'Kick') {
        return genreFeel === 'Jazz' ? 1.05 : genreFeel === 'Blues' ? 1.04 : 1;
    }

    if (name.includes('Tom')) {
        return genreFeel === 'Jazz' ? 1.04 : genreFeel === 'Blues' ? 1.03 : 1;
    }

    return 1;
}

/**
 * Runtime cymbal shaping keeps high-intensity hits focused instead of simply brighter/longer.
 */
export function getCymbalVoiceConfig(
    name: CymbalName,
    velocity: number,
    bandIntensity = 0.5,
): CymbalVoiceConfig | null {
    const base = CYMBAL_RUNTIME_PROFILES[name];
    if (!base) {
        return null;
    }

    const intensity = clamp01(bandIntensity);
    const vel = Math.max(0.3, velocity);
    const brightnessGuard = 1 - Math.max(0, vel - 1.0) * 0.1 - Math.max(0, intensity - 0.8) * 0.08;
    const brightness = Math.max(0.76, brightnessGuard);
    const openBarkAmount = name === 'Open' ? 1 - clamp01((vel - 0.62) / 0.1) : 0;
    const baseDecayTime = Math.max(
        base.minDecay,
        base.decayBase -
            Math.max(0, vel - 0.95) * base.decayVelocityFocus -
            Math.max(0, intensity - 0.75) * base.decayIntensityFocus,
    );

    return {
        ...base,
        attack: Math.max(0.004, base.attack - openBarkAmount * 0.003),
        decayTime: Math.max(base.minDecay, baseDecayTime - openBarkAmount * 0.12),
        stopTime: Math.max(base.minDecay, base.stopTime - openBarkAmount * 0.08),
        bandpassFreq: Math.min(
            base.bandpassCap,
            (base.bandpassBase + vel * base.bandpassVelocity + openBarkAmount * 140) * brightness,
        ),
        highpassFreq: Math.min(
            base.highpassCap,
            (base.highpassBase + vel * base.highpassVelocity + openBarkAmount * 90) * brightness,
        ),
        q: base.q + openBarkAmount * 0.08,
    };
}

/**
 * Keep the kick centered on body/punch while trimming overly clicky top-end in dense sections.
 */
export function getKickVoiceConfig(velocity: number, bandIntensity = 0.5): KickVoiceConfig {
    const vel = clamp01(Math.max(0.2, velocity));
    const intensity = clamp01(bandIntensity);
    const denseMix = Math.max(0, intensity - 0.6);
    const beaterFocus = 1 - denseMix * 0.28;

    return {
        beaterFreq: Math.max(1700, (2150 + vel * 950) * beaterFocus),
        beaterEndFreq: 520 + vel * 70,
        beaterVolume: Math.max(0.24, 0.3 + vel * 0.06 - denseMix * 0.08),
        beaterDecay: 0.0025 + vel * 0.0015,
        skinVolume: 0.12 + vel * 0.06,
        skinFreq: Math.max(650, 820 + vel * 260 - denseMix * 160),
        knockStartFreq: 150 + vel * 24,
        knockEndFreq: 54 + vel * 4,
        knockVolume: 1.12 + vel * 0.16,
        knockDecay: 0.035 + vel * 0.012,
        shellFreq: 48 + vel * 4,
        shellVolume: 0.94 + denseMix * 0.12 + vel * 0.04,
        shellDecay: 0.09 + denseMix * 0.03 + vel * 0.02,
        shellDuration: 0.55 + denseMix * 0.12,
    };
}

/**
 * Strong snare hits should crack and bloom; ghost notes should stay short and papery.
 */
export function getSnareVoiceConfig(velocity: number): SnareVoiceConfig {
    const vel = clamp01(Math.max(0.1, velocity));
    const accent = clamp01((vel - 0.55) / 0.35);
    const ghost = 1 - clamp01((vel - 0.35) / 0.45);

    return {
        lowBodyFreq: 182 + accent * 10,
        highBodyFreq: 318 + accent * 28,
        lowBodyVolume: 0.16 + vel * 0.08 + accent * 0.04,
        highBodyVolume: 0.14 + vel * 0.06 + accent * 0.03,
        bodyDecay: 0.038 + accent * 0.022,
        wiresVolume: 0.62 + vel * 0.34 + accent * 0.08,
        wiresFreq: 1350 + vel * 280 + accent * 620,
        wiresQ: 1.0 + accent * 0.18,
        wiresDecay: 0.045 + accent * 0.03 - ghost * 0.012,
        wiresDuration: 0.24 + accent * 0.22 - ghost * 0.08,
        crackFreq: 2200 + accent * 950,
        crackEndFreq: 1500 + accent * 260,
        crackVolume: 0.02 + accent * 0.18,
        crackDecay: 0.006 + accent * 0.008,
    };
}

/**
 * Toms should separate more clearly by shell size, pitch drop, and sustain.
 */
export function getTomVoiceConfig(name: string, velocity: number): TomVoiceConfig {
    const register: TomRegister = name.includes('High')
        ? 'High'
        : name.includes('Mid')
          ? 'Mid'
          : 'Low';
    const base = TOM_VOICE_PROFILES[register];
    const vel = clamp01(Math.max(0.2, velocity));

    return {
        register,
        baseFreq: base.baseFreq,
        stickFreqStart: base.baseFreq * (base.stickRatioBase + vel * base.stickRatioVelocity),
        stickFreqEnd: base.baseFreq * (register === 'Low' ? 1.08 : register === 'Mid' ? 1.1 : 1.12),
        stickVolume: base.stickVolume + vel * 0.04,
        skinVolume: base.skinVolume * vel,
        skinFreq: base.baseFreq * base.skinFreqMultiplier,
        skinQ: base.skinQ,
        bodyFreqStart: base.baseFreq * base.bodyStartRatio,
        bodyFreqEnd: base.baseFreq,
        bodyVolume: base.bodyVolume + vel * 0.08,
        bodyDecay: base.bodyDecay + vel * 0.03,
        bodyDuration: base.bodyDuration,
        shellFreq: base.baseFreq * 0.98,
        shellVolume: base.shellVolume + vel * 0.06,
        shellDecay: base.shellDecay + vel * 0.04,
        shellDuration: base.shellDuration,
        shellAttack: base.shellAttack,
    };
}

/**
 * Stop any currently decaying drum sounds (specifically hat/ride).
 * @param state - Global ensemble state.
 */
export function killDrumNote(state: EnsembleState): void {
    const { playback, groove } = state;
    if (!playback.audio) {
        return;
    }
    if (groove.lastHatGain) {
        rampGain(groove.lastHatGain.gain, 0, playback.audio.currentTime, 0.005);
        (groove as Mutable<typeof groove>).lastHatGain = null; // @direct-mutation
    }
    if (groove.lastRideGain) {
        rampGain(groove.lastRideGain.gain, 0, playback.audio.currentTime, 0.05);
        (groove as Mutable<typeof groove>).lastRideGain = null; // @direct-mutation
    }
    if (groove.lastCrashGain) {
        rampGain(groove.lastCrashGain.gain, 0, playback.audio.currentTime, 0.12);
        (groove as Mutable<typeof groove>).lastCrashGain = null; // @direct-mutation
    }
}

// Internal mix state for density-aware normalization
const mixState: DrumMixState = {
    recentHits: 0,
    densityDuck: 1.0,
    lastTick: 0,
};

/**
 * Drum synthesis engine.
 * @param state - Global ensemble state.
 * @param name - Drum instrument name.
 * @param time - Start time in seconds.
 * @param velocity - Note velocity (0.0 - 1.0).
 */
export function playDrumSound(
    state: EnsembleState,
    name: string,
    time: number,
    velocity = 1.0,
): void {
    const { playback, groove } = state;
    if (!name || !playback.audio) {
        return;
    }
    // why: surface engine typos / stub soundNames as a one-shot warning instead of silent
    // audio dropouts (root cause of `drums.md` P0 #3 Cowbell going to a dead lane for months).
    maybeWarnUnknownSound(name);
    const now = playback.audio.currentTime;

    // --- Density Normalization Logic ---
    const densityDuck = updateDensityDucking(mixState, now, 18, 0.015);

    // Add a tiny 2ms buffer to ensure scheduling always happens slightly in the future
    const playTime = Math.max(time, now + 0.002);
    const humanizeFactor = (groove.humanize || 0) / 100;
    const velJitter = 1.0 + (Math.random() - 0.5) * (humanizeFactor * 0.4);

    // Apply the density ducking factor to the master drum volume
    const masterVol = velocity * 1.3 * velJitter * densityDuck;

    // --- Mix Separation: Stereo Panning ---
    let panValue = 0;
    if (RIGHT_PANNED_INSTRUMENTS.has(name)) {
        panValue = 0.35;
    } else if (name === 'Snare' || name === 'Sidestick' || name === 'Brush') {
        // why: Brush is the low-intensity jazz substitute for the snare/sidestick
        // and occupies the same physical drum, so it shares their slight-left
        // placement. Without this it would fall through to center (0) and the
        // Brush->Sidestick swap at the intensity boundary would jump the pan.
        panValue = -0.1;
    } else if (name.includes('Tom') || name.includes('Conga') || name.includes('Bongo')) {
        panValue = (Math.random() * 2 - 1) * 0.25;
    }
    const panner = createSimplePanner(playback.audio, panValue, playTime);
    if ((playback as any).drumsGain) {
        panner.connect((playback as any).drumsGain);
    }

    // Round-robin variation (±1.5%)
    const rr = (amt = 0.03) => 1 + (Math.random() - 0.5) * amt;

    if (name === 'Kick') {
        const voiceConfig = getKickVoiceConfig(velocity, (playback as any).bandIntensity || 0.5);
        const vol = masterVol * getRhythmBodyMixScale(state, 'Kick') * rr();

        // --- Sidechain Trigger ---
        if ((playback as any).bassSidechain) {
            duckGain((playback as any).bassSidechain.gain, 0.45, playTime, 0.005, 0.12);
        }

        // 1. Beater Snap: Higher velocity = Sharper snap
        const beater = playback.audio.createOscillator();
        const beaterGain = playback.audio.createGain();
        beaterGain.gain.setValueAtTime(0, playTime);
        beater.type = 'sine';
        const snapFreq = voiceConfig.beaterFreq * rr();
        beater.frequency.setValueAtTime(snapFreq, playTime);
        beater.frequency.exponentialRampToValueAtTime(voiceConfig.beaterEndFreq, playTime + 0.006);
        beaterGain.gain.setTargetAtTime(vol * voiceConfig.beaterVolume, playTime, 0.001);
        beaterGain.gain.setTargetAtTime(0, playTime + 0.004, voiceConfig.beaterDecay);

        // 2. Head "Skin": Higher velocity = More high-frequency noise
        playPercussiveStrike(playback.audio, groove.audioBuffers.noise, panner, playTime, {
            volume: vol * voiceConfig.skinVolume,
            filterType: 'bandpass',
            freq: voiceConfig.skinFreq * rr(0.02),
            Q: 0.9,
            attack: 0.0015,
            decay: 0.012,
            duration: 0.12,
        });

        // 3. The "Knock": Fundamental impact
        playResonantTone(playback.audio, panner, playTime, {
            type: 'triangle',
            freqStart: voiceConfig.knockStartFreq * rr(0.01),
            freqEnd: voiceConfig.knockEndFreq,
            rampDuration: 0.02,
            volume: vol * voiceConfig.knockVolume,
            attack: 0.001,
            decay: voiceConfig.knockDecay,
            duration: 0.24,
        });

        // 4. The "Shell": Deep resonance
        playResonantTone(playback.audio, panner, playTime, {
            type: 'sine',
            freqStart: voiceConfig.shellFreq * rr(0.01),
            freqEnd: voiceConfig.shellFreq * rr(0.006),
            volume: vol * voiceConfig.shellVolume,
            attack: 0.003,
            decay: voiceConfig.shellDecay,
            duration: voiceConfig.shellDuration,
        });

        // 5. Click: 2–4kHz presence peak that cuts through on small speakers/earbuds
        playPercussiveStrike(playback.audio, groove.audioBuffers.noise, panner, playTime, {
            volume: vol * 0.25,
            filterType: 'bandpass',
            freq: 2500 + velocity * 800,
            Q: 4,
            attack: 0.0003,
            decay: 0.008,
            duration: 0.05,
        });

        // Connections
        beater.connect(beaterGain);
        beaterGain.connect(panner);

        beater.start(playTime);
        beater.stop(playTime + 0.1);

        beater.onended = () => safeDisconnect([beater, beaterGain]);
    } else if (name === 'Snare' || name === 'Sidestick') {
        const isSidestick = name === 'Sidestick';
        const vol =
            masterVol * getSnareMixScale(state, velocity) * rr() * (isSidestick ? 0.8 : 1.0);

        if (isSidestick) {
            playResonantTone(playback.audio, panner, playTime, {
                type: 'sine',
                freqStart: 6500 * rr(),
                volume: vol * 0.4,
                attack: 0.001,
                decay: 0.005,
                duration: 0.1,
            });

            playResonantTone(playback.audio, panner, playTime, {
                type: 'triangle',
                freqStart: 330 * rr(),
                freqEnd: 330 * rr() * 0.9,
                rampDuration: 0.1,
                volume: vol * 0.8,
                attack: 0.002,
                decay: 0.04,
                duration: 0.5,
            });

            playPercussiveStrike(playback.audio, groove.audioBuffers.noise, panner, playTime, {
                volume: vol * 0.35,
                filterType: 'highpass',
                freq: 3500,
                attack: 0.002,
                decay: 0.02,
                duration: 0.5,
            });

            return;
        }
        const voiceConfig = getSnareVoiceConfig(velocity);

        playResonantTone(playback.audio, panner, playTime, {
            type: 'triangle',
            freqStart: voiceConfig.lowBodyFreq * rr(0.015),
            freqEnd: voiceConfig.lowBodyFreq * 0.9,
            rampDuration: 0.05,
            volume: vol * voiceConfig.lowBodyVolume,
            attack: 0.001,
            decay: voiceConfig.bodyDecay,
            duration: 0.45,
        });

        playResonantTone(playback.audio, panner, playTime, {
            type: 'sine',
            freqStart: voiceConfig.highBodyFreq * rr(0.015),
            freqEnd: voiceConfig.highBodyFreq * 0.88,
            rampDuration: 0.04,
            volume: vol * voiceConfig.highBodyVolume,
            attack: 0.001,
            decay: voiceConfig.bodyDecay * 0.9,
            duration: 0.4,
        });

        if (voiceConfig.crackVolume > 0.03) {
            playResonantTone(playback.audio, panner, playTime, {
                type: 'triangle',
                freqStart: voiceConfig.crackFreq * rr(0.02),
                freqEnd: voiceConfig.crackEndFreq,
                rampDuration: 0.015,
                volume: vol * voiceConfig.crackVolume,
                attack: 0.0008,
                decay: voiceConfig.crackDecay,
                duration: 0.12,
            });
        }

        playPercussiveStrike(playback.audio, groove.audioBuffers.noise, panner, playTime, {
            volume: vol * voiceConfig.wiresVolume,
            filterType: 'bandpass',
            freq: voiceConfig.wiresFreq * rr(0.02),
            Q: voiceConfig.wiresQ,
            attack: 0.0008,
            decay: voiceConfig.wiresDecay,
            duration: voiceConfig.wiresDuration,
        });
    } else if (name === 'HiHat' || name === 'Open' || name === 'Ride') {
        const isRide = name === 'Ride';
        const isClosedHat = name === 'HiHat';
        const voiceConfig = getCymbalVoiceConfig(
            name,
            velocity,
            (playback as any).bandIntensity || 0.5,
        );
        if (!voiceConfig) {
            safeDisconnect([panner]);
            return;
        }
        const hatArticulation = isClosedHat ? 0.985 + Math.random() * 0.035 : 1;
        const hatDecayMult = isClosedHat ? 0.92 + Math.random() * 0.18 : 1;
        const hatStopMult = isClosedHat ? 0.96 + Math.random() * 0.08 : 1;
        const vol =
            masterVol *
            voiceConfig.volumeScale *
            getCymbalMixScale(state, name) *
            (isClosedHat ? 0.95 + Math.random() * 0.03 : 1) *
            rr();

        if (isRide) {
            if (groove.lastRideGain) {
                rampGain(groove.lastRideGain.gain, 0, playTime, 0.05);
            }
        } else if (groove.lastHatGain) {
            rampGain(groove.lastHatGain.gain, 0, playTime, isClosedHat ? 0.008 : 0.005);
        }

        const source = playback.audio.createBufferSource();
        source.buffer =
            getCymbalBuffer(groove, name) || ensureCymbalBuffer(playback.audio, groove, name);
        source.playbackRate.value =
            voiceConfig.playbackRate * hatArticulation * rr(voiceConfig.playbackVariance);

        const bpFilter = playback.audio.createBiquadFilter();
        bpFilter.type = 'bandpass';
        const bpAttackMult = isRide ? 1.14 : isClosedHat ? 1.06 + Math.random() * 0.08 : 1.1;
        const bpSustainTarget = isRide ? voiceConfig.bandpassFreq * 0.96 : voiceConfig.bandpassFreq;
        bpFilter.frequency.setValueAtTime(voiceConfig.bandpassFreq * bpAttackMult, playTime);
        bpFilter.frequency.setTargetAtTime(
            bpSustainTarget * (isClosedHat ? 0.98 + Math.random() * 0.04 : 1),
            playTime + 0.008,
            isRide ? 0.08 : name === 'Open' ? 0.05 : 0.02,
        );
        bpFilter.Q.value = isClosedHat
            ? voiceConfig.q * (0.92 + Math.random() * 0.22)
            : voiceConfig.q;

        const hpFilter = playback.audio.createBiquadFilter();
        hpFilter.type = 'highpass';
        const hpAttackMult = isRide ? 1.1 : isClosedHat ? 1.03 + Math.random() * 0.09 : 1.04;
        const hpSustainTarget = isClosedHat
            ? voiceConfig.highpassFreq * 0.97
            : voiceConfig.highpassFreq * 0.95;
        hpFilter.frequency.setValueAtTime(voiceConfig.highpassFreq * hpAttackMult, playTime);
        hpFilter.frequency.setTargetAtTime(
            hpSustainTarget * (isClosedHat ? 0.98 + Math.random() * 0.03 : 1),
            playTime + 0.008,
            isRide ? 0.1 : name === 'Open' ? 0.06 : 0.025,
        );

        const gain = playback.audio.createGain();
        gain.gain.setValueAtTime(0, playTime);
        gain.gain.setTargetAtTime(vol, playTime, voiceConfig.attack);
        gain.gain.setTargetAtTime(
            0,
            playTime + voiceConfig.decayDelay * (isClosedHat ? 0.95 + Math.random() * 0.2 : 1),
            voiceConfig.decayTime * hatDecayMult,
        );

        if (isRide) {
            (groove as Mutable<typeof groove>).lastRideGain = gain; // @direct-mutation
        } else {
            (groove as Mutable<typeof groove>).lastHatGain = gain; // @direct-mutation
        }

        source.connect(bpFilter);
        bpFilter.connect(hpFilter);
        hpFilter.connect(gain);
        gain.connect(panner);

        if (isRide && velocity > 0.92 && voiceConfig.pingFreq && voiceConfig.pingVolume) {
            playResonantTone(playback.audio, panner, playTime, {
                type: 'triangle',
                freqStart: voiceConfig.pingFreq * rr(0.02),
                freqEnd: voiceConfig.pingFreq * 0.84,
                rampDuration: 0.01,
                volume: vol * voiceConfig.pingVolume,
                attack: 0.0008,
                decay: 0.01,
                duration: 0.08,
            });
        }

        // Sizzle: thin 2–4kHz presence layer that sits under the bright buffer to add
        // metallic cut through dense mixes. Closed hat only — open/ride have their own character.
        if (isClosedHat) {
            playPercussiveStrike(playback.audio, groove.audioBuffers.noise, panner, playTime, {
                volume: vol * 0.12,
                filterType: 'bandpass',
                freq: 3200 + Math.random() * 400,
                Q: 1.2,
                attack: 0.001,
                decay: 0.04,
                duration: 0.06,
            });
        }

        source.start(playTime);
        source.stop(playTime + voiceConfig.stopTime * hatStopMult);

        source.onended = () => {
            if (isRide) {
                if (groove.lastRideGain === gain) {
                    (groove as Mutable<typeof groove>).lastRideGain = null; // @direct-mutation
                }
            } else if (groove.lastHatGain === gain) {
                (groove as Mutable<typeof groove>).lastHatGain = null; // @direct-mutation
            }
            safeDisconnect([source, bpFilter, hpFilter, gain, panner]);
        };
    } else if (name === 'Crash' || name === 'China') {
        // why: China shares the Crash dispatch — same buffer-source + bandpass/highpass chain,
        // parameterized by CymbalName. China gets its own buffer key ('chinaMetal') and its
        // own runtime profile (filter cutoffs, decay, stop time). Both voices flow through
        // groove.lastCrashGain so a fresh China at section accent ramps down any prior
        // Crash/China tail — same crash-lane behavior as before, just two voices in the lane.
        const cymbalName: CymbalName = name;
        const voiceConfig = getCymbalVoiceConfig(
            cymbalName,
            velocity,
            (playback as any).bandIntensity || 0.5,
        );
        if (!voiceConfig) {
            safeDisconnect([panner]);
            return;
        }
        const vol =
            masterVol * voiceConfig.volumeScale * getCymbalMixScale(state, cymbalName) * rr();

        if (groove.lastHatGain) {
            rampGain(groove.lastHatGain.gain, 0, playTime, 0.04);
            (groove as Mutable<typeof groove>).lastHatGain = null; // @direct-mutation
        }
        if (groove.lastRideGain) {
            rampGain(groove.lastRideGain.gain, 0, playTime, 0.12);
            (groove as Mutable<typeof groove>).lastRideGain = null; // @direct-mutation
        }
        if (groove.lastCrashGain) {
            rampGain(groove.lastCrashGain.gain, 0, playTime, 0.18);
        }

        const source = playback.audio.createBufferSource();
        source.buffer =
            getCymbalBuffer(groove, cymbalName) ||
            ensureCymbalBuffer(playback.audio, groove, cymbalName);
        source.playbackRate.value = voiceConfig.playbackRate * rr(voiceConfig.playbackVariance);

        const bpFilter = playback.audio.createBiquadFilter();
        bpFilter.type = 'bandpass';
        bpFilter.frequency.setValueAtTime(voiceConfig.bandpassFreq * 1.12, playTime);
        bpFilter.frequency.setTargetAtTime(voiceConfig.bandpassFreq * 0.96, playTime + 0.01, 0.12);
        bpFilter.Q.value = voiceConfig.q;

        const hpFilter = playback.audio.createBiquadFilter();
        hpFilter.type = 'highpass';
        hpFilter.frequency.setValueAtTime(voiceConfig.highpassFreq * 1.08, playTime);
        hpFilter.frequency.setTargetAtTime(voiceConfig.highpassFreq * 0.94, playTime + 0.012, 0.16);

        const gain = playback.audio.createGain();
        gain.gain.setValueAtTime(0, playTime);
        gain.gain.linearRampToValueAtTime(vol, playTime + voiceConfig.attack);
        // Slightly higher sustain floor (0.42 vs old 0.35) gives the crash body room to bloom
        // before the long tail takes over. tc 0.06 keeps the transient crisp.
        gain.gain.setTargetAtTime(vol * 0.42, playTime + 0.015, 0.06);
        gain.gain.setTargetAtTime(0, playTime + voiceConfig.decayDelay, voiceConfig.decayTime);
        (groove as Mutable<typeof groove>).lastCrashGain = gain; // @direct-mutation

        source.connect(bpFilter);
        bpFilter.connect(hpFilter);
        hpFilter.connect(gain);
        gain.connect(panner);

        source.start(playTime);
        source.stop(playTime + voiceConfig.stopTime);

        source.onended = () => {
            if (groove.lastCrashGain === gain) {
                (groove as Mutable<typeof groove>).lastCrashGain = null; // @direct-mutation
            }
            safeDisconnect([source, bpFilter, hpFilter, gain, panner]);
        };
    } else if (name === 'Clave') {
        const vol = masterVol * 0.7 * rr();
        playResonantTone(playback.audio, panner, playTime, {
            type: 'sine',
            freqStart: 2450 * rr(0.01),
            volume: vol,
            attack: 0.0005,
            decay: 0.008,
            duration: 0.1,
        });

        playPercussiveStrike(playback.audio, groove.audioBuffers.noise, panner, playTime, {
            volume: vol * 0.4,
            filterType: 'highpass',
            freq: 5000,
            Q: 0.5,
            attack: 0.0005,
            decay: 0.003,
            duration: 0.1,
        });
    } else if (name.startsWith('Conga') || name.startsWith('Bongo')) {
        const isBongo = name.startsWith('Bongo');
        const isHigh = name.includes('High');
        const isSlap = name.includes('Slap');
        const isMute = name.includes('Mute');
        const baseFreq = isBongo ? (isHigh ? 420 : 280) : isHigh ? 210 : 155;
        const vol = masterVol * (isSlap ? 0.85 : 0.7) * rr();

        const decay = isMute ? 0.015 : isSlap ? 0.03 : 0.07;

        playResonantTone(playback.audio, panner, playTime, {
            type: isSlap ? 'triangle' : 'sine',
            freqStart: baseFreq * rr(0.01),
            freqEnd: baseFreq * 0.95,
            rampDuration: 0.05,
            volume: vol,
            attack: 0.002,
            decay: decay,
            duration: 0.3,
        });

        playPercussiveStrike(playback.audio, groove.audioBuffers.noise, panner, playTime, {
            volume: isSlap ? vol * 0.6 : vol * 0.25,
            filterType: 'bandpass',
            freq: isSlap ? 2500 : 800,
            Q: 1.0,
            attack: 0.001,
            decay: 0.015,
            duration: 0.3,
        });
    } else if (name.startsWith('Agogo') || name === 'Perc') {
        const isHigh = name.includes('High') || name === 'Perc';
        const vol = masterVol * 0.35 * rr();
        const freq = isHigh ? 1150 : 780;

        playResonantTone(playback.audio, panner, playTime, {
            type: 'sine',
            freqStart: freq * rr(0.005),
            volume: vol,
            attack: 0.001,
            decay: 0.12,
            duration: 0.5,
        });

        playResonantTone(playback.audio, panner, playTime, {
            type: 'triangle',
            freqStart: freq * 1.492 * rr(0.005),
            volume: vol * 0.5,
            attack: 0.001,
            decay: 0.12,
            duration: 0.5,
        });

        playResonantTone(playback.audio, panner, playTime, {
            type: 'sine',
            freqStart: freq,
            volume: vol * 0.5,
            attack: 0.002,
            decay: 0.04,
            duration: 0.5,
        });
    } else if (name === 'Guiro') {
        const vol = masterVol * 0.5 * rr();
        const noise = playback.audio.createBufferSource();
        noise.buffer = groove.audioBuffers.noise;
        noise.loop = true;
        const filter = playback.audio.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(2500, playTime);
        filter.Q.value = 1.0;
        const gain = playback.audio.createGain();
        gain.gain.setValueAtTime(0, playTime);

        for (let i = 0; i < 4; i++) {
            const t = playTime + i * 0.035;
            gain.gain.setTargetAtTime(vol * (0.6 + i * 0.1), t, 0.005);
            gain.gain.setTargetAtTime(0, t + 0.015, 0.01);
        }
        noise.connect(filter);
        filter.connect(gain);
        gain.connect(panner);
        noise.start(playTime);
        noise.stop(playTime + 0.2);
        noise.onended = () => safeDisconnect([noise, filter, gain, panner]);
    } else if (name === 'Shaker') {
        const vol = masterVol * 0.45 * rr();
        playPercussiveStrike(playback.audio, groove.audioBuffers.noise, panner, playTime, {
            volume: vol,
            filterType: 'highpass',
            freq: 6000,
            attack: 0.01,
            decay: 0.05,
            duration: 0.2,
        });
    } else if (name.includes('Tom')) {
        const voiceConfig = getTomVoiceConfig(name, velocity);
        const vol = masterVol * 0.8 * getRhythmBodyMixScale(state, name) * rr();

        // 1. Stick Impact (The "Thwack")
        playResonantTone(playback.audio, panner, playTime, {
            type: 'sine',
            freqStart: voiceConfig.stickFreqStart * rr(0.015),
            freqEnd: voiceConfig.stickFreqEnd,
            rampDuration: 0.015,
            volume: vol * voiceConfig.stickVolume,
            attack: 0.001,
            decay: 0.009,
            duration: 0.1,
        });

        // 2. Head "Skin" Noise
        playPercussiveStrike(playback.audio, groove.audioBuffers.noise, panner, playTime, {
            volume: vol * voiceConfig.skinVolume,
            filterType: 'bandpass',
            freq: voiceConfig.skinFreq,
            Q: voiceConfig.skinQ,
            attack: 0.002,
            decay: 0.02,
            duration: 0.2,
        });

        // 3. Resonant Body
        playResonantTone(playback.audio, panner, playTime, {
            type: 'triangle',
            freqStart: voiceConfig.bodyFreqStart * rr(0.01),
            freqEnd: voiceConfig.bodyFreqEnd,
            rampDuration: 0.05,
            volume: vol * voiceConfig.bodyVolume,
            attack: 0.002,
            decay: voiceConfig.bodyDecay,
            duration: voiceConfig.bodyDuration,
        });

        // 4. Shell Resonance
        playResonantTone(playback.audio, panner, playTime, {
            type: 'sine',
            freqStart: voiceConfig.shellFreq * rr(0.01),
            volume: vol * voiceConfig.shellVolume,
            attack: voiceConfig.shellAttack,
            decay: voiceConfig.shellDecay * rr(),
            duration: voiceConfig.shellDuration,
        });
    } else if (name.startsWith('Cowbell')) {
        // why: disco "Octave Cowbells" (drums.md P0 #3) need a real voice, not a fallback —
        // the Agogo branch is too sine-sweet for the LATIN PERCUSSION 56 timbre. The canonical
        // TR-808 cowbell is TWO oscillators sounding together at 540 Hz and 800 Hz — the
        // 540:800 ratio (≈1.48) IS the inharmonic "clang" that makes it read as cowbell rather
        // than tuned bell. High vs Low emphasizes one fundamental over the other, preserving
        // the octave-ish gesture without losing the clang of both frequencies firing together.
        const isHigh = name === 'CowbellHigh';
        const vol = masterVol * 0.42 * rr();
        const dominantVol = vol * 0.55;
        const accentVol = vol * 0.32;

        // 1. Lower body at 540 Hz — full volume on Low, trimmed on High.
        playResonantTone(playback.audio, panner, playTime, {
            type: 'triangle',
            freqStart: 540 * rr(0.008),
            volume: isHigh ? accentVol : dominantVol,
            attack: 0.0008,
            // why: shorter decay (0.04s) keeps envelope at <2% by t=0.18 — avoids the click
            // that 0.075s decay would produce when osc.stop fires while the body is still ~9%.
            decay: 0.04,
            duration: 0.18,
        });

        // 2. Upper body at 800 Hz — full volume on High, trimmed on Low. Together with the
        // 540 Hz partial these form the TR-808 dual-fundamental clang.
        playResonantTone(playback.audio, panner, playTime, {
            type: 'triangle',
            freqStart: 800 * rr(0.008),
            volume: isHigh ? dominantVol : accentVol,
            attack: 0.001,
            decay: 0.04,
            duration: 0.18,
        });

        // 3. Bandpass strike click — short noise burst centered at 3.2kHz delivers the
        // initial "tick" of the stick against the metal shell.
        playPercussiveStrike(playback.audio, groove.audioBuffers.noise, panner, playTime, {
            volume: vol * 0.28,
            filterType: 'bandpass',
            freq: 3200,
            Q: 2.0,
            attack: 0.0005,
            decay: 0.006,
            duration: 0.04,
        });
    } else if (name === 'Brush') {
        // why: jazz at intensity < 0.35 wants brushwork, not a sidestick (drums.md P1 #7).
        // A brush sweep is essentially a long pink/whitish noise burst with a slow attack
        // (the swish across the head) and a bandpass that sits around 1.5-2kHz to read as
        // wire-on-coated-snare rather than full-spectrum noise (which sounds like a hi-hat).
        const vol = masterVol * 0.55 * rr();

        // 1. The "swish" — the heart of the brush voice. A long, slow-attack
        // noise sweep voiced through a bandpass that glides DOWNWARD from
        // ~2.4kHz to ~1.4kHz. The descending centre frequency is the artistic
        // choice that sells the gesture: a real brush is brightest at the
        // moment of contact and darkens as the bristles fan out and lose speed
        // across the coated head. A static or rising filter would read as a
        // hi-hat tick; this gentle downward glide is what makes the ear hear a
        // hand sweeping a snare rather than a burst of noise.
        const noise = playback.audio.createBufferSource();
        noise.buffer = groove.audioBuffers.noise;
        noise.loop = true;
        const bp = playback.audio.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(2400, playTime);
        bp.frequency.linearRampToValueAtTime(1400, playTime + 0.18);
        bp.Q.value = 0.9;

        const hp = playback.audio.createBiquadFilter();
        hp.type = 'highpass';
        hp.frequency.setValueAtTime(450, playTime);

        const gain = playback.audio.createGain();
        gain.gain.setValueAtTime(0, playTime);
        // why: ~35ms attack is the canonical brush sweep onset — sub-30ms reads as a hat,
        // >60ms loses the rhythmic placement against the ride and feels late.
        gain.gain.linearRampToValueAtTime(vol, playTime + 0.035);
        // why: 0.18s sustain at floor then long tail — total ~0.35s gives the
        // wire-still-in-contact-with-head decay character without smearing into the next beat
        // at BPM<=130 (jazz ballad target).
        gain.gain.setTargetAtTime(vol * 0.4, playTime + 0.05, 0.08);
        gain.gain.setTargetAtTime(0, playTime + 0.2, 0.09);
        // why: setTargetAtTime decays asymptotically and never truly reaches 0,
        // so stopping the looping noise source at +0.45 with residual gain
        // produces an audible click. A fast (20ms) tail-cut starting at +0.4
        // drives the gain ~12x lower than the prior envelope (~6% -> ~0.5%
        // residual) before noise.stop fires — inaudible, though not literally 0.
        gain.gain.setTargetAtTime(0, playTime + 0.4, 0.02);

        noise.connect(hp);
        hp.connect(bp);
        bp.connect(gain);
        gain.connect(panner);

        noise.start(playTime);
        noise.stop(playTime + 0.45);
        noise.onended = () => safeDisconnect([noise, hp, bp, gain, panner]);

        // 2. Brush "tap" body — a brief sidestick-like body so the brush has rhythmic
        // articulation. Velocity-scaled so quiet hits stay pure-sweep texture.
        if (velocity > 0.35) {
            playResonantTone(playback.audio, panner, playTime, {
                type: 'sine',
                freqStart: 220,
                freqEnd: 180,
                rampDuration: 0.02,
                volume: vol * 0.18 * velocity,
                attack: 0.002,
                decay: 0.035,
                duration: 0.12,
            });
        }
    }
}

function createMetallicBuffer(audioCtx: AudioContext, profile: CymbalBufferProfile): AudioBuffer {
    const sampleRate = audioCtx.sampleRate;
    const requestedLength = Math.max(1, Math.floor(sampleRate * profile.duration));
    const buffer = audioCtx.createBuffer(1, requestedLength, sampleRate);
    const data = buffer.getChannelData(0);
    const phases = profile.partials.map((_, index) => Math.random() * TAU + index * 0.73);
    const detunes = profile.partials.map(() => 1 + (Math.random() - 0.5) * profile.jitter);
    const partialWeights = profile.partials.map(() => 0.7 + Math.random() * 0.45);
    const transientSamples = Math.max(1, Math.floor(sampleRate * 0.008));
    let smoothed = 0;

    for (let i = 0; i < data.length; i++) {
        const t = i / sampleRate;
        let metallic = 0;

        for (let p = 0; p < profile.partials.length; p++) {
            const partialEnv = Math.exp(-t * (profile.partialDecay + p * profile.partialSpread));
            metallic +=
                (Math.sin(
                    TAU * profile.baseFreq * profile.partials[p] * detunes[p] * t + phases[p],
                ) *
                    partialWeights[p] *
                    partialEnv) /
                (1 + p * 0.26);
        }

        const noiseEnv = Math.exp(-t * profile.noiseDecay);
        const noise = (Math.random() * 2 - 1) * profile.noiseMix * noiseEnv;
        const transient =
            i < transientSamples
                ? (1 - i / transientSamples) * profile.transientMix * (Math.random() * 2 - 1)
                : 0;
        const raw = (metallic / profile.partials.length) * profile.metalMix + noise + transient;
        smoothed = smoothed * profile.smooth + raw * (1 - profile.smooth);
        data[i] = Math.tanh(smoothed * profile.saturation);
    }

    return buffer;
}
