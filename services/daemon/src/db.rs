use anyhow::Result;
use sqlx::postgres::{PgPool, PgPoolOptions};
use std::time::Duration;

pub type Pool = PgPool;

pub async fn connect(database_url: &str) -> Result<Pool> {
    let pool = PgPoolOptions::new()
        .max_connections(10)
        .min_connections(2)
        .acquire_timeout(Duration::from_secs(10))
        .idle_timeout(Duration::from_secs(300))
        .connect(database_url)
        .await?;

    // Verify connectivity
    sqlx::query("SELECT 1").execute(&pool).await?;

    tracing::info!("PostgreSQL connected");
    Ok(pool)
}
