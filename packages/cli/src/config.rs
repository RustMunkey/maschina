use anyhow::{Context, Result};
use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Config {
    pub api_url: String,
    /// Stored in OS keychain — field is None in the TOML file on disk.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    pub email: Option<String>,

    /// Stored in OS keychain — field is None in the TOML file on disk.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub db_url: Option<String>,

    /// Configured AI model providers (api_key fields stored in keychain)
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub model_providers: Vec<ModelProvider>,

    /// Node participation config — set when this machine has joined the compute network
    #[serde(skip_serializing_if = "Option::is_none")]
    pub node: Option<NodeConfig>,

    /// Cached tier from last successful auth
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tier: Option<String>,

    /// TUI color theme: "white" | "phosphor" | "amber"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tui_theme: Option<String>,

    /// Profile name (used for multi-environment setups)
    #[serde(skip)]
    pub profile: String,
}

/// Stored when a machine joins the Maschina compute network.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeConfig {
    pub node_id: String,
    /// Base64-encoded Ed25519 signing key — stored in OS keychain, not on disk.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub signing_key: Option<String>,
    pub runtime_url: String,
    pub nats_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub nats_ca_cert: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelProvider {
    pub name: String,
    /// Stored in OS keychain — field is None in the TOML file on disk.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
}

// ─── Keychain helpers ─────────────────────────────────────────────────────────

const KEYRING_SERVICE: &str = "maschina";

fn kr_key(profile: &str, field: &str) -> String {
    format!("{profile}/{field}")
}

fn kr_get(profile: &str, field: &str) -> Option<String> {
    Entry::new(KEYRING_SERVICE, &kr_key(profile, field))
        .ok()
        .and_then(|e| e.get_password().ok())
        .filter(|s| !s.is_empty())
}

fn kr_set(profile: &str, field: &str, value: &str) {
    if let Ok(entry) = Entry::new(KEYRING_SERVICE, &kr_key(profile, field)) {
        let _ = entry.set_password(value);
    }
}

fn kr_del(profile: &str, field: &str) {
    if let Ok(entry) = Entry::new(KEYRING_SERVICE, &kr_key(profile, field)) {
        let _ = entry.delete_credential();
    }
}

// ─── Config impl ──────────────────────────────────────────────────────────────

impl Config {
    pub fn default_api_url() -> String {
        "https://api.maschina.ai".to_string()
    }

    pub fn is_authenticated(&self) -> bool {
        self.api_key
            .as_ref()
            .map(|k| !k.is_empty())
            .unwrap_or(false)
    }
}

/// `~/.config/maschina/<profile>.toml`
pub fn config_path(profile: &str) -> Result<PathBuf> {
    let base = dirs::config_dir()
        .or_else(dirs::home_dir)
        .context("could not determine config directory")?;
    let filename = if profile == "default" {
        "config.toml".to_string()
    } else {
        format!("{profile}.toml")
    };
    Ok(base.join("maschina").join(filename))
}

/// Load config from disk and inject secrets from OS keychain.
/// Falls back to any plaintext value already in the TOML (handles migration
/// from older versions that stored secrets in the file).
pub fn load(profile: &str) -> Result<Config> {
    let path = config_path(profile)?;
    let mut cfg = if path.exists() {
        let contents = std::fs::read_to_string(&path)
            .with_context(|| format!("failed to read {}", path.display()))?;
        let mut c: Config = toml::from_str(&contents).context("failed to parse config.toml")?;
        c.profile = profile.to_string();
        c
    } else {
        Config {
            api_url: Config::default_api_url(),
            profile: profile.to_string(),
            ..Default::default()
        }
    };

    // Inject secrets from keychain; fall back to TOML value so old plaintext
    // configs continue to work until the next `save()` migrates them.
    cfg.api_key = kr_get(profile, "api_key").or(cfg.api_key);
    cfg.db_url = kr_get(profile, "db_url").or(cfg.db_url);

    for provider in &mut cfg.model_providers {
        let field = format!("provider/{}", provider.name);
        provider.api_key = kr_get(profile, &field).or(provider.api_key.take());
    }

    if let Some(ref mut node) = cfg.node {
        node.signing_key = kr_get(profile, "node_signing_key").or(node.signing_key.take());
    }

    Ok(cfg)
}

/// Persist secrets to OS keychain, then write TOML with those fields stripped.
pub fn save(cfg: &Config, profile: &str) -> Result<()> {
    // ── Write secrets to keychain ─────────────────────────────────────────────
    match &cfg.api_key {
        Some(v) if !v.is_empty() => kr_set(profile, "api_key", v),
        None => kr_del(profile, "api_key"),
        _ => {}
    }
    match &cfg.db_url {
        Some(v) if !v.is_empty() => kr_set(profile, "db_url", v),
        None => kr_del(profile, "db_url"),
        _ => {}
    }
    for provider in &cfg.model_providers {
        let field = format!("provider/{}", provider.name);
        match &provider.api_key {
            Some(v) if !v.is_empty() => kr_set(profile, &field, v),
            None => kr_del(profile, &field),
            _ => {}
        }
    }
    if let Some(ref node) = cfg.node {
        match &node.signing_key {
            Some(v) if !v.is_empty() => kr_set(profile, "node_signing_key", v),
            None => kr_del(profile, "node_signing_key"),
            _ => {}
        }
    }

    // ── Write TOML with secrets stripped ──────────────────────────────────────
    let mut on_disk = cfg.clone();
    on_disk.api_key = None;
    on_disk.db_url = None;
    for p in &mut on_disk.model_providers {
        p.api_key = None;
    }
    if let Some(ref mut node) = on_disk.node {
        node.signing_key = None;
    }

    let path = config_path(profile)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let contents = toml::to_string_pretty(&on_disk).context("failed to serialize config")?;
    std::fs::write(&path, &contents)
        .with_context(|| format!("failed to write {}", path.display()))?;

    Ok(())
}

pub fn path_display(profile: &str) -> String {
    config_path(profile)
        .map(|p| p.display().to_string())
        .unwrap_or_else(|_| "~/.config/maschina/config.toml".into())
}
