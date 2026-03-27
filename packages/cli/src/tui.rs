// tui.rs — Maschina command center TUI

use std::{
    io,
    time::{Duration, Instant},
};

use anyhow::Result;
use crossterm::{
    event::{self, DisableMouseCapture, EnableMouseCapture, Event, KeyCode, KeyEventKind},
    execute,
    terminal::{
        disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen, SetTitle,
    },
};
use ratatui::{
    backend::CrosstermBackend,
    layout::{Alignment, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, Paragraph},
    Terminal,
};

use crate::{client::ApiClient, config, theme};

// ── public API ────────────────────────────────────────────────────────────────

#[allow(dead_code)]
pub enum LaunchTarget {
    Setup,
    Code,
}

// ── theme ─────────────────────────────────────────────────────────────────────

#[derive(Clone, Copy, PartialEq, Default)]
enum ThemeKind {
    #[default]
    White,
    Phosphor,
    Amber,
}

impl ThemeKind {
    fn next(self) -> Self {
        match self {
            Self::White => Self::Phosphor,
            Self::Phosphor => Self::Amber,
            Self::Amber => Self::White,
        }
    }
    fn name(self) -> &'static str {
        match self {
            Self::White => "white",
            Self::Phosphor => "phosphor",
            Self::Amber => "amber",
        }
    }
    // lv1 = structural: borders, dividers, hints
    fn lv1(self) -> Style {
        match self {
            Self::White => Style::default().fg(Color::Rgb(55, 55, 55)),
            Self::Phosphor => Style::default().fg(Color::Rgb(0, 38, 14)),
            Self::Amber => Style::default().fg(Color::Rgb(38, 24, 0)),
        }
    }
    // lv2 = secondary: labels, inactive text
    fn lv2(self) -> Style {
        match self {
            Self::White => Style::default().fg(Color::DarkGray),
            Self::Phosphor => Style::default().fg(Color::Rgb(0, 88, 30)),
            Self::Amber => Style::default().fg(Color::Rgb(95, 62, 0)),
        }
    }
    // lv3 = body: normal content
    fn lv3(self) -> Style {
        match self {
            Self::White => Style::default().fg(Color::Gray),
            Self::Phosphor => Style::default().fg(Color::Rgb(0, 155, 54)),
            Self::Amber => Style::default().fg(Color::Rgb(170, 112, 0)),
        }
    }
    // lv4 = primary: headers, active items
    fn lv4(self) -> Style {
        match self {
            Self::White => Style::default().fg(Color::White),
            Self::Phosphor => Style::default().fg(Color::Rgb(0, 225, 78)),
            Self::Amber => Style::default().fg(Color::Rgb(235, 158, 0)),
        }
    }
    // lv5 = critical: errors, selected, bold
    fn lv5(self) -> Style {
        match self {
            Self::White => Style::default()
                .fg(Color::White)
                .add_modifier(Modifier::BOLD),
            Self::Phosphor => Style::default()
                .fg(Color::Rgb(0, 255, 90))
                .add_modifier(Modifier::BOLD),
            Self::Amber => Style::default()
                .fg(Color::Rgb(255, 188, 0))
                .add_modifier(Modifier::BOLD),
        }
    }
}

// ── constants ─────────────────────────────────────────────────────────────────

static SPIN: [&str; 10] = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
static LOGO_TEXT: &str = include_str!("../../../ascii-logo.txt");

static NAV_ITEMS: &[(&str, &str)] = &[
    ("run", "send a prompt to the network"),
    ("agents", "manage your deployed agents"),
    ("models", "configure model providers"),
    ("usage", "quota and billing"),
    ("settings", "preferences"),
    ("logout", "sign out"),
];

// ── auth mode ─────────────────────────────────────────────────────────────────

#[derive(Clone, Copy, PartialEq)]
enum AuthMode {
    Choose,
    Login,
    Signup,
}

// ── run messages ──────────────────────────────────────────────────────────────

#[derive(Clone)]
enum RunMsg {
    User(String),
    Assistant(String),
    Error(String),
}

// ── models ────────────────────────────────────────────────────────────────────

struct ProviderSpec {
    name: &'static str,
    display: &'static str,
    needs_key: bool,
    needs_url: bool,
    default_url: &'static str,
}

static PROVIDERS: &[ProviderSpec] = &[
    ProviderSpec {
        name: "anthropic",
        display: "Anthropic",
        needs_key: true,
        needs_url: false,
        default_url: "",
    },
    ProviderSpec {
        name: "openai",
        display: "OpenAI",
        needs_key: true,
        needs_url: false,
        default_url: "",
    },
    ProviderSpec {
        name: "ollama",
        display: "Ollama",
        needs_key: false,
        needs_url: true,
        default_url: "http://localhost:11434",
    },
    ProviderSpec {
        name: "openrouter",
        display: "OpenRouter",
        needs_key: true,
        needs_url: false,
        default_url: "",
    },
    ProviderSpec {
        name: "gemini",
        display: "Gemini",
        needs_key: true,
        needs_url: false,
        default_url: "",
    },
    ProviderSpec {
        name: "mistral",
        display: "Mistral",
        needs_key: true,
        needs_url: false,
        default_url: "",
    },
];

enum ModelsMode {
    List,
    /// Editing key or url for PROVIDERS[provider_idx]
    Edit {
        provider_idx: usize,
        /// step 0 = base_url (if needs_url), step 1 = api_key (if needs_key); or just step 0 for the single field
        step: usize,
        input: String,
        cur: usize,
    },
}

// ── usage ─────────────────────────────────────────────────────────────────────

struct QuotaRow {
    label: String,
    used: i64,
    limit: i64, // -1 = unlimited
}

// ── settings ──────────────────────────────────────────────────────────────────

enum SettingsField {
    Theme,
    ApiUrl,
}

enum SettingsMode {
    List {
        sel: usize,
    },
    Edit {
        field: SettingsField,
        input: String,
        cur: usize,
    },
}

// ── agents ────────────────────────────────────────────────────────────────────

#[derive(Clone)]
struct AgentItem {
    id: String,
    name: String,
    agent_type: String,
    status: String,
}

static AGENT_TYPES: &[(&str, &str)] = &[
    ("signal", "general purpose"),
    ("analysis", "data analysis"),
    ("execution", "task execution"),
    ("optimization", "performance tuning"),
    ("reporting", "report generation"),
];

enum AgentsMode {
    List,
    Create {
        step: usize,
        name: String,
        name_cur: usize,
        type_sel: usize,
    },
}

// ── screens ───────────────────────────────────────────────────────────────────

enum Screen {
    Login {
        mode: AuthMode,
        choose_sel: usize,
        step: usize,
        email: String,
        password: String,
        confirm: String,
        cur: usize,
        error: Option<String>,
        busy: bool,
    },
    Home,
    Agents {
        agents: Vec<AgentItem>,
        sel: usize,
        mode: AgentsMode,
        busy: bool,
        error: Option<String>,
    },
    Run {
        input: String,
        cur: usize,
        messages: Vec<RunMsg>,
        busy: bool,
        error: Option<String>,
        /// Lines scrolled up from the bottom (0 = follow tail)
        scroll: usize,
    },
    Models {
        sel: usize,
        mode: ModelsMode,
        error: Option<String>,
    },
    Usage {
        rows: Vec<QuotaRow>,
        period: String,
        resets_at: String,
        busy: bool,
        error: Option<String>,
    },
    Settings {
        mode: SettingsMode,
        error: Option<String>,
    },
}

// ── app state ─────────────────────────────────────────────────────────────────

struct App {
    screen: Screen,
    profile: String,
    theme: ThemeKind,
    email: Option<String>,
    tier: Option<String>,
    nav_sel: usize,
    active_agent: Option<AgentItem>,
    run_rx: Option<std::sync::mpsc::Receiver<Result<String, String>>>,
    tick: u64,
    msg: Option<(String, Instant)>,
    exit_with: Option<LaunchTarget>,
}

impl App {
    fn new(profile: &str) -> Self {
        let cfg = config::load(profile).unwrap_or_default();
        let email = cfg.email.clone();
        let tier = cfg.tier.clone();
        let theme = match cfg.tui_theme.as_deref() {
            Some("phosphor") => ThemeKind::Phosphor,
            Some("amber") => ThemeKind::Amber,
            _ => ThemeKind::White,
        };

        let initial_screen = if cfg.is_authenticated() {
            Screen::Home
        } else {
            Screen::Login {
                mode: AuthMode::Choose,
                choose_sel: 0,
                step: 0,
                email: String::new(),
                password: String::new(),
                confirm: String::new(),
                cur: 0,
                error: None,
                busy: false,
            }
        };

        App {
            screen: initial_screen,
            profile: profile.to_string(),
            theme,
            email,
            tier,
            nav_sel: 0,
            active_agent: None,
            run_rx: None,
            tick: 0,
            msg: None,
            exit_with: None,
        }
    }

    fn set_msg(&mut self, s: impl Into<String>) {
        self.msg = Some((s.into(), Instant::now()));
    }

    fn toggle_theme(&mut self) {
        self.theme = self.theme.next();
        let mut cfg = config::load(&self.profile).unwrap_or_default();
        cfg.tui_theme = Some(self.theme.name().to_string());
        config::save(&cfg, &self.profile).ok();
        self.set_msg(format!("theme: {}", self.theme.name()));
    }

    fn logout(&mut self) {
        let mut cfg = config::load(&self.profile).unwrap_or_default();
        cfg.api_key = None;
        cfg.email = None;
        config::save(&cfg, &self.profile).ok();
        self.email = None;
        self.tier = None;
        self.screen = Screen::Login {
            mode: AuthMode::Choose,
            choose_sel: 0,
            step: 0,
            email: String::new(),
            password: String::new(),
            confirm: String::new(),
            cur: 0,
            error: None,
            busy: false,
        };
    }

    fn auth_api_call(&self, endpoint: &str, body: serde_json::Value) -> Result<(), String> {
        let cfg = config::load(&self.profile).unwrap_or_default();
        let profile = self.profile.clone();

        tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current().block_on(async {
                let http = reqwest::Client::builder()
                    .timeout(Duration::from_secs(15))
                    .user_agent(concat!("maschina-cli/", env!("CARGO_PKG_VERSION")))
                    .build()
                    .map_err(|e| e.to_string())?;

                let base = cfg.api_url.trim_end_matches('/').to_string();
                let resp = http
                    .post(format!("{base}{endpoint}"))
                    .json(&body)
                    .send()
                    .await
                    .map_err(|e| e.to_string())?;

                if !resp.status().is_success() {
                    let b = resp.text().await.unwrap_or_default();
                    let msg = serde_json::from_str::<serde_json::Value>(&b)
                        .ok()
                        .and_then(|v| v["message"].as_str().map(String::from))
                        .unwrap_or(b);
                    return Err(msg);
                }

                let json: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
                let token = json["accessToken"]
                    .as_str()
                    .ok_or_else(|| "no access token in response".to_string())?
                    .to_string();

                let cfg2 = config::Config {
                    api_url: cfg.api_url.clone(),
                    api_key: Some(token),
                    email: None,
                    db_url: None,
                    model_providers: vec![],
                    node: None,
                    tier: None,
                    tui_theme: cfg.tui_theme.clone(),
                    profile: profile.clone(),
                };
                let client = ApiClient::new(&cfg2).map_err(|e| e.to_string())?;
                let key_json: serde_json::Value = client
                    .post("/keys", &serde_json::json!({ "name": "maschina-cli" }))
                    .await
                    .map_err(|e| e.to_string())?;
                let api_key = key_json["key"]
                    .as_str()
                    .ok_or_else(|| "no key in response".to_string())?
                    .to_string();

                let email = body["email"].as_str().unwrap_or("").to_string();
                let new_cfg = config::Config {
                    api_url: cfg.api_url,
                    api_key: Some(api_key),
                    email: Some(email),
                    db_url: cfg.db_url,
                    model_providers: cfg.model_providers,
                    node: cfg.node,
                    tier: cfg.tier,
                    tui_theme: cfg.tui_theme,
                    profile: profile.clone(),
                };
                config::save(&new_cfg, &profile).map_err(|e| e.to_string())?;
                Ok(())
            })
        })
    }

    fn do_login(&mut self) {
        let (email, password) = if let Screen::Login {
            email, password, ..
        } = &self.screen
        {
            (email.clone(), password.clone())
        } else {
            return;
        };
        if let Screen::Login { busy, error, .. } = &mut self.screen {
            *busy = true;
            *error = None;
        }
        let result = self.auth_api_call(
            "/auth/login",
            serde_json::json!({ "email": email, "password": password }),
        );
        self.finish_auth(result);
    }

    fn do_signup(&mut self) {
        let (email, password) = if let Screen::Login {
            email, password, ..
        } = &self.screen
        {
            (email.clone(), password.clone())
        } else {
            return;
        };
        if let Screen::Login { busy, error, .. } = &mut self.screen {
            *busy = true;
            *error = None;
        }
        let result = self.auth_api_call(
            "/auth/register",
            serde_json::json!({ "email": email, "password": password }),
        );
        self.finish_auth(result);
    }

    fn finish_auth(&mut self, result: Result<(), String>) {
        match result {
            Ok(()) => {
                let fresh = config::load(&self.profile).unwrap_or_default();
                self.email = fresh.email;
                self.tier = fresh.tier;
                self.screen = Screen::Home;
            }
            Err(msg) => {
                if let Screen::Login { busy, error, .. } = &mut self.screen {
                    *busy = false;
                    *error = Some(msg);
                }
            }
        }
    }

    fn enter_agents(&mut self) {
        self.screen = Screen::Agents {
            agents: vec![],
            sel: 0,
            mode: AgentsMode::List,
            busy: true,
            error: None,
        };
        let cfg = config::load(&self.profile).unwrap_or_default();
        let result = tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current().block_on(async {
                let client = ApiClient::new(&cfg).map_err(|e| e.to_string())?;
                let v: serde_json::Value =
                    client.get("/agents").await.map_err(|e| e.to_string())?;
                let items = v
                    .as_array()
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|a| {
                                Some(AgentItem {
                                    id: a["id"].as_str()?.to_string(),
                                    name: a["name"].as_str().unwrap_or("").to_string(),
                                    agent_type: a["type"].as_str().unwrap_or("").to_string(),
                                    status: a["status"].as_str().unwrap_or("").to_string(),
                                })
                            })
                            .collect()
                    })
                    .unwrap_or_default();
                Ok::<Vec<AgentItem>, String>(items)
            })
        });
        if let Screen::Agents {
            agents,
            busy,
            error,
            ..
        } = &mut self.screen
        {
            *busy = false;
            match result {
                Ok(items) => *agents = items,
                Err(e) => *error = Some(e),
            }
        }
    }

    fn create_agent(&mut self, name: String, agent_type: String) {
        let cfg = config::load(&self.profile).unwrap_or_default();
        let result = tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current().block_on(async {
                let client = ApiClient::new(&cfg).map_err(|e| e.to_string())?;
                let v: serde_json::Value = client
                    .post(
                        "/agents",
                        &serde_json::json!({ "name": name, "type": agent_type }),
                    )
                    .await
                    .map_err(|e| e.to_string())?;
                Ok::<AgentItem, String>(AgentItem {
                    id: v["id"].as_str().unwrap_or("").to_string(),
                    name: v["name"].as_str().unwrap_or("").to_string(),
                    agent_type: v["type"].as_str().unwrap_or("").to_string(),
                    status: v["status"].as_str().unwrap_or("idle").to_string(),
                })
            })
        });
        if let Screen::Agents {
            agents,
            busy,
            error,
            mode,
            sel,
            ..
        } = &mut self.screen
        {
            *busy = false;
            match result {
                Ok(item) => {
                    agents.push(item);
                    *sel = agents.len() - 1;
                    *mode = AgentsMode::List;
                }
                Err(e) => *error = Some(e),
            }
        }
    }

    fn delete_agent(&mut self) {
        let agent_id = if let Screen::Agents { agents, sel, .. } = &self.screen {
            agents.get(*sel).map(|a| a.id.clone())
        } else {
            None
        };
        let Some(agent_id) = agent_id else { return };

        // clear active if deleting it
        if self.active_agent.as_ref().map(|a| &a.id) == Some(&agent_id) {
            self.active_agent = None;
        }

        let cfg = config::load(&self.profile).unwrap_or_default();
        let result = tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current().block_on(async {
                let client = ApiClient::new(&cfg).map_err(|e| e.to_string())?;
                let _: serde_json::Value = client
                    .delete(&format!("/agents/{agent_id}"))
                    .await
                    .map_err(|e| e.to_string())?;
                Ok::<(), String>(())
            })
        });
        if let Screen::Agents {
            agents, sel, error, ..
        } = &mut self.screen
        {
            match result {
                Ok(()) => {
                    agents.retain(|a| a.id != agent_id);
                    *sel = (*sel).min(agents.len().saturating_sub(1));
                }
                Err(e) => *error = Some(e),
            }
        }
    }

    fn enter_usage(&mut self) {
        self.screen = Screen::Usage {
            rows: vec![],
            period: String::new(),
            resets_at: String::new(),
            busy: true,
            error: None,
        };
        let cfg = config::load(&self.profile).unwrap_or_default();
        let result = tokio::task::block_in_place(|| {
            tokio::runtime::Handle::current().block_on(async {
                let client = ApiClient::new(&cfg).map_err(|e| e.to_string())?;
                let v: serde_json::Value = client.get("/usage").await.map_err(|e| e.to_string())?;
                Ok::<_, String>(v)
            })
        });
        match result {
            Ok(v) => {
                let period = v["period"].as_str().unwrap_or("").to_string();
                let resets_at = v["quotas"]["agent_execution"]["resetsAt"]
                    .as_str()
                    .unwrap_or("")
                    .chars()
                    .take(10)
                    .collect();
                let quota_types = ["agent_execution", "api_call", "model_inference"];
                let labels = ["agent runs", "api calls", "model inference"];
                let mut rows = vec![];
                for (t, lbl) in quota_types.iter().zip(labels.iter()) {
                    let q = &v["quotas"][t];
                    let used = q["used"].as_i64().unwrap_or(0);
                    let limit = q["limit"].as_i64().unwrap_or(-1);
                    rows.push(QuotaRow {
                        label: lbl.to_string(),
                        used,
                        limit,
                    });
                }
                self.screen = Screen::Usage {
                    rows,
                    period,
                    resets_at,
                    busy: false,
                    error: None,
                };
            }
            Err(e) => {
                self.screen = Screen::Usage {
                    rows: vec![],
                    period: String::new(),
                    resets_at: String::new(),
                    busy: false,
                    error: Some(e),
                };
            }
        }
    }

    fn enter_settings(&mut self) {
        self.screen = Screen::Settings {
            mode: SettingsMode::List { sel: 0 },
            error: None,
        };
    }

    fn enter_models(&mut self) {
        self.screen = Screen::Models {
            sel: 0,
            mode: ModelsMode::List,
            error: None,
        };
    }

    fn save_provider(
        &mut self,
        provider_idx: usize,
        api_key: Option<String>,
        base_url: Option<String>,
    ) {
        let mut cfg = config::load(&self.profile).unwrap_or_default();
        let name = PROVIDERS[provider_idx].name.to_string();
        if let Some(existing) = cfg.model_providers.iter_mut().find(|p| p.name == name) {
            if let Some(k) = api_key {
                existing.api_key = if k.is_empty() { None } else { Some(k) };
            }
            if let Some(u) = base_url {
                existing.base_url = if u.is_empty() { None } else { Some(u) };
            }
        } else {
            cfg.model_providers.push(config::ModelProvider {
                name,
                api_key: api_key.filter(|k| !k.is_empty()),
                base_url: base_url.filter(|u| !u.is_empty()),
            });
        }
        // remove entries that have no key and no url
        cfg.model_providers
            .retain(|p| p.api_key.is_some() || p.base_url.is_some());
        config::save(&cfg, &self.profile).ok();
    }

    fn clear_provider(&mut self, provider_idx: usize) {
        let mut cfg = config::load(&self.profile).unwrap_or_default();
        let name = PROVIDERS[provider_idx].name;
        cfg.model_providers.retain(|p| p.name != name);
        config::save(&cfg, &self.profile).ok();
        self.set_msg(format!("{} cleared", PROVIDERS[provider_idx].display));
    }

    fn do_run(&mut self) {
        let input = match &self.screen {
            Screen::Run { input, .. } => {
                let s = input.trim().to_string();
                if s.is_empty() {
                    return;
                }
                s
            }
            _ => return,
        };

        if let Screen::Run {
            messages,
            input: inp,
            cur,
            busy,
            error,
            ..
        } = &mut self.screen
        {
            messages.push(RunMsg::User(input.clone()));
            inp.clear();
            *cur = 0;
            *busy = true;
            *error = None;
        }

        let cfg = config::load(&self.profile).unwrap_or_default();
        let prompt = input.clone();
        let preset_agent_id = self.active_agent.as_ref().map(|a| a.id.clone());
        let (tx, rx) = std::sync::mpsc::channel();
        self.run_rx = Some(rx);

        std::thread::spawn(move || {
            let rt = tokio::runtime::Builder::new_current_thread()
                .enable_all()
                .build()
                .expect("tokio rt");
            let result = rt.block_on(async move {
                let client = ApiClient::new(&cfg).map_err(|e| e.to_string())?;

                // 1. use active agent, or get/create default
                let agent_id = if let Some(id) = preset_agent_id {
                    id
                } else {
                    let agents: serde_json::Value =
                        client.get("/agents").await.map_err(|e| e.to_string())?;
                    if let Some(id) = agents
                        .as_array()
                        .and_then(|a| a.first())
                        .and_then(|a| a["id"].as_str())
                    {
                        id.to_string()
                    } else {
                        let created: serde_json::Value = client
                            .post(
                                "/agents",
                                &serde_json::json!({ "name": "default", "type": "signal" }),
                            )
                            .await
                            .map_err(|e| e.to_string())?;
                        created["id"]
                            .as_str()
                            .ok_or_else(|| "failed to create agent".to_string())?
                            .to_string()
                    }
                };

                // 2. dispatch run
                let queued: serde_json::Value = client
                    .post(
                        &format!("/agents/{agent_id}/run"),
                        &serde_json::json!({ "input": { "prompt": prompt } }),
                    )
                    .await
                    .map_err(|e| e.to_string())?;
                let run_id = queued["runId"]
                    .as_str()
                    .ok_or_else(|| "no runId in response".to_string())?
                    .to_string();

                // 3. poll until complete (max 120s, 2s intervals)
                let poll_url = format!("/agents/{agent_id}/runs/{run_id}");
                for _ in 0..60 {
                    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
                    let run: serde_json::Value =
                        client.get(&poll_url).await.map_err(|e| e.to_string())?;
                    match run["status"].as_str().unwrap_or("unknown") {
                        "completed" => {
                            let payload = &run["outputPayload"];
                            let output = payload["output"]
                                .as_str()
                                .or_else(|| payload["text"].as_str())
                                .or_else(|| payload["result"].as_str())
                                .or_else(|| payload["response"].as_str())
                                .map(|s| s.to_string())
                                .unwrap_or_else(|| {
                                    serde_json::to_string_pretty(payload)
                                        .unwrap_or_else(|_| "(no output)".into())
                                });
                            return Ok(output);
                        }
                        "failed" => {
                            return Err(run["errorMessage"]
                                .as_str()
                                .unwrap_or("run failed")
                                .to_string());
                        }
                        _ => {}
                    }
                }
                Err("timed out waiting for result".to_string())
            });
            tx.send(result).ok();
        });
    }
}

// ── helpers ───────────────────────────────────────────────────────────────────

fn center_x(area: Rect, width: u16) -> u16 {
    area.x + area.width.saturating_sub(width) / 2
}

fn word_wrap(text: &str, width: usize) -> Vec<String> {
    if width == 0 {
        return vec![text.to_string()];
    }
    let mut lines: Vec<String> = vec![];
    for para in text.split('\n') {
        let words: Vec<&str> = para.split_whitespace().collect();
        if words.is_empty() {
            lines.push(String::new());
            continue;
        }
        let mut current = String::new();
        for word in words {
            if current.is_empty() {
                current.push_str(word);
            } else if current.chars().count() + 1 + word.chars().count() <= width {
                current.push(' ');
                current.push_str(word);
            } else {
                lines.push(current.clone());
                current = word.to_string();
            }
        }
        if !current.is_empty() {
            lines.push(current);
        }
    }
    if lines.is_empty() {
        lines.push(String::new());
    }
    lines
}

fn logo_width() -> u16 {
    LOGO_TEXT
        .lines()
        .map(|l| l.chars().count())
        .max()
        .unwrap_or(48) as u16
}

// ── draw: login ───────────────────────────────────────────────────────────────

fn draw_login(f: &mut ratatui::Frame, app: &App) {
    let area = f.area();
    f.render_widget(Clear, area);

    let (mode, choose_sel, step, email, password, confirm, cur, error, busy) =
        if let Screen::Login {
            mode,
            choose_sel,
            step,
            email,
            password,
            confirm,
            cur,
            error,
            busy,
        } = &app.screen
        {
            (
                *mode,
                *choose_sel,
                *step,
                email.as_str(),
                password.as_str(),
                confirm.as_str(),
                *cur,
                error.as_deref(),
                *busy,
            )
        } else {
            return;
        };

    let th = app.theme;

    // logo — centered, upper portion
    let logo_lines: Vec<&str> = LOGO_TEXT.lines().collect();
    let logo_h = logo_lines.len() as u16;
    let form_extra_h: u16 = match mode {
        AuthMode::Choose => 5,
        AuthMode::Login => 10,
        AuthMode::Signup => 14,
    };
    let logo_y = area.height.saturating_sub(logo_h + form_extra_h) / 2;

    for (i, line) in logo_lines.iter().enumerate() {
        let y = logo_y + i as u16;
        if y >= area.height {
            break;
        }
        f.render_widget(
            Paragraph::new(Line::from(Span::styled(*line, th.lv3()))).alignment(Alignment::Center),
            Rect {
                x: area.x,
                y,
                width: area.width,
                height: 1,
            },
        );
    }

    let form_w = logo_width().max(52).min(area.width.saturating_sub(4));
    let form_x = center_x(area, form_w);
    let mut y = logo_y + logo_h + 2;

    match mode {
        AuthMode::Choose => {
            let opts = [
                ("sign in", "access your account"),
                ("create account", "register a new account"),
            ];
            for (i, (opt, hint)) in opts.iter().enumerate() {
                if y >= area.height {
                    break;
                }
                let selected = i == choose_sel;
                let (prefix, name_s, hint_s) = if selected {
                    ("  ▸  ", th.lv5(), th.lv3())
                } else {
                    ("     ", th.lv2(), th.lv1())
                };
                f.render_widget(
                    Paragraph::new(Line::from(vec![
                        Span::styled(prefix, name_s),
                        Span::styled(format!("{opt:<18}"), name_s),
                        Span::styled(*hint, hint_s),
                    ])),
                    Rect {
                        x: form_x,
                        y,
                        width: form_w,
                        height: 1,
                    },
                );
                y += 1;
            }
            y += 1;
            if y < area.height {
                f.render_widget(
                    Paragraph::new(Span::styled(
                        "↑/↓  select   enter  confirm   esc  quit",
                        th.lv1(),
                    ))
                    .alignment(Alignment::Center),
                    Rect {
                        x: area.x,
                        y,
                        width: area.width,
                        height: 1,
                    },
                );
            }
        }

        AuthMode::Login | AuthMode::Signup => {
            let fields: &[(&str, bool)] = match mode {
                AuthMode::Login => &[("email", false), ("password", true)],
                AuthMode::Signup => &[
                    ("email", false),
                    ("password", true),
                    ("confirm password", true),
                ],
                _ => &[],
            };

            // completed fields shown above the active one
            for (i, (label, masked)) in fields.iter().enumerate() {
                if i >= step {
                    break;
                }
                if y >= area.height {
                    break;
                }
                let val = match i {
                    0 => email,
                    1 => password,
                    _ => confirm,
                };
                let display = if *masked {
                    "·".repeat(val.len())
                } else {
                    val.to_string()
                };
                f.render_widget(
                    Paragraph::new(Line::from(vec![
                        Span::styled(format!("  ✓  {label:<18}"), th.lv2()),
                        Span::styled(display, th.lv3()),
                    ])),
                    Rect {
                        x: form_x,
                        y,
                        width: form_w,
                        height: 1,
                    },
                );
                y += 1;
            }

            // active field
            if step < fields.len() && y + 2 < area.height {
                let (label, masked) = fields[step];
                let raw = match step {
                    0 => email,
                    1 => password,
                    _ => confirm,
                };
                let display: String = if masked {
                    "·".repeat(raw.len())
                } else {
                    raw.to_string()
                };

                f.render_widget(
                    Paragraph::new(display.clone()).block(
                        Block::default()
                            .borders(Borders::ALL)
                            .border_style(th.lv4())
                            .title(Span::styled(format!(" {label} "), th.lv3())),
                    ),
                    Rect {
                        x: form_x,
                        y,
                        width: form_w,
                        height: 3,
                    },
                );

                let cursor_x = form_x + 1 + cur.min(display.len()) as u16;
                let cursor_y = y + 1;
                if cursor_x < form_x + form_w - 1 && cursor_y < area.height {
                    f.set_cursor_position((cursor_x, cursor_y));
                }
                y += 4;
            }

            // busy or error
            if y < area.height {
                if busy {
                    let spin = SPIN[app.tick as usize % SPIN.len()];
                    f.render_widget(
                        Paragraph::new(Span::styled(format!("  {spin}  working…"), th.lv2()))
                            .alignment(Alignment::Center),
                        Rect {
                            x: area.x,
                            y,
                            width: area.width,
                            height: 1,
                        },
                    );
                } else if let Some(err) = error {
                    f.render_widget(
                        Paragraph::new(Span::styled(err, th.lv5())).alignment(Alignment::Center),
                        Rect {
                            x: area.x,
                            y,
                            width: area.width,
                            height: 1,
                        },
                    );
                }
                y += 1;
            }

            // hint line
            let hint = if step + 1 < fields.len() {
                "enter  next   esc  back"
            } else {
                "enter  submit   esc  back"
            };
            if y < area.height {
                f.render_widget(
                    Paragraph::new(Span::styled(hint, th.lv1())).alignment(Alignment::Center),
                    Rect {
                        x: area.x,
                        y,
                        width: area.width,
                        height: 1,
                    },
                );
            }
        }
    }
}

// ── draw: agents ──────────────────────────────────────────────────────────────

fn draw_agents(f: &mut ratatui::Frame, app: &App) {
    let area = f.area();
    let th = app.theme;
    f.render_widget(Clear, area);

    let form_w = 72u16.min(area.width.saturating_sub(4));
    let form_x = center_x(area, form_w);

    let (agents, sel, mode, busy, error) = if let Screen::Agents {
        agents,
        sel,
        mode,
        busy,
        error,
    } = &app.screen
    {
        (agents.as_slice(), *sel, mode, *busy, error.as_deref())
    } else {
        return;
    };

    // header
    let active_name = app
        .active_agent
        .as_ref()
        .map(|a| a.name.as_str())
        .unwrap_or("none");
    f.render_widget(
        Paragraph::new(Line::from(vec![
            Span::styled("  agents", th.lv4()),
            Span::styled("   active: ", th.lv1()),
            Span::styled(active_name, th.lv3()),
        ])),
        Rect {
            x: form_x,
            y: 1,
            width: form_w,
            height: 1,
        },
    );
    f.render_widget(
        Paragraph::new(Span::styled("─".repeat(form_w as usize), th.lv1())),
        Rect {
            x: form_x,
            y: 2,
            width: form_w,
            height: 1,
        },
    );

    match mode {
        AgentsMode::List => {
            if busy {
                f.render_widget(
                    Paragraph::new(Span::styled(
                        format!("  {}  loading…", SPIN[app.tick as usize % SPIN.len()]),
                        th.lv2(),
                    )),
                    Rect {
                        x: form_x,
                        y: 4,
                        width: form_w,
                        height: 1,
                    },
                );
            } else if agents.is_empty() {
                f.render_widget(
                    Paragraph::new(Line::from(vec![
                        Span::styled("  no agents yet  ", th.lv2()),
                        Span::styled("press n to create one", th.lv1()),
                    ])),
                    Rect {
                        x: form_x,
                        y: 4,
                        width: form_w,
                        height: 1,
                    },
                );
            } else {
                // column header
                f.render_widget(
                    Paragraph::new(Line::from(vec![
                        Span::styled(format!("  {:<24}", "name"), th.lv1()),
                        Span::styled(format!("{:<14}", "type"), th.lv1()),
                        Span::styled("status", th.lv1()),
                    ])),
                    Rect {
                        x: form_x,
                        y: 3,
                        width: form_w,
                        height: 1,
                    },
                );

                for (i, agent) in agents.iter().enumerate() {
                    let y = 4 + i as u16;
                    if y >= area.height.saturating_sub(2) {
                        break;
                    }
                    let is_sel = i == sel;
                    let is_active = app.active_agent.as_ref().map(|a| &a.id) == Some(&agent.id);
                    let (prefix, ns) = if is_sel {
                        ("  ▸ ", th.lv5())
                    } else {
                        ("    ", th.lv3())
                    };
                    let dot = if is_active { "● " } else { "  " };
                    f.render_widget(
                        Paragraph::new(Line::from(vec![
                            Span::styled(prefix, ns),
                            Span::styled(dot, if is_active { th.lv4() } else { th.lv1() }),
                            Span::styled(format!("{:<22}", agent.name), ns),
                            Span::styled(format!("{:<14}", agent.agent_type), th.lv2()),
                            Span::styled(&agent.status, th.lv2()),
                        ])),
                        Rect {
                            x: form_x,
                            y,
                            width: form_w,
                            height: 1,
                        },
                    );
                }
            }

            if let Some(err) = error {
                f.render_widget(
                    Paragraph::new(Span::styled(format!("  {err}"), th.lv5())),
                    Rect {
                        x: form_x,
                        y: area.height.saturating_sub(3),
                        width: form_w,
                        height: 1,
                    },
                );
            }

            f.render_widget(
                Paragraph::new(Span::styled(
                    "  ↑↓ navigate   enter set active   n new   d delete   esc back",
                    th.lv1(),
                )),
                Rect {
                    x: form_x,
                    y: area.height.saturating_sub(1),
                    width: form_w,
                    height: 1,
                },
            );
        }

        AgentsMode::Create {
            step,
            name,
            name_cur,
            type_sel,
        } => {
            f.render_widget(
                Paragraph::new(Span::styled("  new agent", th.lv3())),
                Rect {
                    x: form_x,
                    y: 3,
                    width: form_w,
                    height: 1,
                },
            );

            let mut y = 5u16;

            // step 0: name
            if *step == 0 {
                f.render_widget(
                    Paragraph::new(name.as_str()).block(
                        Block::default()
                            .borders(Borders::ALL)
                            .border_style(th.lv4())
                            .title(Span::styled(" name ", th.lv3())),
                    ),
                    Rect {
                        x: form_x,
                        y,
                        width: form_w,
                        height: 3,
                    },
                );
                let cx = form_x + 1 + (*name_cur).min(name.len()) as u16;
                if cx < form_x + form_w - 1 {
                    f.set_cursor_position((cx, y + 1));
                }
                y += 4;
                f.render_widget(
                    Paragraph::new(Span::styled("enter  next   esc  cancel", th.lv1()))
                        .alignment(Alignment::Center),
                    Rect {
                        x: area.x,
                        y,
                        width: area.width,
                        height: 1,
                    },
                );
            }

            // step 1: type
            if *step == 1 {
                f.render_widget(
                    Paragraph::new(Line::from(vec![
                        Span::styled("  name  ", th.lv2()),
                        Span::styled(name.as_str(), th.lv3()),
                    ])),
                    Rect {
                        x: form_x,
                        y,
                        width: form_w,
                        height: 1,
                    },
                );
                y += 2;
                for (i, (type_name, type_desc)) in AGENT_TYPES.iter().enumerate() {
                    if y >= area.height.saturating_sub(3) {
                        break;
                    }
                    let is_sel = i == *type_sel;
                    let (prefix, ns, ds) = if is_sel {
                        ("  ▸  ", th.lv5(), th.lv3())
                    } else {
                        ("     ", th.lv2(), th.lv1())
                    };
                    f.render_widget(
                        Paragraph::new(Line::from(vec![
                            Span::styled(prefix, ns),
                            Span::styled(format!("{type_name:<14}"), ns),
                            Span::styled(*type_desc, ds),
                        ])),
                        Rect {
                            x: form_x,
                            y,
                            width: form_w,
                            height: 1,
                        },
                    );
                    y += 1;
                }
                y += 1;
                f.render_widget(
                    Paragraph::new(Span::styled(
                        "↑↓ select   enter create   esc back",
                        th.lv1(),
                    ))
                    .alignment(Alignment::Center),
                    Rect {
                        x: area.x,
                        y,
                        width: area.width,
                        height: 1,
                    },
                );
            }

            if busy {
                f.render_widget(
                    Paragraph::new(Span::styled(
                        format!("  {}  creating…", SPIN[app.tick as usize % SPIN.len()]),
                        th.lv2(),
                    )),
                    Rect {
                        x: form_x,
                        y: area.height.saturating_sub(3),
                        width: form_w,
                        height: 1,
                    },
                );
            } else if let Some(err) = error {
                f.render_widget(
                    Paragraph::new(Span::styled(format!("  {err}"), th.lv5())),
                    Rect {
                        x: form_x,
                        y: area.height.saturating_sub(3),
                        width: form_w,
                        height: 1,
                    },
                );
            }
        }
    }
}

// ── draw: home ────────────────────────────────────────────────────────────────

fn draw_home(f: &mut ratatui::Frame, app: &App) {
    let area = f.area();
    let th = app.theme;
    f.render_widget(Clear, area);

    let logo_lines: Vec<&str> = LOGO_TEXT.lines().collect();
    let logo_h = logo_lines.len() as u16;
    let nav_h = NAV_ITEMS.len() as u16;
    let total_h = logo_h + 3 + nav_h;
    let start_y = area.height.saturating_sub(total_h + 3).max(1) / 2;

    // logo
    for (i, line) in logo_lines.iter().enumerate() {
        let y = start_y + i as u16;
        if y >= area.height {
            break;
        }
        f.render_widget(
            Paragraph::new(Line::from(Span::styled(*line, th.lv3()))).alignment(Alignment::Center),
            Rect {
                x: area.x,
                y,
                width: area.width,
                height: 1,
            },
        );
    }

    // nav
    let form_w = logo_width().max(58).min(area.width.saturating_sub(4));
    let form_x = center_x(area, form_w);
    let nav_y = start_y + logo_h + 2;

    for (i, (name, desc)) in NAV_ITEMS.iter().enumerate() {
        let y = nav_y + i as u16;
        if y >= area.height {
            break;
        }
        let is_sel = i == app.nav_sel;
        let (prefix, name_s, desc_s) = if is_sel {
            ("  ▸  ", th.lv5(), th.lv3())
        } else {
            ("     ", th.lv2(), th.lv1())
        };
        f.render_widget(
            Paragraph::new(Line::from(vec![
                Span::styled(prefix, name_s),
                Span::styled(format!("{name:<12}"), name_s),
                Span::styled("  ", th.lv1()),
                Span::styled(*desc, desc_s),
            ])),
            Rect {
                x: form_x,
                y,
                width: form_w,
                height: 1,
            },
        );
    }

    // footer
    let footer_y = area.height.saturating_sub(1);
    let line = if let Some((msg, _)) = &app.msg {
        Line::from(vec![
            Span::styled("  ", th.lv1()),
            Span::styled(msg.as_str(), th.lv4()),
        ])
    } else {
        let user_part = if let Some(email) = &app.email {
            let tier = app.tier.as_deref().unwrap_or("access");
            format!("  {email}  ·  {tier}")
        } else {
            String::new()
        };
        let ver = theme::version_str();
        Line::from(vec![
            Span::styled(user_part, th.lv2()),
            Span::styled("   ", th.lv1()),
            Span::styled(ver, th.lv1()),
            Span::styled(
                "   ↑↓ navigate   enter select   t theme   esc quit",
                th.lv1(),
            ),
        ])
    };
    f.render_widget(
        Paragraph::new(line),
        Rect {
            x: area.x,
            y: footer_y,
            width: area.width,
            height: 1,
        },
    );
}

// ── draw: models ──────────────────────────────────────────────────────────────

fn draw_models(f: &mut ratatui::Frame, app: &App) {
    let area = f.area();
    let th = app.theme;
    f.render_widget(Clear, area);

    let (sel, mode, error) = match &app.screen {
        Screen::Models { sel, mode, error } => (*sel, mode, error.as_deref()),
        _ => return,
    };

    let cfg = config::load(&app.profile).unwrap_or_default();

    let form_w = 72u16.min(area.width.saturating_sub(4));
    let form_x = center_x(area, form_w);
    let inner_w = form_w.saturating_sub(4) as usize;
    let mut y = area.y + 1;

    // header
    f.render_widget(
        Paragraph::new(Line::from(Span::styled("  model providers", th.lv4()))),
        Rect {
            x: form_x,
            y,
            width: form_w,
            height: 1,
        },
    );
    y += 1;
    f.render_widget(
        Paragraph::new(Line::from(Span::styled(
            format!("  {}", "─".repeat(inner_w)),
            th.lv1(),
        ))),
        Rect {
            x: form_x,
            y,
            width: form_w,
            height: 1,
        },
    );
    y += 2;

    match mode {
        ModelsMode::List => {
            for (i, spec) in PROVIDERS.iter().enumerate() {
                let configured = cfg.model_providers.iter().find(|p| p.name == spec.name);
                let active = i == sel;

                let status_str = if let Some(p) = configured {
                    if spec.needs_key {
                        if let Some(k) = &p.api_key {
                            // mask: show first 8 chars then ***
                            let visible: String = k.chars().take(10).collect();
                            format!("●  {visible}…")
                        } else {
                            "○  not configured".to_string()
                        }
                    } else if let Some(u) = &p.base_url {
                        format!("●  {u}")
                    } else {
                        "○  not configured".to_string()
                    }
                } else {
                    "○  not configured".to_string()
                };

                let selector = if active { "▸" } else { " " };
                let line = format!("  {}  {:<14}  {}", selector, spec.display, status_str,);
                let style = if active { th.lv4() } else { th.lv2() };
                f.render_widget(
                    Paragraph::new(Line::from(Span::styled(line, style))),
                    Rect {
                        x: form_x,
                        y,
                        width: form_w,
                        height: 1,
                    },
                );
                y += 1;
            }

            y += 1;
            if let Some(e) = error {
                f.render_widget(
                    Paragraph::new(Line::from(Span::styled(format!("  {e}"), th.lv5()))),
                    Rect {
                        x: form_x,
                        y,
                        width: form_w,
                        height: 1,
                    },
                );
                y += 1;
            }

            let footer = "  enter: configure   d: clear   esc: back";
            f.render_widget(
                Paragraph::new(Line::from(Span::styled(footer, th.lv1()))),
                Rect {
                    x: form_x,
                    y,
                    width: form_w,
                    height: 1,
                },
            );
        }

        ModelsMode::Edit {
            provider_idx,
            step,
            input,
            cur,
        } => {
            let spec = &PROVIDERS[*provider_idx];
            let label = if spec.needs_url && (!spec.needs_key || *step == 0) {
                "base url"
            } else {
                "api key"
            };

            let title = format!("  configure {}", spec.display);
            f.render_widget(
                Paragraph::new(Line::from(Span::styled(title, th.lv4()))),
                Rect {
                    x: form_x,
                    y,
                    width: form_w,
                    height: 1,
                },
            );
            y += 2;

            let prompt_line = format!("  {label}");
            f.render_widget(
                Paragraph::new(Line::from(Span::styled(prompt_line, th.lv3()))),
                Rect {
                    x: form_x,
                    y,
                    width: form_w,
                    height: 1,
                },
            );
            y += 1;

            // input box
            let display_val = if label == "api key" {
                // mask api key input
                "•".repeat(input.len())
            } else {
                input.clone()
            };
            let box_inner = format!("{:<width$}", display_val, width = inner_w.saturating_sub(2));
            f.render_widget(
                Paragraph::new(Line::from(Span::styled(format!("  {box_inner}"), th.lv3()))).block(
                    Block::default()
                        .borders(Borders::ALL)
                        .border_style(th.lv2()),
                ),
                Rect {
                    x: form_x,
                    y,
                    width: form_w,
                    height: 3,
                },
            );

            // cursor
            let cx = form_x + 3 + (*cur).min(inner_w.saturating_sub(2)) as u16;
            f.set_cursor_position((cx, y + 1));
            y += 4;

            if let Some(e) = error {
                f.render_widget(
                    Paragraph::new(Line::from(Span::styled(format!("  {e}"), th.lv5()))),
                    Rect {
                        x: form_x,
                        y,
                        width: form_w,
                        height: 1,
                    },
                );
                y += 1;
            }

            let _ = y;
            let footer = "  enter: save   esc: back";
            f.render_widget(
                Paragraph::new(Line::from(Span::styled(footer, th.lv1()))),
                Rect {
                    x: form_x,
                    y: area.height.saturating_sub(2),
                    width: form_w,
                    height: 1,
                },
            );
        }
    }
}

// ── draw: usage ───────────────────────────────────────────────────────────────

fn draw_usage(f: &mut ratatui::Frame, app: &App) {
    let area = f.area();
    let th = app.theme;
    f.render_widget(Clear, area);

    let (rows, period, resets_at, busy, error) = match &app.screen {
        Screen::Usage {
            rows,
            period,
            resets_at,
            busy,
            error,
        } => (
            rows.as_slice(),
            period.as_str(),
            resets_at.as_str(),
            *busy,
            error.as_deref(),
        ),
        _ => return,
    };

    let form_w = 64u16.min(area.width.saturating_sub(4));
    let form_x = center_x(area, form_w);
    let inner_w = form_w.saturating_sub(4) as usize;
    let mut y = area.y + 1;

    f.render_widget(
        Paragraph::new(Line::from(Span::styled("  usage", th.lv4()))),
        Rect {
            x: form_x,
            y,
            width: form_w,
            height: 1,
        },
    );
    y += 1;
    f.render_widget(
        Paragraph::new(Line::from(Span::styled(
            format!("  {}", "─".repeat(inner_w)),
            th.lv1(),
        ))),
        Rect {
            x: form_x,
            y,
            width: form_w,
            height: 1,
        },
    );
    y += 2;

    if busy {
        let spin = SPIN[app.tick as usize % SPIN.len()];
        f.render_widget(
            Paragraph::new(Line::from(Span::styled(
                format!("  {spin} loading..."),
                th.lv2(),
            ))),
            Rect {
                x: form_x,
                y,
                width: form_w,
                height: 1,
            },
        );
        return;
    }

    if let Some(e) = error {
        f.render_widget(
            Paragraph::new(Line::from(Span::styled(format!("  error: {e}"), th.lv5()))),
            Rect {
                x: form_x,
                y,
                width: form_w,
                height: 1,
            },
        );
        return;
    }

    if !period.is_empty() {
        f.render_widget(
            Paragraph::new(Line::from(Span::styled(
                format!("  period    {period}"),
                th.lv2(),
            ))),
            Rect {
                x: form_x,
                y,
                width: form_w,
                height: 1,
            },
        );
        y += 1;
        if !resets_at.is_empty() {
            f.render_widget(
                Paragraph::new(Line::from(Span::styled(
                    format!("  resets    {resets_at}"),
                    th.lv2(),
                ))),
                Rect {
                    x: form_x,
                    y,
                    width: form_w,
                    height: 1,
                },
            );
        }
        y += 2;
    }

    // quota rows
    for row in rows {
        let limit_str = if row.limit == -1 {
            "unlimited".to_string()
        } else {
            row.limit.to_string()
        };
        let val_str = if row.limit == -1 {
            format!("{} / unlimited", row.used)
        } else {
            format!("{} / {}", row.used, limit_str)
        };

        // bar
        let bar_w = 24usize;
        let fill = if row.limit <= 0 {
            0
        } else {
            ((row.used as f64 / row.limit as f64) * bar_w as f64).min(bar_w as f64) as usize
        };
        let bar = format!("{}{}", "█".repeat(fill), "░".repeat(bar_w - fill));

        let line = format!("  {:<18}  {}  {}", row.label, bar, val_str);
        f.render_widget(
            Paragraph::new(Line::from(Span::styled(line, th.lv3()))),
            Rect {
                x: form_x,
                y,
                width: form_w,
                height: 1,
            },
        );
        y += 1;
    }

    y += 1;
    f.render_widget(
        Paragraph::new(Line::from(Span::styled("  esc: back", th.lv1()))),
        Rect {
            x: form_x,
            y,
            width: form_w,
            height: 1,
        },
    );
}

// ── draw: settings ────────────────────────────────────────────────────────────

fn draw_settings(f: &mut ratatui::Frame, app: &App) {
    let area = f.area();
    let th = app.theme;
    f.render_widget(Clear, area);

    let (mode, error) = match &app.screen {
        Screen::Settings { mode, error } => (mode, error.as_deref()),
        _ => return,
    };

    let cfg = config::load(&app.profile).unwrap_or_default();
    let form_w = 64u16.min(area.width.saturating_sub(4));
    let form_x = center_x(area, form_w);
    let inner_w = form_w.saturating_sub(4) as usize;
    let mut y = area.y + 1;

    f.render_widget(
        Paragraph::new(Line::from(Span::styled("  settings", th.lv4()))),
        Rect {
            x: form_x,
            y,
            width: form_w,
            height: 1,
        },
    );
    y += 1;
    f.render_widget(
        Paragraph::new(Line::from(Span::styled(
            format!("  {}", "─".repeat(inner_w)),
            th.lv1(),
        ))),
        Rect {
            x: form_x,
            y,
            width: form_w,
            height: 1,
        },
    );
    y += 2;

    let settings_rows: &[(&str, &str)] = &[("theme", ""), ("api url", "")];

    let values = [th.name().to_string(), cfg.api_url.clone()];

    match mode {
        SettingsMode::List { sel } => {
            for (i, (label, _)) in settings_rows.iter().enumerate() {
                let active = i == *sel;
                let selector = if active { "▸" } else { " " };
                let val = &values[i];
                let display_val = if val.len() > 36 {
                    format!("{}…", &val[..35])
                } else {
                    val.clone()
                };
                let line = format!("  {selector}  {label:<12}  {display_val}");
                let style = if active { th.lv4() } else { th.lv2() };
                f.render_widget(
                    Paragraph::new(Line::from(Span::styled(line, style))),
                    Rect {
                        x: form_x,
                        y,
                        width: form_w,
                        height: 1,
                    },
                );
                y += 1;
            }

            if let Some(e) = error {
                y += 1;
                f.render_widget(
                    Paragraph::new(Line::from(Span::styled(format!("  {e}"), th.lv5()))),
                    Rect {
                        x: form_x,
                        y,
                        width: form_w,
                        height: 1,
                    },
                );
            }

            f.render_widget(
                Paragraph::new(Line::from(Span::styled(
                    "  enter: edit   esc: back",
                    th.lv1(),
                ))),
                Rect {
                    x: form_x,
                    y: area.height.saturating_sub(2),
                    width: form_w,
                    height: 1,
                },
            );
        }

        SettingsMode::Edit { field, input, cur } => {
            let label = match field {
                SettingsField::Theme => "theme",
                SettingsField::ApiUrl => "api url",
            };
            let hint = match field {
                SettingsField::Theme => "white  phosphor  amber",
                SettingsField::ApiUrl => "e.g. https://api.maschina.ai",
            };

            f.render_widget(
                Paragraph::new(Line::from(Span::styled(format!("  {label}"), th.lv3()))),
                Rect {
                    x: form_x,
                    y,
                    width: form_w,
                    height: 1,
                },
            );
            y += 1;
            f.render_widget(
                Paragraph::new(Line::from(Span::styled(format!("  {hint}"), th.lv1()))),
                Rect {
                    x: form_x,
                    y,
                    width: form_w,
                    height: 1,
                },
            );
            y += 1;

            let box_inner = format!("{:<width$}", input, width = inner_w.saturating_sub(2));
            f.render_widget(
                Paragraph::new(Line::from(Span::styled(format!("  {box_inner}"), th.lv3()))).block(
                    Block::default()
                        .borders(Borders::ALL)
                        .border_style(th.lv2()),
                ),
                Rect {
                    x: form_x,
                    y,
                    width: form_w,
                    height: 3,
                },
            );
            let cx = form_x + 3 + (*cur).min(inner_w.saturating_sub(2)) as u16;
            f.set_cursor_position((cx, y + 1));
            y += 4;

            if let Some(e) = error {
                f.render_widget(
                    Paragraph::new(Line::from(Span::styled(format!("  {e}"), th.lv5()))),
                    Rect {
                        x: form_x,
                        y,
                        width: form_w,
                        height: 1,
                    },
                );
            }

            f.render_widget(
                Paragraph::new(Line::from(Span::styled(
                    "  enter: save   esc: back",
                    th.lv1(),
                ))),
                Rect {
                    x: form_x,
                    y: area.height.saturating_sub(2),
                    width: form_w,
                    height: 1,
                },
            );
        }
    }
}

// ── draw: run ─────────────────────────────────────────────────────────────────

fn draw_run(f: &mut ratatui::Frame, app: &App) {
    let area = f.area();
    let th = app.theme;
    f.render_widget(Clear, area);

    let (input, cur, messages, busy, error, scroll) = if let Screen::Run {
        input,
        cur,
        messages,
        busy,
        error,
        scroll,
        ..
    } = &app.screen
    {
        (
            input.as_str(),
            *cur,
            messages.as_slice(),
            *busy,
            error.as_deref(),
            *scroll,
        )
    } else {
        return;
    };

    let form_w = 84u16.min(area.width.saturating_sub(4));
    let form_x = center_x(area, form_w);
    let inner_w = form_w.saturating_sub(4) as usize;

    let footer_h = 1u16;
    let input_h = 3u16;
    let msg_area_h = area.height.saturating_sub(footer_h + input_h + 1);

    // build message lines
    let mut lines: Vec<Line> = vec![];
    for msg in messages {
        match msg {
            RunMsg::User(text) => {
                lines.push(Line::from(Span::styled("  you", th.lv4())));
                for l in word_wrap(text, inner_w) {
                    lines.push(Line::from(Span::styled(format!("  {l}"), th.lv3())));
                }
                lines.push(Line::raw(""));
            }
            RunMsg::Assistant(text) => {
                lines.push(Line::from(Span::styled("  maschina", th.lv3())));
                for l in word_wrap(text, inner_w) {
                    lines.push(Line::from(Span::styled(format!("  {l}"), th.lv3())));
                }
                lines.push(Line::raw(""));
            }
            RunMsg::Error(text) => {
                lines.push(Line::from(Span::styled(
                    format!("  error: {text}"),
                    th.lv5(),
                )));
                lines.push(Line::raw(""));
            }
        }
    }

    if busy {
        let spin = SPIN[app.tick as usize % SPIN.len()];
        lines.push(Line::from(Span::styled(format!("  {spin}"), th.lv2())));
    }

    if lines.is_empty() {
        lines.push(Line::raw(""));
        lines.push(Line::from(Span::styled("  type a prompt below", th.lv2())));
    }

    // scroll: 0 = follow tail; >0 = locked N lines up from bottom
    let visible = msg_area_h as usize;
    let total = lines.len();
    let clamped_scroll = scroll.min(total.saturating_sub(visible));
    let end = total.saturating_sub(clamped_scroll);
    let start = end.saturating_sub(visible);
    let shown: Vec<Line> = lines[start..end].to_vec();

    f.render_widget(
        Paragraph::new(shown),
        Rect {
            x: form_x,
            y: area.y,
            width: form_w,
            height: msg_area_h,
        },
    );

    // divider
    let divider_y = msg_area_h;
    if divider_y < area.height {
        f.render_widget(
            Paragraph::new(Line::from(Span::styled(
                "─".repeat(form_w as usize),
                th.lv1(),
            ))),
            Rect {
                x: form_x,
                y: divider_y,
                width: form_w,
                height: 1,
            },
        );
    }

    // input box
    let input_y = divider_y + 1;
    let display: String = input.to_string();
    f.render_widget(
        Paragraph::new(display.clone()).block(
            Block::default()
                .borders(Borders::ALL)
                .border_style(if busy { th.lv1() } else { th.lv2() })
                .title(Span::styled(
                    if let Some(err) = error {
                        format!(" error: {err} ")
                    } else {
                        " prompt ".to_string()
                    },
                    if error.is_some() { th.lv5() } else { th.lv2() },
                )),
        ),
        Rect {
            x: form_x,
            y: input_y,
            width: form_w,
            height: input_h,
        },
    );

    // cursor in input box
    if !busy {
        let cursor_x = form_x + 1 + cur.min(display.chars().count()) as u16;
        let cursor_y = input_y + 1;
        if cursor_x < form_x + form_w - 1 && cursor_y < area.height {
            f.set_cursor_position((cursor_x, cursor_y));
        }
    }

    // footer
    let footer_y = area.height.saturating_sub(1);
    f.render_widget(
        Paragraph::new(Line::from(Span::styled(
            "  esc  back   enter  send",
            th.lv1(),
        ))),
        Rect {
            x: area.x,
            y: footer_y,
            width: area.width,
            height: 1,
        },
    );
}

// ── event loop ────────────────────────────────────────────────────────────────

pub fn run(profile: &str) -> Result<Option<LaunchTarget>> {
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(
        stdout,
        EnterAlternateScreen,
        EnableMouseCapture,
        crossterm::terminal::Clear(crossterm::terminal::ClearType::Purge),
        crossterm::terminal::Clear(crossterm::terminal::ClearType::All),
        SetTitle("maschina")
    )?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let mut app = App::new(profile);

    loop {
        app.tick = app.tick.wrapping_add(1);

        if let Some((_, t)) = &app.msg {
            if t.elapsed() >= Duration::from_secs(3) {
                app.msg = None;
            }
        }

        // check for completed background run
        if let Some(rx) = &app.run_rx {
            if let Ok(result) = rx.try_recv() {
                app.run_rx = None;
                if let Screen::Run {
                    messages,
                    busy,
                    error,
                    scroll,
                    ..
                } = &mut app.screen
                {
                    *busy = false;
                    *scroll = 0; // snap back to tail when response arrives
                    match result {
                        Ok(output) => messages.push(RunMsg::Assistant(output)),
                        Err(e) => {
                            *error = Some(e.clone());
                            messages.push(RunMsg::Error(e));
                        }
                    }
                }
            }
        }

        terminal.draw(|f| match &app.screen {
            Screen::Login { .. } => draw_login(f, &app),
            Screen::Home => draw_home(f, &app),
            Screen::Agents { .. } => draw_agents(f, &app),
            Screen::Run { .. } => draw_run(f, &app),
            Screen::Models { .. } => draw_models(f, &app),
            Screen::Usage { .. } => draw_usage(f, &app),
            Screen::Settings { .. } => draw_settings(f, &app),
        })?;

        if !event::poll(Duration::from_millis(100))? {
            continue;
        }
        let ev = event::read()?;

        // ── mouse scroll (only meaningful on run screen) ───────────────────────
        if let Event::Mouse(me) = &ev {
            use crossterm::event::MouseEventKind;
            match me.kind {
                MouseEventKind::ScrollUp => {
                    if let Screen::Run { scroll, .. } = &mut app.screen {
                        *scroll += 3;
                    }
                }
                MouseEventKind::ScrollDown => {
                    if let Screen::Run { scroll, .. } = &mut app.screen {
                        *scroll = scroll.saturating_sub(3);
                    }
                }
                _ => {}
            }
            continue;
        }

        let Event::Key(key) = ev else { continue };
        if key.kind != KeyEventKind::Press {
            continue;
        }

        // ── login ─────────────────────────────────────────────────────────────
        if matches!(app.screen, Screen::Login { .. }) {
            if let Screen::Login {
                mode,
                choose_sel,
                step,
                email,
                password,
                confirm,
                cur,
                error,
                busy,
            } = &mut app.screen
            {
                if *busy {
                    continue;
                }
                match mode {
                    AuthMode::Choose => match key.code {
                        KeyCode::Esc => break,
                        KeyCode::Up => {
                            if *choose_sel > 0 {
                                *choose_sel -= 1;
                            }
                        }
                        KeyCode::Down => {
                            *choose_sel = (*choose_sel + 1).min(1);
                        }
                        KeyCode::Enter => {
                            *mode = if *choose_sel == 0 {
                                AuthMode::Login
                            } else {
                                AuthMode::Signup
                            };
                            *step = 0;
                            *cur = 0;
                            email.clear();
                            password.clear();
                            confirm.clear();
                            *error = None;
                        }
                        _ => {}
                    },

                    AuthMode::Login | AuthMode::Signup => {
                        let max_steps = if *mode == AuthMode::Login { 2 } else { 3 };
                        let pw_snap = password.clone();
                        let cf_snap = confirm.clone();
                        let cur_empty = match *step {
                            0 => email.is_empty(),
                            1 => password.is_empty(),
                            _ => confirm.is_empty(),
                        };
                        let cur_len = match *step {
                            0 => email.len(),
                            1 => password.len(),
                            _ => confirm.len(),
                        };

                        let current_val: &mut String = match step {
                            0 => email,
                            1 => password,
                            _ => confirm,
                        };

                        match key.code {
                            KeyCode::Esc => {
                                if *step == 0 {
                                    *mode = AuthMode::Choose;
                                    *error = None;
                                } else {
                                    *step -= 1;
                                    *cur = match step {
                                        0 => email.len(),
                                        1 => password.len(),
                                        _ => confirm.len(),
                                    };
                                    *error = None;
                                }
                            }
                            KeyCode::Enter => {
                                if cur_empty {
                                    continue;
                                }
                                if *step + 1 < max_steps {
                                    *step += 1;
                                    *cur = 0;
                                    *error = None;
                                } else if *mode == AuthMode::Signup && pw_snap != cf_snap {
                                    *error = Some("passwords do not match".into());
                                } else {
                                    let _ = current_val;
                                    if *mode == AuthMode::Login {
                                        app.do_login();
                                    } else {
                                        app.do_signup();
                                    }
                                }
                            }
                            KeyCode::Backspace => {
                                if *cur > 0 {
                                    current_val.remove(*cur - 1);
                                    *cur -= 1;
                                } else if *step > 0 {
                                    *step -= 1;
                                    *cur = match step {
                                        0 => email.len(),
                                        1 => password.len(),
                                        _ => confirm.len(),
                                    };
                                    *error = None;
                                }
                            }
                            KeyCode::Char(c) => {
                                current_val.insert(*cur, c);
                                *cur += 1;
                                *error = None;
                            }
                            KeyCode::Left => {
                                if *cur > 0 {
                                    *cur -= 1;
                                }
                            }
                            KeyCode::Right => {
                                if *cur < cur_len {
                                    *cur += 1;
                                }
                            }
                            _ => {}
                        }
                    }
                }
            }
            continue;
        }

        // ── agents screen ─────────────────────────────────────────────────────
        if matches!(app.screen, Screen::Agents { .. }) {
            let is_busy = matches!(&app.screen, Screen::Agents { busy: true, .. });

            // extract mode info before mutable borrow
            let in_create = matches!(
                &app.screen,
                Screen::Agents {
                    mode: AgentsMode::Create { .. },
                    ..
                }
            );
            let create_step = if let Screen::Agents {
                mode: AgentsMode::Create { step, .. },
                ..
            } = &app.screen
            {
                *step
            } else {
                0
            };

            let mut go_back = false;
            let mut do_create: Option<(String, String)> = None;

            if let Screen::Agents {
                agents,
                sel,
                mode,
                error,
                ..
            } = &mut app.screen
            {
                match mode {
                    AgentsMode::List => {
                        if !is_busy {
                            match key.code {
                                KeyCode::Esc => go_back = true,
                                KeyCode::Up => {
                                    if !agents.is_empty() && *sel > 0 {
                                        *sel -= 1;
                                    }
                                }
                                KeyCode::Down => {
                                    if !agents.is_empty() {
                                        *sel = (*sel + 1).min(agents.len() - 1);
                                    }
                                }
                                KeyCode::Enter => {
                                    if let Some(agent) = agents.get(*sel).cloned() {
                                        app.active_agent = Some(agent);
                                        app.set_msg("active agent set");
                                        app.screen = Screen::Home;
                                    }
                                }
                                KeyCode::Char('n') => {
                                    *mode = AgentsMode::Create {
                                        step: 0,
                                        name: String::new(),
                                        name_cur: 0,
                                        type_sel: 0,
                                    };
                                    *error = None;
                                }
                                KeyCode::Char('d') => {} // handled below after borrow ends
                                _ => {}
                            }
                        }
                    }
                    AgentsMode::Create {
                        step,
                        name,
                        name_cur,
                        type_sel,
                    } => match *step {
                        0 => match key.code {
                            KeyCode::Esc => *mode = AgentsMode::List,
                            KeyCode::Enter => {
                                if !name.is_empty() {
                                    *step = 1;
                                }
                            }
                            KeyCode::Char(c) if !c.is_control() => {
                                name.insert(*name_cur, c);
                                *name_cur += 1;
                            }
                            KeyCode::Backspace => {
                                if *name_cur > 0 {
                                    name.remove(*name_cur - 1);
                                    *name_cur -= 1;
                                }
                            }
                            KeyCode::Left => {
                                if *name_cur > 0 {
                                    *name_cur -= 1;
                                }
                            }
                            KeyCode::Right => {
                                if *name_cur < name.len() {
                                    *name_cur += 1;
                                }
                            }
                            _ => {}
                        },
                        _ => match key.code {
                            KeyCode::Esc => *step = 0,
                            KeyCode::Up => {
                                if *type_sel > 0 {
                                    *type_sel -= 1;
                                }
                            }
                            KeyCode::Down => {
                                *type_sel = (*type_sel + 1).min(AGENT_TYPES.len() - 1);
                            }
                            KeyCode::Enter => {
                                do_create =
                                    Some((name.clone(), AGENT_TYPES[*type_sel].0.to_string()));
                            }
                            _ => {}
                        },
                    },
                }
            }

            if go_back {
                app.screen = Screen::Home;
            } else if key.code == KeyCode::Char('d') && !in_create && !is_busy {
                app.delete_agent();
            } else if let Some((name, agent_type)) = do_create {
                app.create_agent(name, agent_type);
            }

            // set active after enter in list mode was handled above via direct assignment
            let _ = create_step;
            continue;
        }

        // ── run screen ────────────────────────────────────────────────────────
        if matches!(app.screen, Screen::Run { .. }) {
            let is_busy = matches!(&app.screen, Screen::Run { busy: true, .. });
            if is_busy {
                continue;
            }

            let mut should_run = false;
            let mut go_home = false;

            if let Screen::Run {
                input,
                cur,
                messages,
                error,
                ..
            } = &mut app.screen
            {
                match key.code {
                    KeyCode::Esc => go_home = true,
                    KeyCode::Enter => should_run = true,
                    KeyCode::Char(c) if !c.is_control() => {
                        input.insert(*cur, c);
                        *cur += 1;
                        *error = None;
                    }
                    KeyCode::Backspace => {
                        if *cur > 0 {
                            input.remove(*cur - 1);
                            *cur -= 1;
                        }
                    }
                    KeyCode::Left => {
                        if *cur > 0 {
                            *cur -= 1;
                        }
                    }
                    KeyCode::Right => {
                        if *cur < input.len() {
                            *cur += 1;
                        }
                    }
                    KeyCode::Up => {
                        // scroll up through history — handled by auto-scroll for now
                        let _ = messages;
                    }
                    _ => {}
                }
            }

            if go_home {
                app.screen = Screen::Home;
            } else if should_run {
                app.do_run();
            }
            continue;
        }

        // ── models screen ─────────────────────────────────────────────────────
        if matches!(app.screen, Screen::Models { .. }) {
            match &app.screen {
                Screen::Models {
                    mode: ModelsMode::List,
                    ..
                } => {
                    match key.code {
                        KeyCode::Esc => app.screen = Screen::Home,
                        KeyCode::Up => {
                            if let Screen::Models { sel, .. } = &mut app.screen {
                                if *sel > 0 {
                                    *sel -= 1;
                                }
                            }
                        }
                        KeyCode::Down => {
                            if let Screen::Models { sel, .. } = &mut app.screen {
                                *sel = (*sel + 1).min(PROVIDERS.len() - 1);
                            }
                        }
                        KeyCode::Char('d') | KeyCode::Delete => {
                            let idx = if let Screen::Models { sel, .. } = &app.screen {
                                *sel
                            } else {
                                0
                            };
                            app.clear_provider(idx);
                        }
                        KeyCode::Enter => {
                            if let Screen::Models { sel, mode, error } = &mut app.screen {
                                let idx = *sel;
                                let spec = &PROVIDERS[idx];
                                let cfg = config::load(&app.profile).unwrap_or_default();
                                let existing =
                                    cfg.model_providers.iter().find(|p| p.name == spec.name);
                                // prefill with existing value
                                let prefill = if spec.needs_url && !spec.needs_key {
                                    existing
                                        .and_then(|p| p.base_url.clone())
                                        .unwrap_or_else(|| spec.default_url.to_string())
                                } else {
                                    existing.and_then(|p| p.api_key.clone()).unwrap_or_default()
                                };
                                let cur = prefill.len();
                                *mode = ModelsMode::Edit {
                                    provider_idx: idx,
                                    step: 0,
                                    input: prefill,
                                    cur,
                                };
                                *error = None;
                            }
                        }
                        _ => {}
                    }
                }
                Screen::Models {
                    mode: ModelsMode::Edit { .. },
                    ..
                } => {
                    let mut go_back = false;
                    let mut do_save = false;

                    if let Screen::Models {
                        mode: ModelsMode::Edit { input, cur, .. },
                        error,
                        ..
                    } = &mut app.screen
                    {
                        match key.code {
                            KeyCode::Esc => go_back = true,
                            KeyCode::Enter => do_save = true,
                            KeyCode::Char(c) if !c.is_control() => {
                                input.insert(*cur, c);
                                *cur += 1;
                                *error = None;
                            }
                            KeyCode::Backspace => {
                                if *cur > 0 {
                                    input.remove(*cur - 1);
                                    *cur -= 1;
                                }
                            }
                            KeyCode::Left => {
                                if *cur > 0 {
                                    *cur -= 1;
                                }
                            }
                            KeyCode::Right => {
                                if *cur < input.len() {
                                    *cur += 1;
                                }
                            }
                            _ => {}
                        }
                    }

                    if go_back {
                        if let Screen::Models { mode, .. } = &mut app.screen {
                            *mode = ModelsMode::List;
                        }
                    } else if do_save {
                        let (idx, step, val) = if let Screen::Models {
                            mode:
                                ModelsMode::Edit {
                                    provider_idx,
                                    step,
                                    input,
                                    ..
                                },
                            ..
                        } = &app.screen
                        {
                            (*provider_idx, *step, input.clone())
                        } else {
                            (0, 0, String::new())
                        };

                        let spec = &PROVIDERS[idx];
                        if spec.needs_url && !spec.needs_key {
                            // Ollama-style: only URL
                            app.save_provider(idx, None, Some(val));
                            app.set_msg(format!("{} saved", spec.display));
                            if let Screen::Models { mode, .. } = &mut app.screen {
                                *mode = ModelsMode::List;
                            }
                        } else if spec.needs_url && spec.needs_key {
                            // both fields — step 0 = url, step 1 = key
                            if step == 0 {
                                // advance to api key step
                                if let Screen::Models {
                                    mode:
                                        ModelsMode::Edit {
                                            step, input, cur, ..
                                        },
                                    ..
                                } = &mut app.screen
                                {
                                    *step = 1;
                                    *input = String::new();
                                    *cur = 0;
                                }
                            } else {
                                // save both — we need the URL from before; for simplicity reload from config
                                let cfg = config::load(&app.profile).unwrap_or_default();
                                let existing_url = cfg
                                    .model_providers
                                    .iter()
                                    .find(|p| p.name == spec.name)
                                    .and_then(|p| p.base_url.clone());
                                app.save_provider(idx, Some(val), existing_url);
                                app.set_msg(format!("{} saved", spec.display));
                                if let Screen::Models { mode, .. } = &mut app.screen {
                                    *mode = ModelsMode::List;
                                }
                            }
                        } else {
                            // key only
                            app.save_provider(idx, Some(val), None);
                            app.set_msg(format!("{} saved", spec.display));
                            if let Screen::Models { mode, .. } = &mut app.screen {
                                *mode = ModelsMode::List;
                            }
                        }
                    }
                }
                _ => {}
            }
            continue;
        }

        // ── usage screen ──────────────────────────────────────────────────────
        if matches!(app.screen, Screen::Usage { .. }) {
            if key.code == KeyCode::Esc {
                app.screen = Screen::Home;
            }
            continue;
        }

        // ── settings screen ───────────────────────────────────────────────────
        if matches!(app.screen, Screen::Settings { .. }) {
            let mut go_back = false;
            let mut do_edit = false;
            let mut do_save = false;

            match &app.screen {
                Screen::Settings {
                    mode: SettingsMode::List { sel: _ },
                    ..
                } => match key.code {
                    KeyCode::Esc => go_back = true,
                    KeyCode::Up => {
                        if let Screen::Settings {
                            mode: SettingsMode::List { sel },
                            ..
                        } = &mut app.screen
                        {
                            if *sel > 0 {
                                *sel -= 1;
                            }
                        }
                    }
                    KeyCode::Down => {
                        if let Screen::Settings {
                            mode: SettingsMode::List { sel },
                            ..
                        } = &mut app.screen
                        {
                            *sel = (*sel + 1).min(1);
                        }
                    }
                    KeyCode::Enter => do_edit = true,
                    _ => {}
                },
                Screen::Settings {
                    mode: SettingsMode::Edit { .. },
                    ..
                } => match key.code {
                    KeyCode::Esc => {
                        if let Screen::Settings { mode, error } = &mut app.screen {
                            *mode = SettingsMode::List { sel: 0 };
                            *error = None;
                        }
                    }
                    KeyCode::Enter => do_save = true,
                    KeyCode::Char(c) if !c.is_control() => {
                        if let Screen::Settings {
                            mode: SettingsMode::Edit { input, cur, .. },
                            ..
                        } = &mut app.screen
                        {
                            input.insert(*cur, c);
                            *cur += 1;
                        }
                    }
                    KeyCode::Backspace => {
                        if let Screen::Settings {
                            mode: SettingsMode::Edit { input, cur, .. },
                            ..
                        } = &mut app.screen
                        {
                            if *cur > 0 {
                                input.remove(*cur - 1);
                                *cur -= 1;
                            }
                        }
                    }
                    KeyCode::Left => {
                        if let Screen::Settings {
                            mode: SettingsMode::Edit { cur, .. },
                            ..
                        } = &mut app.screen
                        {
                            if *cur > 0 {
                                *cur -= 1;
                            }
                        }
                    }
                    KeyCode::Right => {
                        if let Screen::Settings {
                            mode: SettingsMode::Edit { input, cur, .. },
                            ..
                        } = &mut app.screen
                        {
                            if *cur < input.len() {
                                *cur += 1;
                            }
                        }
                    }
                    _ => {}
                },
                _ => {}
            }

            if go_back {
                app.screen = Screen::Home;
            }

            if do_edit {
                let sel = if let Screen::Settings {
                    mode: SettingsMode::List { sel },
                    ..
                } = &app.screen
                {
                    *sel
                } else {
                    0
                };
                let cfg = config::load(&app.profile).unwrap_or_default();
                let (field, prefill) = match sel {
                    0 => (SettingsField::Theme, app.theme.name().to_string()),
                    _ => (SettingsField::ApiUrl, cfg.api_url.clone()),
                };
                let cur = prefill.len();
                if let Screen::Settings { mode, error } = &mut app.screen {
                    *mode = SettingsMode::Edit {
                        field,
                        input: prefill,
                        cur,
                    };
                    *error = None;
                }
            }

            if do_save {
                let (field_name, val) = if let Screen::Settings {
                    mode: SettingsMode::Edit { field, input, .. },
                    ..
                } = &app.screen
                {
                    let name = match field {
                        SettingsField::Theme => "theme",
                        SettingsField::ApiUrl => "api_url",
                    };
                    (name, input.clone())
                } else {
                    ("", String::new())
                };

                let mut cfg = config::load(&app.profile).unwrap_or_default();
                match field_name {
                    "theme" => {
                        let t = match val.trim() {
                            "phosphor" => ThemeKind::Phosphor,
                            "amber" => ThemeKind::Amber,
                            _ => ThemeKind::White,
                        };
                        app.theme = t;
                        cfg.tui_theme = Some(t.name().to_string());
                    }
                    "api_url" => {
                        cfg.api_url = val.trim().to_string();
                    }
                    _ => {}
                }
                config::save(&cfg, &app.profile).ok();
                app.set_msg("saved");
                if let Screen::Settings { mode, .. } = &mut app.screen {
                    *mode = SettingsMode::List { sel: 0 };
                }
            }

            continue;
        }

        // ── home ──────────────────────────────────────────────────────────────
        match key.code {
            KeyCode::Esc => break,
            KeyCode::Up => {
                let n = NAV_ITEMS.len();
                app.nav_sel = if app.nav_sel == 0 {
                    n - 1
                } else {
                    app.nav_sel - 1
                };
            }
            KeyCode::Down => {
                app.nav_sel = (app.nav_sel + 1) % NAV_ITEMS.len();
            }
            KeyCode::Enter => match NAV_ITEMS[app.nav_sel].0 {
                "run" => {
                    app.screen = Screen::Run {
                        input: String::new(),
                        cur: 0,
                        messages: vec![],
                        busy: false,
                        error: None,
                        scroll: 0,
                    };
                }
                "agents" => app.enter_agents(),
                "models" => app.enter_models(),
                "usage" => app.enter_usage(),
                "settings" => app.enter_settings(),
                "logout" => app.logout(),
                _ => app.set_msg("coming soon"),
            },
            KeyCode::Char('t') => app.toggle_theme(),
            _ => {}
        }
    }

    disable_raw_mode()?;
    execute!(
        terminal.backend_mut(),
        DisableMouseCapture,
        LeaveAlternateScreen
    )?;
    terminal.show_cursor()?;
    Ok(app.exit_with)
}
