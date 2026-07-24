import { useEffect, useState } from 'preact/hooks';
import { SOUND_PACKS, type SoundPack } from '../data/sound-packs.js';
import {
    clearPack,
    isPackInstalled,
    isPackLoaded,
    MODULE_BUS_KEY,
    markPackInstalled,
} from '../engine/instrument-registry.js';
import { ensurePackLoaded, getPackZones } from '../engine/pack-runtime.js';
import { pickZone, playSampledNote } from '../engine/sample-voice.js';
import { resolveAutoVoices } from '../state/state-effects.js';
import { dispatch, getState } from '../state.js';
import { ACTIONS, type InstrumentModule, type InstrumentVoice } from '../types.js';
import { Icon } from './Icon.jsx';
import { SettingGroup } from './UIControls.jsx';

const MODULE_LABELS: Record<InstrumentModule, string> = {
    chords: 'Chords',
    bass: 'Bass',
    soloist: 'Soloist',
    harmony: 'Harmony',
    groove: 'Drums',
};

// A C-major triad — the preview gesture for a pitched pack.
const PREVIEW_MIDIS = [60, 64, 67];

/**
 * Ensure a live `AudioContext` exists (creating one on this user gesture if the
 * band hasn't played yet) so install/preview can decode + play.
 */
function ensureAudio(): AudioContext | null {
    let audio = getState().playback.audio;
    if (!audio) {
        dispatch(ACTIONS.INIT_AUDIO);
        audio = getState().playback.audio;
    }
    return audio ?? null;
}

/**
 * Whether a pack's files live in the SW `/packs/` cache — the persistent source
 * of truth for "installed". Survives reloads (the decoded-buffer cache does
 * not). Checks the manifest, written last-ish by a successful install.
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

const isPackVoice = (voice: InstrumentVoice, packId: string) => voice === `pack:${packId}`;

/**
 * The gear's Packs tab (#674): the pack library — install / remove / preview
 * every catalog pack, plus one-tap "Install all packs". Pure library
 * management; assigning a pack to an instrument is the rail's per-instrument
 * Sound control (#675), so this tab stays app-global ("what's downloaded").
 */
export function PacksSettings() {
    // Persistent install state: packs whose files are in the SW cache, plus any
    // loaded this session. Seeded from the registry's installed-set (warmed at
    // bootstrap), then reconciled against the real cache on mount.
    const [installed, setInstalled] = useState<Set<string>>(
        () => new Set(SOUND_PACKS.filter((p) => isPackInstalled(p.id)).map((p) => p.id)),
    );
    const [busy, setBusy] = useState<Record<string, boolean>>({});
    // Which pack's info panel (description + credit) is expanded; one at a time.
    const [openInfo, setOpenInfo] = useState<string | null>(null);

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
            for (const id of ids) {
                markPackInstalled(id, true);
            }
            if (ids.length > 0) {
                setInstalled((prev) => new Set([...prev, ...ids]));
            }
        })();
        return () => {
            alive = false;
        };
    }, []);

    const markInstalled = (packId: string, value: boolean) => {
        markPackInstalled(packId, value);
        setInstalled((prev) => {
            const next = new Set(prev);
            if (value) {
                next.add(packId);
            } else {
                next.delete(packId);
            }
            return next;
        });
    };
    const setPackBusy = (packId: string, value: boolean) =>
        setBusy((prev) => ({ ...prev, [packId]: value }));

    // Fetch+decode a pack (populating the SW cache) and mark it installed.
    const loadAndMark = async (audio: AudioContext, pack: SoundPack): Promise<boolean> => {
        setPackBusy(pack.id, true);
        await ensurePackLoaded(audio, pack.id);
        setPackBusy(pack.id, false);
        const ok = isPackLoaded(pack.id) || (await isPackCached(pack.id));
        markInstalled(pack.id, ok);
        return ok;
    };

    // #683 — after installing, upgrade the *current* genre's Auto lanes right
    // away (don't wait for the next genre change). Pinned lanes are untouched;
    // a now-installed mapping flips Auto chords/harmony to the pack in the moment.
    const reResolveAuto = () => {
        const state = getState();
        resolveAutoVoices(state, state.groove.lastSmartGenre, dispatch);
    };

    const install = async (pack: SoundPack) => {
        const audio = ensureAudio();
        if (audio) {
            await loadAndMark(audio, pack);
            reResolveAuto();
        }
    };

    // Install every not-yet-installed pack in one gesture.
    const installAll = async () => {
        const audio = ensureAudio();
        if (!audio) {
            return;
        }
        for (const pack of SOUND_PACKS) {
            if (!installed.has(pack.id)) {
                await loadAndMark(audio, pack);
            }
        }
        reResolveAuto();
    };

    // Remove a pack: drop any instrument sourcing it back to synth, free the
    // decoded buffers, and evict the cached files (it's no longer installed).
    const remove = async (pack: SoundPack) => {
        const state = getState();
        for (const module of pack.instruments) {
            if (isPackVoice((state[module] as { voice: InstrumentVoice }).voice, pack.id)) {
                // Bare voice reset — leave Auto/pinned mode as-is (an Auto lane
                // re-resolves on the next genre change).
                dispatch(ACTIONS.SET_INSTRUMENT_VOICE, { module, voice: 'synth' });
            }
        }
        clearPack(pack.id);
        await evictPackCache(pack.id);
        markInstalled(pack.id, false);
    };

    const preview = async (pack: SoundPack) => {
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
        const module = pack.instruments[0] ?? 'chords';
        const bus = getState().playback.audioGraph?.[MODULE_BUS_KEY[module]];
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

    if (SOUND_PACKS.length === 0) {
        return (
            <SettingGroup title="Sample Packs">
                <p class="text-mini-muted">No sample packs are available yet.</p>
            </SettingGroup>
        );
    }

    const allInstalled = SOUND_PACKS.every((p) => installed.has(p.id));
    const anyBusy = Object.values(busy).some(Boolean);

    return (
        <SettingGroup title="Sample Packs">
            <div class="sound-pack-library-header">
                <p class="text-mini-muted sounds-intro">
                    Download once, cached for offline use. Assign a pack to an instrument from its
                    settings on the instrument rail.
                </p>
                <button
                    type="button"
                    class="secondary-btn"
                    disabled={allInstalled || anyBusy}
                    onClick={installAll}
                >
                    <Icon name="install" /> {allInstalled ? 'All installed' : 'Install all packs'}
                </button>
            </div>

            {SOUND_PACKS.map((pack) => {
                const isInstalled = installed.has(pack.id);
                const isBusy = busy[pack.id] ?? false;
                const serves = pack.instruments.map((m) => MODULE_LABELS[m]).join(', ');
                const infoOpen = openInfo === pack.id;
                const detailId = `pack-detail-${pack.id}`;
                return (
                    <div class="sound-source-row sound-source-row--pack" key={pack.id}>
                        <span class="sound-source-name">{pack.name}</span>
                        <span class="sound-source-meta">
                            {isBusy
                                ? 'Downloading…'
                                : isInstalled
                                  ? `${serves} · ✓ Installed`
                                  : `${serves} · ${pack.approxSizeMB} MB`}
                        </span>
                        <div class="sound-source-actions">
                            <button
                                type="button"
                                class="icon-btn"
                                aria-label={`About ${pack.name}`}
                                aria-expanded={infoOpen}
                                aria-controls={detailId}
                                onClick={() => setOpenInfo(infoOpen ? null : pack.id)}
                            >
                                <Icon name="info" />
                            </button>
                            <button
                                type="button"
                                class="icon-btn"
                                aria-label={`Preview ${pack.name}`}
                                disabled={isBusy}
                                onClick={() => preview(pack)}
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
                                    onClick={() => install(pack)}
                                >
                                    <Icon name="install" /> Install
                                </button>
                            )}
                        </div>
                        {infoOpen && (
                            <div class="sound-source-detail" id={detailId}>
                                <p class="sound-source-desc">{pack.description}</p>
                                <p class="sound-source-credit">{pack.attribution}</p>
                            </div>
                        )}
                    </div>
                );
            })}
        </SettingGroup>
    );
}
