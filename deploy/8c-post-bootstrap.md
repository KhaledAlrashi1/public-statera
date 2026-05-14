# Post-bootstrap: secrets setup (Module 8c)

Run these steps after `deploy/bootstrap.sh` completes and you have SSH access as the deploy user.
This is a one-time operator procedure. All steps are performed from your **local machine** unless
marked `(on server)`.

---

## §1 — Generate age keypairs

On your local machine, generate two age keypairs: one for local editing, one for the server.

```bash
# Operator key — used locally to edit the encrypted secrets file.
# Store at the standard sops path so sops finds it automatically.
mkdir -p ~/.config/sops/age
age-keygen -o ~/.config/sops/age/operator.key
# Output: Public key: age1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Server key — used by the server to decrypt at deploy time.
# Generate locally; scp to server; delete locally afterward.
age-keygen -o /tmp/server.key
# Output: Public key: age1yyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyyy
```

Note both public keys — you need them in §2.

**Back up your operator private key.** If you lose it, you lose the ability to edit secrets.
Recommended: store a copy in 1Password, an encrypted USB drive, or print the key material as
a paper backup (`age-keygen -y /tmp/operator.key` prints only the public key — keep the private
key in at least two physically separate locations).

---

## §2 — Update .sops.yaml with real public keys

Edit `.sops.yaml` in the repo and replace the two placeholder values:

```yaml
creation_rules:
  - path_regex: secrets/.*\.sops\.yaml$
    age: >-
      age1<paste operator public key here>,
      age1<paste server public key here>
```

Commit the updated `.sops.yaml`. The file contains only public keys — safe to commit.

---

## §3 — Install the server private key

```bash
# scp the private key to the server
scp /tmp/server.key deploy@<server-ip>:~/.config/sops/age/keys.txt

# Set correct permissions (ssh into server as deploy user)
ssh deploy@<server-ip> 'chmod 600 ~/.config/sops/age/keys.txt'

# IMPORTANT: delete the private key from your local machine
rm /tmp/server.key
```

The server private key must never be committed to the repo and must not persist on the local
machine. The only copy lives on the server.

---

## §4 — Verify the server can decrypt

Before committing `.sops.yaml` with real keys, verify the chain works end-to-end.
Encrypt a small test file with the real keys and confirm the server can decrypt it.

```bash
# On local machine: create a small test file and encrypt it
echo 'SMOKE_TEST=ok' | sops -e --input-type dotenv --output-type yaml /dev/stdin \
  > /tmp/smoke.sops.yaml

# scp the test file to the server
scp /tmp/smoke.sops.yaml deploy@<server-ip>:/tmp/smoke.sops.yaml

# On server: verify decryption
ssh deploy@<server-ip> 'sops -d --output-type dotenv /tmp/smoke.sops.yaml'
# Expected output: SMOKE_TEST=ok

# Clean up
ssh deploy@<server-ip> 'rm /tmp/smoke.sops.yaml'
rm /tmp/smoke.sops.yaml
```

If decryption succeeds, the age keypair is correctly installed. Proceed to §5.
If it fails, check: `~/.config/sops/age/keys.txt` exists, mode 600, contains a valid age private
key (starts with `AGE-SECRET-KEY-`), and the public key in `.sops.yaml` matches it.

---

## §5 — Create the encrypted secrets file

Populate a plaintext `.env.prod.filled` from `deploy/.env.prod.example`, filling in real values.
Then encrypt it:

```bash
# On local machine, with .env.prod.filled populated:
sops -e --input-type dotenv --output-type yaml .env.prod.filled \
  > secrets/.env.prod.sops.yaml

# Verify you can decrypt it locally:
sops -d --output-type dotenv secrets/.env.prod.sops.yaml | head -5

# Shred the plaintext file — it must not be committed or left on disk
shred -u .env.prod.filled
# If shred is unavailable: rm .env.prod.filled
```

Commit `secrets/.env.prod.sops.yaml` to the repo. It is safe to commit — it is encrypted and can
only be decrypted by holders of the operator or server private key.

---

## §6 — Verify the full deploy chain on the server

After pushing the committed encrypted file, pull on the server and verify the complete
decrypt-and-compose chain:

```bash
# On server (as deploy user):
cd ~/statera
git pull

# Test: decrypt and validate Compose env var substitution (no containers started)
docker compose \
  --env-file <(sops -d --output-type dotenv secrets/.env.prod.sops.yaml) \
  -f docker-compose.prod.yml \
  config 2>&1 | head -40
# Expected: Compose prints the merged config with all ${VAR} substitutions resolved.
# Any "variable is not set" warnings indicate a missing entry in the secrets file.
```

This is the smoke test that confirms the full path: encrypted file → sops decrypt → dotenv →
Compose env substitution → container-ready config.

---

## §7 — sopsdiffer git diff (optional but pleasant)

For nicer `git diff` output on `.sops.yaml` files (shows structured metadata diffs rather than
raw ciphertext blobs):

```bash
git config diff.sopsdiffer.textconv "sops -d --output-type yaml"
```

This is a local git config entry — it affects your local clone only and does not need to be
committed. Other contributors run it independently.

---

## Editing secrets in future

```bash
# Open the encrypted file in $EDITOR, re-encrypt on save:
sops --input-type dotenv secrets/.env.prod.sops.yaml

# Commit the updated encrypted file as normal:
git add secrets/.env.prod.sops.yaml
git commit -m "secrets: rotate SESSION_SECRET"
```

The `--input-type dotenv` flag is required every time because the file extension (`.yaml`)
is the encrypted envelope format, not the plaintext format. Without the flag, sops assumes
YAML plaintext and the editor shows incorrect structure.

A shell alias makes this ergonomic:

```bash
# Add to ~/.bashrc or ~/.zshrc:
alias edit-secrets='sops --input-type dotenv secrets/.env.prod.sops.yaml'
```

---

## SOPS_AGE_KEY_FILE

sops looks for age keys at `~/.config/sops/age/keys.txt` by default. In non-standard
environments (CI runners with different home directories, or when managing multiple age keys),
override the path:

```bash
export SOPS_AGE_KEY_FILE=/explicit/path/to/keys.txt
```

The 8d deploy script will set this explicitly so it is not sensitive to the CI runner's `$HOME`.

---

## Security boundary

`secrets/.env.prod.sops.yaml` is committed at default permissions (644). This is intentional.
The file is encrypted — reading it reveals nothing without the age private key. Do **not**
`chmod 600` the encrypted file: it adds fragility (git pull may fail permission checks in some
environments) without any security benefit. The security boundary is the private key files
(`~/.config/sops/age/keys.txt` on server, mode 600).
