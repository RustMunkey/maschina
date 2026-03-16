use std::{
    io::{self, BufRead},
    time::{Duration, Instant},
};

use anyhow::Result;
use crossterm::{
    event::{self, Event, KeyCode, KeyEventKind, KeyModifiers},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{
    backend::CrosstermBackend,
    layout::{Alignment, Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Block, Borders, Clear, List, ListItem, Paragraph},
    Terminal,
};

use crate::{client::ApiClient, config, services};

// ── what to do after TUI exits ────────────────────────────────────────────────

pub enum LaunchTarget {
    Setup,
    Code,
}

// ── data types for inline screens ─────────────────────────────────────────────

struct UsageRow {
    quota: String,
    used: u64,
    limit: Option<u64>, // None = unlimited
}

struct AgentRow {
    id: String,
    name: String,
    agent_type: String,
    status: String,
}

// ── model provider table ───────────────────────────────────────────────────────
// (name, is_url_input, input_label)
static ALL_PROVIDERS: &[(&str, bool, &str)] = &[
    ("anthropic", false, "anthropic API key"),
    ("openai", false, "openai API key"),
    (
        "ollama",
        true,
        "ollama base URL (e.g. http://localhost:11434)",
    ),
    ("openrouter", false, "openrouter API key"),
    ("gemini", false, "gemini API key"),
    ("mistral", false, "mistral API key"),
    ("custom", true, "base URL (OpenAI-compatible endpoint)"),
];

enum ModelMode {
    List,
    EnterValue {
        provider: String,
        label: String,
        value: String,
        cursor: usize,
        masked: bool, // true = API key, false = URL
    },
}

// ── screens ───────────────────────────────────────────────────────────────────

enum Screen {
    Launcher,
    Usage {
        period: String,
        rows: Vec<UsageRow>,
        error: Option<String>,
    },
    Agents {
        agents: Vec<AgentRow>,
        sel: usize,
        error: Option<String>,
    },
    Models {
        sel: usize,
        mode: ModelMode,
        configured: Vec<String>, // provider names currently in config
    },
    Logs {
        svc: String,
        lines: Vec<String>,
        offset: usize,
    },
}

impl Screen {
    fn is_launcher(&self) -> bool {
        matches!(self, Screen::Launcher)
    }
}

// ── zones ─────────────────────────────────────────────────────────────────────

#[derive(PartialEq, Clone)]
enum Zone {
    Menu,
    Services,
}

// ── menu ──────────────────────────────────────────────────────────────────────

#[derive(Clone, PartialEq)]
enum MenuAction {
    Start,
    Stop,
    Logs,
    Agents,
    Usage,
    Models,
    Setup,
    Code,
    Quit,
}

struct MenuItem {
    label: &'static str,
    action: MenuAction,
    desc: &'static str,
}

static MENU: &[MenuItem] = &[
    MenuItem {
        label: "start services",
        action: MenuAction::Start,
        desc: "start all stopped services in sequence",
    },
    MenuItem {
        label: "stop services",
        action: MenuAction::Stop,
        desc: "gracefully stop all running services",
    },
    MenuItem {
        label: "view logs",
        action: MenuAction::Logs,
        desc: "tail live log for the focused service",
    },
    MenuItem {
        label: "agents",
        action: MenuAction::Agents,
        desc: "list and manage deployed agents",
    },
    MenuItem {
        label: "usage & quota",
        action: MenuAction::Usage,
        desc: "view token usage and monthly limits",
    },
    MenuItem {
        label: "models",
        action: MenuAction::Models,
        desc: "configure AI providers and API keys",
    },
    MenuItem {
        label: "setup wizard",
        action: MenuAction::Setup,
        desc: "configure account, providers, database",
    },
    MenuItem {
        label: "code tool",
        action: MenuAction::Code,
        desc: "open the interactive code assistant",
    },
    MenuItem {
        label: "quit",
        action: MenuAction::Quit,
        desc: "exit launcher (services keep running)",
    },
];

// ── spinner / banner ──────────────────────────────────────────────────────────

static SPIN: [&str; 4] = ["⠋", "⠙", "⠸", "⠴"];

const BANNER: &[&str] = &[
    "██▄  ▄██ ▄████▄ ▄█████ ▄█████ ██  ██ ██ ███  ██ ▄████▄",
    "██ ██ ██ ██▄▄██ ▀▀▀▄▄▄ ██     ██████ ██ ██ ▀▄██ ██▄▄██",
    "██    ██ ██  ██ █████▀ ▀█████ ██  ██ ██ ██   ██ ██  ██",
];

// ── app state ─────────────────────────────────────────────────────────────────

struct App {
    screen: Screen,
    services: Vec<services::Service>,
    svc_sel: usize,
    menu_sel: usize,
    zone: Zone,
    last_ref: Instant,
    probing: bool,
    msg: Option<(String, Instant)>,
    desc_ts: Option<Instant>,
    tick: u64,
    // account info
    email: Option<String>,
    provider: Option<String>,
    tier: Option<String>,
    cwd: String,
    profile: String,
    exit_with: Option<LaunchTarget>,
}

impl App {
    fn new(profile: &str) -> Self {
        let cfg = config::load(profile).unwrap_or_default();
        let email = cfg.email.clone();
        let provider = cfg.model_providers.first().map(|p| p.name.clone());
        let tier = cfg.tier.clone();
        let cwd = std::env::current_dir()
            .ok()
            .and_then(|p| {
                dirs::home_dir()
                    .and_then(|h| {
                        p.strip_prefix(&h)
                            .ok()
                            .map(|r| format!("~/{}", r.display()))
                    })
                    .or_else(|| Some(p.display().to_string()))
            })
            .unwrap_or_else(|| ".".to_string());

        let mut a = App {
            screen: Screen::Launcher,
            services: services::all(),
            svc_sel: 0,
            menu_sel: 0,
            zone: Zone::Menu,
            last_ref: Instant::now(),
            probing: false,
            msg: None,
            desc_ts: Some(Instant::now()),
            tick: 0,
            email,
            provider,
            tier,
            cwd,
            profile: profile.to_string(),
            exit_with: None,
        };
        services::probe_all(&mut a.services);
        a
    }

    fn refresh(&mut self) {
        services::probe_all(&mut self.services);
        self.last_ref = Instant::now();
        self.probing = false;
    }

    fn set_msg(&mut self, s: impl Into<String>) {
        self.msg = Some((s.into(), Instant::now()));
    }

    fn clamp(&mut self) {
        if self.svc_sel >= self.services.len() {
            self.svc_sel = self.services.len().saturating_sub(1);
        }
        if self.menu_sel >= MENU.len() {
            self.menu_sel = MENU.len().saturating_sub(1);
        }
    }

    fn open_logs(&mut self, svc_name: &str) {
        let path = services::log_path(svc_name, &services::find_workspace());
        let lines = if let Ok(f) = std::fs::File::open(&path) {
            let reader = io::BufReader::new(f);
            let all: Vec<String> = reader.lines().map_while(Result::ok).collect();
            let start = all.len().saturating_sub(200);
            all[start..].to_vec()
        } else {
            vec![format!("no log file at {}", path.display())]
        };
        let offset = lines.len().saturating_sub(1);
        self.screen = Screen::Logs {
            svc: svc_name.to_string(),
            lines,
            offset,
        };
    }

    fn enter_usage(&mut self) {
        let cfg = config::load(&self.profile).unwrap_or_default();
        let result: anyhow::Result<serde_json::Value> = match ApiClient::new(&cfg) {
            Err(e) => Err(e),
            Ok(client) => tokio::task::block_in_place(|| {
                tokio::runtime::Handle::current()
                    .block_on(async move { client.get::<serde_json::Value>("/usage").await })
            }),
        };
        self.screen = match result {
            Err(e) => Screen::Usage {
                period: String::new(),
                rows: vec![],
                error: Some(e.to_string()),
            },
            Ok(v) => {
                let period = v["period"].as_str().unwrap_or("current").to_string();
                let mut rows = vec![];
                if let Some(quotas) = v["quotas"].as_object() {
                    let mut pairs: Vec<_> = quotas.iter().collect();
                    pairs.sort_by_key(|(k, _)| (*k).clone());
                    for (key, val) in pairs {
                        rows.push(UsageRow {
                            quota: key.clone(),
                            used: val["used"].as_u64().unwrap_or(0),
                            limit: val["limit"].as_i64().filter(|&l| l >= 0).map(|l| l as u64),
                        });
                    }
                }
                Screen::Usage {
                    period,
                    rows,
                    error: None,
                }
            }
        };
    }

    fn enter_agents(&mut self) {
        let cfg = config::load(&self.profile).unwrap_or_default();
        let result: anyhow::Result<serde_json::Value> = match ApiClient::new(&cfg) {
            Err(e) => Err(e),
            Ok(client) => tokio::task::block_in_place(|| {
                tokio::runtime::Handle::current()
                    .block_on(async move { client.get::<serde_json::Value>("/agents").await })
            }),
        };
        self.screen = match result {
            Err(e) => Screen::Agents {
                agents: vec![],
                sel: 0,
                error: Some(e.to_string()),
            },
            Ok(v) => {
                let agents = v
                    .as_array()
                    .map(|arr| {
                        arr.iter()
                            .filter_map(|a| {
                                Some(AgentRow {
                                    id: a["id"].as_str()?.to_string(),
                                    name: a["name"].as_str().unwrap_or("").to_string(),
                                    agent_type: a["type"].as_str().unwrap_or("").to_string(),
                                    status: a["status"].as_str().unwrap_or("unknown").to_string(),
                                })
                            })
                            .collect()
                    })
                    .unwrap_or_default();
                Screen::Agents {
                    agents,
                    sel: 0,
                    error: None,
                }
            }
        };
    }

    fn enter_models(&mut self) {
        let cfg = config::load(&self.profile).unwrap_or_default();
        let configured = cfg.model_providers.iter().map(|p| p.name.clone()).collect();
        self.screen = Screen::Models {
            sel: 0,
            mode: ModelMode::List,
            configured,
        };
    }
}

// ── shared panel geometry ─────────────────────────────────────────────────────

fn panel(area: Rect, content_rows: u16) -> (Rect, Vec<Rect>) {
    let w = 80u16.min(area.width);
    let x = area.width.saturating_sub(w) / 2;
    let h = content_rows.min(area.height);
    let y = area.height.saturating_sub(h) / 2;
    let panel = Rect {
        x,
        y,
        width: w,
        height: h,
    };

    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints([
            Constraint::Length(3), // banner
            Constraint::Length(1), // rule
            Constraint::Length(1), // subtitle
            Constraint::Length(1), // blank
            Constraint::Min(0),    // body
        ])
        .split(panel);

    (panel, chunks.to_vec())
}

fn draw_banner(f: &mut ratatui::Frame, chunks: &[Rect], subtitle: &str, profile: &str) {
    let dim = Style::default().fg(Color::DarkGray);
    let gray = Style::default().fg(Color::Gray);
    let w = chunks[0].width;

    // banner
    let banner_lines: Vec<Line> = BANNER
        .iter()
        .map(|l| Line::from(Span::styled(*l, gray)))
        .collect();
    f.render_widget(
        Paragraph::new(banner_lines).alignment(Alignment::Center),
        chunks[0],
    );

    // rule
    f.render_widget(
        Paragraph::new(Line::from(Span::styled("─".repeat(w as usize), dim))),
        chunks[1],
    );

    // subtitle row: subtitle left · version right
    let sub = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Min(0), Constraint::Length(8)])
        .split(chunks[2]);

    let sub_text = if profile != "default" {
        format!("{subtitle}  [{profile}]")
    } else {
        subtitle.to_string()
    };
    f.render_widget(
        Paragraph::new(Line::from(Span::styled(sub_text, dim))),
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
}

fn draw_footer(f: &mut ratatui::Frame, area: Rect, panel: Rect, legend: &str, above: Option<&str>) {
    let dim = Style::default().fg(Color::DarkGray);
    let footer_y = area.height.saturating_sub(3);
    f.render_widget(
        Paragraph::new(Line::from(Span::styled(legend, dim))).alignment(Alignment::Center),
        Rect {
            x: panel.x,
            y: footer_y,
            width: panel.width,
            height: 1,
        },
    );
    if let Some(text) = above {
        f.render_widget(
            Paragraph::new(Line::from(Span::styled(text, dim))).alignment(Alignment::Center),
            Rect {
                x: panel.x,
                y: footer_y.saturating_sub(1),
                width: panel.width,
                height: 1,
            },
        );
    }
}

// ── draw: launcher ────────────────────────────────────────────────────────────

fn draw_launcher(f: &mut ratatui::Frame, app: &App) {
    let area = f.area();
    let dim = Style::default().fg(Color::DarkGray);
    let gray = Style::default().fg(Color::Gray);
    let bold = Style::default()
        .fg(Color::White)
        .add_modifier(Modifier::BOLD);
    let white = Style::default().fg(Color::White);
    let hi = Style::default().fg(Color::Cyan);

    let n_svc = app.services.len() as u16;
    let n_menu = MENU.len() as u16;
    let two_h = n_menu.max(n_svc);

    let content_h = 3u16 + 1 + 1 + 1 + two_h;
    let w = 80u16.min(area.width);
    let x = area.width.saturating_sub(w) / 2;
    let h = content_h.min(area.height);
    let y = area.height.saturating_sub(h) / 2;
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
            Constraint::Length(3),     // banner
            Constraint::Length(1),     // rule
            Constraint::Length(1),     // subtitle
            Constraint::Length(1),     // blank
            Constraint::Length(two_h), // two-col body
        ])
        .split(panel);

    // banner + subtitle
    let spinner = if app.probing {
        SPIN[(app.tick / 2 % 4) as usize]
    } else {
        ""
    };
    let acct = if let Some(ref email) = app.email {
        let prov = app.provider.as_deref().unwrap_or("no model");
        let tier = app.tier.as_deref().unwrap_or("access");
        format!("{email}  ·  {prov}  ·  {tier}  ·  {}  {spinner}", app.cwd)
    } else {
        format!("not configured — run setup wizard  {spinner}")
    };

    // banner
    let banner_lines: Vec<Line> = BANNER
        .iter()
        .map(|l| Line::from(Span::styled(*l, gray)))
        .collect();
    f.render_widget(
        Paragraph::new(banner_lines).alignment(Alignment::Center),
        chunks[0],
    );

    // rule
    f.render_widget(
        Paragraph::new(Line::from(Span::styled("─".repeat(w as usize), dim))),
        chunks[1],
    );

    // subtitle
    let sub = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Min(0), Constraint::Length(8)])
        .split(chunks[2]);
    f.render_widget(Paragraph::new(Line::from(Span::styled(acct, dim))), sub[0]);
    f.render_widget(
        Paragraph::new(Line::from(Span::styled(
            concat!("v", env!("CARGO_PKG_VERSION")),
            dim,
        )))
        .alignment(Alignment::Right),
        sub[1],
    );

    // two-col body
    let cols = Layout::default()
        .direction(Direction::Horizontal)
        .constraints([Constraint::Min(0), Constraint::Length(30)])
        .split(chunks[4]);

    // left: menu
    let menu_items: Vec<ListItem> = MENU
        .iter()
        .enumerate()
        .map(|(i, item)| {
            let sel = i == app.menu_sel && app.zone == Zone::Menu;
            let prefix = if sel { "▸ " } else { "  " };
            let is_quit = item.action == MenuAction::Quit;
            let style = if sel {
                bold
            } else if is_quit {
                dim
            } else {
                gray
            };
            ListItem::new(Line::from(Span::styled(
                format!("{}{}", prefix, item.label),
                style,
            )))
        })
        .collect();
    f.render_widget(
        List::new(menu_items),
        Rect {
            height: n_menu.min(cols[0].height),
            ..cols[0]
        },
    );

    // right: services
    let svc_focused = app.zone == Zone::Services;
    let svc_lines: Vec<Line> = app
        .services
        .iter()
        .enumerate()
        .map(|(i, svc)| {
            let is_sel = i == app.svc_sel && svc_focused;
            let running = svc.status.is_running();
            let dot = if running { "●" } else { "○" };
            let dot_s = if running { white } else { dim };
            let name_s = if is_sel {
                hi
            } else if running {
                gray
            } else {
                dim
            };
            let prefix = if is_sel { "▸ " } else { "  " };
            let p = svc.port.map(|p| format!(":{p}")).unwrap_or_default();
            Line::from(vec![
                Span::styled(prefix, name_s),
                Span::styled(dot, dot_s),
                Span::raw(" "),
                Span::styled(format!("{:<10}", svc.name), name_s),
                Span::styled(format!("{p:<7}"), dim),
                Span::styled(svc.status.label(), dim),
            ])
        })
        .collect();
    f.render_widget(
        Paragraph::new(svc_lines),
        Rect {
            height: n_svc.min(cols[1].height),
            ..cols[1]
        },
    );

    // footer + description/message
    let legend = if svc_focused {
        "↑/↓ navigate  enter toggle  l logs  tab menu  q quit"
    } else {
        "↑/↓ navigate  enter select  tab services  l logs  r refresh  q quit"
    };

    let above: Option<String> = if let Some((msg, t)) = &app.msg {
        if t.elapsed() < Duration::from_secs(5) {
            Some(msg.clone())
        } else {
            None
        }
    } else if let Some(ts) = &app.desc_ts {
        if ts.elapsed() < Duration::from_secs(3) {
            Some(MENU[app.menu_sel].desc.to_string())
        } else {
            None
        }
    } else {
        None
    };

    let footer_y = area.height.saturating_sub(3);
    f.render_widget(
        Paragraph::new(Line::from(Span::styled(legend, dim))).alignment(Alignment::Center),
        Rect {
            x,
            y: footer_y,
            width: w,
            height: 1,
        },
    );
    if let Some(text) = above {
        f.render_widget(
            Paragraph::new(Line::from(Span::styled(text.as_str(), dim)))
                .alignment(Alignment::Center),
            Rect {
                x,
                y: footer_y.saturating_sub(1),
                width: w,
                height: 1,
            },
        );
    }
}

// ── draw: usage ───────────────────────────────────────────────────────────────

fn draw_usage(
    f: &mut ratatui::Frame,
    profile: &str,
    period: &str,
    rows: &[UsageRow],
    error: &Option<String>,
) {
    use ratatui::style::Color::*;

    let area = f.area();
    let n_rows = rows.len() as u16;
    let body_h = if error.is_some() {
        3
    } else {
        n_rows.max(1) + 2
    };
    let content = 3 + 1 + 1 + 1 + body_h;
    let (pnl, ch) = panel(area, content);
    f.render_widget(Clear, pnl);

    let subtitle = if period.is_empty() {
        "usage".to_string()
    } else {
        format!("usage  ·  {period}")
    };
    draw_banner(f, &ch, &subtitle, profile);

    let dim = Style::default().fg(DarkGray);
    let cyan = Style::default().fg(Cyan);
    let gray = Style::default().fg(Gray);

    let body = ch[4];

    if let Some(err) = error {
        f.render_widget(
            Paragraph::new(Line::from(Span::styled(
                err.as_str(),
                Style::default().fg(Red),
            )))
            .alignment(Alignment::Center),
            Rect {
                y: body.y + 1,
                height: 1,
                ..body
            },
        );
    } else {
        // header row
        f.render_widget(
            Paragraph::new(Line::from(vec![
                Span::styled(format!("  {:<28}", "QUOTA"), dim),
                Span::styled(format!("{:>10}  {:>10}  {}", "USED", "LIMIT", ""), dim),
            ])),
            Rect { height: 1, ..body },
        );

        let mut lines: Vec<Line> = rows
            .iter()
            .map(|r| {
                let limit_s = r
                    .limit
                    .map(|l| l.to_string())
                    .unwrap_or_else(|| "unlimited".to_string());
                let pct = r
                    .limit
                    .map(|l| if l == 0 { 0 } else { r.used * 100 / l })
                    .unwrap_or(0);
                let bar = usage_bar(pct);
                Line::from(vec![
                    Span::styled(format!("  {:<28}", r.quota), gray),
                    Span::styled(format!("{:>10}", r.used), cyan),
                    Span::styled(format!("  {:>10}  ", limit_s), dim),
                    Span::raw(bar),
                ])
            })
            .collect();
        // blank line at end
        lines.push(Line::raw(""));

        f.render_widget(
            Paragraph::new(lines),
            Rect {
                y: body.y + 1,
                height: body.height.saturating_sub(1),
                ..body
            },
        );
    }

    draw_footer(f, area, pnl, "esc back", None);
}

fn usage_bar(pct: u64) -> String {
    let width = 10usize;
    let filled = (pct as usize * width / 100).min(width);
    let empty = width - filled;
    format!("[{}{}]", "█".repeat(filled), "░".repeat(empty))
}

// ── draw: agents ──────────────────────────────────────────────────────────────

fn draw_agents(
    f: &mut ratatui::Frame,
    profile: &str,
    agents: &[AgentRow],
    sel: usize,
    error: &Option<String>,
) {
    use ratatui::style::Color::*;

    let area = f.area();
    let n = agents.len() as u16;
    let body_h = if error.is_some() { 3 } else { n.max(1) + 2 };
    let content = 3 + 1 + 1 + 1 + body_h;
    let (pnl, ch) = panel(area, content);
    f.render_widget(Clear, pnl);
    draw_banner(f, &ch, "agents", profile);

    let dim = Style::default().fg(DarkGray);
    let gray = Style::default().fg(Gray);
    let bold = Style::default().fg(White).add_modifier(Modifier::BOLD);
    let cyan = Style::default().fg(Cyan);
    let body = ch[4];

    if let Some(err) = error {
        f.render_widget(
            Paragraph::new(vec![
                Line::raw(""),
                Line::from(Span::styled(err.as_str(), Style::default().fg(Red))),
                Line::raw(""),
                Line::from(Span::styled(
                    "  deploy agents through the API once it is reachable",
                    dim,
                )),
            ])
            .alignment(Alignment::Center),
            body,
        );
    } else if agents.is_empty() {
        f.render_widget(
            Paragraph::new(Line::from(Span::styled("  no agents yet", dim)))
                .alignment(Alignment::Center),
            Rect {
                y: body.y + 1,
                height: 1,
                ..body
            },
        );
    } else {
        // header
        f.render_widget(
            Paragraph::new(Line::from(vec![
                Span::styled(format!("  {:<36}", "ID"), dim),
                Span::styled(format!("{:<22}", "NAME"), dim),
                Span::styled(format!("{:<14}", "TYPE"), dim),
                Span::styled("STATUS", dim),
            ])),
            Rect { height: 1, ..body },
        );

        let rows: Vec<Line> = agents
            .iter()
            .enumerate()
            .map(|(i, a)| {
                let is_sel = i == sel;
                let prefix = if is_sel { "▸ " } else { "  " };
                let ns = if is_sel { bold } else { gray };
                Line::from(vec![
                    Span::styled(format!("{}{:<34}", prefix, &a.id), dim),
                    Span::styled(format!(" {:<22}", a.name), ns),
                    Span::styled(format!("{:<14}", a.agent_type), cyan),
                    Span::styled(&a.status, dim),
                ])
            })
            .collect();

        f.render_widget(
            Paragraph::new(rows),
            Rect {
                y: body.y + 1,
                height: body.height.saturating_sub(1),
                ..body
            },
        );
    }

    draw_footer(f, area, pnl, "↑/↓ navigate  esc back", None);
}

// ── draw: models ──────────────────────────────────────────────────────────────

fn draw_models(
    f: &mut ratatui::Frame,
    profile: &str,
    sel: usize,
    mode: &ModelMode,
    configured: &[String],
) {
    use ratatui::style::Color::*;

    let area = f.area();
    let n = ALL_PROVIDERS.len() as u16;
    let content = 3 + 1 + 1 + 1 + n + 1;
    let (pnl, ch) = panel(area, content);
    f.render_widget(Clear, pnl);
    draw_banner(f, &ch, "model providers", profile);

    let dim = Style::default().fg(DarkGray);
    let gray = Style::default().fg(Gray);
    let bold = Style::default().fg(White).add_modifier(Modifier::BOLD);
    let white = Style::default().fg(White);
    let body = ch[4];

    let items: Vec<ListItem> = ALL_PROVIDERS
        .iter()
        .enumerate()
        .map(|(i, (name, _, _))| {
            let is_sel = i == sel;
            let is_cfg = configured.contains(&name.to_string());
            let dot = if is_cfg { "●" } else { "○" };
            let dot_s = if is_cfg { white } else { dim };
            let name_s = if is_sel {
                bold
            } else if is_cfg {
                gray
            } else {
                dim
            };
            let prefix = if is_sel { "▸ " } else { "  " };
            ListItem::new(Line::from(vec![
                Span::styled(prefix, name_s),
                Span::styled(dot, dot_s),
                Span::raw(" "),
                Span::styled(*name, name_s),
            ]))
        })
        .collect();
    f.render_widget(
        List::new(items),
        Rect {
            height: n.min(body.height),
            ..body
        },
    );

    draw_footer(
        f,
        area,
        pnl,
        "↑/↓ navigate  enter configure  d remove  esc back",
        None,
    );

    // input overlay when adding
    if let ModelMode::EnterValue {
        label,
        value,
        cursor,
        masked,
        ..
    } = mode
    {
        let display = if *masked {
            "*".repeat(value.len())
        } else {
            value.clone()
        };
        let cursor_s = if cursor <= &display.len() {
            format!("{}|{}", &display[..*cursor], &display[*cursor..])
        } else {
            format!("{display}|")
        };

        let bw = 54u16.min(pnl.width);
        let bx = pnl.x + pnl.width.saturating_sub(bw) / 2;
        let by = body.y + sel as u16;
        let box_rect = Rect {
            x: bx,
            y: by.min(area.height.saturating_sub(5)),
            width: bw,
            height: 4,
        };

        f.render_widget(Clear, box_rect);
        f.render_widget(
            Block::default()
                .borders(Borders::ALL)
                .border_style(dim)
                .title(Span::styled(format!(" {label} "), dim)),
            box_rect,
        );
        f.render_widget(
            Paragraph::new(Line::from(Span::styled(
                cursor_s,
                Style::default().fg(White),
            ))),
            Rect {
                x: box_rect.x + 1,
                y: box_rect.y + 1,
                width: box_rect.width.saturating_sub(2),
                height: 1,
            },
        );
        f.render_widget(
            Paragraph::new(Line::from(Span::styled("enter save  esc cancel", dim)))
                .alignment(Alignment::Center),
            Rect {
                x: box_rect.x,
                y: box_rect.y + 2,
                width: box_rect.width,
                height: 1,
            },
        );
    }
}

// ── draw: log viewer ──────────────────────────────────────────────────────────

fn draw_logs(f: &mut ratatui::Frame, svc: &str, lines: &[String], offset: usize) {
    let area = f.area();
    let dim = Style::default().fg(Color::DarkGray);
    let bold = Style::default()
        .fg(Color::White)
        .add_modifier(Modifier::BOLD);

    let header_rect = Rect {
        x: 0,
        y: 0,
        width: area.width,
        height: 1,
    };
    let log_rect = Rect {
        x: 0,
        y: 1,
        width: area.width,
        height: area.height.saturating_sub(2),
    };
    let footer_rect = Rect {
        x: 0,
        y: area.height.saturating_sub(1),
        width: area.width,
        height: 1,
    };

    f.render_widget(Clear, area);
    f.render_widget(
        Paragraph::new(Line::from(Span::styled(format!(" logs: {svc}"), bold))),
        header_rect,
    );

    let visible = log_rect.height as usize;
    let start = offset.saturating_sub(visible.saturating_sub(1));
    let shown: Vec<ListItem> = lines[start..]
        .iter()
        .take(visible)
        .map(|l| {
            ListItem::new(Line::from(Span::styled(
                format!(" {l}"),
                Style::default().fg(Color::Gray),
            )))
        })
        .collect();
    f.render_widget(List::new(shown), log_rect);
    f.render_widget(
        Paragraph::new(Line::from(Span::styled(" ↑/↓ scroll  Esc/q back", dim))),
        footer_rect,
    );
}

// ── event loop ────────────────────────────────────────────────────────────────

pub fn run(profile: &str) -> Result<Option<LaunchTarget>> {
    let workspace = services::find_workspace();

    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen)?;
    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let mut app = App::new(profile);

    loop {
        app.tick = app.tick.wrapping_add(1);
        app.clamp();
        if let Some((_, t)) = &app.msg {
            if t.elapsed() >= Duration::from_secs(5) {
                app.msg = None;
            }
        }

        // Draw
        match &app.screen {
            Screen::Launcher => terminal.draw(|f| draw_launcher(f, &app))?,
            Screen::Usage {
                period,
                rows,
                error,
            } => {
                let period = period.clone();
                let rows_s: Vec<_> = rows
                    .iter()
                    .map(|r| (r.quota.clone(), r.used, r.limit))
                    .collect();
                let err = error.clone();
                terminal.draw(|f| {
                    let rows_d: Vec<UsageRow> = rows_s
                        .into_iter()
                        .map(|(q, u, l)| UsageRow {
                            quota: q,
                            used: u,
                            limit: l,
                        })
                        .collect();
                    draw_usage(f, profile, &period, &rows_d, &err);
                })?
            }
            Screen::Agents { agents, sel, error } => {
                let agents_s: Vec<_> = agents
                    .iter()
                    .map(|a| {
                        (
                            a.id.clone(),
                            a.name.clone(),
                            a.agent_type.clone(),
                            a.status.clone(),
                        )
                    })
                    .collect();
                let sel = *sel;
                let err = error.clone();
                terminal.draw(|f| {
                    let rows: Vec<AgentRow> = agents_s
                        .into_iter()
                        .map(|(id, name, at, st)| AgentRow {
                            id,
                            name,
                            agent_type: at,
                            status: st,
                        })
                        .collect();
                    draw_agents(f, profile, &rows, sel, &err);
                })?
            }
            Screen::Models {
                sel,
                mode,
                configured,
            } => {
                let sel = *sel;
                let cfgd = configured.clone();
                // draw_models needs mode ref — handle inline
                match mode {
                    ModelMode::List => {
                        terminal.draw(|f| draw_models(f, profile, sel, &ModelMode::List, &cfgd))?
                    }
                    ModelMode::EnterValue {
                        provider,
                        label,
                        value,
                        cursor,
                        masked,
                    } => {
                        let ev = ModelMode::EnterValue {
                            provider: provider.clone(),
                            label: label.clone(),
                            value: value.clone(),
                            cursor: *cursor,
                            masked: *masked,
                        };
                        terminal.draw(|f| draw_models(f, profile, sel, &ev, &cfgd))?
                    }
                }
            }
            Screen::Logs { svc, lines, offset } => {
                let svc = svc.clone();
                let lines = lines.clone();
                let offset = *offset;
                terminal.draw(|f| draw_logs(f, &svc, &lines, offset))?
            }
        };

        // Auto-refresh services on launcher
        if app.screen.is_launcher() && app.last_ref.elapsed() > Duration::from_secs(3) {
            app.refresh();
        }

        if !event::poll(Duration::from_millis(100))? {
            continue;
        }
        let Event::Key(key) = event::read()? else {
            continue;
        };
        if key.kind != KeyEventKind::Press {
            continue;
        }

        // ── log viewer ────────────────────────────────────────────────────────
        if let Screen::Logs { lines, offset, .. } = &mut app.screen {
            let len = lines.len();
            match key.code {
                KeyCode::Char('q') | KeyCode::Esc => app.screen = Screen::Launcher,
                KeyCode::Up | KeyCode::Char('k') => {
                    if *offset > 0 {
                        *offset -= 1;
                    }
                }
                KeyCode::Down | KeyCode::Char('j') => {
                    if *offset + 1 < len {
                        *offset += 1;
                    }
                }
                KeyCode::Char('g') => *offset = 0,
                KeyCode::Char('G') => *offset = len.saturating_sub(1),
                _ => {}
            }
            continue;
        }

        // ── usage ─────────────────────────────────────────────────────────────
        if matches!(app.screen, Screen::Usage { .. }) {
            if matches!(key.code, KeyCode::Esc | KeyCode::Char('q')) {
                app.screen = Screen::Launcher;
            }
            continue;
        }

        // ── agents ────────────────────────────────────────────────────────────
        if let Screen::Agents { agents, sel, .. } = &mut app.screen {
            let n = agents.len();
            match key.code {
                KeyCode::Esc | KeyCode::Char('q') => app.screen = Screen::Launcher,
                KeyCode::Up | KeyCode::Char('k') => {
                    if n > 0 {
                        *sel = if *sel == 0 { n - 1 } else { *sel - 1 };
                    }
                }
                KeyCode::Down | KeyCode::Char('j') => {
                    if n > 0 {
                        *sel = (*sel + 1) % n;
                    }
                }
                _ => {}
            }
            continue;
        }

        // ── models ────────────────────────────────────────────────────────────
        if matches!(app.screen, Screen::Models { .. }) {
            // Take screen out to avoid borrow issues when calling app methods
            let screen = std::mem::replace(&mut app.screen, Screen::Launcher);
            if let Screen::Models {
                mut sel,
                mut mode,
                mut configured,
            } = screen
            {
                match &mut mode {
                    ModelMode::EnterValue {
                        provider,
                        value,
                        cursor,
                        masked,
                        ..
                    } => match key.code {
                        KeyCode::Esc => {
                            mode = ModelMode::List;
                        }
                        KeyCode::Enter if !value.is_empty() => {
                            let pname = provider.clone();
                            let val = value.clone();
                            let is_url = !*masked;
                            let mut cfg = config::load(&app.profile).unwrap_or_default();
                            cfg.model_providers.retain(|p| p.name != pname);
                            cfg.model_providers.push(config::ModelProvider {
                                name: pname.clone(),
                                api_key: if is_url { None } else { Some(val.clone()) },
                                base_url: if is_url { Some(val) } else { None },
                            });
                            config::save(&cfg, &app.profile).ok();
                            configured =
                                cfg.model_providers.iter().map(|p| p.name.clone()).collect();
                            app.set_msg(format!("{pname} configured"));
                            mode = ModelMode::List;
                        }
                        KeyCode::Char(c) if !c.is_control() => {
                            value.insert(*cursor, c);
                            *cursor += 1;
                        }
                        KeyCode::Backspace => {
                            if *cursor > 0 {
                                *cursor -= 1;
                                value.remove(*cursor);
                            }
                        }
                        KeyCode::Left => {
                            if *cursor > 0 {
                                *cursor -= 1;
                            }
                        }
                        KeyCode::Right => {
                            if *cursor < value.len() {
                                *cursor += 1;
                            }
                        }
                        KeyCode::Char('u') if key.modifiers.contains(KeyModifiers::CONTROL) => {
                            value.clear();
                            *cursor = 0;
                        }
                        _ => {}
                    },
                    ModelMode::List => {
                        let n = ALL_PROVIDERS.len();
                        match key.code {
                            KeyCode::Esc | KeyCode::Char('q') => {
                                app.screen = Screen::Launcher;
                                continue;
                            }
                            KeyCode::Up | KeyCode::Char('k') => {
                                sel = if sel == 0 { n - 1 } else { sel - 1 };
                            }
                            KeyCode::Down | KeyCode::Char('j') => {
                                sel = (sel + 1) % n;
                            }
                            KeyCode::Enter => {
                                let (name, is_url, input_label) = ALL_PROVIDERS[sel];
                                mode = ModelMode::EnterValue {
                                    provider: name.to_string(),
                                    label: input_label.to_string(),
                                    value: String::new(),
                                    cursor: 0,
                                    masked: !is_url,
                                };
                            }
                            KeyCode::Char('d') => {
                                let (name, _, _) = ALL_PROVIDERS[sel];
                                let mut cfg = config::load(&app.profile).unwrap_or_default();
                                cfg.model_providers.retain(|p| p.name != name);
                                config::save(&cfg, &app.profile).ok();
                                configured =
                                    cfg.model_providers.iter().map(|p| p.name.clone()).collect();
                                app.set_msg(format!("{name} removed"));
                            }
                            _ => {}
                        }
                    }
                }
                app.screen = Screen::Models {
                    sel,
                    mode,
                    configured,
                };
            }
            continue;
        }

        // ── launcher ──────────────────────────────────────────────────────────
        match key.code {
            KeyCode::Char('q') | KeyCode::Esc => break,

            KeyCode::Char('r') => {
                app.refresh();
                app.set_msg("refreshed");
            }

            KeyCode::Tab => {
                app.zone = if app.zone == Zone::Menu {
                    Zone::Services
                } else {
                    Zone::Menu
                };
            }
            KeyCode::BackTab => {
                app.zone = if app.zone == Zone::Services {
                    Zone::Menu
                } else {
                    Zone::Services
                };
            }

            KeyCode::Up | KeyCode::Char('k') => {
                app.desc_ts = Some(Instant::now());
                match app.zone {
                    Zone::Menu => {
                        app.menu_sel = if app.menu_sel == 0 {
                            MENU.len() - 1
                        } else {
                            app.menu_sel - 1
                        };
                    }
                    Zone::Services => {
                        let n = app.services.len();
                        app.svc_sel = if app.svc_sel == 0 {
                            n.saturating_sub(1)
                        } else {
                            app.svc_sel - 1
                        };
                    }
                }
            }
            KeyCode::Down | KeyCode::Char('j') => {
                app.desc_ts = Some(Instant::now());
                match app.zone {
                    Zone::Menu => {
                        app.menu_sel = (app.menu_sel + 1) % MENU.len();
                    }
                    Zone::Services => {
                        let n = app.services.len();
                        if n > 0 {
                            app.svc_sel = (app.svc_sel + 1) % n;
                        }
                    }
                }
            }
            KeyCode::Char('g') => match app.zone {
                Zone::Menu => {
                    app.menu_sel = 0;
                    app.desc_ts = Some(Instant::now());
                }
                Zone::Services => app.svc_sel = 0,
            },
            KeyCode::Char('G') => match app.zone {
                Zone::Menu => {
                    app.menu_sel = MENU.len().saturating_sub(1);
                    app.desc_ts = Some(Instant::now());
                }
                Zone::Services => app.svc_sel = app.services.len().saturating_sub(1),
            },

            // l: open logs for focused service
            KeyCode::Char('l') => {
                let name = app.services[app.svc_sel].name.to_string();
                app.open_logs(&name);
            }

            // Enter on services zone: toggle start/stop
            KeyCode::Enter if app.zone == Zone::Services => {
                let svc = app.services[app.svc_sel].clone();
                if svc.status.is_running() {
                    services::stop_svc(&svc);
                    app.set_msg(format!("stopping {}…", svc.name));
                } else {
                    services::start_svc(&svc, &workspace).ok();
                    app.set_msg(format!("starting {}…", svc.name));
                }
                std::thread::sleep(Duration::from_millis(400));
                app.refresh();
            }

            // Enter on menu zone
            KeyCode::Enter if app.zone == Zone::Menu => match MENU[app.menu_sel].action {
                MenuAction::Quit => break,

                MenuAction::Start => {
                    let svcs: Vec<_> = app
                        .services
                        .iter()
                        .filter(|s| !s.status.is_running())
                        .cloned()
                        .collect();
                    if svcs.is_empty() {
                        app.set_msg("all services already running");
                    } else {
                        app.probing = true;
                        for (i, svc) in svcs.iter().enumerate() {
                            app.set_msg(format!(
                                "starting {} ({}/{})…",
                                svc.name,
                                i + 1,
                                svcs.len()
                            ));
                            services::start_svc(svc, &workspace).ok();
                            std::thread::sleep(Duration::from_millis(400));
                        }
                        app.refresh();
                        app.set_msg(format!("started {} service(s)", svcs.len()));
                    }
                }

                MenuAction::Stop => {
                    let svcs: Vec<_> = app
                        .services
                        .iter()
                        .filter(|s| s.status.is_running())
                        .cloned()
                        .collect();
                    if svcs.is_empty() {
                        app.set_msg("no services running");
                    } else {
                        for svc in &svcs {
                            services::stop_svc(svc);
                        }
                        std::thread::sleep(Duration::from_millis(300));
                        app.refresh();
                        app.set_msg(format!("stopped {} service(s)", svcs.len()));
                    }
                }

                MenuAction::Logs => {
                    let name = app.services[app.svc_sel].name.to_string();
                    app.open_logs(&name);
                }

                MenuAction::Agents => app.enter_agents(),
                MenuAction::Usage => app.enter_usage(),
                MenuAction::Models => app.enter_models(),

                MenuAction::Setup => {
                    app.exit_with = Some(LaunchTarget::Setup);
                    break;
                }
                MenuAction::Code => {
                    app.exit_with = Some(LaunchTarget::Code);
                    break;
                }
            },

            _ => {}
        }
    }

    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen)?;
    terminal.show_cursor()?;
    Ok(app.exit_with)
}
