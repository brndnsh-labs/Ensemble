import { useEffect, useRef, useState } from 'preact/hooks';

/**
 * Custom hook to handle clicking outside a referenced element.
 * Returns [isMenuOpen, setIsMenuOpen, menuRef]
 * @returns {[boolean, (val: boolean) => void, import('preact/hooks').MutableRef<HTMLDivElement|null>]}
 */
export function useClickOutside() {
    const [isMenuOpen, setIsMenuOpen] = useState(false);
    /** @type {import('preact/hooks').MutableRef<HTMLDivElement|null>} */
    const menuRef = useRef(null);

    useEffect(() => {
        if (!isMenuOpen) {
            return;
        }

        const handleClickOutside = (/** @type {PointerEvent|MouseEvent|Event} */ event) => {
            if (
                menuRef.current &&
                event.target instanceof Node &&
                !menuRef.current.contains(event.target)
            ) {
                setIsMenuOpen(false);
            }
        };

        const handleKeyDown = (/** @type {KeyboardEvent} */ event) => {
            if (event.key === 'Escape') {
                setIsMenuOpen(false);
            }
        };

        document.addEventListener('pointerdown', handleClickOutside);
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('pointerdown', handleClickOutside);
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [isMenuOpen]);

    /** @type {[boolean, (val: boolean) => void, import('preact/hooks').MutableRef<HTMLDivElement|null>]} */
    const res = [isMenuOpen, (val) => setIsMenuOpen(val), menuRef];
    return res;
}
