import { Fragment } from 'preact';
import { autoVoiceForGenre } from '../data/genre-sound-map.js';
import { packsForInstrument } from '../data/sound-packs.js';
import { hydrateVoice, isPackInstalled } from '../engine/instrument-registry.js';
import { resolveSoloistMode } from '../engine/soloist-mode-policy.js';
import { dispatch } from '../state.js';
import {
    ACTIONS,
    type ChordState,
    type EnsembleState,
    type InstrumentModule,
    type SoloistState,
} from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';
import { Icon, type IconName } from './Icon.jsx';
import { ButtonGroup, Select, SettingGroup, SettingRow, Slider } from './UIControls.jsx';

type InstrumentAudioControl = 'volume' | 'reverb';

function getInstrumentState<M extends InstrumentModule>(module: M): EnsembleState[M] {
    return useEnsembleState((s) => s[module]);
}

function getModuleName(module: InstrumentModule) {
    return module === 'groove'
        ? 'drum'
        : module === 'chords'
          ? 'chord'
          : module === 'harmony'
            ? 'harmony'
            : module;
}

/**
 * The lanes that still own a generative knob of their own. #1070 moved the
 * band-wide controls out of here — Swing/Humanize (grid geometry and scheduler
 * timing, read by every lane) and the harmony color choice now live in the
 * rail's band-settings surface, so Drums and Harmony are left with just their
 * Sound source, and Bass never had one.
 */
const MODULES_WITH_SPECIFIC_CONTROLS = new Set<InstrumentModule>(['chords', 'soloist']);

function getInstrumentSpecificTitle(module: InstrumentModule) {
    return module === 'chords' ? 'Voicing' : 'Phrasing';
}

function updateInstrumentAudio(
    module: InstrumentModule,
    type: InstrumentAudioControl,
    val: string | number,
) {
    const numVal = typeof val === 'number' ? val : parseFloat(val);
    const isReverb = type === 'reverb';

    dispatch(isReverb ? ACTIONS.SET_REVERB : ACTIONS.SET_VOLUME, {
        module,
        value: numVal,
    });
}

interface InstrumentMixerStripProps {
    module: InstrumentModule;
    accent?: string;
    iconName?: IconName;
    label?: string;
}

export function InstrumentMixerStrip({
    module,
    accent = '',
    iconName,
    label,
}: InstrumentMixerStripProps) {
    const state = getInstrumentState(module);

    if (!state) {
        return null;
    }

    const moduleName = getModuleName(module);
    const title = label || module;
    const volumeDisplay = `${Math.round(state.volume * 100)}%`;
    const reverbDisplay = `${Math.round(state.reverb * 100)}%`;

    return (
        <section
            class={`workspace-studio-mixer-strip ${accent ? `workspace-studio-mixer-strip--${accent}` : ''}`}
        >
            <div class="workspace-studio-mixer-strip-heading">
                {iconName && (
                    <span class="workspace-studio-mixer-strip-icon" aria-hidden="true">
                        <Icon name={iconName} />
                    </span>
                )}
                <h4>{title}</h4>
            </div>
            <div class="workspace-studio-mixer-strip-controls">
                <div class="workspace-studio-mixer-strip-slider">
                    <label
                        class="workspace-studio-mixer-strip-slider-label"
                        htmlFor={`${moduleName}Volume`}
                    >
                        Vol
                    </label>
                    <Slider
                        id={`${moduleName}Volume`}
                        min="0"
                        max="1"
                        step="0.05"
                        value={state.volume}
                        onInput={(val) => updateInstrumentAudio(module, 'volume', val)}
                        ariaLabel={`${title} volume`}
                        ariaValueText={volumeDisplay}
                    />
                    <span class="workspace-studio-mixer-strip-slider-value">{volumeDisplay}</span>
                </div>
                <div class="workspace-studio-mixer-strip-slider">
                    <label
                        class="workspace-studio-mixer-strip-slider-label"
                        htmlFor={`${moduleName}Reverb`}
                    >
                        Rev
                    </label>
                    <Slider
                        id={`${moduleName}Reverb`}
                        min="0"
                        max="1"
                        step="0.05"
                        value={state.reverb}
                        onInput={(val) => updateInstrumentAudio(module, 'reverb', val)}
                        ariaLabel={`${title} reverb`}
                        ariaValueText={reverbDisplay}
                    />
                    <span class="workspace-studio-mixer-strip-slider-value">{reverbDisplay}</span>
                </div>
            </div>
        </section>
    );
}

/**
 * Per-instrument sound source (#675): Auto (follow genre) vs a pinned synth/pack,
 * surfaced here in the instrument's own settings popover (the consolidation —
 * everything about an instrument lives in one place you reach by tapping it).
 * Renders only for instruments that actually have packs; pack *management*
 * (install/remove) lives in the gear's Packs tab.
 */
function InstrumentSoundSource({ module }: { module: InstrumentModule }) {
    const { voice, autoSound } = useEnsembleState((s) => {
        const m = s[module];
        return { voice: m.voice, autoSound: m.autoSound };
    });
    const currentGenre = useEnsembleState((s) => s.groove.lastSmartGenre) as string | undefined;

    const catalogPacks = packsForInstrument(module);
    if (catalogPacks.length === 0) {
        return null;
    }

    // Offer installed packs, plus the active pinned pack even if it was removed,
    // so the Select always represents the current selection. (Discover + install
    // more in Settings → Packs.)
    const packs = catalogPacks.filter((p) => isPackInstalled(p.id) || voice === `pack:${p.id}`);
    const autoTarget = autoVoiceForGenre(currentGenre, module, isPackInstalled);
    const autoTargetLabel =
        autoTarget === 'synth'
            ? 'Synth'
            : (catalogPacks.find((p) => `pack:${p.id}` === autoTarget)?.name ?? 'Synth');

    // Tap-to-select chips (one click, every option visible) instead of a
    // dropdown. Auto's resolved target moves to the caption so the chip stays
    // short; the pack names label the rest.
    const options = [
        { value: 'auto', label: 'Auto' },
        { value: 'synth', label: 'Synth' },
        ...packs.map((p) => ({ value: `pack:${p.id}`, label: p.name })),
    ];

    const selectSource = (val: string) => {
        if (val === 'auto') {
            dispatch(ACTIONS.SET_INSTRUMENT_VOICE, {
                module,
                voice: autoVoiceForGenre(currentGenre, module, isPackInstalled),
                auto: true,
            });
        } else {
            dispatch(ACTIONS.SET_INSTRUMENT_VOICE, {
                module,
                voice: hydrateVoice(val),
                auto: false,
            });
        }
    };

    const hasUninstalled = catalogPacks.some((p) => !isPackInstalled(p.id));

    return (
        <SettingGroup title="Sound">
            <ButtonGroup
                className="instrument-sound-source"
                value={autoSound ? 'auto' : voice}
                onChange={(val) => selectSource(String(val))}
                options={options}
            />
            <p class="text-mini-muted instrument-sound-source-note">
                {autoSound ? `Following the genre → ${autoTargetLabel}` : 'Pinned to this sound'}
                {hasUninstalled && ' · More in Settings → Packs'}
            </p>
        </SettingGroup>
    );
}

interface InstrumentSpecificSettingsProps {
    module: InstrumentModule;
}

export function InstrumentSpecificSettings({ module }: InstrumentSpecificSettingsProps) {
    const state = getInstrumentState(module);

    if (!state) {
        return null;
    }

    // Bass, Drums and Harmony have no generative knobs of their own — only the
    // Sound source — so skip the specific-settings group rather than render a
    // bare, empty title box.
    const hasSpecificControls = MODULES_WITH_SPECIFIC_CONTROLS.has(module);

    return (
        <Fragment>
            <InstrumentSoundSource module={module} />
            {hasSpecificControls && (
                <SettingGroup title={getInstrumentSpecificTitle(module)}>
                    {module === 'chords' && <ChordsControls state={state as ChordState} />}
                    {module === 'soloist' && <SoloistControls state={state as SoloistState} />}
                </SettingGroup>
            )}
        </Fragment>
    );
}

interface ChordsControlsProps {
    state: ChordState;
}

function ChordsControls({ state }: ChordsControlsProps) {
    return (
        <SettingRow
            label="Density"
            id="densitySelect"
            description="Notes per chord — thinner or fuller voicings."
        >
            <Select
                id="densitySelect"
                value={state.density || 'standard'}
                onChange={(val) => {
                    dispatch(ACTIONS.SET_DENSITY, val);
                }}
                options={[
                    { value: 'thin', label: 'Thin (3 notes)' },
                    { value: 'standard', label: 'Standard (4 notes)' },
                    { value: 'rich', label: 'Rich (5+ notes)' },
                ]}
            />
        </SettingRow>
    );
}

interface SoloistControlsProps {
    state: SoloistState;
}

function SoloistControls({ state }: SoloistControlsProps) {
    return (
        <Fragment>
            {/*
             * #1167 — this slider writes `phrasingIntensity`, NOT `complexity`.
             * `phrasingIntensity` IS synced, is manifest-classified
             * `{ delta: 'SET_PARAM' }`, and feeds `intensityLift` in
             * `getSoloistNotePhraseFirst` — i.e. the worker contract was already
             * expecting a UI writer that did not exist.
             * #1070 — the label and id now say `phrasingIntensity` too. Calling it
             * "Complexity" made three unrelated fields share one word; the field it
             * actually writes is the soloist's phrasing intensity, and the dead
             * `soloist.complexity` it used to name is gone from state entirely.
             */}
            <SettingRow
                label="Phrasing Intensity"
                id="soloistPhrasingIntensity"
                description="Higher plays busier, more articulated lines."
                valueDisplay={`${Math.round((state.phrasingIntensity ?? 0.5) * 100)}%`}
            >
                <Slider
                    id="soloistPhrasingIntensity"
                    min="0"
                    max="1"
                    step="0.05"
                    value={state.phrasingIntensity !== undefined ? state.phrasingIntensity : 0.5}
                    onInput={(val) => {
                        dispatch(ACTIONS.SET_PARAM, {
                            module: 'soloist',
                            param: 'phrasingIntensity',
                            value: parseFloat(val),
                        });
                    }}
                    ariaValueText={`${Math.round((state.phrasingIntensity ?? 0.5) * 100)}%`}
                />
            </SettingRow>

            <SettingRow
                label="Phrasing Mode"
                id="soloistModeSelect"
                description={
                    state.autoMode
                        ? `Auto — follows the lead voice (now ${
                              resolveSoloistMode(state.mode) === 'guitar' ? 'Guitar' : 'Monophonic'
                          }). A guitar pack adds chord-aware double-stops.`
                        : 'Pinned. Single-note lead, or chord-aware guitar double-stops.'
                }
            >
                <ButtonGroup
                    className="soloist-phrasing-mode"
                    value={state.autoMode ? 'auto' : resolveSoloistMode(state.mode)}
                    onChange={(val) => {
                        const v = String(val);
                        if (v === 'auto') {
                            dispatch(ACTIONS.SET_SOLOIST_AUTO_MODE, true);
                        } else {
                            dispatch(ACTIONS.SET_SOLOIST_MODE, v);
                            dispatch(ACTIONS.SET_SOLOIST_AUTO_MODE, false);
                        }
                    }}
                    options={[
                        { value: 'auto', label: 'Auto' },
                        { value: 'monophonic', label: 'Monophonic' },
                        { value: 'guitar', label: 'Guitar' },
                    ]}
                />
            </SettingRow>
        </Fragment>
    );
}
