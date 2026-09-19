import { describe, expect, it } from 'vitest';
import { decodeBase64Unicode } from '../../public/state/share-codec.js';
import { buildAuditionLink, runAuditionLink } from '../../scripts/audition-link.js';

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

describe('ad-hoc audition links', () => {
    const link = (...argv: string[]) => {
        let out = '';
        const write = process.stdout.write;
        process.stdout.write = ((chunk: string) => {
            out += chunk;
            return true;
        }) as typeof process.stdout.write;
        try {
            expect(runAuditionLink(argv)).toBe(0);
        } finally {
            process.stdout.write = write;
        }
        return new URL(out.trim());
    };
    const band = (url: URL) => JSON.parse(decodeBase64Unicode(url.searchParams.get('bnd') || ''));

    it('carries a progression with accidentals, a genre and an intensity', () => {
        const url = link('--prog=Cm7 | Cm7#5 | C+', '--genre=Jazz', '--int=0.8');
        expect(url.searchParams.get('prog')).toBe('Cm7 | Cm7#5 | C+');
        expect(url.searchParams.get('genre')).toBe('Jazz');
        expect(url.searchParams.get('int')).toBe('0.80');
        expect(url.searchParams.get('bpm')).toBeNull(); // tempo left to the app
        expect(url.searchParams.get('bnd')).toBeNull(); // nothing switched
    });

    it('emits only the band blocks it switches, each with the part’s full default config', () => {
        const url = link('--prog=C', '--genre=Funk', '--on=soloist', '--off=chords,harmony');
        const payload = band(url);
        expect(payload.s.e).toBe(1);
        expect(payload.c.e).toBe(0);
        expect(payload.h.e).toBe(0);
        expect(payload.b).toBeUndefined(); // untouched: keeps the genre's own setup
        expect(payload.g).toBeUndefined(); // never emitted: it would pin swing
        // A block with only `e` would reset the octave to hydration's fallback.
        expect(payload.c.o).toBe(65);
        expect(payload.s.o).toBe(72);
    });

    it('--density alone emits the chords block without muting the comp', () => {
        const payload = band(link('--prog=C | C+', '--genre=Jazz', '--density=rich'));
        expect(payload.c.d).toBe('rich');
        expect(payload.c.e).toBe(1);
        expect(payload.s).toBeUndefined();
    });

    it('refuses an unknown genre, part or density instead of emitting a link that lies', () => {
        expect(() => runAuditionLink(['--prog=C', '--genre=Polka'])).toThrow(/--genre/);
        expect(() => runAuditionLink(['--prog=C', '--off=drums'])).toThrow(/--off/);
        expect(() => runAuditionLink(['--prog=C', '--density=huge'])).toThrow(/--density/);
    });
});
