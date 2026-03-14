import { h } from 'preact';
import React from 'preact/compat';
import { useEffect, useRef, useState } from 'preact/hooks';
import { dispatch, getState } from '../state.js';
import { ACTIONS } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';

const { playback } = getState();

import { applyTheme } from '../app-controller.js';
import { APP_VERSION, MIXER_GAIN_MULTIPLIERS } from '../config.js';
import { restoreGains } from '../engine/engine.js';
import { initMIDI, panic } from '../midi-controller.js';
import { saveCurrentState } from '../persistence.js';
import { triggerInstall } from '../pwa.js';
import { Select, SettingGroup, SettingRow, Slider, Stepper, Toggle } from './UIControls.jsx';

export function Settings() {
    const {
        theme,
        countIn,
        metronome,
        visualFlash,
        haptic,
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
    } = useEnsembleState((state) => ({
        theme: state.playback.theme,
        countIn: state.playback.countIn,
        metronome: state.playback.metronome,
        visualFlash: state.playback.visualFlash,
        haptic: state.playback.haptic,
        sessionTimer: state.playback.sessionTimer,
        loopLimit: state.playback.loopLimit,
        songMode: state.playback.songMode,

        midiEnabled: state.midi.enabled,
        midiMuteLocal: state.midi.muteLocal,
        midiSelectedOutputId: state.midi.selectedOutputId,
        midiOutputs: state.midi.outputs,
        midiChannels: {
            chords: state.midi.chordsChannel,
            bass: state.midi.bassChannel,
            soloist: state.midi.soloistChannel,
            harmony: state.midi.harmonyChannel,
            drums: state.midi.drumsChannel,
        },
        midiOctaves: {
            chords: state.midi.chordsOctave,
            bass: state.midi.bassOctave,
            soloist: state.midi.soloistOctave,
            harmony: state.midi.harmonyOctave,
            drums: state.midi.drumsOctave,
        },
        midiLatency: state.midi.latency,
        midiVelocity: state.midi.velocitySensitivity,
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

    const handleMasterVolume = (val) => {
        const numVal = parseFloat(val);
        dispatch(ACTIONS.SET_PARAM, { module: 'playback', param: 'masterVolume', value: numVal });

        if (playback.masterGain && playback.audio) {
            const target = Math.max(0.0001, numVal * MIXER_GAIN_MULTIPLIERS.master);
            playback.masterGain.gain.cancelScheduledValues(playback.audio.currentTime);
            playback.masterGain.gain.setValueAtTime(
                playback.masterGain.gain.value,
                playback.audio.currentTime,
            );
            playback.masterGain.gain.exponentialRampToValueAtTime(
                target,
                playback.audio.currentTime + 0.04,
            );
        }
        saveCurrentState();
    };

    const handleMidiEnable = async (enabled) => {
        if (enabled) {
            const success = await initMIDI();
            if (!success) {
                return;
            }
        } else {
            panic();
        }
        dispatch(ACTIONS.SET_MIDI_CONFIG, { enabled });
        restoreGains();
        saveCurrentState();
    };

    const handleReset = () => {
        localStorage.clear();
        window.location.reload();
    };

    const handleInstall = async () => {
        if (await triggerInstall()) {
            const btn = document.getElementById('installAppBtn');
            if (btn) {
                btn.style.display = 'none';
            }
        }
    };

    const [showConfirmReset, setShowConfirmReset] = useState(false);

    const isOpen = useEnsembleState((s) => s.playback.modals.settings);
    const notation = useEnsembleState((s) => s.arranger.notation);
    const applyPresetSettings = useEnsembleState((s) => s.playback.applyPresetSettings);
    const playbackState = useEnsembleState((s) => s.playback);
    const overlayRef = useRef(null);

    useEffect(() => {
        if (isOpen && overlayRef.current) {
            const focusable = overlayRef.current.querySelector(
                'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
            );
            if (focusable) {
                setTimeout(() => focusable.focus(), 50);
            }
        }
    }, [isOpen]);

    return (
        <div
            id="settingsOverlay"
            ref={overlayRef}
            class={`settings-overlay ${isOpen ? 'active' : ''}`}
            aria-hidden={!isOpen ? 'true' : 'false'}
            onClick={(e) => {
                if (e.target.id === 'settingsOverlay') {
                    closeSettings();
                }
            }}
        >
            <div class="settings-content" onClick={(e) => e.stopPropagation()}>
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

                <div class="settings-controls">
                    {/* Audio & Setup Section */}
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
                    </SettingGroup>

                    {/* Visuals & Interface Section */}
                    <SettingGroup title="Visuals & Interface">
                        <SettingRow label="Theme" id="themeSelect">
                            <Select
                                id="themeSelect"
                                value={theme}
                                onChange={(val) => {
                                    applyTheme(val);
                                    saveCurrentState();
                                }}
                                options={[
                                    { value: 'auto', label: 'Auto (System Default)' },
                                    { value: 'dark', label: 'Dark' },
                                    { value: 'light', label: 'Light' },
                                ]}
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

                    {/* Performance Engine Section */}
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
                                onInput={(val) => {
                                    dispatch(ACTIONS.SET_COMPLEXITY, parseInt(val, 10) / 100);
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

                                <div class={`flex-col ${!songMode ? 'disabled-group' : ''}`}>
                                    <SettingRow label="Duration Type" id="durationTypeSelect">
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
                                        <div class="flex-col" style="align-items: flex-end;">
                                            <Stepper
                                                id="sessionTimer"
                                                value={loopLimit > 0 ? loopLimit : sessionTimer}
                                                min={1}
                                                max={loopLimit > 0 ? 50 : 20}
                                                decAriaLabel="Decrease song duration"
                                                incAriaLabel="Increase song duration"
                                                onDecrement={() => {
                                                    if (loopLimit > 0) {
                                                        const next = Math.max(1, loopLimit - 1);
                                                        dispatch(ACTIONS.SET_PARAM, {
                                                            module: 'playback',
                                                            param: 'loopLimit',
                                                            value: next,
                                                        });
                                                    } else {
                                                        const next = Math.max(1, sessionTimer - 1);
                                                        dispatch(ACTIONS.SET_SESSION_TIMER, next);
                                                    }
                                                    saveCurrentState();
                                                }}
                                                onIncrement={() => {
                                                    if (loopLimit > 0) {
                                                        const next = Math.min(50, loopLimit + 1);
                                                        dispatch(ACTIONS.SET_PARAM, {
                                                            module: 'playback',
                                                            param: 'loopLimit',
                                                            value: next,
                                                        });
                                                    } else {
                                                        const next = Math.min(20, sessionTimer + 1);
                                                        dispatch(ACTIONS.SET_SESSION_TIMER, next);
                                                    }
                                                    saveCurrentState();
                                                }}
                                            />
                                            {loopLimit > 0 && (
                                                <div
                                                    class="text-mini-muted"
                                                    style="color: var(--accent-color); font-weight: 500;"
                                                >
                                                    {(() => {
                                                        const { arranger, playback } = getState();
                                                        const totalSteps =
                                                            arranger.totalSteps * loopLimit;
                                                        const secPerStep = 60 / playback.bpm / 4;
                                                        const totalSec = totalSteps * secPerStep;
                                                        const mins = Math.floor(totalSec / 60);
                                                        const secs = Math.round(totalSec % 60);
                                                        return `Est. Time: ${mins}:${secs
                                                            .toString()
                                                            .padStart(2, '0')}`;
                                                    })()}
                                                </div>
                                            )}
                                        </div>
                                    </SettingRow>
                                </div>
                            </div>
                            <p class="performance-ending-footer">
                                The band will evolve the energy naturally and perform a resolution
                                at the end of the final loop once the limit is reached.
                            </p>
                        </div>
                    </SettingGroup>

                    {/* Library & Presets Section */}
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

                    {/* External Section (MIDI) */}
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
                                        restoreGains();
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
                                            ? midiOutputs.map((out) => ({
                                                  value: out.id,
                                                  label: out.name,
                                              }))
                                            : [{ value: '', label: 'No outputs found' }]
                                    }
                                />
                            </SettingRow>

                            <div class="midi-grid">
                                {['Chords', 'Bass', 'Soloist', 'Harmony', 'Drums'].map((ch) => (
                                    <div class="midi-ch-group" key={ch}>
                                        <label htmlFor={`midi${ch}Channel`}>{ch}</label>
                                        <div class="flex-row">
                                            <input
                                                id={`midi${ch}Channel`}
                                                type="number"
                                                min="1"
                                                max="16"
                                                value={midiChannels[ch.toLowerCase()]}
                                                onChange={(e) => {
                                                    dispatch(ACTIONS.SET_MIDI_CONFIG, {
                                                        [`${ch.toLowerCase()}Channel`]: parseInt(
                                                            e.target.value,
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
                                                onChange={(e) => {
                                                    dispatch(ACTIONS.SET_MIDI_CONFIG, {
                                                        [`${ch.toLowerCase()}Octave`]: parseInt(
                                                            e.target.value,
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
                                ))}
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
                                valueDisplay={`${parseFloat(midiVelocity).toFixed(1)}x`}
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
                                    ariaValueText={`${parseFloat(midiVelocity).toFixed(1)}x`}
                                />
                            </SettingRow>
                        </div>
                    </SettingGroup>

                    {/* Actions Section */}
                    <SettingGroup
                        title="System Actions"
                        style="border-bottom: none; padding-bottom: 0;"
                    >
                        <div class="grid-actions">
                            <button
                                id="settingsShareHubBtn"
                                class="secondary-btn flex-row"
                                style="justify-content: center;"
                                onClick={() => {
                                    closeSettings();
                                    dispatch(ACTIONS.SET_MODAL_OPEN, {
                                        modal: 'share',
                                        open: true,
                                    });
                                }}
                            >
                                <span>📤</span> Share & Export
                            </button>
                            <button
                                id="installAppBtn"
                                class="secondary-btn flex-row"
                                style="display: none; justify-content: center;"
                                onClick={handleInstall}
                            >
                                <span>📲</span> Install App
                            </button>
                            {showConfirmReset ? (
                                <div
                                    class="confirm-reset-panel danger-bg"
                                    role="alert"
                                    aria-live="polite"
                                    style="grid-column: 1 / -1; padding: 0.5rem; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.2); border-radius: 8px; display: flex; flex-direction: column; gap: 0.5rem;"
                                >
                                    <div style="font-size: 0.8rem; color: var(--text-color); text-align: center;">
                                        Reset all settings and progress?
                                    </div>
                                    <div style="display: flex; gap: 0.5rem;">
                                        <button
                                            id="confirmResetBtn"
                                            class="primary-btn"
                                            style="flex: 1; padding: 0.4rem; font-size: 0.8rem; background: var(--red); color: white; border: none; font-weight: bold;"
                                            onClick={handleReset}
                                        >
                                            Yes, Reset
                                        </button>
                                        <button
                                            id="cancelResetBtn"
                                            class="secondary-btn"
                                            style="flex: 1; padding: 0.4rem; font-size: 0.8rem; border-color: var(--border-color); color: var(--text-color); background: transparent;"
                                            onClick={() => {
                                                setShowConfirmReset(false);
                                                setTimeout(() => {
                                                    const btn =
                                                        document.getElementById('resetSettingsBtn');
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
                                            const btn = document.getElementById('cancelResetBtn');
                                            if (btn) {
                                                btn.focus();
                                            }
                                        }, 50);
                                    }}
                                >
                                    <span>🗑️</span> Reset All
                                </button>
                            )}
                            <button
                                id="refreshAppBtn"
                                class="secondary-btn flex-row"
                                style="justify-content: center;"
                                onClick={() => window.location.reload()}
                            >
                                <span>🔄</span> Force Refresh
                            </button>
                        </div>
                    </SettingGroup>

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
                                        For a deep dive into notation, soloing styles, and MIDI
                                        export, check out the full manual.
                                    </p>
                                    <button
                                        onClick={() =>
                                            dispatch(ACTIONS.SET_MODAL_OPEN, {
                                                modal: 'manual',
                                                open: true,
                                            })
                                        }
                                        class="manual-link"
                                        style="border: none; cursor: pointer; width: 100%; text-align: center;"
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
                </div>
            </div>
        </div>
    );
}
