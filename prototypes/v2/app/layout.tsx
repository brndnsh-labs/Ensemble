import type { Metadata } from 'next';
import './style.css';

export const metadata: Metadata = {
    title: 'Ensemble v2 — working preview',
    description: 'A working music-stand and local songbook preview.',
    robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="en">
            <body>{children}</body>
        </html>
    );
}
