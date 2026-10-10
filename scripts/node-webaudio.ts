/**
 * Web Audio in node, for rendering the band without a browser. Installs `node-web-audio-api`'s
 * classes as the globals the engine reaches for (`new OfflineAudioContext(...)` in
 * `renderBandPasses`) and points the sample loader at `public/packs/` on disk.
 *
 * The globals are read when a render runs, not when the engine's modules load, so import order
 * does not matter; `installDiskPackFetcher()` is called explicitly, after every import, because
 * the app's `lib/sounds.ts` installs its own fetcher as the bridge's import graph loads.
 *
 * The shipped `.m4a` files are decoded through ffmpeg into a WAV cache under `tmp/` the first
 * time each is asked for (`decodedWav` says why), and the node context decodes the WAV.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setPackAssetFetcher } from '@engine/engine/sample-loader';
import * as webaudio from 'node-web-audio-api';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_DIR = path.join(REPO_ROOT, 'public');
const PACKS_DIR = path.join(PUBLIC_DIR, 'packs');
const DECODE_CACHE = path.join(REPO_ROOT, 'tmp', 'node-webaudio', 'decoded');

/**
 * `node-web-audio-api` 2.2.0 (crate 1.7.0) evaluates a `setTargetAtTime` / `setValueCurveAtTime`
 * event BEFORE its start time, extrapolating the exponential backwards from the event instead of
 * holding the previous value — measured against Chromium with `tmp/node-render/parity`: a release
 * scheduled 0.5 s into a note multiplies the whole sustain by e^(0.5/τ). Pinning the parameter's
 * spec value at the event's start time, as a `setValueAtTime` placed just before it, restores the
 * spec's hold exactly (sample-identical to Chromium on every probe). The pin needs that value, so
 * every automation call on every `AudioParam` is recorded and replayed with the spec's formulas.
 */
type Automation =
    | { kind: 'set'; time: number; value: number }
    | { kind: 'linear' | 'exponential'; time: number; value: number }
    | { kind: 'target'; time: number; value: number; tau: number }
    | { kind: 'curve'; time: number; values: Float32Array; duration: number };

const timelines = new WeakMap<AudioParam, Automation[]>();

function eventsOf(param: AudioParam): Automation[] {
    let list = timelines.get(param);
    if (!list) {
        list = [];
        timelines.set(param, list);
    }
    return list;
}

type Ramp = Extract<Automation, { kind: 'linear' | 'exponential' }>;

function isRamp(event: Automation | undefined): event is Ramp {
    return event?.kind === 'linear' || event?.kind === 'exponential';
}

/** The value an event settles on once it has run its course (a target: its start value here,
 * since it only ever approaches the asymptote). */
function settledValue(event: Automation, startValue: number): number {
    switch (event.kind) {
        case 'target':
            return startValue;
        case 'curve':
            return event.values[event.values.length - 1];
        default:
            return event.value;
    }
}

/**
 * The value at `at` while `event` is in force (the spec's formulas, §1.6.3), `startValue` being
 * the parameter's value when the event began; `next` is the ramp that follows, if any. A ramp
 * that follows a target or a curve is taken to start from `settledValue` at the event's own time;
 * the spec is ambiguous there and no voice in the engine schedules that sequence.
 */
function shape(
    event: Automation,
    startValue: number,
    at: number,
    next: Automation | undefined,
): number {
    if (isRamp(next) && next.time > event.time) {
        const v0 = settledValue(event, startValue);
        if (at >= next.time) {
            return next.value;
        }
        const k = (at - event.time) / (next.time - event.time);
        if (next.kind === 'linear') {
            return v0 + (next.value - v0) * k;
        }
        return v0 === 0 || Math.sign(v0) !== Math.sign(next.value)
            ? v0
            : v0 * (next.value / v0) ** k;
    }
    switch (event.kind) {
        case 'target':
            return (
                event.value + (startValue - event.value) * Math.exp(-(at - event.time) / event.tau)
            );
        case 'curve': {
            const k = (at - event.time) / event.duration;
            if (k >= 1) {
                return event.values[event.values.length - 1];
            }
            const pos = k * (event.values.length - 1);
            const i = Math.floor(pos);
            const j = Math.min(i + 1, event.values.length - 1);
            return event.values[i] + (event.values[j] - event.values[i]) * (pos - i);
        }
        default:
            return event.value;
    }
}

/** The parameter's automation value just before `at`: one forward pass over the recorded events. */
function valueAt(param: AudioParam, at: number): number {
    const events = eventsOf(param);
    let inForce: Automation | null = null;
    let startValue = param.defaultValue;
    let index = 0;
    for (; index < events.length && events[index].time <= at; index++) {
        const event = events[index];
        const before = inForce ? shape(inForce, startValue, event.time, event) : startValue;
        // A ramp that has completed by `at` leaves the value at its end; the event it ramped
        // from is no longer in force.
        startValue = isRamp(event) ? event.value : event.kind === 'set' ? event.value : before;
        inForce = event;
    }
    if (!inForce) {
        return startValue;
    }
    return shape(inForce, startValue, at, events[index]);
}

function insert(param: AudioParam, event: Automation): void {
    const events = eventsOf(param);
    // Keep time order; a later insertion at the same time goes after (the spec's rule).
    let i = events.length;
    while (i > 0 && events[i - 1].time > event.time) {
        i--;
    }
    events.splice(i, 0, event);
}

function patchAudioParam(): void {
    const proto = webaudio.AudioParam.prototype as AudioParam;
    const native = {
        setValueAtTime: proto.setValueAtTime,
        linearRampToValueAtTime: proto.linearRampToValueAtTime,
        exponentialRampToValueAtTime: proto.exponentialRampToValueAtTime,
        setTargetAtTime: proto.setTargetAtTime,
        setValueCurveAtTime: proto.setValueCurveAtTime,
        cancelScheduledValues: proto.cancelScheduledValues,
        value: Object.getOwnPropertyDescriptor(proto, 'value'),
    };
    proto.setValueAtTime = function (value: number, time: number) {
        insert(this, { kind: 'set', time, value });
        return native.setValueAtTime.call(this, value, time);
    };
    proto.linearRampToValueAtTime = function (value: number, time: number) {
        insert(this, { kind: 'linear', time, value });
        return native.linearRampToValueAtTime.call(this, value, time);
    };
    proto.exponentialRampToValueAtTime = function (value: number, time: number) {
        insert(this, { kind: 'exponential', time, value });
        return native.exponentialRampToValueAtTime.call(this, value, time);
    };
    proto.setTargetAtTime = function (target: number, time: number, tau: number) {
        const pin = valueAt(this, time);
        if (Number.isFinite(pin)) {
            insert(this, { kind: 'set', time, value: pin });
            native.setValueAtTime.call(this, pin, time);
        }
        insert(this, { kind: 'target', time, value: target, tau });
        return native.setTargetAtTime.call(this, target, time, tau);
    };
    proto.setValueCurveAtTime = function (
        values: Float32Array | number[],
        time: number,
        duration: number,
    ) {
        // A curve's pin has to land strictly before the curve (one placed AT its start holds the
        // pin for the curve's first sample instead); two 48 kHz samples early is under two
        // samples of extra hold at any rate the engine renders at.
        const pinTime = Math.max(0, time - 2 / 48000);
        const pin = valueAt(this, pinTime);
        if (Number.isFinite(pin) && pinTime < time) {
            insert(this, { kind: 'set', time: pinTime, value: pin });
            native.setValueAtTime.call(this, pin, pinTime);
        }
        insert(this, { kind: 'curve', time, values: Float32Array.from(values), duration });
        return native.setValueCurveAtTime.call(this, values as Float32Array, time, duration);
    };
    proto.cancelScheduledValues = function (time: number) {
        const events = eventsOf(this);
        const kept = events.filter(
            (e) => e.time < time && !(e.kind === 'curve' && e.time + e.duration > time),
        );
        events.splice(0, events.length, ...kept);
        return native.cancelScheduledValues.call(this, time);
    };
    const valueAccessor = native.value;
    if (valueAccessor?.set && valueAccessor.get) {
        const setValue = valueAccessor.set;
        Object.defineProperty(proto, 'value', {
            configurable: true,
            get: valueAccessor.get,
            set(this: AudioParam, v: number) {
                // The spec treats an assignment as `setValueAtTime(v, currentTime)`; an offline
                // context's clock is 0 until it renders, which is when every call here happens.
                insert(this, { kind: 'set', time: 0, value: v });
                setValue.call(this, v);
            },
        });
    }
}

patchAudioParam();

Object.assign(globalThis, {
    OfflineAudioContext: webaudio.OfflineAudioContext,
    AudioContext: webaudio.AudioContext,
    AudioBuffer: webaudio.AudioBuffer,
    PeriodicWave: webaudio.PeriodicWave,
});

/**
 * Decode an `.m4a` to WAV with ffmpeg, once, into a cache under `tmp/`. Two reasons not to hand
 * the AAC bytes to the node decoder: the shipped files keep `moov` after `mdat` (no faststart),
 * which symphonia refuses ("missing moov atom"); and symphonia does not trim the AAC encoder's
 * priming delay, so every sampled note landed ~1024 samples late against Chromium, whose decoder
 * trims it. ffmpeg trims it, so the WAV starts where the browser's decoded buffer starts.
 */
function decodedWav(source: string, relative: string): string {
    // Keyed by the source's size and mtime too, so a re-encoded pack never renders stale audio.
    const stat = statSync(source);
    const target = path.join(
        DECODE_CACHE,
        relative.replace(/\.m4a$/, `.${stat.size}-${Math.round(stat.mtimeMs)}.wav`),
    );
    if (!existsSync(target)) {
        mkdirSync(path.dirname(target), { recursive: true });
        // Decode to a private temp name and rename into place, so a killed ffmpeg or a second
        // process decoding the same file can never leave a truncated WAV that is then served.
        const partial = `${target}.${process.pid}.part`;
        const result = spawnSync(
            'ffmpeg',
            ['-v', 'error', '-y', '-i', source, '-c:a', 'pcm_f32le', '-f', 'wav', partial],
            { encoding: 'utf8' },
        );
        if (result.status !== 0) {
            rmSync(partial, { force: true });
            throw new Error(`ffmpeg decode failed for ${relative}: ${result.stderr}`);
        }
        renameSync(partial, target);
    }
    return target;
}

/**
 * Serve `/packs/<id>/<file>` (rev token stripped) from `public/packs/` on disk. Installed on
 * `globalThis.fetch`, not only through `setPackAssetFetcher`: the app's `lib/sounds.ts` installs
 * its own fetcher as the bridge's import graph loads, and `tsx` can hold the sample loader as two
 * module instances, so the one place every pack request is guaranteed to end up is `fetch`.
 */
export function installDiskPackFetcher(): void {
    const servePack = async (url: string): Promise<Response> => {
        // The URL parser has already collapsed `..` segments; the resolved path must still sit
        // inside `public/packs/` and name a regular file.
        const relative = new URL(url, 'http://localhost/').pathname.replace(/^\//, '');
        const file = path.join(PUBLIC_DIR, relative);
        if (
            !file.startsWith(PACKS_DIR + path.sep) ||
            !existsSync(file) ||
            !statSync(file).isFile()
        ) {
            return new Response(null, { status: 404 });
        }
        const served = file.endsWith('.m4a') ? decodedWav(file, relative) : file;
        return new Response(readFileSync(served), {
            status: 200,
            headers: { 'content-type': file.endsWith('.json') ? 'application/json' : 'audio/wav' },
        });
    };
    setPackAssetFetcher(servePack);
    const nativeFetch = globalThis.fetch;
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
        const url =
            typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        // Only this origin's packs: a relative `/packs/…` or one on localhost. A real remote
        // `/packs/` URL is never shadowed.
        if (/^(https?:\/\/localhost(:\d+)?)?\/packs\//.test(url)) {
            return servePack(url);
        }
        return nativeFetch(input, init);
    }) as typeof fetch;
}
