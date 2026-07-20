from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str
    frontend_origin: str = "http://localhost:3000"


settings = Settings()
