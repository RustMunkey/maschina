use anchor_lang::prelude::*;

use crate::errors::SettlementError;
use crate::state::{ExecutionReceipt, ReceiptAnchored, SettlementPool};

// ─── Args ─────────────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct AnchorReceiptArgs {
    pub run_id: [u8; 16],
    pub payload_hash: [u8; 32],
    pub node_signature: [u8; 64],
    pub node_pubkey: [u8; 32],
    pub agent_id: [u8; 16],
    pub user_id: [u8; 16],
    pub completed_at: i64,
    pub input_tokens: u64,
    pub output_tokens: u64,
    /// Billed amount in USDC lamports (6 decimals) for pool accumulation.
    pub billed_usdc: u64,
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(args: AnchorReceiptArgs)]
pub struct AnchorReceipt<'info> {
    /// The Maschina settlement authority (multisig / governance in prod).
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Execution receipt PDA — one per run_id, enforces idempotency.
    #[account(
        init,
        payer = authority,
        space = ExecutionReceipt::LEN,
        seeds = [b"receipt", args.run_id.as_ref()],
        bump,
    )]
    pub receipt: Account<'info, ExecutionReceipt>,

    /// Settlement pool for the node that executed the run.
    /// Must already exist (node must have registered stake before running jobs).
    #[account(
        mut,
        seeds = [b"pool", args.node_pubkey.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, SettlementPool>,

    pub system_program: Program<'info, System>,
}

// ─── Handler ──────────────────────────────────────────────────────────────────

pub fn handler(ctx: Context<AnchorReceipt>, args: AnchorReceiptArgs) -> Result<()> {
    // Verify Ed25519 node signature over the payload hash.
    // The node signs SHA-256(canonical receipt JSON); we verify the 64-byte sig
    // against the 32-byte payload hash using the node's pubkey.
    let valid = verify_ed25519(&args.node_pubkey, &args.payload_hash, &args.node_signature);
    require!(valid, SettlementError::InvalidSignature);

    // Write receipt.
    let receipt = &mut ctx.accounts.receipt;
    receipt.run_id = args.run_id;
    receipt.payload_hash = args.payload_hash;
    receipt.node_signature = args.node_signature;
    receipt.node_pubkey = args.node_pubkey;
    receipt.agent_id = args.agent_id;
    receipt.user_id = args.user_id;
    receipt.completed_at = args.completed_at;
    receipt.input_tokens = args.input_tokens;
    receipt.output_tokens = args.output_tokens;
    receipt.bump = ctx.bumps.receipt;

    // Accumulate earnings into the node's settlement pool.
    // Split: 65% node / 20% developer / 10% treasury / 5% validators.
    let pool = &mut ctx.accounts.pool;
    let node_share = args.billed_usdc * 65 / 100;
    let dev_share = args.billed_usdc * 20 / 100;
    let treasury_share = args.billed_usdc * 10 / 100;
    // Validator share = remainder (avoids rounding dust loss).
    let validator_share = args
        .billed_usdc
        .saturating_sub(node_share + dev_share + treasury_share);

    pool.pending_node = pool.pending_node.saturating_add(node_share);
    pool.pending_developer = pool.pending_developer.saturating_add(dev_share);
    pool.pending_treasury = pool.pending_treasury.saturating_add(treasury_share);
    pool.pending_validators = pool.pending_validators.saturating_add(validator_share);
    pool.run_count = pool.run_count.saturating_add(1);

    emit!(ReceiptAnchored {
        run_id: args.run_id,
        payload_hash: args.payload_hash,
        node_pubkey: args.node_pubkey,
        completed_at: args.completed_at,
    });

    Ok(())
}

// ─── Ed25519 verification ─────────────────────────────────────────────────────
// Anchor does not expose a built-in Ed25519 verify; we use the Solana
// Ed25519Program syscall via `solana_program::ed25519_program`.
// For simplicity in this skeleton we use curve25519_dalek via the
// `solana_program::instruction::Instruction` precompile pattern.
// In production this must use the Ed25519 precompile instruction approach
// (pass the sig instruction in the tx's instruction list and check it via
// `load_instruction_at_checked`).  This stub always returns true so the
// program compiles; replace before mainnet.
fn verify_ed25519(_pubkey: &[u8; 32], _message: &[u8; 32], _signature: &[u8; 64]) -> bool {
    // TODO: implement via Ed25519Program precompile instruction check.
    // See: https://docs.solana.com/developing/runtime-facilities/programs#ed25519-program
    true
}
