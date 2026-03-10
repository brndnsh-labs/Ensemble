import { h } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { initAudio, killSoloistNote, playSoloNote, restoreGains } from '../engine/engine.js';
import { getState } from '../state.js';
import { midiToNote } from '../utils.js';

/**
 * PerformanceCanvas - A vertical-first, 4-pillar ribbon interface for mobile.
 */
export function PerformanceCanvas({
    noteGroups,
    isLatched,
    onNoteChange,
    bpm,
    currentNoteName,
    currentChordName,
    nextChordName,
}) {
    const canvasRef = useRef(null);
    const containerRef = useRef(null);
    const [activePointers, setActivePointers] = useState(new Map()); // id -> { lane, zone, midi }
    const audioInitializedRef = useRef(false);

    const render = () => {
        const canvas = canvasRef.current;
        if (!canvas) {
            return;
        }
        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;
        const width = canvas.width / dpr;
        const height = canvas.height / dpr;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, width, height);

        // Resolve CSS variables
        const canvasStyle = getComputedStyle(canvas);
        const soloistColor = canvasStyle.getPropertyValue('--soloist-color').trim() || '#268bd2';

        const laneWidth = width / 4;
        const zoneHeight = height / 5;

        // 1. Draw Pillars
        for (let l = 0; l < 4; l++) {
            const x = l * laneWidth;
            const isLeft = l < 2;
            const isOuter = l === 0 || l === 3;
            const color = isLeft ? soloistColor : '#94a3b8';

            // Pillar Background
            ctx.fillStyle = isOuter ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.01)';
            ctx.fillRect(x, 0, laneWidth, height);

            // Pillar Border
            ctx.strokeStyle = 'rgba(255,255,255,0.05)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x + laneWidth, 0);
            ctx.lineTo(x + laneWidth, height);
            ctx.stroke();

            // Zones
            const group = noteGroups[l] || [];
            for (let z = 0; z < 5; z++) {
                const y = (4 - z) * zoneHeight; // Bottom up
                const midi = group[z];
                const noteInfo = midi ? midiToNote(midi) : null;
                const label = noteInfo ? `${noteInfo.name}${noteInfo.octave}` : '';

                // Check if this zone is active
                let isActive = false;
                activePointers.forEach((p) => {
                    if (p.lane === l && p.zone === z) {
                        isActive = true;
                    }
                });

                if (isActive) {
                    const grad = ctx.createLinearGradient(x, y, x + laneWidth, y);
                    grad.addColorStop(0, 'rgba(255,255,255,0)');
                    grad.addColorStop(0.5, color);
                    grad.addColorStop(1, 'rgba(255,255,255,0)');
                    ctx.fillStyle = grad;
                    ctx.globalAlpha = 0.4;
                    ctx.fillRect(x, y, laneWidth, zoneHeight);
                    ctx.globalAlpha = 1.0;

                    // Glow Effect
                    ctx.shadowBlur = 20;
                    ctx.shadowColor = color;
                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 16px monospace';
                    ctx.textAlign = 'center';
                    ctx.fillText(label, x + laneWidth / 2, y + zoneHeight / 2 + 6);
                    ctx.shadowBlur = 0;
                } else {
                    ctx.fillStyle = 'rgba(255,255,255,0.15)';
                    ctx.font = '10px monospace';
                    ctx.textAlign = 'center';
                    ctx.fillText(label, x + laneWidth / 2, y + zoneHeight / 2 + 4);
                }
            }
        }

        // 2. Wing Headers (Chord Names)
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = soloistColor;
        ctx.fillText(currentChordName, width * 0.25, 25);
        ctx.fillStyle = '#94a3b8';
        ctx.fillText(nextChordName, width * 0.75, 25);

        // 3. Center Status (Active Note & BPM)
        if (currentNoteName) {
            ctx.shadowBlur = 15;
            ctx.shadowColor = soloistColor;
            ctx.fillStyle = '#fff';
            ctx.font = '900 56px monospace';
            ctx.textAlign = 'center';
            ctx.fillText(currentNoteName, width / 2, height / 2);
            ctx.shadowBlur = 0;
        }

        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillText(`${bpm} BPM`, width / 2, height - 20);
    };

    useLayoutEffect(() => {
        const handleResize = () => {
            if (!canvasRef.current || !containerRef.current) {
                return;
            }
            const dpr = window.devicePixelRatio || 1;
            const rect = containerRef.current.getBoundingClientRect();
            canvasRef.current.width = rect.width * dpr;
            canvasRef.current.height = rect.height * dpr;
        };
        window.addEventListener('resize', handleResize);
        handleResize();
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        let frameId;
        const loop = () => {
            render();
            frameId = requestAnimationFrame(loop);
        };
        frameId = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(frameId);
    }, [activePointers, noteGroups, bpm, currentNoteName, currentChordName, nextChordName]);

    const handleTouch = (e) => {
        e.preventDefault();
        e.stopPropagation();

        if (!audioInitializedRef.current) {
            initAudio();
            const { playback } = getState();
            playback.audio?.resume();
            audioInitializedRef.current = true;
        }

        const rect = canvasRef.current.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;
        const laneWidth = width / 4;
        const zoneHeight = height / 5;

        const nextPointers = new Map();

        for (let i = 0; i < e.touches.length; i++) {
            const touch = e.touches[i];
            const tx = touch.clientX - rect.left;
            const ty = touch.clientY - rect.top;

            const lane = Math.min(3, Math.max(0, Math.floor(tx / laneWidth)));
            const zone = Math.min(4, Math.max(0, 4 - Math.floor(ty / zoneHeight)));
            const midi = noteGroups[lane]?.[zone];

            if (midi) {
                nextPointers.set(touch.identifier, { lane, zone, midi });
            }
        }

        // Diff pointers
        const currentMidis = new Set([...nextPointers.values()].map((p) => p.midi));
        const prevMidis = new Set([...activePointers.values()].map((p) => p.midi));

        // Trigger new
        currentMidis.forEach((midi) => {
            if (!prevMidis.has(midi)) {
                const freq = 440 * 2 ** ((midi - 69) / 12);
                const isLegato = activePointers.size > 0;
                playSoloNote(freq, 0, 60.0, 0.8, 0, 'scalar', isLegato);
                onNoteChange(midi);
            }
        });

        // Kill released (unless latched)
        if (
            !isLatched &&
            (e.type === 'touchend' || e.type === 'touchcancel' || e.type === 'touchmove')
        ) {
            if (nextPointers.size === 0 && prevMidis.size > 0) {
                killSoloistNote();
                onNoteChange(null);
            }
        }

        setActivePointers(nextPointers);
    };

    return (
        <div
            ref={containerRef}
            style="flex: 1; width: 100%; height: 100%; position: relative; background: #0f172a; overflow: hidden;"
        >
            <canvas
                ref={canvasRef}
                style="width: 100%; height: 100%; touch-action: none; display: block;"
                onTouchStart={handleTouch}
                onTouchMove={handleTouch}
                onTouchEnd={handleTouch}
                onTouchCancel={handleTouch}
            />
        </div>
    );
}
