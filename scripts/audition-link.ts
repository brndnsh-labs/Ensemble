import { readFileSync } from 'node:fs';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { TIME_SIGNATURES } from '../core/config.js';
import { GENRE_NAMES } from '../core/data/smart-genres.js';
import { decodeChartLink, encodeChartLink } from '../core/songbook/chart-link.js';
import { isRetiredSchema, validateChartDocumentV2 } from '../core/songbook/document-v2.js';
import type { ChartDocumentV2 } from '../core/songbook/score-types.js';
import { buildStandardDocument } from '../web/lib/standards.js';
import { DEFAULT_MIX_REPORT_SCENES } from './mix-report-utils.js';

interface SceneShape {
    id: string;
    label?: string;
    genreFeel: string;
    bpm: number;
    intensity: number;
    key: string;
    sections: Array<{ value: string }>;
    [key: string]: unknown;
}

// The parts a link can switch. Drums are deliberately absent: the `bnd` groove block also
// carries swing/humanize, so emitting one just to flip `enabled` would pin swing to a number
// and override the genre's own feel — the thing most auditions are listening for.
const SWITCHABLE_PARTS = ['soloist', 'bass', 'chords'] as const;
type Part = (typeof SWITCHABLE_PARTS)[number];
// The old engine's harmony lane is gone (#1436), but written listen menus still pass
// `--off=chords,harmony`: accepted and ignored, with a note, rather than an error.
const RETIRED_PART = 'harmony';
// `--density` was inert even on the old `?prog=` links (a chart carries no chord density), so
// it is no longer a flag. Written listen menus may still pass it: accepted, ignored, noted.
const DENSITIES = ['thin', 'standard', 'rich'] as const;
// A link with no `--bpm` still needs a tempo (a chart always carries one): the engine default.
const DEFAULT_BPM = 120;

const SWING_SUBS = ['8th', '16th'] as const;
type SwingSub = (typeof SWING_SUBS)[number];
/** `--int`: a fixed level (clamped 0-1), or the chart's own `'auto'` energy. */
type Intensity = number | 'auto';

/** The flags that take a comma list; a run prints one link per combination of them. */
interface Variants {
    genre?: string[];
    bpm?: number[];
    intensity?: Intensity[];
    swing?: number[];
    swingSub?: SwingSub[];
}

interface CliArgs {
    scene: string | null;
    seed: string | null;
    baseUrl: string;
    autoplay: boolean;
    // Ad-hoc scenario (instead of --scene): any progression, in any genre.
    prog?: string | null;
    genre?: string | null;
    key?: string | null;
    bpm?: number | null;
    ts?: string | null;
    intensity?: Intensity | null;
    /** `--chart=<file.json>`: a schema-2 chart document the overrides apply on top of. */
    chart?: string | null;
    /** Groove overrides, written straight onto `chart.band.groove`. */
    swing?: number | null;
    swingSub?: SwingSub | null;
    humanize?: number | null;
    /** The comma-listed flags, in full; the scalar fields above hold the first of each. */
    variants?: Variants;
    /** Print the links as one markdown row. */
    md?: boolean;
    /** `--density` was named, which the link ignores. */
    retiredDensity?: boolean;
    on?: Part[];
    off?: Part[];
    /** `--on`/`--off` named the retired harmony lane, which the link then ignores. */
    retiredPart?: boolean;
}

// The v2 stand's dev server (`npm --prefix web run dev`) at the site root.
// The link is a schema-2 chart in a `#chart=` fragment (#1732), the same envelope the stand's
// "Copy link" writes, so it opens as an unsaved draft through the shell's ordinary shared-link
// path; `?autoplay=1` arms playback on the first gesture. `?seed=` is not carried: the chart's
// seed re-rolls on every play (`randomizeSeed`), so it could only ever be a line that does nothing.
const DEFAULT_BASE_URL = 'http://localhost:3100/';

function parseParts(flag: string, value: string): Part[] {
    return value
        .split(',')
        .map((part) => part.trim())
        .filter((part) => part && part !== RETIRED_PART)
        .map((part) => {
            if (!(SWITCHABLE_PARTS as readonly string[]).includes(part)) {
                throw new Error(`${flag}: unknown part "${part}" (${SWITCHABLE_PARTS.join(', ')})`);
            }
            return part as Part;
        });
}

function parseNumber(flag: string, value: string): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) {
        throw new Error(`${flag}: "${value}" is not a number`);
    }
    return parsed;
}

function parseList<T>(flag: string, value: string, parse: (item: string) => T): T[] {
    const items = value.split(',').map((item) => item.trim());
    if (items.some((item) => !item)) {
        throw new Error(`${flag}: "${value}" has an empty entry`);
    }
    return items.map(parse);
}

function parseRange(flag: string, value: string): number {
    const parsed = parseNumber(flag, value);
    if (parsed < 0 || parsed > 100) {
        throw new Error(`${flag}: "${value}" is outside 0-100`);
    }
    return parsed;
}

function parseIntensity(value: string): Intensity {
    return value === 'auto' ? 'auto' : parseNumber('--int', value);
}

function parseSwingSub(value: string): SwingSub {
    if (!(SWING_SUBS as readonly string[]).includes(value)) {
        throw new Error(`--swing-sub: expected one of ${SWING_SUBS.join(', ')}`);
    }
    return value as SwingSub;
}

function parseGenre(value: string): string {
    // Hydration silently drops a genre it doesn't know, which would hand back a
    // link that plays Rock with no error — so refuse it here instead.
    if (!GENRE_NAMES.includes(value)) {
        throw new Error(`--genre: expected one of ${GENRE_NAMES.join(', ')}`);
    }
    return value;
}

function parseArgs(argv: string[]): CliArgs {
    const out: CliArgs = {
        scene: null,
        seed: null,
        baseUrl: DEFAULT_BASE_URL,
        autoplay: true,
        prog: null,
    };
    for (const arg of argv) {
        if (arg.startsWith('--scene=')) {
            out.scene = arg.slice('--scene='.length);
        } else if (arg.startsWith('--seed=')) {
            out.seed = arg.slice('--seed='.length);
        } else if (arg.startsWith('--base-url=')) {
            out.baseUrl = arg.slice('--base-url='.length);
        } else if (arg.startsWith('--prog=')) {
            out.prog = arg.slice('--prog='.length);
        } else if (arg.startsWith('--genre=')) {
            const list = parseList('--genre', arg.slice('--genre='.length), parseGenre);
            out.variants = { ...out.variants, genre: list };
            out.genre = list[0];
        } else if (arg.startsWith('--key=')) {
            out.key = arg.slice('--key='.length);
        } else if (arg.startsWith('--ts=')) {
            out.ts = arg.slice('--ts='.length);
            if (!Object.hasOwn(TIME_SIGNATURES, out.ts)) {
                throw new Error(`--ts: expected one of ${Object.keys(TIME_SIGNATURES).join(', ')}`);
            }
        } else if (arg.startsWith('--bpm=')) {
            const list = parseList('--bpm', arg.slice('--bpm='.length), (v) =>
                parseNumber('--bpm', v),
            );
            out.variants = { ...out.variants, bpm: list };
            out.bpm = list[0];
        } else if (arg.startsWith('--int=')) {
            const list = parseList('--int', arg.slice('--int='.length), parseIntensity);
            out.variants = { ...out.variants, intensity: list };
            out.intensity = list[0];
        } else if (arg.startsWith('--swing=')) {
            const list = parseList('--swing', arg.slice('--swing='.length), (v) =>
                parseRange('--swing', v),
            );
            out.variants = { ...out.variants, swing: list };
            out.swing = list[0];
        } else if (arg.startsWith('--swing-sub=')) {
            const list = parseList('--swing-sub', arg.slice('--swing-sub='.length), parseSwingSub);
            out.variants = { ...out.variants, swingSub: list };
            out.swingSub = list[0];
        } else if (arg.startsWith('--humanize=')) {
            out.humanize = parseRange('--humanize', arg.slice('--humanize='.length));
        } else if (arg.startsWith('--chart=')) {
            out.chart = arg.slice('--chart='.length);
        } else if (arg === '--md') {
            out.md = true;
        } else if (arg.startsWith('--density=')) {
            if (!(DENSITIES as readonly string[]).includes(arg.slice('--density='.length))) {
                throw new Error(`--density: expected one of ${DENSITIES.join(', ')}`);
            }
            out.retiredDensity = true;
        } else if (arg.startsWith('--on=') || arg.startsWith('--off=')) {
            const flag = arg.startsWith('--on=') ? '--on' : '--off';
            const value = arg.slice(flag.length + 1);
            out[flag === '--on' ? 'on' : 'off'] = parseParts(flag, value);
            out.retiredPart ||= value.split(',').some((part) => part.trim() === RETIRED_PART);
        } else if (arg === '--no-autoplay') {
            out.autoplay = false;
        } else if (arg === '--help' || arg === '-h') {
            out.scene = null;
            out.prog = null;
        } else if (arg.startsWith('--')) {
            throw new Error(`Unknown flag: ${arg}`);
        }
    }
    return out;
}

function printUsage(): void {
    process.stderr.write(
        [
            'Usage:',
            '  npm run --silent audition-link -- --scene=<id> [--seed=<seed>] [--base-url=<url>] [--no-autoplay]',
            '  npm run --silent audition-link -- --prog="Cm7 | Cm7#5" --genre=Jazz [--key=C] [--ts=6/8] [--bpm=120]',
            '      [--int=0.35] [--on=soloist,…] [--off=chords,…]',
            '  npm run --silent audition-link -- --chart=<chart.json> [--bpm=66] [--int=0.3,auto]',
            '      [--swing=60] [--swing-sub=8th,16th] [--humanize=20] [--md]',
            '',
            '  --scene, --prog and --chart are mutually exclusive. --chart loads a schema-2 chart',
            "  (checked by the app's own validator); the other flags apply on top of it.",
            '  --genre, --bpm, --int (a number, or auto), --swing and --swing-sub take comma lists:',
            '  one labelled link per combination. --md prints them as one markdown row.',
            '  Every link is decoded and checked before it is printed.',
            '',
            '  The link is a #chart= schema-2 chart (an unsaved draft); --prog bars are |-separated.',
            `  --on / --off take: ${SWITCHABLE_PARTS.join(', ')} (the soloist is OFF by default).`,
            '  --scene flags also accept --int/--on/--off as overrides.',
            '  --density is accepted and ignored: a chart carries no chord density.',
            '  --seed is accepted and ignored: the seed re-rolls on every play.',
            `  Without --bpm the tempo is ${DEFAULT_BPM}.`,
            '',
            'Available scenes:',
            ...DEFAULT_MIX_REPORT_SCENES.map(
                (scene) => `  ${scene.id.padEnd(16)} ${scene.label || scene.id}`,
            ),
            '',
        ].join('\n'),
    );
}

/** A key name ('Eb', 'F#m') as the score holds it: the tonic, and whether the key is minor. */
function parseKey(key: string): { tonic: string; isMinor: boolean } {
    const match = /^([A-G][#b]?)(m|min)?$/.exec(key);
    if (!match) {
        throw new Error(`--key: "${key}" is not a key (C, Eb, F#m, ...)`);
    }
    return { tonic: match[1], isMinor: Boolean(match[2]) };
}

/**
 * What a link pins on top of a chart, the same for every source: energy, the lane on/off
 * switches and the groove's swing/humanize. Only a flag that was passed is written.
 * Drums are deliberately not switchable: the groove block also carries swing/humanize, and the
 * genre's own feel is the thing most auditions are listening for (`--swing` says it out loud).
 */
function applyOverrides(document: ChartDocumentV2, args: CliArgs): void {
    const { chart } = document;
    if (args.intensity != null) {
        chart.performance.energy =
            args.intensity === 'auto' ? 'auto' : Math.min(1, Math.max(0, args.intensity));
    }
    for (const part of args.on || []) {
        chart.band[part].enabled = true;
    }
    for (const part of args.off || []) {
        chart.band[part].enabled = false;
    }
    if (args.swing != null) {
        chart.band.groove.swing = args.swing;
    }
    if (args.swingSub != null) {
        chart.band.groove.swingSub = args.swingSub;
    }
    if (args.humanize != null) {
        chart.band.groove.humanize = args.humanize;
    }
}

/**
 * The chart a link opens: the scene's bars as one section, built by the standards catalog's own
 * `buildStandardDocument` (so the band is the genre's catalog band, and every bar goes through
 * `parseChordBar`), then what a link pins on top (`applyOverrides`).
 */
export function buildAuditionDocument(scene: SceneShape, args: CliArgs): ChartDocumentV2 {
    const bars = scene.sections
        .flatMap((section) => section.value.split('|'))
        .map((bar) => bar.trim())
        .filter(Boolean);
    const { tonic, isMinor } = parseKey(scene.key);
    let document: ChartDocumentV2;
    try {
        document = buildStandardDocument({
            id: crypto.randomUUID(),
            title: 'Audition',
            shelf: 'grooves',
            genre: scene.genreFeel,
            bpm: scene.bpm > 0 ? scene.bpm : DEFAULT_BPM,
            key: tonic,
            isMinor,
            meter: args.ts || '4/4',
            sections: [{ label: 'A', bars }],
        });
    } catch (error) {
        // The catalog builder names its own file in the message; say what the caller typed.
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`--prog: ${reason.replace(/^Standards catalog bar /, 'bar ')}`);
    }
    document.chart.performance.energy = Math.min(
        1,
        Math.max(0, typeof args.intensity === 'number' ? args.intensity : scene.intensity),
    );
    applyOverrides(document, args);
    return document;
}

/** Load a schema-2 chart file through the app's own validator; refuse anything it refuses. */
function loadAuditionChart(file: string): ChartDocumentV2 {
    let candidate: unknown;
    try {
        candidate = JSON.parse(readFileSync(file, 'utf8'));
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(`--chart: cannot read ${file}: ${reason}`);
    }
    if (isRetiredSchema(candidate)) {
        throw new Error('--chart: a schema-1 chart is retired; export a schema-2 chart');
    }
    const result = validateChartDocumentV2(candidate);
    if (result.kind !== 'ok') {
        const detail =
            result.kind === 'invalid'
                ? result.issues
                      .slice(0, 3)
                      .map((issue) => `${issue.path}: ${issue.message}`)
                      .join('; ')
                : `schema ${result.schemaVersion} is newer than this app`;
        throw new Error(`--chart: not a valid schema-2 chart (${detail})`);
    }
    return result.value;
}

/** A loaded chart with the overrides on top (`--genre`/`--bpm`/`--key` included). */
function buildChartAuditionDocument(base: ChartDocumentV2, args: CliArgs): ChartDocumentV2 {
    const document = structuredClone(base);
    const { chart } = document;
    if (args.genre != null) {
        chart.band.groove.genre = args.genre;
    }
    if (args.bpm != null) {
        chart.performance.bpm = args.bpm;
    }
    if (args.key != null) {
        const { tonic, isMinor } = parseKey(args.key);
        chart.score.key = tonic;
        chart.score.isMinor = isMinor;
    }
    applyOverrides(document, args);
    return document;
}

function linkUrl(fragment: string, args: CliArgs): string {
    const base = args.baseUrl.endsWith('/') ? args.baseUrl : `${args.baseUrl}/`;
    // Autoplay rides the query string, outside the chart: it is a request to this page load,
    // not part of the song, and the shell consumes it with the fragment.
    return `${base}${args.autoplay ? '?autoplay=1' : ''}${fragment}`;
}

type Encode = (document: ChartDocumentV2) => Promise<string>;

function noteRetired(args: CliArgs): void {
    if (args.retiredPart) {
        process.stderr.write(
            "note: the v2 stand has no harmony lane; this link's harmony switch has no effect\n",
        );
    }
    if (args.retiredDensity) {
        process.stderr.write('note: --density does nothing (a chart carries no chord density)\n');
    }
}

export async function buildAuditionLink(scene: SceneShape, args: CliArgs): Promise<string> {
    const fragment = await encodeChartLink(buildAuditionDocument(scene, args));
    noteRetired(args);
    return linkUrl(fragment, args);
}

/**
 * Decode a link and check it is the chart we meant: the same chart, and every override that
 * was asked for took. Returns what is wrong, or null.
 */
async function checkAuditionLink(
    url: string,
    expected: ChartDocumentV2,
    args: CliArgs,
): Promise<string | null> {
    // Slice the fragment by hand: a relative base (`--base-url=/`, as the v2 checks use) is not
    // a URL `new URL` accepts.
    const hashAt = url.indexOf('#');
    const decoded = await decodeChartLink(hashAt === -1 ? '' : url.slice(hashAt));
    if (typeof decoded !== 'object') {
        return 'the link does not decode to a schema-2 chart';
    }
    if (!isDeepStrictEqual(decoded.chart, expected.chart)) {
        return 'the link decodes to a different chart than was built';
    }
    const { chart } = decoded;
    const checks: Array<[string, unknown, unknown]> = [
        ['bpm', args.bpm, chart.performance.bpm],
        ['genre', args.genre, chart.band.groove.genre],
        ['swing', args.swing, chart.band.groove.swing],
        ['swing-sub', args.swingSub, chart.band.groove.swingSub],
        ['humanize', args.humanize, chart.band.groove.humanize],
        [
            'int',
            typeof args.intensity === 'number'
                ? Math.min(1, Math.max(0, args.intensity))
                : args.intensity,
            chart.performance.energy,
        ],
    ];
    for (const [name, wanted, got] of checks) {
        if (wanted != null && wanted !== got) {
            return `--${name} did not take (wanted ${wanted}, the link holds ${got})`;
        }
    }
    if (args.key != null) {
        const { tonic, isMinor } = parseKey(args.key);
        if (chart.score.key !== tonic || chart.score.isMinor !== isMinor) {
            return `--key did not take (the link holds ${chart.score.key})`;
        }
    }
    return null;
}

/** The product of every comma-listed flag with more than one value, labelled by what varies. */
function expandVariants(args: CliArgs): Array<{ label: string; args: CliArgs }> {
    const v = args.variants ?? {};
    let combos: Array<{ parts: string[]; patch: Partial<CliArgs> }> = [{ parts: [], patch: {} }];
    const add = <T>(
        list: T[] | undefined,
        label: string,
        set: (value: T) => Partial<CliArgs>,
    ): void => {
        if (!list || list.length < 2) {
            return;
        }
        combos = combos.flatMap((combo) =>
            list.map((value) => ({
                parts: [...combo.parts, `${label} ${value}`.trim()],
                patch: { ...combo.patch, ...set(value) },
            })),
        );
    };
    add(v.genre, '', (genre) => ({ genre }));
    add(v.bpm, 'bpm', (bpm) => ({ bpm }));
    add(v.swing, 'swing', (swing) => ({ swing }));
    add(v.swingSub, 'sub', (swingSub) => ({ swingSub }));
    add(v.intensity, 'int', (intensity) => ({ intensity }));
    return combos.map((combo) => ({
        label: combo.parts.join(' · '),
        args: { ...args, ...combo.patch },
    }));
}

/** An ad-hoc scenario as a scene. `bpm: 0` means "leave the tempo to the app". */
function adHocScene(args: CliArgs): SceneShape {
    return {
        id: 'ad-hoc',
        genreFeel: args.genre || 'Rock',
        bpm: args.bpm ?? 0,
        intensity: typeof args.intensity === 'number' ? args.intensity : 0.35,
        key: args.key || 'C',
        sections: [{ value: args.prog || '' }],
    };
}

/** A catalog scene with `--genre`/`--bpm`/`--key` laid over it, so a variant of one takes. */
function sceneWith(scene: SceneShape, args: CliArgs): SceneShape {
    return {
        ...scene,
        genreFeel: args.genre ?? scene.genreFeel,
        bpm: args.bpm ?? scene.bpm,
        key: args.key ?? scene.key,
    };
}

/** `encode` is a seam: the self-check test hands in a deliberately broken one. */
export async function runAuditionLink(
    argv: string[] = process.argv.slice(2),
    encode: Encode = encodeChartLink,
): Promise<number> {
    const args = parseArgs(argv);
    if ([args.prog, args.scene, args.chart].filter(Boolean).length > 1) {
        throw new Error('--scene, --prog and --chart are mutually exclusive');
    }
    let scene: SceneShape | undefined;
    let chartBase: ChartDocumentV2 | undefined;
    if (args.chart) {
        if (args.ts) {
            throw new Error('--ts does not apply to --chart (the chart carries its own meter)');
        }
        chartBase = loadAuditionChart(args.chart);
    } else if (args.scene) {
        scene = DEFAULT_MIX_REPORT_SCENES.find((s) => s.id === args.scene) as
            | SceneShape
            | undefined;
        if (!scene) {
            process.stderr.write(`Unknown scene: ${args.scene}\n`);
            printUsage();
            return 2;
        }
    } else if (!args.prog) {
        printUsage();
        return 2;
    }
    noteRetired(args);

    const links: Array<{ label: string; url: string }> = [];
    for (const variant of expandVariants(args)) {
        const document = chartBase
            ? buildChartAuditionDocument(chartBase, variant.args)
            : buildAuditionDocument(
                  scene ? sceneWith(scene, variant.args) : adHocScene(variant.args),
                  variant.args,
              );
        const url = linkUrl(await encode(document), variant.args);
        const problem = await checkAuditionLink(url, document, variant.args);
        if (problem) {
            throw new Error(
                `audition link${variant.label ? ` (${variant.label})` : ''}: ${problem}`,
            );
        }
        links.push({ label: variant.label, url });
    }
    if (args.md) {
        const row = links.map((link) => `[${link.label || 'audition'}](${link.url})`);
        process.stdout.write(`${row.join(' · ')}\n`);
    } else if (links.length === 1 && !links[0].label) {
        process.stdout.write(`${links[0].url}\n`);
    } else {
        for (const link of links) {
            process.stdout.write(`${link.label}: ${link.url}\n`);
        }
    }
    return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    process.exitCode = await runAuditionLink();
}
