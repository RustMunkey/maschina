#!/usr/bin/env sh
# Maschina CLI installer
# Usage: curl -fsSL https://maschina.ai/install.sh | sh
set -eu

BOLD="\033[1m"
DIM="\033[2m"
RED="\033[31m"
GREEN="\033[32m"
YELLOW="\033[33m"
CYAN="\033[36m"
RESET="\033[0m"

ok()   { printf "  ${GREEN}✓${RESET}  %s\n" "$1"; }
info() { printf "  ${DIM}·${RESET}  ${DIM}%s${RESET}\n" "$1"; }
warn() { printf "  ${YELLOW}!${RESET}  ${DIM}%s${RESET}\n" "$1"; }
die()  { printf "  ${RED}✗${RESET}  %s\n" "$1" >&2; exit 1; }
hr()   { printf "  ${DIM}────────────────────────────────────────────${RESET}\n"; }

# ── Banner ────────────────────────────────────────────────────────────────────

printf "\n"
printf "  ▄▄▄      ▄▄▄   ▄▄▄▄    ▄▄▄▄▄▄▄  ▄▄▄▄▄▄▄ ▄▄▄   ▄▄▄ ▄▄▄▄▄ ▄▄▄    ▄▄▄   ▄▄▄▄  \n"
printf "  ████▄  ▄████ ▄██▀▀██▄ █████▀▀▀ ███▀▀▀▀▀ ███   ███  ███  ████▄  ███ ▄██▀▀██▄\n"
printf "  ███▀████▀███ ███  ███  ▀████▄  ███      █████████  ███  ███▀██▄███ ███  ███ \n"
printf "  ███  ▀▀  ███ ███▀▀███    ▀████ ███      ███▀▀▀███  ███  ███  ▀████ ███▀▀███ \n"
printf "  ███      ███ ███  ███ ███████▀ ▀███████ ███   ███ ▄███▄ ███    ███ ███  ███ \n"
printf "\n"
printf "  ${DIM}autonomous digital labor  ·  installer${RESET}\n"
hr
printf "\n"

# ── Detect OS and architecture ────────────────────────────────────────────────

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin)               OS_NAME="darwin"  ;;
  Linux)                OS_NAME="linux"   ;;
  MINGW*|MSYS*|CYGWIN*) die "Windows is not supported via this script. Download from https://github.com/RustMunkey/maschina/releases" ;;
  *)                    die "Unsupported OS: $OS" ;;
esac

case "$ARCH" in
  x86_64|amd64)   ARCH_NAME="x86_64"  ;;
  arm64|aarch64)  ARCH_NAME="aarch64" ;;
  *)              die "Unsupported architecture: $ARCH" ;;
esac

ok "platform: ${OS_NAME}-${ARCH_NAME}"

# ── Check dependencies ────────────────────────────────────────────────────────

MISSING=""
for dep in curl tar; do
  if ! command -v "$dep" >/dev/null 2>&1; then
    MISSING="$MISSING $dep"
  fi
done

[ -n "$MISSING" ] && die "missing required tools:$MISSING — install them and re-run"
ok "dependencies satisfied"

# ── Determine install directory ───────────────────────────────────────────────

INSTALL_DIR="${MASCHINA_INSTALL_DIR:-}"

if [ -z "$INSTALL_DIR" ]; then
  if [ -w "/usr/local/bin" ]; then
    INSTALL_DIR="/usr/local/bin"
  else
    INSTALL_DIR="$HOME/.local/bin"
    mkdir -p "$INSTALL_DIR"
  fi
fi

info "installing to ${INSTALL_DIR}"

# ── Resolve version ───────────────────────────────────────────────────────────

GITHUB_REPO="RustMunkey/maschina"
VERSION="${MASCHINA_VERSION:-latest}"

if [ "$VERSION" = "latest" ]; then
  info "fetching latest release..."
  VERSION="$(curl -fsSL "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" \
    | grep '"tag_name"' | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')"
  [ -z "$VERSION" ] && die "could not fetch latest version — set MASCHINA_VERSION manually"
fi

ok "version: ${VERSION}"

# ── Install plan ──────────────────────────────────────────────────────────────

printf "\n"
info "install plan"
info "  os           ${OS_NAME}"
info "  arch         ${ARCH_NAME}"
info "  version      ${VERSION}"
info "  destination  ${INSTALL_DIR}"
printf "\n"

# ── Download binary ───────────────────────────────────────────────────────────

TARBALL="maschina-${OS_NAME}-${ARCH_NAME}.tar.gz"
DOWNLOAD_URL="https://github.com/${GITHUB_REPO}/releases/download/${VERSION}/${TARBALL}"

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

printf "  ${DIM}·${RESET}  downloading maschina ${VERSION}...\r"
curl -fsSL "$DOWNLOAD_URL" -o "${TMP_DIR}/${TARBALL}" \
  || die "download failed — visit https://github.com/${GITHUB_REPO}/releases"

tar -xzf "${TMP_DIR}/${TARBALL}" -C "$TMP_DIR" \
  || die "failed to extract archive"

BINARY="${TMP_DIR}/maschina"
[ -f "$BINARY" ] || die "binary not found in archive"

chmod +x "$BINARY"
mv "$BINARY" "${INSTALL_DIR}/maschina" \
  || die "failed to install to ${INSTALL_DIR} — try: sudo MASCHINA_INSTALL_DIR=/usr/local/bin sh install.sh"

ok "maschina installed ($(${INSTALL_DIR}/maschina --version 2>/dev/null || echo "${VERSION}"))"

# ── Download service binaries ─────────────────────────────────────────────────

SVC_DIR="${HOME}/.local/share/maschina/bin"
mkdir -p "$SVC_DIR"

SERVICES="maschina-api maschina-gateway maschina-realtime maschina-runtime maschina-daemon"
SVC_TARBALL="maschina-services-${OS_NAME}-${ARCH_NAME}.tar.gz"
SVC_URL="https://github.com/${GITHUB_REPO}/releases/download/${VERSION}/${SVC_TARBALL}"

SVC_HTTP_CODE="$(curl -fsSL -o /dev/null -w "%{http_code}" --head "$SVC_URL" 2>/dev/null || echo "000")"

if [ "$SVC_HTTP_CODE" = "302" ] || [ "$SVC_HTTP_CODE" = "200" ]; then
  printf "  ${DIM}·${RESET}  downloading service binaries...\r"
  curl -fsSL "$SVC_URL" -o "${TMP_DIR}/${SVC_TARBALL}" 2>/dev/null \
    && tar -xzf "${TMP_DIR}/${SVC_TARBALL}" -C "$TMP_DIR" 2>/dev/null \
    || true

  INSTALLED_SVCS=""
  for svc in $SERVICES; do
    if [ -f "${TMP_DIR}/${svc}" ]; then
      chmod +x "${TMP_DIR}/${svc}"
      mv "${TMP_DIR}/${svc}" "${SVC_DIR}/${svc}"
      INSTALLED_SVCS="${INSTALLED_SVCS} ${svc}"
    fi
  done

  if [ -n "$INSTALLED_SVCS" ]; then
    ok "service binaries installed to ${SVC_DIR}"
  else
    warn "no service binaries found in release archive"
  fi
else
  warn "service binaries not yet available for this release"
  info "run: maschina service start  (uses dev mode)"
fi

# ── Update PATH ───────────────────────────────────────────────────────────────

PATH_LINE="export PATH=\"${INSTALL_DIR}:\$PATH\""
ADDED_TO=""

case ":${PATH}:" in
  *":${INSTALL_DIR}:"*) ;;
  *)
    SHELL_NAME="$(basename "${SHELL:-/bin/sh}")"
    RC_FILE=""

    case "$SHELL_NAME" in
      zsh)  RC_FILE="$HOME/.zshrc"  ;;
      bash) RC_FILE="$HOME/.bashrc" ;;
      fish)
        FISH_DIR="$HOME/.config/fish"
        mkdir -p "$FISH_DIR"
        RC_FILE="$FISH_DIR/config.fish"
        PATH_LINE="set -gx PATH \"${INSTALL_DIR}\" \$PATH"
        ;;
      *) RC_FILE="$HOME/.profile" ;;
    esac

    if [ -n "$RC_FILE" ]; then
      if ! grep -qF "$INSTALL_DIR" "$RC_FILE" 2>/dev/null; then
        printf "\n# Added by Maschina installer\n%s\n" "$PATH_LINE" >> "$RC_FILE"
        ADDED_TO="$RC_FILE"
      fi
    fi
    ;;
esac

if [ -n "$ADDED_TO" ]; then
  ok "added ${INSTALL_DIR} to PATH in ${ADDED_TO}"
  warn "restart your terminal or run: source ${ADDED_TO}"
else
  ok "PATH already configured"
fi

# ── Done ──────────────────────────────────────────────────────────────────────

printf "\n"
hr
printf "  ${GREEN}✓${RESET}  installation complete\n"
hr
printf "\n"
info "run ${BOLD}maschina setup${RESET}${DIM} to authenticate and configure your workspace"
info "run ${BOLD}maschina service start${RESET}${DIM} to launch all background services"
printf "\n"
info "${DIM}maschina --help${RESET}${DIM}       all commands"
info "${DIM}maschina doctor${RESET}${DIM}       diagnose your installation"
info "${DIM}docs.maschina.ai/cli${RESET}${DIM}  documentation"
printf "\n"

# ── Prompt for setup if interactive ──────────────────────────────────────────

if [ -t 0 ] && [ -t 1 ]; then
  printf "  run setup now? [Y/n] "
  read -r REPLY
  case "$REPLY" in
    ""|y|Y|yes|Yes) exec "${INSTALL_DIR}/maschina" setup ;;
  esac
fi
