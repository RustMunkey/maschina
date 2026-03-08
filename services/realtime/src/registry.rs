use std::sync::Arc;

use dashmap::DashMap;
use tokio::sync::broadcast;

/// Number of buffered events per user channel before the oldest are dropped.
const CHANNEL_CAPACITY: usize = 256;

/// Shared registry of per-user broadcast channels.
///
/// Key   = userId (UUID string)
/// Value = broadcast sender; clients hold receivers
pub type Registry = Arc<DashMap<String, broadcast::Sender<String>>>;

pub fn new_registry() -> Registry {
    Arc::new(DashMap::new())
}

/// Subscribe to events for a given userId.
/// Creates the broadcast channel if this is the first subscriber.
pub fn subscribe(registry: &Registry, user_id: &str) -> broadcast::Receiver<String> {
    if let Some(sender) = registry.get(user_id) {
        return sender.subscribe();
    }
    let (tx, rx) = broadcast::channel(CHANNEL_CAPACITY);
    registry.insert(user_id.to_string(), tx);
    rx
}

/// Fan-out a JSON event to all live connections for the given userId.
/// Returns the number of receivers that received the message.
pub fn send_to_user(registry: &Registry, user_id: &str, event: String) -> usize {
    if let Some(sender) = registry.get(user_id) {
        // Receivers that have disconnected will be cleaned up automatically
        // by the broadcast channel when their Receivers drop.
        sender.send(event).unwrap_or(0)
    } else {
        0
    }
}
