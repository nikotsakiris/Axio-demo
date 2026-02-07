# Axios

Evidence-grounded mediator assistant. Real-time document retrieval during live mediation sessions.

## Quick Start

### 1. Infrastructure

```bash
docker compose up -d   # postgres + qdrant
```

### 2. Backend

```bash
cd backend
cp .env.example .env   # fill in OPENAI_API_KEY and COHERE_API_KEY
uv sync
uv run uvicorn app.main:app --reload --port 8000
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev            # http://localhost:3000
```

## Architecture

```
frontend (Next.js 16, App Router)
  ├── /              landing
  ├── /intake        pre-mediation document upload
  ├── /session       session setup + treatment selection
  └── /dashboard/:id mediator dashboard (challenge button, transcript, evidence viewer)
        ↓ next.config rewrites /api/* → backend
backend (FastAPI, Python 3.11)
  ├── /api/intake    PDF upload → parse → chunk → embed → Qdrant
  ├── /api/cases     CRUD for mediation cases
  ├── /api/sessions  session creation with treatment assignment
  ├── /api/challenge challenge trigger → hybrid search → rerank → LLM
  ├── /api/evidence  serve PDF + chunk context for citations
  └── /api/zoom/ws   WebSocket for manual transcript input
        ↓
  Qdrant (dense + BM25 hybrid search, RRF fusion)
  PostgreSQL (cases, sessions, documents, chunks)
  OpenAI (embeddings + gpt-4.1-mini generation)
  Cohere (cross-encoder reranking)
```

## RAG Pipeline

1. Mediator clicks Challenge
2. Last 5 transcript turns embedded directly as search query
3. Qdrant hybrid search: dense vectors + BM25 sparse, fused with RRF
4. Cohere cross-encoder reranks top candidates
5. Threshold gate: reject if all scores < 0.7
6. LLM generates summary in treatment format (neutralizer or side-by-side)
