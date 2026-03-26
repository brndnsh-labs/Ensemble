import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { stopDrums, triggerDrumSound } from '../performance-controller.js';
import { dispatch, getState } from '../state.js';
import { ACTIONS } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';
import { Slider } from './UIControls.jsx';

function useMobile() {
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 900);
    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 900);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);
    return isMobile;
}

export function DrumPadModal() {
    /** @type {import('preact/hooks').MutableRef<HTMLDivElement|null>} */
    const modalRef = useRef(null);
    const isMobile = useMobile();
    const [velocity, setVelocity] = useState(1.0);
    const [autoVelocity, setAutoVelocity] = useState(true);
    const [activePads, setActivePads] = useState(new Set());
    /** @type {import('preact/hooks').MutableRef<Record<string, number>>} */
    const timeoutsRef = useRef({});

    useLayoutEffect(() => {
        dispatch(ACTIONS.INIT_AUDIO);
        dispatch(ACTIONS.RESTORE_GAINS);
        stopDrums(); // Silence automatic drums immediately

        if (modalRef.current) {
            /** @type {any} */ (modalRef.current).focus();
        }

        return () => {
            // Cleanup timeouts on unmount
            Object.values(timeoutsRef.current).forEach(clearTimeout);
        };
    }, []);

    const { swing, bpm, lastSmartGenre } = useEnsembleState(
        (/** @type {import('../types.js').EnsembleState} */ s) => ({
            swing: s.groove.swing,
            bpm: s.playback.bpm,
            lastSmartGenre: s.groove.lastSmartGenre,
        }),
    );

    const close = () => {
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'drumPad', open: false });
    };

    const triggerDrum = (/** @type {string} */ name) => {
        dispatch(ACTIONS.INIT_AUDIO);
        dispatch(ACTIONS.RESTORE_GAINS);
        const { playback } = getState();
        const time = playback.audio?.currentTime || 0;

        let finalVelocity = velocity;
        if (autoVelocity) {
            // Scale velocity by band intensity, ensuring it stays musical (0.5 to 1.5 multiplier range)
            const intensityMultiplier = 0.5 + playback.bandIntensity;
            finalVelocity = velocity * intensityMultiplier;
        }

        triggerDrumSound(name, time, finalVelocity);

        setActivePads((prev) => {
            const next = new Set(prev);
            next.add(name);
            return next;
        });

        if (timeoutsRef.current[name]) {
            clearTimeout(timeoutsRef.current[name]);
        }

        timeoutsRef.current[name] = /** @type {any} */ (
            setTimeout(() => {
                setActivePads((prev) => {
                    const next = new Set(prev);
                    next.delete(name);
                    return next;
                });
                delete timeoutsRef.current[name];
            }, 120)
        );
    };

    const PAD_GROUPS = {
        upper: [
            {
                name: 'TomHigh',
                label: 'High Tom',
                key: 'r',
                keyHint: 'R',
                color: 'var(--soloist-color)',
            },
            {
                name: 'TomMid',
                label: 'Mid Tom',
                key: 't',
                keyHint: 'T',
                color: 'var(--soloist-color)',
            },
            {
                name: 'TomLow',
                label: 'Floor Tom',
                key: 'y',
                keyHint: 'Y',
                color: 'var(--soloist-color)',
            },
            { name: 'Crash', label: 'Crash', key: 'u', keyHint: 'U', color: 'var(--chords-color)' },
        ],
        left: [
            {
                name: 'Sidestick',
                label: 'Rim',
                key: 'd',
                keyHint: 'D',
                color: 'var(--soloist-color)',
            },
            {
                name: 'Snare',
                label: 'Snare',
                key: 'f',
                keyHint: 'F',
                color: 'var(--soloist-color)',
            },
        ],
        right: [
            {
                name: 'HiHat',
                label: 'Hi-Hat',
                key: 'j',
                keyHint: 'J',
                color: 'var(--chords-color)',
            },
            { name: 'Ride', label: 'Ride', key: 'k', keyHint: 'K', color: 'var(--chords-color)' },
            {
                name: 'Open',
                label: 'Open Hat',
                key: 'l',
                keyHint: 'L',
                color: 'var(--chords-color)',
            },
        ],
        kick: [
            {
                name: 'Kick',
                label: 'Kick',
                key: ' ',
                keyHint: 'SPACE',
                color: 'var(--soloist-color)',
            },
        ],
    };

    const ALL_PADS = Object.values(PAD_GROUPS).flat();

    useEffect(() => {
        const handleKeyDown = (/** @type {any} */ e) => {
            if (/** @type {any} */ (modalRef.current)?.closest('.closing')) {
                return;
            }
            if (e.repeat) {
                return;
            }

            const key = e.key.toLowerCase();
            const pad = ALL_PADS.find((p) => p.key === key);

            if (pad) {
                e.preventDefault();
                triggerDrum(pad.name);
            } else if (key === 'escape') {
                close();
            }
        };

        window.addEventListener('keydown', handleKeyDown, { passive: false });
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [velocity, autoVelocity]); // Re-bind if velocity or mode changes

    const renderPad = (/** @type {any} */ pad) => {
        const isActive = activePads.has(pad.name);
        return (
            <button
                key={pad.name}
                class={`drum-pad ${isActive ? 'active' : ''}`}
                onPointerDown={(/** @type {any} */ e) => {
                    e.preventDefault();
                    triggerDrum(pad.name);
                }}
                onMouseEnter={(/** @type {any} */ e) => {
                    if (!isActive) {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)';
                    }
                }}
                onMouseLeave={(/** @type {any} */ e) => {
                    if (!isActive) {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
                    }
                }}
                style={`
                    background: ${isActive ? pad.color : 'rgba(255,255,255,0.05)'};
                    color: ${isActive ? '#fff' : '#94a3b8'};
                    border: 1.5px solid ${isActive ? '#fff' : 'rgba(255,255,255,0.1)'};
                    border-top: 4px solid ${pad.color};
                    border-radius: 12px;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    justify-content: center;
                    font-weight: bold;
                    font-size: 0.9rem;
                    cursor: pointer;
                    transition: all 0.1s;
                    aspect-ratio: 1/1;
                    touch-action: none;
                    box-shadow: ${isActive ? `0 0 20px ${pad.color}` : '0 4px 6px rgba(0,0,0,0.2)'};
                    transform: ${isActive ? 'scale(0.95) translateY(2px)' : 'none'};
                    position: relative;
                    width: 100%;
                `}
            >
                {pad.label}
                {!isMobile && <span class="drum-pad-key-hint">{pad.keyHint}</span>}
            </button>
        );
    };

    return (
        <div ref={modalRef} tabIndex={0} class="modal-overlay active" onClick={close}>
            <div
                class={`modal PerformanceSurfaceModal drum-pad-modal ${
                    isMobile ? 'drum-pad-modal--mobile' : 'drum-pad-modal--desktop'
                }`}
                onClick={(/** @type {any} */ e) => e.stopPropagation()}
            >
                {!isMobile && (
                    <div class="modal-header">
                        <h2>Drum Performance Mode</h2>
                        <button class="icon-btn close-btn" onClick={close} aria-label="Close">
                            ✖
                        </button>
                    </div>
                )}

                <div
                    class={`drum-pad-modal-body ${
                        isMobile ? 'drum-pad-modal-body--mobile' : 'drum-pad-modal-body--desktop'
                    }`}
                >
                    <div class="drum-pad-stack">
                        {/* Upper Deck */}
                        <div class="drum-pad-upper-row">
                            {PAD_GROUPS.upper.map((/** @type {any} */ pad) => (
                                <div key={pad.name} class="drum-pad-pad-slot">
                                    {renderPad(pad)}
                                </div>
                            ))}
                        </div>

                        {/* Home Row: Left & Right */}
                        <div class="drum-pad-home-row">
                            <div class="drum-pad-home-side drum-pad-home-side--left">
                                {PAD_GROUPS.left.map((/** @type {any} */ pad) => (
                                    <div key={pad.name} class="drum-pad-pad-slot">
                                        {renderPad(pad)}
                                    </div>
                                ))}
                            </div>
                            <div class="drum-pad-home-side drum-pad-home-side--right">
                                {PAD_GROUPS.right.map((/** @type {any} */ pad) => (
                                    <div key={pad.name} class="drum-pad-pad-slot">
                                        {renderPad(pad)}
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Kick */}
                        <div class="drum-pad-kick-row">
                            <div class="drum-pad-kick-slot">
                                <button
                                    class={`drum-pad ${activePads.has('Kick') ? 'active' : ''}`}
                                    onPointerDown={(/** @type {any} */ e) => {
                                        e.preventDefault();
                                        triggerDrum('Kick');
                                    }}
                                    onMouseEnter={(/** @type {any} */ e) => {
                                        if (!activePads.has('Kick')) {
                                            e.currentTarget.style.background =
                                                'rgba(255,255,255,0.1)';
                                            e.currentTarget.style.borderColor =
                                                'rgba(255,255,255,0.3)';
                                        }
                                    }}
                                    onMouseLeave={(/** @type {any} */ e) => {
                                        if (!activePads.has('Kick')) {
                                            e.currentTarget.style.background =
                                                'rgba(255,255,255,0.05)';
                                            e.currentTarget.style.borderColor =
                                                'rgba(255,255,255,0.1)';
                                        }
                                    }}
                                    style={`
                                        background: ${activePads.has('Kick') ? PAD_GROUPS.kick[0].color : 'rgba(255,255,255,0.05)'};
                                        color: ${activePads.has('Kick') ? '#fff' : '#94a3b8'};
                                        border: 1.5px solid ${activePads.has('Kick') ? '#fff' : 'rgba(255,255,255,0.1)'};
                                        border-top: 4px solid ${PAD_GROUPS.kick[0].color};
                                        border-radius: 12px;
                                        display: flex;
                                        flex-direction: column;
                                        align-items: center;
                                        justify-content: center;
                                        font-weight: bold;
                                        font-size: 1.1rem;
                                        cursor: pointer;
                                        transition: all 0.1s;
                                        width: 100%;
                                        height: 100%;
                                        touch-action: none;
                                        box-shadow: ${activePads.has('Kick') ? `0 0 20px ${PAD_GROUPS.kick[0].color}` : '0 4px 6px rgba(0,0,0,0.2)'};
                                        transform: ${activePads.has('Kick') ? 'scale(0.98) translateY(2px)' : 'none'};
                                        position: relative;
                                    `}
                                >
                                    {PAD_GROUPS.kick[0].label}
                                    {!isMobile && (
                                        <span class="drum-pad-key-hint drum-pad-key-hint--kick">
                                            {PAD_GROUPS.kick[0].keyHint}
                                        </span>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>

                    <div class="drum-pad-controls-panel">
                        <div class="drum-pad-controls-stack">
                            <div class="drum-pad-controls-row">
                                <div class="drum-pad-velocity-column">
                                    <div class="drum-pad-velocity-header">
                                        <label
                                            class="drum-pad-velocity-label"
                                            style={`opacity: ${autoVelocity ? 0.4 : 1};`}
                                        >
                                            {autoVelocity
                                                ? 'Auto Intensity Scaling'
                                                : 'Test Velocity'}{' '}
                                            {!autoVelocity &&
                                                `(Timbre Shift: ${Math.round(velocity * 100)}%)`}
                                        </label>
                                        <button
                                            onClick={() => setAutoVelocity(!autoVelocity)}
                                            class="drum-pad-auto-velocity-btn"
                                            style={`
                                                background: ${autoVelocity ? 'var(--soloist-color)' : 'rgba(255,255,255,0.1)'};
                                                color: ${autoVelocity ? '#fff' : '#94a3b8'};
                                            `}
                                        >
                                            {autoVelocity ? '✓ Auto Velocity' : 'Auto Velocity'}
                                        </button>
                                    </div>
                                    <div
                                        class="drum-pad-slider-shell"
                                        style={`opacity: ${autoVelocity ? 0.3 : 1}; pointer-events: ${autoVelocity ? 'none' : 'auto'};`}
                                    >
                                        <Slider
                                            min="10"
                                            max="150"
                                            value={Math.round(velocity * 100)}
                                            onInput={(/** @type {any} */ val) =>
                                                setVelocity(parseInt(val, 10) / 100)
                                            }
                                            disabled={autoVelocity}
                                        />
                                    </div>{' '}
                                </div>
                                <div class="drum-pad-stats-group">
                                    <div class="drum-pad-stat">
                                        <div class="drum-pad-stat-label">Swing</div>
                                        <div class="drum-pad-stat-value">{swing}%</div>
                                    </div>
                                    <div class="drum-pad-stat">
                                        <div class="drum-pad-stat-label">BPM</div>
                                        <div class="drum-pad-stat-value">{bpm}</div>
                                    </div>
                                    <div class="drum-pad-stat">
                                        <div class="drum-pad-stat-label">Genre</div>
                                        <div class="drum-pad-stat-value">
                                            {lastSmartGenre || 'Standard'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
