// chain.rs — on-chain receipt anchoring via the Maschina settlement program
//
// After every successful run the ANALYZE phase calls `submit_receipt()`.
// The call is fire-and-forget (non-fatal): if it fails the run is still
// considered complete and the off-chain receipt in `execution_receipts` is
// the source of truth until the on-chain anchoring succeeds.
//
// Activation: set CHAIN_ENABLED=true + SOLANA_AUTHORITY_KEYPAIR + SETTLEMENT_PROGRAM_ID.
// All three must be set; if any is missing the function is a no-op.
//
// Program: programs/settlement — instruction `anchor_receipt`.

use anyhow::Context;
use borsh::BorshSerialize;
use sha2::{Digest, Sha256};
use solana_rpc_client::nonblocking::rpc_client::RpcClient;
use solana_sdk::{
    commitment_config::CommitmentConfig,
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    signature::Keypair,
    signer::Signer,
    system_program,
    transaction::Transaction,
};
use std::str::FromStr;
use tracing::{info, warn};
use uuid::Uuid;

use crate::config::Config;
use crate::db::Pool;
use crate::state::AppState;

// ─── Anchor helpers ───────────────────────────────────────────────────────────

/// Compute the 8-byte Anchor instruction discriminator.
/// Anchor uses SHA-256("global:<name>")[0..8].
fn discriminator(name: &str) -> [u8; 8] {
    let hash = Sha256::digest(format!("global:{name}").as_bytes());
    hash[..8].try_into().unwrap()
}

/// Borsh-serialisable args that mirror `AnchorReceiptArgs` in the Anchor program.
#[derive(BorshSerialize)]
struct AnchorReceiptArgs {
    run_id: [u8; 16],
    payload_hash: [u8; 32],
    node_signature: [u8; 64],
    node_pubkey: [u8; 32],
    agent_id: [u8; 16],
    user_id: [u8; 16],
    completed_at: i64,
    input_tokens: u64,
    output_tokens: u64,
    billed_usdc: u64,
}

// ─── Payload hash ─────────────────────────────────────────────────────────────

/// Deterministic SHA-256 commitment to core run fields.
/// SHA-256(run_id || agent_id || user_id || input_tokens_le || output_tokens_le)
/// Anyone can recompute this from the run record without the platform secret.
fn compute_payload_hash(
    run_id: Uuid,
    agent_id: Uuid,
    user_id: Uuid,
    input_tokens: u64,
    output_tokens: u64,
) -> [u8; 32] {
    let mut h = Sha256::new();
    h.update(run_id.as_bytes());
    h.update(agent_id.as_bytes());
    h.update(user_id.as_bytes());
    h.update(input_tokens.to_le_bytes());
    h.update(output_tokens.to_le_bytes());
    h.finalize().into()
}

// ─── Keypair loading ──────────────────────────────────────────────────────────

/// Load a Solana Keypair from:
///   1. A JSON byte-array string (e.g. `[1,2,...,64]`) — for Doppler/env secrets
///   2. A file path to a keypair JSON file (e.g. `~/.config/solana/id.json`)
fn load_keypair(value: &str) -> Option<Keypair> {
    // Attempt 1: raw JSON byte array
    if let Ok(bytes) = serde_json::from_str::<Vec<u8>>(value) {
        return Keypair::from_bytes(&bytes).ok();
    }
    // Attempt 2: file path
    if let Ok(contents) = std::fs::read_to_string(value) {
        if let Ok(bytes) = serde_json::from_str::<Vec<u8>>(&contents) {
            return Keypair::from_bytes(&bytes).ok();
        }
    }
    None
}

// ─── Public API ───────────────────────────────────────────────────────────────

/// Fire-and-forget: anchor an execution receipt on the Solana settlement program.
///
/// - Does nothing when `CHAIN_ENABLED` is false (default in dev).
/// - Logs a warning on failure but never panics or blocks the caller.
/// - `billed_usdc_lamports` — task price in USDC lamports (6 decimals).
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

    let config = state.config.clone();
    let db = state.db.clone();

    tokio::spawn(async move {
        match try_submit(
            &config,
            &db,
            run_id,
            agent_id,
            user_id,
            node_id,
            input_tokens,
            output_tokens,
            billed_usdc_lamports,
            completed_at,
        )
        .await
        {
            Ok(sig) => info!(run_id = %run_id, signature = %sig, "Receipt anchored on-chain"),
            Err(e) => warn!(run_id = %run_id, error = %e, "Failed to anchor receipt on-chain"),
        }
    });
}

// ─── Implementation ───────────────────────────────────────────────────────────

async fn try_submit(
    config: &Config,
    db: &Pool,
    run_id: Uuid,
    agent_id: Uuid,
    user_id: Uuid,
    node_id: Option<Uuid>,
    input_tokens: u64,
    output_tokens: u64,
    billed_usdc_lamports: u64,
    completed_at: i64,
) -> anyhow::Result<String> {
    // Load authority keypair
    let keypair_raw = config
        .solana_authority_keypair
        .as_deref()
        .context("SOLANA_AUTHORITY_KEYPAIR not configured")?;
    let authority =
        load_keypair(keypair_raw).context("Failed to parse SOLANA_AUTHORITY_KEYPAIR")?;

    let program_id =
        Pubkey::from_str(&config.settlement_program_id).context("Invalid SETTLEMENT_PROGRAM_ID")?;

    // Look up node's Ed25519 public key (hex) from DB.
    // Zero-padded when absent — the on-chain verifier currently stubs to true.
    let node_pubkey_bytes: [u8; 32] = match node_id {
        Some(nid) => {
            let hex_key: Option<String> =
                sqlx::query_scalar("SELECT public_key FROM nodes WHERE id = $1")
                    .bind(nid)
                    .fetch_optional(db)
                    .await
                    .unwrap_or(None)
                    .flatten();

            match hex_key {
                Some(k) => {
                    let bytes = hex::decode(&k).unwrap_or_default();
                    bytes.try_into().unwrap_or([0u8; 32])
                }
                None => [0u8; 32],
            }
        }
        None => [0u8; 32],
    };

    // Deterministic commitment to run data
    let payload_hash = compute_payload_hash(run_id, agent_id, user_id, input_tokens, output_tokens);

    // Derive PDAs
    let (receipt_pda, _) =
        Pubkey::find_program_address(&[b"receipt", run_id.as_bytes()], &program_id);
    let (pool_pda, _) = Pubkey::find_program_address(&[b"pool", &node_pubkey_bytes], &program_id);

    // Build instruction data: discriminator + borsh args
    let args = AnchorReceiptArgs {
        run_id: *run_id.as_bytes(),
        payload_hash,
        // Node signature stub — zeroed until node binary submits signed receipts.
        // The on-chain verify_ed25519() is also stubbed to true until Phase 6.
        node_signature: [0u8; 64],
        node_pubkey: node_pubkey_bytes,
        agent_id: *agent_id.as_bytes(),
        user_id: *user_id.as_bytes(),
        completed_at,
        input_tokens,
        output_tokens,
        billed_usdc: billed_usdc_lamports,
    };

    let mut ix_data = discriminator("anchor_receipt").to_vec();
    ix_data.extend_from_slice(&borsh::to_vec(&args)?);

    let instruction = Instruction {
        program_id,
        accounts: vec![
            AccountMeta::new(authority.pubkey(), true), // authority — payer + signer
            AccountMeta::new(receipt_pda, false),       // ExecutionReceipt PDA (init)
            AccountMeta::new(pool_pda, false),          // SettlementPool (mut, accumulates)
            AccountMeta::new_readonly(system_program::id(), false),
        ],
        data: ix_data,
    };

    let rpc = RpcClient::new_with_commitment(
        config.helius_rpc_url.clone(),
        CommitmentConfig::confirmed(),
    );

    let blockhash = rpc
        .get_latest_blockhash()
        .await
        .context("RPC: get_latest_blockhash failed")?;

    let tx = Transaction::new_signed_with_payer(
        &[instruction],
        Some(&authority.pubkey()),
        &[&authority],
        blockhash,
    );

    let signature = rpc
        .send_and_confirm_transaction(&tx)
        .await
        .context("RPC: send_and_confirm_transaction failed")?;

    Ok(signature.to_string())
}
