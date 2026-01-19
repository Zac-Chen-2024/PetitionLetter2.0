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

    # OCR Provider: deepseek / baidu / gpt4o
    ocr_provider: str = "deepseek"  # 默认使用 DeepSeek-OCR

    # DeepSeek-OCR 本地模型配置
    deepseek_ocr_venv: str = "/workspace/miniconda/envs/deepseek-ocr"
    deepseek_ocr_model: str = "deepseek-ai/DeepSeek-OCR"

    # LLM Provider: ollama (默认) / local / openai / azure / deepseek / claude
    llm_provider: str = "ollama"
    llm_model: str = "qwen3:30b-a3b"  # Ollama 模型名称
    llm_api_base: str = "http://localhost:8000/v1"  # vLLM 本地模型 API

    # Ollama 配置
    ollama_api_base: str = "http://localhost:11434/v1"
    ollama_model: str = "qwen3:30b-a3b"

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
