use anchor_lang::prelude::*;
use anchor_spl::associated_token::AssociatedToken;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::state::{SettlementPool, VAULT_SEED};

// ─── Args ─────────────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitNodeVaultArgs {
    pub node_id: [u8; 16],
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(args: InitNodeVaultArgs)]
pub struct InitNodeVault<'info> {
    /// Payer — typically the node runner registering for the first time.
    #[account(mut)]
    pub payer: Signer<'info>,

    /// Pool PDA — must already exist (created via deposit_stake).
    #[account(
        seeds = [b"pool", args.node_id.as_ref()],
        bump = pool.bump,
    )]
    pub pool: Account<'info, SettlementPool>,

    /// USDC mint.
    /// On devnet use: 4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU
    /// On mainnet use: EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v
    pub usdc_mint: Account<'info, Mint>,

    /// Per-node USDC vault. Authority = pool PDA so only the program can move funds.
    /// Seeded with [VAULT_SEED, node_id] to keep it deterministic and auditable.
    #[account(
        init,
        payer = payer,
        seeds = [VAULT_SEED, args.node_id.as_ref()],
        bump,
        token::mint = usdc_mint,
        token::authority = pool,
    )]
    pub vault: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

// ─── Handler ──────────────────────────────────────────────────────────────────

pub fn handler(ctx: Context<InitNodeVault>, _args: InitNodeVaultArgs) -> Result<()> {
    // The account is fully initialised by the #[account(init)] constraint.
    // We just log that the vault is ready.
    msg!(
        "Vault initialised for node pool {}",
        ctx.accounts.pool.key()
    );
    Ok(())
}
