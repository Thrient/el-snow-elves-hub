"""应用配置 — pydantic-settings 从环境变量/.env读取"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # App
    app_name: str = "时雪-创意工坊"
    debug: bool = False
    secret_key: str

    # MySQL
    database_url: str

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # RabbitMQ
    rabbitmq_url: str = "amqp://elsnow:MqSnowElf2024@localhost:5672/"

    # JWT
    jwt_secret: str
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 60 * 24 * 7
    jwt_refresh_expire_days: int = 30

    # Cookie
    cookie_secure: bool = True
    cookie_domain: str = ""

    # MinIO
    minio_endpoint: str = "localhost:9000"
    minio_public_endpoint: str = ""
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "el-snow-hub"
    minio_secure: bool = False

    # Email (Resend)
    resend_api_key: str = ""
    mail_from: str = "noreply@elarion.cn"

    # Upload
    max_upload_size: int = 100 * 1024 * 1024

    # Rate limiting (per-IP, per-window)
    rate_limit_default: str = "60/minute"
    rate_limit_auth: str = "5/minute"
    rate_limit_upload: str = "10/minute"


settings = Settings()
