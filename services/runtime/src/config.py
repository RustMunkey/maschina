from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    anthropic_api_key: str = ""
    openai_api_key: str = ""
    runtime_port: int = 8001
    node_env: str = "development"
    default_timeout_secs: int = 300
    max_output_tokens: int = 16_384

    # Ollama fallback (used when anthropic_api_key is empty)
    ollama_base_url: str = "http://localhost:11434/v1"
    ollama_model: str = "llama3.2"

    # Qdrant (agent memory)
    qdrant_url: str = "http://localhost:6333"
    qdrant_api_key: str = ""

    # Embeddings — Voyage AI is preferred (Anthropic's recommended partner)
    # Falls back to OpenAI text-embedding-3-small if voyage_api_key is unset
    voyage_api_key: str = ""

    # Memory settings
    memory_enabled: bool = True
    memory_top_k: int = 5  # number of memories to retrieve per run

    # Sandboxing (code_exec skill)
    sandbox_enabled: bool = True
    sandbox_memory_limit_mb: int = 128
    sandbox_cpu_limit_secs: int = 10

    # Per-run resource limits (applied to the entire agent run process)
    # These cap a single run's RAM and CPU regardless of how many tool calls it makes.
    # Set to 0 to disable (not recommended on multi-tenant nodes).
    run_memory_limit_mb: int = 1024  # 1 GB per run
    run_cpu_limit_secs: int = 300  # matches default timeout

    # gVisor container sandbox (Tier 1 — strongest isolation, Linux only)
    # Set to the pre-built agent sandbox image to enable gVisor mode.
    # Requires Docker + gVisor (runsc) on the host. Falls back to subprocess if unset.
    # Example: ghcr.io/rustmunkey/maschina-agent-sandbox:latest
    sandbox_image: str = ""

    # Agent collaboration — inter-agent delegation
    # MASCHINA_API_URL: internal base URL of the API service
    # INTERNAL_SECRET: shared secret for /internal/* routes (must match API service)
    maschina_api_url: str = "http://localhost:3000"
    internal_secret: str = ""

    @property
    def is_production(self) -> bool:
        return self.node_env == "production"

    @property
    def use_ollama(self) -> bool:
        return not self.anthropic_api_key


settings = Settings()  # type: ignore[call-arg]
