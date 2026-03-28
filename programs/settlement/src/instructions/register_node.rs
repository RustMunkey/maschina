use anchor_lang::prelude::*;

use crate::state::{NodeIdentity, NodeRegistered};

// ─── Args ─────────────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct RegisterNodeArgs {
    /// Node UUID (16 bytes).
    pub node_id: [u8; 16],
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(args: RegisterNodeArgs)]
pub struct RegisterNode<'info> {
    /// Node runner paying for account creation.
    #[account(mut)]
    pub operator: Signer<'info>,

    /// NodeIdentity PDA — one per node, non-transferable on-chain SBT.
    #[account(
        init,
        payer = operator,
        space = NodeIdentity::LEN,
        seeds = [b"identity", args.node_id.as_ref()],
        bump,
    )]
    pub identity: Account<'info, NodeIdentity>,

    pub system_program: Program<'info, System>,
}

// ─── Handler ──────────────────────────────────────────────────────────────────

pub fn handler(ctx: Context<RegisterNode>, args: RegisterNodeArgs) -> Result<()> {
    let identity = &mut ctx.accounts.identity;
    let operator = ctx.accounts.operator.key();
    let clock = Clock::get()?;

    identity.node_id = args.node_id;
    identity.operator = operator;
    identity.tier = 0; // 0 = access, 1 = verified, 2 = elite
    identity.join_timestamp = clock.unix_timestamp;
    identity.total_runs = 0;
    identity.reputation_score = 100; // start at 100, slashing reduces it
    identity.is_active = true;
    identity.bump = ctx.bumps.identity;

    emit!(NodeRegistered {
        node_id: args.node_id,
        operator,
        join_timestamp: clock.unix_timestamp,
    });

    Ok(())
}
