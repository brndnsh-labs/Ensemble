import { Fragment } from 'preact';
import { dispatch, getState } from '../state.js';
import { ACTIONS, type InstrumentVoice } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';

const { playback } = getState();

import { MIXER_GAIN_MULTIPLIERS } from '../config.js';
import { autoVoiceForGenre } from '../data/genre-sound-map.js';
import { packsForInstrument } from '../data/sound-packs.js';
import { isPackInstalled } from '../engine/instrument-registry.js';
import { saveCurrentState } from '../persistence.js';
import type { GrooveState } from '../state/groove.js';
import { Icon, type IconName } from './Icon.jsx';
import { Select, SettingGroup, SettingRow, Slider } from './UIControls.jsx';

type StudioInstrumentModule = 'groove' | 'bass' | 'chords' | 'harmony' | 'soloist';
type InstrumentAudioControl = 'volume' | 'reverb';

function getInstrumentState(module: StudioInstrumentModule) {
    return useEnsembleState((s) => {
        const key = module === 'groove' ? 'groove' : module;
        return (s as any)[key];
    });
}

function getModuleName(module: StudioInstrumentModule) {
    return module === 'groove'
        ? 'drum'
        : module === 'chords'
          ? 'chord'
          : module === 'harmony'
            ? 'harmony'
            : module;
}

function getInstrumentSpecificTitle(module: StudioInstrumentModule) {
    return module === 'groove'
        ? 'Feel & Actions'
        : module === 'chords' || module === 'harmony'
          ? 'Voicing'
          : 'Instrument';
}

function updateInstrumentAudio(
    module: StudioInstrumentModule,
    type: InstrumentAudioControl,
    val: string | number,
) {
    const numVal = typeof val === 'number' ? val : parseFloat(val);
    const isReverb = type === 'reverb';

    dispatch(isReverb ? ACTIONS.SET_REVERB : ACTIONS.SET_VOLUME, {
        module,
        value: numVal,
    });
    saveCurrentState();

    const internalName =
        module === 'groove' ? 'drums' : module === 'harmony' ? 'harmonies' : module;
    const gainKey = isReverb ? `${internalName}Reverb` : `${internalName}Gain`;
    const multiplier = isReverb ? 1.0 : (MIXER_GAIN_MULTIPLIERS as any)[internalName] || 1.0;

    const node = (playback as any)[gainKey];
    if (node && playback.audio) {
        const target = Math.max(0.0001, numVal * multiplier);
        node.gain.cancelScheduledValues(playback.audio.currentTime);
        node.gain.setValueAtTime(node.gain.value, playback.audio.currentTime);
        node.gain.exponentialRampToValueAtTime(target, playback.audio.currentTime + 0.04);
    }
}

interface InstrumentMixerStripProps {
    module: StudioInstrumentModule;
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
function InstrumentSoundSource({ module }: { module: StudioInstrumentModule }) {
    const { voice, autoSound } = useEnsembleState((s) => {
        const m = (s as any)[module];
        return { voice: m.voice as InstrumentVoice, autoSound: m.autoSound as boolean };
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

    const options = [
        { value: 'auto', label: `Auto · ${autoTargetLabel}` },
        { value: 'synth', label: 'Synth' },
        ...packs.map((p) => ({ value: `pack:${p.id}`, label: p.name })),
    ];

    const onChange = (val: string) => {
        if (val === 'auto') {
            dispatch(ACTIONS.SET_INSTRUMENT_VOICE, {
                module,
                voice: autoVoiceForGenre(currentGenre, module, isPackInstalled),
                auto: true,
            });
        } else {
            dispatch(ACTIONS.SET_INSTRUMENT_VOICE, { module, voice: val, auto: false });
        }
        saveCurrentState();
    };

    return (
        <SettingGroup title="Sound">
            <SettingRow label="Source" id={`${module}SoundSource`}>
                <Select
                    id={`${module}SoundSource`}
                    value={autoSound ? 'auto' : voice}
                    onChange={onChange}
                    options={options}
                    ariaLabel={`${module} sound source`}
                />
            </SettingRow>
            {catalogPacks.some((p) => !isPackInstalled(p.id)) && (
                <p class="text-mini-muted">More sounds in Settings → Packs.</p>
            )}
        </SettingGroup>
    );
}

interface InstrumentSpecificSettingsProps {
    module: StudioInstrumentModule;
}

export function InstrumentSpecificSettings({ module }: InstrumentSpecificSettingsProps) {
    const state = getInstrumentState(module);

    if (!state) {
        return null;
    }

    return (
        <Fragment>
            <InstrumentSoundSource module={module} />
            <SettingGroup title={getInstrumentSpecificTitle(module)}>
                {module === 'chords' && (
                    <SettingRow label="Density" id="densitySelect">
                        <Select
                            id="densitySelect"
                            value={state.density || 'standard'}
                            onChange={(val) => {
                                dispatch(ACTIONS.SET_DENSITY, val);
                                saveCurrentState();
                            }}
                            options={[
                                { value: 'thin', label: 'Thin (3 notes)' },
                                { value: 'standard', label: 'Standard (4 notes)' },
                                { value: 'rich', label: 'Rich (5+ notes)' },
                            ]}
                        />
                    </SettingRow>
                )}

                {module === 'harmony' && (
                    <SettingRow
                        label="Complexity"
                        id="harmonyComplexity"
                        valueDisplay={`${Math.round((state.complexity || 0.5) * 100)}%`}
                    >
                        <Slider
                            id="harmonyComplexity"
                            min="0"
                            max="1"
                            step="0.05"
                            value={state.complexity || 0.5}
                            onInput={(val) => {
                                dispatch(ACTIONS.SET_PARAM, {
                                    module: 'harmony',
                                    param: 'complexity',
                                    value: parseFloat(val),
                                });
                                saveCurrentState();
                            }}
                            ariaValueText={`${Math.round((state.complexity || 0.5) * 100)}%`}
                        />
                    </SettingRow>
                )}

                {module === 'soloist' && (
                    <Fragment>
                        <SettingRow
                            label="Complexity"
                            id="soloistComplexity"
                            valueDisplay={`${Math.round((state.complexity || 0.5) * 100)}%`}
                        >
                            <Slider
                                id="soloistComplexity"
                                min="0"
                                max="1"
                                step="0.05"
                                value={state.complexity !== undefined ? state.complexity : 0.5}
                                onInput={(val) => {
                                    dispatch(ACTIONS.SET_PARAM, {
                                        module: 'soloist',
                                        param: 'complexity',
                                        value: parseFloat(val),
                                    });
                                    saveCurrentState();
                                }}
                                ariaValueText={`${Math.round((state.complexity || 0.5) * 100)}%`}
                            />
                        </SettingRow>

                        <SettingRow label="Phrasing Mode" id="soloistModeSelect">
                            <Select
                                id="soloistModeSelect"
                                value={state.mode || 'monophonic'}
                                onChange={(val) => {
                                    dispatch(ACTIONS.SET_SOLOIST_MODE, val);
                                    saveCurrentState();
                                }}
                                options={[
                                    { value: 'monophonic', label: 'Monophonic' },
                                    { value: 'guitar', label: 'Guitar' },
                                ]}
                            />
                        </SettingRow>
                    </Fragment>
                )}

                {module === 'groove' && <GrooveControls state={state} />}
            </SettingGroup>
        </Fragment>
    );
}

interface GrooveControlsProps {
    state: GrooveState;
}

function GrooveControls({ state }: GrooveControlsProps) {
    const { swing, swingSub } = useEnsembleState((s) => ({
        swing: s.groove.swing,
        swingSub: s.groove.swingSub,
    }));

    return (
        <Fragment>
            <SettingRow label="Swing" id="swingSlider" valueDisplay={`${swing || 0}%`}>
                <div class="flex-row instrument-settings-swing-controls">
                    <Slider
                        id="swingSlider"
                        min="0"
                        max="100"
                        value={swing || 0}
                        onInput={(val) => {
                            dispatch(ACTIONS.SET_SWING, parseInt(val, 10));
                            saveCurrentState();
                        }}
                        ariaValueText={`${swing || 0}%`}
                    />
                    <Select
                        id="swingBaseSelect"
                        value={swingSub || '8th'}
                        onChange={(val) => {
                            dispatch(ACTIONS.SET_SWING_SUB, val);
                            saveCurrentState();
                        }}
                        options={[
                            { value: '16th', label: '1/16' },
                            { value: '8th', label: '1/8' },
                        ]}
                    />
                </div>
            </SettingRow>

            <SettingRow
                label="Humanize"
                id="humanizeSlider"
                valueDisplay={`${state.humanize || 0}%`}
            >
                <Slider
                    id="humanizeSlider"
                    min="0"
                    max="100"
                    value={state.humanize || 0}
                    onInput={(val) => {
                        dispatch(ACTIONS.SET_HUMANIZE, parseInt(val, 10));
                        saveCurrentState();
                    }}
                    ariaValueText={`${state.humanize || 0}%`}
                />
            </SettingRow>
        </Fragment>
    );
}
