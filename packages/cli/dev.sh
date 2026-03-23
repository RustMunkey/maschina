#!/usr/bin/env bash
# dev.sh — fast rebuild + launch for maschina CLI
# Usage: ./dev.sh          → build debug + run `maschina`
#        ./dev.sh <args>   → build debug + run `maschina <args>`
set -e
cd "$(dirname "$0")/../.."
cargo build -p maschina-cli 2>&1
cp target/debug/maschina ~/.cargo/bin/maschina
exec maschina "$@"
