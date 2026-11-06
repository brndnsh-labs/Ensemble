import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeChartLink } from '../../core/songbook/chart-link.js';
import type { ChartDocumentV2 } from '../../core/songbook/score-types.js';
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
    baseUrl: 'http://localhost:3100/',
    autoplay: true,
    ...over,
});

async function chartOf(url: string): Promise<ChartDocumentV2> {
    const doc = await decodeChartLink(new URL(url).hash);
    if (typeof doc !== 'object') {
        throw new Error('the link did not decode to a schema-2 chart');
    }
    return doc;
}

describe('buildAuditionLink', () => {
    it('emits the scene as a schema-2 #chart= link with autoplay armed by default', async () => {
        const url = await buildAuditionLink(scene, base());
        const parsed = new URL(url);
        expect(parsed.pathname).toBe('/');
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

const FIXTURE = 'tests/fixtures/audition/two-section-chart.json';

async function run(argv: string[], encode?: Parameters<typeof runAuditionLink>[1]) {
    let out = '';
    const write = process.stdout.write;
    process.stdout.write = ((chunk: string) => {
        out += chunk;
        return true;
    }) as typeof process.stdout.write;
    try {
        const code = await runAuditionLink(argv, encode);
        return { code, out };
    } finally {
        process.stdout.write = write;
    }
}

const linksOf = (out: string) => [...out.matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]);

describe('--chart', () => {
    it('opens the loaded chart unchanged when no override is passed', async () => {
        const { out } = await run([`--chart=${FIXTURE}`]);
        const { chart } = await chartOf(out.trim());
        expect(chart.score.sections.map((s) => s.measures.length)).toEqual([4, 4]);
        expect(chart.score.key).toBe('F');
        expect(chart.performance.bpm).toBe(90);
        expect(chart.band.groove.genre).toBe('Jazz');
    });

    it('applies every override on top of the chart', async () => {
        const { out } = await run([
            `--chart=${FIXTURE}`,
            '--genre=Funk',
            '--bpm=66',
            '--key=Am',
            '--int=0.3',
            '--swing=60',
            '--swing-sub=16th',
            '--humanize=25',
            '--on=soloist',
            '--off=chords',
        ]);
        const { chart } = await chartOf(out.trim());
        expect(chart.band.groove.genre).toBe('Funk');
        expect(chart.performance.bpm).toBe(66);
        expect(chart.score.key).toBe('A');
        expect(chart.score.isMinor).toBe(true);
        expect(chart.performance.energy).toBeCloseTo(0.3);
        expect(chart.band.groove.swing).toBe(60);
        expect(chart.band.groove.swingSub).toBe('16th');
        expect(chart.band.groove.humanize).toBe(25);
        expect(chart.band.soloist.enabled).toBe(true);
        expect(chart.band.chords.enabled).toBe(false);
        // the score itself is the loaded one
        expect(chart.score.sections).toHaveLength(2);
    });

    it('takes --int=auto', async () => {
        const { out } = await run([`--chart=${FIXTURE}`, '--int=auto']);
        expect((await chartOf(out.trim())).chart.performance.energy).toBe('auto');
    });

    it('rejects a missing file, a non-chart document and a schema-1 chart', async () => {
        const dir = mkdtempSync(join(tmpdir(), 'audition-'));
        const bad = join(dir, 'bad.json');
        writeFileSync(bad, JSON.stringify({ schemaVersion: 2, nope: true }));
        const old = join(dir, 'old.json');
        writeFileSync(old, JSON.stringify({ schemaVersion: 1, text: 'C | F' }));
        await expect(run(['--chart=/nonexistent/chart.json'])).rejects.toThrow(
            /--chart: cannot read/,
        );
        await expect(run([`--chart=${bad}`])).rejects.toThrow(/not a valid schema-2 chart/);
        await expect(run([`--chart=${old}`])).rejects.toThrow(/schema-1/);
    });

    it('makes --scene, --prog and --chart mutually exclusive', async () => {
        await expect(run([`--chart=${FIXTURE}`, '--prog=C'])).rejects.toThrow(/mutually exclusive/);
        await expect(run([`--chart=${FIXTURE}`, '--scene=jazz-ride'])).rejects.toThrow(
            /mutually exclusive/,
        );
        await expect(run(['--prog=C', '--scene=jazz-ride'])).rejects.toThrow(/mutually exclusive/);
    });
});

describe('overrides on --prog and --scene', () => {
    it('carries swing, swing-sub, humanize and --int=auto', async () => {
        const { out } = await run([
            '--prog=C | F',
            '--swing=40',
            '--swing-sub=8th',
            '--humanize=10',
            '--int=auto',
        ]);
        const { chart } = await chartOf(out.trim());
        expect(chart.band.groove.swing).toBe(40);
        expect(chart.band.groove.swingSub).toBe('8th');
        expect(chart.band.groove.humanize).toBe(10);
        expect(chart.performance.energy).toBe('auto');
    });

    it('lets --bpm and --genre take on a catalog scene', async () => {
        const { out } = await run(['--scene=jazz-ride', '--bpm=77', '--genre=Blues']);
        const { chart } = await chartOf(out.trim());
        expect(chart.performance.bpm).toBe(77);
        expect(chart.band.groove.genre).toBe('Blues');
    });

    it('refuses out-of-range and unknown values', async () => {
        await expect(run(['--prog=C', '--swing=101'])).rejects.toThrow(/--swing/);
        await expect(run(['--prog=C', '--humanize=-1'])).rejects.toThrow(/--humanize/);
        await expect(run(['--prog=C', '--swing-sub=32nd'])).rejects.toThrow(/--swing-sub/);
        await expect(run(['--prog=C', '--int=loud'])).rejects.toThrow(/--int/);
        await expect(run(['--prog=C', '--bpm=60,,70'])).rejects.toThrow(/--bpm/);
    });
});

describe('variants', () => {
    it('prints one bare link when nothing is listed', async () => {
        const { out } = await run(['--prog=C', '--swing=60']);
        expect(out.trim().split('\n')).toHaveLength(1);
        expect(out.startsWith('http://localhost:3100/')).toBe(true);
    });

    it('prints the cartesian product, each labelled by what varies and each applied', async () => {
        const { out } = await run([
            `--chart=${FIXTURE}`,
            '--bpm=66',
            '--swing=50,60',
            '--int=0.3,auto',
        ]);
        const lines = out.trim().split('\n');
        expect(lines.map((l) => l.split(': ')[0])).toEqual([
            'swing 50 · int 0.3',
            'swing 50 · int auto',
            'swing 60 · int 0.3',
            'swing 60 · int auto',
        ]);
        const charts = await Promise.all(lines.map((l) => chartOf(l.slice(l.indexOf(': ') + 2))));
        expect(charts.map((c) => c.chart.band.groove.swing)).toEqual([50, 50, 60, 60]);
        expect(charts.map((c) => c.chart.performance.energy)).toEqual([0.3, 'auto', 0.3, 'auto']);
        expect(charts.every((c) => c.chart.performance.bpm === 66)).toBe(true);
    });

    it('varies genre and bpm too', async () => {
        const { out } = await run(['--prog=C', '--genre=Jazz,Funk', '--bpm=80,120']);
        const labels = out
            .trim()
            .split('\n')
            .map((l) => l.split(': ')[0]);
        expect(labels).toEqual([
            'Jazz · bpm 80',
            'Jazz · bpm 120',
            'Funk · bpm 80',
            'Funk · bpm 120',
        ]);
    });
});

describe('--md', () => {
    it('prints one markdown row of labelled links that decode', async () => {
        const { out } = await run([
            `--chart=${FIXTURE}`,
            '--bpm=66',
            '--int=0.3,auto',
            '--swing-sub=8th,16th',
            '--md',
        ]);
        expect(out.trim().split('\n')).toHaveLength(1);
        expect(out).toMatch(/^\[sub 8th · int 0\.3\]\(http[^)]+\) · \[sub 8th · int auto\]\(/);
        const urls = linksOf(out);
        expect(urls).toHaveLength(4);
        const charts = await Promise.all(urls.map(chartOf));
        expect(charts.map((c) => c.chart.band.groove.swingSub)).toEqual([
            '8th',
            '8th',
            '16th',
            '16th',
        ]);
        expect(charts.every((c) => c.chart.performance.bpm === 66)).toBe(true);
    });

    it('labels a single link', async () => {
        const { out } = await run(['--prog=C', '--md']);
        expect(out).toMatch(/^\[audition\]\(http/);
    });
});

describe('decode self-check', () => {
    it('fails the run when the encoded link is not the chart that was built', async () => {
        const { encodeChartLink } = await import('../../core/songbook/chart-link.js');
        // a deliberately broken encode: it drops the swing override on the way out
        const broken = (document: ChartDocumentV2) => {
            const copy = structuredClone(document);
            copy.chart.band.groove.swing = 0;
            return encodeChartLink(copy);
        };
        await expect(run([`--chart=${FIXTURE}`, '--swing=60'], broken)).rejects.toThrow(
            /different chart/,
        );
    });

    it('fails when the link does not decode at all', async () => {
        await expect(run(['--prog=C'], async () => '#chart=garbage')).rejects.toThrow(
            /does not decode/,
        );
    });
});
