/// Shared service management logic used by both the TUI launcher and
/// the `maschina service` subcommands.
use std::{
    fs,
    net::TcpStream,
    path::PathBuf,
    process::{Command, Stdio},
    time::Duration,
};

// ── types ─────────────────────────────────────────────────────────────────────

#[derive(Debug, Clone, PartialEq)]
pub enum Status {
    Running { pid: Option<u32> },
    Stopped,
}

impl Status {
    pub fn is_running(&self) -> bool { matches!(self, Status::Running { .. }) }

    pub fn label(&self) -> &'static str {
        match self { Status::Running { .. } => "running", Status::Stopped => "stopped" }
    }

    pub fn bullet(&self) -> &'static str {
        match self { Status::Running { .. } => "●", Status::Stopped => "○" }
    }
}

#[derive(Debug, Clone)]
pub struct Service {
    pub name: &'static str,
    pub port: Option<u16>,
    pub desc: &'static str,
    pub status: Status,
}

pub fn all() -> Vec<Service> {
    vec![
        Service { name: "api",      port: Some(3000), desc: "REST API",          status: Status::Stopped },
        Service { name: "gateway",  port: Some(8080), desc: "proxy / auth",      status: Status::Stopped },
        Service { name: "realtime", port: Some(4000), desc: "WebSocket / SSE",   status: Status::Stopped },
        Service { name: "runtime",  port: Some(8000), desc: "agent runner",      status: Status::Stopped },
        Service { name: "daemon",   port: None,       desc: "NATS job consumer", status: Status::Stopped },
    ]
}

// ── path helpers ──────────────────────────────────────────────────────────────

pub fn pid_dir() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join("maschina")
        .join("pids")
}

pub fn bin_dir() -> PathBuf {
    dirs::data_local_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join("maschina")
        .join("bin")
}

pub fn pid_path(name: &str) -> PathBuf { pid_dir().join(format!("{}.pid", name)) }

pub fn log_dir(workspace: &Option<PathBuf>) -> PathBuf {
    if let Some(root) = workspace {
        root.join(".maschina").join("logs")
    } else {
        dirs::data_local_dir()
            .unwrap_or_else(|| PathBuf::from("/tmp"))
            .join("maschina")
            .join("logs")
    }
}

// ── pid helpers ───────────────────────────────────────────────────────────────

pub fn read_pid(name: &str) -> Option<u32> {
    fs::read_to_string(pid_path(name)).ok()?.trim().parse().ok()
}

pub fn write_pid(name: &str, pid: u32) {
    let _ = fs::create_dir_all(pid_dir());
    let _ = fs::write(pid_path(name), pid.to_string());
}

pub fn pid_alive(pid: u32) -> bool {
    Command::new("kill")
        .args(["-0", &pid.to_string()])
        .stdout(Stdio::null())
        .stderr(Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

pub fn port_open(port: u16) -> bool {
    let addr = std::net::SocketAddr::from(([127, 0, 0, 1], port));
    TcpStream::connect_timeout(&addr, Duration::from_millis(150)).is_ok()
}

pub fn probe(svc: &Service) -> Status {
    if let Some(pid) = read_pid(svc.name) {
        if pid_alive(pid) { return Status::Running { pid: Some(pid) }; }
        let _ = fs::remove_file(pid_path(svc.name));
    }
    if let Some(port) = svc.port {
        if port_open(port) { return Status::Running { pid: None }; }
    }
    Status::Stopped
}

pub fn probe_all(services: &mut Vec<Service>) {
    for svc in services.iter_mut() {
        svc.status = probe(svc);
    }
}

// ── workspace detection ───────────────────────────────────────────────────────

pub fn find_workspace() -> Option<PathBuf> {
    let mut dir = std::env::current_dir().ok()?;
    loop {
        if dir.join("pnpm-workspace.yaml").exists() && dir.join("Cargo.toml").exists() {
            return Some(dir);
        }
        if !dir.pop() { return None; }
    }
}

// ── start ─────────────────────────────────────────────────────────────────────

pub fn start_svc(svc: &Service, workspace: &Option<PathBuf>) -> Result<String, String> {
    let logs = log_dir(workspace);
    let _ = fs::create_dir_all(&logs);

    // 1. Installed release binary
    let installed = bin_dir().join(svc.name);
    if installed.exists() {
        let log = open_log(&logs, svc.name)?;
        let child = Command::new(&installed)
            .stdout(log.try_clone().map_err(|e| e.to_string())?)
            .stderr(log)
            .spawn()
            .map_err(|e| format!("could not start {}: {}", svc.name, e))?;
        let pid = child.id();
        write_pid(svc.name, pid);
        std::mem::forget(child);
        return Ok(format!("{} starting  pid {}", svc.name, pid));
    }

    // 2. Workspace dev mode
    let root = workspace.as_ref().ok_or_else(|| {
        format!(
            "{} — run `maschina setup` to install, or cd to the project root",
            svc.name
        )
    })?;

    let (prog, args, work_dir): (&str, &[&str], PathBuf) = match svc.name {
        "api"      => ("pnpm",    &["--filter", "./services/api", "dev"],                                  root.clone()),
        "gateway"  => ("cargo",   &["run", "-p", "maschina-gateway"],                                     root.clone()),
        "realtime" => ("cargo",   &["run", "-p", "maschina-realtime"],                                    root.clone()),
        "daemon"   => ("cargo",   &["run", "-p", "maschina-daemon"],                                      root.clone()),
        "runtime"  => ("python3", &["-m", "uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"],  root.join("services/runtime")),
        _          => return Err(format!("unknown service: {}", svc.name)),
    };

    let log = open_log(&logs, svc.name)?;
    let child = Command::new(prog)
        .args(args)
        .current_dir(&work_dir)
        .stdout(log.try_clone().map_err(|e| e.to_string())?)
        .stderr(log)
        .spawn()
        .map_err(|e| format!("could not start {}: {}", svc.name, e))?;

    let pid = child.id();
    write_pid(svc.name, pid);
    std::mem::forget(child);

    Ok(format!("{} starting  pid {}", svc.name, pid))
}

// ── stop ──────────────────────────────────────────────────────────────────────

pub fn stop_svc(svc: &Service) -> String {
    if let Some(pid) = read_pid(svc.name) {
        if pid_alive(pid) {
            Command::new("kill")
                .args(["-TERM", &pid.to_string()])
                .stdout(Stdio::null()).stderr(Stdio::null())
                .status().ok();
            let _ = fs::remove_file(pid_path(svc.name));
            return format!("{} stopped  pid {}", svc.name, pid);
        }
    }
    if let Some(port) = svc.port {
        if port_open(port) {
            Command::new("sh")
                .args(["-c", &format!("lsof -ti :{} | xargs kill -TERM 2>/dev/null || true", port)])
                .status().ok();
            return format!("{} stopped  port :{}", svc.name, port);
        }
    }
    format!("{} not running", svc.name)
}

// ── helpers ───────────────────────────────────────────────────────────────────

pub fn open_log(dir: &PathBuf, name: &str) -> Result<fs::File, String> {
    fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(dir.join(format!("{}.log", name)))
        .map_err(|e| e.to_string())
}

pub fn log_path(name: &str, workspace: &Option<PathBuf>) -> PathBuf {
    log_dir(workspace).join(format!("{}.log", name))
}
