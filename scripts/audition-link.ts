import process from 'node:process';
import { pathToFileURL } from 'node:url';
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

interface CliArgs {
    scene: string | null;
    seed: string | null;
    baseUrl: string;
    autoplay: boolean;
}

const DEFAULT_BASE_URL = 'http://localhost:5173/';

function parseArgs(argv: string[]): CliArgs {
    const out: CliArgs = {
        scene: null,
        seed: null,
        baseUrl: DEFAULT_BASE_URL,
        autoplay: true,
    };
    for (const arg of argv) {
        if (arg.startsWith('--scene=')) {
            out.scene = arg.slice('--scene='.length);
        } else if (arg.startsWith('--seed=')) {
            out.seed = arg.slice('--seed='.length);
        } else if (arg.startsWith('--base-url=')) {
            out.baseUrl = arg.slice('--base-url='.length);
        } else if (arg === '--no-autoplay') {
            out.autoplay = false;
        } else if (arg === '--help' || arg === '-h') {
            out.scene = null;
        } else if (arg.startsWith('--')) {
            throw new Error(`Unknown flag: ${arg}`);
        }
    }
    return out;
}

function printUsage(): void {
    process.stderr.write(
        [
            'Usage: npm run --silent audition-link -- --scene=<id> [--seed=<seed>] [--base-url=<url>] [--no-autoplay]',
            '',
            'Available scenes:',
            ...DEFAULT_MIX_REPORT_SCENES.map(
                (scene) => `  ${scene.id.padEnd(16)} ${scene.label || scene.id}`,
            ),
            '',
        ].join('\n'),
    );
}

export function buildAuditionLink(scene: SceneShape, args: CliArgs): string {
    const params = new URLSearchParams();
    // Single-section progression — state-hydration.ts accepts a raw `prog`
    // string and normalizes it into a Main section.
    const progression = scene.sections.map((section) => section.value).join(' | ');
    params.set('prog', progression);
    params.set('key', scene.key);
    params.set('ts', '4/4');
    params.set('bpm', String(scene.bpm));
    params.set('genre', scene.genreFeel);
    params.set('int', scene.intensity.toFixed(2));
    if (args.seed) {
        params.set('seed', args.seed);
    }
    if (args.autoplay) {
        params.set('autoplay', '1');
    }

    const base = args.baseUrl.endsWith('/') ? args.baseUrl : `${args.baseUrl}/`;
    return `${base}?${params.toString()}`;
}

export function runAuditionLink(argv: string[] = process.argv.slice(2)): number {
    const args = parseArgs(argv);
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
