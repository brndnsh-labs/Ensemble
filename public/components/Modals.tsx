import type { ComponentType } from 'preact';
import { Fragment } from 'preact';
import { lazy, Suspense } from 'preact/compat';
import { useEffect, useState } from 'preact/hooks';
import { useEnsembleState } from '../ui-bridge.js';
import { AuditionOverlay } from './AuditionOverlay.jsx';

const ShareModal = lazy(() => import('./ShareModal.jsx').then((m) => ({ default: m.ShareModal })));
const SurpriseMe = lazy(() => import('./SurpriseMe.jsx').then((m) => ({ default: m.SurpriseMe })));
const Settings = lazy(() => import('./Settings.jsx').then((m) => ({ default: m.Settings })));
const ManualModal = lazy(() =>
    import('./ManualModal.jsx').then((m) => ({ default: m.ManualModal })),
);

interface AnimatedModalWrapperProps {
    isOpen: boolean;
    component: ComponentType<object>;
}

/**
 * AnimatedModalWrapper handles the entrance and exit lifecycle for modals.
 * It ensures the component stays in the DOM long enough for exit animations to play.
 */
function AnimatedModalWrapper({ isOpen, component: Component }: AnimatedModalWrapperProps) {
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
    const { settingsOpen, surpriseMeOpen, shareOpen, manualOpen, auditionOpen } = useEnsembleState(
        (s) => ({
            settingsOpen: s.playback.modals.settings,
            surpriseMeOpen: s.playback.modals.surpriseMe,
            shareOpen: s.playback.modals.share,
            manualOpen: s.playback.modals.manual,
            auditionOpen: s.playback.modals.audition,
        }),
    );

    useEffect(() => {
        const anyOpen = settingsOpen || surpriseMeOpen || shareOpen || manualOpen || auditionOpen;
        if (anyOpen) {
            document.body.classList.add('modal-open');
        } else {
            document.body.classList.remove('modal-open');
        }
    }, [settingsOpen, surpriseMeOpen, shareOpen, manualOpen, auditionOpen]);

    return (
        <Fragment>
            <AnimatedModalWrapper isOpen={settingsOpen} component={Settings} />
            <AnimatedModalWrapper isOpen={surpriseMeOpen} component={SurpriseMe} />
            <AnimatedModalWrapper isOpen={shareOpen} component={ShareModal} />
            <AnimatedModalWrapper isOpen={manualOpen} component={ManualModal} />
            <AuditionOverlay />
        </Fragment>
    );
}
