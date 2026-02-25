import { h } from 'preact';
import React from 'preact/compat';
import { useEffect, useRef } from 'preact/hooks';
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

    const handleMasterVolume = (e) => {
        const val = parseFloat(e.target.value);
        dispatch(ACTIONS.SET_PARAM, { module: 'playback', param: 'masterVolume', value: val });

        if (playback.masterGain && playback.audio) {
            const target = Math.max(0.0001, val * MIXER_GAIN_MULTIPLIERS.master);
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

    const handleMidiEnable = async (e) => {
        const enabled = e.target.checked;
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

    const openExportModal = () => {
        closeSettings();
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'export', open: true });
    };

    const handleReset = () => {
        if (confirm('Reset all settings and progress? This cannot be undone.')) {
            localStorage.clear();
            window.location.reload();
        }
    };

    const handleInstall = async () => {
        if (await triggerInstall()) {
            const btn = document.getElementById('installAppBtn');
            if (btn) {
                btn.style.display = 'none';
            }
        }
    };

    const isOpen = useEnsembleState((s) => s.playback.modals.settings);
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
                <div style="display: flex; justify-content: space-between; margin-bottom: 1rem;">
                    <h2>Settings</h2>
                    <button
                        id="closeSettingsBtn"
                        style="background: none; border: none; font-size: 1.5rem;"
                        aria-label="Close Settings"
                        onClick={closeSettings}
                    >
                        &times;
                    </button>
                </div>

                <div class="settings-controls">
                    {/* Appearance Section */}
                    <div class="settings-section">
                        <h3>Appearance</h3>
                        <div style="margin-bottom: 1rem;">
                            <label style="display: block; margin-bottom: 0.5rem; font-size: 0.85rem; color: #94a3b8;">
                                Theme
                            </label>
                            <select
                                id="themeSelect"
                                value={theme}
                                onChange={(e) => {
                                    applyTheme(e.target.value);
                                    saveCurrentState();
                                }}
                                aria-label="Select Theme"
                            >
                                <option value="auto">Auto (System Default)</option>
                                <option value="dark">Dark</option>
                                <option value="light">Light</option>
                            </select>
                        </div>

                        <div style="margin-bottom: 0;">
                            <label style="display: block; margin-bottom: 0.5rem; font-size: 0.85rem; color: #94a3b8;">
                                Chord Notation
                            </label>
                            <select
                                id="notationSelect"
                                value={useEnsembleState((s) => s.arranger.notation)}
                                onChange={(e) => {
                                    dispatch(ACTIONS.SET_NOTATION, e.target.value);
                                    saveCurrentState();
                                }}
                                aria-label="Chord Notation"
                            >
                                <option value="roman">Roman Numerals (I, vi, IV)</option>
                                <option value="name">Chord Names (C, Am, F)</option>
                                <option value="nns">Nashville Numbers (1, 6-, 4)</option>
                            </select>
                        </div>
                    </div>

                    {/* Playback & Performance Section */}
                    <div class="settings-section">
                        <h3>Playback & Performance</h3>
                        <div class="setting-item" style="margin-bottom: 1.5rem;">
                            <label class="setting-label">
                                <span>Master Volume</span>
                            </label>
                            <input
                                id="masterVolume"
                                type="range"
                                min="0"
                                max="1"
                                step="0.05"
                                value={masterVolume || 0.5}
                                onInput={handleMasterVolume}
                                style="width: 100%;"
                                aria-label="Master Volume"
                                aria-valuetext={`${Math.round((masterVolume || 0.5) * 100)}%`}
                            />
                        </div>

                        <div class="setting-item" style="margin-bottom: 1.5rem;">
                            <label
                                class="setting-label"
                                style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.85rem; color: #94a3b8;"
                            >
                                <span>Global Complexity</span>
                                <span style="color: var(--accent-color); font-weight: bold;">
                                    {complexityLabel}
                                </span>
                            </label>
                            <input
                                id="complexitySlider"
                                type="range"
                                min="0"
                                max="100"
                                value={Math.round(complexity * 100)}
                                onInput={(e) => {
                                    dispatch(
                                        ACTIONS.SET_COMPLEXITY,
                                        parseInt(e.target.value, 10) / 100,
                                    );
                                }}
                                style="width: 100%;"
                                aria-label="Global Complexity"
                                aria-valuetext={complexityLabel}
                            />
                            <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.2rem;">
                                Adjusts syncopation and harmonic density for Soloist, Bass, and
                                Harmony engines.
                            </p>
                        </div>

                        <div style="margin-bottom: 1.5rem; display: flex; gap: 1.5rem; flex-wrap: wrap;">
                            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                <input
                                    id="countInCheck"
                                    type="checkbox"
                                    checked={countIn}
                                    onChange={(e) => {
                                        dispatch(ACTIONS.SET_PARAM, {
                                            module: 'playback',
                                            param: 'countIn',
                                            value: e.target.checked,
                                        });
                                        saveCurrentState();
                                    }}
                                />
                                <span>Count-in</span>
                            </label>
                            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                <input
                                    id="metronomeCheck"
                                    type="checkbox"
                                    checked={metronome}
                                    onChange={(e) => {
                                        dispatch(ACTIONS.SET_METRONOME, e.target.checked);
                                        saveCurrentState();
                                    }}
                                />
                                <span>Metronome</span>
                            </label>
                            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                <input
                                    id="visualFlashCheck"
                                    type="checkbox"
                                    checked={visualFlash}
                                    onChange={(e) => {
                                        dispatch(ACTIONS.SET_PARAM, {
                                            module: 'playback',
                                            param: 'visualFlash',
                                            value: e.target.checked,
                                        });
                                        saveCurrentState();
                                    }}
                                />
                                <span>Visual Flash</span>
                            </label>
                            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                <input
                                    id="hapticCheck"
                                    type="checkbox"
                                    checked={haptic}
                                    onChange={(e) => {
                                        dispatch(ACTIONS.SET_PARAM, {
                                            module: 'playback',
                                            param: 'haptic',
                                            value: e.target.checked,
                                        });
                                        saveCurrentState();
                                    }}
                                />
                                <span>Haptic Feedback</span>
                            </label>
                        </div>

                        <div
                            class="performance-ending-section"
                            style="background: rgba(0,0,0,0.1); padding: 1rem; border-radius: 8px;"
                        >
                            <div style="display: flex; flex-direction: column; gap: 1rem;">
                                <label style="display: flex; align-items: center; gap: 0.75rem; cursor: pointer; font-weight: 500;">
                                    <input
                                        id="sessionTimerCheck"
                                        type="checkbox"
                                        checked={songMode}
                                        onChange={(e) => {
                                            dispatch(ACTIONS.SET_SONG_MODE, e.target.checked);
                                            saveCurrentState();
                                        }}
                                    />
                                    <span>Song Mode</span>
                                </label>

                                <div
                                    class="ending-mode-selector"
                                    style={{
                                        display: 'flex',
                                        gap: '0.5rem',
                                        opacity: songMode ? '1' : '0.4',
                                        pointerEvents: songMode ? 'auto' : 'none',
                                    }}
                                >
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
                                        style={{
                                            padding: '0.4rem 0.8rem',
                                            borderRadius: '20px',
                                            border: '1px solid var(--border-color)',
                                            background:
                                                loopLimit === 0 ? 'var(--accent-color)' : 'none',
                                            color: loopLimit === 0 ? 'white' : 'var(--text-color)',
                                            fontSize: '0.8rem',
                                            cursor: 'pointer',
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
                                        style={{
                                            padding: '0.4rem 0.8rem',
                                            borderRadius: '20px',
                                            border: '1px solid var(--border-color)',
                                            background:
                                                loopLimit > 0 ? 'var(--accent-color)' : 'none',
                                            color: loopLimit > 0 ? 'white' : 'var(--text-color)',
                                            fontSize: '0.8rem',
                                            cursor: 'pointer',
                                        }}
                                    >
                                        Loops
                                    </button>
                                </div>

                                <div
                                    id="sessionTimerDurationContainer"
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        opacity: songMode ? '1' : '0.4',
                                        pointerEvents: songMode ? 'auto' : 'none',
                                        transition: 'all 0.2s ease',
                                    }}
                                >
                                    <div
                                        id="sessionTimerStepper"
                                        class="stepper-control"
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            background: 'var(--input-bg)',
                                            border: '1px solid var(--border-color)',
                                            borderRadius: '8px',
                                            overflow: 'hidden',
                                        }}
                                    >
                                        <button
                                            id="sessionTimerDec"
                                            class="stepper-btn"
                                            style="padding: 0.5rem 0.75rem; background: transparent; border: none; color: var(--text-color); cursor: pointer; font-weight: bold; font-size: 1.1rem;"
                                            aria-label="Decrease song duration"
                                            onClick={() => {
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
                                        >
                                            -
                                        </button>
                                        <input
                                            id="sessionTimerInput"
                                            type="number"
                                            value={loopLimit > 0 ? loopLimit : sessionTimer}
                                            readonly
                                            style="width: 40px; text-align: center; background: transparent; border: none; font-weight: bold; color: var(--text-color); -moz-appearance: textfield; padding: 0;"
                                        />
                                        <button
                                            id="sessionTimerInc"
                                            class="stepper-btn"
                                            style="padding: 0.5rem 0.75rem; background: transparent; border: none; color: var(--text-color); cursor: pointer; font-weight: bold; font-size: 1.1rem;"
                                            aria-label="Increase song duration"
                                            onClick={() => {
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
                                        >
                                            +
                                        </button>
                                    </div>
                                    <span style="font-size: 0.85rem; color: var(--text-secondary); font-weight: 500;">
                                        {loopLimit > 0 ? 'Choruses' : 'Minutes'}
                                    </span>
                                </div>

                                {loopLimit > 0 && (
                                    <div style="font-size: 0.75rem; color: var(--accent-color); font-weight: 500; text-align: right; margin-top: -0.5rem;">
                                        {(() => {
                                            const { arranger, playback } = getState();
                                            const totalSteps = arranger.totalSteps * loopLimit;
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
                            <p
                                class="performance-ending-footer"
                                style="margin-top: 0.75rem; font-size: 0.75rem; color: var(--text-muted); line-height: 1.4;"
                            >
                                The band will evolve the energy naturally and perform a resolution
                                at the end of the final loop once the limit is reached.
                            </p>
                        </div>
                    </div>

                    {/* Library & Presets Section */}
                    <div class="settings-section">
                        <h3>Library & Presets</h3>
                        <div style="margin-bottom: 0;">
                            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                <input
                                    type="checkbox"
                                    id="applyPresetSettingsCheck"
                                    checked={useEnsembleState(
                                        (s) => s.playback.applyPresetSettings,
                                    )}
                                    onChange={(e) => {
                                        dispatch(
                                            ACTIONS.SET_PRESET_SETTINGS_MODE,
                                            e.target.checked,
                                        );
                                        saveCurrentState();
                                    }}
                                />
                                <span>Auto-Apply Preset Settings</span>
                            </label>
                            <p style="font-size: 0.8rem; color: #64748b; margin-top: 0.2rem; margin-left: 1.8rem;">
                                Automatically update BPM and Style when loading a library preset.
                            </p>
                        </div>
                    </div>

                    {/* External Section (MIDI) */}
                    <div class="settings-section">
                        <h3>External (MIDI Output)</h3>
                        <div style="margin-bottom: 1rem;">
                            <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                <input
                                    id="midiEnableCheck"
                                    type="checkbox"
                                    checked={midiEnabled}
                                    onChange={handleMidiEnable}
                                />
                                <span>Enable Web MIDI Output</span>
                            </label>
                            <p style="font-size: 0.8rem; color: #64748b; margin-top: 0.2rem; margin-left: 1.8rem;">
                                Route notes to your DAW or external hardware.
                            </p>
                        </div>

                        <div
                            id="midiControls"
                            style={{
                                opacity: midiEnabled ? '1' : '0.5',
                                pointerEvents: midiEnabled ? 'auto' : 'none',
                                transition: 'opacity 0.2s',
                            }}
                        >
                            <div style="margin-bottom: 1.5rem;">
                                <label style="display: flex; align-items: center; gap: 0.5rem; cursor: pointer;">
                                    <input
                                        id="midiMuteLocalCheck"
                                        type="checkbox"
                                        checked={midiMuteLocal}
                                        onChange={(e) => {
                                            dispatch(ACTIONS.SET_MIDI_CONFIG, {
                                                muteLocal: e.target.checked,
                                            });
                                            restoreGains();
                                            saveCurrentState();
                                        }}
                                    />
                                    <span>Mute Browser Audio</span>
                                </label>
                            </div>

                            <div style="margin-bottom: 1.5rem;">
                                <label style="display: block; margin-bottom: 0.5rem; font-size: 0.85rem; color: #94a3b8;">
                                    Output Port
                                </label>
                                <select
                                    id="midiOutputSelect"
                                    value={midiSelectedOutputId || ''}
                                    onChange={(e) => {
                                        dispatch(ACTIONS.SET_MIDI_CONFIG, {
                                            selectedOutputId: e.target.value,
                                        });
                                        saveCurrentState();
                                    }}
                                    style="width: 100%;"
                                >
                                    {midiOutputs && midiOutputs.length > 0 ? (
                                        midiOutputs.map((out) => (
                                            <option value={out.id}>{out.name}</option>
                                        ))
                                    ) : (
                                        <option value="">No outputs found</option>
                                    )}
                                </select>
                            </div>

                            <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
                                {['Chords', 'Bass', 'Soloist', 'Harmony', 'Drums'].map((ch) => (
                                    <div class="midi-ch-group" key={ch}>
                                        <label style="display: block; margin-bottom: 0.3rem; font-size: 0.75rem; color: #64748b;">
                                            {ch}
                                        </label>
                                        <div style="display: flex; gap: 0.25rem;">
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
                                                style="width: 50%;"
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
                                                style="width: 50%;"
                                                title="Octave Offset"
                                                aria-label={`${ch} MIDI Octave Offset`}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div style="margin-bottom: 1rem;">
                                <label style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.85rem; color: #94a3b8;">
                                    <span>Latency Offset</span>
                                    <span id="midiLatencyValue" style="color: var(--accent-color);">
                                        {midiLatency}ms
                                    </span>
                                </label>
                                <input
                                    id="midiLatencySlider"
                                    type="range"
                                    min="-100"
                                    max="100"
                                    step="1"
                                    value={midiLatency}
                                    onInput={(e) => {
                                        dispatch(ACTIONS.SET_MIDI_CONFIG, {
                                            latency: parseInt(e.target.value, 10),
                                        });
                                        saveCurrentState();
                                    }}
                                    style="width: 100%;"
                                    aria-label="MIDI Latency Offset"
                                    aria-valuetext={`${midiLatency} ms`}
                                />
                            </div>

                            <div style="margin-bottom: 0;">
                                <label style="display: flex; justify-content: space-between; margin-bottom: 0.5rem; font-size: 0.85rem; color: #94a3b8;">
                                    <span>Velocity Sensitivity</span>
                                    <span
                                        id="midiVelocityValue"
                                        style="color: var(--accent-color);"
                                    >
                                        {parseFloat(midiVelocity).toFixed(1)}
                                    </span>
                                </label>
                                <input
                                    id="midiVelocitySlider"
                                    type="range"
                                    min="0.5"
                                    max="2.0"
                                    step="0.1"
                                    value={midiVelocity}
                                    onInput={(e) => {
                                        dispatch(ACTIONS.SET_MIDI_CONFIG, {
                                            velocitySensitivity: parseFloat(e.target.value),
                                        });
                                        saveCurrentState();
                                    }}
                                    style="width: 100%;"
                                    aria-label="MIDI Velocity Sensitivity"
                                    aria-valuetext={`${parseFloat(midiVelocity).toFixed(1)}x`}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Actions Section */}
                    <div class="settings-section" style="border-bottom: none; padding-bottom: 0;">
                        <h3>System Actions</h3>
                        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem;">
                            <button
                                id="settingsExportMidiBtn"
                                class="secondary-btn"
                                style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.8rem 0.5rem;"
                                onClick={openExportModal}
                            >
                                <span>🎹</span> Export MIDI
                            </button>
                            <button
                                id="installAppBtn"
                                class="secondary-btn"
                                style="display: none; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.8rem 0.5rem;"
                                onClick={handleInstall}
                            >
                                <span>📲</span> Install App
                            </button>
                            <button
                                id="resetSettingsBtn"
                                class="secondary-btn"
                                style="color: var(--error-color); background: rgba(239, 68, 68, 0.1); border-color: rgba(239, 68, 68, 0.2); padding: 0.8rem 0.5rem;"
                                onClick={handleReset}
                            >
                                <span>🗑️</span> Reset All
                            </button>
                            <button
                                id="refreshAppBtn"
                                class="secondary-btn"
                                style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; padding: 0.8rem 0.5rem;"
                                onClick={() => window.location.reload()}
                            >
                                <span>🔄</span> Force Refresh
                            </button>
                        </div>
                    </div>

                    <div
                        class="settings-help"
                        style="margin-top: 1rem; border-top: 1px solid #334155; padding-top: 1rem; border-top: none;"
                    >
                        <details open>
                            <summary style="cursor: pointer; font-weight: bold; color: var(--text-primary); list-style: none; display: flex; align-items: center; justify-content: space-between;">
                                <span>Help & Instructions</span>
                                <span style="font-size: 0.8em;">▼</span>
                            </summary>
                            <div style="margin-top: 1rem; font-size: 0.9rem; color: var(--text-secondary); line-height: 1.6;">
                                <div style="margin-bottom: 1.5rem; background: rgba(59, 130, 246, 0.1); padding: 1rem; border-radius: 8px; border: 1px solid rgba(59, 130, 246, 0.2);">
                                    <h4 style="color: var(--accent-color); margin-top: 0; margin-bottom: 0.5rem;">
                                        Need more help?
                                    </h4>
                                    <p style="margin-bottom: 0.8rem;">
                                        For a deep dive into notation, soloing styles, and MIDI
                                        export, check out the full manual.
                                    </p>
                                    <a
                                        href="manual.html"
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        style="color: white; background: var(--accent-color); padding: 0.5rem 1rem; border-radius: 6px; text-decoration: none; font-weight: bold; display: inline-block;"
                                    >
                                        Open User Manual
                                    </a>
                                </div>
                            </div>
                        </details>
                        <div
                            id="appVersion"
                            style="text-align: center; margin-top: 1.5rem; color: var(--text-muted); font-size: 0.8rem; opacity: 0.7;"
                        >
                            Ensemble v{APP_VERSION}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
