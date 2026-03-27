use anchor_lang::prelude::*;

#[error_code]
pub enum SettlementError {
    #[msg("Invalid node signature")]
    InvalidSignature,

    #[msg("Receipt already anchored for this run")]
    ReceiptAlreadyExists,

    #[msg("Insufficient stake to withdraw requested amount")]
    InsufficientStake,

    #[msg("Withdrawal is still locked — wait for the lock period to expire")]
    WithdrawalLocked,

    #[msg("No pending withdrawal to finalise")]
    NoPendingWithdrawal,

    #[msg("Slash basis points must be between 1 and 10000")]
    InvalidSlashBps,

    #[msg("Nothing to settle — pool is empty")]
    EmptyPool,

    #[msg("Unauthorised: caller is not the node runner")]
    Unauthorised,

    #[msg("Vault has insufficient USDC to cover the settlement")]
    InsufficientVaultBalance,

    #[msg("Operator token account does not match node runner's registered wallet")]
    InvalidOperatorAccount,

    #[msg("Earnings amounts do not sum to total transferred")]
    EarningsMismatch,
}
