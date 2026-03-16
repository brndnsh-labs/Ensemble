import { h } from 'preact';
import React from 'preact/compat';
import { useEffect, useState } from 'preact/hooks';
import { handleTap } from '../instrument-controller.js';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';

export function Transport() {
    const { isPlaying, bpm, sessionTimer, sessionStartTime, songMode } = useEnsembleState(
        (state) => ({
            isPlaying: state.playback.isPlaying,
            bpm: state.playback.bpm,
            sessionTimer: state.playback.sessionTimer,
            sessionStartTime: state.playback.sessionStartTime,
            songMode: state.playback.songMode,
        }),
    );

    const [tapActive, setTapActive] = useState(false);
    const [timeLeft, setTimeLeft] = useState(null);

    useEffect(() => {
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

    const onBpmInput = (e) => {
        dispatch(ACTIONS.SET_BPM, e.target.value);
    };

    const onTap = (_e) => {
        handleTap((val) => dispatch(ACTIONS.SET_BPM, val));

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

            <div class="control-group" id="bpmControlGroup">
                <span class="control-label" id="bpm-label">
                    BPM
                </span>
                <input
                    type="number"
                    id="bpmInput"
                    value={bpm}
                    min="40"
                    max="240"
                    aria-labelledby="bpm-label"
                    aria-label="Tempo in BPM"
                    onInput={onBpmInput}
                />
                <button
                    id="tapBtn"
                    class={tapActive ? 'handle-tap' : ''}
                    style="padding: 0.2rem 0.5rem; font-size: 0.8rem; height: auto;"
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
