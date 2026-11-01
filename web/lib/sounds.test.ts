/**
 * What a sound download tells the musician, and how often an install may speak (#1985). Explicit
 * imports: the v2 build typechecks this file without the root config's Vitest globals.
 */
import { describe, expect, it } from 'vitest';
import { DOWNLOAD_FAILED, isNetworkFailure, quarterGate } from './sounds';

describe('isNetworkFailure', () => {
    it.each([
        ['Chromium', new TypeError('Failed to fetch')],
        ['WebKit', new TypeError('Load failed')],
        ['Firefox', new TypeError('NetworkError when attempting to fetch resource.')],
        ['a timed-out request', new DOMException('signal timed out', 'TimeoutError')],
    ])('maps %s to the plain sentence', (_browser, error) => {
        expect(isNetworkFailure(error)).toBe(true);
    });

    it('leaves the app’s own sentences and other errors alone', () => {
        expect(isNetworkFailure(new Error('Failed to fetch'))).toBe(false);
        expect(isNetworkFailure(new Error('Sound download could not be verified.'))).toBe(false);
        expect(isNetworkFailure(new TypeError('x is not a function'))).toBe(false);
        expect(isNetworkFailure(new DOMException('Storage full', 'QuotaExceededError'))).toBe(
            false,
        );
        expect(isNetworkFailure('Failed to fetch')).toBe(false);
    });

    it('says the sentence the issue asks for', () => {
        expect(DOWNLOAD_FAILED).toBe(
            "Couldn't download the sounds. Check your connection and try again.",
        );
    });
});

describe('quarterGate', () => {
    it('lets a 220-file install through at its start, then 25, 50 and 75%', () => {
        const said: string[] = [];
        const gate = quarterGate((text) => said.push(text));
        for (let done = 1; done <= 220; done++) {
            gate(`${done}/220`, done / 220);
        }
        expect(said).toEqual(['1/220', '55/220', '110/220', '165/220']);
    });

    it('says the opening line once, and not again for a later pack', () => {
        const said: string[] = [];
        const gate = quarterGate((text) => said.push(text));
        gate('Preparing A…', 0);
        gate('A', 0.1);
        gate('Preparing B…', 0.05);
        expect(said).toEqual(['Preparing A…']);
    });

    it('does not repeat a quarter when a later pack starts over', () => {
        const said: string[] = [];
        const gate = quarterGate((text) => said.push(text));
        gate('a', 0.8);
        gate('b', 0.1);
        gate('c', 0.6);
        expect(said).toEqual(['a']);
    });

    it('always passes a sentence with no fraction', () => {
        const said: string[] = [];
        const gate = quarterGate((text) => said.push(text));
        gate('Switching style at the next bar…');
        gate('Rendering mix…');
        expect(said).toHaveLength(2);
    });
});
