from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # secrets / infrastructure (set in .env)
    openai_api_key: str = ""
    cohere_api_key: str = ""
    database_url: str = "postgresql://axio:axio@localhost:5432/axio"
    qdrant_url: str = "http://localhost:6333"

    # tunable parameters (single source of truth — change here, not in .env)
    qdrant_collection: str = "axio_chunks"
    embedding_model: str = "text-embedding-3-small"
    llm_model: str = "gpt-4.1-mini"
    upload_dir: str = "storage"
    retrieval_top_k: int = 20
    rerank_top_k: int = 5
    similarity_threshold: float = 0.4
    chunk_size_tokens: int = 300
    chunk_overlap_pct: float = 0.15
    transcript_turns: int = 10

    @property
    def chunk_size_chars(self) -> int:
        return self.chunk_size_tokens * 4

    @property
    def chunk_overlap_chars(self) -> int:
        return int(self.chunk_size_chars * self.chunk_overlap_pct)

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
