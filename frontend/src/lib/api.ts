const API = "/api";

export interface Case {
  id: string;
  name: string;
  description: string;
  created_at: string;
}

export interface Session {
  id: string;
  case_id: string;
  treatment: string;
  created_at: string;
}

export interface Document {
  id: string;
  case_id: string;
  party: string;
  filename: string;
  title: string;
  page_count: number;
  storage_path: string;
  created_at: string;
}

export interface Citation {
  chunk_id: string;
  doc_name: string;
  page: number;
  snippet: string;
}

export interface ChallengeResponse {
  treatment: string;
  query_used: string;
  no_evidence: boolean;
  summary: string;
  citations: Citation[];
  party_a_evidence: string;
  party_a_citations: Citation[];
  party_b_evidence: string;
  party_b_citations: Citation[];
}

export interface TranscriptTurn {
  speaker: string;
  text: string;
  timestamp: string;
}

// --- cases ---

export async function createCase(name: string, description = ""): Promise<Case> {
  const res = await fetch(`${API}/cases`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, description }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listCases(): Promise<Case[]> {
  const res = await fetch(`${API}/cases`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getCase(caseId: string): Promise<Case> {
  const res = await fetch(`${API}/cases/${caseId}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// --- sessions ---

export async function createSession(
  caseId: string,
  treatment: string
): Promise<Session> {
  const res = await fetch(`${API}/cases/${caseId}/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ treatment }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listSessions(caseId: string): Promise<Session[]> {
  const res = await fetch(`${API}/cases/${caseId}/sessions`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getSession(sessionId: string): Promise<Session> {
  const res = await fetch(`${API}/sessions/${sessionId}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// --- documents ---

export async function uploadDocument(
  caseId: string,
  party: string,
  file: File,
  title = ""
): Promise<Document> {
  const form = new FormData();
  form.append("case_id", caseId);
  form.append("party", party);
  form.append("file", file);
  if (title) form.append("title", title);
  const res = await fetch(`${API}/intake/upload`, { method: "POST", body: form });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function listDocuments(caseId: string): Promise<Document[]> {
  const res = await fetch(`${API}/intake/${caseId}/documents`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// --- challenge ---

export async function triggerChallenge(
  sessionId: string
): Promise<ChallengeResponse> {
  const res = await fetch(`${API}/challenge/${sessionId}`, { method: "POST" });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// --- evidence ---

export async function getChunkContext(
  docId: string,
  chunkId: string
): Promise<{ text: string; parent_text: string; section_title: string }> {
  const res = await fetch(`${API}/evidence/${docId}/chunk/${chunkId}`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

// --- websocket ---

export function connectTranscriptWs(sessionId: string): WebSocket {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return new WebSocket(`${proto}//${window.location.host}/api/zoom/ws/transcript/${sessionId}`);
}
