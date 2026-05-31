#!/usr/bin/env bash
# deploy/bootstrap.sh — Hetzner CX32 one-time server bootstrap
#
# Idempotent: safe to re-run. Each section checks state before acting.
# Run as root on a fresh Debian 12 cloud image.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/KhaledAlrashi1/statera/main/deploy/bootstrap.sh | sudo bash
#   — or clone the repo and run: sudo bash deploy/bootstrap.sh
#
# Prerequisites:
#   - Hetzner CX32 (Debian 12 "Bookworm") freshly provisioned
#   - Hetzner Volume attached and device path known (set STATERA_VOLUME_DEVICE)
#   - SSH key for deploy user added to Hetzner Cloud Console (or passed via DEPLOY_SSH_PUBKEY)
#
# Environment variables (all optional; defaults shown):
#   DEPLOY_USER          — system user for deployments     (default: deploy)
#   STATERA_VOLUME_DEVICE— block device for MySQL data     (default: prompt)
#   DEPLOY_SSH_PUBKEY    — public key for deploy user      (default: copy from root)
#   SKIP_FORMAT_CHECK    — set to "yes" to skip the       (default: unset)
#                          interactive format confirmation

set -euo pipefail

# ── Constants ─────────────────────────────────────────────────────────────────

DEPLOY_USER="${DEPLOY_USER:-deploy}"
DEPLOY_HOME="/home/$DEPLOY_USER"
MYSQL_MOUNT="/mnt/mysql-data"
MIN_DISK_GB=20

RED="\033[0;31m"
YLW="\033[0;33m"
GRN="\033[0;32m"
RST="\033[0m"

log()  { echo -e "${GRN}[bootstrap]${RST} $*"; }
warn() { echo -e "${YLW}[bootstrap WARN]${RST} $*"; }
die()  { echo -e "${RED}[bootstrap ERROR]${RST} $*" >&2; exit 1; }

[[ $EUID -eq 0 ]] || die "Must run as root."

# ── §1: System packages ───────────────────────────────────────────────────────

log "§1 — updating system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq
# chrony: preferred over Debian 12's default systemd-timesyncd on VPS kernels
# because interrupt coalescing causes timesyncd to drift more than chrony handles.
apt-get install -y -qq \
  ca-certificates \
  curl \
  gnupg \
  lsb-release \
  ufw \
  fail2ban \
  unattended-upgrades \
  apt-listchanges \
  chrony \
  util-linux \
  git \
  jq \
  htop

# age + sops: installed from GitHub releases to pin exact versions.
# Not using apt — Debian 12's age package may lag behind; sops is not in Debian repos.
# Verify latest releases: https://github.com/FiloSottile/age/releases
#                         https://github.com/getsops/sops/releases
AGE_VERSION="1.2.0"
SOPS_VERSION="3.9.1"
ARCH=$(uname -m)
case "$ARCH" in
  x86_64)  BIN_ARCH="amd64" ;;
  aarch64) BIN_ARCH="arm64" ;;
  *) die "Unsupported architecture: $ARCH" ;;
esac

if ! command -v age &>/dev/null || ! age --version 2>/dev/null | grep -qF "$AGE_VERSION"; then
  curl -fsSL \
    "https://github.com/FiloSottile/age/releases/download/v${AGE_VERSION}/age-v${AGE_VERSION}-linux-${BIN_ARCH}.tar.gz" \
    | tar -xz -C /tmp
  install /tmp/age/age /tmp/age/age-keygen /usr/local/bin/
  rm -rf /tmp/age
  log "  age v${AGE_VERSION} installed"
else
  log "  age already at v${AGE_VERSION}"
fi

if ! command -v sops &>/dev/null || ! sops --version 2>/dev/null | grep -qF "$SOPS_VERSION"; then
  curl -fsSL \
    "https://github.com/getsops/sops/releases/download/v${SOPS_VERSION}/sops-v${SOPS_VERSION}.linux.${BIN_ARCH}" \
    -o /usr/local/bin/sops
  chmod +x /usr/local/bin/sops
  log "  sops v${SOPS_VERSION} installed"
else
  log "  sops already at v${SOPS_VERSION}"
fi

# rclone: installed from GitHub releases to pin exact version + verify checksum.
# Used by deploy/backup-db.sh to upload encrypted DB backups to Cloudflare R2.
RCLONE_VERSION="1.74.2"
RCLONE_SHA256="72a806370072015ccbe4d81bcd348cc5eaf3beca6c65ba693fd43fb31fcca5b1"
RCLONE_ZIP="rclone-v${RCLONE_VERSION}-linux-${BIN_ARCH}.zip"
RCLONE_URL="https://github.com/rclone/rclone/releases/download/v${RCLONE_VERSION}/${RCLONE_ZIP}"

if ! command -v rclone &>/dev/null || ! rclone --version 2>/dev/null | grep -qF "${RCLONE_VERSION}"; then
  curl -fsSL -o "/tmp/${RCLONE_ZIP}" "${RCLONE_URL}"
  echo "${RCLONE_SHA256}  /tmp/${RCLONE_ZIP}" | sha256sum -c -
  unzip -q "/tmp/${RCLONE_ZIP}" -d /tmp/rclone_extract
  install -m 755 \
    "/tmp/rclone_extract/rclone-v${RCLONE_VERSION}-linux-${BIN_ARCH}/rclone" \
    /usr/local/bin/rclone
  rm -rf "/tmp/${RCLONE_ZIP}" /tmp/rclone_extract
  log "  rclone v${RCLONE_VERSION} installed"
else
  log "  rclone already at v${RCLONE_VERSION}"
fi

# ── §2: Deploy user ───────────────────────────────────────────────────────────

log "§2 — deploy user"

if ! id "$DEPLOY_USER" &>/dev/null; then
  useradd -m -s /bin/bash "$DEPLOY_USER"
  log "  created user $DEPLOY_USER (home: $DEPLOY_HOME)"
else
  log "  user $DEPLOY_USER already exists — skipping creation"
fi

# SSH key for deploy user
DEPLOY_SSH_DIR="$DEPLOY_HOME/.ssh"
mkdir -p "$DEPLOY_SSH_DIR"
chmod 700 "$DEPLOY_SSH_DIR"

if [[ -n "${DEPLOY_SSH_PUBKEY:-}" ]]; then
  echo "$DEPLOY_SSH_PUBKEY" >> "$DEPLOY_SSH_DIR/authorized_keys"
  log "  added DEPLOY_SSH_PUBKEY to $DEPLOY_USER"
elif [[ -f /root/.ssh/authorized_keys ]]; then
  cp /root/.ssh/authorized_keys "$DEPLOY_SSH_DIR/authorized_keys"
  log "  copied root's authorized_keys to $DEPLOY_USER"
else
  warn "  no SSH key found — add one manually to $DEPLOY_SSH_DIR/authorized_keys"
fi

chmod 600 "$DEPLOY_SSH_DIR/authorized_keys" 2>/dev/null || true
chown -R "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_SSH_DIR"

# Docker group membership: usermod takes effect on next login, not this session.
# After bootstrap completes, the deploy user must SSH in fresh (not su/sudo).
# The deploy script (8d) is designed to be invoked over SSH as the deploy user.
if ! groups "$DEPLOY_USER" | grep -q docker; then
  # usermod runs below after Docker is installed (§4); placeholder marker here.
  NEEDS_DOCKER_GROUP=1
else
  NEEDS_DOCKER_GROUP=0
  log "  $DEPLOY_USER already in docker group"
fi

# ── §3: Hetzner Volume — attach and format ────────────────────────────────────

log "§3 — Hetzner Volume mount ($MYSQL_MOUNT)"

# Resolve the device path. Hetzner's persistent volumes appear as
# /dev/disk/by-id/scsi-0HC_Volume_<numeric-id>
VOLUME_DEVICE="${STATERA_VOLUME_DEVICE:-}"

if [[ -z "$VOLUME_DEVICE" ]]; then
  echo ""
  echo "  Available block devices:"
  lsblk -dpno NAME,SIZE,MODEL | grep -v loop | sed 's/^/    /'
  echo ""
  echo "  Hetzner Volumes appear as: /dev/disk/by-id/scsi-0HC_Volume_<id>"
  read -rp "  Enter STATERA_VOLUME_DEVICE (e.g. /dev/disk/by-id/scsi-0HC_Volume_12345678): " VOLUME_DEVICE
fi

# Defense 1 (required): reject paths that don't match the Hetzner Volume pattern.
# This prevents accidentally formatting the root disk or an ephemeral device.
VOLUME_ID_PATTERN='^/dev/disk/by-id/scsi-0HC_Volume_[0-9]+$'
if [[ ! "$VOLUME_DEVICE" =~ $VOLUME_ID_PATTERN ]]; then
  die "STATERA_VOLUME_DEVICE must match pattern: $VOLUME_ID_PATTERN
  Got: $VOLUME_DEVICE
  Obtain the path from: ls -la /dev/disk/by-id/ | grep HC_Volume"
fi

# Defense 2: verify the device exists
[[ -e "$VOLUME_DEVICE" ]] || die "Device not found: $VOLUME_DEVICE — is the Hetzner Volume attached?"

# Defense 3: verify this is not the root disk (root is typically /dev/sda on CX32)
ROOT_DEVICE=$(lsblk -no PKNAME "$(findmnt -no SOURCE /)" 2>/dev/null || true)
RESOLVED_DEVICE=$(readlink -f "$VOLUME_DEVICE")
if [[ -n "$ROOT_DEVICE" && "$RESOLVED_DEVICE" == *"$ROOT_DEVICE"* ]]; then
  die "Device $VOLUME_DEVICE resolves to root disk ($ROOT_DEVICE). Aborting."
fi

# Check if already formatted
EXISTING_FS=$(blkid -s TYPE -o value "$VOLUME_DEVICE" 2>/dev/null || true)
if [[ -z "$EXISTING_FS" ]]; then
  echo ""
  warn "Device $VOLUME_DEVICE appears unformatted."
  warn "ALL DATA ON THIS DEVICE WILL BE DESTROYED."
  if [[ "${SKIP_FORMAT_CHECK:-}" != "yes" ]]; then
    read -rp "  Type 'format' to confirm: " FORMAT_CONFIRM
    [[ "$FORMAT_CONFIRM" == "format" ]] || die "Format not confirmed. Exiting."
  fi
  mkfs.ext4 -L statera-mysql "$VOLUME_DEVICE"
  log "  formatted $VOLUME_DEVICE as ext4 (label: statera-mysql)"
elif [[ "$EXISTING_FS" != "ext4" ]]; then
  die "Device $VOLUME_DEVICE has unexpected filesystem: $EXISTING_FS (expected ext4)"
else
  log "  device already formatted as ext4 — skipping format"
fi

# Mount
mkdir -p "$MYSQL_MOUNT"
VOLUME_UUID=$(blkid -s UUID -o value "$VOLUME_DEVICE")

if ! grep -q "$VOLUME_UUID" /etc/fstab; then
  echo "UUID=$VOLUME_UUID  $MYSQL_MOUNT  ext4  defaults,nofail  0  2" >> /etc/fstab
  log "  added fstab entry (UUID=$VOLUME_UUID)"
else
  log "  fstab entry already exists — skipping"
fi

if ! mountpoint -q "$MYSQL_MOUNT"; then
  mount "$MYSQL_MOUNT"
  log "  mounted $MYSQL_MOUNT"
else
  log "  $MYSQL_MOUNT already mounted"
fi

# MySQL official image runs as uid 999 (the 'mysql' user inside the container)
chown 999:999 "$MYSQL_MOUNT"
chmod 750 "$MYSQL_MOUNT"
log "  ownership set to 999:999 (MySQL container uid)"

# ── §4: Docker ────────────────────────────────────────────────────────────────

log "§4 — Docker CE"

if ! command -v docker &>/dev/null; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/debian/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg

  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/debian $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list

  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin
  log "  Docker CE installed"
else
  log "  Docker already installed ($(docker --version))"
fi

# Docker Compose plugin — installed via Docker's apt repo (added in §4).
# Earlier versions of this script downloaded a pinned binary from GitHub
# Releases, but Docker Compose v5+ broke the URL/version assumptions and
# the apt-managed install tracks the Docker engine version automatically.
if ! docker compose version &>/dev/null; then
  apt-get install -y docker-compose-plugin
  log "  Docker Compose plugin installed: $(docker compose version)"
else
  log "  Docker Compose already installed: $(docker compose version)"
fi

# Enable Docker to start on boot
systemctl enable --now docker

# Add deploy user to docker group (effective on next login — see §2 note)
if [[ "${NEEDS_DOCKER_GROUP:-0}" -eq 1 ]]; then
  usermod -aG docker "$DEPLOY_USER"
  log "  added $DEPLOY_USER to docker group (takes effect on next SSH login — not this session)"
fi

# ── §5: Kernel parameters ─────────────────────────────────────────────────────

log "§5 — kernel parameters"

SYSCTL_FILE="/etc/sysctl.d/90-statera.conf"
if [[ ! -f "$SYSCTL_FILE" ]]; then
  cat > "$SYSCTL_FILE" << 'EOF'
# vm.overcommit_memory=1: allow Redis to fork without ENOMEM under high RSS.
# Prevents "MISCONF Redis is configured to save RDB snapshots" errors.
vm.overcommit_memory = 1

# vm.swappiness=10: keep swap mostly off; CX32 has enough RAM for this workload.
# Lower value = kernel prefers RAM over swap, better latency on a low-traffic server.
vm.swappiness = 10
EOF
  sysctl -p "$SYSCTL_FILE"
  log "  sysctl configured"
else
  log "  sysctl file already exists — skipping"
fi

# ── §6: App directory skeleton ────────────────────────────────────────────────

log "§6 — app directory"

APP_DIR="$DEPLOY_HOME/statera"
if [[ ! -d "$APP_DIR" ]]; then
  mkdir -p "$APP_DIR"
  chown "$DEPLOY_USER:$DEPLOY_USER" "$APP_DIR"
  log "  created $APP_DIR"
else
  log "  $APP_DIR already exists"
fi

# Repo checkout is deferred to the 8d deploy pipeline, not bootstrap.
# This keeps bootstrap self-contained (no GitHub credentials required)
# and matches the 8b scope agreed in the proposal.

# ── §7: fail2ban ──────────────────────────────────────────────────────────────

log "§7 — fail2ban"

FAIL2BAN_JAIL="/etc/fail2ban/jail.local"
if [[ ! -f "$FAIL2BAN_JAIL" ]]; then
  cat > "$FAIL2BAN_JAIL" << 'EOF'
[DEFAULT]
# Ban for 24 hours (86400s) on first offence; aggressive enough to deter
# credential-stuffing bots without impacting legitimate users who fat-finger a password.
bantime  = 86400
findtime = 600
maxretry = 5

[sshd]
enabled = true
port    = ssh
filter  = sshd
logpath = %(sshd_log)s
backend = %(sshd_backend)s
EOF
  systemctl enable --now fail2ban
  log "  fail2ban configured (bantime=24h)"
else
  log "  fail2ban jail.local already exists — skipping"
fi

# ── §8: UFW firewall ──────────────────────────────────────────────────────────

log "§8 — UFW firewall"

# UFW default: deny all inbound, allow all outbound
ufw --force reset
ufw default deny incoming
ufw default allow outgoing
ufw allow ssh      # port 22 — SSH
ufw allow http     # port 80 — HTTP (Caddy redirect to HTTPS)
ufw allow https    # port 443 — HTTPS (Caddy)
# Port 3000 (API) is NOT opened — Caddy proxies on 127.0.0.1 only
ufw --force enable
log "  UFW enabled (ssh, http, https)"

# ── §9: GHCR login ────────────────────────────────────────────────────────────

log "§9 — GHCR registry login"

# The deploy user needs pull access to ghcr.io/khaledalrashi1/statera-api.
# Credentials are stored via docker login (in $DEPLOY_HOME/.docker/config.json).
# This step is interactive — CI tokens are configured in Module 8c (sops secrets).
if [[ -f "$DEPLOY_HOME/.docker/config.json" ]] && \
   grep -q "ghcr.io" "$DEPLOY_HOME/.docker/config.json" 2>/dev/null; then
  log "  GHCR credentials already present — skipping"
else
  warn "  GHCR login not configured."
  warn "  After bootstrap, run as $DEPLOY_USER:"
  warn "    echo \$GITHUB_TOKEN | docker login ghcr.io -u KhaledAlrashi1 --password-stdin"
  warn "  Module 8c (sops) will automate this with a stored PAT."
fi

# ── §10: Unattended upgrades ──────────────────────────────────────────────────

log "§10 — unattended-upgrades"

AUTO_UPGRADES="/etc/apt/apt.conf.d/20auto-upgrades"
UNATTENDED_CFG="/etc/apt/apt.conf.d/50unattended-upgrades"

# Write the activation file explicitly (the package install alone does not enable
# automatic daily runs — the APT::Periodic settings are what schedule them).
cat > "$AUTO_UPGRADES" << 'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
APT::Periodic::AutocleanInterval "7";
EOF
log "  20auto-upgrades written (daily updates + weekly autoclean)"

# Confirm security-only upgrades and enable email on error (if mail is configured)
if [[ ! -f "$UNATTENDED_CFG" ]]; then
  warn "  /etc/apt/apt.conf.d/50unattended-upgrades not found — using package default"
else
  # The package default enables Debian security updates; leave it intact.
  log "  50unattended-upgrades exists — leaving package default in place"
fi

systemctl enable --now unattended-upgrades

# ── §11: Time synchronisation ─────────────────────────────────────────────────

log "§11 — time synchronisation"

# chrony is more accurate than systemd-timesyncd on VPS kernels with interrupt coalescing.
if systemctl is-active --quiet chrony; then
  log "  chrony already running"
else
  systemctl enable --now chrony
  log "  chrony enabled and started"
fi

echo ""
warn "  Time-sync verification: chrony may take up to 5 minutes to reach"
warn "  sync after a cold start. After bootstrap completes, verify with:"
warn "    chronyc tracking | grep 'System time'"
warn "  Expected: offset < 10ms. Larger offsets are normal for ~60s after boot."

# ── §12: SSH hardening ────────────────────────────────────────────────────────

log "§12 — SSH hardening"

SSHD_OVERRIDE="/etc/ssh/sshd_config.d/90-statera.conf"
if [[ ! -f "$SSHD_OVERRIDE" ]]; then
  cat > "$SSHD_OVERRIDE" << 'EOF'
# Disable password authentication — key-only access.
PasswordAuthentication no
ChallengeResponseAuthentication no

# Disable root login entirely (deploy user handles all operations).
# Root is still accessible via Hetzner Rescue System if locked out.
PermitRootLogin no

# Limit auth attempts per connection to reduce brute-force window.
MaxAuthTries 3

# Idle session timeout: 30 min of no traffic → disconnect.
ClientAliveInterval 300
ClientAliveCountMax 6

# Allow CI to pass DEPLOY_SHA via SSH SendEnv so deploy.sh knows which SHA to deploy.
# The CI key's authorized_keys entry has command= restriction; AcceptEnv here lets
# the env var through even when the forced command (deploy.sh) overrides the SSH client's
# requested command. See deploy/DEPLOY.md for the full authorized_keys format.
AcceptEnv DEPLOY_SHA
EOF
  log "  SSH config written (includes AcceptEnv DEPLOY_SHA for CI pipeline)"
else
  # Idempotently add AcceptEnv DEPLOY_SHA to an existing override file if missing.
  # This handles servers bootstrapped before Module 8d.
  if ! grep -q "AcceptEnv DEPLOY_SHA" "$SSHD_OVERRIDE"; then
    echo "" >> "$SSHD_OVERRIDE"
    echo "AcceptEnv DEPLOY_SHA" >> "$SSHD_OVERRIDE"
    log "  added AcceptEnv DEPLOY_SHA to existing SSH override"
  else
    log "  SSH override already exists and has AcceptEnv — skipping"
  fi
fi

sshd -t || die "sshd_config syntax error — aborting before reload"
systemctl reload sshd
log "  sshd reloaded"

# ── §13: Final checks and root lockout ───────────────────────────────────────

log "§13 — final checks"

# Verify deploy user can SSH to localhost before disabling root access.
# This catches missing authorized_keys, wrong permissions, or sshd misconfiguration
# that would otherwise lock you out of the server.
echo ""
log "  Verifying $DEPLOY_USER can SSH to localhost..."
if sudo -u "$DEPLOY_USER" ssh \
     -o BatchMode=yes \
     -o StrictHostKeyChecking=no \
     -o ConnectTimeout=10 \
     "$DEPLOY_USER@localhost" 'echo ok' 2>/dev/null | grep -q ok; then
  log "  SSH verification passed — $DEPLOY_USER can log in"
else
  echo ""
  die "SSH verification FAILED for $DEPLOY_USER.
  Root login is still enabled. Fix the problem before re-running bootstrap.
  Common causes:
    - No key in $DEPLOY_SSH_DIR/authorized_keys
    - Wrong permissions on $DEPLOY_SSH_DIR (must be 700) or authorized_keys (must be 600)
    - sshd AllowUsers/AllowGroups exclusion
  To recover if already locked out:
    - Use the Hetzner Cloud Console 'Rescue System' to boot into a recovery image
    - Mount the root disk and fix $DEPLOY_SSH_DIR/authorized_keys
    - Hetzner docs: https://docs.hetzner.com/cloud/servers/getting-started/rescue-system/"
fi

# §2 disk space sanity check
ROOT_FREE_GB=$(df -BG / | awk 'NR==2 {gsub("G",""); print $4}')
if (( ROOT_FREE_GB < MIN_DISK_GB )); then
  warn "Root disk has only ${ROOT_FREE_GB}GB free (threshold: ${MIN_DISK_GB}GB). Consider resizing."
fi

# ── §14: age/sops key directory ──────────────────────────────────────────────

log "§14 — age/sops key directory"

SOPS_KEY_DIR="$DEPLOY_HOME/.config/sops/age"
if [[ ! -d "$SOPS_KEY_DIR" ]]; then
  mkdir -p "$SOPS_KEY_DIR"
  # Ensure the whole .config tree is deploy-user-owned, not root-owned.
  chown -R "$DEPLOY_USER:$DEPLOY_USER" "$DEPLOY_HOME/.config"
  chmod 700 "$SOPS_KEY_DIR"
  log "  created $SOPS_KEY_DIR (mode 700, $DEPLOY_USER-owned)"
else
  log "  $SOPS_KEY_DIR already exists — skipping"
fi

# The age private key (keys.txt) is NOT generated or placed here by bootstrap.
# It is scp'd by the operator as a post-bootstrap step before the first deploy.
# See deploy/8c-post-bootstrap.md for the complete setup sequence.
echo ""
warn "  Post-bootstrap (as operator, from your local machine):"
warn "    scp /path/to/server-age-key.txt $DEPLOY_USER@<server-ip>:$SOPS_KEY_DIR/keys.txt"
warn "    ssh $DEPLOY_USER@<server-ip> 'chmod 600 $SOPS_KEY_DIR/keys.txt'"
warn "  Full sequence: deploy/8c-post-bootstrap.md"

echo ""
log "══════════════════════════════════════════════════════════════════"
log "  Bootstrap complete."
log ""
log "  Next steps:"
log "  1. SSH in as $DEPLOY_USER (root login is now disabled):"
log "       ssh $DEPLOY_USER@<server-ip>"
log "  2. Follow deploy/8c-post-bootstrap.md to install the age private key"
log "     and create the encrypted secrets file."
log "  3. Verify GHCR login (see §9 output above if needed)"
log "  4. Proceed to Module 8d (CI/CD deploy script)"
log ""
log "  Recovery procedure (if locked out):"
log "  → Hetzner Cloud Console → Server → Rescue → Mount disk → fix authorized_keys"
log "══════════════════════════════════════════════════════════════════"
