"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useParams } from "next/navigation";
import {
  Zap,
  Send,
  Clock,
  FileText,
  AlertCircle,
  Copy,
  Check,
  X,
  ChevronRight,
} from "lucide-react";
import {
  getSession,
  triggerChallenge,
  connectTranscriptWs,
  getChunkContext,
  type Session,
  type ChallengeResponse,
  type TranscriptTurn,
  type Citation,
} from "@/lib/api";

export default function DashboardPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;

  const [session, setSession] = useState<Session | null>(null);
  const [turns, setTurns] = useState<TranscriptTurn[]>([]);
  const [challenge, setChallenge] = useState<ChallengeResponse | null>(null);
  const [challenging, setChallenging] = useState(false);
  const [challengeTime, setChallengeTime] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [wsConnected, setWsConnected] = useState(false);

  // manual input
  const [speaker, setSpeaker] = useState("Party A");
  const [inputText, setInputText] = useState("");

  // evidence panel
  const [viewingCitation, setViewingCitation] = useState<Citation | null>(null);
  const [chunkDetail, setChunkDetail] = useState<{
    text: string;
    parent_text: string;
    section_title: string;
  } | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    getSession(sessionId).then(setSession).catch((e) => setError(String(e)));
  }, [sessionId]);

  useEffect(() => {
    const ws = connectTranscriptWs(sessionId);
    wsRef.current = ws;
    ws.onopen = () => setWsConnected(true);
    ws.onclose = () => setWsConnected(false);
    ws.onerror = () => setWsConnected(false);
    ws.onmessage = (e) => {
      const data = JSON.parse(e.data);
      if (data.turns) setTurns(data.turns);
    };
    return () => ws.close();
  }, [sessionId]);

  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [turns]);

  function sendTurn() {
    if (!inputText.trim() || !wsRef.current) return;
    wsRef.current.send(JSON.stringify({ speaker, text: inputText.trim() }));
    setInputText("");
  }

  async function handleChallenge() {
    if (challenging) return;
    setError("");
    setChallenge(null);
    setChallenging(true);
    const start = Date.now();
    try {
      const result = await triggerChallenge(sessionId);
      setChallengeTime(Date.now() - start);
      setChallenge(result);
    } catch (e) {
      setError(String(e));
    } finally {
      setChallenging(false);
    }
  }

  const openCitation = useCallback(async (cit: Citation) => {
    setViewingCitation(cit);
    setChunkDetail(null);
    try {
      const parts = cit.chunk_id.split(":");
      const docId = parts[0];
      const detail = await getChunkContext(docId, cit.chunk_id);
      setChunkDetail(detail);
    } catch {
      // chunk fetch failed, show snippet only
    }
  }, []);

  return (
    <div className="flex flex-col gap-6 lg:flex-row">
      {/* left: transcript + input */}
      <div className="flex flex-1 flex-col">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Mediator Dashboard</h1>
            <p className="text-xs text-muted">
              session {sessionId}
              {session && (
                <span> &middot; {session.treatment} treatment</span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <span
              className={`h-2 w-2 rounded-full ${
                wsConnected ? "bg-success" : "bg-danger"
              }`}
            />
            <span className="text-muted">
              {wsConnected ? "connected" : "disconnected"}
            </span>
          </div>
        </div>

        {/* transcript feed */}
        <div
          className="flex-1 overflow-y-auto rounded-xl border border-card-border bg-card p-4"
          style={{ maxHeight: "60vh" }}
        >
          {turns.length === 0 ? (
            <p className="py-12 text-center text-sm text-muted">
              no transcript yet. type below to simulate conversation turns.
            </p>
          ) : (
            <div className="space-y-3">
              {turns.map((t, i) => (
                <div key={i} className="flex gap-3">
                  <div
                    className={`mt-0.5 h-6 w-6 flex-shrink-0 rounded-full text-center text-xs font-bold leading-6 ${
                      t.speaker.includes("Mediator")
                        ? "bg-foreground/10 text-foreground"
                        : t.speaker.includes("A")
                          ? "bg-accent/20 text-accent"
                          : "bg-warning/20 text-warning"
                    }`}
                  >
                    {t.speaker.includes("Mediator")
                      ? "M"
                      : t.speaker.includes("A")
                        ? "A"
                        : "B"}
                  </div>
                  <div className="flex-1">
                    <p className="mb-0.5 text-xs font-medium text-muted">
                      {t.speaker}
                    </p>
                    <p className="text-sm leading-relaxed">{t.text}</p>
                  </div>
                </div>
              ))}
              <div ref={transcriptEndRef} />
            </div>
          )}
        </div>

        {/* input bar */}
        <div className="mt-3 flex gap-2">
          <select
            value={speaker}
            onChange={(e) => setSpeaker(e.target.value)}
            className="rounded-lg border border-card-border bg-card px-3 py-2 text-sm outline-none"
          >
            <option value="Party A">Party A</option>
            <option value="Party B">Party B</option>
            <option value="Mediator">Mediator</option>
          </select>
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendTurn()}
            placeholder="type a transcript turn..."
            className="flex-1 rounded-lg border border-card-border bg-card px-4 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            onClick={sendTurn}
            disabled={!inputText.trim()}
            className="rounded-lg border border-card-border bg-card px-3 py-2 text-muted hover:text-foreground disabled:opacity-40"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* right: challenge panel */}
      <div className="w-full lg:w-96">
        <button
          onClick={handleChallenge}
          disabled={challenging || turns.length === 0}
          className={`mb-4 flex w-full items-center justify-center gap-3 rounded-xl border-2 px-6 py-4 text-sm font-semibold ${
            challenging
              ? "border-warning/40 bg-warning/5 text-warning animate-pulse-slow"
              : "border-accent bg-accent/5 text-accent hover:bg-accent/10"
          } disabled:opacity-40 disabled:cursor-not-allowed`}
        >
          <Zap className="h-5 w-5" />
          {challenging ? "Retrieving Evidence..." : "Challenge"}
        </button>

        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-xs text-danger">
            <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" /> {error}
          </div>
        )}

        {challenge && (
          <div className="rounded-xl border border-card-border bg-card">
            <div className="flex items-center justify-between border-b border-card-border px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                {challenge.treatment === "neutralizer"
                  ? "Neutral Summary"
                  : "Side-by-Side Evidence"}
              </p>
              {challengeTime && (
                <div className="flex items-center gap-1 text-xs text-muted">
                  <Clock className="h-3 w-3" />
                  {(challengeTime / 1000).toFixed(1)}s
                </div>
              )}
            </div>

            <div className="p-4">
              {challenge.no_evidence ? (
                <div className="flex flex-col items-center py-8 text-center">
                  <FileText className="mb-3 h-8 w-8 text-muted" />
                  <p className="text-sm font-medium">No Relevant Evidence</p>
                  <p className="mt-1 text-xs text-muted">
                    no documents scored above the confidence threshold
                  </p>
                </div>
              ) : challenge.treatment === "neutralizer" ? (
                <NeutralizerView
                  summary={challenge.summary}
                  citations={challenge.citations}
                  onCitationClick={openCitation}
                />
              ) : (
                <SideBySideView
                  partyA={challenge.party_a_evidence}
                  partyACitations={challenge.party_a_citations}
                  partyB={challenge.party_b_evidence}
                  partyBCitations={challenge.party_b_citations}
                  onCitationClick={openCitation}
                />
              )}
            </div>
          </div>
        )}
      </div>

      {/* evidence side panel */}
      {viewingCitation && (
        <EvidencePanel
          citation={viewingCitation}
          detail={chunkDetail}
          onClose={() => {
            setViewingCitation(null);
            setChunkDetail(null);
          }}
        />
      )}
    </div>
  );
}

// --- inline citation parser ---

function ParsedSummary({
  text,
  citations,
  onCitationClick,
}: {
  text: string;
  citations: Citation[];
  onCitationClick: (c: Citation) => void;
}) {
  const parts = useMemo(() => {
    const regex = /\[([^\],]+),\s*p\.(\d+)\]/g;
    const result: Array<
      | { type: "text"; content: string }
      | { type: "cite"; content: string; citation: Citation | null }
    > = [];
    let lastIndex = 0;
    let match;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        result.push({ type: "text", content: text.slice(lastIndex, match.index) });
      }
      const docName = match[1].trim();
      const page = parseInt(match[2]);
      const cit =
        citations.find((c) => c.doc_name === docName && c.page === page) || null;
      result.push({ type: "cite", content: match[0], citation: cit });
      lastIndex = regex.lastIndex;
    }
    if (lastIndex < text.length) {
      result.push({ type: "text", content: text.slice(lastIndex) });
    }
    return result;
  }, [text, citations]);

  return (
    <span className="whitespace-pre-wrap text-sm leading-relaxed">
      {parts.map((part, i) =>
        part.type === "text" ? (
          <span key={i}>{part.content}</span>
        ) : (
          <button
            key={i}
            onClick={() => part.citation && onCitationClick(part.citation)}
            className="mx-0.5 inline-flex items-center gap-0.5 rounded border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-xs font-medium text-accent hover:bg-accent/20"
            title={part.citation ? `View source` : undefined}
          >
            <FileText className="h-3 w-3" />
            {part.content.slice(1, -1)}
          </button>
        ),
      )}
    </span>
  );
}

// --- sub-components ---

function NeutralizerView({
  summary,
  citations,
  onCitationClick,
}: {
  summary: string;
  citations: Citation[];
  onCitationClick: (c: Citation) => void;
}) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <div className="relative mb-4">
        <ParsedSummary
          text={summary}
          citations={citations}
          onCitationClick={onCitationClick}
        />
        <button
          onClick={handleCopy}
          className="absolute right-0 top-0 rounded-md p-1 text-muted hover:text-foreground"
        >
          {copied ? (
            <Check className="h-3.5 w-3.5" />
          ) : (
            <Copy className="h-3.5 w-3.5" />
          )}
        </button>
      </div>
      {/* citation pills as secondary overview */}
      <CitationList citations={citations} onClick={onCitationClick} />
    </div>
  );
}

function SideBySideView({
  partyA,
  partyACitations,
  partyB,
  partyBCitations,
  onCitationClick,
}: {
  partyA: string;
  partyACitations: Citation[];
  partyB: string;
  partyBCitations: Citation[];
  onCitationClick: (c: Citation) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-accent/20 bg-accent/5 p-4">
        <p className="mb-2 text-xs font-semibold text-accent">Party A Evidence</p>
        <ParsedSummary
          text={partyA}
          citations={partyACitations}
          onCitationClick={onCitationClick}
        />
        <div className="mt-3">
          <CitationList citations={partyACitations} onClick={onCitationClick} />
        </div>
      </div>
      <div className="rounded-lg border border-warning/20 bg-warning/5 p-4">
        <p className="mb-2 text-xs font-semibold text-warning">
          Party B Evidence
        </p>
        <ParsedSummary
          text={partyB}
          citations={partyBCitations}
          onCitationClick={onCitationClick}
        />
        <div className="mt-3">
          <CitationList citations={partyBCitations} onClick={onCitationClick} />
        </div>
      </div>
    </div>
  );
}

function CitationList({
  citations,
  onClick,
}: {
  citations: Citation[];
  onClick: (c: Citation) => void;
}) {
  if (!citations.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {citations.map((c, i) => (
        <button
          key={i}
          onClick={() => onClick(c)}
          className="inline-flex items-center gap-1 rounded-md border border-card-border bg-background px-2 py-1 text-xs text-muted hover:border-accent hover:text-foreground"
        >
          <ChevronRight className="h-3 w-3" />
          {c.doc_name}, p.{c.page}
        </button>
      ))}
    </div>
  );
}

// --- evidence side panel ---

function EvidencePanel({
  citation,
  detail,
  onClose,
}: {
  citation: Citation;
  detail: { text: string; parent_text: string; section_title: string } | null;
  onClose: () => void;
}) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  return (
    <>
      {/* backdrop */}
      <div className="fixed inset-0 z-40 bg-black/30" onClick={onClose} />

      {/* panel */}
      <div className="fixed right-0 top-0 z-50 flex h-full w-full max-w-lg flex-col border-l border-card-border bg-card shadow-2xl animate-slide-in">
        {/* header */}
        <div className="flex-shrink-0 border-b border-card-border px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">
                {citation.doc_name}
              </p>
              <p className="text-xs text-muted">Page {citation.page}</p>
            </div>
            <button
              onClick={onClose}
              className="ml-4 rounded-md p-1.5 text-muted hover:bg-card-border/50 hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* content */}
        <div className="flex-1 overflow-y-auto p-6">
          {detail ? (
            <div className="space-y-6">
              {detail.section_title && (
                <div className="flex items-center gap-2">
                  <div className="h-px flex-1 bg-card-border" />
                  <span className="text-xs font-medium uppercase tracking-wider text-muted">
                    {detail.section_title}
                  </span>
                  <div className="h-px flex-1 bg-card-border" />
                </div>
              )}

              {/* matched chunk */}
              <div className="rounded-lg border-l-4 border-accent bg-accent/5 p-4">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-accent">
                  Matched Evidence
                </p>
                <p className="whitespace-pre-wrap text-sm leading-relaxed">
                  {detail.text}
                </p>
              </div>

              {/* surrounding context with highlight */}
              {detail.parent_text && detail.parent_text !== detail.text && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
                    Surrounding Context
                  </p>
                  <div className="rounded-lg border border-card-border bg-background p-4">
                    <HighlightedContext
                      parent={detail.parent_text}
                      matched={detail.text}
                    />
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                Snippet
              </p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed">
                {citation.snippet}
              </p>
            </div>
          )}
        </div>

        {/* footer */}
        <div className="flex-shrink-0 border-t border-card-border px-6 py-3">
          <p className="text-xs text-muted">
            Chunk: <code className="text-xs">{citation.chunk_id}</code>
          </p>
        </div>
      </div>
    </>
  );
}

function HighlightedContext({
  parent,
  matched,
}: {
  parent: string;
  matched: string;
}) {
  const idx = parent.indexOf(matched);
  if (idx === -1) {
    return (
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted">
        {parent}
      </p>
    );
  }
  const before = parent.slice(0, idx);
  const after = parent.slice(idx + matched.length);
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed">
      <span className="text-muted">{before}</span>
      <span className="rounded bg-accent/20 px-0.5 text-foreground">
        {matched}
      </span>
      <span className="text-muted">{after}</span>
    </p>
  );
}
