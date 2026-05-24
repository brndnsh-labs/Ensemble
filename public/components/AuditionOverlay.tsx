import { dispatch } from '../state.js';
import { ACTIONS } from '../types.js';
import { useEnsembleState } from '../ui-bridge.js';

/**
 * Lightweight overlay shown when the app hydrates from an audition permalink
 * (URL `?autoplay=1`). The user's single click on "Play" satisfies the
 * browser's autoplay gesture requirement and starts playback of the
 * already-hydrated scene — collapsing the listening-gate cycle to one click.
 */
export function AuditionOverlay() {
    const { isOpen, genreFeel, bpm, key, isPlaying } = useEnsembleState((s) => ({
        isOpen: s.playback.modals.audition,
        genreFeel: s.groove.genreFeel,
        bpm: s.playback.bpm,
        key: s.arranger.key,
        isPlaying: s.playback.isPlaying,
    }));

    if (!isOpen) {
        return null;
    }

    const start = () => {
        if (!isPlaying) {
            dispatch(ACTIONS.TOGGLE_PLAY);
        }
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'audition', open: false });
    };

    const dismiss = () => {
        dispatch(ACTIONS.SET_MODAL_OPEN, { modal: 'audition', open: false });
    };

    return (
        <div
            class="modal-overlay active audition-overlay"
            role="dialog"
            aria-modal="true"
            aria-label="Audition this scene"
        >
            <div class="audition-card">
                <div class="audition-label">Audition</div>
                <div class="audition-scene">
                    {genreFeel} · {key} · {bpm} BPM
                </div>
                <button
                    type="button"
                    class="audition-play"
                    onClick={start}
                    data-testid="audition-play"
                    autofocus
                >
                    ▶ Play
                </button>
                <button type="button" class="audition-dismiss" onClick={dismiss}>
                    Skip
                </button>
            </div>
        </div>
    );
}
