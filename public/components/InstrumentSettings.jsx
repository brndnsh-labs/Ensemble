import { Fragment, h } from 'preact';
import { dispatch, getState } from '../state.js';
import { ACTIONS } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';

const { playback } = getState();

import { MIXER_GAIN_MULTIPLIERS } from '../config.js';
import { saveCurrentState } from '../persistence.js';
import { Select, SettingGroup, SettingRow, Slider, Toggle } from './UIControls.jsx';

/**
 * @typedef {Object} InstrumentSettingsProps
 * @property {string} module
 */
/** @param {InstrumentSettingsProps} props */
export function InstrumentSettings({ module }) {
    const state = useEnsembleState((/** @type {import('../types.js').EnsembleState} */ s) => {
        const key = module === 'groove' ? 'groove' : module;
        return /** @type {any} */ (s)[key];
    });

    if (!state) {
        return null;
    }

    const moduleName =
        module === 'groove'
            ? 'drum'
            : module === 'chords'
              ? 'chord'
              : module === 'harmony'
                ? 'harmony'
                : module;

    // Helper to update Volume/Reverb with audio ramping
    const updateAudio = (/** @type {string} */ type, /** @type {any} */ val) => {
        const numVal = parseFloat(val);
        const isReverb = type === 'reverb';

        if (state) {
            dispatch(isReverb ? ACTIONS.SET_REVERB : ACTIONS.SET_VOLUME, {
                module,
                value: numVal,
            });
            saveCurrentState();
        }

        const internalName =
            module === 'groove' ? 'drums' : module === 'harmony' ? 'harmonies' : module;

        const gainKey = isReverb ? `${internalName}Reverb` : `${internalName}Gain`;
        const multiplier = isReverb
            ? 1.0
            : /** @type {any} */ (MIXER_GAIN_MULTIPLIERS)[internalName] || 1.0;

        const node = /** @type {any} */ (playback)[gainKey];
        if (node && playback.audio) {
            const target = Math.max(0.0001, numVal * multiplier);
            node.gain.cancelScheduledValues(playback.audio.currentTime);
            node.gain.setValueAtTime(node.gain.value, playback.audio.currentTime);
            node.gain.exponentialRampToValueAtTime(target, playback.audio.currentTime + 0.04);
        }
    };

    return (
        <div class="grid-2-col">
            {/* Left Column: Instrument Specifics */}
            <SettingGroup
                title={
                    module === 'groove'
                        ? 'Feel & Actions'
                        : module === 'chords' || module === 'harmony'
                          ? 'Voicing'
                          : 'Instrument'
                }
            >
                {module === 'chords' && (
                    <SettingRow label="Density" id="densitySelect">
                        <Select
                            id="densitySelect"
                            value={state.density || 'standard'}
                            onChange={(/** @type {any} */ val) => {
                                dispatch(/** @type {any} */ (ACTIONS).SET_CHORD_DENSITY, val);
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

                {module === 'chords' && (
                    <SettingRow label="Piano Roots" id="pianoRootsCheck">
                        <Toggle
                            id="pianoRootsCheck"
                            checked={state.pianoRoots}
                            onChange={(/** @type {any} */ val) => {
                                dispatch(ACTIONS.SET_PIANO_ROOTS, val);
                                saveCurrentState();
                            }}
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
                            onInput={(/** @type {any} */ val) => {
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
                                onInput={(/** @type {any} */ val) => {
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

                        <SettingRow label="Lead Sound" id="soloistPresetSelect">
                            <Select
                                id="soloistPresetSelect"
                                value={state.preset || 'classic'}
                                onChange={(/** @type {any} */ val) => {
                                    dispatch(ACTIONS.SET_SOLOIST_PRESET, val);
                                    saveCurrentState();
                                }}
                                options={[
                                    { value: 'classic', label: 'Classic Sawtooth' },
                                    { value: 'neo', label: 'Neo-Juno' },
                                    { value: 'vowel', label: 'Vowel Lead' },
                                    { value: 'trumpet', label: 'Trumpet' },
                                    { value: 'saxophone', label: 'Saxophone' },
                                ]}
                            />
                        </SettingRow>

                        <SettingRow label="Phrasing Mode" id="soloistModeSelect">
                            <Select
                                id="soloistModeSelect"
                                value={state.mode || 'monophonic'}
                                onChange={(/** @type {any} */ val) => {
                                    dispatch(ACTIONS.SET_SOLOIST_MODE, val);
                                    saveCurrentState();
                                }}
                                options={[
                                    { value: 'monophonic', label: 'Monophonic' },
                                    { value: 'guitar', label: 'Guitar' },
                                    { value: 'piano', label: 'Piano' },
                                ]}
                            />
                        </SettingRow>
                    </Fragment>
                )}

                {module === 'groove' && <GrooveControls state={state} />}
            </SettingGroup>

            {/* Right Column: Mixer */}
            <SettingGroup title="Mixer" className="divider-top">
                <SettingRow
                    label="Volume"
                    id={`${moduleName}Volume`}
                    valueDisplay={`${Math.round(state.volume * 100)}%`}
                >
                    <Slider
                        id={`${moduleName}Volume`}
                        min="0"
                        max="1"
                        step="0.05"
                        value={state.volume}
                        onInput={(/** @type {any} */ val) => updateAudio('volume', val)}
                        ariaValueText={`${Math.round(state.volume * 100)}%`}
                    />
                </SettingRow>
                <SettingRow
                    label="Reverb"
                    id={`${moduleName}Reverb`}
                    valueDisplay={`${Math.round(state.reverb * 100)}%`}
                >
                    <Slider
                        id={`${moduleName}Reverb`}
                        min="0"
                        max="1"
                        step="0.05"
                        value={state.reverb}
                        onInput={(/** @type {any} */ val) => updateAudio('reverb', val)}
                        ariaValueText={`${Math.round(state.reverb * 100)}%`}
                    />
                </SettingRow>
            </SettingGroup>
        </div>
    );
}

/**
 * @typedef {Object} GrooveControlsProps
 * @property {import('../state/groove.js').GrooveState} state
 */
/** @param {GrooveControlsProps} props */
function GrooveControls({ state }) {
    const { swing, swingSub } = useEnsembleState(
        (/** @type {import('../types.js').EnsembleState} */ s) => ({
            swing: s.groove.swing,
            swingSub: s.groove.swingSub,
        }),
    );

    return (
        <Fragment>
            <SettingRow label="Swing" id="swingSlider" valueDisplay={`${swing || 0}%`}>
                <div class="flex-row">
                    <Slider
                        id="swingSlider"
                        min="0"
                        max="100"
                        value={swing || 0}
                        onInput={(/** @type {any} */ val) => {
                            dispatch(ACTIONS.SET_SWING, parseInt(val, 10));
                            saveCurrentState();
                        }}
                        ariaValueText={`${swing || 0}%`}
                    />
                    <Select
                        id="swingBaseSelect"
                        value={swingSub || '8th'}
                        onChange={(/** @type {any} */ val) => {
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
                    onInput={(/** @type {any} */ val) => {
                        dispatch(ACTIONS.SET_HUMANIZE, parseInt(val, 10));
                        saveCurrentState();
                    }}
                    ariaValueText={`${state.humanize || 0}%`}
                />
            </SettingRow>

            <SettingGroup title="Lars Mode" className="divider-top">
                <SettingRow label="Enabled" id="larsModeCheck">
                    <Toggle
                        id="larsModeCheck"
                        checked={state.larsMode}
                        onChange={(/** @type {any} */ val) => {
                            dispatch(ACTIONS.SET_LARS_MODE, val);
                            saveCurrentState();
                        }}
                    />
                </SettingRow>
                <div class={!state.larsMode ? 'disabled-group' : ''}>
                    <SettingRow
                        label="Intensity"
                        id="larsIntensitySlider"
                        valueDisplay={`${Math.round(state.larsIntensity * 100)}%`}
                    >
                        <Slider
                            id="larsIntensitySlider"
                            min="0"
                            max="100"
                            value={Math.round(state.larsIntensity * 100)}
                            onInput={(/** @type {any} */ val) => {
                                dispatch(ACTIONS.SET_LARS_INTENSITY, parseInt(val, 10) / 100);
                                saveCurrentState();
                            }}
                            ariaValueText={`${Math.round(state.larsIntensity * 100)}%`}
                        />
                    </SettingRow>
                </div>
            </SettingGroup>
        </Fragment>
    );
}
