#![allow(dead_code)]
// theme.rs — shared color constants and styled span helpers.
// One place to change colors across the entire CLI.

use ratatui::style::{Color, Modifier, Style};
use ratatui::text::Span;

// ── semantic colors ───────────────────────────────────────────────────────────

pub const SUCCESS: Color = Color::Green;
pub const WARN: Color = Color::Yellow;
pub const ERROR: Color = Color::Red;
pub const DIM: Color = Color::DarkGray;
pub const BASE: Color = Color::White;
pub const GRAY: Color = Color::Gray;

// ── style constructors ────────────────────────────────────────────────────────

pub fn success() -> Style {
    Style::default().fg(SUCCESS)
}
pub fn warn() -> Style {
    Style::default().fg(WARN)
}
pub fn error() -> Style {
    Style::default().fg(ERROR)
}
pub fn dim() -> Style {
    Style::default().fg(DIM)
}
pub fn base() -> Style {
    Style::default().fg(BASE)
}
pub fn gray() -> Style {
    Style::default().fg(GRAY)
}
pub fn bold() -> Style {
    Style::default().fg(BASE).add_modifier(Modifier::BOLD)
}
pub fn bold_gray() -> Style {
    Style::default().fg(GRAY).add_modifier(Modifier::BOLD)
}
pub fn selected() -> Style {
    Style::default()
        .fg(BASE)
        .add_modifier(Modifier::BOLD)
        .add_modifier(Modifier::REVERSED)
}

// ── status dots ───────────────────────────────────────────────────────────────

pub fn dot_running() -> Span<'static> {
    Span::styled("●", success())
}
pub fn dot_error() -> Span<'static> {
    Span::styled("●", error())
}
pub fn dot_warn() -> Span<'static> {
    Span::styled("●", warn())
}
pub fn dot_off() -> Span<'static> {
    Span::styled("○", dim())
}

// ── version string ────────────────────────────────────────────────────────────

pub fn version_str() -> String {
    let sha = env!("MASCHINA_GIT_SHA");
    if sha == "unknown" {
        format!("v{}", env!("CARGO_PKG_VERSION"))
    } else {
        format!("v{} ({})", env!("CARGO_PKG_VERSION"), sha)
    }
}

// ── bordered box drawing (doctor style) ──────────────────────────────────────
// Usage:
//   println!("{}", box_top("Section"));
//   println!("{}", box_line("  content line"));
//   println!("{}", box_bottom());

use console::style as cstyle;

pub fn box_top(label: &str) -> String {
    let fill = 44usize.saturating_sub(label.len() + 2);
    format!(
        "{}  {} {}",
        cstyle("◇").dim(),
        cstyle(label).bold(),
        cstyle("─".repeat(fill) + "╮").dim()
    )
}

pub fn box_line(content: &str) -> String {
    format!("{}  {}", cstyle("│").dim(), content)
}

pub fn box_bottom() -> String {
    format!(
        "{}  {}",
        cstyle("│").dim(),
        cstyle("─".repeat(44) + "╯").dim()
    )
}

pub fn box_sep() -> String {
    format!("{}  {}", cstyle("├").dim(), cstyle("─".repeat(44)).dim())
}
