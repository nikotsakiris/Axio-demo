import httpx

from app.config import settings


async def rerank(query: str, results: list[dict], top_k: int | None = None) -> list[dict]:
    top_k = top_k or settings.rerank_top_k
    if not settings.cohere_api_key:
        raise RuntimeError("COHERE_API_KEY is not set")
    return await _cohere_rerank(query, results, top_k)


async def _cohere_rerank(query: str, results: list[dict], top_k: int) -> list[dict]:
    # prefer enriched_text so cross-encoder sees document metadata
    documents = [r.get("enriched_text") or r.get("text", "") for r in results]
    if not documents:
        return []

    async with httpx.AsyncClient(timeout=5.0) as client:
        resp = await client.post(
            "https://api.cohere.com/v2/rerank",
            headers={
                "Authorization": f"Bearer {settings.cohere_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": "rerank-v3.5",
                "query": query,
                "documents": documents,
                "top_n": top_k,
            },
        )
        resp.raise_for_status()
        data = resp.json()

    reranked = []
    for item in data.get("results", []):
        idx = item["index"]
        if idx < len(results):
            entry = dict(results[idx])
            entry["rerank_score"] = item["relevance_score"]
            reranked.append(entry)

    return reranked
