import { useRef, useState } from 'preact/hooks';
import { dispatch, getState } from '../state.js';
import { ACTIONS } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';

const { playback } = getState();

import { APP_VERSION, MIXER_GAIN_MULTIPLIERS } from '../config.js';
import { getEffectiveLoopLimit } from '../engine/arc.js';
import { initMIDI, panic } from '../midi-controller.js';
import { saveCurrentState } from '../persistence.js';
import { triggerInstall } from '../pwa.js';
import { secondsPerStepFor } from '../utils.js';
import { Icon } from './Icon.jsx';
import { SoundsSettings } from './SoundsSettings.jsx';
import { ModeToggle, PalettePicker } from './ThemePicker.jsx';
import { Select, SettingGroup, SettingRow, Slider, Stepper, Toggle } from './UIControls.jsx';

const SETTINGS_TABS = [
    { id: 'playback', label: 'Playback' },
    { id: 'sounds', label: 'Sounds' },
    { id: 'appearance', label: 'Appearance' },
    { id: 'midi', label: 'MIDI' },
    { id: 'about', label: 'About' },
] as const;

import { useModalA11y } from './use-modal-a11y.js';

export function Settings() {
    const {
        countIn,
        metronome,
        practiceMode,
        visualFlash,
        haptic,
        qualityColors,
        sessionTimer,
        loopLimit,
        songMode,
        midiEnabled,
        midiMuteLocal,
        midiSelectedOutputId,
        midiOutputs,
        midiChannels,
        midiOctaves,
        midiLatency,
        midiVelocity,
    } = useEnsembleState((s) => ({
        countIn: s.playback.countIn,
        metronome: s.playback.metronome,
        practiceMode: s.playback.practiceMode,
        visualFlash: s.playback.visualFlash,
        haptic: s.playback.haptic,
        qualityColors: s.playback.qualityColors,
        sessionTimer: s.playback.sessionTimer,
        loopLimit: s.playback.loopLimit,
        songMode: s.playback.songMode,

        midiEnabled: s.midi.enabled,
        midiMuteLocal: s.midi.muteLocal,
        midiSelectedOutputId: s.midi.selectedOutputId,
        midiOutputs: s.midi.outputs,
        midiChannels: {
            chords: s.midi.chordsChannel,
            bass: s.midi.bassChannel,
            soloist: s.midi.soloistChannel,
            harmony: s.midi.harmonyChannel,
            drums: s.midi.drumsChannel,
        } as Record<string, number>,
        midiOctaves: {
            chords: s.midi.chordsOctave,
            bass: s.midi.bassOctave,
            soloist: s.midi.soloistOctave,
            harmony: s.midi.harmonyOctave,
            drums: s.midi.drumsOctave,
        } as Record<string, number>,
        midiLatency: s.midi.latency,
        midiVelocity: s.midi.velocitySensitivity,
    }));

    const masterVolume = useEnsembleState((s) => s.playback.masterVolume);
    const complexity = useEnsembleState((s) => s.playback.complexity);

    let complexityLabel = 'Low';
    if (complexity > 0.33) {
        complexityLabel = 'Medium';
    }
    if (complexity > 0.66) {
        complexityLabel = 'High';
    }

    const closeSettings = () => {
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'settings', open: false });
    };

    const handleMasterVolume = (val: string | number) => {
        const numVal = parseFloat(val.toString());
        dispatch(ACTIONS.SET_PARAM, { module: 'playback', param: 'masterVolume', value: numVal });

        if (playback.audioGraph && playback.audio) {
            const masterGain = playback.audioGraph.master.gain;
            const target = Math.max(0.0001, numVal * MIXER_GAIN_MULTIPLIERS.master);
            masterGain.gain.cancelScheduledValues(playback.audio.currentTime);
            masterGain.gain.setValueAtTime(masterGain.gain.value, playback.audio.currentTime);
            masterGain.gain.exponentialRampToValueAtTime(target, playback.audio.currentTime + 0.04);
        }
        saveCurrentState();
    };

    const handleMidiEnable = async (enabled: boolean) => {
        if (enabled) {
            const success = await initMIDI();
            if (!success) {
                return;
            }
        } else {
            panic();
        }
        dispatch(ACTIONS.SET_MIDI_CONFIG, { enabled });
        dispatch(ACTIONS.RESTORE_GAINS);
        saveCurrentState();
    };

    const handleReset = () => {
        localStorage.clear();
        window.location.reload();
    };

    const handleInstall = async () => {
        if (await triggerInstall()) {
            const btn = document.getElementById('installAppBtn') as HTMLElement | null;
            if (btn) {
                btn.style.display = 'none';
            }
        }
    };

    const [showConfirmReset, setShowConfirmReset] = useState(false);
    const [tab, setTab] = useState<string>('playback');

    const isOpen = useEnsembleState((s) => s.playback.modals.settings);
    const notation = useEnsembleState((s) => s.arranger.notation);
    const applyPresetSettings = useEnsembleState((s) => s.playback.applyPresetSettings);
    const playbackState = useEnsembleState((s) => s.playback);
    const overlayRef = useRef<HTMLDivElement | null>(null);

    useModalA11y(overlayRef, isOpen, closeSettings, 'Settings');

    return (
        <div
            id="settingsOverlay"
            ref={overlayRef}
            class={`settings-overlay ${isOpen ? 'active' : ''}`}
            aria-hidden={!isOpen ? 'true' : 'false'}
            onClick={(e: Event) => {
                if ((e.target as HTMLElement).id === 'settingsOverlay') {
                    closeSettings();
                }
            }}
        >
            <div class="settings-content" onClick={(e: Event) => e.stopPropagation()}>
                <div class="modal-header-shared">
                    <h2>Settings</h2>
                    <button
                        id="closeSettingsBtn"
                        class="close-btn"
                        aria-label="Close Settings"
                        onClick={closeSettings}
                    >
                        &times;
                    </button>
                </div>

                <div class="settings-body">
                    <nav class="settings-tabs" role="tablist" aria-label="Settings sections">
                        {SETTINGS_TABS.map((t) => (
                            <button
                                key={t.id}
                                type="button"
                                role="tab"
                                id={`settingsTab-${t.id}`}
                                aria-selected={tab === t.id}
                                class={`settings-tab${tab === t.id ? ' is-active' : ''}`}
                                onClick={() => setTab(t.id)}
                            >
                                {t.label}
                            </button>
                        ))}
                    </nav>
                    <div class="settings-panel" role="tabpanel">
                        {tab === 'sounds' && <SoundsSettings />}
                        {tab === 'playback' && (
                            <SettingGroup title="Audio & Setup">
                                <SettingRow
                                    label="Master Volume"
                                    id="masterVolume"
                                    valueDisplay={`${Math.round((masterVolume || 0.5) * 100)}%`}
                                >
                                    <Slider
                                        id="masterVolume"
                                        min="0"
                                        max="1"
                                        step="0.05"
                                        value={masterVolume || 0.5}
                                        onInput={handleMasterVolume}
                                        ariaValueText={`${Math.round((masterVolume || 0.5) * 100)}%`}
                                    />
                                </SettingRow>

                                <SettingRow label="Metronome" id="metronomeCheck">
                                    <Toggle
                                        id="metronomeCheck"
                                        checked={metronome}
                                        onChange={(val) => {
                                            dispatch(ACTIONS.SET_METRONOME, val);
                                            saveCurrentState();
                                        }}
                                    />
                                </SettingRow>

                                <SettingRow label="Count-in" id="countInCheck">
                                    <Toggle
                                        id="countInCheck"
                                        checked={countIn}
                                        onChange={(val) => {
                                            dispatch(ACTIONS.SET_PARAM, {
                                                module: 'playback',
                                                param: 'countIn',
                                                value: val,
                                            });
                                            saveCurrentState();
                                        }}
                                    />
                                </SettingRow>

                                <SettingRow label="Practice Mode" id="practiceModeCheck">
                                    <Toggle
                                        id="practiceModeCheck"
                                        checked={practiceMode}
                                        onChange={(val) => {
                                            dispatch(ACTIONS.SET_PARAM, {
                                                module: 'playback',
                                                param: 'practiceMode',
                                                value: val,
                                            });
                                            saveCurrentState();
                                        }}
                                    />
                                </SettingRow>
                            </SettingGroup>
                        )}
                        {tab === 'appearance' && (
                            <SettingGroup title="Appearance">
                                <div class="settings-field-stacked" id="themeSelect">
                                    <span class="setting-label">Theme</span>
                                    <PalettePicker />
                                </div>

                                <div class="settings-field-stacked" id="modeSelect">
                                    <span class="setting-label">Light / dark</span>
                                    <ModeToggle />
                                </div>

                                <SettingRow
                                    label="Color chords by quality"
                                    description="Tint chord symbols by harmonic quality — major, minor, dominant, diminished, augmented."
                                    id="qualityColorsCheck"
                                >
                                    <Toggle
                                        id="qualityColorsCheck"
                                        checked={qualityColors}
                                        onChange={(val) => {
                                            dispatch(ACTIONS.SET_PARAM, {
                                                module: 'playback',
                                                param: 'qualityColors',
                                                value: val,
                                            });
                                            saveCurrentState();
                                        }}
                                    />
                                </SettingRow>

                                <SettingRow label="Chord Notation" id="notationSelect">
                                    <Select
                                        id="notationSelect"
                                        value={notation}
                                        onChange={(val) => {
                                            dispatch(ACTIONS.SET_NOTATION, val);
                                            saveCurrentState();
                                        }}
                                        options={[
                                            { value: 'roman', label: 'Roman Numerals (I, vi, IV)' },
                                            { value: 'name', label: 'Chord Names (C, Am, F)' },
                                            { value: 'nns', label: 'Nashville Numbers (1, 6-, 4)' },
                                        ]}
                                    />
                                </SettingRow>

                                <SettingRow label="Visual Flash" id="visualFlashCheck">
                                    <Toggle
                                        id="visualFlashCheck"
                                        checked={visualFlash}
                                        onChange={(val) => {
                                            dispatch(ACTIONS.SET_PARAM, {
                                                module: 'playback',
                                                param: 'visualFlash',
                                                value: val,
                                            });
                                            saveCurrentState();
                                        }}
                                    />
                                </SettingRow>

                                <SettingRow label="Haptic Feedback" id="hapticCheck">
                                    <Toggle
                                        id="hapticCheck"
                                        checked={haptic}
                                        onChange={(val) => {
                                            dispatch(ACTIONS.SET_PARAM, {
                                                module: 'playback',
                                                param: 'haptic',
                                                value: val,
                                            });
                                            saveCurrentState();
                                        }}
                                    />
                                </SettingRow>
                            </SettingGroup>
                        )}
                        {tab === 'playback' && (
                            <SettingGroup title="Performance Engine">
                                <SettingRow
                                    label="Global Complexity"
                                    description="Adjusts syncopation and harmonic density for Soloist, Bass, and Harmony engines."
                                    id="complexitySlider"
                                    valueDisplay={complexityLabel}
                                >
                                    <Slider
                                        id="complexitySlider"
                                        min="0"
                                        max="100"
                                        value={Math.round(complexity * 100)}
                                        onInput={(val: string) => {
                                            dispatch(
                                                ACTIONS.SET_COMPLEXITY,
                                                parseInt(val, 10) / 100,
                                            );
                                        }}
                                        ariaValueText={complexityLabel}
                                    />
                                </SettingRow>

                                <div class="performance-ending-section">
                                    <div class="flex-col">
                                        <SettingRow label="Song Mode" id="sessionTimerCheck">
                                            <Toggle
                                                id="sessionTimerCheck"
                                                checked={songMode}
                                                onChange={(val) => {
                                                    dispatch(ACTIONS.SET_SONG_MODE, val);
                                                    saveCurrentState();
                                                }}
                                            />
                                        </SettingRow>

                                        <div
                                            class={`flex-col ${!songMode ? 'disabled-group' : ''}`}
                                        >
                                            <SettingRow
                                                label="Duration Type"
                                                id="durationTypeSelect"
                                            >
                                                <div class="flex-row">
                                                    <button
                                                        class={`chip-btn ${loopLimit === 0 ? 'active' : ''}`}
                                                        onClick={() => {
                                                            dispatch(ACTIONS.SET_PARAM, {
                                                                module: 'playback',
                                                                param: 'loopLimit',
                                                                value: 0,
                                                            });
                                                            saveCurrentState();
                                                        }}
                                                    >
                                                        Timer
                                                    </button>
                                                    <button
                                                        class={`chip-btn ${loopLimit > 0 ? 'active' : ''}`}
                                                        onClick={() => {
                                                            dispatch(ACTIONS.SET_PARAM, {
                                                                module: 'playback',
                                                                param: 'loopLimit',
                                                                value: 3,
                                                            });
                                                            saveCurrentState();
                                                        }}
                                                    >
                                                        Loops
                                                    </button>
                                                </div>
                                            </SettingRow>

                                            <SettingRow
                                                label={loopLimit > 0 ? 'Choruses' : 'Minutes'}
                                                id="sessionTimerStepper"
                                            >
                                                <div class="flex-col settings-stepper-column">
                                                    <Stepper
                                                        id="sessionTimer"
                                                        value={
                                                            loopLimit > 0 ? loopLimit : sessionTimer
                                                        }
                                                        min={1}
                                                        max={loopLimit > 0 ? 50 : 20}
                                                        decAriaLabel="Decrease song duration"
                                                        incAriaLabel="Increase song duration"
                                                        onDecrement={() => {
                                                            if (loopLimit > 0) {
                                                                const next = Math.max(
                                                                    1,
                                                                    loopLimit - 1,
                                                                );
                                                                dispatch(ACTIONS.SET_PARAM, {
                                                                    module: 'playback',
                                                                    param: 'loopLimit',
                                                                    value: next,
                                                                });
                                                            } else {
                                                                const next = Math.max(
                                                                    1,
                                                                    sessionTimer - 1,
                                                                );
                                                                dispatch(
                                                                    ACTIONS.SET_SESSION_TIMER,
                                                                    next,
                                                                );
                                                            }
                                                            saveCurrentState();
                                                        }}
                                                        onIncrement={() => {
                                                            if (loopLimit > 0) {
                                                                const next = Math.min(
                                                                    50,
                                                                    loopLimit + 1,
                                                                );
                                                                dispatch(ACTIONS.SET_PARAM, {
                                                                    module: 'playback',
                                                                    param: 'loopLimit',
                                                                    value: next,
                                                                });
                                                            } else {
                                                                const next = Math.min(
                                                                    20,
                                                                    sessionTimer + 1,
                                                                );
                                                                dispatch(
                                                                    ACTIONS.SET_SESSION_TIMER,
                                                                    next,
                                                                );
                                                            }
                                                            saveCurrentState();
                                                        }}
                                                    />
                                                    <div class="text-mini-muted settings-estimated-time">
                                                        {(() => {
                                                            const { arranger, playback } =
                                                                getState();
                                                            if (
                                                                !arranger.totalSteps ||
                                                                !playback.bpm
                                                            ) {
                                                                return null;
                                                            }
                                                            const secPerStep = secondsPerStepFor(
                                                                playback.bpm,
                                                            );
                                                            const secPerLoop =
                                                                arranger.totalSteps * secPerStep;
                                                            if (loopLimit > 0) {
                                                                const totalSec =
                                                                    secPerLoop * loopLimit;
                                                                const mins = Math.floor(
                                                                    totalSec / 60,
                                                                );
                                                                const secs = Math.round(
                                                                    totalSec % 60,
                                                                );
                                                                return `Est. Time: ${mins}:${secs.toString().padStart(2, '0')}`;
                                                            }
                                                            // Timer mode: surface the resolved loop count so
                                                            // the user sees "3 min ≈ 12 loops" and isn't
                                                            // surprised by the macro-arc shape.
                                                            if (
                                                                sessionTimer > 0 &&
                                                                secPerLoop > 0
                                                            ) {
                                                                const resolved =
                                                                    getEffectiveLoopLimit(
                                                                        loopLimit,
                                                                        sessionTimer,
                                                                        playback.bpm,
                                                                        arranger.totalSteps,
                                                                    );
                                                                return `≈ ${resolved} loop${resolved === 1 ? '' : 's'} at this tempo`;
                                                            }
                                                            return null;
                                                        })()}
                                                    </div>
                                                </div>
                                            </SettingRow>
                                        </div>
                                    </div>
                                    <p class="performance-ending-footer">
                                        The band will evolve the energy naturally and perform a
                                        resolution at the end of the final loop once the limit is
                                        reached.
                                    </p>
                                </div>
                            </SettingGroup>
                        )}
                        {tab === 'playback' && (
                            <SettingGroup title="Library & Presets">
                                <SettingRow
                                    label="Auto-Apply Preset Settings"
                                    description="Automatically update BPM and Style when loading a library preset."
                                    id="applyPresetSettingsCheck"
                                >
                                    <Toggle
                                        id="applyPresetSettingsCheck"
                                        checked={applyPresetSettings}
                                        onChange={(val) => {
                                            dispatch(ACTIONS.SET_PRESET_SETTINGS_MODE, val);
                                            saveCurrentState();
                                        }}
                                    />
                                </SettingRow>
                            </SettingGroup>
                        )}
                        {tab === 'midi' && (
                            <SettingGroup title="External (MIDI Output)">
                                <SettingRow
                                    label="Enable Web MIDI Output"
                                    description="Route notes to your DAW or external hardware."
                                    id="midiEnableCheck"
                                >
                                    <Toggle
                                        id="midiEnableCheck"
                                        checked={midiEnabled}
                                        onChange={handleMidiEnable}
                                    />
                                </SettingRow>

                                <div class={!midiEnabled ? 'disabled-group' : ''}>
                                    <SettingRow label="Mute Browser Audio" id="midiMuteLocalCheck">
                                        <Toggle
                                            id="midiMuteLocalCheck"
                                            checked={midiMuteLocal}
                                            onChange={(val) => {
                                                dispatch(ACTIONS.SET_MIDI_CONFIG, {
                                                    muteLocal: val,
                                                });
                                                dispatch(ACTIONS.RESTORE_GAINS);
                                                saveCurrentState();
                                            }}
                                        />
                                    </SettingRow>

                                    <SettingRow label="Output Port" id="midiOutputSelect">
                                        <Select
                                            id="midiOutputSelect"
                                            value={midiSelectedOutputId || ''}
                                            onChange={(val) => {
                                                dispatch(ACTIONS.SET_MIDI_CONFIG, {
                                                    selectedOutputId: val,
                                                });
                                                saveCurrentState();
                                            }}
                                            options={
                                                midiOutputs && midiOutputs.length > 0
                                                    ? (midiOutputs as any[]).map((out) => ({
                                                          value: out.id,
                                                          label: out.name,
                                                      }))
                                                    : [{ value: '', label: 'No outputs found' }]
                                            }
                                        />
                                    </SettingRow>

                                    <div class="midi-grid">
                                        {['Chords', 'Bass', 'Soloist', 'Harmony', 'Drums'].map(
                                            (ch) => (
                                                <div class="midi-ch-group" key={ch}>
                                                    <label htmlFor={`midi${ch}Channel`}>{ch}</label>
                                                    <div class="flex-row">
                                                        <input
                                                            id={`midi${ch}Channel`}
                                                            type="number"
                                                            min="1"
                                                            max="16"
                                                            value={midiChannels[ch.toLowerCase()]}
                                                            onChange={(e: Event) => {
                                                                dispatch(ACTIONS.SET_MIDI_CONFIG, {
                                                                    [`${ch.toLowerCase()}Channel`]:
                                                                        parseInt(
                                                                            (
                                                                                e.target as HTMLInputElement
                                                                            ).value,
                                                                            10,
                                                                        ),
                                                                });
                                                                saveCurrentState();
                                                            }}
                                                            title="Channel"
                                                            aria-label={`${ch} MIDI Channel`}
                                                        />
                                                        <input
                                                            id={`midi${ch}Octave`}
                                                            type="number"
                                                            min="-2"
                                                            max="2"
                                                            value={midiOctaves[ch.toLowerCase()]}
                                                            onChange={(e: Event) => {
                                                                dispatch(ACTIONS.SET_MIDI_CONFIG, {
                                                                    [`${ch.toLowerCase()}Octave`]:
                                                                        parseInt(
                                                                            (
                                                                                e.target as HTMLInputElement
                                                                            ).value,
                                                                            10,
                                                                        ),
                                                                });
                                                                saveCurrentState();
                                                            }}
                                                            title="Octave Offset"
                                                            aria-label={`${ch} MIDI Octave Offset`}
                                                        />
                                                    </div>
                                                </div>
                                            ),
                                        )}
                                    </div>

                                    <SettingRow
                                        label="Latency Offset"
                                        id="midiLatencySlider"
                                        valueDisplay={`${midiLatency}ms`}
                                    >
                                        <Slider
                                            id="midiLatencySlider"
                                            min="-100"
                                            max="100"
                                            step="1"
                                            value={midiLatency}
                                            onInput={(val) => {
                                                dispatch(ACTIONS.SET_MIDI_CONFIG, {
                                                    latency: parseInt(val, 10),
                                                });
                                                saveCurrentState();
                                            }}
                                            ariaValueText={`${midiLatency} ms`}
                                        />
                                    </SettingRow>

                                    <SettingRow
                                        label="Velocity Sensitivity"
                                        id="midiVelocitySlider"
                                        valueDisplay={`${midiVelocity.toFixed(1)}x`}
                                    >
                                        <Slider
                                            id="midiVelocitySlider"
                                            min="0.5"
                                            max="2.0"
                                            step="0.1"
                                            value={midiVelocity}
                                            onInput={(val) => {
                                                dispatch(ACTIONS.SET_MIDI_CONFIG, {
                                                    velocitySensitivity: parseFloat(val),
                                                });
                                                saveCurrentState();
                                            }}
                                            ariaValueText={`${midiVelocity.toFixed(1)}x`}
                                        />
                                    </SettingRow>
                                </div>
                            </SettingGroup>
                        )}
                        {tab === 'about' && (
                            <SettingGroup
                                title="System Actions"
                                className="settings-section--borderless settings-section--no-padding"
                            >
                                <div class="grid-actions">
                                    <button
                                        id="settingsShareHubBtn"
                                        class="secondary-btn flex-row settings-action-center"
                                        onClick={() => {
                                            closeSettings();
                                            dispatch(ACTIONS.SET_MODAL_OPEN, {
                                                modal: 'share',
                                                open: true,
                                            });
                                        }}
                                    >
                                        <Icon name="upload" /> Share & Export
                                    </button>
                                    <button
                                        id="installAppBtn"
                                        class="secondary-btn flex-row settings-install-btn"
                                        onClick={handleInstall}
                                    >
                                        <Icon name="install" /> Install App
                                    </button>
                                    {showConfirmReset ? (
                                        <div
                                            class="confirm-reset-panel settings-reset-panel"
                                            role="alert"
                                            aria-live="polite"
                                        >
                                            <div class="settings-reset-copy">
                                                Reset all settings and progress?
                                            </div>
                                            <div class="settings-reset-actions">
                                                <button
                                                    id="confirmResetBtn"
                                                    class="primary-btn settings-reset-btn settings-reset-btn--primary"
                                                    onClick={handleReset}
                                                >
                                                    Yes, Reset
                                                </button>
                                                <button
                                                    id="cancelResetBtn"
                                                    class="secondary-btn settings-reset-btn settings-reset-btn--secondary"
                                                    onClick={() => {
                                                        setShowConfirmReset(false);
                                                        setTimeout(() => {
                                                            const btn =
                                                                document.getElementById(
                                                                    'resetSettingsBtn',
                                                                );
                                                            if (btn) {
                                                                btn.focus();
                                                            }
                                                        }, 50);
                                                    }}
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <button
                                            id="resetSettingsBtn"
                                            class="secondary-btn danger-btn"
                                            onClick={() => {
                                                setShowConfirmReset(true);
                                                setTimeout(() => {
                                                    const btn =
                                                        document.getElementById('cancelResetBtn');
                                                    if (btn) {
                                                        btn.focus();
                                                    }
                                                }, 50);
                                            }}
                                        >
                                            <Icon name="trash" /> Reset All
                                        </button>
                                    )}
                                    <button
                                        id="refreshAppBtn"
                                        class="secondary-btn flex-row settings-action-center"
                                        onClick={() => window.location.reload()}
                                    >
                                        <Icon name="refresh" /> Force Refresh
                                    </button>
                                </div>
                            </SettingGroup>
                        )}
                        {tab === 'about' && (
                            <SettingGroup title="Advanced">
                                <SettingRow
                                    label="Debug Soloist"
                                    description="Enable chain-of-thought logging for the Soloist engine. Helpful for troubleshooting."
                                    id="debugSoloistToggle"
                                >
                                    <Toggle
                                        id="debugSoloistToggle"
                                        checked={playbackState.debugSoloist}
                                        onChange={(val) =>
                                            dispatch(ACTIONS.SET_PARAM, {
                                                module: 'playback',
                                                param: 'debugSoloist',
                                                value: val,
                                            })
                                        }
                                    />
                                </SettingRow>
                            </SettingGroup>
                        )}
                        {tab === 'about' && (
                            <div class="settings-help">
                                <details open>
                                    <summary>
                                        <span>Help & Instructions</span>
                                        <span class="summary-arrow">▼</span>
                                    </summary>
                                    <div class="help-content">
                                        <div class="help-card">
                                            <h4>Need more help?</h4>
                                            <p>
                                                For a deep dive into notation, soloing styles, and
                                                MIDI export, check out the full manual.
                                            </p>
                                            <button
                                                onClick={() =>
                                                    dispatch(ACTIONS.SET_MODAL_OPEN, {
                                                        modal: 'manual',
                                                        open: true,
                                                    })
                                                }
                                                class="manual-link settings-manual-btn"
                                            >
                                                Open User Manual
                                            </button>
                                        </div>
                                    </div>
                                </details>
                                <div id="appVersion" class="app-version-display">
                                    Ensemble v{APP_VERSION}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
