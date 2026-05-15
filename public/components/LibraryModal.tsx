import { useEffect, useRef, useState } from 'preact/hooks';
import { PresetLibrary } from './PresetLibrary.jsx';

const LIBRARY_CLOSE_ANIMATION_MS = 180;

interface LibraryModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export function LibraryModal({ isOpen, onClose }: LibraryModalProps) {
    const overlayRef = useRef<HTMLDivElement | null>(null);
    const closeTimerRef = useRef<number | null>(null);
    const [isRendered, setIsRendered] = useState(isOpen);
    const [isClosing, setIsClosing] = useState(false);

    useEffect(() => {
        if (!isOpen) {
            if (!isRendered) {
                return;
            }

            setIsClosing(true);
            closeTimerRef.current = window.setTimeout(() => {
                setIsRendered(false);
                setIsClosing(false);
            }, LIBRARY_CLOSE_ANIMATION_MS);
            return () => {
                if (closeTimerRef.current !== null) {
                    window.clearTimeout(closeTimerRef.current);
                    closeTimerRef.current = null;
                }
            };
        }

        if (closeTimerRef.current !== null) {
            window.clearTimeout(closeTimerRef.current);
            closeTimerRef.current = null;
        }
        setIsRendered(true);
        setIsClosing(false);
        overlayRef.current?.focus();
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                onClose();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, isRendered, onClose]);

    useEffect(
        () => () => {
            if (closeTimerRef.current !== null) {
                window.clearTimeout(closeTimerRef.current);
            }
        },
        [],
    );

    if (!isRendered && !isOpen) {
        return null;
    }

    return (
        <div
            ref={overlayRef}
            class={`modal-overlay workspace-library-overlay${isOpen ? ' active' : ''}${
                isClosing ? ' closing' : ''
            }`}
            role="dialog"
            aria-modal="true"
            aria-labelledby="workspaceLibraryTitle"
            tabIndex={-1}
            onClick={onClose}
        >
            <div
                class={`settings-content workspace-library-modal${isClosing ? ' closing' : ''}`}
                onClick={(e) => e.stopPropagation()}
            >
                <div class="panel-header workspace-library-header">
                    <div>
                        <p class="workspace-kicker">Recall</p>
                        <h2 id="workspaceLibraryTitle" class="panel-title">
                            Progression Library
                        </h2>
                    </div>
                    <button
                        type="button"
                        class="secondary-btn workspace-library-close"
                        onClick={onClose}
                    >
                        Close
                    </button>
                </div>
                <div class="workspace-library-body">
                    <PresetLibrary onSelect={onClose} />
                </div>
            </div>
        </div>
    );
}
