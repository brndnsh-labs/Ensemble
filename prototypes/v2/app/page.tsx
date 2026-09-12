'use client';

import dynamic from 'next/dynamic';

const Ensemble = dynamic(() => import('./ensemble'), {
    ssr: false,
    loading: () => (
        <main className="loading">
            <h1>ensemble.</h1>
            <p>Getting the band ready…</p>
        </main>
    ),
});

export default function Page() {
    return <Ensemble />;
}
