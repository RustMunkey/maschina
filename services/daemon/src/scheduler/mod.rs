//! Resource scheduling — selects the best available node for a given run.
//!
//! Scoring factors (higher = better, max ~125):
//!   Load       — (1 - active/capacity) * 50   nodes at full capacity are excluded
//!   Model      — +30 if node's supported_models list contains this model's prefix
//!   GPU        — +20 if node has GPU and model is a local/ollama model
//!   Reputation — (reputation_score / 100) * 20  rewards high-reliability nodes
//!   Stake      — min(staked_usdc / 1000, 1) * 5  small trust bonus for staked nodes
//!
//! Selection: weighted-random from top-N candidates (not always the #1 node).
//! This ensures all eligible nodes get work — prevents starvation of lower-ranked nodes.
//!
//! Anti-whale: a single operator (user_id) cannot hold more than MAX_OPERATOR_SHARE
//! of total active tasks across the network. This protects early community operators
//! from being crowded out by large data centers.
//!
//! Dispatch: nodes with an internal_url use HTTP; NATS-only nodes (internal_url = null)
//! receive tasks via NATS request-reply, enabling home users behind NAT to participate.
//!
//! Falls back to config.runtime_url when no registered nodes are available.

use crate::state::AppState;
use rand::Rng;
use tracing::{debug, info, warn};

/// Maximum fraction of total active tasks any single operator may hold.
/// e.g. 0.30 = no operator's nodes can handle more than 30% of network traffic.
const MAX_OPERATOR_SHARE: f64 = 0.30;

/// How many top candidates to sample from for weighted-random selection.
const TOP_N_CANDIDATES: usize = 10;

/// How a selected node receives its task.
#[derive(Debug)]
pub enum NodeDispatch {
    /// Send via HTTP to the node's registered internal URL.
    Http { url: String, node_id: uuid::Uuid },
    /// Send via NATS request-reply (node has no public endpoint — home user / NAT).
    Nats { node_id: uuid::Uuid },
    /// No registered nodes available — fall back to the internal runtime.
    InternalFallback { url: String },
}

/// All node data needed to compute a scheduling score.
#[derive(Debug, sqlx::FromRow)]
struct CandidateNode {
    id: uuid::Uuid,
    user_id: uuid::Uuid,
    internal_url: Option<String>,
    max_concurrent_tasks: Option<i32>,
    has_gpu: Option<bool>,
    supported_models: Option<serde_json::Value>,
    active_task_count: i64,
    reputation_score: f64,
    staked_usdc: f64,
}

/// Compute a scheduling score for a node. Returns `None` if at full capacity.
fn score(node: &CandidateNode, model: &str) -> Option<f64> {
    let capacity = node.max_concurrent_tasks.unwrap_or(1).max(1) as f64;
    let active = node.active_task_count as f64;

    if active >= capacity {
        return None;
    }

    let load_score = (1.0 - active / capacity) * 50.0;

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

    let gpu_score = if node.has_gpu.unwrap_or(false) && model.starts_with("ollama/") {
        20.0
    } else {
        0.0
    };

    let reputation_score = (node.reputation_score.clamp(0.0, 100.0) / 100.0) * 20.0;
    let stake_score = (node.staked_usdc / 1_000.0).min(1.0) * 5.0;

    Some(load_score + model_score + gpu_score + reputation_score + stake_score)
}

/// Select the best available node for this run.
///
/// Returns a `NodeDispatch` indicating how to deliver the task:
/// - `Http` for nodes with a registered internal URL
/// - `Nats` for home nodes (no public endpoint)
/// - `InternalFallback` when no registered nodes are available
pub async fn select_node(state: &AppState, model: &str) -> NodeDispatch {
    let result = sqlx::query_as::<_, CandidateNode>(
        r#"
        SELECT
            n.id,
            n.user_id,
            n.internal_url,
            nc.max_concurrent_tasks,
            nc.has_gpu,
            nc.supported_models,
            COALESCE(h.active_task_count, 0) AS active_task_count,
            CAST(n.reputation_score AS FLOAT8) AS reputation_score,
            CAST(n.staked_usdc      AS FLOAT8) AS staked_usdc
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
          AND n.last_heartbeat_at > NOW() - INTERVAL '60 seconds'
        "#,
    )
    .fetch_all(&state.db)
    .await;

    let candidates = match result {
        Ok(rows) => rows,
        Err(e) => {
            warn!(error = %e, "Scheduler query failed — falling back to RUNTIME_URL");
            return NodeDispatch::InternalFallback {
                url: state.config.runtime_url.clone(),
            };
        }
    };

    if candidates.is_empty() {
        warn!("No active registered nodes — falling back to RUNTIME_URL");
        return NodeDispatch::InternalFallback {
            url: state.config.runtime_url.clone(),
        };
    }

    // Score all candidates, exclude fully loaded ones
    let mut scored: Vec<(&CandidateNode, f64)> = candidates
        .iter()
        .filter_map(|node| score(node, model).map(|s| (node, s)))
        .collect();

    if scored.is_empty() {
        let count = candidates.len();
        warn!(
            node_count = count,
            "All {} registered node(s) at full capacity — falling back to RUNTIME_URL", count
        );
        debug!(
            nodes = ?candidates.iter().map(|n| {
                format!("{}: {}/{}", n.id, n.active_task_count, n.max_concurrent_tasks.unwrap_or(1))
            }).collect::<Vec<_>>(),
            "Node capacity state"
        );
        return NodeDispatch::InternalFallback {
            url: state.config.runtime_url.clone(),
        };
    }

    // Anti-whale: compute total active tasks and exclude operators over their share cap
    let total_active: i64 = candidates.iter().map(|n| n.active_task_count).sum();
    if total_active > 0 {
        let cap = (total_active as f64 * MAX_OPERATOR_SHARE).ceil() as i64;
        // Build per-operator active task counts
        let mut operator_active: std::collections::HashMap<uuid::Uuid, i64> =
            std::collections::HashMap::new();
        for node in &candidates {
            *operator_active.entry(node.user_id).or_insert(0) += node.active_task_count;
        }
        // Exclude nodes whose operator has exceeded the cap
        scored.retain(|(node, _)| {
            let op_active = operator_active.get(&node.user_id).copied().unwrap_or(0);
            op_active <= cap
        });

        if scored.is_empty() {
            // All remaining nodes belong to capped operators — allow them but warn
            warn!(
                operator_share_cap = MAX_OPERATOR_SHARE,
                "All eligible nodes belong to operators over the share cap — relaxing anti-whale filter"
            );
            scored = candidates
                .iter()
                .filter_map(|node| score(node, model).map(|s| (node, s)))
                .collect();
        }
    }

    // Sort descending, take top-N
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(TOP_N_CANDIDATES);

    // Weighted-random selection: higher score = higher probability, but not guaranteed
    let selected = weighted_random_pick(&scored);

    match selected {
        Some((node, s)) => {
            info!(
                node_id = %node.id,
                score = s,
                active = node.active_task_count,
                capacity = node.max_concurrent_tasks.unwrap_or(1),
                has_url = node.internal_url.is_some(),
                "Scheduler selected node"
            );

            match &node.internal_url {
                Some(url) => NodeDispatch::Http {
                    url: url.clone(),
                    node_id: node.id,
                },
                None => NodeDispatch::Nats { node_id: node.id },
            }
        }
        None => {
            warn!("Weighted selection returned nothing — falling back to RUNTIME_URL");
            NodeDispatch::InternalFallback {
                url: state.config.runtime_url.clone(),
            }
        }
    }
}

/// Weighted-random selection from a scored list.
/// Each candidate's probability is proportional to its score.
fn weighted_random_pick<'a>(
    scored: &'a [(&'a CandidateNode, f64)],
) -> Option<(&'a CandidateNode, f64)> {
    if scored.is_empty() {
        return None;
    }
    if scored.len() == 1 {
        return Some((scored[0].0, scored[0].1));
    }

    let total: f64 = scored.iter().map(|(_, s)| s).sum();
    if total <= 0.0 {
        return Some((scored[0].0, scored[0].1));
    }

    let mut rng = rand::thread_rng();
    let mut pick = rng.gen_range(0.0..total);

    for (node, s) in scored {
        pick -= s;
        if pick <= 0.0 {
            return Some((node, *s));
        }
    }

    // Rounding fallback
    scored.last().map(|(n, s)| (*n, *s))
}
