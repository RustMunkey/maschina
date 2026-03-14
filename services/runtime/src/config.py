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

    @property
    def is_production(self) -> bool:
        return self.node_env == "production"

    @property
    def use_ollama(self) -> bool:
        return not self.anthropic_api_key


settings = Settings()  # type: ignore[call-arg]
