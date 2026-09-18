'use client';

import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { accountApi } from '../../lib/account/client';
import { ACCOUNT_MESSAGES, type AccountFailure } from '../../lib/account/messages';
import {
    addPasskey,
    confirmRecoveryCode,
    enrollRecoveryCode,
    listPasskeys,
    type PasskeySummary,
    revokeOtherSessions,
    revokePasskey,
} from '../../lib/account/passkeys';
import { AccountFailureNotice } from './account-failure';
import { RecoveryCodeStep } from './recovery-code-step';

/**
 * The account page (#1264) — passkeys, sessions, recovery code, opened from the signed-in header
 * entry (`account-entry.tsx`'s `onOpenAccount`). A `<dialog>` following the same modal pattern as
 * `sign-in.tsx`: native `showModal()`/`close()` driven by the shell from `open`, which is what
 * gives it the browser's own focus trap/Escape/restore for free — this file adds nothing on top
 * of that, same as `sign-in.tsx` doesn't either.
 *
 * Every mutation here (add passkey, revoke passkey, replace recovery code) goes through the
 * existing step-up contract: on the server's `403 fresh_auth_required` the underlying
 * `lib/account/passkeys.ts` call runs the reauth ceremony and retries ONCE — this component never
 * re-implements that, it just reports whatever `AccountOutcome` comes back. "Sign out other
 * devices" (`revokeOtherSessions`) is the one action here with NO freshness gate — verified
 * against `prototypes/v2-api/src/http/app.ts`'s `POST /api/auth/sessions/revoke-others`, which
 * calls `requireSession` and nothing else — so it is not wrapped in that retry, and never will
 * show a step-up prompt.
 *
 * The account is never left able to remove its last passkey from THIS page: the Remove button is
 * disabled once the list is down to one, mirroring (not replacing) the server's own
 * `409 last_credential` refusal — the disabled button is a courtesy, the server call in
 * `revokePasskey` is the actual enforcement point.
 */

interface AccountPageProps {
    /** Owned by the shell, which drives `showModal()`/`close()` from its own state. */
    dialogRef: RefObject<HTMLDialogElement | null>;
    open: boolean;
    onClose: () => void;
    /** Re-read the session (and recovery status) after a mutation changes it. */
    onAccountChanged: () => void;
}

type Section = 'main' | 'replaceCode';

export function AccountPage({ dialogRef, open, onClose, onAccountChanged }: AccountPageProps) {
    const [section, setSection] = useState<Section>('main');
    const [passkeys, setPasskeys] = useState<PasskeySummary[] | null>(null);
    const [listFailure, setListFailure] = useState<AccountFailure | null>(null);
    // Which action is in flight, if any — every button on the page disables while ANY action is
    // busy, both because two ceremonies can't interleave on one profile (`passkeys.ts`'s doc
    // comment) and because a stale list read mid-mutation would be confusing either way.
    const [busyAction, setBusyAction] = useState<
        'add' | 'revoke' | 'signOutOthers' | 'replaceCode' | null
    >(null);
    const [actionFailure, setActionFailure] = useState<AccountFailure | null>(null);
    const [signedOutOthers, setSignedOutOthers] = useState(false);
    const [code, setCode] = useState('');

    /**
     * Every await below outlives a possible close — a passkey prompt is a human pressing a
     * fingerprint reader, same as `sign-in.tsx` — so each one re-checks this before writing state.
     */
    const openRef = useRef(false);

    /**
     * Coming back from the recovery-code step unmounts both the heading that had focus and the
     * Finish button that was pressed, so focus would otherwise fall back to `<body>` — outside
     * the dialog and silent for a screen reader. Exactly the fix `sign-in.tsx` applies to its own
     * entry stage when `RecoverFlow` unmounts (#1263 patch review P2-4), for exactly that reason.
     */
    const mainHeadingRef = useRef<HTMLHeadingElement>(null);
    const previousSectionRef = useRef<Section>('main');
    useEffect(() => {
        // Only a genuine 'replaceCode' -> 'main' transition steals focus: the first open already
        // gets it from the dialog's own `showModal()`, and a close-triggered reset must not move
        // focus in a dialog nobody can see.
        if (section === 'main' && open && previousSectionRef.current === 'replaceCode') {
            mainHeadingRef.current?.focus();
        }
        previousSectionRef.current = section;
    }, [section, open]);

    const refreshPasskeys = useCallback(() => {
        void listPasskeys(accountApi).then((outcome) => {
            if (!openRef.current) {
                return;
            }
            if (outcome.ok) {
                setPasskeys(outcome.value);
                setListFailure(null);
            } else if (outcome.failure.kind !== 'cancelled') {
                setListFailure(outcome.failure);
            }
        });
    }, []);

    useEffect(() => {
        openRef.current = open;
        if (open) {
            setSection('main');
            setActionFailure(null);
            setSignedOutOthers(false);
            setCode('');
            refreshPasskeys();
        } else {
            // Drop everything the moment the dialog closes, whatever closed it — same rule
            // `sign-in.tsx` applies to the recovery code: a reopen must never resurrect a code
            // that was already shown, and a stale passkey list is not worth keeping around either.
            setPasskeys(null);
            setListFailure(null);
            setBusyAction(null);
            setActionFailure(null);
            setCode('');
        }
    }, [open, refreshPasskeys]);

    async function runAdd() {
        setActionFailure(null);
        setBusyAction('add');
        const outcome = await addPasskey(accountApi);
        if (!openRef.current) {
            return;
        }
        setBusyAction(null);
        if (!outcome.ok) {
            if (outcome.failure.kind !== 'cancelled') {
                setActionFailure(outcome.failure);
            }
            return;
        }
        refreshPasskeys();
    }

    async function runRevoke(credentialId: string) {
        setActionFailure(null);
        setBusyAction('revoke');
        const outcome = await revokePasskey(accountApi, credentialId);
        if (!openRef.current) {
            return;
        }
        setBusyAction(null);
        if (!outcome.ok) {
            if (outcome.failure.kind !== 'cancelled') {
                setActionFailure(outcome.failure);
            }
            return;
        }
        if (outcome.value.signedOut) {
            // The revoked credential created THIS session — the server already cleared the
            // cookie, so react as a sign-out rather than refreshing a list for an account we can
            // no longer read.
            onAccountChanged();
            onClose();
            return;
        }
        refreshPasskeys();
    }

    async function runSignOutOthers() {
        setActionFailure(null);
        setBusyAction('signOutOthers');
        const outcome = await revokeOtherSessions(accountApi);
        if (!openRef.current) {
            return;
        }
        setBusyAction(null);
        if (!outcome.ok) {
            if (outcome.failure.kind !== 'cancelled') {
                setActionFailure(outcome.failure);
            }
            return;
        }
        setSignedOutOthers(true);
    }

    async function beginReplaceCode() {
        setActionFailure(null);
        setBusyAction('replaceCode');
        const outcome = await enrollRecoveryCode(accountApi);
        if (!openRef.current) {
            return;
        }
        setBusyAction(null);
        if (!outcome.ok) {
            if (outcome.failure.kind !== 'cancelled') {
                setActionFailure(outcome.failure);
            }
            return;
        }
        // The account is unprotected from this instant, whether or not the code below is ever
        // confirmed — the server already deleted the old confirmed row (`enrollRecoveryCode`'s
        // decision 2/3) the moment this call succeeded. Same rule `sign-in.tsx`'s `runCreate`
        // follows: tell the shell immediately rather than only on Finish.
        onAccountChanged();
        setCode(outcome.value);
        setSection('replaceCode');
    }

    async function finishReplaceCode() {
        setActionFailure(null);
        setBusyAction('replaceCode');
        const outcome = await confirmRecoveryCode(accountApi, code);
        if (!openRef.current) {
            return;
        }
        setBusyAction(null);
        if (!outcome.ok) {
            if (outcome.failure.kind !== 'cancelled') {
                setActionFailure(outcome.failure);
            }
            return;
        }
        setCode('');
        setSection('main');
        onAccountChanged();
    }

    function abandonReplaceCode() {
        setCode('');
        setSection('main');
    }

    const lastPasskey = passkeys !== null && passkeys.length <= 1;
    const busy = busyAction !== null;

    return (
        <dialog
            ref={dialogRef}
            className="modal-box account-page"
            aria-labelledby="account-page-title"
            onCancel={onClose}
            onClose={onClose}
        >
            {section === 'replaceCode' && code !== '' ? (
                <RecoveryCodeStep
                    key={code}
                    headingId="account-page-title"
                    heading="Save your new recovery code."
                    lead="Your old code stopped working the moment this one was made. It’s shown once and never again — copy it or download it, then keep it somewhere safe and offline."
                    code={code}
                    busy={busy}
                    failure={actionFailure}
                    onFinish={() => void finishReplaceCode()}
                    onClose={abandonReplaceCode}
                />
            ) : (
                <>
                    <h2 id="account-page-title" ref={mainHeadingRef} tabIndex={-1}>
                        Your account.
                    </h2>

                    <section aria-labelledby="account-page-passkeys-heading">
                        <h3 id="account-page-passkeys-heading">Passkeys</h3>
                        <AccountFailureNotice failure={listFailure} />
                        {passkeys === null ? (
                            <p className="status-detail">Loading…</p>
                        ) : (
                            <ul className="passkey-list">
                                {passkeys.map((passkey) => (
                                    <li
                                        key={passkey.id}
                                        className="passkey-row"
                                        data-testid="passkey-row"
                                        // Not a testid — a plain hook so a test can target a SPECIFIC
                                        // known credential's row deterministically (e.g. "the one
                                        // that existed before Add was clicked"), rather than
                                        // guessing from list order or the `current` label, which a
                                        // step-up reauth ceremony can rebind to either passkey.
                                        data-credential-id={passkey.id}
                                    >
                                        <span data-testid="passkey-label">
                                            {passkeyLabel(passkey)}
                                        </span>
                                        <button
                                            className="btn"
                                            data-testid="passkey-remove"
                                            disabled={lastPasskey || busy}
                                            onClick={() => void runRevoke(passkey.id)}
                                        >
                                            Remove
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        )}
                        {lastPasskey && (
                            // Said out loud rather than parked in a `title` on a disabled button,
                            // which no touch device and few screen readers ever surface. The words
                            // come from `messages.ts` — the same sentence the server's
                            // `409 last_credential` maps to, because it is the same rule.
                            <p className="status-detail" data-testid="passkey-last-note">
                                {ACCOUNT_MESSAGES.lastPasskey}
                            </p>
                        )}
                        <button
                            className="btn"
                            data-testid="passkey-add"
                            disabled={busy}
                            onClick={() => void runAdd()}
                        >
                            Add a passkey
                        </button>
                    </section>

                    <section aria-labelledby="account-page-sessions-heading">
                        <h3 id="account-page-sessions-heading">Sessions</h3>
                        <button
                            className="btn"
                            data-testid="sign-out-others"
                            disabled={busy}
                            onClick={() => void runSignOutOthers()}
                        >
                            Sign out other devices
                        </button>
                        {signedOutOthers && (
                            <p className="status-detail" data-testid="sign-out-others-done">
                                Other devices are signed out.
                            </p>
                        )}
                    </section>

                    <section aria-labelledby="account-page-recovery-heading">
                        <h3 id="account-page-recovery-heading">Recovery code</h3>
                        <p className="status-detail">
                            Replacing your code retires the old one immediately.
                        </p>
                        <button
                            className="btn"
                            data-testid="replace-recovery-code"
                            disabled={busy}
                            onClick={() => void beginReplaceCode()}
                        >
                            Replace recovery code
                        </button>
                    </section>

                    <AccountFailureNotice failure={actionFailure} />

                    <div className="dialog-actions">
                        <button className="btn" onClick={onClose}>
                            Close
                        </button>
                    </div>
                </>
            )}
        </dialog>
    );
}

function passkeyLabel(passkey: PasskeySummary): string {
    const created = new Date(passkey.createdAt).toLocaleDateString();
    return `Added ${created}${passkey.current ? ' — this device' : ''}`;
}
