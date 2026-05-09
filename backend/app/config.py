from functools import lru_cache
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Database
    database_url: str = Field(..., alias="DATABASE_URL")

    # Redis / Celery
    redis_url: str = Field(..., alias="REDIS_URL")

    # HexStrike
    hexstrike_url: str = Field("http://hexstrike:9000", alias="HEXSTRIKE_URL")

    # Security
    secret_key: str = Field(..., alias="SECRET_KEY")
    jwt_secret: str = Field(..., alias="JWT_SECRET")
    celery_hmac_secret: str = Field(..., alias="CELERY_HMAC_SECRET")
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 15
    refresh_token_expire_days: int = 7
    totp_issuer: str = "Nova"

    # Metasploit Pro (optional)
    metasploit_rpc_host: str = Field("", alias="METASPLOIT_RPC_HOST")
    metasploit_rpc_port: int = Field(55553, alias="METASPLOIT_RPC_PORT")
    metasploit_rpc_password: str = Field("", alias="METASPLOIT_RPC_PASSWORD")

    # Titanux integration (optional)
    titanux_url: str = Field("", alias="TITANUX_URL")
    titanux_api_key: str = Field("", alias="TITANUX_API_KEY")

    # App
    environment: str = Field("development", alias="ENVIRONMENT")
    engagement_base_path: str = "/app/engagements"


@lru_cache
def get_settings() -> Settings:
    return Settings()
