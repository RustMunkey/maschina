use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::errors::SettlementError;
use crate::state::{EarningsRecorded, SettlementPool, VAULT_SEED};

// ─── Args ─────────────────────────────────────────────────────────────────────
//
// Called by the Maschina settlement authority after each job (or batch).
// Transfers USDC into the node's vault and records the split in the pool.
//
// The split must exactly match the protocol parameters (70/15/10/5).
// The authority is responsible for computing the correct amounts off-chain.

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct AddEarningsArgs {
    pub node_id: [u8; 16],
    /// Run ID — stored in the event for off-chain reconciliation.
    pub run_id: [u8; 16],
    /// Node runner's share in USDC lamports (70%).
    pub node_amount: u64,
    /// Developer royalty in USDC lamports (10%, 0 for first-party agents).
    pub developer_amount: u64,
    /// Treasury share in USDC lamports (15%, or 25% when developer_amount == 0).
    pub treasury_amount: u64,
    /// Validators share in USDC lamports (5%).
    pub validator_amount: u64,
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(args: AddEarningsArgs)]
pub struct AddEarnings<'info> {
    /// Settlement authority (Maschina multisig) — signs and funds the transfer.
    #[account(mut)]
    pub authority: Signer<'info>,

    /// USDC mint.
    pub usdc_mint: Account<'info, Mint>,

    /// Settlement authority's USDC token account — source of funds.
    #[account(
        mut,
        token::mint = usdc_mint,
        token::authority = authority,
    )]
    pub authority_usdc: Account<'info, TokenAccount>,

    /// Pool PDA — accumulates pending earnings.
    #[account(
        mut,
        seeds = [b"pool", args.node_id.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, SettlementPool>,

    /// Per-node USDC vault — receives the total earnings.
    #[account(
        mut,
        seeds = [VAULT_SEED, args.node_id.as_ref()],
        bump,
        token::mint = usdc_mint,
        token::authority = pool,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
}

// ─── Handler ──────────────────────────────────────────────────────────────────

pub fn handler(ctx: Context<AddEarnings>, args: AddEarningsArgs) -> Result<()> {
    let total = args
        .node_amount
        .checked_add(args.developer_amount)
        .and_then(|s| s.checked_add(args.treasury_amount))
        .and_then(|s| s.checked_add(args.validator_amount))
        .ok_or(SettlementError::EarningsMismatch)?;

    require!(total > 0, SettlementError::EarningsMismatch);

    // Transfer total USDC from authority into the vault.
    token::transfer(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(),
            Transfer {
                from: ctx.accounts.authority_usdc.to_account_info(),
                to: ctx.accounts.vault.to_account_info(),
                authority: ctx.accounts.authority.to_account_info(),
            },
        ),
        total,
    )?;

    // Accumulate in pool.
    let pool = &mut ctx.accounts.pool;
    pool.pending_node = pool
        .pending_node
        .checked_add(args.node_amount)
        .ok_or(SettlementError::EarningsMismatch)?;
    pool.pending_developer = pool
        .pending_developer
        .checked_add(args.developer_amount)
        .ok_or(SettlementError::EarningsMismatch)?;
    pool.pending_treasury = pool
        .pending_treasury
        .checked_add(args.treasury_amount)
        .ok_or(SettlementError::EarningsMismatch)?;
    pool.pending_validators = pool
        .pending_validators
        .checked_add(args.validator_amount)
        .ok_or(SettlementError::EarningsMismatch)?;
    pool.run_count = pool.run_count.saturating_add(1);

    emit!(EarningsRecorded {
        node_id: args.node_id,
        run_id: args.run_id,
        total_amount: total,
        new_pending_node: pool.pending_node,
        new_pending_treasury: pool.pending_treasury,
    });

    Ok(())
}
