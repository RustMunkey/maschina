use anchor_lang::prelude::*;

declare_id!("STLMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");

// ─── Maschina Settlement Program ─────────────────────────────────────────────
//
// Responsibilities:
//   0. initialize_config — one-time setup of trusted payout account owners.
//   1. anchor_receipt    — stores a tamper-proof hash of an execution receipt on-chain.
//                          Any party can verify a run happened by checking this account.
//   2. init_node_vault   — creates per-node USDC vault (call once per node).
//   3. deposit_stake     — node runner locks USDC collateral.
//   4. add_earnings      — records earnings for a completed run, funds the vault.
//   5. withdraw_stake    — operator initiates withdrawal (after lock period).
//   6. slash_stake       — governance/validator slashes a misbehaving node.
//   7. settle_earnings   — distributes accumulated earnings (70/15/10/5 split).
//
// Account seeds (deterministic PDAs):
//   SettlementConfig:  ["config"]
//   ExecutionReceipt:  ["receipt", run_id]
//   NodeStake:         ["stake",   node_id]
//   SettlementPool:    ["pool",    node_id]
//   Vault:             ["vault",   node_id]

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

#[program]
pub mod settlement {
    use super::*;

    /// One-time initialisation of the global settlement config.
    /// Sets the trusted treasury, developer, and validators payout account owners.
    /// Must be called once by Maschina authority immediately after deploy.
    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        args: InitializeConfigArgs,
    ) -> Result<()> {
        instructions::initialize_config::handler(ctx, args)
    }

    /// Anchor an execution receipt on-chain.
    /// Stores a SHA-256 hash of the canonical receipt JSON + node Ed25519 signature.
    /// Emits an event so Helius webhooks can index it.
    pub fn anchor_receipt(ctx: Context<AnchorReceipt>, args: AnchorReceiptArgs) -> Result<()> {
        instructions::anchor_receipt::handler(ctx, args)
    }

    /// Initialise the per-node USDC vault. Call once after deposit_stake.
    pub fn init_node_vault(ctx: Context<InitNodeVault>, args: InitNodeVaultArgs) -> Result<()> {
        instructions::init_node_vault::handler(ctx, args)
    }

    /// Node runner deposits USDC stake.
    pub fn deposit_stake(ctx: Context<DepositStake>, args: DepositStakeArgs) -> Result<()> {
        instructions::deposit_stake::handler(ctx, args)
    }

    /// Record earnings for a completed run and fund the vault (called by Maschina authority).
    pub fn add_earnings(ctx: Context<AddEarnings>, args: AddEarningsArgs) -> Result<()> {
        instructions::add_earnings::handler(ctx, args)
    }

    /// Initiate stake withdrawal. Starts the lock period (7 days by default).
    pub fn withdraw_stake(ctx: Context<WithdrawStake>, args: WithdrawStakeArgs) -> Result<()> {
        instructions::withdraw_stake::handler(ctx, args)
    }

    /// Governance/validator slash. Burns slashBps basis points of staked collateral.
    pub fn slash_stake(ctx: Context<SlashStake>, args: SlashStakeArgs) -> Result<()> {
        instructions::slash_stake::handler(ctx, args)
    }

    /// Finalise a pending withdrawal after the 7-day lock has expired.
    pub fn finalise_withdrawal(
        ctx: Context<FinaliseWithdrawal>,
        args: FinaliseWithdrawalArgs,
    ) -> Result<()> {
        instructions::withdraw_stake::finalise_handler(ctx, args)
    }

    /// Settle accumulated earnings for a node (70/15/10/5 split: node runner/treasury/developer/validators).
    pub fn settle_earnings(ctx: Context<SettleEarnings>, args: SettleEarningsArgs) -> Result<()> {
        instructions::settle_earnings::handler(ctx, args)
    }
}
