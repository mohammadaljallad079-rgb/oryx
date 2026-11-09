#!/usr/bin/env bash
#
# ORYX — read-only inspection of an existing server before a pre-deployment.
#
# This script changes nothing. It reads, and it prints. It does not install,
# start, stop, restart, reload, pull, prune, migrate, seed or write. It is safe
# to run on a live host that is already serving the ORYX dashboards, which is
# exactly why every command here is a query rather than an action.
#
# Run it on the target host and send the output back. It answers the Execution
# 10 STEP 1 questions: operating system and resources, the existing ORYX
# applications and directories, PM2 and Docker services, the nginx
# configuration, the PostgreSQL databases, the domains and DNS, the TLS
# certificates, the running versions, and the uploaded and persistent data.
#
# Usage:
#   bash inspect-server.sh                 # everything readable as the current user
#   sudo bash inspect-server.sh            # adds the checks that need root
#   bash inspect-server.sh > server-audit.txt 2>&1
#
# Some sections need root (reading /etc/nginx, other users' PM2 processes,
# /var/lib/postgresql). Without root those sections print a skip note and the
# script keeps going, so a partial audit is still produced.

set -uo pipefail

# Do not let a single missing binary abort the run: this is a survey.
has() { command -v "$1" >/dev/null 2>&1; }

if [[ "$(id -u)" -eq 0 ]]; then
  SUDO=""
  IS_ROOT=1
else
  IS_ROOT=0
  if has sudo && sudo -n true 2>/dev/null; then SUDO="sudo"; else SUDO=""; fi
fi

section() { printf '\n\n========== %s ==========\n' "$*"; }
sub()     { printf '\n--- %s ---\n' "$*"; }
skip()    { printf '  [skipped] %s\n' "$*"; }

echo "ORYX server inspection (READ-ONLY)"
echo "host:        $(hostname 2>/dev/null || echo unknown)"
echo "run as:      $(id -un 2>/dev/null) (uid $(id -u))"
echo "root:        $IS_ROOT  (sudo: ${SUDO:-none})"
echo "utc time:    $(date -u +%Y-%m-%dT%H:%M:%SZ 2>/dev/null)"
echo "script:      inspect-server.sh (no writes performed)"

# --------------------------------------------------------------- 1. OS and box
section "1. OPERATING SYSTEM AND RESOURCES"
sub "os release"
cat /etc/os-release 2>/dev/null || skip "no /etc/os-release"
sub "kernel and architecture"
uname -a 2>/dev/null
sub "uptime and load"
uptime 2>/dev/null
sub "cpu"
nproc 2>/dev/null
grep -m1 'model name' /proc/cpuinfo 2>/dev/null
sub "memory"
free -h 2>/dev/null || skip "free unavailable"
sub "swap"
swapon --show 2>/dev/null || skip "swapon unavailable"
sub "disk by filesystem"
df -hT 2>/dev/null || df -h 2>/dev/null
sub "inodes"
df -i 2>/dev/null | head -20
sub "largest directories under / (top 15, may be slow)"
$SUDO du -xh --max-depth=1 / 2>/dev/null | sort -rh | head -15 || skip "du unavailable"

# --------------------------------------------------- 2. existing ORYX presence
section "2. EXISTING ORYX APPLICATIONS AND DIRECTORIES"
sub "likely deployment roots"
for d in /srv/oryx /opt/oryx /var/www/oryx /home/*/oryx /root/oryx /srv/apps/oryx /opt/apps/oryx; do
  [[ -e "$d" ]] && ls -ld "$d" 2>/dev/null
done
sub "any directory named *oryx* on the main filesystems (depth-limited)"
$SUDO find /srv /opt /var/www /home /root -maxdepth 4 -iname '*oryx*' \
  -not -path '*/node_modules/*' -not -path '*/.git/*' 2>/dev/null | head -40 \
  || skip "find unavailable"
sub "node processes and their working directories"
ps -eo pid,user,etime,cmd 2>/dev/null | grep -iE 'node|nest|next|prisma|pm2' | grep -v grep | head -30
sub "listening TCP ports with owning process"
(has ss && $SUDO ss -tulpn) 2>/dev/null || (has netstat && $SUDO netstat -tulpn) 2>/dev/null || skip "no ss/netstat"

# --------------------------------------------------------- 3. PM2 and Docker
section "3. RUNNING PM2 AND DOCKER SERVICES"
sub "pm2 (system-wide, if pm2 is installed)"
if has pm2; then
  pm2 list 2>/dev/null || skip "pm2 list failed"
  echo "  -- pm2 jlist (machine-readable) --"
  pm2 jlist 2>/dev/null | head -c 4000 || true
else
  # pm2 is often installed per-user; look for the daemon's own processes.
  skip "pm2 not on PATH"
  ps -eo pid,user,cmd 2>/dev/null | grep -i 'PM2' | grep -v grep | head -10
fi
sub "pm2 dump / startup files"
for f in /root/.pm2/dump.pm2 /home/*/.pm2/dump.pm2; do
  [[ -e "$f" ]] && ls -l "$f" 2>/dev/null
done
sub "docker engine"
if has docker; then
  docker version --format '{{.Server.Version}}' 2>/dev/null || skip "docker daemon not reachable"
  sub "docker containers (running)"
  docker ps --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}\t{{.Ports}}' 2>/dev/null || skip "docker ps failed"
  sub "docker containers (all, incl. stopped)"
  docker ps -a --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}' 2>/dev/null | head -30
  sub "docker compose projects"
  docker compose ls -a 2>/dev/null || skip "compose ls unavailable"
  sub "docker networks"
  docker network ls 2>/dev/null | head -20
  sub "docker volumes"
  docker volume ls 2>/dev/null | head -30
  sub "docker images"
  docker images --format 'table {{.Repository}}\t{{.Tag}}\t{{.Size}}\t{{.CreatedSince}}' 2>/dev/null | head -30
else
  skip "docker not installed"
fi
sub "systemd units matching oryx/postgres/nginx/docker"
$SUDO systemctl list-units --type=service --all --no-pager 2>/dev/null \
  | grep -iE 'oryx|postgres|nginx|docker|pm2' | head -30 || skip "systemctl unavailable"

# ------------------------------------------------------------------ 4. nginx
section "4. NGINX CONFIGURATION"
sub "nginx binary and version"
(has nginx && nginx -v) 2>&1 || skip "nginx not on PATH"
sub "config test result (does not reload or restart)"
(has nginx && $SUDO nginx -t) 2>&1 || skip "nginx -t unavailable"
sub "enabled sites (Debian layout)"
ls -l /etc/nginx/sites-enabled/ 2>/dev/null || skip "no sites-enabled"
sub "conf.d (RHEL/other layout)"
ls -l /etc/nginx/conf.d/ 2>/dev/null || skip "no conf.d"
sub "server_name directives in the active config"
$SUDO grep -rhE '^\s*server_name' /etc/nginx 2>/dev/null | sort -u | head -30 || skip "cannot read /etc/nginx"
sub "listen directives"
$SUDO grep -rhE '^\s*listen' /etc/nginx 2>/dev/null | sort -u | head -30 || skip "cannot read /etc/nginx"
sub "proxy_pass upstreams (where traffic is actually sent)"
$SUDO grep -rhE '^\s*proxy_pass' /etc/nginx 2>/dev/null | sort -u | head -30 || skip "cannot read /etc/nginx"
sub "full active configuration (for review)"
$SUDO nginx -T 2>/dev/null | head -400 || skip "nginx -T unavailable"

# --------------------------------------------------------------- 5. postgres
section "5. EXISTING POSTGRESQL DATABASES"
sub "postgres service status"
$SUDO systemctl status postgresql --no-pager 2>/dev/null | head -15 || skip "no systemd postgres unit"
sub "postgres processes"
ps -eo pid,user,etime,cmd 2>/dev/null | grep -i '[p]ostgres' | head -15
sub "listening postgres ports"
(has ss && $SUDO ss -tulpn) 2>/dev/null | grep -E '5432|postgres' || skip "no postgres listener seen"
sub "databases (via local psql, if it will connect)"
if has psql; then
  # -l lists databases; it writes nothing. Peer auth usually works as postgres.
  ($SUDO -u postgres psql -l 2>/dev/null || psql -l 2>/dev/null) | head -40 \
    || skip "psql could not connect (try: sudo -u postgres psql -l)"
  sub "database sizes"
  ($SUDO -u postgres psql -Atc \
    "select datname, pg_size_pretty(pg_database_size(datname)) from pg_database where not datistemplate order by pg_database_size(datname) desc;" \
    2>/dev/null) | head -20 || skip "size query failed"
  sub "migration bookkeeping (is _prisma_migrations present?)"
  ($SUDO -u postgres psql -Atc \
    "select table_schema, table_name from information_schema.tables where table_name='_prisma_migrations';" \
    2>/dev/null) | head -10 || skip "query failed"
else
  skip "psql not installed on the host"
fi
sub "postgres data directory on disk"
$SUDO ls -ld /var/lib/postgresql/*/main 2>/dev/null || skip "cannot read /var/lib/postgresql"

# ------------------------------------------------------------ 6. domains / DNS
section "6. DOMAINS AND DNS"
sub "hostname and fqdn"
hostname -f 2>/dev/null; hostname -I 2>/dev/null
sub "resolv.conf"
cat /etc/resolv.conf 2>/dev/null | head -10 || skip "no resolv.conf"
sub "public ip (best-effort, read-only)"
(has curl && curl -s --max-time 5 https://api.ipify.org) 2>/dev/null || skip "no outbound curl"
echo
sub "resolve the likely production hostnames (edit this list if different)"
for h in oryx.bh www.oryx.bh admin.oryx.bh oryx.com www.oryx.com; do
  if has getent; then
    printf '  %-20s -> ' "$h"; getent hosts "$h" 2>/dev/null | awk '{print $1}' | paste -sd, - || echo "(no record)"
  fi
done
sub "certbot / letsencrypt renewal config"
ls -l /etc/letsencrypt/renewal/ 2>/dev/null || skip "no /etc/letsencrypt"

# ------------------------------------------------------------- 7. TLS certs
section "7. SSL CERTIFICATES"
sub "certificate files on disk"
$SUDO find /etc/letsencrypt/live /etc/nginx /etc/ssl /opt /srv -maxdepth 4 \
  \( -name '*.crt' -o -name '*.pem' -o -name 'fullchain*' \) 2>/dev/null | head -30 || skip "find failed"
sub "expiry of any fullchain found"
for c in /etc/letsencrypt/live/*/fullchain.pem; do
  [[ -e "$c" ]] || continue
  echo "  $c"
  $SUDO openssl x509 -in "$c" -noout -subject -issuer -dates 2>/dev/null | sed 's/^/    /'
done
sub "certbot certificates (if certbot is present)"
(has certbot && $SUDO certbot certificates) 2>/dev/null | head -40 || skip "certbot unavailable"
sub "TLS actually served on 443 for the local vhosts (read-only handshake)"
if has openssl; then
  for h in localhost; do
    echo | timeout 5 openssl s_client -connect "$h:443" -servername "$h" 2>/dev/null \
      | openssl x509 -noout -subject -issuer -dates 2>/dev/null | sed 's/^/    /' || skip "no TLS on $h:443"
  done
fi

# --------------------------------------------------------- 8. app versions
section "8. CURRENT APPLICATION VERSIONS"
sub "git revision of each ORYX checkout found"
for d in /srv/oryx /opt/oryx /var/www/oryx /home/*/oryx /root/oryx; do
  [[ -d "$d/.git" ]] || continue
  echo "  repo: $d"
  git -C "$d" --no-pager log -1 --format='    head: %H%n    date: %ci%n    subj: %s' 2>/dev/null
  git -C "$d" --no-pager describe --tags --always 2>/dev/null | sed 's/^/    describe: /'
  git -C "$d" --no-pager status --porcelain 2>/dev/null | head -10 | sed 's/^/    dirty: /'
done
sub "package versions in any package.json found"
for f in /srv/oryx/package.json /opt/oryx/package.json /home/*/oryx/package.json; do
  [[ -f "$f" ]] || continue
  echo "  $f"
  grep -E '"(name|version)"' "$f" 2>/dev/null | head -4 | sed 's/^/    /'
done
sub "running container image tags"
(has docker && docker ps --format '{{.Names}} {{.Image}}') 2>/dev/null | sed 's/^/  /' || true

# ------------------------------------------------ 9. uploads / persistent data
section "9. UPLOADS AND PERSISTENT DATA"
sub "common media / upload roots"
for d in /srv/oryx/media /srv/oryx/uploads /opt/oryx/media /var/www/oryx/uploads \
         /srv/oryx/apps/api/uploads /srv/oryx/data; do
  [[ -e "$d" ]] && $SUDO du -sh "$d" 2>/dev/null
done
sub "docker volume mountpoints (persistent data lives here for the compose stack)"
(has docker && docker volume inspect $(docker volume ls -q 2>/dev/null) \
  --format '{{.Name}} -> {{.Mountpoint}}' 2>/dev/null) | head -20 || skip "docker volumes unavailable"
sub "any directory named media/uploads under the ORYX roots"
$SUDO find /srv /opt /var/www /home -maxdepth 5 -type d \( -name media -o -name uploads \) \
  -not -path '*/node_modules/*' 2>/dev/null | head -20 || skip "find failed"
sub "candidate backup directories already present"
$SUDO find /srv /opt /var/backups /home -maxdepth 3 -type d -iname '*backup*' 2>/dev/null | head -20 || skip "find failed"
sub "existing ORYX dump files"
$SUDO find /srv /opt /var/backups /home -maxdepth 4 -type f -name 'oryx-*.dump' 2>/dev/null | head -20 || skip "find failed"
sub "free space where backups would go"
df -h /srv /var/backups /home 2>/dev/null | head -10

# ------------------------------------------------------------------ 10. env
section "10. ENVIRONMENT FILES PRESENT (names only, never values)"
# Print paths and sizes, never contents: these hold production secrets.
$SUDO find /srv /opt /var/www /home -maxdepth 4 -type f \( -name '.env.production' -o -name '.env' \) \
  -not -path '*/node_modules/*' 2>/dev/null \
  | while read -r f; do
      printf '  %s  (%s bytes, mode %s, owner %s)\n' \
        "$f" "$(stat -c%s "$f" 2>/dev/null)" "$(stat -c%a "$f" 2>/dev/null)" "$(stat -c%U "$f" 2>/dev/null)"
      printf '    keys: %s\n' "$(grep -cE '^[A-Z]' "$f" 2>/dev/null) variables"
    done | head -40

section "END OF INSPECTION"
echo "No changes were made. This output is read-only evidence."
