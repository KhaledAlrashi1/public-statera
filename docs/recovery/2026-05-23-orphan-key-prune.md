# Recovery — orphan operator pubkey prune (2026-05-23 PM)

Companion to the 2026-05-23 8d operational-pass completion. The orphan
pre-rotation operator pubkey on production `/home/deploy/.ssh/authorized_keys`
line 1 was deferred three sessions (2026-05-22 rotation, 2026-05-23 AM 8d
close-out, and the gate before this work). Pruned this session before 8e begins.

## What changed

- **Server `/home/deploy/.ssh/authorized_keys`**: 3 lines → 2 lines. Removed:
  pre-rotation operator pubkey, fingerprint
  `SHA256:VkHYe2dEjGB2MrvGuQZ91ihWzBIJ/Hi7V7Rwg5I3uxo`, no comment. Retained:
  operator v2 (line 1) and CI deploy entry with
  `command="bash /home/deploy/statera/deploy/deploy-bootstrap.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty`
  (line 2).
- **Server backup**: `~/.ssh/authorized_keys.bak.1779566412` (dated this session)
  created before the edit. Retained pending the backup-audit open item.
- **Laptop `~/.ssh/`**: pre-rotation keypair (`id_ed25519_statera` and
  `id_ed25519_statera.pub`) deleted. Only `_v2` keypair remains.
- **Laptop `~/.ssh/config`**: unchanged. Already pointed only at `_v2` from the
  2026-05-22 rotation work.

## Procedure used

Followed the protocol established in
`docs/recovery/2026-05-22-8d-operational-pass.md`:

1. Escape-hatch SSH session opened to `statera-prod`, left idle.
2. `cp authorized_keys authorized_keys.bak.$(date +%s)` in a second SSH session
   as `deploy`.
3. Pre-state verification: `wc -l` returned 3; `ssh-keygen -l -f` confirmed three
   fingerprints in expected order. Line 1 matched `SHA256:VkHYe2dE...` per
   CLAUDE.md.
4. `sed -i '1d' ~/.ssh/authorized_keys` — line-scoped delete.
5. Post-state verification: `wc -l` returned 2; `ssh-keygen -l -f` showed
   operator v2 + CI deploy in that order; `cat` confirmed the `command=`
   restriction on line 2 was intact.
6. From a fresh laptop terminal: `ssh statera-prod 'whoami'` returned `deploy`.
   New handshake against the 2-line file succeeded.
7. Escape hatch closed.
8. Laptop-side: `rm ~/.ssh/id_ed25519_statera ~/.ssh/id_ed25519_statera.pub`.

No errors, no rollback needed.

## Open items carried forward

- **Backup file audit**: `~/.ssh/authorized_keys.bak.*` on production now contains
  three timestamped backups from prior operational sessions plus this one. Each is
  a historical snapshot of `authorized_keys` content. Audit before final public
  release: inspect each, confirm no surprising entries, decide on a retention
  policy or move them out of `.ssh/`.

## Next session opens with

8e — TLS + reverse proxy. No remaining blockers from 8d. Caddyfile pre-decisions
in CLAUDE.md "Apex architecture (8e, Option B)".
