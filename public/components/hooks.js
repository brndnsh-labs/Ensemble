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

        const handleClickOutside = (/** @type {MouseEvent|Event} */ event) => {
            if (
                menuRef.current &&
                event.target instanceof Node &&
                !menuRef.current.contains(event.target)
            ) {
                setIsMenuOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [isMenuOpen]);

    /** @type {[boolean, (val: boolean) => void, import('preact/hooks').MutableRef<HTMLDivElement|null>]} */
    const res = [isMenuOpen, (val) => setIsMenuOpen(val), menuRef];
    return res;
}
