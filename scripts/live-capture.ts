/**
 * live:capture — record what the LIVE transport plays, and measure it (#1562).
 *
 * Every other listening-gate tool renders offline. This one serves the bridge export, opens the
 * stand on a `mix:report` scene (the same link `audition-link` builds), presses Play on the real
 * `AudioContext`, taps the master limiter for N bars, presses Stop, keeps recording through the
 * release, and writes the capture (WAV + markers). Then four checks, each a number against the
 * threshold it states — never a verdict on how it sounds:
 *
 *   stop silence   RMS after Stop, and how long the band took to fall under the floor (#1530)
 *   stop click     the largest discontinuity in the 400 ms after Stop
 *   tempo          onsets against the nominal sixteenth grid: deviation and drift per bar
 *   live/offline   the same scene rendered offline in node, compared on level and band shares (#1531)
 *
 *   npm run live:capture -- --scene=funk-pocket --bars=8
 *   npm run live:capture -- --scene=jazz-ride --bars=4 --build        # (re)build the bridge export first
 *
 * Needs a bridge build (`prototypes/v2/out` made with NEXT_PUBLIC_RENDER_BRIDGE=1); the live
 * transport lives on `window.ensemble.transport` / `.capture` only in that build. Playback is real
 * time: eight bars at 104 bpm is eighteen seconds of wall clock.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import playwright from '@playwright/test';
import { encodeWav } from '../public/engine/wav-encoder.js';
import { buildAuditionLink } from './audition-link.js';
import { laneEvents, performSceneForReport, sceneSettings, sceneVoices } from './band-scene.js';
import {
    compareLevels,
    decodeCaptureChannel,
    stopClick,
    stopSilence,
    tempoFit,
} from './live-checks.js';
import { createNodeRenderer } from './mix-render-node.js';
import { createStaticServer } from './mix-report.js';
import {
    DEFAULT_MIX_REPORT_SCENES,
    MIX_REPORT_STEMS,
    parseExternalScenes,
} from './mix-report-utils.js';

const { chromium } = playwright as unknown as {
    chromium: typeof import('@playwright/test').chromium;
};

const REPO_ROOT = path.resolve(import.meta.dirname, '..');
const V2_DIR = path.join(REPO_ROOT, 'prototypes', 'v2');
const DIST_DIR = path.join(V2_DIR, 'out');
const RELEASE_TAIL_S = 2.0;

interface Options {
    scene: string;
    seed: string;
    bars: number;
    out: string;
    build: boolean;
    scenesFrom: string | null;
    json: boolean;
    /** Where the offline reference renders: the page's own `renderBand` (the stand's live state,
     * Chromium) or `mix-render-node.ts` (node's default state, the node engine). */
    offline: 'page' | 'node';
    /** Lanes switched off on the stand through the link (`bnd`): soloist, bass, chords. */
    off: Array<'soloist' | 'bass' | 'chords'>;
}

export function parseLiveCaptureArgs(argv: string[]): Options {
    const options: Options = {
        scene: 'funk-pocket',
        seed: 'ALPHA',
        bars: 8,
        out: 'tmp/live',
        build: false,
        scenesFrom: null,
        json: false,
        offline: 'page',
        off: [],
    };
    for (const arg of argv) {
        if (arg.startsWith('--scene=')) {
            options.scene = arg.slice('--scene='.length);
        } else if (arg.startsWith('--seed=')) {
            options.seed = arg.slice('--seed='.length);
        } else if (arg.startsWith('--bars=')) {
            const bars = Number.parseInt(arg.slice('--bars='.length), 10);
            if (!Number.isFinite(bars) || bars < 1) {
                throw new Error(`--bars=${arg.slice('--bars='.length)}: a positive whole number`);
            }
            options.bars = bars;
        } else if (arg.startsWith('--out=')) {
            options.out = arg.slice('--out='.length);
        } else if (arg.startsWith('--scenes-from=')) {
            options.scenesFrom = arg.slice('--scenes-from='.length);
        } else if (arg.startsWith('--offline=')) {
            const offline = arg.slice('--offline='.length);
            if (offline !== 'page' && offline !== 'node') {
                throw new Error(`--offline=${offline}: page or node`);
            }
            options.offline = offline;
        } else if (arg.startsWith('--off=')) {
            for (const part of arg.slice('--off='.length).split(',')) {
                const lane = part.trim();
                if (lane !== 'soloist' && lane !== 'bass' && lane !== 'chords') {
                    throw new Error(`--off=${lane}: soloist, bass or chords`);
                }
                options.off.push(lane);
            }
        } else if (arg === '--build') {
            options.build = true;
        } else if (arg === '--json') {
            options.json = true;
        } else {
            throw new Error(`unknown argument ${arg}`);
        }
    }
    return options;
}

function bridgeBuildPresent(): boolean {
    const chunks = path.join(DIST_DIR, '_next', 'static', 'chunks');
    if (!existsSync(chunks)) {
        return false;
    }
    return readdirSync(chunks).some(
        (name) =>
            name.endsWith('.js') &&
            readFileSync(path.join(chunks, name), 'utf8').includes('ensemble-band-render-bridge'),
    );
}

function run(command: string, args: string[], env: Record<string, string>): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            cwd: V2_DIR,
            env: { ...process.env, ...env },
            stdio: ['ignore', 'inherit', 'inherit'],
        });
        child.on('error', reject);
        child.on('exit', (code) =>
            code === 0
                ? resolve()
                : reject(new Error(`${command} ${args.join(' ')} exited ${code}`)),
        );
    });
}

/** The same build `mix:report --engine=chromium` makes: the bridge in, served at `/`. */
async function buildBridgeExport(): Promise<void> {
    const env = { NEXT_PUBLIC_RENDER_BRIDGE: '1', ENSEMBLE_V2_BASE: '/' };
    await run('npx', ['next', 'build', '--webpack'], env);
    await run('node', ['scripts/offline.mjs'], env);
}

// An external scene may carry a meter; the built-in catalog is 4/4 and omits it.
type Scene = (typeof DEFAULT_MIX_REPORT_SCENES)[number] & { timeSignature?: string };

/** The link `audition-link` builds for a scene, lane switches included. */
export function sceneUrl(base: string, scene: Scene, off: Options['off'] = []): string {
    return buildAuditionLink(scene, {
        scene: scene.id,
        seed: null,
        baseUrl: base,
        autoplay: false,
        ts: scene.timeSignature ?? '4/4',
        intensity: scene.intensity ?? 0.7,
        off,
    });
}

function beatsPerBar(scene: Scene): number {
    const [beats] = (scene.timeSignature ?? '4/4').split('/').map(Number);
    return beats || 4;
}

export async function runLiveCapture(argv = process.argv.slice(2)): Promise<void> {
    const options = parseLiveCaptureArgs(argv);
    const catalog = options.scenesFrom
        ? parseExternalScenes(
              readFileSync(path.resolve(REPO_ROOT, options.scenesFrom), 'utf8'),
              options.scenesFrom,
          )
        : DEFAULT_MIX_REPORT_SCENES;
    const scene = (catalog as Scene[]).find((candidate) => candidate.id === options.scene);
    if (!scene) {
        throw new Error(
            `unknown scene ${options.scene} (have: ${catalog.map((s) => s.id).join(', ')})`,
        );
    }
    const log = options.json ? process.stderr : process.stdout;

    if (options.build || !bridgeBuildPresent()) {
        if (!options.build) {
            throw new Error(
                'prototypes/v2/out has no render bridge — pass --build, or run `npm run mix:report -- --engine=chromium --scene=funk-pocket` first',
            );
        }
        log.write('Building the bridge export...\n');
        await buildBridgeExport();
    }

    const outDir = path.resolve(REPO_ROOT, options.out);
    mkdirSync(outDir, { recursive: true });
    const barSeconds = (60 / scene.bpm) * beatsPerBar(scene);
    const playSeconds = options.bars * barSeconds;

    const { server, port } = await createStaticServer(DIST_DIR, 0);
    const browser = await chromium.launch({
        headless: true,
        args: ['--autoplay-policy=no-user-gesture-required'],
    });
    try {
        const page = await browser.newPage();
        page.on('pageerror', (error) => log.write(`page error: ${error.message}\n`));
        await page.goto(sceneUrl(`http://127.0.0.1:${port}`, scene, options.off), {
            waitUntil: 'networkidle',
        });
        await page.waitForFunction(
            () =>
                document.documentElement.dataset.renderBridge === 'ready' &&
                Boolean(window.ensemble?.transport && window.ensemble?.capture),
            undefined,
            { timeout: 20000 },
        );
        log.write(
            `live: ${scene.id} · ${scene.genreFeel} · ${scene.bpm} bpm · ${options.bars} bars (${playSeconds.toFixed(1)} s) + ${RELEASE_TAIL_S} s release\n`,
        );

        // Prime the graph so the capture is already running when Play fires, then play, stop,
        // and keep recording through the release. All of it is real time.
        const sampleRate = await page.evaluate(() => {
            const bridge = window.ensemble!;
            bridge.transport!.prime();
            return bridge.capture!.start().sampleRate;
        });
        const {
            voices: liveVoices,
            settings: liveSettings,
            countIn,
        } = await page.evaluate(async () => {
            const bridge = window.ensemble!;
            bridge.capture!.mark('play');
            await bridge.transport!.play();
            bridge.capture!.mark('scheduled');
            return {
                voices: bridge.transport!.voices(),
                settings: bridge.transport!.settings(),
                countIn: bridge.transport!.countIn(),
            };
        });
        await page.waitForTimeout(playSeconds * 1000);
        await page.evaluate(() => {
            const bridge = window.ensemble!;
            bridge.capture!.mark('stop');
            bridge.transport!.stop();
        });
        await page.waitForTimeout(RELEASE_TAIL_S * 1000);
        const capture = await page.evaluate(() => window.ensemble!.capture!.stop());

        const channels = capture.channels.map(decodeCaptureChannel);
        const mono = new Float32Array(channels[0].length);
        for (const channel of channels) {
            for (let i = 0; i < mono.length; i++) {
                mono[i] += channel[i] / channels.length;
            }
        }
        const marker = (label: string) => {
            const found = capture.markers.find((m) => m.label === label);
            if (!found) {
                throw new Error(`capture has no "${label}" marker`);
            }
            return found.sample;
        };
        const wavPath = path.join(outDir, `${scene.id}-${options.seed}.wav`);
        writeFileSync(wavPath, Buffer.from(encodeWav(channels, sampleRate)));
        const markersPath = path.join(outDir, `${scene.id}-${options.seed}.markers.json`);
        writeFileSync(
            markersPath,
            JSON.stringify(
                {
                    scene: scene.id,
                    bpm: scene.bpm,
                    bars: options.bars,
                    sampleRate,
                    anchorTime: capture.anchorTime,
                    markers: capture.markers,
                },
                null,
                2,
            ),
        );

        const scheduled = marker('scheduled');
        const stop = marker('stop');
        // The band's first bar starts 0.1 s after it was scheduled (`BandHost.start`), after a
        // bar of count-in clicks when that preference is on. The judged region skips the first
        // bar on both sides and covers whole bars the stand actually played.
        const musicStart = scheduled + Math.round((0.1 + (countIn ? barSeconds : 0)) * sampleRate);
        const playedBars = Math.floor((stop - musicStart) / (barSeconds * sampleRate));
        if (capture.dropouts > 0) {
            log.write(
                `WARNING: ${capture.dropouts} capture block(s) arrived late — the main thread stalled; timing numbers below carry a seam\n`,
            );
        }
        if (countIn) {
            log.write(
                'the stand counted a bar in (playback.countIn); the music starts a bar after Play\n',
            );
        }

        const silence = stopSilence(mono, sampleRate, stop);
        const click = stopClick(mono, sampleRate, stop);
        const steady = {
            from: musicStart + Math.round(barSeconds * sampleRate),
            to: musicStart + Math.round(playedBars * barSeconds * sampleRate),
        };
        const tempo =
            playedBars >= 2
                ? tempoFit(mono, sampleRate, scene.bpm, {
                      fromSample: steady.from,
                      toSample: steady.to,
                      beatsPerBar: beatsPerBar(scene),
                  })
                : null;

        // The same scene offline, as the musician hears it live: the `full` stem (the lead lane
        // is off by default on the stand), on the sounds the stand actually played. By default
        // the PAGE renders it through its own `renderBand`, which clones the stand's live state
        // (genre, preferences, master volume) on the same engine the live graph runs on, so what
        // remains is the live path itself; `--offline=node` renders in node from node's default
        // state instead. The performance is re-rolled live, so this compares level and spectrum,
        // not samples.
        const voices = sceneVoices(scene, liveVoices);
        log.write(
            `offline (${options.offline}) on the stand's sounds: ${liveVoices.map((v) => `${v.module}=${v.voice}`).join(' ')}\n`,
        );
        // The stand's settings against the scene's: a difference here is a reason the two
        // performances differ before any audio is compared, so it is said out loud.
        const expected = sceneSettings(scene, options.seed, voices);
        const settingDiffs = (Object.keys(expected) as Array<keyof typeof expected>)
            .filter((key) => key !== 'seed')
            .filter((key) => JSON.stringify(expected[key]) !== JSON.stringify(liveSettings[key]))
            .map(
                (key) =>
                    `${key}: live ${JSON.stringify(liveSettings[key])} vs scene ${JSON.stringify(expected[key])}`,
            );
        log.write(
            settingDiffs.length === 0
                ? "band settings: the stand plays the scene's settings\n"
                : `band settings differ: ${settingDiffs.join('; ')}\n`,
        );
        const performed = performSceneForReport(scene, options.seed, 1, voices);
        const liveLanes = { ...performed.settings.lanes };
        for (const lane of options.off) {
            liveLanes[lane === 'chords' ? 'comp' : lane === 'soloist' ? 'lead' : 'bass'] = false;
        }
        const fullStem = MIX_REPORT_STEMS.find((stem) => stem.id === 'full')!;
        const request = {
            score: performed.score,
            passes: laneEvents(
                performed.bed,
                (fullStem.lanes as Array<'drums' | 'bass' | 'comp' | 'lead'>).filter(
                    (lane) => liveLanes[lane],
                ),
            ),
            bpm: scene.bpm,
            sampleRate,
            intensity: scene.intensity ?? 0.7,
            voices,
            randomSeed: `${scene.id}:${options.seed}`,
        };
        const offline =
            options.offline === 'page'
                ? await page.evaluate(async (req) => {
                      const render = await window.ensemble!.renderBand(req);
                      return {
                          channels: render.channels.map((channel) => Array.from(channel)),
                          leadInSeconds: render.leadInSeconds,
                          passSeconds: render.passSeconds,
                      };
                  }, request)
                : await (await createNodeRenderer()).renderAndMeasure(request, 1);
        const offlineMono = new Float32Array(offline.channels[0].length);
        for (const channel of offline.channels) {
            for (let i = 0; i < offlineMono.length; i++) {
                offlineMono[i] += channel[i] / offline.channels.length;
            }
        }
        // Whole bars both sides played: the live side what the stand got through before Stop,
        // the offline side what one pass holds. Fewer than two bars is nothing to compare.
        const passBars = Math.floor(offline.passSeconds / barSeconds);
        const comparedBars = Math.min(playedBars, passBars);
        if (comparedBars < playedBars) {
            log.write(
                `note: the scene's pass is ${passBars} bars; the live side played ${playedBars}, so the comparison covers bars 2–${comparedBars}\n`,
            );
        }
        const levels =
            comparedBars >= 2
                ? compareLevels(
                      {
                          samples: mono,
                          sampleRate,
                          from: steady.from,
                          to: musicStart + Math.round(comparedBars * barSeconds * sampleRate),
                      },
                      {
                          samples: offlineMono,
                          sampleRate,
                          from: Math.round((offline.leadInSeconds + barSeconds) * sampleRate),
                          to: Math.round(
                              (offline.leadInSeconds + comparedBars * barSeconds) * sampleRate,
                          ),
                      },
                  )
                : null;

        const report = {
            scene: scene.id,
            seed: options.seed,
            bars: options.bars,
            playedBars,
            countIn,
            dropouts: capture.dropouts,
            wav: wavPath,
            markers: markersPath,
            silence,
            click,
            tempo,
            levels,
        };
        if (options.json) {
            process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
            return;
        }
        const f = (v: number) => v.toFixed(1);
        log.write(`\nwrote ${path.relative(REPO_ROOT, wavPath)} and its markers\n\n`);
        log.write(
            silence.verifiable
                ? `stop silence   ${silence.silent ? 'SILENT' : 'NOT SILENT'}: ${f(silence.afterDb)} dBFS 1.2–1.6 s after Stop (floor ${silence.floorDb}); tail ${f(silence.tailDb)} dBFS at 0.4–0.8 s; ${f(silence.beforeDb)} dBFS the second before; under the floor after ${silence.decayMs === null ? 'never' : `${f(silence.decayMs)} ms`}\n`
                : `stop silence   NOT VERIFIABLE: ${silence.reason}\n`,
        );
        log.write(
            click.verifiable
                ? `stop click     ${click.click ? 'CLICK' : 'none'}: max discontinuity ${click.maxDiscontinuity.toFixed(2)} at +${f(click.atMs)} ms (threshold ${click.threshold})\n`
                : 'stop click     NOT VERIFIABLE: the capture ends inside the 400 ms after Stop\n',
        );
        log.write(
            tempo
                ? `tempo          ${tempo.onsets} onsets · median deviation ${f(tempo.medianDeviationMs)} ms from the sixteenth grid · drift ${tempo.driftMsPerBar >= 0 ? '+' : ''}${tempo.driftMsPerBar.toFixed(2)} ms/bar · ${tempo.bpmEstimate.toFixed(3)} bpm against ${tempo.bpmNominal}\n`
                : `tempo          NOT VERIFIABLE: ${playedBars < 2 ? 'fewer than two bars played' : 'fewer than 8 onsets in the steady region'}\n`,
        );
        if (levels) {
            const bands = Object.entries(levels.bandDeltaPoints)
                .map(([band, delta]) => `${band} ${delta >= 0 ? '+' : ''}${delta.toFixed(1)}`)
                .join('  ');
            log.write(
                `live/offline   ${levels.withinThreshold ? 'within' : 'OUTSIDE'} ±${levels.thresholdDb} dB over bars 2–${comparedBars}: live ${f(levels.liveDb)} vs offline ${f(levels.offlineDb)} dBFS (${levels.deltaDb >= 0 ? '+' : ''}${f(levels.deltaDb)} dB) · band shares, points: ${bands}\n`,
            );
        } else {
            log.write('live/offline   NOT VERIFIABLE: fewer than two whole bars to compare\n');
        }
    } finally {
        await browser.close();
        await new Promise<void>((resolve, reject) =>
            server.close((error: Error | undefined) => (error ? reject(error) : resolve())),
        );
    }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
    runLiveCapture().catch((error) => {
        console.error('\nlive:capture failed:', error);
        process.exitCode = 1;
    });
}
