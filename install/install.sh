#!/bin/sh
# Maschina Installer
# Usage: curl -fsSL https://install.maschina.ai | sh

set -e

REPO="maschina-ai/maschina"
BIN_NAME="maschina-daemon"
INSTALL_DIR="${MASCHINA_INSTALL_DIR:-/usr/local/bin}"

# Detect OS and architecture
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Linux)  TARGET_OS="linux" ;;
  Darwin) TARGET_OS="macos" ;;
  *)
    echo "Unsupported OS: $OS"
    exit 1
    ;;
esac

case "$ARCH" in
  x86_64)  TARGET_ARCH="x86_64" ;;
  arm64|aarch64) TARGET_ARCH="aarch64" ;;
  *)
    echo "Unsupported architecture: $ARCH"
    exit 1
    ;;
esac

TARGET="${TARGET_ARCH}-${TARGET_OS}"

echo "Installing Maschina daemon for ${TARGET}..."

# TODO: replace with actual release URL once CI publishes binaries
# DOWNLOAD_URL="https://github.com/${REPO}/releases/latest/download/${BIN_NAME}-${TARGET}.tar.gz"

echo ""
echo "Maschina is not yet released. Check https://maschina.ai for updates."
echo ""
