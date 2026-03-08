use std::io::{self, Stdout};
use std::path::PathBuf;
use std::time::Duration;

use anyhow::Result;
use crossterm::{
    event::{self, Event, KeyCode, KeyEventKind},
    execute,
    terminal::{disable_raw_mode, enable_raw_mode, EnterAlternateScreen, LeaveAlternateScreen},
};
use ratatui::{
    prelude::*,
    widgets::*,
};

use crate::scaffold::{scaffold, ScaffoldKind};

// ─── App state ────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
enum Screen {
    Menu,
    NameInput { kind: ScaffoldKind },
    OutputDir { kind: ScaffoldKind, name: String },
    Done { files: Vec<PathBuf> },
    Error(String),
}

pub struct App {
    screen: Screen,
    menu_index: usize,
    input_buffer: String,
    should_quit: bool,
}

impl App {
    fn new() -> Self {
        Self {
            screen: Screen::Menu,
            menu_index: 0,
            input_buffer: String::new(),
            should_quit: false,
        }
    }

    fn menu_items() -> Vec<ScaffoldKind> {
        ScaffoldKind::all()
    }

    fn on_key(&mut self, code: KeyCode) {
        match &self.screen.clone() {
            Screen::Menu => match code {
                KeyCode::Up => {
                    if self.menu_index > 0 {
                        self.menu_index -= 1;
                    }
                }
                KeyCode::Down => {
                    if self.menu_index < Self::menu_items().len() - 1 {
                        self.menu_index += 1;
                    }
                }
                KeyCode::Enter => {
                    let kind = Self::menu_items()[self.menu_index].clone();
                    self.screen = Screen::NameInput { kind };
                    self.input_buffer.clear();
                }
                KeyCode::Char('q') | KeyCode::Esc => {
                    self.should_quit = true;
                }
                _ => {}
            },

            Screen::NameInput { kind } => match code {
                KeyCode::Char(c) => {
                    self.input_buffer.push(c);
                }
                KeyCode::Backspace => {
                    self.input_buffer.pop();
                }
                KeyCode::Enter => {
                    if !self.input_buffer.is_empty() {
                        self.screen = Screen::OutputDir {
                            kind: kind.clone(),
                            name: self.input_buffer.trim().to_string(),
                        };
                        self.input_buffer = ".".to_string();
                    }
                }
                KeyCode::Esc => {
                    self.screen = Screen::Menu;
                }
                _ => {}
            },

            Screen::OutputDir { kind, name } => match code {
                KeyCode::Char(c) => {
                    self.input_buffer.push(c);
                }
                KeyCode::Backspace => {
                    self.input_buffer.pop();
                }
                KeyCode::Enter => {
                    let dir = PathBuf::from(self.input_buffer.trim());
                    match scaffold(kind, name, &dir) {
                        Ok(files) => self.screen = Screen::Done { files },
                        Err(e) => self.screen = Screen::Error(e.to_string()),
                    }
                }
                KeyCode::Esc => {
                    self.screen = Screen::NameInput { kind: kind.clone() };
                    self.input_buffer = name.clone();
                }
                _ => {}
            },

            Screen::Done { .. } | Screen::Error(_) => {
                if matches!(code, KeyCode::Enter | KeyCode::Char('q') | KeyCode::Esc) {
                    self.should_quit = true;
                }
            }
        }
    }
}

// ─── Rendering ────────────────────────────────────────────────────────────────

fn render(frame: &mut Frame, app: &App) {
    let area = frame.area();

    let outer = Block::default()
        .title(" Maschina Code ")
        .title_alignment(Alignment::Center)
        .borders(Borders::ALL)
        .border_style(Style::default().fg(Color::Cyan));

    let inner = outer.inner(area);
    frame.render_widget(outer, area);

    match &app.screen {
        Screen::Menu => render_menu(frame, inner, app),
        Screen::NameInput { kind } => render_input(frame, inner, &format!("Name for {}", kind.display()), &app.input_buffer),
        Screen::OutputDir { .. } => render_input(frame, inner, "Output directory:", &app.input_buffer),
        Screen::Done { files } => render_done(frame, inner, files),
        Screen::Error(msg) => render_error(frame, inner, msg),
    }
}

fn render_menu(frame: &mut Frame, area: Rect, app: &App) {
    let items: Vec<ListItem> = App::menu_items()
        .iter()
        .enumerate()
        .map(|(i, kind)| {
            let style = if i == app.menu_index {
                Style::default().fg(Color::Black).bg(Color::Cyan).bold()
            } else {
                Style::default()
            };
            ListItem::new(format!("  {}  ", kind.display())).style(style)
        })
        .collect();

    let layout = Layout::vertical([
        Constraint::Length(2),
        Constraint::Length(items.len() as u16 + 2),
        Constraint::Min(1),
        Constraint::Length(1),
    ])
    .split(area);

    frame.render_widget(
        Paragraph::new("What would you like to scaffold?").bold(),
        layout[0],
    );

    frame.render_widget(
        List::new(items).block(Block::default().borders(Borders::ALL)),
        layout[1],
    );

    frame.render_widget(
        Paragraph::new("[↑/↓] Navigate  [Enter] Select  [q] Quit")
            .style(Style::default().fg(Color::DarkGray)),
        layout[3],
    );
}

fn render_input(frame: &mut Frame, area: Rect, label: &str, value: &str) {
    let layout = Layout::vertical([
        Constraint::Length(2),
        Constraint::Length(3),
        Constraint::Min(1),
        Constraint::Length(1),
    ])
    .split(area);

    frame.render_widget(Paragraph::new(label).bold(), layout[0]);
    frame.render_widget(
        Paragraph::new(value)
            .block(Block::default().borders(Borders::ALL))
            .style(Style::default().fg(Color::Cyan)),
        layout[1],
    );
    frame.render_widget(
        Paragraph::new("[Enter] Confirm  [Esc] Back")
            .style(Style::default().fg(Color::DarkGray)),
        layout[3],
    );
}

fn render_done(frame: &mut Frame, area: Rect, files: &[PathBuf]) {
    let file_list: Vec<Line> = files
        .iter()
        .map(|f| Line::from(format!("  {} {}", "", f.display())))
        .collect();

    let mut lines = vec![Line::from("Files created:").bold(), Line::from("")];
    lines.extend(file_list);
    lines.push(Line::from(""));
    lines.push(Line::from("[Enter/q] Exit").style(Style::default().fg(Color::DarkGray)));

    frame.render_widget(Paragraph::new(lines), area);
}

fn render_error(frame: &mut Frame, area: Rect, msg: &str) {
    let lines = vec![
        Line::from("Error:").style(Style::default().fg(Color::Red).bold()),
        Line::from(""),
        Line::from(msg.to_string()),
        Line::from(""),
        Line::from("[Enter/q] Exit").style(Style::default().fg(Color::DarkGray)),
    ];
    frame.render_widget(Paragraph::new(lines), area);
}

// ─── Entry point ──────────────────────────────────────────────────────────────

pub fn run_tui() -> Result<()> {
    enable_raw_mode()?;
    let mut stdout = io::stdout();
    execute!(stdout, EnterAlternateScreen)?;

    let backend = CrosstermBackend::new(stdout);
    let mut terminal = Terminal::new(backend)?;

    let result = run_loop(&mut terminal);

    // Always restore terminal
    disable_raw_mode()?;
    execute!(terminal.backend_mut(), LeaveAlternateScreen)?;
    terminal.show_cursor()?;

    result
}

fn run_loop(terminal: &mut Terminal<CrosstermBackend<Stdout>>) -> Result<()> {
    let mut app = App::new();

    loop {
        terminal.draw(|f| render(f, &app))?;

        if event::poll(Duration::from_millis(100))? {
            if let Event::Key(key) = event::read()? {
                if key.kind == KeyEventKind::Press {
                    app.on_key(key.code);
                }
            }
        }

        if app.should_quit {
            break;
        }
    }

    Ok(())
}
