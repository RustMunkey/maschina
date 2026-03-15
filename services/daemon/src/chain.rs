// chain.rs — on-chain receipt anchoring via NATS event dispatch
//
// After every successful run the ANALYZE phase calls `submit_receipt()`.
// Rather than calling Solana directly (which would require heavy SDK deps),
// the daemon publishes a `maschina.chain.receipt.anchor` JetStream message.
// A dedicated chain worker (services/worker) consumes it and submits the
// Anchor instruction to the settlement program.
//
// This keeps the daemon lean and makes the Solana submission retryable —
// if the worker is down, JetStream holds the message until it comes back up.
//
// Activation: set CHAIN_ENABLED=true. Off by default in dev.

use serde::Serialize;
use tracing::{info, warn};
use uuid::Uuid;

use crate::state::AppState;

pub const SUBJECT: &str = "maschina.chain.receipt.anchor";

/// Payload published to NATS for the chain worker to pick up.
#[derive(Serialize)]
pub struct AnchorReceiptEvent {
    pub run_id: String,
    pub agent_id: String,
    pub user_id: String,
    /// Node ID — worker uses this to look up the node's Ed25519 public key.
    pub node_id: Option<String>,
    pub input_tokens: u64,
    pub output_tokens: u64,
    /// Task price in USDC lamports (6 decimals).
    pub billed_usdc_lamports: u64,
    pub completed_at: i64,
}

/// Fire-and-forget: publish a receipt anchoring event to NATS JetStream.
/// The chain worker consumes this and submits to the Anchor settlement program.
/// No-op when `CHAIN_ENABLED` is false (default in dev).
#[allow(clippy::too_many_arguments)]
pub fn submit_receipt(
    state: &AppState,
    run_id: Uuid,
    agent_id: Uuid,
    user_id: Uuid,
    node_id: Option<Uuid>,
    input_tokens: u64,
    output_tokens: u64,
    billed_usdc_lamports: u64,
    completed_at: i64,
) {
    if !state.config.chain_enabled {
        return;
    }

    let js = state.jetstream.clone();
    let event = AnchorReceiptEvent {
        run_id: run_id.to_string(),
        agent_id: agent_id.to_string(),
        user_id: user_id.to_string(),
        node_id: node_id.map(|id| id.to_string()),
        input_tokens,
        output_tokens,
        billed_usdc_lamports,
        completed_at,
    };

    tokio::spawn(async move {
        let payload = match serde_json::to_vec(&event) {
            Ok(b) => b,
            Err(e) => {
                warn!(run_id = %event.run_id, error = %e, "Failed to serialise chain event");
                return;
            }
        };

        match js.publish(SUBJECT, payload.into()).await {
            Ok(_) => info!(run_id = %event.run_id, "Chain receipt event published to NATS"),
            Err(e) => warn!(run_id = %event.run_id, error = %e, "Failed to publish chain event"),
        }
    });
}
