import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { TIME_SIGNATURES } from '../public/config.js';
import { GENRE_NAMES } from '../public/data/smart-genres.js';
import {
    bass,
    chords,
    harmony,
    MIXER_SETTINGS_VERSION,
    soloist,
} from '../public/state/instruments.js';
import { encodeBase64Unicode } from '../public/state/share-codec.js';
import type { ChordDensity, SharedBandPayload } from '../public/types.js';
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
const SWITCHABLE_PARTS = ['soloist', 'bass', 'chords', 'harmony'] as const;
type Part = (typeof SWITCHABLE_PARTS)[number];
const DENSITIES: readonly ChordDensity[] = ['thin', 'standard', 'rich'];

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
    density?: ChordDensity | null;
    on?: Part[];
    off?: Part[];
}

const DEFAULT_BASE_URL = 'http://localhost:5173/';

function parseParts(flag: string, value: string): Part[] {
    return value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
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
            const density = DENSITIES.find((d) => d === arg.slice('--density='.length));
            if (!density) {
                throw new Error(`--density: expected one of ${DENSITIES.join(', ')}`);
            }
            out.density = density;
        } else if (arg.startsWith('--on=')) {
            out.on = parseParts('--on', arg.slice('--on='.length));
        } else if (arg.startsWith('--off=')) {
            out.off = parseParts('--off', arg.slice('--off='.length));
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
            '      [--int=0.35] [--density=thin|standard|rich] [--on=soloist,…] [--off=chords,…]',
            '',
            `  --on / --off take: ${SWITCHABLE_PARTS.join(', ')} (the soloist is OFF by default).`,
            '  --scene flags also accept --int/--density/--on/--off as overrides.',
            '',
            'Available scenes:',
            ...DEFAULT_MIX_REPORT_SCENES.map(
                (scene) => `  ${scene.id.padEnd(16)} ${scene.label || scene.id}`,
            ),
            '',
        ].join('\n'),
    );
}

/**
 * The `bnd` blob for the parts a link switches, or null when it switches none.
 *
 * Hydration applies each band block WHOLESALE — a block that carries only `e` would reset that
 * part's octave to hydration's fallback (48 for chords, where the app default is 65) — so every
 * emitted block is the part's full default config with just the requested field changed. Blocks
 * for untouched parts are omitted so they keep whatever the genre sets up.
 */
function buildBandParam(args: CliArgs): string | null {
    const switched = new Map<Part, boolean>();
    for (const part of args.on || []) {
        switched.set(part, true);
    }
    for (const part of args.off || []) {
        switched.set(part, false);
    }
    if (switched.size === 0 && !args.density) {
        return null;
    }
    const flag = (part: Part, fallback: boolean): 0 | 1 =>
        (switched.has(part) ? switched.get(part) : fallback) ? 1 : 0;

    const band: SharedBandPayload = { mv: MIXER_SETTINGS_VERSION };
    if (switched.has('soloist')) {
        band.s = {
            e: flag('soloist', soloist.enabled),
            s: soloist.style,
            p: soloist.preset,
            o: soloist.octave,
            v: soloist.volume,
            r: soloist.reverb,
            m: soloist.mode,
            am: soloist.autoMode ? 1 : 0,
            sd: '',
        };
    }
    if (switched.has('bass')) {
        band.b = {
            e: flag('bass', bass.enabled),
            s: bass.style,
            o: bass.octave,
            v: bass.volume,
            r: bass.reverb,
        };
    }
    if (switched.has('chords') || args.density) {
        band.c = {
            e: flag('chords', chords.enabled),
            s: chords.style,
            o: chords.octave,
            v: chords.volume,
            r: chords.reverb,
            d: args.density || chords.density,
        };
    }
    if (switched.has('harmony')) {
        band.h = {
            e: flag('harmony', harmony.enabled),
            s: harmony.style,
            o: harmony.octave,
            v: harmony.volume,
            r: harmony.reverb,
            c: harmony.complexity,
        };
    }
    return encodeBase64Unicode(JSON.stringify(band));
}

export function buildAuditionLink(scene: SceneShape, args: CliArgs): string {
    const params = new URLSearchParams();
    // Single-section progression — state-hydration.ts accepts a raw `prog`
    // string and normalizes it into a Main section.
    const progression = scene.sections.map((section) => section.value).join(' | ');
    params.set('prog', progression);
    params.set('key', scene.key);
    params.set('ts', args.ts || '4/4');
    if (scene.bpm > 0) {
        params.set('bpm', String(scene.bpm));
    }
    params.set('genre', scene.genreFeel);
    params.set('int', (args.intensity ?? scene.intensity).toFixed(2));
    const band = buildBandParam(args);
    if (band) {
        params.set('bnd', band);
    }
    if (args.seed) {
        params.set('seed', args.seed);
    }
    if (args.autoplay) {
        params.set('autoplay', '1');
    }

    const base = args.baseUrl.endsWith('/') ? args.baseUrl : `${args.baseUrl}/`;
    return `${base}?${params.toString()}`;
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

export function runAuditionLink(argv: string[] = process.argv.slice(2)): number {
    const args = parseArgs(argv);
    if (args.prog) {
        process.stdout.write(`${buildAuditionLink(adHocScene(args), args)}\n`);
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

    const url = buildAuditionLink(scene as SceneShape, args);
    process.stdout.write(`${url}\n`);
    return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    process.exitCode = runAuditionLink();
}
