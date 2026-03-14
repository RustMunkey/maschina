/// Handles both human-readable and --json output modes.
/// All commands go through Output so --json works everywhere.
use console::style;
use serde::Serialize;

pub struct Output {
    json: bool,
}

impl Output {
    pub fn new(json: bool) -> Self {
        Self { json }
    }

    pub fn is_json(&self) -> bool {
        self.json
    }

    /// Print a success message. If json=true, serialize the payload.
    pub fn success<T: Serialize>(&self, msg: &str, data: Option<T>) {
        if self.json {
            if let Some(d) = data {
                println!("{}", serde_json::to_string_pretty(&d).unwrap_or_default());
            } else {
                println!("{{\"ok\":true,\"message\":{:?}}}", msg);
            }
        } else {
            println!("{} {}", style("✓").green().bold(), msg);
        }
    }

    /// Print a table row or JSON object.
    pub fn data<T: Serialize>(&self, data: &T) {
        if self.json {
            println!("{}", serde_json::to_string_pretty(data).unwrap_or_default());
        }
        // Human rendering is done inline by each command.
    }

    /// Print a JSON array or human list.
    pub fn list<T: Serialize>(&self, items: &[T]) {
        if self.json {
            println!(
                "{}",
                serde_json::to_string_pretty(items).unwrap_or_default()
            );
        }
    }

    pub fn info(&self, msg: &str) {
        if !self.json {
            println!("{} {}", style("→").dim(), msg);
        }
    }

    pub fn warn(&self, msg: &str) {
        if !self.json {
            println!("{} {}", style("!").yellow().bold(), msg);
        }
    }

    #[allow(dead_code)]
    pub fn error(&self, msg: &str) {
        eprintln!("{} {}", style("✗").red().bold(), msg);
    }

    /// Print a key: value pair (for status/doctor output).
    pub fn kv(&self, key: &str, value: &str) {
        if !self.json {
            println!("  {:<20} {}", style(key).dim(), value);
        }
    }

    /// Print a section header.
    pub fn header(&self, title: &str) {
        if !self.json {
            println!("\n{}", style(title).bold());
        }
    }

    /// Print a check line with pass/fail indicator.
    pub fn check(&self, label: &str, ok: bool, detail: Option<&str>) {
        if !self.json {
            let icon = if ok {
                style("✓").green()
            } else {
                style("✗").red()
            };
            let detail_str = detail
                .map(|d| format!("  {}", style(d).dim()))
                .unwrap_or_default();
            println!("  {} {}{}", icon, label, detail_str);
        }
    }
}
