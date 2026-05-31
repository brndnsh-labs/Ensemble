import type { ComponentType } from 'preact';
import { Fragment } from 'preact';
import { lazy, Suspense } from 'preact/compat';
import { useEffect, useState } from 'preact/hooks';
import { useEnsembleState } from '../ui-bridge.js';
import { AuditionOverlay } from './AuditionOverlay.jsx';

// Named so the same dynamic import can be both wired into lazy() *and* warmed
// ahead of time during idle (see the prefetch effect below). import() caches
// the module, so the eventual open reuses the already-fetched chunk for free.
const importShareModal = () => import('./ShareModal.jsx').then((m) => ({ default: m.ShareModal }));
const importSurpriseMe = () => import('./SurpriseMe.jsx').then((m) => ({ default: m.SurpriseMe }));
const importSettings = () => import('./Settings.jsx').then((m) => ({ default: m.Settings }));
const importManualModal = () =>
    import('./ManualModal.jsx').then((m) => ({ default: m.ManualModal }));

const ShareModal = lazy(importShareModal);
const SurpriseMe = lazy(importSurpriseMe);
const Settings = lazy(importSettings);
const ManualModal = lazy(importManualModal);

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

    // Warm every lazy modal chunk once the app goes idle, so the *first* open
    // is instant rather than paying a dynamic-import round-trip on click.
    // Settings first — it's the most-reached. Runs once; import() de-dupes, so
    // opening a modal later just reuses the warmed chunk.
    useEffect(() => {
        const prefetch = () => {
            void importSettings().catch(() => {});
            void importShareModal().catch(() => {});
            void importSurpriseMe().catch(() => {});
            void importManualModal().catch(() => {});
        };

        if ('requestIdleCallback' in window) {
            const id = window.requestIdleCallback(prefetch, { timeout: 3000 });
            return () => window.cancelIdleCallback?.(id);
        }
        // Safari (no rIC): defer past the initial render/interaction burst.
        const id = setTimeout(prefetch, 2000);
        return () => clearTimeout(id);
    }, []);

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
