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

    @property
    def cors_origin_list(self) -> List[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    class Config:
        env_file = ".env"
        extra = "ignore"


settings = Settings()
