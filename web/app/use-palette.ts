import { useEffect, useState } from 'react';
import { type Palette, palettePreference, rememberPalette } from '../lib/session';

// The colour palette (#1280) is a per-device convenience, never a document field. Warm is the
// default and has no attribute; the stored choice is applied before hydration by the inline
// script in layout.tsx, and here on every change. It is independent of Day/Stage
// (`useStageTheme`): each palette is light-dark() pairs, so the two combine in CSS.
export function usePalette() {
    // Null until storage is read, so the first render never strips the attribute the
    // pre-hydration script set (a frame of Warm on every load).
    const [stored, setStored] = useState<Palette | null>(null);
    useEffect(() => {
        setStored(palettePreference());
    }, []);
    useEffect(() => {
        if (stored === null) {
            return;
        }
        if (stored === 'warm') {
            delete document.documentElement.dataset.palette;
        } else {
            document.documentElement.dataset.palette = stored;
        }
    }, [stored]);
    const choosePalette = (next: Palette) => {
        setStored(next);
        rememberPalette(next);
    };
    return { palette: stored ?? 'warm', choosePalette };
}
