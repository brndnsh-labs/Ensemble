// @ts-nocheck
/**
 * @vitest-environment happy-dom
 *
 * Persistence round-trip reachability gate (#1127).
 *
 * The failure class this closes: `saveCurrentState()` (public/state/persistence.ts) and
 * the hydration restore in `public/state/state-hydration.ts` are two hand-maintained
 * parallel lists. They had already drifted into silent data discard — `metronome`
 * and `autoIntensity` are SAVED but hydration hardcodes them (metronome→false,
 * autoIntensity→true), throwing the saved values away. A missed restore is
 * invisible to every other gate.
 *
 * This test — modeled on tests/unit/engine/worker-sync-reachability.test.ts —
 * makes that drift loud:
 *
 *   PERSISTENCE_MANIFEST classifies each top-level key `saveCurrentState` emits as
 *     { restored: true }        — hydration reads it back into state, OR
 *     { resetOnLoad: '<reason>' } — deliberately NOT restored, with a documented
 *                                   reason (session-start default, version marker).
 *
 *   1. COMPLETENESS — every emitted key has a manifest entry, and no manifest
 *      entry is stale (references a key no longer emitted). A NEW persisted key
 *      with no manifest entry fails here: the author must classify it.
 *   2. ANNOTATION — every `resetOnLoad` entry carries a non-empty reason.
 *
 * Known limitation (documented, not a hole): classification is at TOP-LEVEL key
 * granularity — the nested instrument blocks (chords/bass/soloist/harmony/groove/
 * midi) are single `restored` entries, trusted to be restored field-by-field by
 * hydration's per-block code. Like worker-sync's `snapshotOnly` reasons, the
 * `restored` tag is trusted, not behaviorally driven. The drift that motivated
 * this story (metronome/autoIntensity) is top-level, which this catches.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

let captured: Record<string, unknown> | null = null;

// A state mock carrying every slice `saveCurrentState` reads, with the
// exact fields it reads — so the emitted payload has its full real key set.
const MOCK_STATE = {
    arranger: {
        sections: [],
        key: 'C',
        timeSignature: '4/4',
        isMinor: false,
        notation: 'auto',
        lastChordPreset: 'Pop (Standard)',
        seed: 'ABC123',
        randomizeSeed: true,
    },
    playback: {
        palette: 'after-hours',
        mode: 'auto',
        bpm: 100,
        metronome: false,
        visualFlash: false,
        qualityColors: true,
        countIn: true,
        applyPresetSettings: true,
        sessionTimer: 5,
        songMode: true,
        autoIntensity: true,
        practiceMode: true,
        masterVolume: 0.4,
    },
    chords: {},
    bass: {},
    soloist: {},
    harmony: {},
    groove: { instruments: [] },
    vizState: { enabled: false },
    midi: {},
};

vi.mock('../../../public/state.js', () => ({
    getState: () => MOCK_STATE,
    storage: {
        save: (_key: string, data: Record<string, unknown>) => {
            captured = data;
        },
    },
}));

import { saveCurrentState } from '../../../public/state/persistence.js';

/**
 * Every top-level key `saveCurrentState` emits, classified. Keep in lock-step
 * with the `data` object in persistence.ts — the COMPLETENESS test fails loudly
 * if they drift.
 */
const PERSISTENCE_MANIFEST: Record<string, { restored: true } | { resetOnLoad: string }> = {
    // --- Arranger ---
    sections: { restored: true },
    key: { restored: true },
    timeSignature: { restored: true },
    isMinor: { restored: true },
    notation: { restored: true },
    lastChordPreset: { restored: true },
    seed: { restored: true },
    randomizeSeed: { restored: true },
    // --- Playback / theme / preferences ---
    palette: { restored: true },
    mode: { restored: true },
    bpm: { restored: true },
    visualFlash: { restored: true },
    qualityColors: { restored: true },
    countIn: { restored: true },
    applyPresetSettings: { restored: true },
    sessionTimer: { restored: true },
    songMode: { restored: true },
    vizEnabled: { restored: true },
    practiceMode: { restored: true },
    masterVolume: { restored: true },
    // --- Deliberate reset-on-load exceptions (Brandon's call, #1127) ---
    metronome: {
        resetOnLoad:
            'always starts OFF on load — a saved-on metronome clicking unexpectedly at app open is worse than re-enabling it. Session-start default, not a bug.',
    },
    autoIntensity: {
        resetOnLoad:
            'always starts ON on load — auto band-intensity is the sensible default; a manual override is a per-session tweak. Session-start default, not a bug.',
    },
    mixerVersion: {
        resetOnLoad:
            'version marker, not restored as state — hydration consumes it only to decide shouldResetMixer (bump ⇒ drop saved mixer levels).',
    },
    // --- Nested instrument blocks (restored field-by-field by hydration) ---
    chords: { restored: true },
    bass: { restored: true },
    soloist: { restored: true },
    harmony: { restored: true },
    groove: { restored: true },
    midi: { restored: true },
};

describe('Persistence round-trip reachability (#1127)', () => {
    beforeEach(() => {
        captured = null;
        saveCurrentState();
    });

    it('classifies every emitted key and has no stale manifest entries (COMPLETENESS)', () => {
        expect(captured).not.toBeNull();
        const emitted = new Set(Object.keys(captured as Record<string, unknown>));
        const manifestKeys = new Set(Object.keys(PERSISTENCE_MANIFEST));

        const unclassified = [...emitted].filter((k) => !manifestKeys.has(k)).sort();
        const stale = [...manifestKeys].filter((k) => !emitted.has(k)).sort();

        // A new persisted key with no manifest entry lands in `unclassified` — the
        // author must classify it as restored or resetOnLoad (with a reason).
        expect(unclassified, `unclassified persisted keys: ${unclassified.join(', ')}`).toEqual([]);
        expect(stale, `stale manifest entries: ${stale.join(', ')}`).toEqual([]);
    });

    it('every reset-on-load exception carries a documented reason (ANNOTATION)', () => {
        for (const [key, entry] of Object.entries(PERSISTENCE_MANIFEST)) {
            if ('resetOnLoad' in entry) {
                expect(entry.resetOnLoad.length, `${key} reset-on-load reason`).toBeGreaterThan(20);
            }
        }
    });
});
