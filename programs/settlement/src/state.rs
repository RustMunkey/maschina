use anchor_lang::prelude::*;

// ─── ExecutionReceipt ─────────────────────────────────────────────────────────
// On-chain proof that a specific agent run happened.
// Keyed by [b"receipt", run_id].

#[account]
#[derive(Default)]
pub struct ExecutionReceipt {
    /// The Maschina run UUID (16 bytes, stored as [u8; 16])
    pub run_id: [u8; 16],
    /// SHA-256 of the canonical receipt JSON (32 bytes)
    pub payload_hash: [u8; 32],
    /// Ed25519 signature from the node's keypair (64 bytes)
    pub node_signature: [u8; 64],
    /// Node public key that signed this receipt (32 bytes)
    pub node_pubkey: [u8; 32],
    /// Agent UUID (16 bytes)
    pub agent_id: [u8; 16],
    /// User UUID (16 bytes)
    pub user_id: [u8; 16],
    /// Unix timestamp of run completion
    pub completed_at: i64,
    /// Input tokens (billed, after multiplier)
    pub input_tokens: u64,
    /// Output tokens (billed, after multiplier)
    pub output_tokens: u64,
    /// Bump seed for PDA
    pub bump: u8,
}

impl ExecutionReceipt {
    // 8 discriminator + fields
    pub const LEN: usize = 8 + 16 + 32 + 64 + 32 + 16 + 16 + 8 + 8 + 8 + 1;
}

// ─── NodeStake ────────────────────────────────────────────────────────────────
// Tracks a node operator's staked USDC collateral.
// Keyed by [b"stake", node_id].

#[account]
#[derive(Default)]
pub struct NodeStake {
    /// Node UUID (16 bytes)
    pub node_id: [u8; 16],
    /// Node operator's Solana wallet
    pub operator: Pubkey,
    /// Staked amount in USDC lamports (6 decimals)
    pub staked_amount: u64,
    /// Pending withdrawal amount (0 if no active withdrawal)
    pub pending_withdrawal: u64,
    /// Unix timestamp when withdrawal unlocks (0 if none)
    pub withdrawal_unlocks_at: i64,
    /// Total slashed across lifetime (for reputation tracking)
    pub total_slashed: u64,
    /// Bump seed
    pub bump: u8,
}

impl NodeStake {
    pub const LEN: usize = 8 + 16 + 32 + 8 + 8 + 8 + 8 + 1;
}

// ─── SettlementPool ───────────────────────────────────────────────────────────
// Accumulated unsettled earnings for a node.
// Keyed by [b"pool", node_id].

#[account]
#[derive(Default)]
pub struct SettlementPool {
    /// Node UUID (16 bytes)
    pub node_id: [u8; 16],
    /// Node operator's Solana wallet (receives node_cents share)
    pub operator: Pubkey,
    /// Pending node earnings in USDC lamports
    pub pending_node: u64,
    /// Pending developer earnings
    pub pending_developer: u64,
    /// Pending treasury earnings
    pub pending_treasury: u64,
    /// Pending validator earnings
    pub pending_validators: u64,
    /// Total runs contributing to this pool
    pub run_count: u64,
    /// Bump seed
    pub bump: u8,
}

impl SettlementPool {
    pub const LEN: usize = 8 + 16 + 32 + 8 + 8 + 8 + 8 + 8 + 1;
}

// ─── Events ───────────────────────────────────────────────────────────────────

#[event]
pub struct ReceiptAnchored {
    pub run_id: [u8; 16],
    pub payload_hash: [u8; 32],
    pub node_pubkey: [u8; 32],
    pub completed_at: i64,
}

#[event]
pub struct StakeDeposited {
    pub node_id: [u8; 16],
    pub operator: Pubkey,
    pub amount: u64,
    pub new_total: u64,
}

#[event]
pub struct StakeSlashed {
    pub node_id: [u8; 16],
    pub slash_amount: u64,
    pub remaining: u64,
}

#[event]
pub struct EarningsSettled {
    pub node_id: [u8; 16],
    pub node_amount: u64,
    pub developer_amount: u64,
    pub treasury_amount: u64,
    pub validator_amount: u64,
}
