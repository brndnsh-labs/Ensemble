import { useEffect, useState } from 'preact/hooks';
import { packsForInstrument, SOUND_PACKS, type SoundPack } from '../data/sound-packs.js';
import { clearPack, isPackLoaded } from '../engine/instrument-registry.js';
import { ensurePackLoaded, getPackZones } from '../engine/pack-runtime.js';
import { pickZone, playSampledNote } from '../engine/sample-voice.js';
import { saveCurrentState } from '../persistence.js';
import { dispatch, getState } from '../state.js';
import { ACTIONS, type InstrumentModule, type InstrumentVoice } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';
import { Icon } from './Icon.jsx';
import { SettingGroup } from './UIControls.jsx';

const MODULE_LABELS: Record<InstrumentModule, string> = {
    chords: 'Chords',
    bass: 'Bass',
    soloist: 'Soloist',
    harmony: 'Harmony',
    groove: 'Drums',
};

// Instrument module → its `audioGraph` mix-bus key (names diverge: harmony →
// harmonies, groove → drums) — used to preview through the right bus.
const GRAPH_BUS: Record<InstrumentModule, 'chords' | 'bass' | 'soloist' | 'harmonies' | 'drums'> = {
    chords: 'chords',
    bass: 'bass',
    soloist: 'soloist',
    harmony: 'harmonies',
    groove: 'drums',
};

// A C-major triad — the preview gesture for a pitched pack.
const PREVIEW_MIDIS = [60, 64, 67];

/**
 * Ensure a live `AudioContext` exists (creating one on this user gesture if the
 * band hasn't played yet) so install/preview can decode + play. Returns the
 * context, or `null` if the platform can't provide one.
 */
function ensureAudio(): AudioContext | null {
    let audio = getState().playback.audio;
    if (!audio) {
        // Routes through initAudio (sanctioned one-shot graph setup); also kicks
        // off loading for any already-selected pack voice.
        dispatch(ACTIONS.INIT_AUDIO);
        audio = getState().playback.audio;
    }
    return audio ?? null;
}

/**
 * Whether a pack's files live in the SW `/packs/` cache — the persistent source
 * of truth for "installed". Survives reloads (the decoded-buffer cache does
 * not), so a pack installed once stays installed until removed. Checks the
 * manifest, written last-ish by a successful install.
 */
async function isPackCached(packId: string): Promise<boolean> {
    if (typeof caches === 'undefined') {
        return false;
    }
    const manifestUrl = `/packs/${packId}/manifest.json`;
    for (const name of await caches.keys()) {
        if (!name.includes('packs')) {
            continue;
        }
        const cache = await caches.open(name);
        if (await cache.match(manifestUrl)) {
            return true;
        }
    }
    return false;
}

/** Evict a pack's cached audio files from Cache Storage (the SW `/packs/` cache). */
async function evictPackCache(packId: string): Promise<void> {
    if (typeof caches === 'undefined') {
        return;
    }
    const prefix = `/packs/${packId}/`;
    for (const name of await caches.keys()) {
        if (!name.includes('packs')) {
            continue;
        }
        const cache = await caches.open(name);
        for (const request of await cache.keys()) {
            if (new URL(request.url).pathname.startsWith(prefix)) {
                await cache.delete(request);
            }
        }
    }
}

export function SoundsSettings() {
    // Read every instrument's voice reactively so each source group reflects the
    // current selection (and updates when a pack is removed → reset to synth).
    const voices = useEnsembleState((s) => ({
        chords: s.chords.voice,
        bass: s.bass.voice,
        soloist: s.soloist.voice,
        harmony: s.harmony.voice,
        groove: s.groove.voice,
    })) as Record<InstrumentModule, InstrumentVoice>;

    // Persistent install state: packs whose files are in the SW cache, plus any
    // loaded this session. Seeded from the cache on mount so a pack installed in
    // an earlier session shows Installed without re-downloading.
    const [installed, setInstalled] = useState<Set<string>>(
        () => new Set(SOUND_PACKS.filter((p) => isPackLoaded(p.id)).map((p) => p.id)),
    );
    const [busy, setBusy] = useState<Record<string, boolean>>({});

    useEffect(() => {
        let alive = true;
        (async () => {
            const cached = await Promise.all(
                SOUND_PACKS.map(async (p) => ((await isPackCached(p.id)) ? p.id : null)),
            );
            if (!alive) {
                return;
            }
            const ids = cached.filter((id): id is string => id !== null);
            if (ids.length > 0) {
                setInstalled((prev) => new Set([...prev, ...ids]));
            }
        })();
        return () => {
            alive = false;
        };
    }, []);

    const markInstalled = (packId: string, value: boolean) =>
        setInstalled((prev) => {
            const next = new Set(prev);
            if (value) {
                next.add(packId);
            } else {
                next.delete(packId);
            }
            return next;
        });
    const setPackBusy = (packId: string, value: boolean) =>
        setBusy((prev) => ({ ...prev, [packId]: value }));

    const selectSource = (module: InstrumentModule, voice: InstrumentVoice) => {
        dispatch(ACTIONS.SET_INSTRUMENT_VOICE, { module, voice });
        saveCurrentState();
    };

    // Fetch+decode a pack (populating the SW cache as a side effect) and mark it
    // installed. Returns whether it's now playable.
    const loadAndMark = async (audio: AudioContext, pack: SoundPack): Promise<boolean> => {
        setPackBusy(pack.id, true);
        await ensurePackLoaded(audio, pack.id);
        setPackBusy(pack.id, false);
        // The fetch routed through the SW cache; treat a successful decode as
        // installed (and reconcile against the real cache too).
        const ok = isPackLoaded(pack.id) || (await isPackCached(pack.id));
        markInstalled(pack.id, ok);
        return ok;
    };

    // Install a pack and select it as `module`'s source (you install it to use it).
    const install = async (module: InstrumentModule, pack: SoundPack) => {
        const audio = ensureAudio();
        if (!audio) {
            return;
        }
        if (await loadAndMark(audio, pack)) {
            selectSource(module, `pack:${pack.id}`);
        }
    };

    // Remove a pack: drop any instrument sourcing it back to synth, free the
    // decoded buffers, and evict the cached audio files (it's no longer installed).
    const remove = async (pack: SoundPack) => {
        const state = getState();
        for (const module of pack.instruments) {
            if ((state[module] as { voice: InstrumentVoice }).voice === `pack:${pack.id}`) {
                selectSource(module, 'synth');
            }
        }
        clearPack(pack.id);
        await evictPackCache(pack.id);
        markInstalled(pack.id, false);
    };

    const preview = async (module: InstrumentModule, pack: SoundPack) => {
        const audio = ensureAudio();
        if (!audio) {
            return;
        }
        if (!isPackLoaded(pack.id)) {
            await loadAndMark(audio, pack);
        }
        const zones = getPackZones(pack.id);
        if (!zones) {
            return;
        }
        const bus = getState().playback.audioGraph?.[GRAPH_BUS[module]];
        const dest = bus?.gain ?? audio.destination;
        const start = audio.currentTime + 0.05;
        PREVIEW_MIDIS.forEach((midi, i) => {
            const zone = pickZone(zones, midi);
            if (zone) {
                playSampledNote(audio, zone, dest, midi, start + i * 0.05, {
                    velocity: 0.5,
                    duration: 1.4,
                });
            }
        });
    };

    const sourceModules = (Object.keys(MODULE_LABELS) as InstrumentModule[]).filter(
        (module) => packsForInstrument(module).length > 0,
    );

    return (
        <SettingGroup title="Instrument Sounds">
            <p class="text-mini-muted sounds-intro">
                Pick a synth or a sample pack for each instrument. Packs download once and stay
                installed (cached for offline use) until you remove them — the app stays small until
                you install one.
            </p>

            {sourceModules.map((module) => {
                const voice = voices[module];
                return (
                    <div class="sound-instrument-group" key={module}>
                        <h4 class="sound-instrument-title">{MODULE_LABELS[module]}</h4>
                        <div
                            class="sound-source-list"
                            role="radiogroup"
                            aria-label={`${MODULE_LABELS[module]} sound source`}
                        >
                            <button
                                type="button"
                                role="radio"
                                aria-checked={voice === 'synth'}
                                class={`sound-source-row${voice === 'synth' ? ' is-active' : ''}`}
                                onClick={() => selectSource(module, 'synth')}
                            >
                                <span class="sound-source-dot" aria-hidden="true" />
                                <span class="sound-source-name">Synth</span>
                                <span class="sound-source-meta">Built-in</span>
                            </button>

                            {packsForInstrument(module).map((pack) => {
                                const isInstalled = installed.has(pack.id);
                                const isBusy = busy[pack.id] ?? false;
                                const active = voice === `pack:${pack.id}`;
                                return (
                                    <div
                                        class={`sound-source-row sound-source-row--pack${active ? ' is-active' : ''}`}
                                        key={pack.id}
                                    >
                                        <button
                                            type="button"
                                            role="radio"
                                            aria-checked={active}
                                            disabled={!isInstalled || isBusy}
                                            class="sound-source-select"
                                            title={
                                                isInstalled
                                                    ? `Use ${pack.name}`
                                                    : `Install ${pack.name} to use it`
                                            }
                                            onClick={() => selectSource(module, `pack:${pack.id}`)}
                                        >
                                            <span class="sound-source-dot" aria-hidden="true" />
                                            <span class="sound-source-name">{pack.name}</span>
                                            <span class="sound-source-meta">
                                                {isBusy
                                                    ? 'Downloading…'
                                                    : isInstalled
                                                      ? 'Installed'
                                                      : `${pack.approxSizeMB} MB`}
                                            </span>
                                        </button>
                                        <div class="sound-source-actions">
                                            <button
                                                type="button"
                                                class="icon-btn"
                                                aria-label={`Preview ${pack.name}`}
                                                disabled={isBusy}
                                                onClick={() => preview(module, pack)}
                                            >
                                                <Icon name="headphones" />
                                            </button>
                                            {isInstalled ? (
                                                <button
                                                    type="button"
                                                    class="icon-btn danger-btn"
                                                    aria-label={`Remove ${pack.name}`}
                                                    disabled={isBusy}
                                                    onClick={() => remove(pack)}
                                                >
                                                    <Icon name="trash" />
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    class="secondary-btn sound-source-install"
                                                    aria-label={`Install ${pack.name}`}
                                                    disabled={isBusy}
                                                    onClick={() => install(module, pack)}
                                                >
                                                    <Icon name="install" /> Install
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                        {/* Credit line for the active pack (license attribution). */}
                        {packsForInstrument(module)
                            .filter((pack) => voice === `pack:${pack.id}`)
                            .map((pack) => (
                                <p class="sound-source-credit" key={pack.id}>
                                    {pack.attribution}
                                </p>
                            ))}
                    </div>
                );
            })}

            {SOUND_PACKS.length === 0 && (
                <p class="text-mini-muted">No sample packs are available yet.</p>
            )}
        </SettingGroup>
    );
}
