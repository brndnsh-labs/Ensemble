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
    recoveryEnrolled,
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

type Section = 'main' | 'replaceCode' | 'signedOut';

export function AccountPage({ dialogRef, open, onClose, onAccountChanged }: AccountPageProps) {
    const [section, setSection] = useState<Section>('main');
    const [passkeys, setPasskeys] = useState<PasskeySummary[] | null>(null);
    const [listFailure, setListFailure] = useState<AccountFailure | null>(null);
    /** Whether the account has a CONFIRMED, unconsumed recovery code — `null` while unknown, same
     * convention as `passkeys`. Fetched alongside the passkey list (#1264 patch review P2-2): the
     * server's `409 last_credential` rule is "one credential AND no confirmed recovery material",
     * not "one credential" alone, so the button's courtesy disable needs this to match it. */
    const [recoveryConfirmed, setRecoveryConfirmed] = useState<boolean | null>(null);
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

    /**
     * The 'signedOut' section (#1264 patch review P2-4) replaces this dialog's own heading and
     * the Remove button that was just pressed, so focus would otherwise fall to `<body>` — the
     * mirror image of `mainHeadingRef` above, for the transition INTO this section instead of
     * out of `replaceCode`.
     */
    const signedOutHeadingRef = useRef<HTMLHeadingElement>(null);
    useEffect(() => {
        if (section === 'signedOut') {
            signedOutHeadingRef.current?.focus();
        }
    }, [section]);

    /**
     * Re-reads both the passkey list and the recovery-code status together (#1264 patch review
     * P2-2) — `lastPasskey` below needs both to answer the server's actual rule, and either one
     * can change out from under the other: a step-up rebinds `current` on the SAME list, and
     * confirming/abandoning a recovery code flips `recoveryConfirmed` alone. One call, run from
     * every site that currently calls this, keeps them from drifting apart.
     */
    const refreshPasskeys = useCallback(() => {
        void Promise.all([listPasskeys(accountApi), recoveryEnrolled(accountApi)]).then(
            ([passkeysOutcome, recoveryOutcome]) => {
                if (!openRef.current) {
                    return;
                }
                if (passkeysOutcome.ok) {
                    setPasskeys(passkeysOutcome.value);
                    setListFailure(null);
                } else if (passkeysOutcome.failure.kind !== 'cancelled') {
                    setListFailure(passkeysOutcome.failure);
                }
                // A failed recovery-status read leaves `recoveryConfirmed` at its last known value
                // (or `null`) rather than surfacing a second failure banner next to the passkey
                // one — `lastPasskey` only trips on an explicit `false`, so the courtesy note
                // simply stays silent here; the server's own `409 last_credential` remains the
                // real enforcement point regardless.
                if (recoveryOutcome.ok) {
                    setRecoveryConfirmed(recoveryOutcome.value);
                }
            },
        );
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
            setRecoveryConfirmed(null);
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
            // no longer read. Stay open on a dedicated section instead of closing straight away
            // (#1264 patch review P2-4): the shell's header flips to "Sign in again" behind this
            // dialog the instant `onAccountChanged` runs, and closing immediately would leave
            // nothing on screen saying why this device just got signed out.
            onAccountChanged();
            setSection('signedOut');
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
        // `withFreshAuth` inside `enrollRecoveryCode` may have just run a step-up ceremony, which
        // rebinds THIS session to whichever credential answered it (#1264 patch review P1) — the
        // passkey list already in state can be showing "— this device" on the wrong row by the
        // time this section is reachable again. Re-read it now rather than leaving it stale.
        refreshPasskeys();
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
        // Same reason as `beginReplaceCode` above: `confirmRecoveryCode` is also
        // `withFreshAuth`-wrapped, so this call alone can be the one that steps up and rebinds
        // the session — and separately, `recoveryConfirmed` itself just flipped to `true` and the
        // main section is about to render its courtesy note again.
        refreshPasskeys();
    }

    function abandonReplaceCode() {
        setCode('');
        setSection('main');
    }

    // The server's rule (`revokePasskey`'s step 3, `v2-api/src/auth/passkeys.ts`): refuse only
    // when this credential is the ONLY one AND there is no confirmed, unconsumed recovery code —
    // `=== 1`, not `<= 1`, so an empty (still-loading-failed) list never shows the note, and
    // `=== false`, not falsy, so `null` (not yet known) doesn't either (#1264 patch review P2-2).
    const lastPasskey = passkeys !== null && passkeys.length === 1 && recoveryConfirmed === false;
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
            ) : section === 'signedOut' ? (
                <>
                    <h2 id="account-page-title" ref={signedOutHeadingRef} tabIndex={-1}>
                        You’ve been signed out.
                    </h2>
                    <p>
                        That passkey was what signed this device in, so removing it ended this
                        session too.
                    </p>
                    <div className="dialog-actions">
                        <button
                            className="btn"
                            data-testid="account-page-signed-out-close"
                            onClick={onClose}
                        >
                            Close
                        </button>
                    </div>
                </>
            ) : (
                <>
                    <h2 id="account-page-title" ref={mainHeadingRef} tabIndex={-1}>
                        Your account.
                    </h2>

                    <section aria-labelledby="account-page-passkeys-heading">
                        <h3 id="account-page-passkeys-heading">Passkeys</h3>
                        <AccountFailureNotice failure={listFailure} />
                        {passkeys === null ? (
                            // `listFailure !== null` means the fetch already answered — with an
                            // error `AccountFailureNotice` just rendered above — so this must not
                            // ALSO claim to be loading forever (#1264 patch review P3-5). Nothing
                            // further to say: the failure banner already covers it, and setting
                            // `passkeys` to `[]` here would misreport "zero passkeys" instead.
                            listFailure === null && <p className="status-detail">Loading…</p>
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
