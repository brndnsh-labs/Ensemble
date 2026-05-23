import { Fragment } from 'preact';
import { dispatch, getState } from '../state.js';
import { ACTIONS } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';

const { playback } = getState();

import { MIXER_GAIN_MULTIPLIERS } from '../config.js';
import { saveCurrentState } from '../persistence.js';
import type { GrooveState } from '../state/groove.js';
import { Select, SettingGroup, SettingRow, Slider, Toggle } from './UIControls.jsx';

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
    icon?: string;
    label?: string;
}

export function InstrumentMixerStrip({
    module,
    accent = '',
    icon = '',
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
                {icon && (
                    <span class="workspace-studio-mixer-strip-icon" aria-hidden="true">
                        {icon}
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

interface InstrumentSpecificSettingsProps {
    module: StudioInstrumentModule;
}

export function InstrumentSpecificSettings({ module }: InstrumentSpecificSettingsProps) {
    const state = getInstrumentState(module);

    if (!state) {
        return null;
    }

    return (
        <SettingGroup title={getInstrumentSpecificTitle(module)}>
            {/* synth-audit Epic 0 S1 — A/B voice toggle, present for every instrument. */}
            <SettingRow label="New Sound" id={`${getModuleName(module)}VoiceToggle`}>
                <Toggle
                    id={`${getModuleName(module)}VoiceToggle`}
                    checked={state.voice === 'new'}
                    ariaLabel={`${getModuleName(module)} new sound`}
                    onChange={(val) => {
                        dispatch(ACTIONS.SET_INSTRUMENT_VOICE, {
                            module,
                            voice: val ? 'new' : 'current',
                        });
                        saveCurrentState();
                    }}
                />
            </SettingRow>

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

            <SettingRow label="Creativity" id="creativityCheck">
                <Toggle
                    id="creativityCheck"
                    checked={!!state.creativity}
                    ariaLabel="Creativity"
                    onChange={(val) => {
                        dispatch(ACTIONS.SET_PARAM, {
                            module: 'groove',
                            param: 'creativity',
                            value: val,
                        });
                        saveCurrentState();
                    }}
                />
            </SettingRow>
        </Fragment>
    );
}
