# Secrets management reference

This project uses [sops](https://github.com/getsops/sops) with
[age](https://github.com/FiloSottile/age) for secrets management. The encrypted
secrets file lives in the repo; the age private keys live only on the operator's
local machine and the production server.

**Initial setup:** `deploy/8c-post-bootstrap.md`

---

## File layout

```
.sops.yaml                       # recipient public keys (operator + server)
secrets/
  .env.prod.sops.yaml            # encrypted secrets (created during post-bootstrap)
deploy/
  .env.prod.example              # documentation of all variables (no real values)
  8c-post-bootstrap.md           # one-time setup runbook
  SECRETS.md                     # this file
```

## Plaintext format

The plaintext content of `secrets/.env.prod.sops.yaml` is **dotenv** format (`KEY=value` lines),
matching `deploy/.env.prod.example` exactly. The encrypted YAML envelope wraps this content.

Encrypt (create or re-encrypt):
```bash
sops -e --input-type dotenv --output-type yaml .env.prod.filled \
  > secrets/.env.prod.sops.yaml
```

Decrypt (inspect):
```bash
sops -d --output-type dotenv secrets/.env.prod.sops.yaml
```

---

## Editing secrets

```bash
# Open in $EDITOR — re-encrypts automatically on save
sops --input-type dotenv secrets/.env.prod.sops.yaml
```

The `--input-type dotenv` flag is required every time. The `.yaml` extension is the encrypted
envelope format; without the flag, sops assumes YAML plaintext and the editor shows
incorrectly structured content.

Alias for convenience (add to `~/.bashrc` or `~/.zshrc`):
```bash
alias edit-secrets='sops --input-type dotenv secrets/.env.prod.sops.yaml'
```

Commit the updated file as normal after saving:
```bash
git add secrets/.env.prod.sops.yaml && git commit -m "secrets: <what changed>"
```

---

## Deploy-time decryption

The canonical invocation — used by the 8d deploy script:

```bash
docker compose \
  --env-file <(sops -d --output-type dotenv secrets/.env.prod.sops.yaml) \
  -f docker-compose.prod.yml \
  up -d
```

`<(...)` is bash process substitution. sops output is passed as a file descriptor;
plaintext never written to disk. If sops decryption fails, the substitution fails and
Compose aborts before starting any container.

**Verify the deploy chain without starting containers:**
```bash
docker compose \
  --env-file <(sops -d --output-type dotenv secrets/.env.prod.sops.yaml) \
  -f docker-compose.prod.yml \
  config
```

Compose prints the merged config with all `${VAR}` substitutions resolved. "Variable is not
set" warnings indicate a variable referenced in the Compose file but absent from the secrets
file.

**SOPS_AGE_KEY_FILE:** sops finds the age key at `~/.config/sops/age/keys.txt` by default.
Override when the runner's `$HOME` differs from the deploy user's home:
```bash
export SOPS_AGE_KEY_FILE=/home/deploy/.config/sops/age/keys.txt
```

The 8d deploy script sets this explicitly.

---

## Security boundary

`secrets/.env.prod.sops.yaml` is committed at **644** (git default). Do not `chmod 600` it —
the file is encrypted and harmless to read; restricting it adds fragility (git pull can fail
permission checks) with no security benefit.

The security boundary is the **private key files**:
- Operator: `~/.config/sops/age/operator.key` (local machine, mode 600)
- Server: `~/.config/sops/age/keys.txt` (production server, mode 600, deploy-user-owned)

**CI never sees plaintext.** CI pulls the encrypted file from git and ships it to the server.
The server decrypts using its own age key. A compromised CI runner gets only the encrypted blob.

---

## Age key rotation

Rotation means replacing the age keypair (not the secret values themselves).

```bash
# 1. Generate new server keypair
age-keygen -o /tmp/new-server.key
# Note the new public key

# 2. Add new server key to .sops.yaml alongside the old one (temporary double-recipient)
#    age: >-
#      age1<operator>,
#      age1<old-server>,
#      age1<new-server>

# 3. Re-encrypt the secrets file to add the new recipient
sops updatekeys secrets/.env.prod.sops.yaml

# 4. Install new key on server, verify decryption works
scp /tmp/new-server.key deploy@<server>:~/.config/sops/age/keys.txt
ssh deploy@<server> 'chmod 600 ~/.config/sops/age/keys.txt'
ssh deploy@<server> 'sops -d --output-type dotenv secrets/.env.prod.sops.yaml | head -3'

# 5. Remove old server key from .sops.yaml; run updatekeys again to re-encrypt
#    without the old recipient
sops updatekeys secrets/.env.prod.sops.yaml

# 6. Commit the updated .sops.yaml and secrets file
git add .sops.yaml secrets/.env.prod.sops.yaml
git commit -m "secrets: rotate server age key"

# 7. Clean up
rm /tmp/new-server.key
```

**This rotates the age key, not the secret values.** The values of `SESSION_SECRET`,
`MYSQL_PASSWORD`, etc. remain unchanged.

---

## Secret value rotation

### SESSION_SECRET

Edit the secrets file, change the value, deploy. All active sessions are invalidated on
container restart — users will be prompted to re-login. No data migration required.

```bash
sops --input-type dotenv secrets/.env.prod.sops.yaml
# change SESSION_SECRET value, save and exit
git add secrets/.env.prod.sops.yaml && git commit -m "secrets: rotate SESSION_SECRET"
# Deploy — sessions invalidate on restart
```

### MYSQL_PASSWORD

Three steps in this exact order — reversing steps 1 and 2 causes a connection failure:

1. Update the value in the secrets file and deploy (new password in env, old password in DB — brief window of failed connections)

Actually, the safe order for zero-downtime is:
1. `ALTER USER 'statera'@'%' IDENTIFIED BY '<new-password>';` in MySQL
2. Update `MYSQL_PASSWORD` in the secrets file
3. Deploy (container restarts connecting with new password)

Document the running `docker exec` command:
```bash
docker exec -it statera-mysql-1 \
  mysql -u root -p -e "ALTER USER 'statera'@'%' IDENTIFIED BY '<new-password>';"
```

### ENCRYPTION_KEY

**Deferred.** Rotating `ENCRYPTION_KEY` requires a one-time data migration job that decrypts
all `enc1:`-prefixed ciphertexts in the database with the old key and re-encrypts with the new
key. The `enc1:` prefix in `lib/crypto.ts` was designed for this; the migration job has not
been built yet. Do not rotate `ENCRYPTION_KEY` until that migration job exists.

---

## What this module does NOT cover

- The 8d deploy script that invokes the canonical `docker compose --env-file <(sops -d ...)` command
- ENCRYPTION_KEY secret rotation (data migration job required — future module)
- Automated database password rotation (manual procedure documented above)
- Adding a second operator key (use `sops updatekeys` when needed — same flow as key rotation §4–5)
