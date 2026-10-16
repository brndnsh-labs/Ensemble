'use client';

import { notFound } from 'next/navigation';
import { useEffect, useState } from 'react';
import { type AdminLoad, type AdminOverview, loadAdminOverview } from '../../lib/admin';
import './admin.css';

/**
 * The operator's page (#1717): accounts against the sign-up cap, what they store, and who they
 * are, read-only. The route answers anyone it refuses exactly as it would a path that does not
 * exist, and the page then shows the app's not-found. Until the server answers it shows nothing,
 * so a refused visitor never sees it name itself.
 */
export default function AdminPage() {
    const [load, setLoad] = useState<AdminLoad | null>(null);
    useEffect(() => {
        void loadAdminOverview().then(setLoad);
    }, []);

    if (load?.status === 'denied') {
        notFound();
    }
    if (load === null) {
        return <main className="admin" />;
    }
    return (
        <main className="admin">
            <h1>Admin</h1>
            {load.status === 'busy' && (
                <p className="admin-note" role="alert">
                    Too many reloads. Wait a minute, then reload.
                </p>
            )}
            {load.status === 'failed' && (
                <p className="admin-note" role="alert">
                    Couldn't reach the server. Reload to try again.
                </p>
            )}
            {load.status === 'ok' && <Overview overview={load.overview} />}
        </main>
    );
}

function Overview({ overview }: { overview: AdminOverview }) {
    const { accounts, documents, charts } = overview;
    return (
        <>
            <section className="admin-stats" aria-label="Totals">
                <Stat
                    label="Accounts"
                    value={`${accounts.total} of ${accounts.cap}`}
                    detail={
                        accounts.remaining === 0
                            ? 'Sign-up is full'
                            : `${accounts.remaining} sign-ups left`
                    }
                    warn={accounts.remaining <= Math.ceil(accounts.cap / 5)}
                />
                <Stat
                    label="New"
                    value={String(accounts.newLast7Days)}
                    detail={`this week · ${accounts.newLast30Days} in 30 days`}
                />
                <Stat
                    label="Signed in"
                    value={String(accounts.signedInLast7Days)}
                    detail="this week"
                />
                <Stat
                    label="Charts saved"
                    value={String(documents.total)}
                    detail={formatBytes(documents.bytes)}
                />
                <Stat
                    label="Failed sign-ins"
                    value={String(overview.authFailuresLast24Hours)}
                    detail="last 24 hours"
                />
            </section>
            <section aria-labelledby="admin-formats">
                <h2 id="admin-formats">Chart formats</h2>
                <ul className="admin-formats">
                    {Object.entries(charts.bySchemaVersion)
                        .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
                        .map(([version, n]) => (
                            <li key={version}>
                                {version === 'unknown'
                                    ? `Charts with no format version: ${n}`
                                    : `Format ${version} charts: ${n}`}
                            </li>
                        ))}
                    <li>Old-format charts: {charts.bySchemaVersion['1'] ?? 0}</li>
                    <li>Charts with old band settings: {charts.withLegacyFields}</li>
                </ul>
            </section>
            <section aria-labelledby="admin-accounts">
                <h2 id="admin-accounts">Accounts</h2>
                <div className="admin-table-wrap">
                    <table className="admin-table">
                        <thead>
                            <tr>
                                <th scope="col">Account</th>
                                <th scope="col">Joined</th>
                                <th scope="col">Last sign-in</th>
                                <th scope="col">Charts</th>
                                <th scope="col">Storage</th>
                                <th scope="col">Passkeys</th>
                            </tr>
                        </thead>
                        <tbody>
                            {overview.list.map((row) => (
                                <tr key={row.shortId} className={row.you ? 'admin-you' : undefined}>
                                    <td>
                                        <code>{row.shortId}</code>
                                        {row.you && <span className="admin-tag">you</span>}
                                    </td>
                                    <td>{formatDate(row.joinedAt)}</td>
                                    <td>
                                        {row.lastSignInAt === null
                                            ? 'Over 30 days ago'
                                            : formatDate(row.lastSignInAt)}
                                    </td>
                                    <td>{row.documents}</td>
                                    <td>{formatBytes(row.bytes)}</td>
                                    <td>{row.passkeys}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {overview.listTruncated && (
                    <p className="admin-note">Showing the newest {overview.list.length}.</p>
                )}
            </section>
        </>
    );
}

function Stat({
    label,
    value,
    detail,
    warn = false,
}: {
    label: string;
    value: string;
    detail: string;
    warn?: boolean;
}) {
    return (
        <div className={warn ? 'admin-stat admin-warn' : 'admin-stat'}>
            <span className="admin-stat-label">{label}</span>
            <strong className="admin-stat-value">{value}</strong>
            <span className="admin-stat-detail">{detail}</span>
        </div>
    );
}

function formatDate(ms: number): string {
    return new Date(ms).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
    });
}

function formatBytes(bytes: number): string {
    if (bytes < 1024) {
        return `${bytes} B`;
    }
    if (bytes < 1024 * 1024) {
        return `${(bytes / 1024).toFixed(1)} KB`;
    }
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
