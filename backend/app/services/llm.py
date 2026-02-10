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


async def contextualize_chunk(document_text: str, chunk_text: str) -> str:
    """generate chunk-specific context using full document (Anthropic Contextual Retrieval)"""
    client = _get_client()
    resp = await client.chat.completions.create(
        model=settings.llm_model,
        messages=[
            {"role": "user", "content": (
                f"<document>\n{document_text}\n</document>\n"
                "Here is the chunk we want to situate within the whole document:\n"
                f"<chunk>\n{chunk_text}\n</chunk>\n"
                "Please give a short succinct context to situate this chunk within "
                "the overall document for the purposes of improving search retrieval "
                "of the chunk. Answer only with the succinct context and nothing else."
            )},
        ],
        temperature=0.0,
        max_tokens=200,
    )
    content = resp.choices[0].message.content
    if content is None:
        raise RuntimeError("LLM returned empty context")
    return content.strip()


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
