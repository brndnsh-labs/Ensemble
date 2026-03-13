import { h } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { initAudio, killDrumNote, playDrumSound, restoreGains } from '../engine/engine.js';
import { dispatch } from '../state.js';
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
    const modalRef = useRef(null);
    const isMobile = useMobile();
    const [velocity, setVelocity] = useState(1.0);
    const [autoVelocity, setAutoVelocity] = useState(true);
    const [activePads, setActivePads] = useState(new Set());
    const timeoutsRef = useRef({});

    useLayoutEffect(() => {
        initAudio();
        restoreGains();
        killDrumNote(); // Silence automatic drums immediately

        if (modalRef.current) {
            modalRef.current.focus({ preventScroll: true });
        }

        return () => {
            // Cleanup timeouts on unmount
            Object.values(timeoutsRef.current).forEach(clearTimeout);
        };
    }, []);

    const { swing, bpm, lastSmartGenre } = useEnsembleState((s) => ({
        swing: s.groove.swing,
        bpm: s.playback.bpm,
        lastSmartGenre: s.groove.lastSmartGenre,
    }));

    const close = () => {
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'drumPad', open: false });
    };

    const triggerDrum = (name) => {
        initAudio();
        restoreGains();
        const { playback } = useEnsembleState.getState();
        const time = playback.audio?.currentTime || 0;

        let finalVelocity = velocity;
        if (autoVelocity) {
            // Scale velocity by band intensity, ensuring it stays musical (0.5 to 1.5 multiplier range)
            const intensityMultiplier = 0.5 + playback.bandIntensity;
            finalVelocity = velocity * intensityMultiplier;
        }

        playDrumSound(name, time, finalVelocity);

        setActivePads((prev) => {
            const next = new Set(prev);
            next.add(name);
            return next;
        });

        if (timeoutsRef.current[name]) {
            clearTimeout(timeoutsRef.current[name]);
        }

        timeoutsRef.current[name] = setTimeout(() => {
            setActivePads((prev) => {
                const next = new Set(prev);
                next.delete(name);
                return next;
            });
            delete timeoutsRef.current[name];
        }, 120);
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
        const handleKeyDown = (e) => {
            if (modalRef.current?.closest('.closing')) {
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
    }, [velocity]); // Re-bind if velocity changes to ensure triggerDrum has latest state

    const renderPad = (pad) => {
        const isActive = activePads.has(pad.name);
        return (
            <button
                key={pad.name}
                class={`drum-pad ${isActive ? 'active' : ''}`}
                onPointerDown={(e) => {
                    e.preventDefault();
                    triggerDrum(pad.name);
                }}
                onMouseEnter={(e) => {
                    if (!isActive) {
                        e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)';
                    }
                }}
                onMouseLeave={(e) => {
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
                `}
            >
                {pad.label}
                {!isMobile && (
                    <span style="position: absolute; bottom: 6px; right: 8px; font-size: 0.6rem; opacity: 0.5; font-family: var(--font-mono);">
                        {pad.keyHint}
                    </span>
                )}
            </button>
        );
    };

    return (
        <div ref={modalRef} tabIndex={0} class="modal-overlay active" onClick={close}>
            <div
                class="modal PerformanceSurfaceModal"
                onClick={(e) => e.stopPropagation()}
                style={
                    isMobile
                        ? 'width: 100vw; height: 100vh; max-width: 100vw; max-height: 100vh; border-radius: 0; border: none; padding: 1rem;'
                        : 'max-width: 800px; height: auto; max-height: 90vh; overflow-y: auto; padding: 2rem;'
                }
            >
                <div
                    class="modal-header-shared"
                    style="margin-bottom: 2rem; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 1rem;"
                >
                    <div style="display: flex; align-items: center; gap: 1rem;">
                        <span style="font-size: 1.5rem;">🥁</span>
                        <h2 style="margin: 0; color: #fff; text-transform: none; letter-spacing: normal; font-size: 1.2rem;">
                            Drum Pad & Diagnostic Lab
                        </h2>
                    </div>
                    <button class="icon-btn close-btn" onClick={close} aria-label="Close">
                        ✖
                    </button>
                </div>

                <div style="display: flex; flex-direction: column; gap: 1.5rem; margin-bottom: 2.5rem; align-items: center; width: 100%;">
                    {/* Upper Deck */}
                    <div style="display: flex; gap: 1rem; justify-content: center; width: 100%; max-width: 500px;">
                        {PAD_GROUPS.upper.map((pad) => (
                            <div key={pad.name} style="flex: 1; min-width: 80px; max-width: 120px;">
                                {renderPad(pad)}
                            </div>
                        ))}
                    </div>

                    {/* Home Row: Left & Right */}
                    <div style="display: flex; gap: 2rem; justify-content: center; width: 100%; max-width: 600px;">
                        <div style="display: flex; gap: 1rem; flex: 1; justify-content: flex-end;">
                            {PAD_GROUPS.left.map((pad) => (
                                <div key={pad.name} style="width: 100%; max-width: 120px;">
                                    {renderPad(pad)}
                                </div>
                            ))}
                        </div>
                        <div style="display: flex; gap: 1rem; flex: 1.5; justify-content: flex-start;">
                            {PAD_GROUPS.right.map((pad) => (
                                <div key={pad.name} style="width: 100%; max-width: 120px;">
                                    {renderPad(pad)}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Kick */}
                    <div style="display: flex; justify-content: center; width: 100%;">
                        <div style="width: 100%; max-width: 400px; height: 80px;">
                            <button
                                class={`drum-pad ${activePads.has('Kick') ? 'active' : ''}`}
                                onPointerDown={(e) => {
                                    e.preventDefault();
                                    triggerDrum('Kick');
                                }}
                                onMouseEnter={(e) => {
                                    if (!activePads.has('Kick')) {
                                        e.currentTarget.style.background = 'rgba(255,255,255,0.1)';
                                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.3)';
                                    }
                                }}
                                onMouseLeave={(e) => {
                                    if (!activePads.has('Kick')) {
                                        e.currentTarget.style.background = 'rgba(255,255,255,0.05)';
                                        e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)';
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
                                    <span style="position: absolute; bottom: 6px; right: 12px; font-size: 0.6rem; opacity: 0.5; font-family: var(--font-mono);">
                                        {PAD_GROUPS.kick[0].keyHint}
                                    </span>
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                <div style="background: rgba(15, 23, 42, 0.4); padding: 1.5rem; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
                    <div style="display: flex; flex-direction: column; gap: 1.5rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
                            <div style="flex: 1; min-width: 250px;">
                                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem;">
                                    <label style="font-size: 0.8rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">
                                        {autoVelocity ? 'Max Velocity Ceiling' : 'Test Velocity'}{' '}
                                        (Timbre Shift: {Math.round(velocity * 100)}%)
                                    </label>
                                    <button
                                        onClick={() => setAutoVelocity(!autoVelocity)}
                                        style={`
                                            background: ${autoVelocity ? 'var(--soloist-color)' : 'rgba(255,255,255,0.1)'};
                                            color: ${autoVelocity ? '#fff' : '#94a3b8'};
                                            border: none;
                                            padding: 0.2rem 0.6rem;
                                            border-radius: 4px;
                                            font-size: 0.7rem;
                                            font-weight: bold;
                                            cursor: pointer;
                                            text-transform: uppercase;
                                            letter-spacing: 0.05em;
                                        `}
                                    >
                                        {autoVelocity ? '✓ Auto Velocity' : 'Auto Velocity'}
                                    </button>
                                </div>
                                <Slider
                                    min="10"
                                    max="150"
                                    value={Math.round(velocity * 100)}
                                    onInput={(val) => setVelocity(parseInt(val, 10) / 100)}
                                />
                            </div>
                            <div style="display: flex; gap: 2rem; border-left: 1px solid rgba(255,255,255,0.1); padding-left: 2rem;">
                                <div>
                                    <div style="font-size: 0.7rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">
                                        Swing
                                    </div>
                                    <div style="font-size: 1.1rem; font-weight: bold; color: var(--soloist-color);">
                                        {swing}%
                                    </div>
                                </div>
                                <div>
                                    <div style="font-size: 0.7rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">
                                        BPM
                                    </div>
                                    <div style="font-size: 1.1rem; font-weight: bold; color: var(--soloist-color);">
                                        {bpm}
                                    </div>
                                </div>
                                <div>
                                    <div style="font-size: 0.7rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em;">
                                        Genre
                                    </div>
                                    <div style="font-size: 1.1rem; font-weight: bold; color: var(--soloist-color);">
                                        {lastSmartGenre || 'Standard'}
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
