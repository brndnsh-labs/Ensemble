import { useEffect, useState } from 'preact/hooks';
import { autoVoiceForGenre } from '../data/genre-sound-map.js';
import { packsForInstrument, SOUND_PACKS, type SoundPack } from '../data/sound-packs.js';
import {
    clearPack,
    isPackInstalled,
    isPackLoaded,
    markPackInstalled,
} from '../engine/instrument-registry.js';
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

const isPackVoice = (voice: InstrumentVoice, packId: string) => voice === `pack:${packId}`;

/**
 * The Sounds settings section (#675/#674). Two stacked concerns:
 *   1. {@link SoundSourceControls} — per-instrument Auto-follow-genre vs a
 *      pinned source. Self-contained / mount-agnostic (it reads its own state
 *      and only takes the installed-set as a prop), so it can later move out of
 *      the gear to the instrument rail without a rewrite.
 *   2. {@link PackLibrary} — install / remove / preview the pack library, plus
 *      "Install all packs".
 *
 * The parent owns the install-state (which packs are cached + which are mid-
 * download) and shares it down, so both halves agree on what's installed.
 */
export function SoundsSettings() {
    // Persistent install state: packs whose files are in the SW cache, plus any
    // loaded this session. Seeded from the registry's installed-set (warmed at
    // bootstrap) on mount, then reconciled against the real cache.
    const [installed, setInstalled] = useState<Set<string>>(
        () => new Set(SOUND_PACKS.filter((p) => isPackInstalled(p.id)).map((p) => p.id)),
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
            // Keep the registry's sync installed-set (used by genre auto-follow)
            // in step with what the cache scan actually found.
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

    // Install a pack into the library (management only — selecting it as an
    // instrument's source happens in SoundSourceControls / via genre auto-follow).
    const install = async (pack: SoundPack) => {
        const audio = ensureAudio();
        if (!audio) {
            return;
        }
        await loadAndMark(audio, pack);
    };

    // Install every not-yet-installed pack in one gesture (#674).
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
    };

    // Remove a pack: drop any instrument sourcing it back to synth, free the
    // decoded buffers, and evict the cached audio files (it's no longer installed).
    const remove = async (pack: SoundPack) => {
        const state = getState();
        for (const module of pack.instruments) {
            if (isPackVoice((state[module] as { voice: InstrumentVoice }).voice, pack.id)) {
                // Bare voice reset — leave the instrument's Auto/pinned mode as-is
                // (an Auto lane re-resolves on the next genre change).
                dispatch(ACTIONS.SET_INSTRUMENT_VOICE, { module, voice: 'synth' });
            }
        }
        saveCurrentState();
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

    const allInstalled = SOUND_PACKS.length > 0 && SOUND_PACKS.every((p) => installed.has(p.id));
    const anyBusy = Object.values(busy).some(Boolean);

    return (
        <SettingGroup title="Instrument Sounds">
            <SoundSourceControls installed={installed} />

            <PackLibrary
                installed={installed}
                busy={busy}
                allInstalled={allInstalled}
                anyBusy={anyBusy}
                onInstall={install}
                onInstallAll={installAll}
                onRemove={remove}
                onPreview={preview}
            />
        </SettingGroup>
    );
}

/**
 * Per-instrument sound-source control (#675): Auto (follow genre) vs a pinned
 * synth/pack source, for every instrument that has at least one pack. Auto is
 * the default; selecting it immediately applies the current genre's mapped
 * sound. Mount-agnostic — reads its own reactive state and dispatches its own
 * voice changes, taking only the installed-set as a prop.
 */
function SoundSourceControls({ installed }: { installed: Set<string> }) {
    const voices = useEnsembleState((s) => ({
        chords: { voice: s.chords.voice, auto: s.chords.autoSound },
        soloist: { voice: s.soloist.voice, auto: s.soloist.autoSound },
        harmony: { voice: s.harmony.voice, auto: s.harmony.autoSound },
        groove: { voice: s.groove.voice, auto: s.groove.autoSound },
        bass: { voice: s.bass.voice, auto: s.bass.autoSound },
    })) as Record<InstrumentModule, { voice: InstrumentVoice; auto: boolean }>;
    const currentGenre = useEnsembleState((s) => s.groove.lastSmartGenre) as string | undefined;

    const sourceModules = (Object.keys(MODULE_LABELS) as InstrumentModule[]).filter(
        (module) => packsForInstrument(module).length > 0,
    );

    if (sourceModules.length === 0) {
        return null;
    }

    const installedCheck = (packId: string) => installed.has(packId);

    // Pick a source: Auto applies the genre's mapped voice now (auto:true); a
    // manual pick pins it (auto:false).
    const selectAuto = (module: InstrumentModule) => {
        const voice = autoVoiceForGenre(currentGenre, module, installedCheck);
        dispatch(ACTIONS.SET_INSTRUMENT_VOICE, { module, voice, auto: true });
        saveCurrentState();
    };
    const selectPinned = (module: InstrumentModule, voice: InstrumentVoice) => {
        dispatch(ACTIONS.SET_INSTRUMENT_VOICE, { module, voice, auto: false });
        saveCurrentState();
    };

    return (
        <div class="sound-source-section">
            <p class="text-mini-muted sounds-intro">
                Choose how each instrument picks its sound. <strong>Auto</strong> follows the genre;
                or pin a specific synth or installed pack.
            </p>
            {sourceModules.map((module) => {
                const { voice, auto } = voices[module];
                const autoTarget = autoVoiceForGenre(currentGenre, module, installedCheck);
                const autoLabel =
                    autoTarget === 'synth'
                        ? 'Synth'
                        : (packsForInstrument(module).find((p) => isPackVoice(autoTarget, p.id))
                              ?.name ?? 'Synth');
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
                                aria-checked={auto}
                                class={`sound-source-row${auto ? ' is-active' : ''}`}
                                onClick={() => selectAuto(module)}
                            >
                                <span class="sound-source-dot" aria-hidden="true" />
                                <span class="sound-source-name">Auto</span>
                                <span class="sound-source-meta">Follows genre · {autoLabel}</span>
                            </button>

                            <button
                                type="button"
                                role="radio"
                                aria-checked={!auto && voice === 'synth'}
                                class={`sound-source-row${!auto && voice === 'synth' ? ' is-active' : ''}`}
                                onClick={() => selectPinned(module, 'synth')}
                            >
                                <span class="sound-source-dot" aria-hidden="true" />
                                <span class="sound-source-name">Synth</span>
                                <span class="sound-source-meta">Built-in</span>
                            </button>

                            {packsForInstrument(module).map((pack) => {
                                const pinnedHere = !auto && isPackVoice(voice, pack.id);
                                const isInstalled = installed.has(pack.id);
                                return (
                                    <button
                                        type="button"
                                        role="radio"
                                        key={pack.id}
                                        aria-checked={pinnedHere}
                                        disabled={!isInstalled}
                                        class={`sound-source-row${pinnedHere ? ' is-active' : ''}`}
                                        title={
                                            isInstalled
                                                ? `Pin ${pack.name}`
                                                : `Install ${pack.name} below to use it`
                                        }
                                        onClick={() => selectPinned(module, `pack:${pack.id}`)}
                                    >
                                        <span class="sound-source-dot" aria-hidden="true" />
                                        <span class="sound-source-name">{pack.name}</span>
                                        <span class="sound-source-meta">
                                            {isInstalled ? 'Installed' : 'Not installed'}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

interface PackLibraryProps {
    installed: Set<string>;
    busy: Record<string, boolean>;
    allInstalled: boolean;
    anyBusy: boolean;
    onInstall: (pack: SoundPack) => void;
    onInstallAll: () => void;
    onRemove: (pack: SoundPack) => void;
    onPreview: (pack: SoundPack) => void;
}

/**
 * The pack library (#674): install / remove / preview every catalog pack, plus
 * a one-tap "Install all packs". Pure management — assigning a pack to an
 * instrument is {@link SoundSourceControls}' job.
 */
function PackLibrary({
    installed,
    busy,
    allInstalled,
    anyBusy,
    onInstall,
    onInstallAll,
    onRemove,
    onPreview,
}: PackLibraryProps) {
    if (SOUND_PACKS.length === 0) {
        return <p class="text-mini-muted">No sample packs are available yet.</p>;
    }

    return (
        <div class="sound-pack-library">
            <div class="sound-pack-library-header">
                <h4 class="sound-instrument-title">Pack Library</h4>
                <button
                    type="button"
                    class="secondary-btn"
                    disabled={allInstalled || anyBusy}
                    onClick={onInstallAll}
                >
                    <Icon name="install" /> {allInstalled ? 'All installed' : 'Install all packs'}
                </button>
            </div>
            <p class="text-mini-muted sounds-intro">
                Packs download once and stay installed (cached for offline use) until you remove
                them — the app stays small until you install one.
            </p>

            {SOUND_PACKS.map((pack) => {
                const isInstalled = installed.has(pack.id);
                const isBusy = busy[pack.id] ?? false;
                const serves = pack.instruments.map((m) => MODULE_LABELS[m]).join(', ');
                return (
                    <div class="sound-source-row sound-source-row--pack" key={pack.id}>
                        <span class="sound-source-dot" aria-hidden="true" />
                        <span class="sound-source-name">{pack.name}</span>
                        <span class="sound-source-meta">
                            {isBusy
                                ? 'Downloading…'
                                : isInstalled
                                  ? `Installed · ${serves}`
                                  : `${pack.approxSizeMB} MB · ${serves}`}
                        </span>
                        <div class="sound-source-actions">
                            <button
                                type="button"
                                class="icon-btn"
                                aria-label={`Preview ${pack.name}`}
                                disabled={isBusy}
                                onClick={() => onPreview(pack)}
                            >
                                <Icon name="headphones" />
                            </button>
                            {isInstalled ? (
                                <button
                                    type="button"
                                    class="icon-btn danger-btn"
                                    aria-label={`Remove ${pack.name}`}
                                    disabled={isBusy}
                                    onClick={() => onRemove(pack)}
                                >
                                    <Icon name="trash" />
                                </button>
                            ) : (
                                <button
                                    type="button"
                                    class="secondary-btn sound-source-install"
                                    aria-label={`Install ${pack.name}`}
                                    disabled={isBusy}
                                    onClick={() => onInstall(pack)}
                                >
                                    <Icon name="install" /> Install
                                </button>
                            )}
                        </div>
                        {isInstalled && <p class="sound-source-credit">{pack.attribution}</p>}
                    </div>
                );
            })}
        </div>
    );
}
