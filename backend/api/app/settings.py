from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="GH_", env_file=".env", extra="ignore")

    env: str = "local"
    host: str = "0.0.0.0"
    port: int = 8000
    public_api_url: str = "http://localhost:8000"
    pointer_base_url: str = "http://localhost:5173"
    join_base_url: str = "http://localhost:5173"
    session_unused_ttl_s: int = 600
    session_max_ttl_s: int = 7200
    max_pointers: int = 1
    auto_admit_default: bool = True
    stun_urls: str = "stun:stun.cloudflare.com:3478"
    turn_urls: str = ""
    turn_secret: str = ""
    cors_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,"
        "http://localhost:1420,http://127.0.0.1:1420,"
        "https://ghosthands.fortunealebiosu.dev,"
        "https://staging.ghosthands.fortunealebiosu.dev"
    )
    serve_pointer_static: bool = False
    pointer_static_dir: str = ""

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def stun_url_list(self) -> list[str]:
        return [u.strip() for u in self.stun_urls.split(",") if u.strip()]

    @property
    def turn_url_list(self) -> list[str]:
        return [u.strip() for u in self.turn_urls.split(",") if u.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
