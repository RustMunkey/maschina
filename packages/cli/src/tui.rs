use std::{
    io::{self, BufRead},
    time::{Duration, Instant},
};

use anyhow::Result;
use crossterm::{
    event::{self, Event, KeyCode, KeyEventKind},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{
    backend::CrosstermBackend,
    layout::{Constraint, Direction, Layout, Rect},
    style::{Color, Modifier, Style},
    text::{Line, Span},
    widgets::{Clear, List, ListItem, Paragraph},
    Terminal,
};

use crate::{
    config,
    services::{self, Status},
};

// ── what to do after the TUI exits ───────────────────────────────────────────

pub enum LaunchTarget {
    Setup,
    Agents,
    Usage,
    Models,
    Code,
}

// ── screen state ──────────────────────────────────────────────────────────────

#[derive(PartialEq, Clone)]
enum Screen {
    Launcher,
    Logs {
        svc: String,
        lines: Vec<String>,
        offset: usize,
    },
}

// ── zones ─────────────────────────────────────────────────────────────────────

#[derive(PartialEq, Clone)]
enum Zone {
    Services,
    Menu,
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
        desc: "start all services in sequence",
    },
    MenuItem {
        label: "stop services",
        action: MenuAction::Stop,
        desc: "gracefully stop all running services",
    },
    MenuItem {
        label: "view logs",
        action: MenuAction::Logs,
        desc: "tail live log for highlighted service",
    },
    MenuItem {
        label: "agents",
        action: MenuAction::Agents,
        desc: "list, deploy, and manage agents",
    },
    MenuItem {
        label: "usage & quota",
        action: MenuAction::Usage,
        desc: "view token usage and monthly limits",
    },
    MenuItem {
        label: "models",
        action: MenuAction::Models,
        desc: "configure AI providers and models",
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
    tick: u64,
    // account info loaded from config
    email: Option<String>,
    provider: Option<String>, // first configured model provider
    exit_with: Option<LaunchTarget>,
}

impl App {
    fn new(profile: &str) -> Self {
        let cfg = config::load(profile).unwrap_or_default();
        let email = cfg.email.clone();
        let provider = cfg.model_providers.first().map(|p| p.name.clone());

        let mut a = App {
            screen: Screen::Launcher,
            services: services::all(),
            svc_sel: 0,
            menu_sel: 0,
            zone: Zone::Services,
            last_ref: Instant::now(),
            probing: false,
            msg: None,
            tick: 0,
            email,
            provider,
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
            let all: Vec<String> = reader.lines().filter_map(|l| l.ok()).collect();
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
}

// ── spinner ───────────────────────────────────────────────────────────────────

static SPIN: [&str; 4] = ["⠋", "⠙", "⠸", "⠴"];

// ── draw: launcher ────────────────────────────────────────────────────────────

fn draw_launcher(f: &mut ratatui::Frame, app: &App) {
    let area = f.area();
    let dim = Style::default().fg(Color::DarkGray);
    let gray = Style::default().fg(Color::Gray);
    let bold = Style::default()
        .fg(Color::White)
        .add_modifier(Modifier::BOLD);

    let n_svc = app.services.len() as u16;
    let n_menu = MENU.len() as u16;

    let has_msg = app
        .msg
        .as_ref()
        .map(|(_, t)| t.elapsed() < Duration::from_secs(5))
        .unwrap_or(false);

    // 1 title + 1 account + 1 spacer + n_svc + 1 spacer + n_menu + 1 spacer + 1 footer + 1? msg
    let desired_w: u16 = 62;
    let desired_h = 1 + 1 + 1 + n_svc + 1 + n_menu + 1 + 1 + if has_msg { 1 } else { 0 };

    let w = desired_w.min(area.width);
    let h = desired_h.min(area.height);
    let x = area.width.saturating_sub(w) / 2;
    let y = area.height.saturating_sub(h) / 2;

    let panel = Rect {
        x,
        y,
        width: w,
        height: h,
    };
    f.render_widget(Clear, panel);

    let mut constraints = vec![
        Constraint::Length(1), // title
        Constraint::Length(1), // account
        Constraint::Length(1), // spacer
        Constraint::Length(n_svc),
        Constraint::Length(1), // spacer
        Constraint::Length(n_menu),
        Constraint::Length(1), // spacer
        Constraint::Length(1), // footer
    ];
    if has_msg {
        constraints.push(Constraint::Length(1));
    }

    let chunks = Layout::default()
        .direction(Direction::Vertical)
        .constraints(constraints)
        .split(panel);

    // ── title ─────────────────────────────────────────────────────────────────
    let spinner = if app.probing {
        SPIN[(app.tick / 2 % 4) as usize]
    } else {
        ""
    };
    let title_text = if w >= 20 { "MASCHINA" } else { "MSH" };
    f.render_widget(
        Paragraph::new(Line::from(vec![
            Span::styled(title_text, bold),
            Span::raw("  "),
            Span::styled(spinner, dim),
        ])),
        chunks[0],
    );

    // ── account line ──────────────────────────────────────────────────────────
    let acct_line = if let Some(ref email) = app.email {
        let provider_s = app.provider.as_deref().unwrap_or("no model");
        if w >= 48 {
            Line::from(vec![
                Span::styled(email.as_str(), dim),
                Span::styled("  ·  ", dim),
                Span::styled(provider_s, dim),
            ])
        } else {
            Line::from(Span::styled(email.as_str(), dim))
        }
    } else {
        Line::from(Span::styled("not configured — run setup wizard", dim))
    };
    f.render_widget(Paragraph::new(acct_line), chunks[1]);

    // ── services ──────────────────────────────────────────────────────────────
    let svc_active = app.zone == Zone::Services;

    let svc_items: Vec<ListItem> = app
        .services
        .iter()
        .enumerate()
        .map(|(i, svc)| {
            let cursor = svc_active && i == app.svc_sel;
            let prefix = if cursor { "▸" } else { " " };

            let (dot, dot_style) = if svc.status.is_running() {
                (
                    "●",
                    if svc_active {
                        Style::default().fg(Color::White)
                    } else {
                        gray
                    },
                )
            } else {
                ("○", dim)
            };

            let name_style = if cursor {
                bold
            } else if svc.status.is_running() {
                gray
            } else {
                dim
            };

            let mut spans = vec![
                Span::styled(format!(" {} ", prefix), dim),
                Span::styled(dot, dot_style),
                Span::raw(" "),
                Span::styled(format!("{:<10}", svc.name), name_style),
            ];
            if w >= 38 {
                let p = svc.port.map(|p| format!(":{}", p)).unwrap_or_default();
                spans.push(Span::styled(format!("{:<7}", p), dim));
            }
            if w >= 50 {
                spans.push(Span::styled(
                    format!(" {}", svc.status.label()),
                    if cursor { name_style } else { dim },
                ));
            }
            if w >= 62 {
                if let Status::Running { pid: Some(p) } = &svc.status {
                    spans.push(Span::styled(format!("  pid {}", p), dim));
                }
            }
            ListItem::new(Line::from(spans))
        })
        .collect();

    f.render_widget(List::new(svc_items), chunks[3]);

    // ── menu ──────────────────────────────────────────────────────────────────
    let menu_active = app.zone == Zone::Menu;

    let menu_items: Vec<ListItem> = MENU
        .iter()
        .enumerate()
        .map(|(i, item)| {
            let sel = menu_active && i == app.menu_sel;
            let prefix = if sel { "▸ " } else { "  " };
            let is_quit = item.action == MenuAction::Quit;

            let label_style = if sel {
                bold
            } else if is_quit {
                dim
            } else if menu_active {
                gray
            } else {
                dim
            };

            // Right-aligned description when this item is hovered
            if sel && w >= 32 {
                let label = format!("{}{}", prefix, item.label);
                let desc = item.desc;
                let gap = (w as usize).saturating_sub(label.len() + desc.len() + 2);
                ListItem::new(Line::from(vec![
                    Span::styled(format!(" {}", label), label_style),
                    Span::raw(" ".repeat(gap.max(1))),
                    Span::styled(desc, dim),
                ]))
            } else {
                ListItem::new(Line::from(Span::styled(
                    format!(" {}{}", prefix, item.label),
                    label_style,
                )))
            }
        })
        .collect();

    f.render_widget(List::new(menu_items), chunks[5]);

    // ── footer ────────────────────────────────────────────────────────────────
    let footer = if app.zone == Zone::Services {
        if w >= 48 {
            Line::from(Span::styled(
                " ↑/↓ navigate  l logs  tab menu  r refresh  q quit",
                dim,
            ))
        } else {
            Line::from(Span::styled(" ↑/↓  l logs  tab  q", dim))
        }
    } else {
        Line::from(Span::styled(
            " ↑/↓ navigate  enter select  tab services  q quit",
            dim,
        ))
    };
    f.render_widget(Paragraph::new(footer), chunks[7]);

    // ── message ───────────────────────────────────────────────────────────────
    if has_msg {
        if let Some((msg, _)) = &app.msg {
            f.render_widget(
                Paragraph::new(Line::from(Span::styled(format!(" {}", msg), dim))),
                chunks[8],
            );
        }
    }
}

// ── draw: log viewer ──────────────────────────────────────────────────────────

fn draw_logs(f: &mut ratatui::Frame, svc: &str, lines: &[String], offset: usize) {
    let area = f.area();
    let dim = Style::default().fg(Color::DarkGray);
    let bold = Style::default()
        .fg(Color::White)
        .add_modifier(Modifier::BOLD);

    // Header bar
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
        Paragraph::new(Line::from(vec![Span::styled(
            format!(" logs: {}", svc),
            bold,
        )])),
        header_rect,
    );

    let visible = log_rect.height as usize;
    let start = offset.saturating_sub(visible.saturating_sub(1));
    let shown: Vec<ListItem> = lines[start..]
        .iter()
        .take(visible)
        .map(|l| {
            ListItem::new(Line::from(Span::styled(
                format!(" {}", l),
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
            Screen::Logs { svc, lines, offset } => {
                let svc = svc.clone();
                let lines = lines.clone();
                let offset = *offset;
                terminal.draw(|f| draw_logs(f, &svc, &lines, offset))?
            }
        };

        // Auto-refresh services on launcher
        if app.screen == Screen::Launcher && app.last_ref.elapsed() > Duration::from_secs(3) {
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

        // ── log viewer keys ───────────────────────────────────────────────────
        if let Screen::Logs { lines, offset, .. } = &mut app.screen {
            let len = lines.len();
            match key.code {
                KeyCode::Char('q') | KeyCode::Esc => {
                    app.screen = Screen::Launcher;
                }
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
                KeyCode::Char('g') => {
                    *offset = 0;
                }
                KeyCode::Char('G') => {
                    *offset = len.saturating_sub(1);
                }
                _ => {}
            }
            continue;
        }

        // ── launcher keys ─────────────────────────────────────────────────────
        match key.code {
            KeyCode::Char('q') | KeyCode::Esc => break,

            KeyCode::Char('r') => {
                app.refresh();
                app.set_msg("refreshed");
            }

            KeyCode::Tab => {
                app.zone = if app.zone == Zone::Services {
                    Zone::Menu
                } else {
                    Zone::Services
                };
            }
            KeyCode::BackTab => {
                app.zone = if app.zone == Zone::Menu {
                    Zone::Services
                } else {
                    Zone::Menu
                };
            }

            KeyCode::Up | KeyCode::Char('k') => match app.zone {
                Zone::Services => {
                    if app.svc_sel > 0 {
                        app.svc_sel -= 1;
                    }
                }
                Zone::Menu => {
                    if app.menu_sel > 0 {
                        app.menu_sel -= 1;
                    }
                }
            },
            KeyCode::Down | KeyCode::Char('j') => match app.zone {
                Zone::Services => {
                    if app.svc_sel + 1 < app.services.len() {
                        app.svc_sel += 1;
                    }
                }
                Zone::Menu => {
                    if app.menu_sel + 1 < MENU.len() {
                        app.menu_sel += 1;
                    }
                }
            },
            KeyCode::Char('g') => match app.zone {
                Zone::Services => app.svc_sel = 0,
                Zone::Menu => app.menu_sel = 0,
            },
            KeyCode::Char('G') => match app.zone {
                Zone::Services => app.svc_sel = app.services.len().saturating_sub(1),
                Zone::Menu => app.menu_sel = MENU.len().saturating_sub(1),
            },

            // l: open log viewer for highlighted service (works in either zone)
            KeyCode::Char('l') => {
                let name = app.services[app.svc_sel].name.to_string();
                app.open_logs(&name);
            }

            // ── menu Enter ────────────────────────────────────────────────────
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
                        app.probing = true;
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

                MenuAction::Agents => {
                    app.exit_with = Some(LaunchTarget::Agents);
                    break;
                }
                MenuAction::Usage => {
                    app.exit_with = Some(LaunchTarget::Usage);
                    break;
                }
                MenuAction::Models => {
                    app.exit_with = Some(LaunchTarget::Models);
                    break;
                }
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
