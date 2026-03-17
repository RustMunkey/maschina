#!/usr/bin/env bash
# scripts/node-setup.sh — Bootstrap a Maschina compute node on Ubuntu 24.04 LTS.
#
# What this does:
#   1. Installs system dependencies (build tools, Python, uv, Rust)
#   2. Clones the repo (or uses an existing clone)
#   3. Builds maschina-cli and services/runtime from source
#   4. Installs systemd services for the Python runtime + node loop
#   5. Guides you through `maschina setup` + `maschina node join`
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/RustMunkey/maschina/main/scripts/node-setup.sh | bash
#   -- or --
#   bash scripts/node-setup.sh          # from within the repo

set -euo pipefail

REPO_URL="git@github.com:RustMunkey/maschina.git"
INSTALL_DIR="${MASCHINA_DIR:-$HOME/.maschina}"
BIN_DIR="$HOME/.local/bin"
RUNTIME_PORT="${RUNTIME_PORT:-8001}"

# ── Colors ────────────────────────────────────────────────────────────────────
bold=$(tput bold 2>/dev/null || true)
green=$(tput setaf 2 2>/dev/null || true)
cyan=$(tput setaf 6 2>/dev/null || true)
reset=$(tput sgr0 2>/dev/null || true)

info()    { echo "${cyan}→${reset} $*"; }
success() { echo "${green}✓${reset} $*"; }
header()  { echo; echo "${bold}$*${reset}"; echo; }

# ── Preflight ─────────────────────────────────────────────────────────────────

header "Maschina Node Setup"
echo "  This script will install a Maschina compute node on this machine."
echo "  It requires sudo for apt packages and systemd service installation."
echo

if [[ "$(id -u)" -eq 0 ]]; then
  echo "  Run as a normal user (sudo will be invoked where needed)." >&2
  exit 1
fi

OS=$(. /etc/os-release 2>/dev/null && echo "$ID" || uname -s)
if [[ "$OS" != "ubuntu" ]]; then
  echo "  Warning: tested on Ubuntu 24.04. Proceeding anyway — check for errors." >&2
fi

# ── System packages ───────────────────────────────────────────────────────────

header "1/6  System dependencies"

sudo apt-get update -qq
sudo apt-get install -y --no-install-recommends \
  build-essential curl git pkg-config libssl-dev \
  python3 python3-pip python3-venv \
  ca-certificates

success "System packages installed"

# ── Rust ──────────────────────────────────────────────────────────────────────

header "2/6  Rust toolchain"

if ! command -v rustup &>/dev/null; then
  info "Installing rustup..."
  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --no-modify-path
  # shellcheck source=/dev/null
  source "$HOME/.cargo/env"
  success "Rust installed: $(rustc --version)"
else
  source "$HOME/.cargo/env" 2>/dev/null || true
  info "Rust already installed: $(rustc --version)"
  rustup update stable --quiet
fi

mkdir -p "$BIN_DIR"
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
  export PATH="$BIN_DIR:$PATH"
fi

# ── uv (Python package manager) ───────────────────────────────────────────────

header "3/6  Python environment (uv)"

if ! command -v uv &>/dev/null; then
  info "Installing uv..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  export PATH="$HOME/.local/bin:$PATH"
  success "uv installed: $(uv --version)"
else
  info "uv already installed: $(uv --version)"
fi

# ── Repo ──────────────────────────────────────────────────────────────────────

header "4/6  Maschina source"

if [[ -f "$(dirname "$0")/../Cargo.toml" ]]; then
  # Running from within the repo already
  REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
  info "Using existing repo at $REPO_ROOT"
else
  info "Cloning repo to $INSTALL_DIR..."
  if [[ -d "$INSTALL_DIR/.git" ]]; then
    info "Repo already cloned — pulling latest..."
    git -C "$INSTALL_DIR" pull --ff-only
  else
    git clone "$REPO_URL" "$INSTALL_DIR"
  fi
  REPO_ROOT="$INSTALL_DIR"
fi

# ── Build ─────────────────────────────────────────────────────────────────────

header "5/6  Building binaries"

info "Building maschina CLI (release)..."
cargo build --release -p maschina-cli --manifest-path "$REPO_ROOT/Cargo.toml"
cp "$REPO_ROOT/target/release/maschina" "$BIN_DIR/maschina"
success "maschina CLI → $BIN_DIR/maschina"

info "Installing Python runtime packages (venv)..."
VENV_DIR="$HOME/.maschina-venv"
python3 -m venv "$VENV_DIR"
"$VENV_DIR/bin/pip" install --quiet \
  -e "$REPO_ROOT/packages/ml" \
  -e "$REPO_ROOT/packages/runtime" \
  -e "$REPO_ROOT/packages/agents" \
  -e "$REPO_ROOT/packages/risk" \
  -e "$REPO_ROOT/services/runtime"
success "Python runtime packages installed → $VENV_DIR"

# ── Systemd services ──────────────────────────────────────────────────────────

header "6/6  Systemd services"

RUNTIME_ENV_FILE="$HOME/.config/maschina/runtime.env"
mkdir -p "$(dirname "$RUNTIME_ENV_FILE")"

if [[ ! -f "$RUNTIME_ENV_FILE" ]]; then
  cat > "$RUNTIME_ENV_FILE" <<EOF
# Maschina runtime environment
# Fill in ANTHROPIC_API_KEY or leave blank to use Ollama fallback.
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
OLLAMA_BASE_URL=http://localhost:11434/v1
SANDBOX_ENABLED=true
EOF
  info "Created $RUNTIME_ENV_FILE — edit to add API keys."
fi

# Runtime service (Python FastAPI)
sudo tee /etc/systemd/system/maschina-runtime.service > /dev/null <<EOF
[Unit]
Description=Maschina agent runtime
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$REPO_ROOT/services/runtime
EnvironmentFile=$RUNTIME_ENV_FILE
ExecStart=$HOME/.maschina-venv/bin/python -m uvicorn src.main:app --host 0.0.0.0 --port $RUNTIME_PORT
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Node service (Rust CLI node loop)
sudo tee /etc/systemd/system/maschina-node.service > /dev/null <<EOF
[Unit]
Description=Maschina compute node
After=network-online.target maschina-runtime.service
Wants=network-online.target
Requires=maschina-runtime.service

[Service]
Type=simple
User=$USER
ExecStart=$BIN_DIR/maschina node join
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable maschina-runtime.service
sudo systemctl enable maschina-node.service

success "Systemd services installed and enabled"

# ── Final instructions ────────────────────────────────────────────────────────

echo
echo "${bold}Setup complete.${reset}"
echo
echo "  Next steps:"
echo
echo "  1. Edit API keys (optional — skip to use Ollama fallback):"
echo "       nano $RUNTIME_ENV_FILE"
echo
echo "  2. Register and connect to the network:"
echo "       maschina setup        # authenticate with your account"
echo "       maschina node join    # first-run wizard: name, capacity, NATS URL"
echo
echo "  3. After joining once, the node auto-starts on boot via systemd."
echo "     To start now:"
echo "       sudo systemctl start maschina-runtime"
echo "       sudo systemctl start maschina-node"
echo
echo "  4. Check status:"
echo "       sudo systemctl status maschina-runtime"
echo "       sudo systemctl status maschina-node"
echo "       journalctl -u maschina-node -f"
echo
