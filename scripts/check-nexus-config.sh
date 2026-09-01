#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
configure_script="$repo_root/docker/nexus/configure-registries.sh"

tmp=$(mktemp -d)
cleanup() {
  rm -rf "$tmp" "$tmp.before"
}
trap cleanup EXIT HUP INT TERM

mkdir -p "$tmp/etc/apt/sources.list.d" "$tmp/home/node" "$tmp/root"
cat > "$tmp/etc/apt/sources.list" <<'APT'
deb http://archive.ubuntu.com/ubuntu jammy main
deb http://security.ubuntu.com/ubuntu jammy-security main
deb http://ports.ubuntu.com/ubuntu-ports jammy main
APT
cat > "$tmp/etc/apt/sources.list.d/debian.sources" <<'APT'
Types: deb
URIs: http://deb.debian.org/debian
Suites: bookworm bookworm-updates
Components: main

Types: deb
URIs: http://deb.debian.org/debian-security
Suites: bookworm-security
Components: main
APT
cat > "$tmp/etc/apt/sources.list.d/ros2.list" <<'APT'
deb http://packages.ros.org/ros2/ubuntu jammy main
APT
cp -a "$tmp" "$tmp.before"

# No Nexus configuration must be a true no-op.
GGCS_REGISTRY_ROOT="$tmp" "$configure_script"
diff -ru "$tmp.before/etc" "$tmp/etc" >/dev/null
[ ! -e "$tmp/root/.npmrc" ]
[ ! -e "$tmp/home/node/.npmrc" ]
[ ! -e "$tmp/etc/pip.conf" ]

# Non-empty values must rewrite only the corresponding clients/upstreams.
NEXUS_NPM_REGISTRY='https://nexus.example/repository/npm-all/' \
NEXUS_PYPI_INDEX_URL='https://nexus.example/repository/pypi-all/simple/' \
NEXUS_APT_DEBIAN_URL='https://nexus.example/repository/apt-debian/' \
NEXUS_APT_DEBIAN_SECURITY_URL='https://nexus.example/repository/apt-debian-security/' \
NEXUS_APT_UBUNTU_URL='https://nexus.example/repository/apt-ubuntu/' \
NEXUS_APT_UBUNTU_SECURITY_URL='https://nexus.example/repository/apt-ubuntu-security/' \
NEXUS_APT_UBUNTU_PORTS_URL='https://nexus.example/repository/apt-ubuntu-ports/' \
NEXUS_APT_ROS2_URL='https://nexus.example/repository/apt-ros2/' \
GGCS_REGISTRY_ROOT="$tmp" "$configure_script"

grep -Fx 'registry=https://nexus.example/repository/npm-all/' "$tmp/root/.npmrc" >/dev/null
grep -Fx 'registry=https://nexus.example/repository/npm-all/' "$tmp/home/node/.npmrc" >/dev/null
grep -Fx 'index-url = https://nexus.example/repository/pypi-all/simple' "$tmp/etc/pip.conf" >/dev/null
grep -F 'URIs: https://nexus.example/repository/apt-debian' "$tmp/etc/apt/sources.list.d/debian.sources" >/dev/null
grep -F 'URIs: https://nexus.example/repository/apt-debian-security' "$tmp/etc/apt/sources.list.d/debian.sources" >/dev/null
grep -F 'deb https://nexus.example/repository/apt-ubuntu jammy main' "$tmp/etc/apt/sources.list" >/dev/null
grep -F 'deb https://nexus.example/repository/apt-ubuntu-security jammy-security main' "$tmp/etc/apt/sources.list" >/dev/null
grep -F 'deb https://nexus.example/repository/apt-ubuntu-ports jammy main' "$tmp/etc/apt/sources.list" >/dev/null
grep -F 'deb https://nexus.example/repository/apt-ros2 jammy main' "$tmp/etc/apt/sources.list.d/ros2.list" >/dev/null

printf '%s\n' 'Nexus optional-registry configuration: PASS'
