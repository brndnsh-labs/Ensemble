import { useEffect, useState } from 'preact/hooks';
import { handleTap } from '../controllers/instrument-controller.js';
import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';

export function Transport() {
    const { isPlaying, bpm, sessionTimer, sessionStartTime, songMode, isRamping } =
        useEnsembleState((state) => ({
            isPlaying: state.playback.isPlaying,
            bpm: state.playback.bpm,
            sessionTimer: state.playback.sessionTimer,
            sessionStartTime: state.playback.sessionStartTime,
            songMode: state.playback.songMode,
            // #1021 — a practice tempo ramp is live: the BPM readout is climbing
            // toward the cap each loop. Armed only while a practice loop is active.
            isRamping:
                !!state.playback.rampBpm &&
                state.playback.loopEndStep > state.playback.loopStartStep,
        }));

    const [tapActive, setTapActive] = useState(false);
    const [timeLeft, setTimeLeft] = useState<string | null>(null);

    useEffect(() => {
        let interval: ReturnType<typeof setInterval> | undefined;
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

    const onBpmInput = (e: Event) => {
        dispatch(ACTIONS.SET_BPM, (e.target as HTMLInputElement).value);
    };

    const onTap = () => {
        handleTap((val: any) => dispatch(ACTIONS.SET_BPM, val));
        setTapActive(true);
        setTimeout(() => setTapActive(false), 100);
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
                <span class="control-label" id="bpmLabel">
                    BPM
                    {isRamping && (
                        // Purely a visual cue. It lives inside #bpmLabel (the BPM
                        // input's aria-labelledby target), so it must be hidden from
                        // the accessibility tree or it pollutes the input's name to
                        // "BPM tempo ramping up" on every focus. The title carries
                        // the explanation for sighted hover.
                        <span
                            class="bpm-ramp-indicator"
                            title="Practice tempo ramp active — climbing each loop"
                            aria-hidden="true"
                        >
                            {' '}
                            ↑
                        </span>
                    )}
                </span>
                <input
                    type="number"
                    id="bpmInput"
                    value={bpm}
                    min="40"
                    max="240"
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
        </div>
    );
}
