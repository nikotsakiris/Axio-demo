import hashlib
import re
from collections import Counter

from qdrant_client import AsyncQdrantClient
from qdrant_client.models import (
    Distance,
    VectorParams,
    SparseVectorParams,
    Modifier,
    PointStruct,
    SparseVector,
    Filter,
    FieldCondition,
    MatchValue,
    Prefetch,
    FusionQuery,
    Fusion,
)

from app.config import settings
from app.models.document import Chunk

DENSE_DIM = 1536

_client: AsyncQdrantClient | None = None


def _chunk_id_to_point_id(chunk_id: str) -> str:
    h = hashlib.sha256(chunk_id.encode()).hexdigest()
    return f"{h[:8]}-{h[8:12]}-{h[12:16]}-{h[16:20]}-{h[20:32]}"


def _word_hash(word: str) -> int:
    """deterministic 31-bit hash for sparse vector indices"""
    return int(hashlib.md5(word.encode()).hexdigest()[:8], 16) % (2**31)


def sparse_encode(text: str) -> SparseVector:
    """encode text into sparse BM25 vector using word term frequency.
    qdrant Modifier.IDF handles the IDF weighting server-side."""
    tokens = re.findall(r'\b\w{2,}\b', text.lower())
    if not tokens:
        return SparseVector(indices=[0], values=[0.0])
    freq = Counter(tokens)
    pairs = sorted((_word_hash(w), float(c)) for w, c in freq.items())
    # deduplicate collisions by summing values
    merged: dict[int, float] = {}
    for idx, val in pairs:
        merged[idx] = merged.get(idx, 0.0) + val
    indices = sorted(merged.keys())
    values = [merged[i] for i in indices]
    return SparseVector(indices=indices, values=values)


async def _get_client() -> AsyncQdrantClient:
    global _client
    if _client is None:
        _client = AsyncQdrantClient(url=settings.qdrant_url)
    return _client


async def init_qdrant():
    client = await _get_client()
    collections = await client.get_collections()
    names = [c.name for c in collections.collections]
    if settings.qdrant_collection not in names:
        await client.create_collection(
            collection_name=settings.qdrant_collection,
            vectors_config={
                "dense": VectorParams(size=DENSE_DIM, distance=Distance.COSINE),
            },
            sparse_vectors_config={
                "bm25": SparseVectorParams(modifier=Modifier.IDF),
            },
        )


async def upsert_chunks(
    chunks: list[Chunk],
    embeddings: list[list[float]],
    enriched_texts: list[str] | None = None,
):
    if not chunks:
        return
    client = await _get_client()
    points = []
    for i, (chunk, emb) in enumerate(zip(chunks, embeddings)):
        point_id = _chunk_id_to_point_id(chunk.id)
        # use enriched text for BM25 so keyword search sees document metadata
        index_text = enriched_texts[i] if enriched_texts else chunk.text
        sparse = sparse_encode(index_text)
        points.append(PointStruct(
            id=point_id,
            vector={"dense": emb, "bm25": sparse},
            payload={
                "chunk_id": chunk.id,
                "doc_id": chunk.doc_id,
                "case_id": chunk.case_id,
                "party": chunk.party,
                "filename": chunk.filename,
                "page": chunk.page,
                "start_char": chunk.start_char,
                "end_char": chunk.end_char,
                "text": chunk.text,
                "enriched_text": index_text,
                "parent_text": chunk.parent_text,
                "section_title": chunk.section_title,
            },
        ))

    batch_size = 100
    for i in range(0, len(points), batch_size):
        batch = points[i : i + batch_size]
        await client.upsert(collection_name=settings.qdrant_collection, points=batch)


async def hybrid_search(
    case_id: str,
    query_text: str,
    query_embedding: list[float],
    top_k: int = 20,
) -> list[dict]:
    """dense + BM25 sparse search fused with RRF"""
    client = await _get_client()
    case_filter = Filter(
        must=[FieldCondition(key="case_id", match=MatchValue(value=case_id))]
    )
    sparse_query = sparse_encode(query_text)

    response = await client.query_points(
        collection_name=settings.qdrant_collection,
        prefetch=[
            Prefetch(
                query=query_embedding,
                using="dense",
                limit=top_k,
                filter=case_filter,
            ),
            Prefetch(
                query=sparse_query,
                using="bm25",
                limit=top_k,
                filter=case_filter,
            ),
        ],
        query=FusionQuery(fusion=Fusion.RRF),
        limit=top_k,
        with_payload=True,
    )
    return [{"score": pt.score, **(pt.payload or {})} for pt in response.points]
