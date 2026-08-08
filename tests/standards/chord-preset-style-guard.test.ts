import { describe, expect, it } from 'vitest';
import { CHORD_PRESETS } from '../../public/data/chord-presets.js';
import { isKnownChordStyle } from '../../public/data/instrument-styles.js';

// #940 — every chord preset's `settings.style` must be a live chord-style keyspace
// value (`isKnownChordStyle`, see instrument-styles.ts). `PresetLibrary.tsx`
// dispatches `settings.style` straight into `ACTIONS.SET_STYLE` when "Apply preset
// settings" is on, and every `chords.style === 'smart'` gate in `comping-emit.ts`
// falls through silently on an unknown value — applying such a preset doesn't
// select a style, it turns smart comping OFF. Eight presets shipped with dead
// values (arpeggio/skank/rock/blues/neo/bossa) that never matched any live key;
// this guard pins the fix and keeps a future preset from reintroducing one.
//
// The guard covers every preset, including the two that fall through to
// `DEFAULT_SETTINGS.style` — the sentinel itself must be a live id for the same
// reason (it merges into `settings.style` and dispatches on apply).
describe('Chord preset style guard (#940)', () => {
    it('every preset resolves settings.style to a known chord style', () => {
        expect(CHORD_PRESETS.length).toBeGreaterThan(0);

        for (const preset of CHORD_PRESETS) {
            const style = preset.settings?.style;
            expect(
                isKnownChordStyle(style),
                `Preset "${preset.name}" has settings.style="${style}", which is not a known chord style`,
            ).toBe(true);
        }
    });
});
