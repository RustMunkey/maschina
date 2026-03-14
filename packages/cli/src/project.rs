use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Per-project config at .maschina/config.toml.
/// Tracked in git (no secrets). Global auth is at ~/.config/maschina/config.toml.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ProjectConfig {
    pub project: ProjectMeta,
    pub agent: AgentDefaults,
    pub runtime: RuntimeConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectMeta {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    pub version: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentDefaults {
    pub default_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuntimeConfig {
    pub url: String,
    pub timeout_ms: u32,
}

impl Default for ProjectConfig {
    fn default() -> Self {
        Self {
            project: ProjectMeta::default(),
            agent: AgentDefaults::default(),
            runtime: RuntimeConfig::default(),
        }
    }
}

impl Default for ProjectMeta {
    fn default() -> Self {
        Self {
            name: String::new(),
            description: None,
            version: "0.1.0".into(),
        }
    }
}

impl Default for AgentDefaults {
    fn default() -> Self {
        Self {
            default_type: "signal".into(),
        }
    }
}

impl Default for RuntimeConfig {
    fn default() -> Self {
        Self {
            url: "http://localhost:8000".into(),
            timeout_ms: 300_000,
        }
    }
}

#[allow(dead_code)]
pub fn find_project_dir() -> Option<PathBuf> {
    let mut dir = std::env::current_dir().ok()?;
    loop {
        if dir.join(".maschina").is_dir() {
            return Some(dir.join(".maschina"));
        }
        if !dir.pop() {
            return None;
        }
    }
}

#[allow(dead_code)]
pub fn load_project(project_dir: &Path) -> Result<ProjectConfig> {
    let path = project_dir.join("config.toml");
    if !path.exists() {
        return Ok(ProjectConfig::default());
    }
    let contents = std::fs::read_to_string(&path)
        .with_context(|| format!("failed to read {}", path.display()))?;
    toml::from_str(&contents).context("failed to parse .maschina/config.toml")
}

pub fn save_project(project_dir: &Path, config: &ProjectConfig) -> Result<()> {
    std::fs::create_dir_all(project_dir)?;
    let contents = toml::to_string_pretty(config).context("failed to serialize project config")?;
    std::fs::write(project_dir.join("config.toml"), &contents)?;

    let gitignore = project_dir.join(".gitignore");
    if !gitignore.exists() {
        std::fs::write(&gitignore, "*.local.toml\nsecrets.toml\n")?;
    }
    Ok(())
}

pub fn init_project_config(name: &str, description: Option<String>) -> ProjectConfig {
    ProjectConfig {
        project: ProjectMeta {
            name: name.to_string(),
            description,
            version: "0.1.0".into(),
        },
        agent: AgentDefaults::default(),
        runtime: RuntimeConfig::default(),
    }
}
