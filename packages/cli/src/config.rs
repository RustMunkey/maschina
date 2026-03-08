use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct Config {
    pub api_url: String,
    pub api_key: Option<String>,
    pub email: Option<String>,

    /// Database connection URL (sqlite path or postgres/neon URL)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub db_url: Option<String>,

    /// Configured AI model providers
    #[serde(skip_serializing_if = "Vec::is_empty", default)]
    pub model_providers: Vec<ModelProvider>,

    /// Profile name (used for multi-environment setups)
    #[serde(skip)]
    pub profile: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModelProvider {
    /// e.g. "anthropic", "openai", "ollama", "openrouter", "gemini", "mistral"
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub api_key: Option<String>,
    /// For Ollama or custom OpenAI-compatible endpoints
    #[serde(skip_serializing_if = "Option::is_none")]
    pub base_url: Option<String>,
}

impl Config {
    pub fn default_api_url() -> String {
        "https://api.maschina.dev".to_string()
    }

    pub fn is_authenticated(&self) -> bool {
        self.api_key.as_ref().map(|k| !k.is_empty()).unwrap_or(false)
    }
}

/// ~/.config/maschina/<profile>.toml
pub fn config_path(profile: &str) -> Result<PathBuf> {
    let base = dirs::config_dir()
        .or_else(dirs::home_dir)
        .context("could not determine config directory")?;
    let filename = if profile == "default" {
        "config.toml".to_string()
    } else {
        format!("{}.toml", profile)
    };
    Ok(base.join("maschina").join(filename))
}

pub fn load(profile: &str) -> Result<Config> {
    let path = config_path(profile)?;
    if !path.exists() {
        return Ok(Config {
            api_url: Config::default_api_url(),
            api_key: None,
            email: None,
            db_url: None,
            model_providers: vec![],
            profile: profile.to_string(),
        });
    }
    let contents = std::fs::read_to_string(&path)
        .with_context(|| format!("failed to read {}", path.display()))?;
    let mut cfg: Config = toml::from_str(&contents).context("failed to parse config.toml")?;
    cfg.profile = profile.to_string();
    Ok(cfg)
}

pub fn save(config: &Config, profile: &str) -> Result<()> {
    let path = config_path(profile)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let contents = toml::to_string_pretty(config).context("failed to serialize config")?;
    std::fs::write(&path, &contents)
        .with_context(|| format!("failed to write {}", path.display()))?;
    Ok(())
}

pub fn path_display(profile: &str) -> String {
    config_path(profile)
        .map(|p| p.display().to_string())
        .unwrap_or_else(|_| "~/.config/maschina/config.toml".into())
}
