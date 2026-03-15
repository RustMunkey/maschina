use anchor_lang::prelude::*;

use crate::errors::SettlementError;
use crate::state::NodeStake;

/// 7-day lock period before withdrawal can be finalised.
const WITHDRAWAL_LOCK_SECS: i64 = 7 * 24 * 60 * 60;

// ─── Args ─────────────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct WithdrawStakeArgs {
    pub node_id: [u8; 16],
    /// Amount in USDC lamports to withdraw.
    pub amount: u64,
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(args: WithdrawStakeArgs)]
pub struct WithdrawStake<'info> {
    /// Must be the registered operator for this node.
    #[account(mut)]
    pub operator: Signer<'info>,

    #[account(
        mut,
        seeds = [b"stake", args.node_id.as_ref()],
        bump = stake.bump,
        has_one = operator @ SettlementError::Unauthorised,
    )]
    pub stake: Account<'info, NodeStake>,

    pub system_program: Program<'info, System>,
}

// ─── Handler ──────────────────────────────────────────────────────────────────

pub fn handler(ctx: Context<WithdrawStake>, args: WithdrawStakeArgs) -> Result<()> {
    let stake = &mut ctx.accounts.stake;

    require!(
        stake.staked_amount >= args.amount,
        SettlementError::InsufficientStake
    );

    // Initiate withdrawal — lock for 7 days.
    // A second call before the lock expires simply increases the pending amount
    // and resets the timer (operator must wait again from this moment).
    stake.staked_amount = stake.staked_amount.saturating_sub(args.amount);
    stake.pending_withdrawal = stake.pending_withdrawal.saturating_add(args.amount);

    let clock = Clock::get()?;
    stake.withdrawal_unlocks_at = clock.unix_timestamp + WITHDRAWAL_LOCK_SECS;

    Ok(())
}

// ─── FinaliseWithdrawal ───────────────────────────────────────────────────────
// Separate args/context/handler so the program exposes it as a distinct ix.

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct FinaliseWithdrawalArgs {
    pub node_id: [u8; 16],
}

#[derive(Accounts)]
#[instruction(args: FinaliseWithdrawalArgs)]
pub struct FinaliseWithdrawal<'info> {
    #[account(mut)]
    pub operator: Signer<'info>,

    #[account(
        mut,
        seeds = [b"stake", args.node_id.as_ref()],
        bump = stake.bump,
        has_one = operator @ SettlementError::Unauthorised,
    )]
    pub stake: Account<'info, NodeStake>,

    pub system_program: Program<'info, System>,
}

pub fn finalise_handler(
    ctx: Context<FinaliseWithdrawal>,
    _args: FinaliseWithdrawalArgs,
) -> Result<()> {
    let stake = &mut ctx.accounts.stake;

    require!(
        stake.pending_withdrawal > 0,
        SettlementError::NoPendingWithdrawal
    );

    let clock = Clock::get()?;
    require!(
        clock.unix_timestamp >= stake.withdrawal_unlocks_at,
        SettlementError::WithdrawalLocked
    );

    // NOTE: actual SPL token transfer to operator omitted (skeleton).
    // Reset withdrawal state.
    stake.pending_withdrawal = 0;
    stake.withdrawal_unlocks_at = 0;

    Ok(())
}
