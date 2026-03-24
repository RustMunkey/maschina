#!/usr/bin/env bash
# gen-nats-certs.sh — generate self-signed TLS certs for NATS
#
# Generates:
#   docker/nats/certs/ca.pem       — CA certificate (distribute to all clients)
#   docker/nats/certs/ca-key.pem   — CA private key (keep secret)
#   docker/nats/certs/server.pem   — NATS server certificate
#   docker/nats/certs/server-key.pem — NATS server private key
#
# Usage:
#   bash scripts/gen-nats-certs.sh
#   bash scripts/gen-nats-certs.sh --days 3650  # 10-year certs

set -euo pipefail

DAYS="${2:-825}"  # 825 days default (~2.25 years, max for some clients)
OUT="$(dirname "$0")/../docker/nats/certs"
mkdir -p "$OUT"

# Parse --days flag
while [[ $# -gt 0 ]]; do
  case "$1" in
    --days) DAYS="$2"; shift 2 ;;
    *) shift ;;
  esac
done

echo "Generating NATS TLS certificates (valid ${DAYS} days)..."
echo "Output: $OUT"
echo ""

# ── CA key + cert ─────────────────────────────────────────────────────────────
echo "1/4  CA private key"
openssl genrsa -out "$OUT/ca-key.pem" 4096 2>/dev/null

echo "2/4  CA certificate"
openssl req -new -x509 \
  -key "$OUT/ca-key.pem" \
  -out "$OUT/ca.pem" \
  -days "$DAYS" \
  -subj "/CN=maschina-nats-ca/O=Maschina/C=US" \
  2>/dev/null

# ── Server key + cert ─────────────────────────────────────────────────────────
echo "3/4  Server private key"
openssl genrsa -out "$OUT/server-key.pem" 4096 2>/dev/null

echo "4/4  Server certificate (signed by CA)"
openssl req -new \
  -key "$OUT/server-key.pem" \
  -out "$OUT/server.csr" \
  -subj "/CN=maschina-nats/O=Maschina/C=US" \
  2>/dev/null

# SAN: localhost + Docker service name + LAN IP placeholder
cat > "$OUT/server-ext.cnf" <<EOF
[v3_req]
subjectAltName = DNS:localhost,DNS:maschina-nats,DNS:nats,IP:127.0.0.1
EOF

openssl x509 -req \
  -in "$OUT/server.csr" \
  -CA "$OUT/ca.pem" \
  -CAkey "$OUT/ca-key.pem" \
  -CAcreateserial \
  -out "$OUT/server.pem" \
  -days "$DAYS" \
  -extensions v3_req \
  -extfile "$OUT/server-ext.cnf" \
  2>/dev/null

# Cleanup temp files
rm -f "$OUT/server.csr" "$OUT/server-ext.cnf" "$OUT/ca.srl"

echo ""
echo "Done."
echo ""
echo "Files:"
echo "  $OUT/ca.pem          — distribute to all clients (NATS_CA_CERT)"
echo "  $OUT/ca-key.pem      — keep secret, never commit"
echo "  $OUT/server.pem      — NATS server certificate"
echo "  $OUT/server-key.pem  — NATS server private key, never commit"
echo ""
echo "Next:"
echo "  1. Add to .env:  NATS_URL=tls://localhost:4222"
echo "  2. Add to .env:  NATS_CA_CERT=\$(pwd)/docker/nats/certs/ca.pem"
echo "  3. Restart NATS: ./dc restart nats"
