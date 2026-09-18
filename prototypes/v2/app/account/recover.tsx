'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { accountApi } from '../../lib/account/client';
import type { AccountFailure } from '../../lib/account/messages';
import {
    claimRecoveryCode,
    confirmRecoveryCode,
    enrollRecoveryCode,
    enrollRecoveryPasskey,
} from '../../lib/account/passkeys';
import { AccountFailureNotice } from './account-failure';
import { RecoveryCodeStep } from './recovery-code-step';

/**
 * Recovering an account with its recovery code (#1263) — the contents of the sign-in dialog, not
 * a dialog of its own, so the shell keeps owning exactly one `<dialog>` and one `showModal()`.
 *
 * There is no email reset and no support override by design, so this is the ONLY way back into an
 * account whose passkey is gone. Four steps, in this order and no other:
 *
 *  1. `code`    — type the recovery code. `recovery/claim` spends it for a recovery-ONLY session:
 *                 it can enroll one passkey and nothing else. `GET /api/documents` refuses it, so
 *                 no chart is readable at any point between here and step 2 completing.
 *  2. `passkey` — the replacement passkey. The server's commit is one transaction: consume the
 *                 code, revoke every live session, delete every existing credential, insert this
 *                 one. That is why the copy below states plainly, BEFORE the ceremony, that the
 *                 old passkeys and every other signed-in device are about to stop working.
 *  3. `protect` — only reached when the replacement code could not be minted; the account exists
 *                 and is signed in, but unprotected. Same shape as `sign-in.tsx`'s recovery mode.
 *  4. `done`    — the replacement code, shown and confirmed through the SAME `RecoveryCodeStep`
 *                 the create flow uses. Abandoning it leaves the account unprotected and the
 *                 header says so, identically to #1262.
 *
 * **Retry the ceremony, never the claim.** A claim takes an exclusive 10-minute lock on the code;
 * within that window a second claim of the same code is refused by the LOCK, not because the code
 * was spent. So an aborted or refused enrolment leaves this component on step 2 with the same
 * live recovery session and a button to try again — it never sends the person back to step 1,
 * which would look like "your code stopped working" when nothing of the sort happened. The code
 * is consumed only when `enroll-passkey/verify` commits.
 *
 * The typed code is held in one piece of state, cleared the moment it is claimed, and gone with
 * this component when the dialog closes. It is never put in the URL, storage or a log — which is
 * also why the entry step is deliberately NOT a `<form>`: a form inside a `<dialog>` without
 * `method="dialog"` submits by navigating, and a GET submit would write the code into the address
 * bar. The button and the Enter key both call the same handler instead.
 */

type Step = 'code' | 'passkey' | 'protect' | 'done';

interface RecoverFlowProps {
    /** Return to the sign-in dialog's entry choice. */
    onBack: () => void;
    onClose: () => void;
    /** Re-read the session (and recovery status) once a ceremony has changed it. */
    onAccountChanged: () => void;
}

export function RecoverFlow({ onBack, onClose, onAccountChanged }: RecoverFlowProps) {
    const [step, setStep] = useState<Step>('code');
    const [typedCode, setTypedCode] = useState('');
    const [newCode, setNewCode] = useState('');
    const [busy, setBusy] = useState(false);
    const [failure, setFailure] = useState<AccountFailure | null>(null);

    /**
     * Every await below outlives a possible close — a passkey prompt is a human pressing a
     * fingerprint reader. The dialog closing unmounts this component, so re-checking before each
     * `setState` is what keeps a code that arrived late out of a detached React tree.
     */
    const alive = useRef(true);
    useEffect(() => {
        alive.current = true;
        return () => {
            alive.current = false;
        };
    }, []);

    /**
     * Every step below replaces the control that got us here — "Lost your passkey?", Continue,
     * Create passkey — so focus would fall back to `<body>`, outside the dialog and silent for a
     * screen reader. Move it to the new step's heading, which is the same thing `RecoveryCodeStep`
     * does on mount — and `'done'` is exactly that component, which owns the move itself.
     */
    const headingRef = useRef<HTMLHeadingElement>(null);
    useEffect(() => {
        if (step !== 'done') {
            headingRef.current?.focus();
        }
    }, [step]);

    /**
     * Mint the replacement code. Also the retry path from step 3: the account is already signed
     * in and unprotected at that point, and a dead end with no way to try again would leave it
     * that way.
     */
    const getReplacementCode = useCallback(async () => {
        setFailure(null);
        setBusy(true);
        const enrolled = await enrollRecoveryCode(accountApi);
        if (!alive.current) {
            return;
        }
        setBusy(false);
        if (!enrolled.ok) {
            setStep('protect');
            if (enrolled.failure.kind !== 'cancelled') {
                setFailure(enrolled.failure);
            }
            return;
        }
        setNewCode(enrolled.value);
        setStep('done');
    }, []);

    async function claim() {
        if (typedCode.trim() === '' || busy) {
            return;
        }
        setFailure(null);
        setBusy(true);
        const claimed = await claimRecoveryCode(accountApi, typedCode.trim());
        if (!alive.current) {
            return;
        }
        setBusy(false);
        if (!claimed.ok) {
            setFailure(claimed.failure);
            return;
        }
        // Spent: keep it no longer than the request that used it.
        setTypedCode('');
        setStep('passkey');
    }

    async function enrollPasskey() {
        setFailure(null);
        setBusy(true);
        const enrolled = await enrollRecoveryPasskey(accountApi);
        if (!enrolled.ok) {
            if (alive.current) {
                setBusy(false);
                // A dismissed platform prompt is an answer, not a fault — stay on this step,
                // where the button IS the retry. The recovery session still holds the claim.
                if (enrolled.failure.kind !== 'cancelled') {
                    setFailure(enrolled.failure);
                }
            }
            return;
        }
        // The account is recovered and signed in NOW, even if the replacement code below fails or
        // is abandoned; the header must not claim otherwise. Told BEFORE the liveness check on
        // purpose: a dialog dismissed while the platform prompt was open would otherwise leave a
        // recovered account reading as signed out until something else happened to refresh.
        onAccountChanged();
        if (!alive.current) {
            return;
        }
        // `enroll-passkey/verify` minted a freshly-authenticated session, so this needs no prompt.
        await getReplacementCode();
    }

    async function finish() {
        setFailure(null);
        setBusy(true);
        const confirmed = await confirmRecoveryCode(accountApi, newCode);
        if (!confirmed.ok) {
            if (alive.current) {
                setBusy(false);
                if (confirmed.failure.kind !== 'cancelled') {
                    setFailure(confirmed.failure);
                }
            }
            return;
        }
        // Same reason as above: the account is protected on the server now, so the shell is told
        // whether or not this component survived the round trip.
        setNewCode('');
        onAccountChanged();
        onClose();
    }

    if (step === 'done') {
        return (
            <RecoveryCodeStep
                heading="Save your new recovery code."
                lead="You’re signed in with your new passkey, and the code you just used is spent. This replacement is shown once and never again — it’s the only way back in if you lose this passkey too. Copy it or download it, then keep it somewhere safe and offline."
                code={newCode}
                busy={busy}
                failure={failure}
                onFinish={() => void finish()}
                onClose={onClose}
            />
        );
    }

    if (step === 'protect') {
        return (
            <>
                <h2 id="account-dialog-title" ref={headingRef} tabIndex={-1}>
                    Finish protecting your account.
                </h2>
                <p>
                    {busy
                        ? 'Getting a new recovery code…'
                        : 'You’re back in with your new passkey, but this account has no recovery code yet.'}
                </p>
                <AccountFailureNotice failure={failure} />
                <div className="dialog-actions">
                    <button
                        className="btn primary"
                        data-testid="recovery-retry"
                        disabled={busy}
                        onClick={() => void getReplacementCode()}
                    >
                        Get a code
                    </button>
                    <button className="btn" disabled={busy} onClick={onClose}>
                        Not now
                    </button>
                </div>
            </>
        );
    }

    if (step === 'passkey') {
        return (
            <>
                <h2 id="account-dialog-title" ref={headingRef} tabIndex={-1}>
                    Create a new passkey.
                </h2>
                <p>
                    That code checked out. Create a passkey on this device to finish getting back
                    in. Nothing has changed on the account yet — you can still stop here.
                </p>
                <p>
                    The moment the new passkey is saved, every passkey that was on this account
                    stops working and every other device is signed out. That’s the point of
                    recovery: whatever happened to the old passkey, it can’t open this account
                    afterwards.
                </p>
                <AccountFailureNotice failure={failure} />
                <div className="dialog-actions">
                    <button
                        className="btn primary"
                        data-testid="recovery-new-passkey"
                        disabled={busy}
                        onClick={() => void enrollPasskey()}
                    >
                        Create passkey
                    </button>
                    <button className="btn" disabled={busy} onClick={onClose}>
                        Not now
                    </button>
                </div>
                <p className="status-detail">
                    If the passkey prompt is dismissed or refused, press Create passkey again — your
                    recovery code is still good and is only spent once a new passkey is saved. It
                    stays claimed for ten minutes; after that, start again with the same code.
                </p>
            </>
        );
    }

    return (
        <>
            <h2 id="account-dialog-title" ref={headingRef} tabIndex={-1}>
                Use your recovery code.
            </h2>
            <p>
                This is the code you saved when you set the account up — 43 characters, no spaces.
                There’s no email reset and no support override, so it’s the only way back in when a
                passkey is gone.
            </p>
            <label className="recovery-entry">
                Recovery code
                <input
                    type="text"
                    value={typedCode}
                    data-testid="recovery-code-input"
                    autoComplete="off"
                    autoCapitalize="off"
                    autoCorrect="off"
                    spellCheck={false}
                    disabled={busy}
                    onChange={(event) => setTypedCode(event.currentTarget.value)}
                    onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                            // Not a form submit: see this module's note on keeping the code out
                            // of the address bar.
                            event.preventDefault();
                            void claim();
                        }
                    }}
                />
            </label>
            <AccountFailureNotice failure={failure} />
            <div className="dialog-actions">
                <button
                    className="btn primary"
                    data-testid="recovery-claim"
                    disabled={busy || typedCode.trim() === ''}
                    onClick={() => void claim()}
                >
                    Continue
                </button>
                <button
                    className="btn"
                    data-testid="recovery-back"
                    disabled={busy}
                    onClick={onBack}
                >
                    Back
                </button>
            </div>
            <p className="status-detail">
                Recovering replaces the passkeys on this account: the old ones stop working and
                every other signed-in device is signed out. You’ll get a fresh recovery code at the
                end.
            </p>
        </>
    );
}
