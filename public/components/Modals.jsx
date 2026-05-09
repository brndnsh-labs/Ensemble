import { Fragment } from 'preact';
import { lazy, Suspense } from 'preact/compat';
import { useEffect, useState } from 'preact/hooks';
import { useEnsembleState } from '../ui-bridge.js';

const EditorModal = lazy(() =>
    import('./EditorModal.jsx').then((m) => ({ default: m.EditorModal })),
);
const ShareModal = lazy(() => import('./ShareModal.jsx').then((m) => ({ default: m.ShareModal })));
const GenerateSongModal = lazy(() =>
    import('./GenerateSongModal.jsx').then((m) => ({ default: m.GenerateSongModal })),
);
const PerformanceModal = lazy(() =>
    import('./PerformanceModal.jsx').then((m) => ({ default: m.PerformanceModal })),
);
const Settings = lazy(() => import('./Settings.jsx').then((m) => ({ default: m.Settings })));
const ManualModal = lazy(() =>
    import('./ManualModal.jsx').then((m) => ({ default: m.ManualModal })),
);
const DrumPadModal = lazy(() =>
    import('./DrumPadModal.jsx').then((m) => ({ default: m.DrumPadModal })),
);

/**
 * @typedef {Object} AnimatedModalWrapperProps
 * @property {boolean} isOpen
 * @property {import('preact').ComponentType<any>} component
 */
/**
 * AnimatedModalWrapper handles the entrance and exit lifecycle for modals.
 * It ensures the component stays in the DOM long enough for exit animations to play.
 * @param {AnimatedModalWrapperProps} props
 */
function AnimatedModalWrapper({ isOpen, component: Component }) {
    const [shouldRender, setShouldRender] = useState(isOpen);
    const [isClosing, setIsClosing] = useState(false);

    useEffect(() => {
        if (isOpen) {
            setShouldRender(true);
            setIsClosing(false);
        } else if (shouldRender) {
            setIsClosing(true);
            const timer = setTimeout(() => {
                setShouldRender(false);
                setIsClosing(false);
            }, 300); // Matches --anim-normal duration + buffer
            return () => clearTimeout(timer);
        }
    }, [isOpen, shouldRender]);

    if (!shouldRender) {
        return null;
    }

    return (
        <div class={isClosing ? 'closing' : ''}>
            <Suspense fallback={null}>
                <Component />
            </Suspense>
        </div>
    );
}

/**
 * Root component for all global modals.
 * Monitors global state to determine which modal to show.
 */
export function Modals() {
    // Get modal visibility state from global store
    const {
        settingsOpen,
        editorOpen,
        generateSongOpen,
        shareOpen,
        performanceOpen,
        manualOpen,
        drumPadOpen,
    } = useEnsembleState((/** @type {import('../types.js').EnsembleState} */ s) => ({
        settingsOpen: s.playback.modals.settings,
        editorOpen: s.playback.modals.editor,
        generateSongOpen: s.playback.modals.generateSong,
        shareOpen: s.playback.modals.share,
        performanceOpen: s.playback.modals.performance,
        manualOpen: s.playback.modals.manual,
        drumPadOpen: s.playback.modals.drumPad,
    }));

    useEffect(() => {
        const anyOpen =
            settingsOpen ||
            editorOpen ||
            generateSongOpen ||
            shareOpen ||
            performanceOpen ||
            manualOpen ||
            drumPadOpen;
        if (anyOpen) {
            document.body.classList.add('modal-open');
        } else {
            document.body.classList.remove('modal-open');
        }
    }, [
        settingsOpen,
        editorOpen,
        generateSongOpen,
        shareOpen,
        performanceOpen,
        manualOpen,
        drumPadOpen,
    ]);

    return (
        <Fragment>
            <AnimatedModalWrapper isOpen={settingsOpen} component={Settings} />
            <AnimatedModalWrapper isOpen={editorOpen} component={EditorModal} />
            <AnimatedModalWrapper isOpen={generateSongOpen} component={GenerateSongModal} />
            <AnimatedModalWrapper isOpen={shareOpen} component={ShareModal} />
            <AnimatedModalWrapper isOpen={performanceOpen} component={PerformanceModal} />
            <AnimatedModalWrapper isOpen={manualOpen} component={ManualModal} />
            <AnimatedModalWrapper isOpen={drumPadOpen} component={DrumPadModal} />
        </Fragment>
    );
}
