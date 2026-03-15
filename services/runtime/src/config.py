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

    @property
    def is_production(self) -> bool:
        return self.node_env == "production"

    @property
    def use_ollama(self) -> bool:
        return not self.anthropic_api_key


settings = Settings()  # type: ignore[call-arg]
