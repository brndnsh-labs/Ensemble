import { describe, expect, it, vi } from 'vitest';
import { groove } from '../../../public/state/groove.js';
import { soloist } from '../../../public/state/instruments.js';
import { writeDeclaredParam } from '../../../public/state/set-param.js';

describe('writeDeclaredParam (#1633)', () => {
    it('sees a deepSignal slice field as an own key, including one that starts null', () => {
        expect(Object.hasOwn(soloist, 'tradeChoruses')).toBe(true);
        expect(Object.hasOwn(soloist, 'audio')).toBe(true);
        expect(Object.hasOwn(groove, 'lastHatGain')).toBe(true);
        expect(groove.lastHatGain).toBeNull();
        expect(Object.hasOwn(groove, 'noSuchField')).toBe(false);
        // The prototype chain is not a field.
        expect(Object.hasOwn(groove, 'constructor')).toBe(false);
    });

    it('writes a declared field and drops (with a warning) an undeclared one', () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect(writeDeclaredParam(soloist, 'soloist', 'tradeBars', 8)).toBe(true);
        expect(soloist.tradeBars).toBe(8);
        expect(writeDeclaredParam(soloist, 'soloist', 'constructor', 1)).toBe(false);
        expect(writeDeclaredParam(soloist, 'soloist', 'preset', 1)).toBe(false);
        expect(Object.hasOwn(soloist, 'preset')).toBe(false);
        expect(warn).toHaveBeenCalledTimes(2);
        warn.mockRestore();
    });
});
