//! Resource scheduling — selects the best available node for a given run.
//!
//! Scoring factors (higher = better):
//!   Load      — (1 - active/capacity) * 50   nodes at full capacity are excluded
//!   Model     — +30 if node's supported_models list contains this model's prefix
//!   GPU       — +20 if node has GPU and model is a local/ollama model
//!
//! Falls back to config.runtime_url when no registered nodes are available
//! or all nodes are at capacity.

use crate::state::AppState;
use tracing::{debug, info, warn};

/// All node data needed to compute a scheduling score.
#[derive(Debug, sqlx::FromRow)]
struct CandidateNode {
    id: uuid::Uuid,
    internal_url: String,
    max_concurrent_tasks: Option<i32>,
    has_gpu: Option<bool>,
    supported_models: Option<serde_json::Value>, // JSON array of strings
    active_task_count: i64,
}

/// Compute a scheduling score for a node. Higher is better.
/// Returns `None` if the node is at full capacity and must be excluded.
fn score(node: &CandidateNode, model: &str) -> Option<f64> {
    let capacity = node.max_concurrent_tasks.unwrap_or(1).max(1) as f64;
    let active = node.active_task_count as f64;

    // Exclude fully loaded nodes
    if active >= capacity {
        return None;
    }

    let load_score = (1.0 - active / capacity) * 50.0;

    // Model match — check if any entry in supported_models is a prefix of the requested model
    let model_score = if let Some(val) = &node.supported_models {
        if let Some(arr) = val.as_array() {
            let matches = arr.iter().any(|v| {
                v.as_str()
                    .map(|s| model.starts_with(s) || s.starts_with(model))
                    .unwrap_or(false)
            });
            if matches {
                30.0
            } else {
                0.0
            }
        } else {
            0.0
        }
    } else {
        0.0
    };

    // GPU bonus — ollama/* models may benefit from GPU acceleration
    let gpu_score = if node.has_gpu.unwrap_or(false) && model.starts_with("ollama/") {
        20.0
    } else {
        0.0
    };

    Some(load_score + model_score + gpu_score)
}

/// Select the best available node for this run.
///
/// Returns `(url, node_id)`. `node_id` is `Some` when a registered node was
/// selected, or `None` when falling back to the internal RUNTIME_URL.
pub async fn select_node(state: &AppState, model: &str) -> (String, Option<uuid::Uuid>) {
    let result = sqlx::query_as::<_, CandidateNode>(
        r#"
        SELECT
            n.id,
            n.internal_url,
            nc.max_concurrent_tasks,
            nc.has_gpu,
            nc.supported_models,
            COALESCE(h.active_task_count, 0) AS active_task_count
        FROM nodes n
        LEFT JOIN node_capabilities nc ON nc.node_id = n.id
        LEFT JOIN LATERAL (
            SELECT active_task_count
            FROM node_heartbeats
            WHERE node_id = n.id
            ORDER BY recorded_at DESC
            LIMIT 1
        ) h ON true
        WHERE n.status = 'active'
          AND n.internal_url IS NOT NULL
          AND n.last_heartbeat_at > NOW() - INTERVAL '60 seconds'
        "#,
    )
    .fetch_all(&state.db)
    .await;

    let candidates = match result {
        Ok(rows) => rows,
        Err(e) => {
            warn!(error = %e, "Scheduler query failed — falling back to RUNTIME_URL");
            return (state.config.runtime_url.clone(), None);
        }
    };

    if candidates.is_empty() {
        warn!("No active registered nodes — falling back to RUNTIME_URL");
        return (state.config.runtime_url.clone(), None);
    }

    // Score and rank
    let best = candidates
        .iter()
        .filter_map(|node| score(node, model).map(|s| (node, s)))
        .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));

    match best {
        Some((node, s)) => {
            info!(
                node_id = %node.id,
                url = %node.internal_url,
                score = s,
                active = node.active_task_count,
                capacity = node.max_concurrent_tasks.unwrap_or(1),
                "Scheduler selected node"
            );
            (node.internal_url.clone(), Some(node.id))
        }
        None => {
            // All nodes exist but are at full capacity
            let count = candidates.len();
            warn!(
                node_count = count,
                "All {} registered node(s) at full capacity — falling back to RUNTIME_URL", count
            );
            debug!(
                nodes = ?candidates.iter().map(|n| format!("{}: {}/{}", n.id, n.active_task_count, n.max_concurrent_tasks.unwrap_or(1))).collect::<Vec<_>>(),
                "Node capacity state"
            );
            (state.config.runtime_url.clone(), None)
        }
    }
}
