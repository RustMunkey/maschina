use anchor_lang::prelude::*;

declare_id!("STLMxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx");

// ─── Maschina Settlement Program ─────────────────────────────────────────────
//
// Responsibilities:
//   1. anchor_receipt   — stores a tamper-proof hash of an execution receipt on-chain.
//                         Any party can verify a run happened by checking this account.
//   2. deposit_stake    — node operator locks USDC collateral.
//   3. withdraw_stake   — operator initiates withdrawal (after lock period).
//   4. slash_stake      — governance/validator slashes a misbehaving node.
//   5. settle_earnings  — distributes accumulated earnings to node/developer/treasury/validators.
//
// Account seeds (deterministic PDAs):
//   ExecutionReceipt: ["receipt", run_id]
//   NodeStake:        ["stake",   node_id]
//   SettlementPool:   ["pool",    node_id]

pub mod errors;
pub mod instructions;
pub mod state;

use instructions::*;

#[program]
pub mod settlement {
    use super::*;

    /// Anchor an execution receipt on-chain.
    /// Stores a SHA-256 hash of the canonical receipt JSON + node Ed25519 signature.
    /// Emits an event so Helius webhooks can index it.
    pub fn anchor_receipt(ctx: Context<AnchorReceipt>, args: AnchorReceiptArgs) -> Result<()> {
        instructions::anchor_receipt::handler(ctx, args)
    }

    /// Node operator deposits USDC stake.
    pub fn deposit_stake(ctx: Context<DepositStake>, args: DepositStakeArgs) -> Result<()> {
        instructions::deposit_stake::handler(ctx, args)
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

    /// Settle accumulated earnings for a node (65/20/10/5 split).
    pub fn settle_earnings(ctx: Context<SettleEarnings>, args: SettleEarningsArgs) -> Result<()> {
        instructions::settle_earnings::handler(ctx, args)
    }
}
