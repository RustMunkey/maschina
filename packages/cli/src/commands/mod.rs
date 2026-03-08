pub mod agent;
pub mod doctor;
pub mod keys;
pub mod login;
pub mod logs;
pub mod service;
pub mod setup;
pub mod status;
pub mod usage;

use anyhow::Result;
use crate::{client::ApiClient, config};

/// Load config and return an authenticated client, or fail with a helpful message.
pub fn require_auth(profile: &str) -> Result<(config::Config, ApiClient)> {
    let cfg = config::load(profile)?;
    if !cfg.is_authenticated() {
        anyhow::bail!(
            "not authenticated — run `maschina setup` to get started or `maschina login` to sign in"
        );
    }
    let client = ApiClient::new(&cfg)?;
    Ok((cfg, client))
}
