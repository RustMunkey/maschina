// hardware.rs — auto-detect CPU, RAM, and GPU capabilities for node registration.

use sysinfo::System;

#[derive(Debug, Clone, serde::Serialize)]
pub struct HardwareInfo {
    pub cpu_cores: u32,
    pub cpu_model: String,
    pub ram_gb: f64,
    pub has_gpu: bool,
    pub gpu_model: Option<String>,
    pub gpu_vram_gb: Option<f64>,
    pub gpu_count: u32,
    pub os_type: String,
    pub os_version: String,
    pub architecture: String,
}

/// Detect hardware capabilities.
/// Shells out to `nvidia-smi` for GPU info — graceful no-op if not present.
pub fn detect() -> HardwareInfo {
    let mut sys = System::new_all();
    sys.refresh_all();

    let cpu_cores = sys.cpus().len() as u32;
    let cpu_model = sys
        .cpus()
        .first()
        .map(|c| c.brand().trim().to_string())
        .unwrap_or_else(|| "Unknown".to_string());

    let ram_bytes = sys.total_memory();
    let ram_gb = (ram_bytes as f64 / 1_073_741_824.0 * 10.0).round() / 10.0;

    let os_type = std::env::consts::OS.to_string();
    let architecture = std::env::consts::ARCH.to_string();
    let os_version = System::os_version().unwrap_or_else(|| "unknown".to_string());

    let (has_gpu, gpu_model, gpu_vram_gb, gpu_count) = detect_gpu();

    HardwareInfo {
        cpu_cores,
        cpu_model,
        ram_gb,
        has_gpu,
        gpu_model,
        gpu_vram_gb,
        gpu_count,
        os_type,
        os_version,
        architecture,
    }
}

/// Infer a sensible default for max concurrent tasks based on hardware.
pub fn default_max_tasks(hw: &HardwareInfo) -> u32 {
    if hw.has_gpu {
        (hw.gpu_count * 4).max(2)
    } else {
        (hw.cpu_cores / 2).max(1).min(8)
    }
}

/// Best-effort GPU detection via nvidia-smi (NVIDIA) and rocm-smi (AMD).
fn detect_gpu() -> (bool, Option<String>, Option<f64>, u32) {
    // NVIDIA
    if let Ok(out) = std::process::Command::new("nvidia-smi")
        .args([
            "--query-gpu=name,memory.total",
            "--format=csv,noheader,nounits",
        ])
        .output()
    {
        if out.status.success() {
            let text = String::from_utf8_lossy(&out.stdout);
            let gpus: Vec<_> = text.lines().filter(|l| !l.trim().is_empty()).collect();
            if !gpus.is_empty() {
                let first = gpus[0];
                let parts: Vec<&str> = first.splitn(2, ',').collect();
                let name = parts.first().map(|s| s.trim().to_string());
                let vram_mb: Option<f64> = parts.get(1).and_then(|s| s.trim().parse().ok());
                let vram_gb = vram_mb.map(|mb| (mb / 1024.0 * 10.0).round() / 10.0);
                return (true, name, vram_gb, gpus.len() as u32);
            }
        }
    }

    // AMD
    if let Ok(out) = std::process::Command::new("rocm-smi")
        .arg("--showproductname")
        .output()
    {
        if out.status.success() {
            let text = String::from_utf8_lossy(&out.stdout);
            if text.contains("GPU") {
                return (true, Some("AMD GPU".to_string()), None, 1);
            }
        }
    }

    (false, None, None, 0)
}

/// Return the default set of supported model prefixes for this hardware.
pub fn default_supported_models(hw: &HardwareInfo) -> Vec<String> {
    let mut models = vec![
        "claude-haiku".to_string(),
        "claude-sonnet".to_string(),
        "claude-opus".to_string(),
        "gpt-4o-mini".to_string(),
        "gpt-4o".to_string(),
    ];
    if hw.has_gpu {
        models.push("ollama/".to_string());
    }
    models
}
