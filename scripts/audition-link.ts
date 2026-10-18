import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { TIME_SIGNATURES } from '../core/config.js';
import { GENRE_NAMES } from '../core/data/smart-genres.js';
import { encodeChartLink } from '../core/songbook/chart-link.js';
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
    intensity?: number | null;
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
            out.genre = arg.slice('--genre='.length);
            // Hydration silently drops a genre it doesn't know, which would hand back a
            // link that plays Rock with no error — so refuse it here instead.
            if (!GENRE_NAMES.includes(out.genre)) {
                throw new Error(`--genre: expected one of ${GENRE_NAMES.join(', ')}`);
            }
        } else if (arg.startsWith('--key=')) {
            out.key = arg.slice('--key='.length);
        } else if (arg.startsWith('--ts=')) {
            out.ts = arg.slice('--ts='.length);
            if (!Object.hasOwn(TIME_SIGNATURES, out.ts)) {
                throw new Error(`--ts: expected one of ${Object.keys(TIME_SIGNATURES).join(', ')}`);
            }
        } else if (arg.startsWith('--bpm=')) {
            out.bpm = parseNumber('--bpm', arg.slice('--bpm='.length));
        } else if (arg.startsWith('--int=')) {
            out.intensity = parseNumber('--int', arg.slice('--int='.length));
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
 * The chart a link opens: the scene's bars as one section, built by the standards catalog's own
 * `buildStandardDocument` (so the band is the genre's catalog band, and every bar goes through
 * `parseChordBar`), then the two things a link pins on top — `performance.energy` and the lane
 * on/off switches. Drums are deliberately not switchable: the groove block also carries
 * swing/humanize, and the genre's own feel is the thing most auditions are listening for.
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
    const { chart } = document;
    chart.performance.energy = Math.min(1, Math.max(0, args.intensity ?? scene.intensity));
    for (const part of args.on || []) {
        chart.band[part].enabled = true;
    }
    for (const part of args.off || []) {
        chart.band[part].enabled = false;
    }
    return document;
}

export async function buildAuditionLink(scene: SceneShape, args: CliArgs): Promise<string> {
    const fragment = await encodeChartLink(buildAuditionDocument(scene, args));
    if (args.retiredPart) {
        process.stderr.write(
            "note: the v2 stand has no harmony lane; this link's harmony switch has no effect\n",
        );
    }
    if (args.retiredDensity) {
        process.stderr.write('note: --density does nothing (a chart carries no chord density)\n');
    }
    const base = args.baseUrl.endsWith('/') ? args.baseUrl : `${args.baseUrl}/`;
    // Autoplay rides the query string, outside the chart: it is a request to this page load,
    // not part of the song, and the shell consumes it with the fragment.
    return `${base}${args.autoplay ? '?autoplay=1' : ''}${fragment}`;
}

/** An ad-hoc scenario as a scene. `bpm: 0` means "leave the tempo to the app". */
function adHocScene(args: CliArgs): SceneShape {
    return {
        id: 'ad-hoc',
        genreFeel: args.genre || 'Rock',
        bpm: args.bpm ?? 0,
        intensity: args.intensity ?? 0.35,
        key: args.key || 'C',
        sections: [{ value: args.prog || '' }],
    };
}

export async function runAuditionLink(argv: string[] = process.argv.slice(2)): Promise<number> {
    const args = parseArgs(argv);
    if (args.prog) {
        process.stdout.write(`${await buildAuditionLink(adHocScene(args), args)}\n`);
        return 0;
    }
    if (!args.scene) {
        printUsage();
        return 2;
    }

    const scene = DEFAULT_MIX_REPORT_SCENES.find((s) => s.id === args.scene);
    if (!scene) {
        process.stderr.write(`Unknown scene: ${args.scene}\n`);
        printUsage();
        return 2;
    }

    const url = await buildAuditionLink(scene as SceneShape, args);
    process.stdout.write(`${url}\n`);
    return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    process.exitCode = await runAuditionLink();
}
