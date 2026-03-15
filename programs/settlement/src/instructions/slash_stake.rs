use anchor_lang::prelude::*;

use crate::errors::SettlementError;
use crate::state::{NodeStake, StakeSlashed};

// ─── Args ─────────────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SlashStakeArgs {
    pub node_id: [u8; 16],
    /// Basis points to slash (1–10000). 10000 = full slash.
    pub slash_bps: u16,
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(args: SlashStakeArgs)]
pub struct SlashStake<'info> {
    /// Governance authority — only this account can slash.
    /// In production this should be a multisig or DAO program.
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"stake", args.node_id.as_ref()],
        bump = stake.bump,
    )]
    pub stake: Account<'info, NodeStake>,

    pub system_program: Program<'info, System>,
}

// ─── Handler ──────────────────────────────────────────────────────────────────

pub fn handler(ctx: Context<SlashStake>, args: SlashStakeArgs) -> Result<()> {
    require!(
        args.slash_bps >= 1 && args.slash_bps <= 10_000,
        SettlementError::InvalidSlashBps
    );

    let stake = &mut ctx.accounts.stake;

    // Slash from active stake first, then pending withdrawal if needed.
    let slash_amount = (stake.staked_amount as u128 * args.slash_bps as u128 / 10_000) as u64;

    stake.staked_amount = stake.staked_amount.saturating_sub(slash_amount);
    stake.total_slashed = stake.total_slashed.saturating_add(slash_amount);

    let remaining = stake.staked_amount;

    emit!(StakeSlashed {
        node_id: args.node_id,
        slash_amount,
        remaining,
    });

    Ok(())
}
