#!/usr/bin/env bash
# Prepares the VM (run once, as root; idempotent): Docker, Caddy, restic, Supabase CLI,
# users, SSH hardening, firewall, unattended upgrades and the backup timer units.
set -euo pipefail

# shellcheck source-path=SCRIPTDIR source=lib.sh
source "$(dirname "$0")/lib.sh"

MIN_RAM_GB="${MIN_RAM_GB:-12}"
SUPABASE_CLI_VERSION="2.84.2"
REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"

[ "$(id -u)" -eq 0 ] || die "error: must run as root"

# Decimal GB, checked before anything is installed.
mem_kb="$(awk '/^MemTotal:/ {print $2}' /proc/meminfo)"
[ "$mem_kb" -ge $((MIN_RAM_GB * 1000000)) ] || die "error: at least ${MIN_RAM_GB} GB of RAM required"

# install_file <source> <destination> [mode]: rewrites the destination only if the content changed.
install_file() {
  local mode="${3:-644}"
  if ! cmp -s "$1" "$2"; then
    install -D -m "$mode" "$1" "$2"
    CHANGED=1
  fi
}

# write_file <destination> [mode]: content on stdin; same idempotence rule.
write_file() {
  local tmp
  tmp="$(mktemp)"
  cat >"$tmp"
  install_file "$tmp" "$1" "${2:-644}"
  rm -f "$tmp"
}

export DEBIAN_FRONTEND=noninteractive
CHANGED=0

# 1-2. Packages and third-party apt repositories.
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg git jq openssl rsync restic fail2ban ufw \
  unattended-upgrades iptables-persistent debian-keyring debian-archive-keyring apt-transport-https

install -m 755 -d /etc/apt/keyrings
# shellcheck source=/dev/null
. /etc/os-release
arch="$(dpkg --print-architecture)"

if [ ! -f /etc/apt/keyrings/docker.asc ]; then
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
fi
echo "deb [arch=${arch} signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" |
  write_file /etc/apt/sources.list.d/docker.list

if [ ! -f /etc/apt/keyrings/caddy-stable.gpg ]; then
  curl -fsSL https://dl.cloudsmith.io/public/caddy/stable/gpg.key | gpg --dearmor -o /etc/apt/keyrings/caddy-stable.gpg
  chmod a+r /etc/apt/keyrings/caddy-stable.gpg
fi
echo "deb [signed-by=/etc/apt/keyrings/caddy-stable.gpg] https://dl.cloudsmith.io/public/caddy/stable/deb/debian any-version main" |
  write_file /etc/apt/sources.list.d/caddy-stable.list

apt-get update -qq
apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin docker-buildx-plugin caddy
systemctl enable --now docker

if [ "$(supabase --version 2>/dev/null || true)" != "$SUPABASE_CLI_VERSION" ]; then
  deb="$(mktemp --suffix=.deb)"
  curl -fsSL -o "$deb" \
    "https://github.com/supabase/cli/releases/download/v${SUPABASE_CLI_VERSION}/supabase_${SUPABASE_CLI_VERSION}_linux_${arch}.deb"
  apt-get install -y -qq "$deb"
  rm -f "$deb"
fi

# 3. Timezone.
timedatectl set-timezone America/Sao_Paulo

# 4. Users (SSH keys are placed by the runbook).
for env in hml prod; do
  user="estaca-$env"
  id "$user" >/dev/null 2>&1 || useradd --create-home --shell /bin/bash "$user"
  usermod -aG docker "$user"
  home="$(getent passwd "$user" | cut -d: -f6)"
  install -d -m 700 -o "$user" -g "$user" "$home/.ssh"
  [ -f "$home/.ssh/authorized_keys" ] || install -m 600 -o "$user" -g "$user" /dev/null "$home/.ssh/authorized_keys"
  chmod 600 "$home/.ssh/authorized_keys"
done

# 5. SSH hardening.
CHANGED=0
write_file /etc/ssh/sshd_config.d/10-estaca.conf <<'CONF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
CONF
if [ "$CHANGED" -eq 1 ]; then
  sshd -t
  systemctl reload ssh
fi

# 6. fail2ban.
write_file /etc/fail2ban/jail.local <<'CONF'
[sshd]
enabled = true
CONF
systemctl enable --now fail2ban

# 7. Unattended upgrades.
write_file /etc/apt/apt.conf.d/20auto-upgrades <<'CONF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Unattended-Upgrade "1";
CONF

# 8. Oracle image firewall: open 80 and 443 before the catch-all REJECT; keep Oracle's own rules.
rules=/etc/iptables/rules.v4
if [ -f "$rules" ] && ! grep -q -e '--dport 80 ' "$rules"; then
  tmp="$(mktemp)"
  awk '
    !done && /^-A INPUT -j REJECT/ {
      print "-A INPUT -p tcp -m state --state NEW -m tcp --dport 80 -j ACCEPT"
      print "-A INPUT -p tcp -m state --state NEW -m tcp --dport 443 -j ACCEPT"
      done = 1
    }
    { print }
  ' "$rules" >"$tmp"
  install_file "$tmp" "$rules" 644
  rm -f "$tmp"
  netfilter-persistent reload
fi

# 9. ufw.
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# 10. Caddy.
install_file "$REPO_ROOT/infra/caddy/Caddyfile" /etc/caddy/Caddyfile
[ -f /etc/caddy/estaca.env ] || install -m 600 -o root -g root /dev/null /etc/caddy/estaca.env
if ! grep -q '^HML_ANON_KEY=' /etc/caddy/estaca.env; then echo 'HML_ANON_KEY=' >>/etc/caddy/estaca.env; fi
if ! grep -q '^PROD_ANON_KEY=' /etc/caddy/estaca.env; then echo 'PROD_ANON_KEY=' >>/etc/caddy/estaca.env; fi
write_file /etc/systemd/system/caddy.service.d/estaca.conf <<'CONF'
[Service]
EnvironmentFile=/etc/caddy/estaca.env
CONF
systemctl daemon-reload
systemctl enable caddy
systemctl restart caddy

# 11. Backup units.
install_file "$REPO_ROOT/infra/systemd/estaca-backup@.service" /etc/systemd/system/estaca-backup@.service
install_file "$REPO_ROOT/infra/systemd/estaca-backup@.timer" /etc/systemd/system/estaca-backup@.timer
systemctl daemon-reload

# 12. Base directory.
install -d -m 755 -o root -g root /opt/estaca

echo "host provisioned"
