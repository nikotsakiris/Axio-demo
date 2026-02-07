import asyncio

from app.config import settings
from app.models.case import Session
from app.models.challenge import ChallengeResponse, Citation
from app.services.llm import chat, embed_query
from app.services.reranker import rerank
from app.services.transcript import get_query_turns, get_recent_turns, format_turns_for_query
from app.storage.vector import hybrid_search


async def run_challenge(session: Session) -> ChallengeResponse:
    buffer_turns = get_recent_turns(session.id)
    if not buffer_turns:
        raise ValueError("no transcript data available")

    # query = last N turns (subset of buffer), embedded directly as search query
    query_turns = get_query_turns(session.id)
    query_text = format_turns_for_query(query_turns)

    # full buffer for generation context
    full_context = format_turns_for_query(buffer_turns)

    # step 1: embed transcript text directly (no LLM query generation)
    query_embedding = await embed_query(query_text)

    # step 2: hybrid search (dense + BM25 + RRF)
    raw_results = await hybrid_search(
        session.case_id, query_text, query_embedding, top_k=settings.retrieval_top_k,
    )

    if not raw_results:
        return ChallengeResponse(
            treatment=session.treatment.value,
            query_used=query_text,
            no_evidence=True,
        )

    # step 3: cross-encoder rerank
    top_results = await rerank(query_text, raw_results, top_k=settings.rerank_top_k)

    # step 4: threshold gate
    score_key = "rerank_score" if top_results and "rerank_score" in top_results[0] else "score"
    if all(r.get(score_key, 0) < settings.similarity_threshold for r in top_results):
        return ChallengeResponse(
            treatment=session.treatment.value,
            query_used=query_text,
            no_evidence=True,
        )

    # step 5: generate response with fixed prompt template
    if session.treatment.value == "neutralizer":
        return await _generate_neutralizer(query_text, full_context, top_results, session)
    else:
        return await _generate_side_by_side(query_text, full_context, top_results, session)


async def _generate_neutralizer(
    query_text: str, transcript_context: str, results: list[dict], session: Session,
) -> ChallengeResponse:
    citations = _build_citations(results)
    evidence_text = _format_evidence(results)

    system = (
        "you are Axios, a neutral evidence presenter for mediation.\n"
        "rules:\n"
        "- remove emotional language\n"
        "- use 'the document states' not 'he said'\n"
        "- include citation tags like [DocName, p.X] for every claim\n"
        "- be concise and factual\n"
        "- do not add information not in the evidence\n"
        "- do not give legal advice"
    )
    user = (
        f"Current discussion:\n{transcript_context}\n\n"
        f"Retrieved evidence:\n{evidence_text}"
    )
    summary = await chat(system, user)

    return ChallengeResponse(
        treatment="neutralizer",
        query_used=query_text,
        summary=summary,
        citations=citations,
    )


async def _generate_side_by_side(
    query_text: str, transcript_context: str, results: list[dict], session: Session,
) -> ChallengeResponse:
    party_a = [r for r in results if r.get("party") == "A"]
    party_b = [r for r in results if r.get("party") == "B"]

    system = (
        "you are Axios, a neutral evidence presenter for mediation.\n"
        "rules:\n"
        "- accurately reflect what the documents say\n"
        "- include citation tags like [DocName, p.X]\n"
        "- present evidence, not conclusions\n"
        "- do not give legal advice"
    )

    a_text = _format_evidence(party_a) if party_a else ""
    b_text = _format_evidence(party_b) if party_b else ""

    async def gen_a():
        if not a_text:
            return "no relevant evidence from Party A documents."
        return await chat(
            system,
            f"Current discussion:\n{transcript_context}\n\nParty A documents:\n{a_text}",
        )

    async def gen_b():
        if not b_text:
            return "no relevant evidence from Party B documents."
        return await chat(
            system,
            f"Current discussion:\n{transcript_context}\n\nParty B documents:\n{b_text}",
        )

    party_a_summary, party_b_summary = await asyncio.gather(gen_a(), gen_b())

    return ChallengeResponse(
        treatment="side_by_side",
        query_used=query_text,
        party_a_evidence=party_a_summary,
        party_a_citations=_build_citations(party_a),
        party_b_evidence=party_b_summary,
        party_b_citations=_build_citations(party_b),
    )


def _build_citations(results: list[dict]) -> list[Citation]:
    return [
        Citation(
            chunk_id=r.get("chunk_id", ""),
            doc_name=r.get("filename", "Unknown"),
            page=r.get("page", 0),
            snippet=r.get("text", "")[:300],
        )
        for r in results
    ]


def _format_evidence(results: list[dict]) -> str:
    parts = []
    for r in results:
        tag = f"[{r.get('filename', 'Doc')}, p.{r.get('page', '?')}]"
        text = r.get("parent_text") or r.get("text", "")
        parts.append(f"{tag}\n{text}")
    return "\n\n---\n\n".join(parts)
