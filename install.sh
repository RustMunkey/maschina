#!/usr/bin/env sh
# Maschina CLI installer
# Usage: curl -fsSL https://install.maschina.dev | sh
set -eu

BOLD="\033[1m"
DIM="\033[2m"
CYAN="\033[36m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
RESET="\033[0m"

step() { printf "  ${CYAN}→${RESET}  %s\n" "$1"; }
ok()   { printf "  ${GREEN}✓${RESET}  %s\n" "$1"; }
warn() { printf "  ${YELLOW}!${RESET}  %s\n" "$1"; }
die()  { printf "  ${RED}✗${RESET}  %s\n" "$1"; exit 1; }
hr()   { printf "  ${DIM}──────────────────────────────────────────────${RESET}\n"; }

# ── Banner ────────────────────────────────────────────────────────────────────

printf "\n"
printf "${BOLD}  Maschina${RESET}\n"
printf "${DIM}  Autonomous digital labor, at your command.${RESET}\n"
printf "\n"
hr
printf "\n"

# ── Detect OS and architecture ────────────────────────────────────────────────

step "Checking platform..."

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin)  OS_NAME="darwin"  ;;
  Linux)   OS_NAME="linux"   ;;
  MINGW*|MSYS*|CYGWIN*) die "Windows is not yet supported via this script. Download the binary from https://github.com/RustMunkey/maschina/releases" ;;
  *)       die "Unsupported OS: $OS" ;;
esac

case "$ARCH" in
  x86_64|amd64) ARCH_NAME="x86_64"  ;;
  arm64|aarch64) ARCH_NAME="aarch64" ;;
  *) die "Unsupported architecture: $ARCH" ;;
esac

ok "Platform: ${OS_NAME}-${ARCH_NAME}"

# ── Check dependencies ────────────────────────────────────────────────────────

step "Checking dependencies..."

MISSING=""
for dep in curl tar; do
  if ! command -v "$dep" >/dev/null 2>&1; then
    MISSING="$MISSING $dep"
  fi
done

if [ -n "$MISSING" ]; then
  die "Missing required tools:$MISSING — install them and re-run."
fi
ok "Dependencies satisfied"

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

step "Installing to ${INSTALL_DIR}"

# ── Download binary ───────────────────────────────────────────────────────────

GITHUB_REPO="RustMunkey/maschina"
VERSION="${MASCHINA_VERSION:-latest}"

if [ "$VERSION" = "latest" ]; then
  step "Fetching latest release..."
  VERSION="$(curl -fsSL "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" \
    | grep '"tag_name"' | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')"
  if [ -z "$VERSION" ]; then
    die "Could not fetch latest version. Check your internet connection or set MASCHINA_VERSION manually."
  fi
fi

TARBALL="maschina-${OS_NAME}-${ARCH_NAME}.tar.gz"
DOWNLOAD_URL="https://github.com/${GITHUB_REPO}/releases/download/${VERSION}/${TARBALL}"

step "Downloading maschina ${VERSION}..."

TMP_DIR="$(mktemp -d)"
trap 'rm -rf "$TMP_DIR"' EXIT

curl -fsSL --progress-bar "$DOWNLOAD_URL" -o "${TMP_DIR}/${TARBALL}" \
  || die "Download failed. Visit https://github.com/${GITHUB_REPO}/releases to download manually."

# ── Extract and install ───────────────────────────────────────────────────────

step "Installing binary..."

tar -xzf "${TMP_DIR}/${TARBALL}" -C "$TMP_DIR" \
  || die "Failed to extract archive"

BINARY="${TMP_DIR}/maschina"
[ -f "$BINARY" ] || die "Binary not found in archive"

chmod +x "$BINARY"
mv "$BINARY" "${INSTALL_DIR}/maschina" \
  || die "Failed to install to ${INSTALL_DIR} — try: sudo MASCHINA_INSTALL_DIR=/usr/local/bin sh install.sh"

ok "Installed maschina $(${INSTALL_DIR}/maschina --version 2>/dev/null || echo "${VERSION}")"

# ── Download service binaries ─────────────────────────────────────────────────

SVC_DIR="${HOME}/.local/share/maschina/bin"
mkdir -p "$SVC_DIR"

SERVICES="maschina-api maschina-gateway maschina-realtime maschina-runtime maschina-daemon"
SVC_TARBALL="maschina-services-${OS_NAME}-${ARCH_NAME}.tar.gz"
SVC_URL="https://github.com/${GITHUB_REPO}/releases/download/${VERSION}/${SVC_TARBALL}"

step "Downloading service binaries..."

# Check if service tarball exists (releases may not include services separately)
SVC_HTTP_CODE="$(curl -fsSL -o /dev/null -w "%{http_code}" --head "$SVC_URL" 2>/dev/null || echo "000")"

if [ "$SVC_HTTP_CODE" = "302" ] || [ "$SVC_HTTP_CODE" = "200" ]; then
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
    ok "Service binaries installed to ${SVC_DIR}"
  else
    warn "No service binaries found in release archive"
  fi
else
  warn "Service binaries not yet available for this release"
  printf "  ${DIM}Run: maschina service start  (uses dev mode fallback)${RESET}\n"
fi

# ── Update PATH ───────────────────────────────────────────────────────────────

PATH_LINE="export PATH=\"${INSTALL_DIR}:\$PATH\""
ADDED_TO=""

# Check if already on PATH
case ":${PATH}:" in
  *":${INSTALL_DIR}:"*) ;;
  *)
    # Try to detect shell and add to rc file
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
      *)    RC_FILE="$HOME/.profile" ;;
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
  ok "Added ${INSTALL_DIR} to PATH in ${ADDED_TO}"
  warn "Restart your terminal or run:  source ${ADDED_TO}"
else
  ok "PATH already includes ${INSTALL_DIR}"
fi

# ── Done ──────────────────────────────────────────────────────────────────────

printf "\n"
hr
printf "\n"
printf "  ${GREEN}${BOLD}Installation complete!${RESET}\n"
printf "\n"
printf "  Run ${BOLD}maschina setup${RESET} to authenticate and configure your workspace.\n"
printf "  Run ${BOLD}maschina service start${RESET} to launch all background services.\n"
printf "\n"
printf "  ${DIM}maschina --help${RESET}${DIM}       — all commands${RESET}\n"
printf "  ${DIM}maschina doctor${RESET}${DIM}       — diagnose your installation${RESET}\n"
printf "\n"
printf "  ${DIM}Documentation:  https://docs.maschina.dev/cli${RESET}\n"
printf "  ${DIM}Issues:         https://github.com/${GITHUB_REPO}/issues${RESET}\n"
printf "\n"

# ── Run setup if interactive ──────────────────────────────────────────────────

if [ -t 0 ] && [ -t 1 ]; then
  printf "  Run setup now? [Y/n] "
  read -r REPLY
  case "$REPLY" in
    ""|y|Y|yes|Yes) exec "${INSTALL_DIR}/maschina" setup ;;
  esac
fi
