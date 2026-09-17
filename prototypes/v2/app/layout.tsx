import type { Metadata } from 'next';
import './style.css';

export const metadata: Metadata = {
    title: 'Ensemble music stand',
    description: 'A chart-first music stand and local songbook for the Ensemble band.',
    robots: { index: false, follow: false },
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
