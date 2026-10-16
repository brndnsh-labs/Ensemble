import { describe, expect, it } from 'vitest';
import { decodeChartLink } from '../../public/songbook/chart-link.js';
import type { ChartDocumentV2 } from '../../public/songbook/score-types.js';
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

const base = (over: Record<string, unknown> = {}) => ({
    scene: 'jazz-ride',
    seed: null,
    baseUrl: 'http://localhost:3100/v2/',
    autoplay: true,
    ...over,
});

async function chartOf(url: string): Promise<ChartDocumentV2> {
    const doc = await decodeChartLink(new URL(url).hash);
    if (doc?.schemaVersion !== 2) {
        throw new Error('the link did not decode to a schema-2 chart');
    }
    return doc;
}

describe('buildAuditionLink', () => {
    it('emits the scene as a schema-2 #chart= link with autoplay armed by default', async () => {
        const url = await buildAuditionLink(scene, base());
        const parsed = new URL(url);
        expect(parsed.pathname).toBe('/v2/');
        expect(parsed.searchParams.get('autoplay')).toBe('1');
        expect(parsed.searchParams.get('prog')).toBeNull();
        expect(parsed.searchParams.get('s')).toBeNull();

        const { chart } = await chartOf(url);
        expect(chart.score.key).toBe('C');
        expect(chart.score.meter).toBe('4/4');
        expect(chart.performance.bpm).toBe(138);
        expect(chart.performance.energy).toBeCloseTo(0.64);
        expect(chart.band.groove.genre).toBe('Jazz');
        expect(chart.score.sections).toHaveLength(1);
        expect(chart.score.sections[0].measures).toHaveLength(4);
    });

    it('omits autoplay when disabled', async () => {
        const url = await buildAuditionLink(scene, base({ autoplay: false }));
        expect(new URL(url).searchParams.get('autoplay')).toBeNull();
        expect(url).toContain('#chart=');
    });

    it('appends a trailing slash to base URLs that lack one', async () => {
        const url = await buildAuditionLink(scene, base({ baseUrl: 'http://example.com/app' }));
        expect(url.startsWith('http://example.com/app/?autoplay=1#chart=')).toBe(true);
    });
});

describe('ad-hoc audition links', () => {
    const link = async (...argv: string[]) => {
        let out = '';
        const write = process.stdout.write;
        process.stdout.write = ((chunk: string) => {
            out += chunk;
            return true;
        }) as typeof process.stdout.write;
        try {
            expect(await runAuditionLink(argv)).toBe(0);
        } finally {
            process.stdout.write = write;
        }
        return chartOf(out.trim());
    };

    it('carries a progression with accidentals, a genre, key, meter, tempo and intensity', async () => {
        const { chart } = await link(
            '--prog=Cm7 | Cm7#5 | C+ | Cmb6',
            '--genre=Neo-Soul',
            '--key=Eb',
            '--ts=6/8',
            '--bpm=92',
            '--int=0.8',
        );
        expect(chart.score.sections[0].measures).toHaveLength(4);
        expect(chart.band.groove.genre).toBe('Neo-Soul');
        expect(chart.score.key).toBe('Eb');
        expect(chart.score.meter).toBe('6/8');
        expect(chart.performance.bpm).toBe(92);
        expect(chart.performance.energy).toBeCloseTo(0.8);
    });

    it('reads a minor key and clamps the intensity', async () => {
        const { chart } = await link('--prog=Am | Dm', '--key=Am', '--int=3');
        expect(chart.score.key).toBe('A');
        expect(chart.score.isMinor).toBe(true);
        expect(chart.performance.energy).toBe(1);
    });

    it('switches only the lanes it names; the rest keep the genre band', async () => {
        const { chart } = await link(
            '--prog=C',
            '--genre=Funk',
            '--on=soloist',
            '--off=chords,harmony',
        );
        expect(chart.band.soloist.enabled).toBe(true);
        expect(chart.band.chords.enabled).toBe(false);
        expect(chart.band.bass.enabled).toBe(true);
        expect(chart.band.groove.enabled).toBe(true);
    });

    it('accepts the inert --density without changing the chart', async () => {
        const plain = await link('--prog=C | C+', '--genre=Jazz');
        const dense = await link('--prog=C | C+', '--genre=Jazz', '--density=rich');
        expect(dense.chart.band).toEqual(plain.chart.band);
    });

    it('refuses an unknown genre, part, density, key or bar instead of emitting a link that lies', async () => {
        await expect(runAuditionLink(['--prog=C', '--genre=Polka'])).rejects.toThrow(/--genre/);
        await expect(runAuditionLink(['--prog=C', '--off=drums'])).rejects.toThrow(/--off/);
        await expect(runAuditionLink(['--prog=C', '--density=huge'])).rejects.toThrow(/--density/);
        await expect(runAuditionLink(['--prog=C', '--key=H'])).rejects.toThrow(/--key/);
        await expect(runAuditionLink(['--prog=Q#zz'])).rejects.toThrow(/--prog: bar/);
    });
});
