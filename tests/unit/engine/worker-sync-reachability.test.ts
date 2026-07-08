// @ts-nocheck
/* eslint-disable */
/**
 * @vitest-environment happy-dom
 *
 * Worker-sync delta-reachability gate (#1012).
 *
 * The failure mode this guards: a field is added to a `build*SyncPayload` builder
 * (so it ships in the full snapshot) but the parallel hand-written delta `switch`
 * in `syncWorker()` never gets a matching case — so the worker gets the field once
 * at play-start and then silently runs on a stale value forever. Most recently bit
 * as #1002 (`isEndingPending` / `songMode`); the #698 chords-`voice` note-generation
 * bug was the same class. #919 consolidated the *snapshot* side into per-module
 * builders; this test converts the delta side's "reviewer discipline" into a CI gate.
 *
 * How it works — a single source of truth plus a thin classification overlay:
 *   • SNAPSHOT fields are derived reflectively from the REAL builders (via the real
 *     `getSyncState()`), so nobody re-lists them here — add a field to a builder and
 *     it shows up automatically.
 *   • WORKER_SYNC_MANIFEST classifies each snapshot field as either
 *       { delta: '<ACTION>' }        — a live delta case carries it, OR
 *       { snapshotOnly: '<reason>' } — it reaches the worker only via a full
 *                                      `syncWorker()` (bulk/structural rebuild, key &
 *                                      arranger edits), worker-internal running
 *                                      state, replay state, or a static default —
 *                                      each with a documented reason.
 *
 * Three assertions form the gate:
 *   1. COMPLETENESS — every snapshot field has a manifest entry, and no manifest
 *      entry references a field that no longer exists. A newly-added snapshot field
 *      fails here until it is classified (and, if it's a live-changing scalar, given
 *      a delta case). This is the #1002 tripwire.
 *   2. DELTA PLUMBING — every `delta`-tagged field, when its action is driven through
 *      the REAL `syncWorker()`, actually appears in the emitted delta payload. Catches
 *      a case that dropped/renamed a field or a wrong action tag.
 *   3. ANNOTATION — every `snapshotOnly` field carries a non-empty reason string.
 *
 * Known limitations (documented, not holes): `snapshotOnly` fields are classified,
 * not behaviorally driven — the gate trusts the reason. And a `delta` tag proves the
 * field is *emitted* by the delta, not that the worker's read path matches the emitted
 * shape (emission ≠ consumption — see the sessionSteps note below for why that gap
 * matters). Its strong guarantees are completeness (no unclassified field) and delta
 * plumbing for the tagged scalars, which is exactly where the #1002 class of bug lives.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

// A fully-populated plain-object state: every worker-synced field is present with a
// defined sentinel and every nested container (session/audio/instruments) exists, so
// the real builders enumerate the full snapshot shape and the delta cases (which read
// `getState()`) emit defined values. Values are irrelevant — only KEY presence matters.
function makePopulatedState() {
    const num = 1;
    const str = 'x';
    const arr = [1];
    // Opaque data maps (dynamic keys) — the builders pass them through by reference,
    // so the *field itself* is the leaf. Empty objects keep flattenPaths from
    // descending into per-key noise.
    const map = () => ({});
    return {
        playback: {
            isPlaying: true,
            step: num,
            bpm: num,
            bandIntensity: num,
            complexity: num,
            autoIntensity: true,
            practiceMode: true,
            sessionTimer: num,
            sessionStartTime: num,
            intent: str,
            conductorVelocity: num,
            songMode: true,
            isEndingPending: true,
            currentLoopCount: num,
            loopStartStep: num,
            loopEndStep: num,
        },
        arranger: {
            progression: arr,
            stepMap: arr,
            sectionMap: arr,
            totalSteps: num,
            key: str,
            isMinor: false,
            timeSignature: '4/4',
            grouping: arr,
            sections: [{ id: str, value: str }],
            measureMap: arr,
            seed: num,
        },
        chords: {
            style: str,
            octave: num,
            density: num,
            enabled: true,
            volume: num,
            rhythmicMask: num,
            voice: str,
        },
        bass: { style: str, octave: num, enabled: true, lastFreq: num, volume: num },
        soloist: {
            style: str,
            octave: num,
            enabled: true,
            volume: num,
            mode: str,
            phrasingIntensity: num,
            tradeMode: str,
            hookRetentionProb: num,
            session: { sessionSteps: num, seed: num, hook: map() },
            audio: { lastFreq: num },
        },
        harmony: {
            style: str,
            octave: num,
            enabled: true,
            volume: num,
            reverb: num,
            complexity: num,
            pocketOffset: num,
        },
        groove: {
            enabled: true,
            genreFeel: str,
            swing: num,
            swingSub: '8th',
            humanize: num,
            pocket: num,
            sectionSeedMap: map(),
            lastDrumPreset: str,
            fillActive: false,
            variations: arr,
            measures: arr,
            orchestrationMap: map(),
            fillMap: map(),
            accentMap: map(),
            seedTimelineStartStep: num,
            instruments: [{ name: str, steps: arr, muted: false }],
        },
        midi: {
            enabled: true,
            chordsChannel: num,
            bassChannel: num,
            soloistChannel: num,
            harmonyChannel: num,
            drumsChannel: num,
            latency: num,
            chordsOctave: num,
            bassOctave: num,
            soloistOctave: num,
            harmonyOctave: num,
            drumsOctave: num,
            velocitySensitivity: num,
        },
    };
}

// Mock `state.js`: keep the REAL builders (single source of truth for snapshot shape)
// but serve our populated state to `getState()`/`getSyncState()`.
vi.mock('../../../public/state.js', async () => {
    const actual = (await vi.importActual('../../../public/state.js')) as any;
    const stateMap = makePopulatedState();
    return {
        ...actual,
        getState: () => stateMap,
        getSyncState: () => ({
            playback: actual.buildPlaybackSyncPayload(stateMap.playback),
            arranger: actual.buildArrangerSyncPayload(stateMap.arranger),
            chords: actual.buildChordsSyncPayload(stateMap.chords),
            bass: actual.buildBassSyncPayload(stateMap.bass),
            soloist: actual.buildSoloistSyncPayload(stateMap.soloist),
            harmony: actual.buildHarmonySyncPayload(stateMap.harmony),
            groove: actual.buildGrooveSyncPayload(stateMap.groove),
            midi: actual.buildMidiSyncPayload(stateMap.midi),
        }),
        dispatch: vi.fn(),
        subscribe: vi.fn(),
    };
});

import { getSyncState } from '../../../public/state.js';

global.Worker = class MockWorker {
    url: any;
    options: any;
    postMessage: any;
    constructor(url: any, options: any) {
        this.url = url;
        this.options = options;
        this.postMessage = vi.fn();
    }
} as any;

const { syncWorker, initWorker, getTimerWorker } = await import('../../../public/worker-client.js');

/**
 * The classification overlay. Keyed by dotted snapshot path.
 *   { delta: ACTION }        — verified: driving ACTION emits this field.
 *   { delta, emitPath }      — same, but the delta emits it under a different key
 *                              (a documented flat-vs-nested shape quirk).
 *   { snapshotOnly: reason } — annotated: reaches the worker only via a full sync,
 *                              is worker-internal/replay state, or a static default.
 */
const WORKER_SYNC_MANIFEST: Record<
    string,
    { delta: string; emitPath?: string } | { snapshotOnly: string }
> = {
    // --- playback ---
    'playback.isPlaying': { delta: 'TOGGLE_PLAY' },
    'playback.step': {
        snapshotOnly: 'worker maintains its own scheduler step; seeded once at play-start',
    },
    'playback.bpm': { delta: 'SET_BPM' },
    'playback.bandIntensity': { delta: 'SET_BAND_INTENSITY' },
    'playback.complexity': { delta: 'SET_COMPLEXITY' },
    'playback.autoIntensity': { delta: 'SET_AUTO_INTENSITY' },
    'playback.practiceMode': { delta: 'SET_PARAM' },
    'playback.sessionTimer': { delta: 'SET_SESSION_TIMER' },
    'playback.sessionStartTime': { delta: 'TOGGLE_PLAY' },
    'playback.modals': { snapshotOnly: 'always {} — vestigial stub; no worker read' },
    'playback.intent': { delta: 'UPDATE_CONDUCTOR_DECISION' },
    'playback.conductorVelocity': { delta: 'UPDATE_CONDUCTOR_DECISION' },
    'playback.songMode': { delta: 'SET_SONG_MODE' },
    'playback.isEndingPending': { delta: 'SET_ENDING_PENDING' },
    'playback.currentLoopCount': { delta: 'LOOP_BOUNDARY' },
    'playback.loopStartStep': { delta: 'SET_PRACTICE_LOOP' },
    'playback.loopEndStep': { delta: 'SET_PRACTICE_LOOP' },

    // --- arranger: structural + key edits ride a FULL syncWorker() (arranger-controller.ts,
    // KeySignatureControls.tsx, app-controller.ts). ARRANGER_UPDATE is an unused legacy case;
    // `sections` additionally has a live SET_PARAM path (InlineEditor.tsx chord mutation). ---
    'arranger.progression': {
        snapshotOnly:
            'derived arranger structure; rebuilt + full syncWorker() on progression edits',
    },
    'arranger.stepMap': {
        snapshotOnly:
            'derived arranger structure; rebuilt + full syncWorker() on progression edits',
    },
    'arranger.sectionMap': {
        snapshotOnly:
            'derived arranger structure; rebuilt + full syncWorker() on progression edits',
    },
    'arranger.totalSteps': {
        snapshotOnly:
            'derived arranger structure; rebuilt + full syncWorker() on progression edits',
    },
    'arranger.key': { snapshotOnly: 'key change → full syncWorker() (KeySignatureControls.tsx)' },
    'arranger.isMinor': {
        snapshotOnly: 'key change → full syncWorker() (KeySignatureControls.tsx)',
    },
    'arranger.timeSignature': {
        // Reaches the worker via the play-start full sync (scheduler-core.ts). NOTE:
        // a mid-playback meter change via updateTimeSignature does NOT sync the worker
        // (no delta case, no flushBuffers) — a known pre-existing gap, see #1030.
        snapshotOnly: 'full sync at play-start; mid-play meter change is a known gap (#1030)',
    },
    'arranger.grouping': {
        // Synced via cycleGrouping() → flushBuffers()+syncWorker(); but a meter change
        // via updateTimeSignature resets grouping without a sync — same gap as #1030.
        snapshotOnly:
            'full sync via cycleGrouping()/play-start; meter-change path is the #1030 gap',
    },
    'arranger.sections': { delta: 'SET_PARAM' },
    'arranger.measureMap': {
        snapshotOnly:
            'derived arranger structure; rebuilt + full syncWorker() on progression edits',
    },
    'arranger.seed': {
        snapshotOnly:
            'WORKER_CONTRACT §8 main-thread-only: consumed on the main thread to derive sessionSeed/drum maps, which cross via their own deltas',
    },

    // --- chords ---
    'chords.style': { delta: 'SET_STYLE' },
    'chords.octave': { delta: 'SET_OCTAVE' },
    'chords.density': { delta: 'UPDATE_CONDUCTOR_DECISION' },
    'chords.enabled': { delta: 'SET_PARAM' },
    'chords.volume': { delta: 'SET_VOLUME' },
    'chords.rhythmicMask': {
        snapshotOnly:
            '#906 worker-owned (@worker-mutation in accompaniment.ts); main thread never sets it, and WORKER_MANAGED_KEYS protects it from sync stomp',
    },
    'chords.voice': { delta: 'SET_INSTRUMENT_VOICE' },

    // --- bass ---
    'bass.style': { delta: 'SET_STYLE' },
    'bass.octave': { delta: 'SET_OCTAVE' },
    'bass.enabled': { delta: 'SET_PARAM' },
    'bass.lastFreq': {
        snapshotOnly: 'audio-continuity running value; worker maintains its own, snapshot seeds it',
    },
    'bass.volume': { delta: 'SET_VOLUME' },

    // --- soloist ---
    'soloist.style': { delta: 'SET_STYLE' },
    'soloist.octave': { delta: 'SET_OCTAVE' },
    'soloist.enabled': { delta: 'SET_PARAM' },
    'soloist.volume': { delta: 'SET_VOLUME' },
    'soloist.mode': { delta: 'SET_SOLOIST_MODE' },
    'soloist.phrasingIntensity': { delta: 'SET_PARAM' },
    'soloist.tradeMode': { delta: 'SET_PARAM' },
    'soloist.hookRetentionProb': { delta: 'UPDATE_CONDUCTOR_DECISION' },
    // Reaches the worker only nested via the full snapshot/flush, which is exactly how
    // its worker consumer reads it (`soloist.session.sessionSteps`, midi-worker-logic.ts).
    // (The `SET_SESSION_STEPS` case in syncWorker() is dead — never dispatched, not in
    // ACTIONS — and would emit a FLAT `soloist.sessionSteps` the worker never reads, so
    // it is deliberately NOT tagged as a live delta here.)
    'soloist.session.sessionSteps': {
        snapshotOnly:
            'runtime step counter; rides the full snapshot nested, read nested by the export processor',
    },
    'soloist.session.seed': {
        snapshotOnly:
            'seeded at play-start; rides the full snapshot/flush, never a delta (see UPDATE_SB note)',
    },
    'soloist.session.hook': {
        snapshotOnly:
            '#555 verbatim hook replay; captured main-thread next to seed, rides the full snapshot',
    },
    'soloist.audio.lastFreq': {
        snapshotOnly: 'audio-continuity running value; worker-internal',
    },

    // --- harmony ---
    'harmony.style': { delta: 'SET_STYLE' },
    'harmony.octave': { delta: 'SET_OCTAVE' },
    'harmony.enabled': { delta: 'SET_PARAM' },
    'harmony.volume': { delta: 'SET_VOLUME' },
    'harmony.reverb': { delta: 'SET_PARAM' },
    'harmony.complexity': { delta: 'SET_COMPLEXITY' },
    'harmony.pocketOffset': {
        snapshotOnly:
            'static default 0; the conductor writes bass.pocketOffset (not harmony), so harmony never mutates it at runtime',
    },

    // --- groove: scalar feel knobs go via their own deltas / SET_PARAM; the bulk drum
    // arrangement maps are regenerated by loadDrumPreset/conductor and pushed via UPDATE_GB
    // or the full sync. ---
    'groove.enabled': { delta: 'SET_PARAM' },
    'groove.genreFeel': { delta: 'SET_GENRE_FEEL' },
    'groove.swing': { delta: 'SET_SWING' },
    'groove.swingSub': { delta: 'SET_SWING_SUB' },
    'groove.humanize': { delta: 'SET_PARAM' },
    'groove.pocket': { delta: 'SET_PARAM' },
    'groove.sectionSeedMap': { delta: 'SET_GENRE_FEEL' },
    'groove.lastDrumPreset': {
        snapshotOnly: 'set by loadDrumPreset; rides UPDATE_GB / full sync (bulk drum state)',
    },
    'groove.fillActive': {
        snapshotOnly: 'conductor fill flag; pushed via UPDATE_GB / full sync',
    },
    'groove.variations': {
        snapshotOnly: 'bulk drum arrangement map; regenerated by loadDrumPreset/conductor',
    },
    'groove.measures': {
        snapshotOnly: 'bulk drum arrangement map; regenerated by loadDrumPreset/conductor',
    },
    'groove.orchestrationMap': {
        snapshotOnly: 'bulk drum arrangement map; regenerated by loadDrumPreset/conductor',
    },
    'groove.fillMap': {
        snapshotOnly: 'bulk drum arrangement map; regenerated by loadDrumPreset/conductor',
    },
    'groove.accentMap': {
        snapshotOnly: 'bulk drum arrangement map; regenerated by loadDrumPreset/conductor',
    },
    'groove.seedTimelineStartStep': {
        snapshotOnly: 'seeded-timeline anchor; rides UPDATE_GB / full sync',
    },
    'groove.instruments': {
        snapshotOnly: 'drum pattern grid; pushed via UPDATE_GB (loadDrumPreset) / full sync',
    },

    // --- midi: every field forwards via SET_MIDI_CONFIG (the config controls dispatch it) ---
    'midi.enabled': { delta: 'SET_MIDI_CONFIG' },
    'midi.chordsChannel': { delta: 'SET_MIDI_CONFIG' },
    'midi.bassChannel': { delta: 'SET_MIDI_CONFIG' },
    'midi.soloistChannel': { delta: 'SET_MIDI_CONFIG' },
    'midi.harmonyChannel': { delta: 'SET_MIDI_CONFIG' },
    'midi.drumsChannel': { delta: 'SET_MIDI_CONFIG' },
    'midi.latency': { delta: 'SET_MIDI_CONFIG' },
    'midi.chordsOctave': { delta: 'SET_MIDI_CONFIG' },
    'midi.bassOctave': { delta: 'SET_MIDI_CONFIG' },
    'midi.soloistOctave': { delta: 'SET_MIDI_CONFIG' },
    'midi.harmonyOctave': { delta: 'SET_MIDI_CONFIG' },
    'midi.drumsOctave': { delta: 'SET_MIDI_CONFIG' },
    'midi.velocitySensitivity': { delta: 'SET_MIDI_CONFIG' },
};

/** Flatten an object to dotted leaf paths. Arrays, primitives, and empty objects are leaves. */
function flattenPaths(obj: any, prefix = '', out = new Set<string>()): Set<string> {
    for (const [k, v] of Object.entries(obj)) {
        const path = prefix ? `${prefix}.${k}` : k;
        if (v && typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length > 0) {
            flattenPaths(v, path, out);
        } else {
            out.add(path);
        }
    }
    return out;
}

// Build the drive (action, payload) for a delta-tagged field. Module-keyed generic
// deltas derive their payload from the field's own path so the drive proves that this
// specific field's key survives the delta plumbing.
function driveFor(path: string, action: string): [string, any] {
    const [module, ...rest] = path.split('.');
    const leaf = rest[rest.length - 1];
    switch (action) {
        case 'SET_PARAM':
            return [action, { module, param: leaf, value: 1 }];
        case 'SET_STYLE':
            return [action, { module, style: 'x' }];
        case 'SET_VOLUME':
            return [action, { module, value: 1 }];
        case 'SET_OCTAVE':
            return [action, { module, value: 1 }];
        case 'SET_INSTRUMENT_VOICE':
            return [action, { module, voice: 'x' }];
        case 'SET_MIDI_CONFIG':
            return [action, { [leaf]: 1 }];
        case 'SET_SWING':
            return [action, 1];
        case 'SET_SWING_SUB':
            return [action, '16th'];
        case 'SET_SESSION_STEPS':
            return [action, 1];
        case 'SET_SOLOIST_MODE':
            return [action, 'polyphonic'];
        case 'SET_SESSION_TIMER':
            return [action, 1];
        default:
            // Dedicated cases read their values from getState() — no payload needed.
            return [action, undefined];
    }
}

describe('Worker-sync delta reachability (#1012)', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        initWorker();
    });

    it('classifies every snapshot field and has no stale manifest entries', () => {
        const snapshotPaths = flattenPaths(getSyncState());
        const manifestPaths = new Set(Object.keys(WORKER_SYNC_MANIFEST));

        const unclassified = [...snapshotPaths].filter((p) => !manifestPaths.has(p)).sort();
        const stale = [...manifestPaths].filter((p) => !snapshotPaths.has(p)).sort();

        // A newly-added snapshot field lands in `unclassified` until it is given a
        // manifest entry (and, if it changes live, a delta case). This is the gate.
        expect(unclassified, 'snapshot fields missing a WORKER_SYNC_MANIFEST entry').toEqual([]);
        expect(stale, 'manifest entries for fields no longer in the snapshot').toEqual([]);
    });

    it('emits every delta-tagged field when its action is driven through syncWorker', () => {
        const failures: string[] = [];
        const worker: any = getTimerWorker();

        for (const [path, entry] of Object.entries(WORKER_SYNC_MANIFEST)) {
            if (!('delta' in entry)) {
                continue;
            }
            worker.postMessage.mockClear();
            const [action, payload] = driveFor(path, entry.delta);
            syncWorker(action, payload);

            const calls = worker.postMessage.mock.calls;
            if (calls.length === 0) {
                failures.push(`${path}: driving ${action} emitted no delta at all`);
                continue;
            }
            const emitted = flattenPaths(calls[calls.length - 1][0].data);
            const expectedPath = entry.emitPath ?? path;
            if (!emitted.has(expectedPath)) {
                failures.push(
                    `${path}: ${action} delta did not carry it (emitted: ${[...emitted].join(', ')})`,
                );
            }
        }

        expect(failures, 'delta-tagged fields not reachable via their tagged action').toEqual([]);
    });

    it('documents a reason for every snapshot-only field', () => {
        const missingReason = Object.entries(WORKER_SYNC_MANIFEST)
            .filter(([, e]) => 'snapshotOnly' in e && !(e as any).snapshotOnly?.trim())
            .map(([p]) => p);
        expect(missingReason, 'snapshot-only fields lacking a documented reason').toEqual([]);
    });
});
