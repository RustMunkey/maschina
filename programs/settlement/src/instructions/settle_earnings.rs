use anchor_lang::prelude::*;

use crate::errors::SettlementError;
use crate::state::{EarningsSettled, SettlementPool};

// ─── Args ─────────────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SettleEarningsArgs {
    pub node_id: [u8; 16],
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(args: SettleEarningsArgs)]
pub struct SettleEarnings<'info> {
    /// Settlement authority (Maschina multisig) — initiates the payout sweep.
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        seeds = [b"pool", args.node_id.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, SettlementPool>,

    /// Node operator wallet — receives the 65% node share.
    /// CHECK: validated via pool.operator == operator.key()
    #[account(
        mut,
        constraint = pool.operator == operator.key(),
    )]
    pub operator: AccountInfo<'info>,

    /// Developer treasury wallet.
    /// CHECK: off-chain validation; address enforced by authority multisig.
    #[account(mut)]
    pub developer: AccountInfo<'info>,

    /// Maschina treasury wallet.
    /// CHECK: off-chain validation; address enforced by authority multisig.
    #[account(mut)]
    pub treasury: AccountInfo<'info>,

    /// Validator pool wallet (distributed off-chain per validator weight).
    /// CHECK: off-chain validation; address enforced by authority multisig.
    #[account(mut)]
    pub validators: AccountInfo<'info>,

    pub system_program: Program<'info, System>,
}

// ─── Handler ──────────────────────────────────────────────────────────────────

pub fn handler(ctx: Context<SettleEarnings>, args: SettleEarningsArgs) -> Result<()> {
    let pool = &mut ctx.accounts.pool;

    let node_amount = pool.pending_node;
    let developer_amount = pool.pending_developer;
    let treasury_amount = pool.pending_treasury;
    let validator_amount = pool.pending_validators;

    let total = node_amount + developer_amount + treasury_amount + validator_amount;
    require!(total > 0, SettlementError::EmptyPool);

    // NOTE: actual SPL USDC transfers omitted in this skeleton.
    // In production each share is transferred via token::transfer CPI against
    // the program's USDC vault account, then the pool is zeroed.

    // Zero out the pool.
    pool.pending_node = 0;
    pool.pending_developer = 0;
    pool.pending_treasury = 0;
    pool.pending_validators = 0;
    pool.run_count = 0;

    emit!(EarningsSettled {
        node_id: args.node_id,
        node_amount,
        developer_amount,
        treasury_amount,
        validator_amount,
    });

    Ok(())
}
