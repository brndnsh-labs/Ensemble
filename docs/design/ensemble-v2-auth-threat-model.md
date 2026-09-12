# Ensemble v2 authentication threat model

Issue [#1192](https://github.com/brndnsh-labs/Ensemble/issues/1192), stage 2 of the
[account/sync contract](ensemble-v2-sync.md). This document describes the standalone
`prototypes/v2-api/` implementation on disposable data. It does not authorize deployment,
production migration, a real account launch, or stage-3 work while the exit gate remains open.

## Trust boundaries and ownership

The browser, request body, query, cookies and forwarding headers are untrusted. A signed WebAuthn
assertion establishes possession; an opaque session token authorizes subsequent requests only
after a live server lookup. Account and credential IDs are identifiers, not authorization.
Every account-scoped query must include the authenticated owner in the query itself. Stage 3
must expose owner-required query functions (`getDocument(ownerId, documentId)`), never a bare
read-by-document-ID function for a route to accidentally use without its owner check. SQLite
has no row-level security: this is a mandatory review convention, not an enforced type-system
proof. Auth's global credential lookup during usernameless login is a deliberate exception
followed by signature verification; it is not a pattern for private document APIs.

There is no admin surface. Future admin authorization must read current account privileges on
each request, never trust a cookie claim or cache that authority in a session. Guest playback
and local songs remain independent of this service. API responses are private/no-store; the
static offline shell must never cache them. The current prototype has no cloud-song endpoints.

## Credentials, replay, origin and RP binding

All registration/assertion paths explicitly verify the expected challenge, canonical origin,
exact RP ID and user verification. Configuration requires RP ID to equal the origin hostname;
parent-domain relaxation is deliberately unavailable. The ES256 software-authenticator tests
exercise the real SimpleWebAuthn verifier with wrong origin, wrong RP, missing UV and invalid
signature inputs. Credential private keys never reach the service. Stored public keys cannot
create an assertion; theft of the database still exposes account metadata and credentials' IDs.
Synced passkeys with zero counters are legitimate; positive counters must advance through an
atomic conditional update. A stolen authenticator or compromised platform account may still
produce valid assertions. Counter checks cannot reliably detect every synced-key compromise.

Credential-not-found and user-handle mismatch fail before signature verification. The HTTP
reason is collapsed, but timing could reveal that an already-known credential ID exists. This
gap is unmeasured and low impact (credential IDs are not secrets); do not describe identical
response bodies as constant-time verification or claim a measured exploit.

An RP-ID change strands existing credentials: their keys are scoped to the original RP ID and
cannot simply be reassigned in SQL. A future domain move needs an explicit re-enrollment and
recovery plan while the old origin remains available. Test and production RP IDs stay separate.

Challenges are random, expire after five minutes, bind a hashed random ceremony cookie, and are
claimed using a single `DELETE ... RETURNING` before asynchronous verification. A claimed
challenge cannot be replayed even when verification fails. Add-passkey/reauth/recovery enrollment
also bind both account and initiating session. Bounded malformed HTTP input is rejected before
claiming the challenge; verify responses still clear the browser ceremony cookie. Retrying a
valid request with an explicitly retained original token proves the DB challenge was untouched.

## Sessions and privilege escalation

Sessions are random 32-byte tokens stored only as SHA-256 hashes, with absolute 30-day expiry,
owner-scoped revocation and a zero-write successful lookup. Cookies are HttpOnly, SameSite=Strict,
Path=/ and, over HTTPS, Secure with `__Host-` names. Unsafe API requests must pass same-origin
Origin/Referer and Fetch Metadata checks and JSON-only body handling. Successful authentication
revokes a presented prior session and issues a fresh token, including when switching owners.
Same-origin XSS and a stolen live session remain powerful; HttpOnly does not prevent an injected
script from making authenticated requests. No arbitrary library exception reaches a response.

Add/revoke passkey and recovery-material changes require the shared ten-minute freshness
predicate backed by a passkey-created live session, rechecked inside the commit transaction.
Adding a passkey alone does not refresh that window. Revoking a credential revokes all sessions
it created in the same transaction. The last passkey cannot be removed without confirmed,
unconsumed recovery material. Unknown and foreign credential revocation have identical responses.
At most 32 passkeys can be enrolled; add options and the commit both check that bound, retaining
the already-registered same-account no-op. It bounds passkey-list and WebAuthn allow/exclude
arrays while leaving ample room for multiple authenticators.

**Borrowed-session residual:** within ten minutes of the owner's login, another person using
that session can add a passkey, log in with it and revoke the owner's credentials. The approved
freshness policy is unchanged. A cooling-off rule that prevents a new credential revoking older
ones could reduce that path, but requires an explicit product decision about emergency device
replacement and legitimate second-passkey setup. Requiring an extra step-up only at add would
add prompts and still depends on the owner's authenticator enforcing a fresh biometric/PIN.
Security events now record enrollment/revocation; there is no account-event UI or notification
channel yet, so this is forensic evidence, not a real-time takeover prevention control.

## Recovery and permanent lockout

Recovery codes are high-entropy, single-use bearer secrets stored only as hashes. Enroll returns
the raw code once; confirm proves possession before it counts as recovery material. Enrollment
can be retried after an interrupted download, replacing the still-live code. A code claim is
atomic and grants only a ten-minute recovery-purpose session, accepted exclusively at the two
recovery-enroll-passkey routes. It cannot read standard session/account data, revoke sessions,
mint a replacement recovery code, or access future private charts. Standard route guards must
continue enforcing purpose when stage 3 adds endpoints.

Recovery completion atomically consumes the code, revokes all account sessions, replaces old
credentials with the new verified passkey and ends recovery-only authority. Failure rolls back
consumption. A claim abandoned before enrollment becomes reclaimable after the restricted
session expires; concurrent claims cannot both win. Successful recovery creates a fresh standard
session so the client can immediately enroll/confirm a replacement code. UI delivery/retry and
physical-device acceptance remain future stages. A stolen code permits replacing all passkeys;
an attacker with the code may also keep claiming it to delay the owner. Rate limiting reduces
guessing but cannot restore exclusive possession of a compromised bearer secret.

No email reset, password reset, username-based operator override, or social account recovery
exists. Losing all usable passkeys and the confirmed recovery code permanently loses cloud
account access. A retained local chart remains exportable but is not proof of account ownership.
The product must explain this tradeoff and recommend a second passkey and offline code storage.

## Input bounds and abuse controls

`src/http/auth-policy.ts` is the exhaustive route-policy registry. Its drift test compares real
Hono routes against the registry. Every route has its own sliding-window limit and allowlisted
body shape. Unknown fields (including client owner IDs), unexpected query parameters, malformed
JSON, oversized scalar strings and excessive collection counts are rejected before ceremony
logic. Whole bodies are capped at 64 KiB; real-socket tests cover chunked overflow and malformed
framing. WebAuthn IDs are bounded to 2,048 characters, client data to 8,192, attestation objects
to 48 KiB, transports to eight, and extension objects to sixteen fields/items per level and four
levels. Extensions are not authorization inputs. Legitimate real-verifier ceremonies continue
through the same boundary. Future requested extensions must be reviewed against these bounds.

| Endpoint group | Independent per-route caller budget |
| --- | --- |
| Registration options / verify | 10 / 20 per ten minutes |
| Login options / verify | 30 each per minute |
| Session read / logout / revoke-others | 120 / 30 / 10 per minute |
| Passkey list / options / verify / revoke | 60 / 10 / 20 / 10 per minute |
| Reauth options / verify | 20 each per minute |
| Recovery status | 60 per minute |
| Recovery enroll / confirm / claim | 5 / 10 / 10 per ten minutes |
| Recovery passkey options / verify | 10 / 20 per ten minutes |

Registration/login options can grow anonymous challenge rows; limiting those endpoints bounds
the rate per caller, while opportunistic expiry sweeps bound lifetime. Each limiter retains at
most 10,000 independent identity buckets plus one shared overflow bucket. It never evicts a live
attacker bucket to reset its allowance. Overflow deliberately reduces availability for new
callers until expiry; NAT users share a budget. Botnets and IPv6 address churn still distribute
allowances, so an edge-level resource limit and operational monitoring remain necessary before
public launch. Anonymous account/session creation can grow persistent data over time: per-IP
rate limiting does not constitute a total storage quota or a registration-abuse solution.

## Client-IP privacy and empirical proxy evidence

Rate-limit maps receive only a domain-separated HMAC-SHA256 digest of a canonical IP address.
Raw addresses are used transiently for configured peer trust and normalization, never retained
as caller keys, stored in API audit rows, or written to application logs. Equivalent IPv6 and
IPv4-mapped forms share a key; invalid/missing identity shares a fail-closed unknown bucket.
`server.ts` requires `ENSEMBLE_AUTH_IP_SECRET` (at least 32 bytes, generated randomly by the
operator) before opening a database. Factory-only test apps may generate an ephemeral secret.
Secrets must stay out of source/logs; changing the secret or restarting resets in-memory limits.

Proxy mode requires both `ENSEMBLE_AUTH_IP_HEADER` and comma-separated exact
`ENSEMBLE_AUTH_TRUSTED_PROXY_ADDRESSES`. It trusts that header only from a configured immediate
socket peer. No Cloudflare/XFF/header precedence is chosen by default. This is necessary but
insufficient: the trusted proxy must overwrite the chosen header using a verified upstream
identity, including on direct-origin requests. Config validation is not proof of that behavior.

Read-only probes by the integration owner on 2026-09-12 examined the actual test front door:

- Caddy v2.11.3 trusts the published Cloudflare IPv4 CIDRs, with no `client_ip_headers` override
  and no `trusted_proxies_strict`. The test backend is currently static nginx; no API route or
  account service exists, so the future API socket peer cannot yet be measured.
- Two public GETs to `/v2/build.json`, one normal and one with a synthetic X-Forwarded-For value,
  both returned 200. The logged Cf-Connecting-Ip stayed identical; attacker XFF survived, and
  Caddy's derived `request.client_ip` matched CF only on the ordinary request. XFF first-hop and
  the current Caddy-derived client IP are therefore unsuitable identity authorities.
- Injecting a synthetic CF-Connecting-IP through the public edge returned 403 before Caddy.
  This does not prove header overwrite at the origin. A direct-origin request to the same static
  route returned 200 and preserved its synthetic CF-Connecting-IP. **Trusting that header merely
  because the API socket peer is Caddy would allow direct-origin spoofing today.**

The recommended future **API-scoped** route should accept only immediate Cloudflare peers
(current IPv4 and IPv6 lists), overwrite a dedicated `X-Ensemble-Client-IP` from the verified
CF-Connecting-IP, and reject direct non-Cloudflare API requests. The API then trusts that header
only from measured exact Caddy socket addresses. If LAN access is intentionally allowed, the
route must instead overwrite the canonical header from the real remote socket for non-CF peers.
This is a deployment recommendation, not a deployed control. The existing static route was not
changed. A future receipt must prove the actual API hop, XFF/custom-header spoof resistance,
direct-origin rejection/canonicalization and distinct legitimate callers' independent buckets.

**Stage-exit gap:** the real chain is empirically assessed and demonstrably not ready to provide
a trustworthy API identity. Operator-scoped route configuration and actual API socket probes
remain required. Neither passing unit tests nor merely selecting `cf-connecting-ip` closes it.

## Audit privacy, retention and account deletion

Migration `0006` adds a metadata-only audit table because #1190's enrollment/revocation events
previously had no storage destination. It runs only on disposable databases in this work.
Rows contain an event, time, verified account/credential IDs where available, and failure name,
code, short description and cause **from a fixed allowlist**. Arbitrary thrown Error messages,
causes and stacks can contain secrets even after truncation, so none are serialized. No payload,
WebAuthn response, public/private key, recovery code, session/ceremony token, IP, URL/query or
chart contents are recorded. Failed requests are not attributed to unverified owner/body IDs.
Credential IDs are identifying metadata, not key material, and are stored only for verified
events. Passkey-added, passkey-revoked, credential-related session revocation, logout/rotation,
other-session revocation and completed recovery events are recorded after successful operations.

Audit insertion and pruning are best-effort and swallowed; a failed audit write never changes
an already handled failure or committed success. Rows are pruned on writes after 30 days and
capped at 10,000 rows. This bounds data growth but permits hostile failure traffic to displace
older useful events and adds database work on denial traffic. It is not tamper-evident or a
guaranteed incident record. Upstream Caddy/Cloudflare logs have their own privacy/retention
policy; the absence of raw IPs in this API's audit does not mean the proxy logs lack them.

`src/db/account-deletion-registry.ts` classifies every table, including global ones so naming a
future owner column differently cannot evade the drift guard. Future deletion must wipe audit
events, challenges, sessions, recovery codes, credentials, then accounts in one transaction.
Challenges have no FK; sessions have no account cascade; credential/recovery references use
SET NULL. Relying on cascades would omit or orphan data. Only global `_migrations` checksums are
retained, with an explicit reason. No deletion endpoint is implemented here. Future backup
retention and device-local export safeguards require their separate launch/deletion work.

## Single-process and concurrency assumptions

One Node process owns one SQLite database; synchronous `DatabaseSync` transaction callbacks
contain no `await`. Atomic challenge/recovery claim statements and conditional counter updates
remain the authoritative guards. The deferred `BEGIN` helper can encounter
`SQLITE_BUSY_SNAPSHOT` on a read-to-write upgrade under multiple writers in WAL mode; this was
not reproduced and fails closed. Process-local rate limits instead silently multiply with each
instance. Before scaling, design a shared atomic limiter, audit capacity/retention, explicit
transaction-locking/retry semantics and multi-process race tests together. Do not independently
add replicas or change the shared transaction helper as an incidental optimization.

## Stage-2 exit receipt and independent review

| Contract requirement | Evidence / current disposition |
| --- | --- |
| Register/login/add/revoke passkeys on disposable data | Real verifier API/auth suites, temporary on-disk WAL SQLite databases; no UI wiring or deployed account service. |
| Hashed, revocable sessions | Session/full-flow tests cover token hashing, expiry, owner-scoped revocation, cookie flags and fixation defense. |
| Recovery-only enrollment | Recovery auth/HTTP suites prove purpose refusal on standard routes and successful replacement enrollment. |
| Reject wrong origin/RP and missing UV | Real software-authenticator registration/login/reauth/passkey/recovery cases exercise the actual verifier. |
| Reject cross-account ceremonies and expired/replayed challenges | Existing auth/session tests plus HTTP concurrent verification and unchanged malformed-challenge state tests. |
| Concurrent recovery claims; interruption preserves sole recovery route | Recovery suite proves one successful claim, expiry retry, transaction rollback and no premature consume. |
| Bounded endpoint payloads/counts and real limiter blocks | `test/http/auth-hardening.test.ts` covers every registered route, collection/scalar bounds, independent thresholds and commit-time credential cap; real socket body tests retained. |
| Private audit and deletion coverage | Sentinel-secret and deliberately failed SQLite audit-write tests; schema drift test adds an unclassified owner table and proves rejection. |
| Real proxy identity verified safe | **Unmet:** live static-chain probes expose direct-origin CF spoofing; no actual API hop exists yet. Required operator work is specified above. |
| Implementation choices and independent threat-model review complete | Code choices documented; independent correctness/security review and final gate results must be recorded by the integration owner on #1192/its PR. This author does not self-approve the review. |

This receipt intentionally leaves stage 2 open. Stage 3 must not start until the unresolved
identity proof and independent review are satisfied and the integration owner records the
actual checked revision and gates. Physical passkey/device acceptance, backup/restore and public
rollout remain later stages even after the stage-2 implementation gates pass.

The local `test/http/client-identity.socket.test.ts` also drives a real Node/Hono listener past
the recovery threshold while changing XFF, then proves a second configured client-header identity
has an independent bucket. It proves adapter/socket wiring on loopback, not the absent deployed
API/Caddy route described above.
