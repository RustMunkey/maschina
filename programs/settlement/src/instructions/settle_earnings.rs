use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::errors::SettlementError;
use crate::state::{EarningsSettled, SettlementPool, VAULT_SEED};

// ─── Args ─────────────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct SettleEarningsArgs {
    pub node_id: [u8; 16],
}

// ─── Accounts ─────────────────────────────────────────────────────────────────
//
// Sweeps all pending earnings from the vault to recipients.
// The developer, treasury, and validators accounts are validated off-chain
// by the settlement authority (Maschina multisig). The operator account is
// verified on-chain against pool.operator.

#[derive(Accounts)]
#[instruction(args: SettleEarningsArgs)]
pub struct SettleEarnings<'info> {
    /// Settlement authority (Maschina multisig) — initiates the payout sweep.
    #[account(mut)]
    pub authority: Signer<'info>,

    /// USDC mint.
    pub usdc_mint: Account<'info, Mint>,

    /// Pool PDA — holds accumulated pending amounts.
    #[account(
        mut,
        seeds = [b"pool", args.node_id.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, SettlementPool>,

    /// Per-node USDC vault — source of all payouts. Authority = pool PDA.
    #[account(
        mut,
        seeds = [VAULT_SEED, args.node_id.as_ref()],
        bump,
        token::mint = usdc_mint,
        token::authority = pool,
    )]
    pub vault: Account<'info, TokenAccount>,

    /// Node runner's USDC token account — receives 70%.
    /// Must be owned by pool.operator (the registered wallet for this node).
    #[account(
        mut,
        token::mint = usdc_mint,
        constraint = operator_usdc.owner == pool.operator @ SettlementError::InvalidOperatorAccount,
    )]
    pub operator_usdc: Account<'info, TokenAccount>,

    /// Developer's USDC token account — receives 10% (0 for first-party agents).
    /// Validated off-chain by the settlement authority.
    #[account(mut, token::mint = usdc_mint)]
    pub developer_usdc: Account<'info, TokenAccount>,

    /// Maschina treasury USDC token account — receives 15% (25% if no developer).
    /// Validated off-chain by the settlement authority.
    #[account(mut, token::mint = usdc_mint)]
    pub treasury_usdc: Account<'info, TokenAccount>,

    /// Validators pool USDC token account — receives 5%.
    /// Validated off-chain by the settlement authority.
    #[account(mut, token::mint = usdc_mint)]
    pub validators_usdc: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
}

// ─── Handler ──────────────────────────────────────────────────────────────────

pub fn handler(ctx: Context<SettleEarnings>, args: SettleEarningsArgs) -> Result<()> {
    let pool = &ctx.accounts.pool;

    let node_amount = pool.pending_node;
    let developer_amount = pool.pending_developer;
    let treasury_amount = pool.pending_treasury;
    let validator_amount = pool.pending_validators;

    let total = node_amount
        .checked_add(developer_amount)
        .and_then(|s| s.checked_add(treasury_amount))
        .and_then(|s| s.checked_add(validator_amount))
        .ok_or(SettlementError::EarningsMismatch)?;

    require!(total > 0, SettlementError::EmptyPool);
    require!(
        ctx.accounts.vault.amount >= total,
        SettlementError::InsufficientVaultBalance
    );

    // PDA signer: pool signs on behalf of the vault.
    let pool_seeds: &[&[u8]] = &[b"pool", &args.node_id, &[pool.bump]];
    let signer_seeds = &[pool_seeds];

    // Transfer: vault → node runner (70%)
    if node_amount > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.operator_usdc.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                signer_seeds,
            ),
            node_amount,
        )?;
    }

    // Transfer: vault → developer (10%)
    if developer_amount > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.developer_usdc.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                signer_seeds,
            ),
            developer_amount,
        )?;
    }

    // Transfer: vault → treasury (15%, or 25% when developer_amount == 0)
    if treasury_amount > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.treasury_usdc.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                signer_seeds,
            ),
            treasury_amount,
        )?;
    }

    // Transfer: vault → validators (5%)
    if validator_amount > 0 {
        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.vault.to_account_info(),
                    to: ctx.accounts.validators_usdc.to_account_info(),
                    authority: ctx.accounts.pool.to_account_info(),
                },
                signer_seeds,
            ),
            validator_amount,
        )?;
    }

    // Zero out the pool.
    let pool = &mut ctx.accounts.pool;
    pool.pending_node = 0;
    pool.pending_developer = 0;
    pool.pending_treasury = 0;
    pool.pending_validators = 0;

    emit!(EarningsSettled {
        node_id: args.node_id,
        node_amount,
        developer_amount,
        treasury_amount,
        validator_amount,
    });

    Ok(())
}
