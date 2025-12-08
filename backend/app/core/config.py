from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Database
    database_url: str = "sqlite:///./pipeline.db"

    # OpenAI API
    openai_api_key: str = ""
    openai_api_base: str = "https://api.openai.com/v1"

    # Baidu OCR
    baidu_ocr_api_key: str = ""
    baidu_ocr_secret_key: str = ""
    ocr_provider: str = "baidu"  # baidu / gpt4o

    # LLM Provider
    llm_provider: str = "openai"  # openai / azure / deepseek / claude
    llm_model: str = "gpt-4o"

    # Azure OpenAI (备选)
    azure_openai_api_key: str = ""
    azure_openai_endpoint: str = ""
    azure_openai_deployment: str = ""
    azure_openai_api_version: str = "2024-02-15-preview"

    # DeepSeek (备选)
    deepseek_api_key: str = ""
    deepseek_api_base: str = "https://api.deepseek.com/v1"

    # Claude (备选)
    claude_api_key: str = ""
    claude_api_base: str = "https://api.anthropic.com"

    class Config:
        env_file = ".env"


settings = Settings()
