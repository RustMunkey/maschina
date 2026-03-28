use anchor_lang::prelude::*;

use crate::errors::SettlementError;
use crate::state::SettlementConfig;

// ─── Args ─────────────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeConfigArgs {
    /// Owner of the treasury USDC token account.
    pub treasury_key: Pubkey,
    /// Owner of the developer USDC token account.
    pub developer_key: Pubkey,
    /// Owner of the validators USDC token account.
    pub validators_key: Pubkey,
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    /// Maschina settlement authority — becomes the only key allowed to settle.
    #[account(mut)]
    pub authority: Signer<'info>,

    /// Global config PDA — created once, never re-initialised.
    #[account(
        init,
        payer = authority,
        space = SettlementConfig::LEN,
        seeds = [SettlementConfig::SEED],
        bump,
    )]
    pub config: Account<'info, SettlementConfig>,

    pub system_program: Program<'info, System>,
}

// ─── Handler ──────────────────────────────────────────────────────────────────

pub fn handler(ctx: Context<InitializeConfig>, args: InitializeConfigArgs) -> Result<()> {
    let config = &mut ctx.accounts.config;
    config.authority = ctx.accounts.authority.key();
    config.treasury_key = args.treasury_key;
    config.developer_key = args.developer_key;
    config.validators_key = args.validators_key;
    config.bump = ctx.bumps.config;
    Ok(())
}
