use crate::config::Config;
use crate::db::Pool;
use prometheus::{IntCounter, IntGauge, Registry};
use std::sync::Arc;
use tokio::sync::Semaphore;

/// Shared state injected into every component.
/// Cheap to clone — everything behind Arc.
#[derive(Clone)]
pub struct AppState {
    pub config: Arc<Config>,
    pub db: Pool,
    pub redis: redis::aio::ConnectionManager,
    #[allow(dead_code)]
    pub nats: async_nats::Client,
    pub jetstream: async_nats::jetstream::Context,
    pub http: reqwest::Client,
    /// Limits concurrent agent executions to config.max_concurrent_agents
    pub slots: Arc<Semaphore>,
    pub metrics: Arc<Metrics>,
}

pub struct Metrics {
    pub registry: Registry,
    pub runs_queued: IntGauge,
    pub runs_executing: IntGauge,
    pub runs_completed: IntCounter,
    pub runs_failed: IntCounter,
    pub runs_timed_out: IntCounter,
    pub scan_cycles: IntCounter,
}

impl Metrics {
    pub fn new() -> anyhow::Result<Self> {
        let registry = Registry::new();

        let runs_queued = IntGauge::new("daemon_runs_queued", "Agent runs waiting in queue")?;
        let runs_executing =
            IntGauge::new("daemon_runs_executing", "Agent runs currently executing")?;
        let runs_completed = IntCounter::new(
            "daemon_runs_completed_total",
            "Agent runs completed successfully",
        )?;
        let runs_failed = IntCounter::new("daemon_runs_failed_total", "Agent runs that failed")?;
        let runs_timed_out =
            IntCounter::new("daemon_runs_timed_out_total", "Agent runs that timed out")?;
        let scan_cycles = IntCounter::new(
            "daemon_scan_cycles_total",
            "Number of scan cycles completed",
        )?;

        registry.register(Box::new(runs_queued.clone()))?;
        registry.register(Box::new(runs_executing.clone()))?;
        registry.register(Box::new(runs_completed.clone()))?;
        registry.register(Box::new(runs_failed.clone()))?;
        registry.register(Box::new(runs_timed_out.clone()))?;
        registry.register(Box::new(scan_cycles.clone()))?;

        Ok(Self {
            registry,
            runs_queued,
            runs_executing,
            runs_completed,
            runs_failed,
            runs_timed_out,
            scan_cycles,
        })
    }
}
