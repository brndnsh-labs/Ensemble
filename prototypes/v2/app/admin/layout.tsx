import type { Metadata } from 'next';

/** Never indexed, and linked from nowhere in the app (#1717). */
export const metadata: Metadata = {
    title: 'Ensemble admin',
    robots: { index: false, follow: false },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
    return children;
}
