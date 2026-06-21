import { afterEach, describe, expect, it } from 'vitest';
import {
    __resetPackCacheForTest,
    clearPack,
    getPackBuffer,
    hydrateVoice,
    isPackLoaded,
    packIdFromVoice,
    registerPackBuffer,
    resolveInstrumentSource,
} from '../../../public/engine/instrument-registry.js';
import type { InstrumentVoice } from '../../../public/types.js';

// The registry never inspects the buffer's contents — a sentinel object is a
// sufficient stand-in for a decoded AudioBuffer in this environment.
const fakeBuffer = (): AudioBuffer => ({}) as AudioBuffer;

afterEach(() => {
    __resetPackCacheForTest();
});

describe('instrument-registry — packIdFromVoice', () => {
    it('returns null for the synth A/B voices', () => {
        expect(packIdFromVoice('current')).toBeNull();
        expect(packIdFromVoice('new')).toBeNull();
    });

    it('extracts the id from a pack voice', () => {
        expect(packIdFromVoice('pack:grand')).toBe('grand');
        expect(packIdFromVoice('pack:acoustic-cymbals')).toBe('acoustic-cymbals');
    });

    it('rejects an empty pack id', () => {
        expect(packIdFromVoice('pack:' as `pack:${string}`)).toBeNull();
    });

    it('tolerates a missing/non-string voice (partial state) → null → synth', () => {
        // Synth tests and older saved sessions can hand the entry points a
        // state with no `voice`; the old ternary tolerated it and so must this.
        expect(packIdFromVoice(undefined as unknown as InstrumentVoice)).toBeNull();
        expect(resolveInstrumentSource(undefined as unknown as InstrumentVoice)).toEqual({
            kind: 'synth',
        });
    });
});

describe('instrument-registry — resolveInstrumentSource (bit-identical fallback)', () => {
    it('resolves synth voices to the synth source', () => {
        expect(resolveInstrumentSource('current')).toEqual({ kind: 'synth' });
        expect(resolveInstrumentSource('new')).toEqual({ kind: 'synth' });
    });

    it('falls back to synth for a pack voice whose buffers are NOT loaded', () => {
        // The S1 guarantee: with no pack installed every voice is synth, so
        // output is bit-identical to pre-Epic-6.
        expect(resolveInstrumentSource('pack:grand')).toEqual({ kind: 'synth' });
    });

    it('resolves to the sample source once the pack has buffers', () => {
        registerPackBuffer('grand', 'A4', fakeBuffer());
        expect(resolveInstrumentSource('pack:grand')).toEqual({ kind: 'sample', packId: 'grand' });
    });

    it('keeps a synth voice on synth even while some other pack is loaded', () => {
        registerPackBuffer('grand', 'A4', fakeBuffer());
        expect(resolveInstrumentSource('current')).toEqual({ kind: 'synth' });
        expect(resolveInstrumentSource('new')).toEqual({ kind: 'synth' });
    });
});

describe('instrument-registry — pack buffer cache', () => {
    it('reports a pack loaded only once it holds at least one buffer', () => {
        expect(isPackLoaded('grand')).toBe(false);
        registerPackBuffer('grand', 'A4', fakeBuffer());
        expect(isPackLoaded('grand')).toBe(true);
    });

    it('stores and retrieves buffers by pack + zone key', () => {
        const buf = fakeBuffer();
        registerPackBuffer('grand', 'C4', buf);
        expect(getPackBuffer('grand', 'C4')).toBe(buf);
        expect(getPackBuffer('grand', 'missing')).toBeNull();
        expect(getPackBuffer('other', 'C4')).toBeNull();
    });

    it('clearPack evicts a pack and reverts resolution to synth', () => {
        registerPackBuffer('grand', 'A4', fakeBuffer());
        expect(resolveInstrumentSource('pack:grand')).toEqual({ kind: 'sample', packId: 'grand' });
        clearPack('grand');
        expect(isPackLoaded('grand')).toBe(false);
        expect(resolveInstrumentSource('pack:grand')).toEqual({ kind: 'synth' });
    });
});

describe('instrument-registry — hydrateVoice', () => {
    it('keeps the synth A/B voices as-is', () => {
        expect(hydrateVoice('new')).toBe('new');
        expect(hydrateVoice('current')).toBe('current');
    });

    it('preserves a pack selection across reloads', () => {
        expect(hydrateVoice('pack:grand')).toBe('pack:grand');
    });

    it('collapses an empty/garbage pack value and non-strings to current', () => {
        expect(hydrateVoice('pack:')).toBe('current');
        expect(hydrateVoice('bogus')).toBe('current');
        expect(hydrateVoice(undefined)).toBe('current');
        expect(hydrateVoice(null)).toBe('current');
        expect(hydrateVoice(42)).toBe('current');
    });
});
