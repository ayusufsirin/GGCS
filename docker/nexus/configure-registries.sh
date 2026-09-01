#!/bin/sh
set -eu

# Configure package-manager clients to use optional Nexus proxy repositories.
# Every NEXUS_* variable is optional. Empty/unset values leave the public
# upstream configuration untouched.
#
# GGCS_REGISTRY_ROOT is only for tests; containers use the default root (/).
ROOT="${GGCS_REGISTRY_ROOT:-}"

trim_trailing_slash() {
  value="$1"
  while [ "${value%/}" != "$value" ]; do
    value="${value%/}"
  done
  printf '%s' "$value"
}

escape_sed_replacement() {
  printf '%s' "$1" | sed 's/[&|]/\\&/g'
}

replace_apt_upstream() {
  upstream="$1"
  replacement="$2"

  [ -n "$replacement" ] || return 0
  replacement="$(trim_trailing_slash "$replacement")"
  replacement_escaped="$(escape_sed_replacement "$replacement")"

  for apt_file in \
    "$ROOT/etc/apt/sources.list" \
    "$ROOT/etc/apt/sources.list.d"/*.list \
    "$ROOT/etc/apt/sources.list.d"/*.sources; do
    [ -f "$apt_file" ] || continue
    sed -i -E "s|https?://${upstream}/?|${replacement_escaped}|g" "$apt_file"
  done
}

configure_npm() {
  registry="${NEXUS_NPM_REGISTRY:-}"
  [ -n "$registry" ] || return 0

  registry="$(trim_trailing_slash "$registry")/"

  mkdir -p "$ROOT/root"
  printf 'registry=%s\n' "$registry" > "$ROOT/root/.npmrc"

  if [ -d "$ROOT/home/node" ]; then
    printf 'registry=%s\n' "$registry" > "$ROOT/home/node/.npmrc"
  fi
}

configure_pip() {
  index_url="${NEXUS_PYPI_INDEX_URL:-}"
  [ -n "$index_url" ] || return 0

  index_url="$(trim_trailing_slash "$index_url")"
  mkdir -p "$ROOT/etc"
  cat > "$ROOT/etc/pip.conf" <<PIPCONF
[global]
index-url = ${index_url}
PIPCONF
}

configure_apt() {
  # Debian / Node base images
  replace_apt_upstream 'deb\.debian\.org/debian-security' "${NEXUS_APT_DEBIAN_SECURITY_URL:-}"
  replace_apt_upstream 'deb\.debian\.org/debian' "${NEXUS_APT_DEBIAN_URL:-}"

  # Ubuntu / ROS base images
  replace_apt_upstream 'archive\.ubuntu\.com/ubuntu' "${NEXUS_APT_UBUNTU_URL:-}"
  replace_apt_upstream 'security\.ubuntu\.com/ubuntu' "${NEXUS_APT_UBUNTU_SECURITY_URL:-}"
  replace_apt_upstream 'ports\.ubuntu\.com/ubuntu-ports' "${NEXUS_APT_UBUNTU_PORTS_URL:-}"
  replace_apt_upstream 'packages\.ros\.org/ros2/ubuntu' "${NEXUS_APT_ROS2_URL:-}"
}

configure_npm
configure_pip
configure_apt
