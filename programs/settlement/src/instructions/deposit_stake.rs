use anchor_lang::prelude::*;

use crate::state::{NodeStake, SettlementPool, StakeDeposited};

// ─── Args ─────────────────────────────────────────────────────────────────────

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct DepositStakeArgs {
    /// Node UUID (16 bytes).
    pub node_id: [u8; 16],
    /// Amount in USDC lamports (6 decimals) to stake.
    pub amount: u64,
}

// ─── Accounts ─────────────────────────────────────────────────────────────────

#[derive(Accounts)]
#[instruction(args: DepositStakeArgs)]
pub struct DepositStake<'info> {
    /// Node operator — must be the signer. Their SOL pays for rent if accounts
    /// are new; USDC transfer is handled by the SPL token CPI (future).
    #[account(mut)]
    pub operator: Signer<'info>,

    /// NodeStake PDA — created on first deposit.
    #[account(
        init_if_needed,
        payer = operator,
        space = NodeStake::LEN,
        seeds = [b"stake", args.node_id.as_ref()],
        bump,
    )]
    pub stake: Account<'info, NodeStake>,

    /// SettlementPool PDA — created on first deposit.
    #[account(
        init_if_needed,
        payer = operator,
        space = SettlementPool::LEN,
        seeds = [b"pool", args.node_id.as_ref()],
        bump,
    )]
    pub pool: Account<'info, SettlementPool>,

    pub system_program: Program<'info, System>,
}

// ─── Handler ──────────────────────────────────────────────────────────────────

pub fn handler(ctx: Context<DepositStake>, args: DepositStakeArgs) -> Result<()> {
    let stake = &mut ctx.accounts.stake;
    let pool = &mut ctx.accounts.pool;
    let operator = ctx.accounts.operator.key();

    // Initialise on first deposit.
    if stake.staked_amount == 0 && stake.node_id == [0u8; 16] {
        stake.node_id = args.node_id;
        stake.operator = operator;
        stake.bump = ctx.bumps.stake;

        pool.node_id = args.node_id;
        pool.operator = operator;
        pool.bump = ctx.bumps.pool;
    }

    // NOTE: actual USDC transfer via SPL Token CPI omitted in this skeleton.
    // The on-chain amount is incremented trustlessly once the token transfer is
    // verified. For now we trust the settlement authority to call this only
    // after confirming the SPL transfer in the same transaction.
    stake.staked_amount = stake.staked_amount.saturating_add(args.amount);
    let new_total = stake.staked_amount;

    emit!(StakeDeposited {
        node_id: args.node_id,
        operator,
        amount: args.amount,
        new_total,
    });

    Ok(())
}
