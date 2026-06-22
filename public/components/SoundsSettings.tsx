import { useState } from 'preact/hooks';
import { packsForInstrument, SOUND_PACKS, type SoundPack } from '../data/sound-packs.js';
import { clearPack, isPackLoaded } from '../engine/instrument-registry.js';
import { ensurePackLoaded, getPackZones } from '../engine/pack-runtime.js';
import { pickZone, playSampledNote } from '../engine/sample-voice.js';
import { saveCurrentState } from '../persistence.js';
import { dispatch, getState } from '../state.js';
import { ACTIONS, type InstrumentModule, type InstrumentVoice } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';
import { Icon } from './Icon.jsx';
import { Select, SettingGroup, SettingRow } from './UIControls.jsx';

// Instrument modules that have ≥1 pack in the catalog get a source-picker row.
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
    // Read every instrument's voice reactively so the source picker reflects the
    // current selection (and updates when a pack is removed → reset to synth).
    const voices = useEnsembleState((s) => ({
        chords: s.chords.voice,
        bass: s.bass.voice,
        soloist: s.soloist.voice,
        harmony: s.harmony.voice,
        groove: s.groove.voice,
    })) as Record<InstrumentModule, InstrumentVoice>;

    // `isPackLoaded` is a plain module-cache read, not a signal — bump this after
    // install/remove to re-render the manager + the source-picker options.
    const [, setRev] = useState(0);
    const refresh = () => setRev((r) => r + 1);
    const [busy, setBusy] = useState<Record<string, boolean>>({});

    const setPackBusy = (packId: string, value: boolean) =>
        setBusy((prev) => ({ ...prev, [packId]: value }));

    const install = async (pack: SoundPack) => {
        const audio = ensureAudio();
        if (!audio) {
            return;
        }
        setPackBusy(pack.id, true);
        await ensurePackLoaded(audio, pack.id);
        setPackBusy(pack.id, false);
        refresh();
    };

    const remove = async (pack: SoundPack) => {
        // Drop any instrument currently sourcing this pack back to the synth.
        const state = getState();
        for (const module of pack.instruments) {
            if ((state[module] as { voice: InstrumentVoice }).voice === `pack:${pack.id}`) {
                dispatch(ACTIONS.SET_INSTRUMENT_VOICE, { module, voice: 'synth' });
            }
        }
        clearPack(pack.id);
        await evictPackCache(pack.id);
        saveCurrentState();
        refresh();
    };

    const preview = async (pack: SoundPack) => {
        const audio = ensureAudio();
        if (!audio) {
            return;
        }
        if (!isPackLoaded(pack.id)) {
            setPackBusy(pack.id, true);
            await ensurePackLoaded(audio, pack.id);
            setPackBusy(pack.id, false);
            refresh();
        }
        const zones = getPackZones(pack.id);
        if (!zones) {
            return;
        }
        // Play through the first applicable instrument's mix bus (so it inherits
        // that bus's EQ/reverb), falling back to the raw destination.
        const bus = getState().playback.audioGraph?.[GRAPH_BUS[pack.instruments[0]]];
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
        <>
            <SettingGroup title="Instrument Sounds">
                <p class="text-mini-muted sounds-intro">
                    Choose a synth or an installed sample pack for each instrument. Packs download
                    on demand and are cached for offline use — the app stays small until you install
                    one.
                </p>
                {sourceModules.map((module) => {
                    const installed = packsForInstrument(module).filter((p) => isPackLoaded(p.id));
                    return (
                        <SettingRow
                            key={module}
                            label={MODULE_LABELS[module]}
                            id={`soundSource-${module}`}
                        >
                            <Select
                                id={`soundSource-${module}`}
                                value={voices[module]}
                                onChange={(val) => {
                                    dispatch(ACTIONS.SET_INSTRUMENT_VOICE, {
                                        module,
                                        voice: val as InstrumentVoice,
                                    });
                                    saveCurrentState();
                                }}
                                options={[
                                    { value: 'synth', label: 'Synth' },
                                    ...installed.map((p) => ({
                                        value: `pack:${p.id}`,
                                        label: p.name,
                                    })),
                                ]}
                            />
                        </SettingRow>
                    );
                })}
            </SettingGroup>

            <SettingGroup title="Sample Packs">
                {SOUND_PACKS.map((pack) => {
                    const loaded = isPackLoaded(pack.id);
                    const isBusy = busy[pack.id] ?? false;
                    return (
                        <div class="sound-pack-card" key={pack.id}>
                            <div class="sound-pack-card-info">
                                <div class="sound-pack-card-head">
                                    <span class="sound-pack-card-name">{pack.name}</span>
                                    <span
                                        class={`sound-pack-status${loaded ? ' is-installed' : ''}`}
                                    >
                                        {isBusy
                                            ? 'Downloading…'
                                            : loaded
                                              ? 'Installed'
                                              : `${pack.approxSizeMB} MB`}
                                    </span>
                                </div>
                                <p class="sound-pack-card-desc">{pack.description}</p>
                                <p class="sound-pack-card-credit">{pack.attribution}</p>
                            </div>
                            <div class="sound-pack-card-actions">
                                <button
                                    type="button"
                                    class="secondary-btn sound-pack-preview-btn"
                                    aria-label={`Preview ${pack.name}`}
                                    disabled={isBusy}
                                    onClick={() => preview(pack)}
                                >
                                    <Icon name="headphones" /> Preview
                                </button>
                                {loaded ? (
                                    <button
                                        type="button"
                                        class="secondary-btn danger-btn"
                                        aria-label={`Remove ${pack.name}`}
                                        disabled={isBusy}
                                        onClick={() => remove(pack)}
                                    >
                                        <Icon name="trash" /> Remove
                                    </button>
                                ) : (
                                    <button
                                        type="button"
                                        class="primary-btn"
                                        aria-label={`Install ${pack.name}`}
                                        disabled={isBusy}
                                        onClick={() => install(pack)}
                                    >
                                        <Icon name="install" /> Install
                                    </button>
                                )}
                            </div>
                        </div>
                    );
                })}
            </SettingGroup>
        </>
    );
}
