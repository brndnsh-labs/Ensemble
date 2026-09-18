'use client';

import { type RefObject, useCallback, useEffect, useRef, useState } from 'react';
import { accountApi } from '../../lib/account/client';
import type { AccountFailure } from '../../lib/account/messages';
import {
    confirmRecoveryCode,
    createAccount,
    enrollRecoveryCode,
    passkeysSupported,
    signIn,
} from '../../lib/account/passkeys';

/**
 * Sign in, or create an account and save its recovery code (#1262).
 *
 * The recovery code is the single most sensitive value this app ever holds, and it exists ONLY in
 * this component's `code` state for the life of the dialog. It is never written to
 * `localStorage`, `sessionStorage` or IndexedDB, never placed in the URL, never logged, never put
 * in an error message and never parked in a `data-*` or `title` attribute — the text node that
 * displays it and the Blob the Download button builds are the only two places it appears, and the
 * Blob URL is revoked immediately. Clearing it on Finish and on close is part of that contract,
 * not tidiness.
 *
 * Creating an account is two steps that must not come apart: the register ceremony, then the
 * recovery enrolment. Closing the dialog between them leaves a real, signed-in but UNPROTECTED
 * account — so the header says so and reopens here, and a second `recovery/enroll` issues a
 * replacement code (the server replaces any live unconfirmed row, so the abandoned code stops
 * working; showing a stale code again would be a lie about what still opens the account).
 */

/** `'recovery'` resumes an abandoned enrolment; `'signIn'` opens at the entry choice. */
export type AccountDialogMode = 'signIn' | 'recovery';

interface SignInDialogProps {
    /** Owned by the shell, which drives `showModal()`/`close()` from its own state. */
    dialogRef: RefObject<HTMLDialogElement | null>;
    mode: AccountDialogMode;
    open: boolean;
    onClose: () => void;
    /** Re-read the session (and recovery status) after a ceremony changes it. */
    onAccountChanged: () => void;
}

export function SignInDialog({
    dialogRef,
    mode,
    open,
    onClose,
    onAccountChanged,
}: SignInDialogProps) {
    const [code, setCode] = useState('');
    const [savedCode, setSavedCode] = useState(false);
    const [busy, setBusy] = useState(false);
    const [failure, setFailure] = useState<AccountFailure | null>(null);
    const [copyHint, setCopyHint] = useState('');
    // Resolved after mount: `browserSupportsWebAuthn()` reads `window`, which the static export's
    // prerender does not have.
    const [supported, setSupported] = useState(true);
    useEffect(() => {
        setSupported(passkeysSupported());
    }, []);

    /**
     * The recovery-code step replaces whatever was focused (usually the Create-account button,
     * which unmounts), so focus would otherwise fall back to `<body>` — outside the dialog and
     * silent for a screen reader. Move it to the step's own heading the moment the code appears.
     */
    const codeHeadingRef = useRef<HTMLHeadingElement>(null);
    useEffect(() => {
        if (code !== '') {
            codeHeadingRef.current?.focus();
        }
    }, [code]);

    /**
     * Every await below outlives a possible close — a passkey prompt is a human pressing a
     * fingerprint reader — so each one re-checks this before writing state. Without it, a code
     * that arrived after the dialog closed would sit in state past the reset below and be shown
     * again on the next open, which is exactly what "only for the life of the dialog" forbids.
     */
    const openRef = useRef(false);

    /**
     * Ask the server for a recovery code. Also the retry path: the enrolment may need a step-up
     * passkey prompt (the original session stops being "fresh" after 10 minutes), which someone
     * can dismiss, and a dead end with no way to try again would leave the account unprotected.
     */
    const beginRecovery = useCallback(async () => {
        setFailure(null);
        setBusy(true);
        const outcome = await enrollRecoveryCode(accountApi);
        if (!openRef.current) {
            return;
        }
        setBusy(false);
        if (outcome.ok) {
            setCode(outcome.value);
        } else if (outcome.failure.kind !== 'cancelled') {
            setFailure(outcome.failure);
        }
    }, []);

    useEffect(() => {
        openRef.current = open;
        if (!open) {
            // Drop the code the moment the dialog closes, whatever closed it.
            setCode('');
            setSavedCode(false);
            setBusy(false);
            setFailure(null);
            setCopyHint('');
        }
        // Opening in recovery mode used to fire `beginRecovery()` automatically here. That DELETEs
        // the live recovery row server-side and spends one of the 5 `recovery/enroll` calls per 10
        // minutes on every open — five open/close cycles (a curious click, a slow double-tap) locks
        // the account out of getting a code for 10 minutes with nothing to show for it. The
        // "Get a code" button below is the only thing allowed to spend that budget now.
    }, [open]);

    async function runCreate() {
        setFailure(null);
        setBusy(true);
        const created = await createAccount(accountApi);
        if (!created.ok) {
            if (openRef.current) {
                setBusy(false);
                if (created.failure.kind !== 'cancelled') {
                    setFailure(created.failure);
                }
            }
            return;
        }
        // Tell the shell immediately: the account exists now, even if the recovery step below
        // fails or is abandoned, and the header must not claim otherwise.
        onAccountChanged();
        // Registration mints a freshly-authenticated session, so this needs no second prompt.
        const enrolled = await enrollRecoveryCode(accountApi);
        if (!openRef.current) {
            return;
        }
        setBusy(false);
        if (!enrolled.ok) {
            if (enrolled.failure.kind !== 'cancelled') {
                setFailure(enrolled.failure);
            }
            return;
        }
        setCode(enrolled.value);
    }

    async function runSignIn() {
        setFailure(null);
        setBusy(true);
        const result = await signIn(accountApi);
        if (!openRef.current) {
            return;
        }
        setBusy(false);
        if (!result.ok) {
            if (result.failure.kind !== 'cancelled') {
                setFailure(result.failure);
            }
            return;
        }
        onAccountChanged();
        onClose();
    }

    async function finish() {
        setFailure(null);
        setBusy(true);
        const result = await confirmRecoveryCode(accountApi, code);
        if (!openRef.current) {
            return;
        }
        setBusy(false);
        if (!result.ok) {
            if (result.failure.kind !== 'cancelled') {
                setFailure(result.failure);
            }
            return;
        }
        setCode('');
        onAccountChanged();
        onClose();
    }

    async function copyCode() {
        setCopyHint('');
        try {
            await navigator.clipboard.writeText(code);
            setCopyHint('Copied.');
        } catch {
            // No clipboard permission (the Playwright WebKit project, a locked-down profile):
            // say so instead of failing silently. The code is already selectable in one click.
            setCopyHint('Copy isn’t available here — select the code above and copy it by hand.');
        }
    }

    function downloadCode() {
        // A Blob URL is the only way to hand over a file, and it is revoked on the next tick —
        // it is never navigated to, so the code never appears in the address bar or history.
        const note = `${code}\n\nEnsemble recovery code — the only way back into your account if you lose your passkey. Keep it somewhere safe and private.\n`;
        const url = URL.createObjectURL(new Blob([note], { type: 'text/plain;charset=utf-8' }));
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = 'ensemble-recovery-code.txt';
        anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    return (
        <dialog
            ref={dialogRef}
            className="modal-box account-dialog"
            aria-labelledby="account-dialog-title"
            onCancel={onClose}
            onClose={onClose}
        >
            {!supported ? (
                <>
                    <h2 id="account-dialog-title">Passkeys aren’t available here.</h2>
                    <p>
                        This browser can’t create or use a passkey, so there’s no way to set up an
                        account on it. Nothing else changes: the music stand plays, your songbook
                        stays on this device, and you can export any chart to a file and open it
                        somewhere else.
                    </p>
                    <div className="dialog-actions">
                        <button className="btn" onClick={onClose}>
                            Close
                        </button>
                    </div>
                </>
            ) : code !== '' ? (
                <>
                    <h2 id="account-dialog-title" ref={codeHeadingRef} tabIndex={-1}>
                        Save your recovery code.
                    </h2>
                    <p>
                        You’re signed in. This code is shown once and never again — it’s the only
                        way back into your account if you lose your passkey. Copy it or download it,
                        then keep it somewhere safe and offline.
                    </p>
                    <p className="recovery-code" data-testid="recovery-code">
                        {code}
                    </p>
                    <div className="dialog-actions">
                        <button className="btn" onClick={() => void copyCode()}>
                            Copy
                        </button>
                        <button className="btn" onClick={downloadCode}>
                            Download
                        </button>
                    </div>
                    {copyHint !== '' && <p className="status-detail">{copyHint}</p>}
                    {renderFailure(failure)}
                    <label className="recovery-confirm">
                        <input
                            type="checkbox"
                            checked={savedCode}
                            data-testid="recovery-saved"
                            onChange={(event) => setSavedCode(event.currentTarget.checked)}
                        />
                        I’ve saved this code somewhere safe
                    </label>
                    <div className="dialog-actions">
                        <button
                            className="btn primary"
                            data-testid="recovery-finish"
                            disabled={!savedCode || busy}
                            onClick={() => void finish()}
                        >
                            Finish
                        </button>
                        <button
                            className="btn"
                            data-testid="recovery-not-now"
                            disabled={busy}
                            onClick={onClose}
                        >
                            Not now
                        </button>
                    </div>
                    <p className="status-detail">
                        There’s no email reset and no support override. Lose every passkey and this
                        code, and the account can’t be recovered — songs already on this device stay
                        exportable either way. Adding a second passkey later is the cheapest
                        insurance.
                    </p>
                </>
            ) : mode === 'recovery' ? (
                <>
                    <h2 id="account-dialog-title">Finish protecting your account.</h2>
                    <p>
                        {busy
                            ? 'Getting a new recovery code…'
                            : 'Your account has no recovery code yet.'}
                    </p>
                    {renderFailure(failure)}
                    <div className="dialog-actions">
                        <button
                            className="btn primary"
                            data-testid="recovery-retry"
                            disabled={busy}
                            onClick={() => void beginRecovery()}
                        >
                            Get a code
                        </button>
                        <button className="btn" onClick={onClose}>
                            Not now
                        </button>
                    </div>
                </>
            ) : (
                <>
                    <h2 id="account-dialog-title">Take your songbook with you.</h2>
                    <p>
                        An account is a passkey — your device’s fingerprint, face or PIN. There’s no
                        password and no email address, which also means there’s nothing to reset:
                        you keep a recovery code instead, and we’ll set that up right after you
                        create the account.
                    </p>
                    <div className="dialog-actions">
                        <button
                            className="btn primary"
                            data-testid="account-do-sign-in"
                            disabled={busy}
                            onClick={() => void runSignIn()}
                        >
                            Sign in
                        </button>
                        <button
                            className="btn"
                            data-testid="account-create"
                            disabled={busy}
                            onClick={() => void runCreate()}
                        >
                            Create account
                        </button>
                        <button className="btn" onClick={onClose}>
                            Close
                        </button>
                    </div>
                    {renderFailure(failure)}
                    <p className="status-detail">
                        Signing in is optional. The songbook on this device works without an
                        account, and every chart exports to a file.
                    </p>
                </>
            )}
        </dialog>
    );
}

/**
 * A `notice` is an expected answer, not a fault — `registration_closed` is what the server says
 * while sign-ups are closed by policy or the account cap is full — so it gets calm styling and
 * `role="status"`, never the error treatment.
 */
function renderFailure(failure: AccountFailure | null) {
    if (failure === null || failure.kind === 'cancelled') {
        return null;
    }
    return failure.kind === 'notice' ? (
        <p className="account-notice" role="status" data-testid="account-notice">
            {failure.message}
        </p>
    ) : (
        <p className="account-error" role="alert" data-testid="account-error">
            {failure.message}
        </p>
    );
}
