"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { PlayCircle, AlertCircle } from "lucide-react";
import {
  listCases,
  listSessions,
  createSession,
  type Case,
  type Session,
} from "@/lib/api";

export default function SessionPage() {
  const router = useRouter();
  const [cases, setCases] = useState<Case[]>([]);
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [sessions, setSessions] = useState<Session[]>([]);
  const [treatment, setTreatment] = useState("neutralizer");
  const [error, setError] = useState("");

  const loadCases = useCallback(async () => {
    try {
      setCases(await listCases());
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  const loadSessions = useCallback(async (caseId: string) => {
    try {
      setSessions(await listSessions(caseId));
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    if (selectedCase) loadSessions(selectedCase.id);
  }, [selectedCase, loadSessions]);

  async function handleCreate() {
    if (!selectedCase) return;
    setError("");
    try {
      const sess = await createSession(selectedCase.id, treatment);
      router.push(`/dashboard/${sess.id}`);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-2 text-2xl font-bold">Mediation Sessions</h1>
      <p className="mb-8 text-sm text-muted">
        Select a case, choose a treatment, and start a live session.
      </p>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
          <AlertCircle className="h-4 w-4" /> {error}
        </div>
      )}

      {/* case picker */}
      <div className="mb-6 rounded-xl border border-card-border bg-card p-6">
        <h2 className="mb-4 text-sm font-semibold">Select a Case</h2>
        {cases.length === 0 ? (
          <p className="text-sm text-muted">
            no cases found. create one in the Intake page first.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {cases.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCase(c)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium ${
                  selectedCase?.id === c.id
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-card-border text-muted hover:text-foreground"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* new session */}
      {selectedCase && (
        <div className="mb-6 rounded-xl border border-card-border bg-card p-6">
          <h2 className="mb-4 text-sm font-semibold">New Session</h2>

          <div className="mb-4">
            <label className="mb-2 block text-xs text-muted">Treatment</label>
            <div className="flex gap-3">
              {[
                { value: "neutralizer", label: "Neutralizer", desc: "single neutral summary" },
                { value: "side_by_side", label: "Side-by-Side", desc: "Party A vs Party B" },
              ].map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTreatment(t.value)}
                  className={`flex-1 rounded-lg border p-4 text-left ${
                    treatment === t.value
                      ? "border-accent bg-accent/5"
                      : "border-card-border hover:border-muted"
                  }`}
                >
                  <p className="text-sm font-medium">{t.label}</p>
                  <p className="text-xs text-muted">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleCreate}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-6 py-2.5 text-sm font-medium text-white hover:bg-accent-hover"
          >
            <PlayCircle className="h-4 w-4" /> Start Session
          </button>
        </div>
      )}

      {/* existing sessions */}
      {selectedCase && sessions.length > 0 && (
        <div className="rounded-xl border border-card-border bg-card p-6">
          <h2 className="mb-4 text-sm font-semibold">
            Previous Sessions ({sessions.length})
          </h2>
          <div className="space-y-2">
            {sessions.map((s) => (
              <button
                key={s.id}
                onClick={() => router.push(`/dashboard/${s.id}`)}
                className="flex w-full items-center justify-between rounded-lg border border-card-border bg-background px-4 py-3 text-left hover:border-muted"
              >
                <div>
                  <p className="text-sm font-medium">{s.id}</p>
                  <p className="text-xs text-muted">
                    {s.treatment} &middot;{" "}
                    {new Date(s.created_at).toLocaleString()}
                  </p>
                </div>
                <PlayCircle className="h-4 w-4 text-muted" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
