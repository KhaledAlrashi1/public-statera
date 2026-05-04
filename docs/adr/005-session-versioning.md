# ADR 005: Session Versioning Instead of Token Blacklists

- Status: Accepted
- Date: 2026-03-06

## Context

The application uses cookie-based Flask sessions with Flask-Login. Certain
security actions need to invalidate previously issued sessions across devices:

- revoke all sessions
- password reset
- password change
- email-change and password-change confirmation flows

The current design stores `session_version` on `users`, writes that version into
the authenticated session as `session["sv"]`, and checks it on every request in
`backend/__init__.py`. Security-sensitive flows call
`bump_session_version(...)` to invalidate older sessions.

The main alternative considered was maintaining a blacklist or revocation store
for individual session or token identifiers.

## Decision

We use per-user session versioning as the primary global session invalidation
mechanism.

When a user signs in, the session captures the current `session_version`. When a
security event requires broad revocation, the application increments the user's
stored version. Any request carrying an older session version is logged out and,
for protected routes, rejected with `SESSION_REVOKED`.

We do not maintain a general-purpose blacklist of revoked session identifiers.

## Consequences

Positive:

- "log out everywhere" is a single row update plus normal request enforcement
- password and account-security events can revoke all older sessions uniformly
- the mechanism works with server-side validation and without a growing
  blacklist table
- operational cleanup is simpler than per-token revocation tracking

Tradeoffs:

- revocation happens on the next request, not via push
- the mechanism is coarse-grained; it revokes all old sessions for a user, not
  one arbitrary device unless the current session is preserved explicitly
- flows that should preserve the active session must opt in with
  `update_current_session=True`

This is the right fit for the current cookie-session architecture. If the
project later introduces long-lived external API tokens or device-scoped session
management, those may require an additional token registry on top of the
session-version baseline.
