FROM rust:1.88-slim AS builder
WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

# Cache dependencies
COPY Cargo.toml .
RUN mkdir src && echo 'fn main() {}' > src/main.rs
RUN cargo build --release 2>/dev/null || true

# Build real binary
COPY src ./src
RUN touch src/main.rs && cargo build --release

# ─── Runtime image ────────────────────────────────────────────────────────────
FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates libssl3 && rm -rf /var/lib/apt/lists/*
COPY --from=builder /app/target/release/maschina-gateway /usr/local/bin/maschina-gateway
EXPOSE 8080
CMD ["maschina-gateway"]
