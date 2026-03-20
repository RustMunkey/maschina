#!/usr/bin/env bash
# install.sh — Install the Maschina CLI
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/RustMunkey/maschina/main/scripts/install.sh | bash
#   curl -fsSL https://raw.githubusercontent.com/RustMunkey/maschina/main/scripts/install.sh | bash -s -- --version v0.2.0
#
# Installs the `maschina` binary to ~/.local/bin (Linux) or /usr/local/bin (macOS).
# Requires: curl, tar (Linux/macOS) or unzip (Windows via WSL).

set -euo pipefail

REPO="RustMunkey/maschina"
BINARY="maschina"
INSTALL_DIR_LINUX="$HOME/.local/bin"
INSTALL_DIR_MACOS="/usr/local/bin"

# ── Parse args ────────────────────────────────────────────────────────────────

VERSION=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) VERSION="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

# ── Detect platform ───────────────────────────────────────────────────────────

OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Linux)
    case "$ARCH" in
      x86_64)  TARGET="x86_64-unknown-linux-musl" ;;
      aarch64) TARGET="aarch64-unknown-linux-musl" ;;
      *)       echo "Unsupported architecture: $ARCH" >&2; exit 1 ;;
    esac
    INSTALL_DIR="$INSTALL_DIR_LINUX"
    EXT="tar.gz"
    ;;
  Darwin)
    case "$ARCH" in
      x86_64)  TARGET="x86_64-apple-darwin" ;;
      arm64)   TARGET="aarch64-apple-darwin" ;;
      *)       echo "Unsupported architecture: $ARCH" >&2; exit 1 ;;
    esac
    INSTALL_DIR="$INSTALL_DIR_MACOS"
    EXT="tar.gz"
    ;;
  *)
    echo "Unsupported OS: $OS" >&2
    echo "Windows users: download the .zip from https://github.com/$REPO/releases" >&2
    exit 1
    ;;
esac

# ── Resolve version ───────────────────────────────────────────────────────────

if [[ -z "$VERSION" ]]; then
  echo "Fetching latest release..."
  VERSION="$(curl -fsSL "https://api.github.com/repos/$REPO/releases/latest" \
    | grep '"tag_name"' | sed 's/.*"tag_name": *"\([^"]*\)".*/\1/')"
fi

if [[ -z "$VERSION" ]]; then
  echo "Could not determine latest version. Pass --version v0.x.x explicitly." >&2
  exit 1
fi

echo "Installing maschina $VERSION for $TARGET..."

# ── Download ──────────────────────────────────────────────────────────────────

ARCHIVE="maschina-cli-${VERSION}-${TARGET}.${EXT}"
URL="https://github.com/$REPO/releases/download/$VERSION/$ARCHIVE"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

echo "Downloading $URL..."
curl -fsSL "$URL" -o "$TMP/$ARCHIVE"

# ── Extract ───────────────────────────────────────────────────────────────────

tar -xzf "$TMP/$ARCHIVE" -C "$TMP"

EXTRACTED="$(find "$TMP" -name "maschina-cli" -o -name "maschina" -type f 2>/dev/null | head -1)"
if [[ -z "$EXTRACTED" ]]; then
  echo "Could not find '$BINARY' binary in archive." >&2
  exit 1
fi
chmod +x "$EXTRACTED"

# ── Install ───────────────────────────────────────────────────────────────────

mkdir -p "$INSTALL_DIR"

if [[ "$OS" == "Darwin" ]] && [[ ! -w "$INSTALL_DIR" ]]; then
  echo "Installing to $INSTALL_DIR (requires sudo)..."
  sudo sudo mv "$EXTRACTED" "$INSTALL_DIR/$BINARY"
else
  mv "$EXTRACTED" "$INSTALL_DIR/$BINARY"
fi

# ── Verify ────────────────────────────────────────────────────────────────────

if ! command -v "$BINARY" &>/dev/null; then
  echo ""
  echo "Installed to $INSTALL_DIR/$BINARY"
  echo "Add $INSTALL_DIR to your PATH:"
  echo "  echo 'export PATH=\"$INSTALL_DIR:\$PATH\"' >> ~/.bashrc && source ~/.bashrc"
  echo "  # or for zsh:"
  echo "  echo 'export PATH=\"$INSTALL_DIR:\$PATH\"' >> ~/.zshrc && source ~/.zshrc"
else
  echo ""
  echo "maschina $("$BINARY" --version 2>/dev/null || echo "$VERSION") installed successfully."
  echo "Run 'maschina setup' to get started."
fi
