import { describe, expect, it } from 'vitest';
import { buildAuditionLink } from '../../scripts/audition-link.js';

const scene = {
    id: 'jazz-ride',
    label: 'Jazz Ride',
    genreFeel: 'Jazz',
    bpm: 138,
    intensity: 0.64,
    key: 'C',
    sections: [{ value: 'Dm7 | G7 | Cmaj7 | Cmaj7' }],
};

describe('buildAuditionLink', () => {
    it('emits the scene as URL params with autoplay enabled by default', () => {
        const url = buildAuditionLink(scene, {
            scene: 'jazz-ride',
            seed: null,
            baseUrl: 'http://localhost:5173/',
            autoplay: true,
        });

        const parsed = new URL(url);
        expect(parsed.searchParams.get('prog')).toBe('Dm7 | G7 | Cmaj7 | Cmaj7');
        expect(parsed.searchParams.get('key')).toBe('C');
        expect(parsed.searchParams.get('bpm')).toBe('138');
        expect(parsed.searchParams.get('genre')).toBe('Jazz');
        expect(parsed.searchParams.get('int')).toBe('0.64');
        expect(parsed.searchParams.get('autoplay')).toBe('1');
        expect(parsed.searchParams.get('seed')).toBeNull();
    });

    it('includes the seed when provided', () => {
        const url = buildAuditionLink(scene, {
            scene: 'jazz-ride',
            seed: 'ALPHA',
            baseUrl: 'http://localhost:5173/',
            autoplay: true,
        });
        expect(new URL(url).searchParams.get('seed')).toBe('ALPHA');
    });

    it('omits autoplay when disabled', () => {
        const url = buildAuditionLink(scene, {
            scene: 'jazz-ride',
            seed: null,
            baseUrl: 'http://localhost:5173/',
            autoplay: false,
        });
        expect(new URL(url).searchParams.get('autoplay')).toBeNull();
    });

    it('appends a trailing slash to base URLs that lack one', () => {
        const url = buildAuditionLink(scene, {
            scene: 'jazz-ride',
            seed: null,
            baseUrl: 'http://example.com/app',
            autoplay: true,
        });
        expect(url.startsWith('http://example.com/app/?')).toBe(true);
    });
});
