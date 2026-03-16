use anyhow::Result;
use console::style;
use std::process::Command;

use crate::{output::Output, services};

/// maschina service start [name]
pub fn start(name: Option<&str>, out: &Output) -> Result<()> {
    let workspace = services::find_workspace();
    let mut svcs = services::all();
    services::probe_all(&mut svcs);

    let targets: Vec<_> = match name {
        Some(n) => svcs.iter().filter(|s| s.name == n).cloned().collect(),
        None => svcs
            .iter()
            .filter(|s| !s.status.is_running())
            .cloned()
            .collect(),
    };

    if targets.is_empty() {
        if let Some(n) = name {
            out.warn(&format!("{n} is already running"));
        } else {
            out.success("all services already running", None::<()>);
        }
        return Ok(());
    }

    for svc in &targets {
        match services::start_svc(svc, &workspace) {
            Ok(msg) => println!("  {} {}", style("●").white(), msg),
            Err(err) => eprintln!("  {} {}", style("✗").red(), err),
        }
    }

    Ok(())
}

/// maschina service stop [name]
pub fn stop(name: Option<&str>, out: &Output) -> Result<()> {
    let mut svcs = services::all();
    services::probe_all(&mut svcs);

    let targets: Vec<_> = match name {
        Some(n) => svcs.iter().filter(|s| s.name == n).cloned().collect(),
        None => svcs
            .iter()
            .filter(|s| s.status.is_running())
            .cloned()
            .collect(),
    };

    if targets.is_empty() {
        if let Some(n) = name {
            out.warn(&format!("{n} is not running"));
        } else {
            out.warn("no services running");
        }
        return Ok(());
    }

    for svc in &targets {
        let msg = services::stop_svc(svc);
        println!("  {} {}", style("○").dim(), msg);
    }

    Ok(())
}

/// maschina service restart [name]
pub fn restart(name: Option<&str>, out: &Output) -> Result<()> {
    stop(name, out)?;
    std::thread::sleep(std::time::Duration::from_millis(500));
    start(name, out)?;
    Ok(())
}

/// maschina service status
pub fn status(out: &Output) -> Result<()> {
    let mut svcs = services::all();
    services::probe_all(&mut svcs);

    if out.is_json() {
        let json: Vec<_> = svcs
            .iter()
            .map(|s| {
                let pid = match &s.status {
                    services::Status::Running { pid } => pid.map(|p| p.to_string()),
                    _ => None,
                };
                serde_json::json!({
                    "name": s.name,
                    "port": s.port,
                    "status": s.status.label(),
                    "pid": pid,
                })
            })
            .collect();
        out.list(&json);
        return Ok(());
    }

    println!();
    for svc in &svcs {
        let dot = if svc.status.is_running() {
            style("●").white().bold().to_string()
        } else {
            style("○").dim().to_string()
        };

        let port_s = svc.port.map(|p| format!(":{p}")).unwrap_or_default();
        let pid_s = match &svc.status {
            services::Status::Running { pid: Some(p) } => format!("  pid {p}"),
            _ => String::new(),
        };

        println!(
            "  {} {:<10} {:<7} {}{}",
            dot,
            svc.name,
            style(&port_s).dim(),
            style(svc.status.label()).dim(),
            style(&pid_s).dim(),
        );
    }
    println!();

    Ok(())
}

/// maschina service logs <name> [--follow]
pub fn logs(name: &str, follow: bool) -> Result<()> {
    let workspace = services::find_workspace();
    let log = services::log_path(name, &workspace);

    if !log.exists() {
        eprintln!(
            "  {} no log file for {} — start it first with: maschina service start {}",
            style("✗").red(),
            name,
            name
        );
        return Ok(());
    }

    println!("  {} {}  (Ctrl+C to stop)", style("→").dim(), log.display());
    println!("  {}", style("─".repeat(50)).dim());

    let mut args = vec!["-n", "200"];
    if follow {
        args.push("-f");
    }
    args.push(log.to_str().unwrap());

    Command::new("tail").args(&args).status()?;

    Ok(())
}
