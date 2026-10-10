/** Spike: render a mix:report scene in node through the same `renderBand` the browser bridge runs. */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Lane } from '../band/index.js';
import { renderBand } from '../prototypes/v2/lib/render-bridge.js';
import { encodeWav } from '../public/engine/wav-encoder.js';
import { laneEvents, performSceneForReport, sceneVoices } from './band-scene.js';
import { DEFAULT_MIX_REPORT_SCENES, MIX_REPORT_STEMS } from './mix-report-utils.js';
import { installDiskPackFetcher } from './node-webaudio.js';

// After every import: the app's `lib/sounds.ts` installs its own fetcher when it loads.
installDiskPackFetcher();
const sceneId = process.argv[2] ?? 'funk-pocket';
const seed = process.argv[3] ?? 'MIX_AUDIT';
const outDir = process.argv[4] ?? 'tmp/node-render/node';
const muteReverb = process.argv.includes('--mute-reverb');
const only = process.argv
    .find((a) => a.startsWith('--stems='))
    ?.slice(8)
    .split(',');
const scenesFrom = process.argv.find((a) => a.startsWith('--scenes-from='))?.slice(14);
const catalog = scenesFrom
    ? (JSON.parse(readFileSync(scenesFrom, 'utf8')) as typeof DEFAULT_MIX_REPORT_SCENES)
    : DEFAULT_MIX_REPORT_SCENES;
const scene = catalog.find((s) => s.id === sceneId);
if (!scene) {
    throw new Error(`unknown scene ${sceneId}`);
}
mkdirSync(outDir, { recursive: true });

const voices = sceneVoices(scene);
const t0 = performance.now();
const performed = performSceneForReport(scene, seed, 1, voices);
console.log(`performed ${sceneId} in ${(performance.now() - t0).toFixed(0)} ms`);
const stems = MIX_REPORT_STEMS.filter((stem) => !only || only.includes(stem.id));
if (stems.length === 0) {
    throw new Error(
        `--stems=${only?.join(',')} matches no stem (${MIX_REPORT_STEMS.map((s) => s.id).join(', ')})`,
    );
}
for (const stem of stems) {
    const t = performance.now();
    const render = await renderBand({
        score: performed.score,
        passes: laneEvents(
            performed[stem.performance as 'band' | 'bed'],
            stem.lanes as readonly Lane[],
        ),
        bpm: scene.bpm,
        sampleRate: 44100,
        intensity: performed.settings.intensity ?? 0.7,
        voices,
        randomSeed: `${scene.id}:${seed}`,
        genreFeel: scene.genreFeel,
        muteReverb,
    });
    const wav = encodeWav(render.channels, render.sampleRate);
    const file = path.join(outDir, `${scene.id}-${stem.id}-${seed}.wav`);
    writeFileSync(file, Buffer.from(wav));
    let peak = 0;
    for (const channel of render.channels) {
        for (const sample of channel) {
            peak = Math.max(peak, Math.abs(sample));
        }
    }
    console.log(
        `${stem.id.padEnd(10)} ${render.durationSeconds.toFixed(2)}s  events ${render.dispatched.length}  peak ${(20 * Math.log10(peak || 1e-9)).toFixed(1)} dBFS  ${(performance.now() - t).toFixed(0)} ms`,
    );
}
