from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    nats_url: str = "nats://localhost:4222"
    nats_ca_cert: str = ""
    database_url: str = "postgresql://maschina:maschina@localhost:5432/maschina"
    anthropic_api_key: str = ""
    node_env: str = "development"
    temporal_url: str = "localhost:7233"
    runtime_url: str = "http://localhost:8001"

    # Consumer config
    stream_name: str = "MASCHINA_JOBS"
    consumer_name: str = "worker-background"
    subject_filter: str = "maschina.jobs.worker.>"
    max_concurrent: int = 4

    @property
    def is_production(self) -> bool:
        return self.node_env == "production"


settings = Settings()
