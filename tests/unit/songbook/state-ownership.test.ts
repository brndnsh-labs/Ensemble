import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
    LEGACY_PERSISTED_FIELD_OWNERSHIP,
    STATE_OWNERSHIP_MANIFEST,
} from '../../../public/songbook/state-ownership.js';

const { captured, mockState } = vi.hoisted(() => ({
    captured: { value: null as Record<string, unknown> | null },
    mockState: {
        arranger: {
            sections: [],
            key: 'C',
            timeSignature: '4/4',
            grouping: null,
            isMinor: false,
            notation: 'roman',
            lastChordPreset: 'Pop (Standard)',
            seed: 'ABC123',
            randomizeSeed: true,
        },
        playback: {
            rampBpmTarget: 0,
            bpm: 100,
            palette: 'after-hours',
            mode: 'auto',
            complexity: 0.3,
            metronome: false,
            visualFlash: false,
            qualityColors: true,
            countIn: true,
            applyPresetSettings: false,
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
        groove: { instruments: [], sectionSeedMap: {} },
        vizState: { enabled: false },
        midi: {},
    },
}));

vi.mock('../../../public/state.js', () => ({
    getState: () => mockState,
    storage: {
        save: (_key: string, value: Record<string, unknown>) => {
            captured.value = value;
        },
    },
}));

import { saveCurrentState } from '../../../public/state/persistence.js';

const NESTED_LEGACY_BLOCKS = new Set(['chords', 'bass', 'soloist', 'harmony', 'groove', 'midi']);

function emittedLegacyPaths(payload: Record<string, unknown>): string[] {
    const paths: string[] = [];
    for (const [key, value] of Object.entries(payload)) {
        if (NESTED_LEGACY_BLOCKS.has(key) && value && typeof value === 'object') {
            for (const nestedKey of Object.keys(value)) {
                paths.push(`${key}.${nestedKey}`);
            }
        } else {
            paths.push(key);
        }
    }
    return paths.sort();
}

describe('Songbook state ownership manifest (#1044)', () => {
    beforeEach(() => {
        captured.value = null;
        saveCurrentState();
    });

    it('classifies every field emitted by the untouched legacy writer with no stale entries', () => {
        expect(captured.value).not.toBeNull();
        const emitted = emittedLegacyPaths(captured.value as Record<string, unknown>);
        const classified = Object.keys(LEGACY_PERSISTED_FIELD_OWNERSHIP).sort();
        expect(classified).toEqual(emitted);
    });

    it('records the settled ownership decisions exactly once', () => {
        expect(STATE_OWNERSHIP_MANIFEST.arranger.notation).toBe('document');
        for (const lane of ['chords', 'bass', 'soloist', 'harmony', 'groove'] as const) {
            expect(STATE_OWNERSHIP_MANIFEST[lane].volume).toBe('document');
            expect(STATE_OWNERSHIP_MANIFEST[lane].reverb).toBe('document');
        }
        expect(STATE_OWNERSHIP_MANIFEST.playback.sessionTimer).toBe('preferences');
        expect(STATE_OWNERSHIP_MANIFEST.playback.songMode).toBe('preferences');
        expect(STATE_OWNERSHIP_MANIFEST.midi.chordsChannel).toBe('preferences');
        expect(STATE_OWNERSHIP_MANIFEST.midi.drumsChannel).toBe('preferences');
        expect(STATE_OWNERSHIP_MANIFEST.playback.bandIntensity).toBe('runtime-derived');
        expect(STATE_OWNERSHIP_MANIFEST.playback.autoIntensity).toBe('runtime-derived');
    });

    it('keeps derived maps, transport, buffers, audio handles, undo, and transient UI runtime-owned', () => {
        expect(STATE_OWNERSHIP_MANIFEST.arranger.progression).toBe('runtime-derived');
        expect(STATE_OWNERSHIP_MANIFEST.arranger.stepMap).toBe('runtime-derived');
        expect(STATE_OWNERSHIP_MANIFEST.arranger.history).toBe('runtime-derived');
        expect(STATE_OWNERSHIP_MANIFEST.playback.step).toBe('runtime-derived');
        expect(STATE_OWNERSHIP_MANIFEST.playback.loopStartStep).toBe('runtime-derived');
        expect(STATE_OWNERSHIP_MANIFEST.playback.audioGraph).toBe('runtime-derived');
        expect(STATE_OWNERSHIP_MANIFEST.playback.modals).toBe('runtime-derived');
        expect(STATE_OWNERSHIP_MANIFEST.groove.sectionSeedMap).toBe('runtime-derived');
        expect(STATE_OWNERSHIP_MANIFEST.groove.buffer).toBe('runtime-derived');
        expect(STATE_OWNERSHIP_MANIFEST.soloist.session).toBe('runtime-derived');
        expect(STATE_OWNERSHIP_MANIFEST.soloist.audio).toBe('runtime-derived');
    });
});
