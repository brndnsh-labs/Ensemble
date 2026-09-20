import type { Metadata, Viewport } from 'next';
import { BASE_PATH } from '../lib/base-path';
import './style.css';

/**
 * The head is one of the few places where being the SITE and being a beta beside it genuinely
 * differ (#1355). At `/v2` this is an unlisted preview: no manifest, no installable identity,
 * and `noindex` so search engines never offer the beta as the app. At `/` it IS the app —
 * installable, indexable, and wearing v1's name, colours and icons on purpose, so a browser
 * that installed v1 updates that entry rather than growing a second one. See
 * `scripts/offline.mjs`, which emits the manifest and copies the icons for the root build only.
 */
const AT_SITE_ROOT = BASE_PATH === '';

export const metadata: Metadata = {
    title: 'Ensemble music stand',
    description: 'A chart-first music stand and local songbook for the Ensemble band.',
    ...(AT_SITE_ROOT
        ? {
              manifest: '/manifest.json',
              // Both of v1's links, not just the Apple one: `public/index.html` also carries
              // `<link rel="icon" type="image/svg+xml" href="icon.svg">`, and a tab that lost
              // its favicon at the cutover would be a visible regression nobody asked for.
              icons: { icon: '/icon.svg', apple: '/icon-maskable-512.png' },
          }
        : { robots: { index: false, follow: false } }),
};

/**
 * Next emits `width=device-width, initial-scale=1` by default; both are restated here because
 * exporting `viewport` at all replaces that default, and losing it would be a silent mobile
 * regression in the one build nobody is watching. `themeColor` matches v1's `<meta
 * name="theme-color">` so the installed app's chrome does not change colour at the cutover.
 */
export const viewport: Viewport = {
    width: 'device-width',
    initialScale: 1,
    ...(AT_SITE_ROOT ? { themeColor: '#14110d' } : {}),
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
