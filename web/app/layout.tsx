import type { Metadata, Viewport } from 'next';
// The order of these side-effect imports IS the cascade: `style.css` was one file, cut at its
// section boundaries, and later rules win ties. Do not sort or regroup them (#1936).
import './style.css';
import './song-header.css';
import './chart-sheet.css';
import './stand-stack.css';
import './responsive.css';
import './stand-shell.css';
import './transport.css';
import './chart-editing.css';
import './band-sheet.css';
import './workspace.css';
import './account.css';
import './songbook.css';
import './chart-page.css';
import './motion.css';

export const metadata: Metadata = {
    title: 'Ensemble music stand',
    description: 'A chart-first music stand and local songbook for the Ensemble band.',
    // The stand IS the site: installable, indexable, and keeping the name, colours and icons an
    // installed copy already carries (#1355), so the browser updates that home-screen entry
    // rather than growing a second one. `scripts/offline.mjs` emits the manifest and copies the
    // icons.
    manifest: '/manifest.json',
    // Both icon links, not just the Apple one: the SVG favicon too, or a tab loses its icon.
    icons: { icon: '/icon.svg', apple: '/icon-maskable-512.png' },
};

/**
 * Next emits `width=device-width, initial-scale=1` by default; both are restated here because
 * exporting `viewport` at all replaces that default, and losing it would be a silent mobile
 * regression in the one build nobody is watching. `themeColor` is the colour installed copies
 * already wear, so the installed app's chrome does not change colour on an update.
 */
export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    themeColor: '#14110d',
};

// Apply a stored Day/Stage choice and colour palette (#1280) before first paint so a
// stage-mode user never sees a white flash, nor anyone a frame of Warm. Mirrors
// themePreference() and palettePreference() in lib/session.ts (the same strict reads:
// anything else stored is System / Warm); the React effects in use-stage-theme.ts and
// use-palette.ts own the attributes after hydration, hence suppressHydrationWarning on
// <html>. The build hashes this script into the CSP (`scripts/offline.mjs`).
const applyStoredTheme = `try{var d=document.documentElement,t=localStorage.getItem('ensemble-v2-preview:theme');if(t==='day'||t==='stage')d.dataset.theme=t;var p=localStorage.getItem('ensemble-v2-preview:palette');if(p==='cool'||p==='contrast'||p==='forest'||p==='plum')d.dataset.palette=p}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en" suppressHydrationWarning>
            <head>
                {/* biome-ignore lint/security/noDangerouslySetInnerHtml: constant string, no user input */}
                <script dangerouslySetInnerHTML={{ __html: applyStoredTheme }} />
            </head>
            <body>{children}</body>
        </html>
    );
}
