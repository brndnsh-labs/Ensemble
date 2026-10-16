import { accountApi } from './account/client';

/**
 * The operator overview (#1717), read from `GET /api/admin/overview`. Mirrors
 * `prototypes/v2-api/src/db/admin-overview.ts`'s `AdminOverview` by hand, like `account/api.ts`
 * mirrors the error codes: the two services share no dependency edge. Keep them in sync.
 */
export interface AdminAccountRow {
    shortId: string;
    joinedAt: number;
    /** `null`: no sign-in in the last 30 days (expired sessions are swept), not "never". */
    lastSignInAt: number | null;
    documents: number;
    bytes: number;
    passkeys: number;
    you: boolean;
}

export interface AdminOverview {
    accounts: {
        total: number;
        cap: number;
        remaining: number;
        newLast7Days: number;
        newLast30Days: number;
        signedInLast7Days: number;
    };
    documents: { total: number; bytes: number };
    authFailuresLast24Hours: number;
    list: AdminAccountRow[];
    listTruncated: boolean;
}

/**
 * `denied` is every refusal the server makes — it answers anyone not on its allowlist, signed in
 * or not, with the same 404 an unknown route gets — so the page cannot tell them apart either.
 */
export type AdminLoad =
    | { status: 'ok'; overview: AdminOverview }
    | { status: 'denied' }
    | { status: 'busy' }
    | { status: 'failed' };

export async function loadAdminOverview(): Promise<AdminLoad> {
    const result = await accountApi.get<AdminOverview>('/api/admin/overview');
    if (result.ok) {
        return { status: 'ok', overview: result.value };
    }
    const { error } = result;
    if (error.kind === 'code' && error.code === 'not_found') {
        return { status: 'denied' };
    }
    return error.kind === 'code' && error.code === 'rate_limited'
        ? { status: 'busy' }
        : { status: 'failed' };
}
