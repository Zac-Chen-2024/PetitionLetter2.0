from typing import List

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # DeepSeek API (default provider)
    deepseek_api_key: str = ""
    deepseek_api_base: str = "https://api.deepseek.com/v1"

    # OpenAI API (alternative)
    openai_api_key: str = ""
    openai_api_base: str = "https://api.openai.com/v1"

    # LLM Provider: "deepseek" (default) or "openai"
    llm_provider: str = "deepseek"

    # CORS allow-list, comma-separated, e.g.
    #   CORS_ORIGINS=http://localhost:5173,https://petition.example.com
    # Kept as a plain string so that pydantic-settings does not try to
    # JSON-decode the env value; use `cors_origin_list` to read it.
    cors_origins: str = "http://localhost:5173"

    # Logging level for the application logger ("DEBUG" / "INFO" / ...)
    log_level: str = "INFO"

    # Root data directory. Empty -> backend/data. Docker sets it explicitly;
    # tests point it at a temp dir.
    data_dir: str = ""

    # Root of the ORIGINAL case material (PDF/<letter>/<exhibit>.pdf ...) that
    # metadata.json.source_path points into. Empty -> <repo>/data. Docker sets
    # /app/data. Used only as a fallback when the stored absolute path is not
    # present on this machine (paths were recorded on a Windows dev box).
    source_data_dir: str = ""

    # Workspace auth. False (default): every /api request needs a bearer token
    # minted with scripts/mint_token.py. True: unauthenticated requests fall
    # back to the "default" workspace (local development).
    auth_disabled: bool = False

    # Set by the test suite; skips the fail-fast LLM key check at startup.
    skip_llm_config_check: bool = False

    @property
    def cors_origin_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    def api_key_for(self, provider: str) -> str:
        return {"deepseek": self.deepseek_api_key, "openai": self.openai_api_key}.get(provider, "")

    def validate_llm_config(self) -> None:
        """Fail fast at startup if the default provider has no key.

        Requests may still override `provider`; a missing key for that
        provider surfaces as a 400 at request time (see llm_client).
        """
        if self.llm_provider not in ("deepseek", "openai"):
            raise SystemExit(f"LLM_PROVIDER must be 'deepseek' or 'openai', got {self.llm_provider!r}")
        if not self.api_key_for(self.llm_provider):
            raise SystemExit(
                f"{self.llm_provider.upper()}_API_KEY is not set (LLM_PROVIDER={self.llm_provider}). "
                "Copy backend/.env.example to backend/.env and fill it in."
            )

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
