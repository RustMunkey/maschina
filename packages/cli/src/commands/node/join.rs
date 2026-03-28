// node/join.rs — Join the Maschina compute network.
//
// First run: interactive setup wizard (detect hardware, register with API, generate keypair).
// Subsequent runs: reconnect using stored node_id and resume task processing.
//
// The node binary subscribes to `maschina.nodes.<id>.execute` on NATS and acts as
// a transparent proxy between the scheduler (daemon) and a locally-running Python
// runtime service. No public IP or port-forwarding required — NATS handles connectivity.

use std::env;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use base64::Engine as _;
use console::style;
use ed25519_dalek::SigningKey;
use futures::StreamExt;
use inquire::Text;
use rand::rngs::OsRng;
use sysinfo::System;

use crate::client::ApiClient;
use crate::config::{self, NodeConfig};
use crate::hardware;
use crate::output::Output;

// ── API response types ────────────────────────────────────────────────────────

#[derive(serde::Deserialize)]
struct RegisteredNode {
    id: String,
}

// ── Task proxy types ──────────────────────────────────────────────────────────

/// Error envelope returned to daemon when the local runtime fails.
#[derive(serde::Serialize)]
struct TaskError {
    error: String,
}

// ── Entry point ───────────────────────────────────────────────────────────────

pub async fn run(profile: &str, out: &Output) -> Result<()> {
    let mut cfg = config::load(profile)?;

    if let Some(node) = cfg.node.clone() {
        // Already registered — reconnect
        println!();
        println!(
            "  {} Reconnecting as node {}",
            style("→").cyan(),
            style(&node.node_id).bold()
        );
        println!();
        return run_node_loop(cfg, node, out).await;
    }

    // First-time setup wizard
    println!();
    println!("  {} Maschina Node Setup", style("maschina").bold());
    println!("  Join the compute network and earn by running agent tasks.");
    println!();

    // 1. Detect hardware
    out.info("Detecting hardware...");
    let hw = hardware::detect();
    println!();
    println!("  CPU:   {} ({} cores)", hw.cpu_model, hw.cpu_cores);
    println!("  RAM:   {:.1} GB", hw.ram_gb);
    if hw.has_gpu {
        println!(
            "  GPU:   {} x {} ({} GB VRAM)",
            hw.gpu_count,
            hw.gpu_model.as_deref().unwrap_or("Unknown"),
            hw.gpu_vram_gb
                .map(|g| format!("{g:.1}"))
                .unwrap_or_else(|| "?".into())
        );
    } else {
        println!("  GPU:   none detected");
    }
    println!(
        "  OS:    {} {} ({})",
        hw.os_type, hw.os_version, hw.architecture
    );
    println!();

    // 2. Check auth
    if !cfg.is_authenticated() {
        anyhow::bail!("not authenticated — run `maschina setup` first");
    }

    let default_name = System::host_name().unwrap_or_else(|| "my-node".into());
    let default_tasks = hardware::default_max_tasks(&hw);

    // 3. Ask configuration questions
    let name = Text::new("Node name:")
        .with_default(&default_name)
        .prompt()?;

    let max_tasks_str = Text::new("Max concurrent tasks:")
        .with_default(&default_tasks.to_string())
        .with_help_message("How many agent tasks to run simultaneously")
        .prompt()?;
    let max_tasks: u32 = max_tasks_str.trim().parse().unwrap_or(default_tasks);

    let runtime_url = Text::new("Local runtime URL:")
        .with_default("http://localhost:8001")
        .with_help_message("URL of the maschina-runtime process running on this machine")
        .prompt()?;

    let nats_url = Text::new("NATS URL:")
        .with_default("nats://connect.ngs.global")
        .with_help_message("NATS server for receiving tasks (NGS default shown)")
        .prompt()?;

    let nats_ca_cert = Text::new("NATS CA cert path (optional):")
        .with_default("")
        .with_help_message(
            "Path to CA certificate for TLS-enabled NATS (leave blank for NGS/plain)",
        )
        .prompt()
        .ok()
        .filter(|s| !s.is_empty())
        .or_else(|| env::var("NATS_CA_CERT").ok().filter(|s| !s.is_empty()));

    let region = Text::new("Region (optional):")
        .with_default("")
        .with_help_message("e.g. us-east-1, eu-west-1 — helps route latency-sensitive tasks")
        .prompt()
        .ok()
        .filter(|s| !s.is_empty());

    println!();

    // 4. Generate Ed25519 keypair
    out.info("Generating node keypair...");
    let signing_key = SigningKey::generate(&mut OsRng);
    let pubkey_hex = hex::encode(signing_key.verifying_key().to_bytes());
    let privkey_b64 = base64::engine::general_purpose::STANDARD.encode(signing_key.to_bytes());

    // 5. Register with API
    out.info("Registering node...");
    let client = ApiClient::new(&cfg)?;

    let models = hardware::default_supported_models(&hw);

    let registered: RegisteredNode = client
        .post(
            "/nodes/register",
            &serde_json::json!({
                "name": name,
                "region": region,
                "capabilities": {
                    "cpuCores": hw.cpu_cores,
                    "cpuModel": hw.cpu_model,
                    "ramGb": hw.ram_gb,
                    "hasGpu": hw.has_gpu,
                    "gpuModel": hw.gpu_model,
                    "gpuVramGb": hw.gpu_vram_gb,
                    "gpuCount": if hw.gpu_count > 0 { Some(hw.gpu_count) } else { None::<u32> },
                    "osType": hw.os_type,
                    "osVersion": hw.os_version,
                    "architecture": hw.architecture,
                    "maxConcurrentTasks": max_tasks,
                    "supportedModels": models,
                }
            }),
        )
        .await?;

    let node_id = registered.id;

    // 6. Upload public key
    let _: serde_json::Value = client
        .post(
            &format!("/nodes/{node_id}/public-key"),
            &serde_json::json!({ "publicKey": pubkey_hex }),
        )
        .await
        .unwrap_or(serde_json::Value::Null);

    // 7. Save to config
    let node_cfg = NodeConfig {
        node_id: node_id.clone(),
        signing_key: Some(privkey_b64),
        runtime_url,
        nats_url,
        nats_ca_cert,
    };
    cfg.node = Some(node_cfg.clone());
    config::save(&cfg, profile)?;

    println!();
    out.success(&format!("Node registered: {node_id}"), None::<()>);
    println!();
    println!(
        "  Make sure maschina-runtime is running on {}.",
        node_cfg.runtime_url
    );
    println!("  Tasks will be routed to this node by the scheduler.");
    println!();

    run_node_loop(cfg, node_cfg, out).await
}

// ── Node event loop ───────────────────────────────────────────────────────────

/// Persistent loop: send heartbeats + process inbound tasks via NATS.
/// Runs until Ctrl+C.
async fn run_node_loop(cfg: config::Config, node: NodeConfig, out: &Output) -> Result<()> {
    // NATS connection — prefer stored cert, fall back to NATS_CA_CERT env var
    let ca_cert_env = env::var("NATS_CA_CERT").ok().filter(|s| !s.is_empty());
    let ca_cert: Option<&str> = node
        .nats_ca_cert
        .as_deref()
        .filter(|s| !s.is_empty())
        .or(ca_cert_env.as_deref());

    let mut opts = async_nats::ConnectOptions::new()
        .name("maschina-node-cli")
        .ping_interval(Duration::from_secs(30))
        .connection_timeout(Duration::from_secs(10))
        .retry_on_initial_connect();

    if let Some(cert_path) = ca_cert {
        opts = opts
            .add_root_certificates(cert_path.into())
            .require_tls(true);
    }

    let nats = opts
        .connect(&node.nats_url)
        .await
        .map_err(|e| anyhow::anyhow!("NATS connection failed ({}): {}", node.nats_url, e))?;

    let subject = format!("maschina.nodes.{}.execute", node.node_id);
    let subscription = nats.subscribe(subject.clone()).await?;

    let api_client = Arc::new(ApiClient::new(&cfg)?);
    let runtime_url = Arc::new(node.runtime_url.clone());
    let node_id = Arc::new(node.node_id.clone());
    let nats = Arc::new(nats);

    // Track active task count for heartbeat reporting
    let active_tasks: Arc<AtomicUsize> = Arc::new(AtomicUsize::new(0));

    // HTTP client for calling local runtime (longer timeout for long-running agents)
    let local_http = Arc::new(
        reqwest::Client::builder()
            .timeout(Duration::from_secs(600))
            .build()?,
    );

    let mut heartbeat = tokio::time::interval(Duration::from_secs(30));
    let mut sys = System::new_all();
    let mut sub_stream = subscription;

    println!(
        "  {} Node online. Subscribed to {}",
        style("●").green(),
        style(&subject).dim()
    );
    println!("  {} Press Ctrl+C to stop gracefully.", style("→").dim());
    println!();

    out.info(&format!("Forwarding tasks to {}", node.runtime_url));

    loop {
        tokio::select! {
            // Heartbeat tick
            _ = heartbeat.tick() => {
                sys.refresh_all();
                let cpu_pct = sys.global_cpu_usage() as f64;
                let ram_used = sys.used_memory() as f64;
                let ram_total = sys.total_memory() as f64;
                let ram_pct = if ram_total > 0.0 { ram_used / ram_total * 100.0 } else { 0.0 };
                let active = active_tasks.load(Ordering::Relaxed) as i64;

                let client = api_client.clone();
                let nid = node_id.clone();

                tokio::spawn(async move {
                    let _: Result<serde_json::Value, _> = client
                        .post(
                            &format!("/nodes/{nid}/heartbeat"),
                            &serde_json::json!({
                                "cpuUsagePct": cpu_pct,
                                "ramUsagePct": ram_pct,
                                "activeTaskCount": active,
                                "healthStatus": "online",
                            }),
                        )
                        .await;
                });
            }

            // Inbound task from daemon
            Some(msg) = sub_stream.next() => {
                let active = active_tasks.clone();
                let http = local_http.clone();
                let rt_url = runtime_url.clone();
                let nats_clone = nats.clone();
                let reply_to = msg.reply.clone();

                tokio::spawn(async move {
                    active.fetch_add(1, Ordering::Relaxed);
                    let result = dispatch_to_local_runtime(&http, &rt_url, &msg.payload).await;
                    active.fetch_sub(1, Ordering::Relaxed);

                    if let Some(reply) = reply_to {
                        let payload = match result {
                            Ok(bytes) => bytes,
                            Err(e) => {
                                serde_json::to_vec(&TaskError { error: e.to_string() })
                                    .unwrap_or_default()
                            }
                        };
                        let _ = nats_clone.publish(reply, payload.into()).await;
                    }
                });
            }

            // Ctrl+C — graceful shutdown
            _ = tokio::signal::ctrl_c() => {
                println!();
                out.info("Stopping node...");

                // Drain: mark as draining so scheduler stops sending new tasks
                let _: Result<serde_json::Value, _> = api_client
                    .patch(
                        &format!("/nodes/{node_id}"),
                        &serde_json::json!({ "status": "draining" }),
                    )
                    .await;

                // Wait briefly for active tasks to complete (max 30s)
                let deadline = std::time::Instant::now() + Duration::from_secs(30);
                while active_tasks.load(Ordering::Relaxed) > 0
                    && std::time::Instant::now() < deadline
                {
                    tokio::time::sleep(Duration::from_secs(1)).await;
                }

                out.success("Node stopped", None::<()>);
                break;
            }
        }
    }

    Ok(())
}

// ── Local runtime proxy ───────────────────────────────────────────────────────

/// Forward a task payload to the local Python runtime and return the response bytes.
async fn dispatch_to_local_runtime(
    http: &reqwest::Client,
    runtime_url: &str,
    payload: &[u8],
) -> Result<Vec<u8>> {
    let url = format!("{}/run", runtime_url.trim_end_matches('/'));

    let body: serde_json::Value = serde_json::from_slice(payload)
        .map_err(|e| anyhow::anyhow!("invalid task payload: {e}"))?;

    let resp = http
        .post(&url)
        .json(&body)
        .send()
        .await
        .map_err(|e| anyhow::anyhow!("runtime unreachable ({url}): {e}"))?;

    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        anyhow::bail!("runtime error {status}: {text}");
    }

    let bytes = resp.bytes().await?;
    Ok(bytes.to_vec())
}
