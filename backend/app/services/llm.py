from openai import AsyncOpenAI

from app.config import settings

_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if not settings.openai_api_key:
        raise RuntimeError("OPENAI_API_KEY is not set")
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.openai_api_key)
    return _client


async def embed_texts(texts: list[str]) -> list[list[float]]:
    if not texts:
        return []
    client = _get_client()
    all_embeddings: list[list[float]] = []
    batch_size = 512
    for i in range(0, len(texts), batch_size):
        batch = texts[i : i + batch_size]
        resp = await client.embeddings.create(input=batch, model=settings.embedding_model)
        all_embeddings.extend([d.embedding for d in resp.data])
    return all_embeddings


async def embed_query(text: str) -> list[float]:
    result = await embed_texts([text])
    return result[0]


async def chat(system: str, user: str) -> str:
    client = _get_client()
    resp = await client.chat.completions.create(
        model=settings.llm_model,
        messages=[
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        temperature=0.2,
    )
    content = resp.choices[0].message.content
    if content is None:
        raise RuntimeError("LLM returned empty response")
    return content
