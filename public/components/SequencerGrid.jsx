import { Fragment, h } from 'preact';
import React, { memo } from 'preact/compat';
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef } from 'preact/hooks';
import { TIME_SIGNATURES } from '../config.js';
import { clearDrumPresetHighlight } from '../instrument-controller.js';
import { dispatch, getState } from '../state.js';
import { ACTIONS } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';
import { getStepInfo, getStepsPerMeasure } from '../utils.js';

const { playback: playbackState } = getState();

const Step = memo(({ instIdx, stepIdx, value, instName, stepInfo, onToggle }) => {
    // Optimization: Removed per-step subscription to playback state.
    // Visual "playing" state is handled by parent via direct DOM manipulation.

    const className = [
        'step',
        value === 1 ? 'active' : '',
        value === 2 ? 'accented' : '',
        stepInfo.isGroupStart ? 'group-marker' : '',
        stepInfo.isBeatStart ? 'beat-marker' : '',
    ]
        .filter(Boolean)
        .join(' ');

    const status = value === 1 ? 'active' : value === 2 ? 'accented' : 'inactive';

    return (
        <div
            className={className}
            data-inst-idx={instIdx}
            data-step-idx={stepIdx}
            role="button"
            tabIndex={0}
            aria-label={`${instName}, step ${stepIdx + 1}, ${status}`}
            onMouseDown={(e) => onToggle(e, instIdx, stepIdx)}
            onMouseOver={(e) => onToggle(e, instIdx, stepIdx)}
            onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onToggle(e, instIdx, stepIdx);
                }
            }}
        />
    );
});

/**
 * @param {Object} props
 */
export function SequencerGrid() {
    const { instruments, measures, timeSignature, isPlaying } = useEnsembleState(
        (/** @type {import('../types.js').EnsembleState} */ s) => ({
            instruments: s.groove.instruments,
            measures: s.groove.measures,
            timeSignature: s.arranger.timeSignature,
            isPlaying: s.playback.isPlaying,
        }),
    );

    const isDraggingRef = useRef(false);
    const dragTypeRef = useRef(0);
    const _gridRef = useRef(null);
    const stepCache = useRef(new Map());

    const spm = getStepsPerMeasure(timeSignature);
    const totalSteps = measures * spm;
    const ts = TIME_SIGNATURES[timeSignature] || TIME_SIGNATURES['4/4'];

    // Optimization: Memoize step info objects to prevent re-renders of memoized Step components
    const allStepInfos = useMemo(() => {
        return Array.from({ length: totalSteps }, (_, i) => getStepInfo(i, ts));
    }, [totalSteps, ts]);

    useEffect(() => {
        const handleMouseUp = () => {
            isDraggingRef.current = false;
        };
        window.addEventListener('mouseup', handleMouseUp);
        return () => window.removeEventListener('mouseup', handleMouseUp);
    }, []);

    // Optimization: Cache step elements to avoid thousands of querySelectorAll calls
    useLayoutEffect(() => {
        const grid = _gridRef.current;
        if (!grid) {
            return;
        }

        stepCache.current.clear();
        const steps = grid.getElementsByClassName('step');

        for (let i = 0; i < steps.length; i++) {
            const stepEl = steps[i];
            const idx = parseInt(stepEl.getAttribute('data-step-idx'), 10);
            if (!Number.isNaN(idx)) {
                if (!stepCache.current.has(idx)) {
                    stepCache.current.set(idx, []);
                }
                stepCache.current.get(idx).push(stepEl);
            }
        }
    }, [instruments, totalSteps]);

    // Optimized visual update loop
    useEffect(() => {
        if (!isPlaying) {
            const grid = _gridRef.current;
            if (grid) {
                const playingSteps = grid.getElementsByClassName('playing');
                while (playingSteps.length > 0) {
                    playingSteps[0].classList.remove('playing');
                }
            }
            return;
        }

        let lastStep = -1;
        /** @type {number} */
        /** @type {number} */
        let frameId;

        const loop = () => {
            // Determine current visible step based on lastPlayingStep (absolute) and totalSteps
            // playbackState.lastPlayingStep comes from animation loop which processes visual events
            const step = (playbackState.lastPlayingStep || 0) % totalSteps;

            if (step !== lastStep) {
                const grid = _gridRef.current;
                if (grid && grid.offsetParent !== null) {
                    if (lastStep !== -1) {
                        const prev = stepCache.current.get(lastStep);
                        if (prev) {
                            for (let i = 0; i < prev.length; i++) {
                                prev[i].classList.remove('playing');
                            }
                        }
                    }

                    const curr = stepCache.current.get(step);
                    if (curr) {
                        for (let i = 0; i < curr.length; i++) {
                            curr[i].classList.add('playing');
                        }
                    }
                }
                lastStep = step;
            }
            frameId = requestAnimationFrame(loop);
        };

        frameId = requestAnimationFrame(loop);
        return () => cancelAnimationFrame(frameId);
    }, [isPlaying, totalSteps]);

    const handleToggle = useCallback((e, instIdx, stepIdx) => {
        if (e.type === 'mouseover' && !isDraggingRef.current) {
            return;
        }

        // Optimization: Access global state directly to avoid dependency on 'instruments'
        // which changes on every step toggle, preventing full grid re-renders.
        const { groove } = getState();
        const inst = groove.instruments[instIdx];

        let newType = dragTypeRef.current;

        if (e.type === 'mousedown' || e.type === 'keydown') {
            if (inst.steps[stepIdx] === 0) {
                newType = 1;
            } else if (inst.steps[stepIdx] === 1) {
                newType = 2;
            } else {
                newType = 0;
            }

            if (e.type === 'mousedown') {
                dragTypeRef.current = newType;
                isDraggingRef.current = true;
            }
        }

        // Only update if changed (though dispatch handles logic too)
        if (inst.steps[stepIdx] !== newType) {
            inst.steps[stepIdx] = newType;
            clearDrumPresetHighlight();
            dispatch(ACTIONS.STEP_TOGGLE);
        }
    }, []);

    const handleAudition = useCallback((inst) => {
        dispatch(ACTIONS.INIT_AUDIO);
        import('../performance-controller.js').then(({ triggerDrumSound }) => {
            triggerDrumSound(inst.name, playbackState.audio.currentTime, 1.0);
        });
    }, []);

    const handleMute = useCallback((inst, _instIdx) => {
        inst.muted = !inst.muted;
        dispatch('MUTE_TOGGLE');
    }, []);

    return (
        <div className="sequencer-grid" ref={_gridRef}>
            {instruments.map((inst, instIdx) => (
                <div key={inst.name} className="track">
                    <div className="track-header">
                        <span
                            className={`track-symbol ${inst.muted ? 'muted' : ''}`}
                            title={`Audition ${inst.name}`}
                            role="button"
                            tabIndex={0}
                            aria-label={`Audition ${inst.name}`}
                            onClick={() => handleAudition(inst)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    handleAudition(inst);
                                }
                            }}
                        >
                            {inst.symbol || inst.name.charAt(0)}
                        </span>
                        <button
                            className={`mute-toggle ${inst.muted ? 'active' : ''}`}
                            title={inst.muted ? 'Unmute' : 'Mute'}
                            aria-label={`${inst.muted ? 'Unmute' : 'Mute'} ${inst.name}`}
                            aria-pressed={inst.muted}
                            onClick={() => handleMute(inst, instIdx)}
                        >
                            M
                        </button>
                    </div>
                    <div
                        className="steps"
                        style={{ gridTemplateColumns: `repeat(${totalSteps}, 1fr)` }}
                    >
                        {allStepInfos.map((stepInfo, stepIdx) => (
                            <Step
                                key={stepIdx}
                                instIdx={instIdx}
                                stepIdx={stepIdx}
                                value={inst.steps[stepIdx]}
                                instName={inst.name}
                                stepInfo={stepInfo}
                                onToggle={handleToggle}
                            />
                        ))}
                    </div>
                </div>
            ))}

            {/* Label Row */}
            <div className="track label-row">
                <div className="track-header label-header" />
                <div
                    className="steps"
                    style={{ gridTemplateColumns: `repeat(${totalSteps}, 1fr)` }}
                >
                    {allStepInfos.map((stepInfo, i) => {
                        const isBeatStart = stepInfo.isBeatStart;
                        const isGroupStart = stepInfo.isGroupStart;

                        // For compound meters, we only want to label the macro beats (group starts)
                        // For simple meters, we label every beat.
                        const shouldShowLabel = stepInfo.isCompound ? isGroupStart : isBeatStart;

                        if (!shouldShowLabel) {
                            return <div key={i} className="step-label" />;
                        }

                        const label = stepInfo.isCompound
                            ? stepInfo.groupIndex + 1
                            : stepInfo.beatIndex + 1;

                        return (
                            <div
                                key={i}
                                className={`step-label ${isBeatStart ? 'beat-start' : ''} ${isGroupStart ? 'group-start' : ''}`}
                            >
                                {label}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
