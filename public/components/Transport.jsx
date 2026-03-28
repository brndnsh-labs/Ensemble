import React from 'preact/compat';
import { useEffect, useState } from 'preact/hooks';
import { handleTap } from '../instrument-controller.js';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';

export function Transport() {
    const { isPlaying, bpm, sessionTimer, sessionStartTime, songMode, larsMode, larsBpmOffset } =
        useEnsembleState((/** @type {import('../types.js').EnsembleState} */ state) => ({
            isPlaying: state.playback.isPlaying,
            bpm: state.playback.bpm,
            sessionTimer: state.playback.sessionTimer,
            sessionStartTime: state.playback.sessionStartTime,
            songMode: state.playback.songMode,
            larsMode: state.groove.larsMode,
            larsBpmOffset: state.conductor.larsBpmOffset,
        }));

    const [tapActive, setTapActive] = useState(false);
    /** @type {import('preact/hooks').StateUpdater<string|null>|any} */
    const [timeLeft, setTimeLeft] = useState(null);

    // Calculate effective BPM and visual style for Lars Mode
    const effectiveBpm = Math.round(bpm + (larsBpmOffset || 0));
    const isLarsActive = larsMode && isPlaying;
    let bpmStyle = '';
    let bpmLabelText = 'BPM';

    if (isLarsActive && Math.abs(larsBpmOffset) > 0.1) {
        const intensity = Math.min(1, Math.abs(larsBpmOffset) / 6);
        const isPushing = larsBpmOffset > 0;
        const targetColor = isPushing ? 'var(--blue)' : 'var(--red)';
        const mixPercent = 20 + Math.round(intensity * 80);
        bpmStyle = `color: color-mix(in srgb, var(--text-color), ${targetColor} ${mixPercent}%)`;

        const direction = isPushing ? '↗' : '↘';
        bpmLabelText = `${effectiveBpm} ${direction}`;
    }

    useEffect(() => {
        /** @type {ReturnType<typeof setInterval> | undefined} */
        let interval;
        if (isPlaying && songMode && sessionTimer > 0 && sessionStartTime) {
            const updateTimer = () => {
                const elapsedMs = performance.now() - sessionStartTime;
                const totalMs = sessionTimer * 60 * 1000;
                const remainingMs = Math.max(0, totalMs - elapsedMs);

                const mins = Math.floor(remainingMs / 60000);
                const secs = Math.floor((remainingMs % 60000) / 1000);
                setTimeLeft(`${mins}:${secs.toString().padStart(2, '0')}`);
            };

            updateTimer();
            interval = setInterval(updateTimer, 1000);
        } else {
            setTimeLeft(null);
        }
        return () => clearInterval(interval);
    }, [isPlaying, sessionTimer, sessionStartTime, songMode]);

    const onTogglePlay = () => {
        dispatch(ACTIONS.TOGGLE_PLAY);
    };

    const onBpmInput = (/** @type {any} */ e) => {
        dispatch(ACTIONS.SET_BPM, e.target.value);
    };

    const onTap = (/** @type {any} */ _e) => {
        handleTap((/** @type {any} */ val) => dispatch(ACTIONS.SET_BPM, val));

        setTapActive(true);
        setTimeout(() => setTapActive(false), 100);
    };

    const openSettings = () => {
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'settings', open: true });
    };

    return (
        <div class="main-controls">
            <button
                id="playBtn"
                class={`primary-btn ${isPlaying ? 'playing' : ''}`}
                onClick={onTogglePlay}
            >
                <span id="playBtnText">
                    {isPlaying ? (timeLeft && songMode ? `STOP (${timeLeft})` : 'STOP') : 'START'}
                </span>
            </button>

            <div class={`control-group ${isLarsActive ? 'lars-active' : ''}`} id="bpmControlGroup">
                <span class="control-label" id="bpmLabel" style={bpmStyle}>
                    {bpmLabelText}
                </span>
                <input
                    type="number"
                    id="bpmInput"
                    value={bpm}
                    min="40"
                    max="240"
                    style={bpmStyle}
                    aria-labelledby="bpmLabel"
                    aria-label="Tempo in BPM"
                    onInput={onBpmInput}
                />
                <button
                    id="tapBtn"
                    class={`tap-btn ${tapActive ? 'handle-tap' : ''}`}
                    aria-label="Tap Tempo"
                    onClick={onTap}
                >
                    TAP
                </button>
            </div>

            <button id="settingsBtn" aria-label="Settings" onClick={openSettings}>
                ⚙️
            </button>
        </div>
    );
}
