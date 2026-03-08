use anyhow::Result;

#[derive(Clone, Debug)]
pub struct Config {
    pub port: u16,
    pub api_url: String,
    pub realtime_url: String,
    pub jwt_secret: String,
    pub nats_url: String,
    pub node_env: String,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        // Try service-local .env first, then workspace root
        let _ = dotenvy::dotenv().map(|_| ())
            .or_else(|_| dotenvy::from_path(concat!(env!("CARGO_MANIFEST_DIR"), "/.env")))
            .or_else(|_| dotenvy::from_path(concat!(env!("CARGO_MANIFEST_DIR"), "/../../.env")));
        Ok(Self {
            port: std::env::var("GATEWAY_PORT")
                .unwrap_or_else(|_| "8080".into())
                .parse()?,
            api_url: std::env::var("API_URL")
                .unwrap_or_else(|_| "http://localhost:3000".into()),
            realtime_url: std::env::var("REALTIME_URL")
                .unwrap_or_else(|_| "http://localhost:4000".into()),
            jwt_secret: std::env::var("JWT_SECRET")
                .expect("JWT_SECRET must be set"),
            nats_url: std::env::var("NATS_URL")
                .unwrap_or_else(|_| "nats://localhost:4222".into()),
            node_env: std::env::var("NODE_ENV")
                .unwrap_or_else(|_| "development".into()),
        })
    }

    pub fn is_production(&self) -> bool {
        self.node_env == "production"
    }
}
