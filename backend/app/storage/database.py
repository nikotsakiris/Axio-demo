import asyncpg

from app.config import settings
from app.models.case import Case, Session, Treatment
from app.models.document import Document, Chunk

_pool: asyncpg.Pool | None = None


async def init_db():
    global _pool
    _pool = await asyncpg.create_pool(settings.database_url)
    async with _pool.acquire() as conn:
        await conn.execute(SCHEMA)


async def close_db():
    global _pool
    if _pool:
        await _pool.close()
        _pool = None


def _get_pool() -> asyncpg.Pool:
    if _pool is None:
        raise RuntimeError("database not initialized")
    return _pool


SCHEMA = """
CREATE TABLE IF NOT EXISTS cases (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id),
    treatment TEXT NOT NULL DEFAULT 'neutralizer',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS documents (
    id TEXT PRIMARY KEY,
    case_id TEXT NOT NULL REFERENCES cases(id),
    party TEXT NOT NULL,
    filename TEXT NOT NULL,
    page_count INTEGER NOT NULL DEFAULT 0,
    storage_path TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY,
    doc_id TEXT NOT NULL REFERENCES documents(id),
    case_id TEXT NOT NULL,
    party TEXT NOT NULL,
    filename TEXT NOT NULL,
    page INTEGER NOT NULL,
    start_char INTEGER NOT NULL,
    end_char INTEGER NOT NULL,
    text TEXT NOT NULL,
    parent_text TEXT,
    section_title TEXT
);
"""


# --- cases ---

async def create_case(case: Case):
    pool = _get_pool()
    await pool.execute(
        "INSERT INTO cases (id, name, description, created_at) VALUES ($1, $2, $3, $4)",
        case.id, case.name, case.description, case.created_at,
    )


async def get_case(case_id: str) -> Case | None:
    pool = _get_pool()
    row = await pool.fetchrow("SELECT * FROM cases WHERE id = $1", case_id)
    if not row:
        return None
    return Case(id=row["id"], name=row["name"], description=row["description"], created_at=row["created_at"])


async def list_cases() -> list[Case]:
    pool = _get_pool()
    rows = await pool.fetch("SELECT * FROM cases ORDER BY created_at DESC")
    return [Case(id=r["id"], name=r["name"], description=r["description"], created_at=r["created_at"]) for r in rows]


# --- sessions ---

async def create_session(sess: Session):
    pool = _get_pool()
    await pool.execute(
        "INSERT INTO sessions (id, case_id, treatment, created_at) VALUES ($1, $2, $3, $4)",
        sess.id, sess.case_id, sess.treatment.value, sess.created_at,
    )


async def get_session(session_id: str) -> Session | None:
    pool = _get_pool()
    row = await pool.fetchrow("SELECT * FROM sessions WHERE id = $1", session_id)
    if not row:
        return None
    return Session(id=row["id"], case_id=row["case_id"], treatment=Treatment(row["treatment"]), created_at=row["created_at"])


async def get_sessions_for_case(case_id: str) -> list[Session]:
    pool = _get_pool()
    rows = await pool.fetch("SELECT * FROM sessions WHERE case_id = $1 ORDER BY created_at DESC", case_id)
    return [Session(id=r["id"], case_id=r["case_id"], treatment=Treatment(r["treatment"]), created_at=r["created_at"]) for r in rows]


# --- documents ---

async def save_document(doc: Document):
    pool = _get_pool()
    await pool.execute(
        "INSERT INTO documents (id, case_id, party, filename, page_count, storage_path, created_at) "
        "VALUES ($1, $2, $3, $4, $5, $6, $7)",
        doc.id, doc.case_id, doc.party, doc.filename, doc.page_count, doc.storage_path, doc.created_at,
    )


async def get_document(doc_id: str) -> Document | None:
    pool = _get_pool()
    row = await pool.fetchrow("SELECT * FROM documents WHERE id = $1", doc_id)
    if not row:
        return None
    return Document(
        id=row["id"], case_id=row["case_id"], party=row["party"], filename=row["filename"],
        page_count=row["page_count"], storage_path=row["storage_path"], created_at=row["created_at"],
    )


async def get_documents_for_case(case_id: str) -> list[Document]:
    pool = _get_pool()
    rows = await pool.fetch("SELECT * FROM documents WHERE case_id = $1 ORDER BY created_at DESC", case_id)
    return [
        Document(
            id=r["id"], case_id=r["case_id"], party=r["party"], filename=r["filename"],
            page_count=r["page_count"], storage_path=r["storage_path"], created_at=r["created_at"],
        )
        for r in rows
    ]


# --- chunks ---

async def save_chunks(chunks: list[Chunk]):
    pool = _get_pool()
    async with pool.acquire() as conn:
        for chunk in chunks:
            await conn.execute(
                "INSERT INTO chunks (id, doc_id, case_id, party, filename, page, start_char, end_char, text, parent_text, section_title) "
                "VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) "
                "ON CONFLICT (id) DO UPDATE SET text = EXCLUDED.text",
                chunk.id, chunk.doc_id, chunk.case_id, chunk.party, chunk.filename,
                chunk.page, chunk.start_char, chunk.end_char, chunk.text,
                chunk.parent_text, chunk.section_title,
            )


async def get_chunk(chunk_id: str) -> Chunk | None:
    pool = _get_pool()
    row = await pool.fetchrow("SELECT * FROM chunks WHERE id = $1", chunk_id)
    if not row:
        return None
    return Chunk(
        id=row["id"], doc_id=row["doc_id"], case_id=row["case_id"], party=row["party"],
        filename=row["filename"], page=row["page"], start_char=row["start_char"],
        end_char=row["end_char"], text=row["text"], parent_text=row["parent_text"],
        section_title=row["section_title"],
    )
