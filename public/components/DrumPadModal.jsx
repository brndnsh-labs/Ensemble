import { h } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { initAudio, playDrumSound, restoreGains } from '../engine/engine.js';
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
    const [activePads, setActivePads] = useState(new Set());

    useLayoutEffect(() => {
        initAudio();
        restoreGains();

        if (modalRef.current) {
            modalRef.current.focus({ preventScroll: true });
        }
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
        playDrumSound(name, time, velocity);

        setActivePads((prev) => {
            const next = new Set(prev);
            next.add(name);
            return next;
        });

        setTimeout(() => {
            setActivePads((prev) => {
                const next = new Set(prev);
                next.delete(name);
                return next;
            });
        }, 100);
    };

    const DRUM_PADS = [
        { name: 'Kick', label: 'Kick', color: 'var(--soloist-color)' },
        { name: 'Snare', label: 'Snare', color: 'var(--soloist-color)' },
        { name: 'Sidestick', label: 'Rim', color: 'var(--soloist-color)' },
        { name: 'HiHat', label: 'Hi-Hat', color: 'var(--chords-color)' },
        { name: 'Open', label: 'Open Hat', color: 'var(--chords-color)' },
        { name: 'Ride', label: 'Ride', color: 'var(--chords-color)' },
        { name: 'Crash', label: 'Crash', color: 'var(--chords-color)' },
        { name: 'TomHigh', label: 'High Tom', color: 'var(--soloist-color)' },
        { name: 'TomMid', label: 'Mid Tom', color: 'var(--soloist-color)' },
        { name: 'TomLow', label: 'Floor Tom', color: 'var(--soloist-color)' },
    ];

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
                `}
            >
                {pad.label}
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

                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: 1rem; margin-bottom: 2.5rem;">
                    {DRUM_PADS.map(renderPad)}
                </div>

                <div style="background: rgba(15, 23, 42, 0.4); padding: 1.5rem; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05);">
                    <div style="display: flex; flex-direction: column; gap: 1.5rem;">
                        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem;">
                            <div style="flex: 1; min-width: 200px;">
                                <label style="display: block; font-size: 0.8rem; color: #94a3b8; margin-bottom: 0.5rem; text-transform: uppercase; letter-spacing: 0.05em;">
                                    Test Velocity (Timbre Shift: {Math.round(velocity * 100)}%)
                                </label>
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

                        <div style="font-size: 0.75rem; color: #64748b; line-height: 1.4; font-style: italic;">
                            Tip: High velocity (&gt;100%) triggers sharper filter cutoffs and longer
                            decays. Use this lab to verify that the Ride and Open Hat remain focused
                            without spectral buildup.
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
