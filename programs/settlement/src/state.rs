use anchor_lang::prelude::*;

// ─── ExecutionReceipt ─────────────────────────────────────────────────────────
// On-chain proof that a specific agent run happened.
// Keyed by [b"receipt", run_id].

#[account]
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

impl Default for ExecutionReceipt {
    fn default() -> Self {
        Self {
            run_id: [0u8; 16],
            payload_hash: [0u8; 32],
            node_signature: [0u8; 64],
            node_pubkey: [0u8; 32],
            agent_id: [0u8; 16],
            user_id: [0u8; 16],
            completed_at: 0,
            input_tokens: 0,
            output_tokens: 0,
            bump: 0,
        }
    }
}

impl ExecutionReceipt {
    // 8 discriminator + fields
    pub const LEN: usize = 8 + 16 + 32 + 64 + 32 + 16 + 16 + 8 + 8 + 8 + 1;
}

// ─── NodeStake ────────────────────────────────────────────────────────────────
// Tracks a node runner's staked USDC collateral.
// Keyed by [b"stake", node_id].

#[account]
#[derive(Default)]
pub struct NodeStake {
    /// Node UUID (16 bytes)
    pub node_id: [u8; 16],
    /// Node runner's Solana wallet
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

// ─── SettlementConfig ─────────────────────────────────────────────────────────
// Global program config — stores trusted payout account owners.
// Keyed by [b"config"]. Initialized once by Maschina authority.
// Prevents anyone from routing treasury/developer/validator payouts to
// arbitrary accounts during settle_earnings.

#[account]
pub struct SettlementConfig {
    /// Maschina settlement authority — the only key allowed to call settle_earnings.
    pub authority: Pubkey,
    /// Owner of the treasury USDC token account (Maschina treasury multisig).
    pub treasury_key: Pubkey,
    /// Owner of the developer USDC token account (marketplace developer fee wallet).
    pub developer_key: Pubkey,
    /// Owner of the validators USDC token account (validators pool wallet).
    pub validators_key: Pubkey,
    /// Bump seed
    pub bump: u8,
}

impl SettlementConfig {
    pub const LEN: usize = 8 + 32 + 32 + 32 + 32 + 1;
    pub const SEED: &'static [u8] = b"config";
}

// ─── NodeIdentity ─────────────────────────────────────────────────────────────
// On-chain SBT (non-transferable by design — no token, just a PDA).
// One per node runner. Keyed by [b"identity", node_id].
// Authority is the operator — only they can init. Program can update fields.

#[account]
#[derive(Default)]
pub struct NodeIdentity {
    /// Node UUID (16 bytes)
    pub node_id: [u8; 16],
    /// Node runner's Solana wallet — the one who registered
    pub operator: Pubkey,
    /// Tier: 0=access, 1=verified, 2=elite (updated by authority based on stake/rep)
    pub tier: u8,
    /// Unix timestamp of registration
    pub join_timestamp: i64,
    /// Total completed runs across lifetime
    pub total_runs: u64,
    /// Reputation score 0-1000 (starts at 100, slashing reduces, good runs increase)
    pub reputation_score: u16,
    /// Whether the node is currently active
    pub is_active: bool,
    /// Bump seed
    pub bump: u8,
}

impl NodeIdentity {
    // 8 discriminator + 16 + 32 + 1 + 8 + 8 + 2 + 1 + 1
    pub const LEN: usize = 8 + 16 + 32 + 1 + 8 + 8 + 2 + 1 + 1;
}

// ─── Vault seed helper ────────────────────────────────────────────────────────
// The per-node USDC vault is a token account whose authority is the pool PDA.
// Seeds: [b"vault", node_id]. Created by init_node_vault.

pub const VAULT_SEED: &[u8] = b"vault";

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

#[event]
pub struct NodeRegistered {
    pub node_id: [u8; 16],
    pub operator: Pubkey,
    pub join_timestamp: i64,
}

#[event]
pub struct EarningsRecorded {
    pub node_id: [u8; 16],
    pub run_id: [u8; 16],
    pub total_amount: u64,
    pub new_pending_node: u64,
    pub new_pending_treasury: u64,
}
