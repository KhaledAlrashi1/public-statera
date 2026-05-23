# CI/CD setup reference (Module 8d)

The deploy pipeline uses GitHub Actions. Three jobs run sequentially on every push to `main`:
`test → build-push → deploy`. Manual deploys and rollbacks use `workflow_dispatch`.

---

## One-time setup

### §1 — Generate the CI deploy key

This key is separate from the operator's personal SSH key. Generate it locally, outside the repo.

```bash
ssh-keygen -t ed25519 -C "statera-ci-deploy" -f ~/.ssh/statera_ci_deploy -N ""
# Public key:  ~/.ssh/statera_ci_deploy.pub
# Private key: ~/.ssh/statera_ci_deploy
```

The private key is stored in GitHub Actions secrets. Keep it out of the repo and out of 1Password
(it has no passphrase; its security comes from its restricted authorized_keys entry and scope).

### §2 — Add the public key to the server with restrictions

SSH to the server as the deploy user and add the CI public key to `~/.ssh/authorized_keys`:

```
command="/home/deploy/statera/deploy/deploy.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty ssh-ed25519 AAAA... statera-ci-deploy
```

All four restrictions in one `authorized_keys` line:

| Option | Effect |
|--------|--------|
| `command=...` | Forced command — CI key can only run `deploy.sh`; no arbitrary shell access |
| `no-port-forwarding` | Disable TCP forwarding |
| `no-X11-forwarding` | Disable X11 forwarding |
| `no-agent-forwarding` | Disable SSH agent forwarding |
| `no-pty` | Disable pseudo-terminal allocation |

**Why no `from=` IP restriction:** GitHub Actions publishes 6549 IP ranges (~110KB combined)
from their meta API. The `authorized_keys` `from=` field cannot hold this volume, and the
ranges change without notice. The `command=` restriction is the meaningful hardening here —
a stolen CI key can only run `deploy.sh` on the server, nothing else.

**Shell command to append (replace `<pubkey>` with the output of `cat ~/.ssh/statera_ci_deploy.pub`):**

```bash
echo 'command="/home/deploy/statera/deploy/deploy.sh",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty <pubkey>' \
  >> ~/.ssh/authorized_keys
```

### §3 — Configure sshd to accept the DEPLOY_SHA env var

The CI workflow passes `GIT_SHA` to the server via SSH's `SendEnv` / `AcceptEnv` mechanism.
Add `AcceptEnv DEPLOY_SHA` to the sshd override on the server (run as root or with sudo):

```bash
echo "AcceptEnv DEPLOY_SHA" >> /etc/ssh/sshd_config.d/90-statera.conf
sshd -t && systemctl reload sshd
```

This allows the SSH client to send `DEPLOY_SHA` into the session; `deploy.sh` reads it as
`$DEPLOY_SHA`. Without this, `deploy.sh` cannot know which SHA to deploy.

Note: if this server was bootstrapped before 8d, bootstrap.sh §12 only writes the sshd override
if the file doesn't already exist, so this manual step is required on existing servers. New
servers bootstrapped after 8d include `AcceptEnv DEPLOY_SHA` automatically.

### §4 — Add GitHub Actions secrets

In the GitHub repository: Settings → Secrets and variables → Actions → New repository secret.

| Secret name | Value |
|---|---|
| `DEPLOY_HOST` | Server IP address or FQDN |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_SSH_KEY` | Contents of `~/.ssh/statera_ci_deploy` (the private key) |

### §5 — Create the `production` environment in GitHub

In the repository: Settings → Environments → New environment → name it `production`.
No required reviewers or protection rules are needed for a solo project; the environment
primarily enables the deployment audit log in GitHub's Actions tab.

### §6 — Verify the pipeline

Push a commit to `main` (or trigger `workflow_dispatch`) and watch the Actions tab. Confirm:
1. `test` passes (vitest + TypeScript check)
2. `build-push` pushes the image to GHCR
3. `deploy` SSHes to the server, checkout matches `GIT_SHA`, migrations run, health check passes

---

## Manual rollback

Trigger `workflow_dispatch` from the Actions tab, supply the previous commit SHA in the `sha`
input field. The pipeline rebuilds the old image (if not already in GHCR — build-push re-runs),
checks it out on the server, runs any pending migrations (there should be none for a rollback to
a prior commit), and deploys the old image.

If the new image's migrations introduced schema changes, rollback restores the old application
code but leaves the database at the migrated schema. This is safe if migrations are additive-only.
See CLAUDE.md standing rules for the additive migration contract.

---

## deploy.sh environment variable passing

The workflow passes `DEPLOY_SHA` to `deploy.sh` via SSH's `AcceptEnv` mechanism:

```
# CI sends (in the SSH connection):    SendEnv=DEPLOY_SHA
# Server sshd (90-statera.conf):       AcceptEnv DEPLOY_SHA
# deploy.sh reads:                     GIT_SHA="${GIT_SHA:-${DEPLOY_SHA:-}}"
```

The `command=` restriction in `authorized_keys` overrides whatever command the SSH client sends;
`deploy.sh` runs unconditionally. The `DEPLOY_SHA` env var is what carries the target SHA.

---

## Action SHA pins

SHA pins in `.github/workflows/deploy.yml` are locked to specific commits (not mutable tags).
To update a pin when a new action version is needed:

```bash
# Get the commit SHA for a tag
gh api repos/actions/checkout/git/ref/tags/v4 | jq -r '.object.sha'

# If the result is a tag object (not a commit), resolve it:
gh api repos/actions/checkout/git/tags/<sha-from-above> | jq -r '.object.sha'
```

Pin the commit SHA, add the version tag as a comment:
```yaml
- uses: actions/checkout@<commit-sha>  # v4
```

---

## Pipeline architecture notes

**Why raw SSH instead of appleboy/ssh-action:** `command=` restriction in `authorized_keys`
requires the CI key to run only `deploy.sh`. Using raw `ssh -o SendEnv=DEPLOY_SHA` is the
natural fit: one fewer third-party action, full visibility into the SSH command, and `SendEnv`
passes the SHA cleanly via the protocol's env-var mechanism.

**GIT_SHA on the server:** `deploy.sh` checks out `$GIT_SHA` exactly (not `origin/main`).
On a standard deploy, these are the same. On a rollback via `workflow_dispatch` with an old SHA,
they differ — checking out the old SHA ensures the Compose file, sops file, and Docker image
are all at the same commit. A rollback that leaves the repo at `main` while deploying an old
image against a new Compose config is not a clean rollback.

**Migration atomicity:** MySQL DDL statements (CREATE TABLE, ALTER TABLE) are not transactional —
InnoDB issues an implicit commit before each DDL. A failed migration may leave the schema
partially applied; there is no automatic rollback. If `drizzle-kit migrate` fails, `deploy.sh`
aborts (§4 exits non-zero; `set -euo pipefail` propagates it) and the old application continues
serving. The schema may need manual inspection before retrying.

**migrate service image:** The `migrate` service in `docker-compose.prod.yml` uses the same
image as `api` and `worker` (`${REGISTRY}:${GIT_SHA}`). `docker pull` in `deploy.sh §2` covers
it; no separate pull needed for migrations.

<!-- first operational pipeline run: 2026-05-22 -->
<!-- trigger: first exercise of d3c8e7c §4 fix -->
