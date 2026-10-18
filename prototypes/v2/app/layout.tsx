import type { Metadata, Viewport } from 'next';
import './style.css';
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

// Apply a stored Day/Stage choice before first paint so a stage-mode user never
// sees a white flash. Mirrors themePreference() in lib/session.ts; the React
// effect in use-stage-theme.ts owns the attribute after hydration, hence
// suppressHydrationWarning on <html>.
const applyStoredTheme = `try{var t=localStorage.getItem('ensemble-v2-preview:theme');if(t==='day'||t==='stage')document.documentElement.dataset.theme=t}catch(e){}`;

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
