/**
 * The app's single `AccountApi` and `AccountSession` instances (#1262).
 *
 * One session store per document, not per component: the header indicator and the sign-in dialog
 * must agree, and `useSyncExternalStore` needs a stable `subscribe`/`getSnapshot` pair, which a
 * per-render `createAccountSession()` would not provide.
 *
 * Constructing these is inert — no request, no storage access, no timer — so importing this
 * module cannot change guest startup. The dark-launch flag (`feature.ts`) gates every CALL:
 * a device that has not opted in never reaches `refresh()` or any ceremony, and therefore never
 * issues an `/api/*` request at all.
 */

import { createAccountApi } from './api';
import { type AccountSession, createAccountSession } from './session';

export const accountApi = createAccountApi();

export const accountSession: AccountSession = createAccountSession(accountApi);
