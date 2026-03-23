use std::io;
use std::time::Duration;

use anyhow::Result;
use crossterm::{
    event::{self, Event, KeyCode, KeyEventKind, KeyModifiers},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use indicatif::{ProgressBar, ProgressStyle};
use ratatui::{
    backend::CrosstermBackend,
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, List, ListItem, Paragraph},
    Terminal,
};

use crate::{
    client::ApiClient,
    config::{self, Config, ModelProvider},
    project, services,
};

// ── banner ────────────────────────────────────────────────────────────────────

const BANNER: &[&str] = &[
    "██▄  ▄██ ▄████▄ ▄█████ ▄█████ ██  ██ ██ ███  ██ ▄████▄",
    "██ ██ ██ ██▄▄██ ▀▀▀▄▄▄ ██     ██████ ██ ██ ▀▄██ ██▄▄██",
    "██    ██ ██  ██ █████▀ ▀█████ ██  ██ ██ ██   ██ ██  ██",
];

// ── wire types ────────────────────────────────────────────────────────────────

#[derive(serde::Serialize)]
struct LoginBody {
    email: String,
    password: String,
}
#[derive(serde::Serialize)]
struct RegisterBody {
    email: String,
    password: String,
}
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct AuthResponse {
    access_token: String,
}
#[derive(serde::Serialize)]
struct CreateKeyBody {
    name: String,
}
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct CreatedKey {
    key: String,
}

// ── wizard state machine ──────────────────────────────────────────────────────

#[derive(Clone, PartialEq)]
enum Step {
    ApiUrl,
    AuthChoice,
    AuthEmail,
    AuthPassword,
    AuthPasswordConfirm, // only for register
    AuthKey,
    ProviderSelect,
    ProviderCredential, // loops per selected provider
    DbChoice,
    DbUrl,
    WorkspaceConfirm,
    WorkspaceName,
    Done,
    Cancelled,
}

#[derive(Clone)]
struct InputField {
    value: String,
    cursor: usize,
    masked: bool,
}

impl InputField {
    fn new(default: &str) -> Self {
        Self {
            cursor: default.chars().count(),
            value: default.to_string(),
            masked: false,
        }
    }
    fn masked(default: &str) -> Self {
        Self {
            masked: true,
            ..Self::new(default)
        }
    }
    fn paste(&mut self, text: &str) {
        for c in text.chars() {
            if c == '\n' || c == '\r' {
                continue;
            }
            let byte_pos = self
                .value
                .char_indices()
                .nth(self.cursor)
                .map(|(i, _)| i)
                .unwrap_or(self.value.len());
            self.value.insert(byte_pos, c);
            self.cursor += 1;
        }
    }

    fn handle_key(&mut self, key: KeyCode) {
        match key {
            KeyCode::Char(c) => {
                let byte_pos = self
                    .value
                    .char_indices()
                    .nth(self.cursor)
                    .map(|(i, _)| i)
                    .unwrap_or(self.value.len());
                self.value.insert(byte_pos, c);
                self.cursor += 1;
            }
            KeyCode::Backspace => {
                if self.cursor > 0 {
                    self.cursor -= 1;
                    let byte_pos = self
                        .value
                        .char_indices()
                        .nth(self.cursor)
                        .map(|(i, _)| i)
                        .unwrap_or(self.value.len());
                    self.value.remove(byte_pos);
                }
            }
            KeyCode::Left => {
                if self.cursor > 0 {
                    self.cursor -= 1;
                }
            }
            KeyCode::Right => {
                if self.cursor < self.value.chars().count() {
                    self.cursor += 1;
                }
            }
            KeyCode::Home => self.cursor = 0,
            KeyCode::End => self.cursor = self.value.chars().count(),
            _ => {}
        }
    }
    fn display(&self) -> String {
        if self.masked {
            "*".repeat(self.value.chars().count())
        } else {
            self.value.clone()
        }
    }
}

#[derive(Clone)]
struct SelectField {
    options: Vec<&'static str>,
    cursor: usize,
}

impl SelectField {
    fn new(options: Vec<&'static str>) -> Self {
        Self { options, cursor: 0 }
    }
    fn up(&mut self) {
        if self.cursor > 0 {
            self.cursor -= 1;
        }
    }
    fn down(&mut self) {
        if self.cursor + 1 < self.options.len() {
            self.cursor += 1;
        }
    }
}

#[derive(Clone)]
struct MultiSelect {
    options: Vec<&'static str>,
    cursor: usize,
    checked: Vec<bool>,
}

impl MultiSelect {
    fn new(options: Vec<&'static str>) -> Self {
        let len = options.len();
        Self {
            options,
            cursor: 0,
            checked: vec![false; len],
        }
    }
    fn up(&mut self) {
        if self.cursor > 0 {
            self.cursor -= 1;
        }
    }
    fn down(&mut self) {
        if self.cursor + 1 < self.options.len() {
            self.cursor += 1;
        }
    }
    fn toggle(&mut self) {
        self.checked[self.cursor] = !self.checked[self.cursor];
    }
    fn selected_indices(&self) -> Vec<usize> {
        self.checked
            .iter()
            .enumerate()
            .filter(|(_, &c)| c)
            .map(|(i, _)| i)
            .collect()
    }
}

#[derive(Clone)]
struct ProviderCred {
    name: &'static str,
    is_url: bool, // ollama uses url instead of key
    input: InputField,
}

struct WizardApp {
    step: Step,
    api_url: InputField,
    auth_choice: SelectField,
    auth_email: InputField,
    auth_password: InputField,
    auth_password_confirm: InputField,
    auth_key: InputField,
    provider_select: MultiSelect,
    provider_creds: Vec<ProviderCred>,
    provider_idx: usize,
    db_choice: SelectField,
    db_url: InputField,
    workspace_confirm: SelectField,
    workspace_name: InputField,
    error: Option<String>,
    // final outputs
    out_api_url: String,
    out_email: Option<String>,
    out_password: Option<String>,
    out_raw_key: Option<String>,
    out_providers: Vec<ProviderCred>,
    out_db_url: Option<String>,
    out_init_workspace: bool,
    out_workspace_name: Option<String>,
}

static PROVIDER_OPTIONS: &[&str] = &[
    "Anthropic (Claude)",
    "OpenAI (GPT-4o, o1, o3)",
    "Ollama (local models)",
    "OpenRouter",
    "Google Gemini",
    "Mistral",
    "Skip for now",
];

static AUTH_OPTIONS: &[&str] = &[
    "Log in to existing account",
    "Create a new account",
    "Paste an API key",
];

static DB_OPTIONS: &[&str] = &[
    "SQLite  (local, zero setup)",
    "PostgreSQL  (self-hosted or Docker)",
    "Neon  (serverless Postgres)",
];

static WS_OPTIONS: &[&str] = &["Yes", "No"];

impl WizardApp {
    fn new(existing: &Config) -> Self {
        Self {
            step: Step::ApiUrl,
            api_url: InputField::new(&existing.api_url),
            auth_choice: SelectField::new(AUTH_OPTIONS.to_vec()),
            auth_email: InputField::new(""),
            auth_password: InputField::masked(""),
            auth_password_confirm: InputField::masked(""),
            auth_key: InputField::masked(""),
            provider_select: MultiSelect::new(PROVIDER_OPTIONS.to_vec()),
            provider_creds: vec![],
            provider_idx: 0,
            db_choice: SelectField::new(DB_OPTIONS.to_vec()),
            db_url: InputField::new("postgresql://maschina:maschina@localhost:5432/maschina"),
            workspace_confirm: SelectField::new(WS_OPTIONS.to_vec()),
            workspace_name: InputField::new(""),
            error: None,
            out_api_url: String::new(),
            out_email: None,
            out_password: None,
            out_raw_key: None,
            out_providers: vec![],
            out_db_url: None,
            out_init_workspace: false,
            out_workspace_name: None,
        }
    }

    fn step_info(&self) -> (u8, u8, &'static str) {
        match self.step {
            Step::ApiUrl => (1, 5, "connection"),
            Step::AuthChoice
            | Step::AuthEmail
            | Step::AuthPassword
            | Step::AuthPasswordConfirm
            | Step::AuthKey => (2, 5, "account"),
            Step::ProviderSelect | Step::ProviderCredential => (3, 5, "providers"),
            Step::DbChoice | Step::DbUrl => (4, 5, "database"),
            Step::WorkspaceConfirm | Step::WorkspaceName => (5, 5, "workspace"),
            _ => (5, 5, "workspace"),
        }
    }

    fn advance(&mut self) {
        self.error = None;
        match self.step.clone() {
            Step::ApiUrl => {
                if self.api_url.value.trim().is_empty() {
                    self.error = Some("API URL cannot be empty".into());
                    return;
                }
                self.step = Step::AuthChoice;
            }
            Step::AuthChoice => {
                self.step = match self.auth_choice.cursor {
                    0 => Step::AuthEmail,
                    1 => Step::AuthEmail,
                    _ => Step::AuthKey,
                };
            }
            Step::AuthEmail => {
                let email = self.auth_email.value.trim().to_string();
                if email.is_empty() {
                    self.error = Some("Email cannot be empty".into());
                    return;
                }
                if !email.contains('@') || !email.contains('.') {
                    self.error = Some("Enter a valid email address".into());
                    return;
                }
                self.step = Step::AuthPassword;
            }
            Step::AuthPassword => {
                if self.auth_password.value.is_empty() {
                    self.error = Some("Password cannot be empty".into());
                    return;
                }
                if self.auth_choice.cursor == 1 && self.auth_password.value.chars().count() < 12 {
                    self.error = Some("Password must be at least 12 characters".into());
                    return;
                }
                if self.auth_choice.cursor == 1 {
                    // register — require confirmation
                    self.step = Step::AuthPasswordConfirm;
                } else {
                    self.step = Step::ProviderSelect;
                }
            }
            Step::AuthPasswordConfirm => {
                if self.auth_password_confirm.value.is_empty() {
                    self.error = Some("Please confirm your password".into());
                    return;
                }
                if self.auth_password_confirm.value != self.auth_password.value {
                    self.error = Some("Passwords do not match".into());
                    return;
                }
                self.step = Step::ProviderSelect;
            }
            Step::AuthKey => {
                if self.auth_key.value.trim().is_empty() {
                    self.error = Some("API key cannot be empty".into());
                    return;
                }
                self.step = Step::ProviderSelect;
            }
            Step::ProviderSelect => {
                let selected = self.provider_select.selected_indices();
                // "Skip for now" is last option
                let skip_idx = self.provider_select.options.len() - 1;
                if selected.contains(&skip_idx) || selected.is_empty() {
                    self.step = Step::DbChoice;
                    return;
                }
                self.provider_creds = selected
                    .iter()
                    .filter(|&&i| i != skip_idx)
                    .map(|&i| {
                        let name = self.provider_select.options[i];
                        let is_url = name.starts_with("Ollama");
                        let default = if is_url { "http://localhost:11434" } else { "" };
                        let mut input = if is_url {
                            InputField::new(default)
                        } else {
                            InputField::masked(default)
                        };
                        input.masked = !is_url;
                        ProviderCred {
                            name,
                            is_url,
                            input,
                        }
                    })
                    .collect();
                self.provider_idx = 0;
                if self.provider_creds.is_empty() {
                    self.step = Step::DbChoice;
                } else {
                    self.step = Step::ProviderCredential;
                }
            }
            Step::ProviderCredential => {
                let cred = &self.provider_creds[self.provider_idx];
                if cred.input.value.trim().is_empty() {
                    self.error = Some(format!(
                        "{} — value cannot be empty (press esc to skip)",
                        cred.name
                    ));
                    return;
                }
                self.provider_idx += 1;
                if self.provider_idx >= self.provider_creds.len() {
                    self.step = Step::DbChoice;
                }
            }
            Step::DbChoice => {
                match self.db_choice.cursor {
                    1 | 2 => {
                        // postgres or neon — need URL
                        if self.db_choice.cursor == 2 {
                            self.db_url = InputField::new("");
                        }
                        self.step = Step::DbUrl;
                    }
                    _ => self.step = Step::WorkspaceConfirm, // sqlite
                }
            }
            Step::DbUrl => {
                if self.db_url.value.trim().is_empty() {
                    self.error = Some("Connection URL cannot be empty".into());
                    return;
                }
                self.step = Step::WorkspaceConfirm;
            }
            Step::WorkspaceConfirm => {
                if self.workspace_confirm.cursor == 0 {
                    self.out_init_workspace = true;
                    self.step = Step::WorkspaceName;
                } else {
                    self.out_init_workspace = false;
                    self.collect_outputs();
                    self.step = Step::Done;
                }
            }
            Step::WorkspaceName => {
                self.collect_outputs();
                self.step = Step::Done;
            }
            _ => {}
        }
    }

    fn go_back(&mut self) {
        self.error = None;
        self.step = match self.step.clone() {
            Step::AuthChoice => Step::ApiUrl,
            Step::AuthEmail => Step::AuthChoice,
            Step::AuthPassword => Step::AuthEmail,
            Step::AuthPasswordConfirm => Step::AuthPassword,
            Step::AuthKey => Step::AuthChoice,
            Step::ProviderSelect => match self.auth_choice.cursor {
                0 => Step::AuthPassword,
                1 => Step::AuthPasswordConfirm,
                _ => Step::AuthKey,
            },
            Step::ProviderCredential => {
                if self.provider_idx > 0 {
                    self.provider_idx -= 1;
                } else {
                    return;
                }
                Step::ProviderCredential
            }
            Step::DbChoice => Step::ProviderSelect,
            Step::DbUrl => Step::DbChoice,
            Step::WorkspaceConfirm => Step::DbChoice,
            Step::WorkspaceName => Step::WorkspaceConfirm,
            _ => return,
        };
    }

    fn collect_outputs(&mut self) {
        self.out_api_url = self.api_url.value.trim().to_string();
        match self.auth_choice.cursor {
            0 | 1 => {
                self.out_email = Some(self.auth_email.value.trim().to_string());
                self.out_password = Some(self.auth_password.value.clone());
            }
            _ => {
                self.out_raw_key = Some(self.auth_key.value.trim().to_string());
            }
        }
        self.out_providers = self.provider_creds.clone();
        self.out_db_url = match self.db_choice.cursor {
            0 => {
                let base = dirs::data_local_dir()
                    .unwrap_or_else(|| std::path::PathBuf::from("~/.local/share"))
                    .join("maschina")
                    .join("data.db");
                Some(format!("sqlite:{}", base.display()))
            }
            _ => Some(self.db_url.value.trim().to_string()),
        };
        if self.out_init_workspace && !self.workspace_name.value.trim().is_empty() {
            self.out_workspace_name = Some(self.workspace_name.value.trim().to_string());
        }
    }

    fn skip_provider_cred(&mut self) {
        self.error = None;
        self.provider_idx += 1;
        if self.provider_idx >= self.provider_creds.len() {
            self.step = Step::DbChoice;
        }
    }

    fn paste_clipboard(&mut self, text: &str) {
        let text: String = text.chars().filter(|&c| c != '\n' && c != '\r').collect();
        match self.step {
            Step::ApiUrl => self.api_url.paste(&text),
            Step::AuthEmail => self.auth_email.paste(&text),
            Step::AuthPassword => self.auth_password.paste(&text),
            Step::AuthPasswordConfirm => self.auth_password_confirm.paste(&text),
            Step::AuthKey => self.auth_key.paste(&text),
            Step::DbUrl => self.db_url.paste(&text),
            Step::WorkspaceName => self.workspace_name.paste(&text),
            Step::ProviderCredential => {
                let idx = self.provider_idx;
                self.provider_creds[idx].input.paste(&text);
            }
            _ => {}
        }
        self.error = None;
    }
}

// ── draw ──────────────────────────────────────────────────────────────────────

static STEP_NAMES: &[&str] = &[
    "connection",
    "account",
    "providers",
    "database",
    "workspace",
];

fn draw(f: &mut ratatui::Frame, app: &WizardApp) {
    use ratatui::layout::Alignment;

    let area = f.area();
    let dim = Style::default().fg(Color::DarkGray);
    let gray = Style::default().fg(Color::Gray);
    let bold = Style::default()
        .fg(Color::White)
        .add_modifier(Modifier::BOLD);
    let white = Style::default().fg(Color::White);

    let desired_w: u16 = 80;
    let w = desired_w.min(area.width);
    let x = area.width.saturating_sub(w) / 2;

    let input_step = is_input_step(&app.step);
    let two_h = two_col_height(app);
    let inp_h: u16 = if input_step { 4 } else { 0 };

    // y is pinned using the tallest possible panel so the top section never shifts.
    // max two_col_h = 1 + PROVIDER_OPTIONS.len() (7 options) = 8; max inp_h = 4.
    let max_h = 3u16 + 1 + 1 + 1 + (1 + PROVIDER_OPTIONS.len() as u16).max(5) + 4;
    let y = area.height.saturating_sub(max_h) / 2;

    let desired_h = 3u16 + 1 + 1 + 1 + two_h + inp_h;
    let h = desired_h.min(area.height);

    let panel = Rect {
        x,
        y,
        width: w,
        height: h,
    };
    f.render_widget(Clear, panel);

    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3),     // [0] banner
            Constraint::Length(1),     // [1] rule
            Constraint::Length(1),     // [2] subtitle
            Constraint::Length(1),     // [3] blank
            Constraint::Length(two_h), // [4] two-col
            Constraint::Length(inp_h), // [5] input box (0 for select steps)
        ])
        .split(panel);

    // ── banner ────────────────────────────────────────────────────────────────
    let banner_lines: Vec<Line> = BANNER
        .iter()
        .map(|l| Line::from(Span::styled(*l, gray)))
        .collect();
    f.render_widget(
        Paragraph::new(banner_lines).alignment(Alignment::Center),
        chunks[0],
    );

    // ── rule ──────────────────────────────────────────────────────────────────
    f.render_widget(
        Paragraph::new(Line::from(Span::styled("─".repeat(w as usize), dim))),
        chunks[1],
    );

    // ── subtitle: The Agentic Network left · v0.1.0 right ────────────────────
    let sub = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Min(0), Constraint::Length(8)])
        .split(chunks[2]);
    f.render_widget(
        Paragraph::new(Line::from(Span::styled("The Agentic Network", dim))),
        sub[0],
    );
    f.render_widget(
        Paragraph::new(Line::from(Span::styled(
            concat!("v", env!("CARGO_PKG_VERSION")),
            dim,
        )))
        .alignment(Alignment::Right),
        sub[1],
    );

    // ── two-col ───────────────────────────────────────────────────────────────
    let cols = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Min(0), Constraint::Length(20)])
        .split(chunks[4]);

    // left: header on row 0, options immediately below (no gap)
    let (step_n, step_total, step_title) = app.step_info();
    f.render_widget(
        Paragraph::new(Line::from(vec![
            Span::styled("[ ", dim),
            Span::styled(format!("{}/{} ", step_n, step_total), dim),
            Span::styled(step_title, bold),
            Span::styled(" ]  ", dim),
            Span::styled(step_question(app), gray),
        ])),
        Rect {
            height: 1,
            ..cols[0]
        },
    );

    if !input_step && cols[0].height > 1 {
        let opts_rect = Rect {
            y: cols[0].y + 1,
            height: cols[0].height - 1,
            ..cols[0]
        };
        draw_options(f, app, opts_rect, dim, bold);
    }

    // right: step list with dots, top-aligned (sticky)
    let (current_n, _, _) = app.step_info();
    let step_lines: Vec<Line> = STEP_NAMES
        .iter()
        .enumerate()
        .map(|(i, name)| {
            let n = (i + 1) as u8;
            let (name_style, dot_style) = if n < current_n {
                (dim, white) // completed: dim name, filled dot
            } else if n == current_n {
                (bold, white) // active: bold name, filled dot
            } else {
                (dim, dim) // upcoming: dim name, dim dot
            };
            Line::from(vec![
                Span::styled(*name, name_style),
                Span::styled(" ●", dot_style),
            ])
        })
        .collect();
    f.render_widget(
        Paragraph::new(step_lines).alignment(Alignment::Right),
        Rect {
            height: (STEP_NAMES.len() as u16).min(cols[1].height),
            ..cols[1]
        },
    );

    // ── input box (input steps only, directly below two-col) ─────────────────
    if input_step && inp_h > 0 {
        draw_input_box(f, app, chunks[5], dim);
    }

    // ── footer — pinned to fixed position near bottom ─────────────────────────
    let footer_text = match app.step {
        Step::ProviderSelect => "space toggle  enter confirm  esc back",
        Step::WorkspaceConfirm => "↑/↓ navigate  enter select  esc back",
        Step::ProviderCredential => "enter confirm  esc skip  ctrl+c cancel",
        _ => "enter confirm  esc back  ctrl+c cancel",
    };
    f.render_widget(
        Paragraph::new(Line::from(Span::styled(footer_text, dim))).alignment(Alignment::Center),
        Rect {
            x,
            y: area.height.saturating_sub(3),
            width: w,
            height: 1,
        },
    );
}

fn is_input_step(step: &Step) -> bool {
    matches!(
        step,
        Step::ApiUrl
            | Step::AuthEmail
            | Step::AuthPassword
            | Step::AuthPasswordConfirm
            | Step::AuthKey
            | Step::DbUrl
            | Step::WorkspaceName
            | Step::ProviderCredential
    )
}

fn two_col_height(app: &WizardApp) -> u16 {
    let left = match app.step {
        Step::AuthChoice => 1 + AUTH_OPTIONS.len() as u16,
        Step::ProviderSelect => 1 + PROVIDER_OPTIONS.len() as u16,
        Step::DbChoice => 1 + DB_OPTIONS.len() as u16,
        Step::WorkspaceConfirm => 1 + WS_OPTIONS.len() as u16,
        _ => 1,
    };
    left.max(5) // right col always shows all 5 steps
}

fn step_question(app: &WizardApp) -> String {
    match &app.step {
        Step::ApiUrl => "API URL".into(),
        Step::AuthChoice => "How would you like to authenticate?".into(),
        Step::AuthEmail => "Email".into(),
        Step::AuthPassword => "Password".into(),
        Step::AuthPasswordConfirm => "Confirm password".into(),
        Step::AuthKey => "API key  (msk_...)".into(),
        Step::ProviderSelect => "Select AI providers".into(),
        Step::ProviderCredential => {
            if let Some(cred) = app.provider_creds.get(app.provider_idx) {
                if cred.is_url {
                    format!("{} — base URL", cred.name)
                } else {
                    format!("{} — API key", cred.name)
                }
            } else {
                String::new()
            }
        }
        Step::DbChoice => "Which database?".into(),
        Step::DbUrl => "Connection URL".into(),
        Step::WorkspaceConfirm => {
            let cwd = std::env::current_dir().unwrap_or_default();
            let home = dirs::home_dir().unwrap_or_default();
            if cwd == home {
                "Init workspace at ~/.maschina/?".into()
            } else {
                let name = cwd
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or("project");
                format!("Init project in ./{name}?")
            }
        }
        Step::WorkspaceName => "Project name".into(),
        _ => String::new(),
    }
}

fn draw_options(f: &mut ratatui::Frame, app: &WizardApp, area: Rect, dim: Style, bold: Style) {
    let items: Vec<ListItem> = match &app.step {
        Step::AuthChoice => app
            .auth_choice
            .options
            .iter()
            .enumerate()
            .map(|(i, opt)| {
                let (p, s) = if i == app.auth_choice.cursor {
                    ("▸ ", bold)
                } else {
                    ("  ", dim)
                };
                ListItem::new(Line::from(Span::styled(format!("{p}{opt}"), s)))
            })
            .collect(),
        Step::DbChoice => app
            .db_choice
            .options
            .iter()
            .enumerate()
            .map(|(i, opt)| {
                let (p, s) = if i == app.db_choice.cursor {
                    ("▸ ", bold)
                } else {
                    ("  ", dim)
                };
                ListItem::new(Line::from(Span::styled(format!("{p}{opt}"), s)))
            })
            .collect(),
        Step::WorkspaceConfirm => app
            .workspace_confirm
            .options
            .iter()
            .enumerate()
            .map(|(i, opt)| {
                let (p, s) = if i == app.workspace_confirm.cursor {
                    ("▸ ", bold)
                } else {
                    ("  ", dim)
                };
                ListItem::new(Line::from(Span::styled(format!("{p}{opt}"), s)))
            })
            .collect(),
        Step::ProviderSelect => app
            .provider_select
            .options
            .iter()
            .enumerate()
            .map(|(i, opt)| {
                let checked = if app.provider_select.checked[i] {
                    "✓"
                } else {
                    " "
                };
                let cursor = if i == app.provider_select.cursor {
                    "▸"
                } else {
                    " "
                };
                let style = if i == app.provider_select.cursor {
                    bold
                } else {
                    dim
                };
                ListItem::new(Line::from(Span::styled(
                    format!("{cursor} [{checked}] {opt}"),
                    style,
                )))
            })
            .collect(),
        _ => vec![],
    };

    let n = items.len() as u16;
    f.render_widget(
        List::new(items),
        Rect {
            height: n.min(area.height),
            ..area
        },
    );

    if let Some(e) = &app.error {
        let ey = area.y + n;
        if ey < area.y + area.height {
            f.render_widget(
                Paragraph::new(Line::from(Span::styled(
                    format!("✗ {e}"),
                    Style::default().fg(Color::Red),
                ))),
                Rect {
                    y: ey,
                    height: 1,
                    ..area
                },
            );
        }
    }
}

fn draw_input_box(f: &mut ratatui::Frame, app: &WizardApp, area: Rect, dim: Style) {
    if area.height < 4 {
        return;
    }
    let box_rect = Rect { height: 3, ..area };
    let hint_rect = Rect {
        y: area.y + 3,
        height: 1,
        ..area
    };

    let input = match &app.step {
        Step::ApiUrl => &app.api_url,
        Step::AuthEmail => &app.auth_email,
        Step::AuthPassword => &app.auth_password,
        Step::AuthPasswordConfirm => &app.auth_password_confirm,
        Step::AuthKey => &app.auth_key,
        Step::DbUrl => &app.db_url,
        Step::WorkspaceName => &app.workspace_name,
        Step::ProviderCredential => &app.provider_creds[app.provider_idx].input,
        _ => return,
    };

    let display = input.display();
    let chars: Vec<char> = display.chars().collect();
    let before: String = chars[..input.cursor.min(chars.len())].iter().collect();
    let cursor_ch = chars
        .get(input.cursor)
        .map(|c| c.to_string())
        .unwrap_or(" ".into());
    let after: String = if input.cursor < chars.len() {
        chars[input.cursor + 1..].iter().collect()
    } else {
        String::new()
    };

    f.render_widget(
        Paragraph::new(Line::from(vec![
            Span::styled(before, Style::default().fg(Color::White)),
            Span::styled(
                cursor_ch,
                Style::default().fg(Color::Black).bg(Color::White),
            ),
            Span::styled(after, Style::default().fg(Color::White)),
        ]))
        .block(
            Block::default()
                .borders(Borders::ALL)
                .border_style(Style::default().fg(Color::DarkGray)),
        ),
        box_rect,
    );

    let hint = if let Some(e) = &app.error {
        Span::styled(format!("✗ {e}"), Style::default().fg(Color::Red))
    } else {
        let h: String = match &app.step {
            Step::ApiUrl => "leave default unless self-hosting".into(),
            Step::AuthPassword => "min 12 chars".into(),
            Step::AuthPasswordConfirm => "re-enter your password to confirm".into(),
            Step::ProviderCredential => {
                let n = app.provider_idx + 1;
                let m = app.provider_creds.len();
                if n < m {
                    format!("esc to skip  ·  {} of {}", n, m)
                } else {
                    format!("{} of {}", n, m)
                }
            }
            Step::DbUrl => match app.db_choice.cursor {
                1 => "postgresql://user:password@host:port/dbname".into(),
                _ => "postgresql://user:password@ep-xxx.neon.tech/dbname?sslmode=require".into(),
            },
            _ => String::new(),
        };
        if h.is_empty() {
            Span::raw("")
        } else {
            Span::styled(h, dim)
        }
    };
    f.render_widget(
        Paragraph::new(Line::from(hint)).alignment(ratatui::layout::Alignment::Center),
        hint_rect,
    );
}

// ── event loop ────────────────────────────────────────────────────────────────

fn run_tui(app: &mut WizardApp) -> Result<bool> {
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let result = (|| {
        loop {
            terminal.draw(|f| draw(f, app))?;

            if app.step == Step::Done || app.step == Step::Cancelled {
                return Ok(app.step == Step::Done);
            }

            if !event::poll(Duration::from_millis(50))? {
                continue;
            }
            let Event::Key(key) = event::read()? else {
                continue;
            };
            if key.kind != KeyEventKind::Press {
                continue;
            }

            // ctrl+c always cancels
            if key.modifiers.contains(KeyModifiers::CONTROL) && key.code == KeyCode::Char('c') {
                app.step = Step::Cancelled;
                return Ok(false);
            }

            // ctrl+v — paste from clipboard
            if key.modifiers.contains(KeyModifiers::CONTROL) && key.code == KeyCode::Char('v') {
                if let Ok(mut cb) = arboard::Clipboard::new() {
                    if let Ok(text) = cb.get_text() {
                        app.paste_clipboard(&text);
                    }
                }
                continue;
            }

            match &app.step {
                Step::Done | Step::Cancelled => return Ok(app.step == Step::Done),

                Step::AuthChoice | Step::DbChoice | Step::WorkspaceConfirm => {
                    let sel = match app.step {
                        Step::AuthChoice => &mut app.auth_choice,
                        Step::DbChoice => &mut app.db_choice,
                        Step::WorkspaceConfirm => &mut app.workspace_confirm,
                        _ => unreachable!(),
                    };
                    match key.code {
                        KeyCode::Up | KeyCode::Char('k') => sel.up(),
                        KeyCode::Down | KeyCode::Char('j') => sel.down(),
                        KeyCode::Enter => app.advance(),
                        KeyCode::Esc => app.go_back(),
                        _ => {}
                    }
                }

                Step::ProviderSelect => match key.code {
                    KeyCode::Up | KeyCode::Char('k') => app.provider_select.up(),
                    KeyCode::Down | KeyCode::Char('j') => app.provider_select.down(),
                    KeyCode::Char(' ') => app.provider_select.toggle(),
                    KeyCode::Enter => {
                        let skip_idx = app.provider_select.options.len() - 1;
                        let nothing_checked = app.provider_select.selected_indices().is_empty();
                        let on_skip = app.provider_select.cursor == skip_idx;
                        if nothing_checked && !on_skip {
                            app.provider_select.toggle();
                        }
                        app.advance();
                    }
                    KeyCode::Esc => app.go_back(),
                    _ => {}
                },

                Step::ProviderCredential => match key.code {
                    KeyCode::Enter => app.advance(),
                    KeyCode::Esc => app.skip_provider_cred(),
                    other => {
                        let idx = app.provider_idx;
                        app.provider_creds[idx].input.handle_key(other);
                        app.error = None;
                    }
                },

                // text input steps
                _ => {
                    let input = match app.step {
                        Step::ApiUrl => &mut app.api_url,
                        Step::AuthEmail => &mut app.auth_email,
                        Step::AuthPassword => &mut app.auth_password,
                        Step::AuthPasswordConfirm => &mut app.auth_password_confirm,
                        Step::AuthKey => &mut app.auth_key,
                        Step::DbUrl => &mut app.db_url,
                        Step::WorkspaceName => &mut app.workspace_name,
                        _ => unreachable!(),
                    };
                    match key.code {
                        KeyCode::Enter => app.advance(),
                        KeyCode::Esc => app.go_back(),
                        other => {
                            input.handle_key(other);
                            app.error = None;
                        }
                    }
                }
            }
        }
    })();

    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen)?;
    terminal.show_cursor()?;
    result
}

// ── entry point ───────────────────────────────────────────────────────────────

pub async fn run(profile: &str) -> Result<()> {
    let existing = config::load(profile).unwrap_or_default();

    if existing.is_authenticated() {
        // quick reconfigure check in normal terminal
        use console::style as s;
        println!();
        println!(
            "  {}  {}",
            s("·").dim(),
            s(format!(
                "already configured  {}",
                config::path_display(profile)
            ))
            .dim()
        );
        print!("  reconfigure? [y/N] ");
        use std::io::Write;
        std::io::stdout().flush()?;
        let mut input = String::new();
        std::io::stdin().read_line(&mut input)?;
        if !matches!(input.trim().to_lowercase().as_str(), "y" | "yes") {
            println!();
            println!("  {}  already set up", s("✓").green());
            println!();
            return Ok(());
        }
        println!();
    }

    let mut app = WizardApp::new(&existing);
    let completed = run_tui(&mut app)?;

    if !completed {
        use console::style as s;
        println!();
        println!("  {}  setup cancelled", s("·").dim());
        println!();
        return Ok(());
    }

    // ── async work ────────────────────────────────────────────────────────────
    use console::style as s;
    println!();

    let api_url = &app.out_api_url;

    let auth_result: Result<(String, String, String)> = (|| async {
        match (app.auth_choice.cursor, &app.out_raw_key) {
            (2, Some(key)) => {
                let sp = spinner("verifying key");
                let tmp = tmp_config(api_url, key, profile);
                let client = ApiClient::new(&tmp)?;
                match client.get::<serde_json::Value>("/users/me").await {
                    Ok(v) => {
                        sp.finish_and_clear();
                        let email = v["email"].as_str().unwrap_or("").to_string();
                        let tier = v["tier"]
                            .as_str()
                            .or_else(|| v["plan"].as_str())
                            .unwrap_or("access")
                            .to_string();
                        ok("key verified");
                        Ok((key.clone(), email, tier))
                    }
                    Err(e) => {
                        sp.finish_and_clear();
                        Err(anyhow::anyhow!(friendly_err(&e.to_string(), api_url)))
                    }
                }
            }
            _ => {
                let email = app.out_email.clone().unwrap_or_default();
                let password = app.out_password.clone().unwrap_or_default();
                let is_register = app.auth_choice.cursor == 1;

                let sp = spinner(if is_register {
                    "creating account"
                } else {
                    "authenticating"
                });
                let http = http_client()?;

                let url = if is_register {
                    format!("{}/auth/register", api_url.trim_end_matches('/'))
                } else {
                    format!("{}/auth/login", api_url.trim_end_matches('/'))
                };

                let resp = if is_register {
                    http.post(&url)
                        .json(&RegisterBody {
                            email: email.clone(),
                            password,
                        })
                        .send()
                        .await
                } else {
                    http.post(&url)
                        .json(&LoginBody {
                            email: email.clone(),
                            password,
                        })
                        .send()
                        .await
                };

                let resp = match resp {
                    Ok(r) => r,
                    Err(e) => {
                        sp.finish_and_clear();
                        return Err(anyhow::anyhow!(friendly_err(&e.to_string(), api_url)));
                    }
                };

                if !resp.status().is_success() {
                    let status = resp.status();
                    let msg = extract_error(resp.text().await?);
                    sp.finish_and_clear();
                    fail(&msg);
                    println!();
                    if status.is_client_error() {
                        // auth error (wrong creds, email in use, etc.) — exit cleanly, no stack trace
                        std::process::exit(1);
                    }
                    return Err(anyhow::anyhow!(msg));
                }

                let session: AuthResponse = resp.json().await?;
                sp.finish_and_clear();
                ok(if is_register {
                    "account created"
                } else {
                    "authenticated"
                });

                let tmp = tmp_config(api_url, &session.access_token, profile);
                let client = ApiClient::new(&tmp)?;

                let me = client
                    .get::<serde_json::Value>("/users/me")
                    .await
                    .unwrap_or_default();
                let tier = me["tier"]
                    .as_str()
                    .or_else(|| me["plan"].as_str())
                    .unwrap_or("access")
                    .to_string();

                let sp2 = spinner("creating CLI key");
                let key = match client
                    .post::<_, CreatedKey>(
                        "/keys",
                        &CreateKeyBody {
                            name: "maschina-cli".into(),
                        },
                    )
                    .await
                {
                    Ok(created) => {
                        sp2.finish_and_clear();
                        ok("CLI key created");
                        created.key
                    }
                    Err(_) => {
                        sp2.finish_and_clear();
                        // fall back to session token — works until it expires
                        session.access_token.clone()
                    }
                };

                Ok((key, email, tier))
            }
        }
    })()
    .await;

    let (opt_api_key, verified_email, tier) = match auth_result {
        Ok((key, email, tier)) => (Some(key), email, tier),
        Err(e) => {
            let msg = e.to_string();
            if msg.contains("could not reach")
                || msg.contains("Connection refused")
                || msg.contains("timed out")
            {
                println!();
                warn("could not reach the API — saving config without authentication");
                info("run  maschina setup  again once the API is reachable");
                let email = app.out_email.clone().unwrap_or_default();
                (None, email, "access".to_string())
            } else {
                fail(&msg);
                anyhow::bail!("setup aborted");
            }
        }
    };

    // ── save config ───────────────────────────────────────────────────────────
    let model_providers: Vec<ModelProvider> = app
        .out_providers
        .iter()
        .map(|p| {
            if p.is_url {
                ModelProvider {
                    name: provider_name(p.name),
                    api_key: None,
                    base_url: Some(p.input.value.clone()),
                }
            } else {
                ModelProvider {
                    name: provider_name(p.name),
                    api_key: Some(p.input.value.clone()),
                    base_url: None,
                }
            }
        })
        .collect();

    let cfg = Config {
        api_url: api_url.clone(),
        api_key: opt_api_key.clone(),
        email: if verified_email.is_empty() {
            None
        } else {
            Some(verified_email.clone())
        },
        db_url: app.out_db_url.clone(),
        model_providers,
        node: None,
        tier: if tier == "access" {
            None
        } else {
            Some(tier.clone())
        },
        tui_theme: None,
        profile: profile.to_string(),
    };
    config::save(&cfg, profile)?;
    info(&format!(
        "config saved  {}",
        s(config::path_display(profile)).dim()
    ));

    // ── workspace init ────────────────────────────────────────────────────────
    if app.out_init_workspace {
        let cwd = std::env::current_dir()?;
        let home = dirs::home_dir().unwrap_or_default();
        let dot = if cwd == home {
            // never init directly in home — use ~/.maschina/
            dirs::data_local_dir()
                .unwrap_or_else(|| home.join(".local/share"))
                .join("maschina")
        } else {
            cwd.join(".maschina")
        };
        if !dot.exists() {
            let name = app.out_workspace_name.clone().unwrap_or_else(|| {
                if cwd == home {
                    "workspace".to_string()
                } else {
                    cwd.file_name()
                        .and_then(|n| n.to_str())
                        .unwrap_or("project")
                        .to_string()
                }
            });
            let pcfg = project::init_project_config(&name, None);
            project::save_project(&dot, &pcfg)?;
            ok(&format!("created {}", dot.display()));
        }
    }

    // ── service check ─────────────────────────────────────────────────────────
    let bin_dir = services::bin_dir();
    if !services::all()
        .iter()
        .any(|svc| bin_dir.join(svc.name).exists())
    {
        println!();
        warn(&format!(
            "service binaries not found in {}",
            s(bin_dir.display()).dim()
        ));
        info(&format!(
            "run {} to start services in dev mode",
            s("maschina service start").cyan()
        ));
    }

    print_done(&verified_email, &tier, opt_api_key.is_some());
    Ok(())
}

// ── helpers ───────────────────────────────────────────────────────────────────

fn tmp_config(api_url: &str, token: &str, profile: &str) -> Config {
    Config {
        api_url: api_url.to_string(),
        api_key: Some(token.to_string()),
        email: None,
        db_url: None,
        model_providers: vec![],
        node: None,
        tier: None,
        tui_theme: None,
        profile: profile.to_string(),
    }
}

fn provider_name(display: &str) -> String {
    match display {
        s if s.starts_with("Anthropic") => "anthropic",
        s if s.starts_with("OpenAI") => "openai",
        s if s.starts_with("Ollama") => "ollama",
        s if s.starts_with("OpenRouter") => "openrouter",
        s if s.starts_with("Google") => "gemini",
        s if s.starts_with("Mistral") => "mistral",
        _ => "unknown",
    }
    .to_string()
}

fn http_client() -> Result<reqwest::Client> {
    Ok(reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .user_agent(concat!("maschina-cli/", env!("CARGO_PKG_VERSION")))
        .build()?)
}

fn extract_error(body: String) -> String {
    serde_json::from_str::<serde_json::Value>(&body)
        .ok()
        .and_then(|v| v["message"].as_str().map(String::from))
        .unwrap_or(body)
}

fn friendly_err(raw: &str, api_url: &str) -> String {
    if raw.contains("error sending request")
        || raw.contains("Connection refused")
        || raw.contains("connect error")
    {
        use console::style as s;
        format!(
            "could not reach {}  —  is the API running?",
            s(api_url.trim_end_matches('/')).dim()
        )
    } else if raw.contains("timed out") {
        "request timed out  —  check your connection".into()
    } else {
        format!("network error  —  {raw}")
    }
}

fn spinner(msg: &str) -> ProgressBar {
    let pb = ProgressBar::new_spinner();
    pb.set_style(
        ProgressStyle::with_template("  {spinner:.dim} {msg}")
            .unwrap()
            .tick_strings(&["◜", "◠", "◝", "◞", "◡", "◟", ""]),
    );
    pb.set_message(msg.to_string());
    pb.enable_steady_tick(Duration::from_millis(120));
    pb
}

fn ok(msg: &str) {
    use console::style as s;
    println!("  {}  {}", s("✓").green(), msg);
}

fn info(msg: &str) {
    use console::style as s;
    println!("  {}  {}", s("·").dim(), s(msg).dim());
}

fn warn(msg: &str) {
    use console::style as s;
    println!("  {}  {}", s("!").yellow(), s(msg).dim());
}

fn fail(msg: &str) {
    use console::style as s;
    println!("  {}  {}", s("✗").red(), s(msg).dim());
}

fn print_done(email: &str, tier: &str, authenticated: bool) {
    use console::style as s;
    println!();
    println!("  {}", s("─".repeat(50)).dim());
    ok("setup complete");
    println!("  {}", s("─".repeat(50)).dim());
    println!();
    let auth_label = if authenticated {
        "signed in as"
    } else {
        "email       "
    };
    println!("  {}  {}", s(auth_label).dim(), s(email).bold());
    println!("  {}  {}", s("plan        ").dim(), s(tier).yellow());
    println!();
    info(&format!(
        "{:<38} start all services",
        s("maschina service start").cyan()
    ));
    info(&format!(
        "{:<38} list agents",
        s("maschina agent list").cyan()
    ));
    info(&format!(
        "{:<38} run an agent",
        s("maschina agent run <name>").cyan()
    ));
    info(&format!("{:<38} all commands", s("maschina --help").cyan()));
    println!();
}
