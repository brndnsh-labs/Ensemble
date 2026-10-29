import { ENHARMONIC_MAP, KEY_ORDER } from './config.js';

/**
 * utils.ts — shared musical/math primitives, DOM- and Web-Audio-free.
 *
 * What belongs here: pitch/frequency conversion (`getFrequency`, `getMidi`)
 * and key-name normalization (`normalizeKey`) — the things every
 * lane's generator needs.
 *
 * What does NOT belong here (#1179 split): seeded RNG/hashing lives in
 * `engine/hash-utils.ts`; dangerous-character stripping and display glyph formatting live in
 * `sanitize.ts`; Web Audio graph helpers live in `engine/audio-graph-utils.ts`.
 * Anything DOM-touching would break the node-side callers (tests, scripts, the band) — keep it out.
 */

/**
 * Clamps a value into the unit interval [0, 1].
 *
 * The canonical clamp for the repo's 0..1 scalars (velocity, intensity,
 * normalized envelope positions). Written as nested ternaries rather than
 * `Math.max(0, Math.min(1, x))` so it stays allocation- and call-free on the
 * per-note hot paths that use it (soloist velocity shaping, drum voices).
 *
 * Edge cases: `NaN` passes through unchanged (as it does for the `Math.*`
 * form); `-0` is returned as `-0` rather than being normalized to `+0`.
 *
 * NOTE: the per-sample loop in `engine/wav-encoder.ts` deliberately keeps its
 * clamp inlined — don't route it through here.
 */
export function clamp01(x: number): number {
    return Math.min(1, Math.max(0, x));
}

/**
 * Normalizes a note name (e.g., C# to Db) based on the project's map.
 *
 * `Object.hasOwn`, not `MAP[k] || k` (#1132): `ENHARMONIC_MAP` is a plain literal, so
 * `MAP['constructor']` is the `Object` constructor — a truthy hit that broke the `string`
 * return contract for any caller handed an untrusted key.
 */
export function normalizeKey(k: string): string {
    return Object.hasOwn(ENHARMONIC_MAP, k) ? (ENHARMONIC_MAP as Record<string, string>)[k] : k;
}

/**
 * Transposes a note-name key by semitones using the app's normalized spelling policy.
 */
export function transposeKeyName(key: string, semitoneShift: number): string {
    const normalized = normalizeKey(key);
    const currentIndex = KEY_ORDER.indexOf(normalized);
    if (currentIndex === -1) {
        return normalized;
    }
    return KEY_ORDER[(((currentIndex + semitoneShift) % 12) + 12) % 12];
}

/**
 * Semitones up from one key to another, counted on `KEY_ORDER`'s all-flat spelling. A chart may
 * carry a sharp spelling the key picker does not list (`F#` from an iReal import), so both ends
 * are normalized first: looked up raw, `F#` is index -1 and every shift comes out a semitone
 * wrong. An unknown key moves nothing rather than moving by a wrong amount.
 */
export function keyDistance(from: string, to: string): number {
    const start = KEY_ORDER.indexOf(normalizeKey(from));
    const end = KEY_ORDER.indexOf(normalizeKey(to));
    return start === -1 || end === -1 ? 0 : end - start;
}

// Pre-calculate frequencies for standard MIDI range (0-127) to avoid expensive Math.pow calls
const FREQUENCY_CACHE = new Float32Array(128);
for (let i = 0; i < 128; i++) {
    FREQUENCY_CACHE[i] = 440 * 2 ** ((i - 69) / 12);
}

/**
 * Converts a MIDI note number to a frequency in Hertz.
 */
export function getFrequency(midi: number): number {
    // Fast path: lookup from cache if within 0-127 and integer
    const freq = FREQUENCY_CACHE[midi];
    if (freq !== undefined) {
        return freq;
    }

    // Slow path: calculate for extended range or microtonal values
    return 440 * 2 ** ((midi - 69) / 12);
}

/**
 * Converts a frequency in Hertz to a MIDI note number.
 */
export function getMidi(freq: number): number | null {
    if (!freq || freq <= 0 || !Number.isFinite(freq)) {
        return null;
    }
    return Math.round(12 * Math.log2(freq / 440) + 69);
}

// safeDisconnect / createSoftClipCurve / clampFreq live in
// `core/engine/audio-graph-utils.ts` — they are Web Audio graph helpers, not
// part of this DOM/audio-free shared-primitives module. They went to
// `synth-utils.ts` first (#1176) to sit beside their peers, but that formed an
// import cycle with `sample-voice.ts`, so #1192 split them into a leaf module.

// stripDangerousChars lives in
// `core/sanitize.ts` — DOM-adjacent display concerns, main-thread only, moved
// out in #1179 so nothing DOM-shaped can drift back into this DOM-free module.
//
// createPRNG lives in `core/engine/hash-utils.ts` beside its `stringHash33`
// fold and the other determinism primitives (#1179).

// calculateTimingOffset (the gravity-era pocket formula: globalDrive / tightness /
// per-instrument gravity) removed in #1063 — post-#714 its output was added to the
// drum grid AND every melodic lane equally, a uniform whole-band shift that is
// inaudible by construction. (The old engine's `getBandPocket` lean is gone too;
// the band's lean is in `band/feel/`.) See docs/design/timing-model.md §2/§4.

// applyBluesBends (the blues/neo ±0.5 gospel b3/b5 vocal scoop) removed in
// epic #10/#866 — its only caller was the retired legacy picker. The old
// phrase-first engine (since deleted) used an integer `bendStartInterval` flurry
// around the apex, not this per-blue-note microtonal scoop. The gospel-scoop idiom
// was a tracked #870 PORT CANDIDATE (recoverable from git history).
