"use client";

import { useState, useEffect, useCallback } from "react";
import { Upload, FileText, Plus, Check, AlertCircle } from "lucide-react";
import {
  createCase,
  listCases,
  uploadDocument,
  listDocuments,
  type Case,
  type Document,
} from "@/lib/api";

export default function IntakePage() {
  const [cases, setCases] = useState<Case[]>([]);
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [docs, setDocs] = useState<Document[]>([]);
  const [newCaseName, setNewCaseName] = useState("");
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const loadCases = useCallback(async () => {
    try {
      const data = await listCases();
      setCases(data);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    loadCases();
  }, [loadCases]);

  const loadDocs = useCallback(async (caseId: string) => {
    const data = await listDocuments(caseId);
    setDocs(data);
  }, []);

  useEffect(() => {
    if (selectedCase) loadDocs(selectedCase.id);
  }, [selectedCase, loadDocs]);

  async function handleCreateCase() {
    if (!newCaseName.trim()) return;
    setError("");
    try {
      const c = await createCase(newCaseName.trim());
      setCases((prev) => [c, ...prev]);
      setSelectedCase(c);
      setNewCaseName("");
    } catch (e) {
      setError(String(e));
    }
  }

  async function handleUpload(party: string, files: FileList | null) {
    if (!files || !selectedCase) return;
    setError("");
    setSuccess("");
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        await uploadDocument(selectedCase.id, party, file);
      }
      setSuccess(`uploaded ${files.length} file(s) for Party ${party}`);
      await loadDocs(selectedCase.id);
    } catch (e) {
      setError(String(e));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="mb-2 text-2xl font-bold">Pre-Mediation Intake</h1>
      <p className="mb-8 text-sm text-muted">
        Create a case, then upload evidence documents for each party.
      </p>

      {/* case selection / creation */}
      <div className="mb-8 rounded-xl border border-card-border bg-card p-6">
        <h2 className="mb-4 text-sm font-semibold">Select or Create a Case</h2>
        <div className="mb-4 flex gap-3">
          <input
            type="text"
            placeholder="New case name..."
            value={newCaseName}
            onChange={(e) => setNewCaseName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreateCase()}
            className="flex-1 rounded-lg border border-card-border bg-background px-4 py-2 text-sm outline-none focus:border-accent"
          />
          <button
            onClick={handleCreateCase}
            disabled={!newCaseName.trim()}
            className="inline-flex items-center gap-2 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-white hover:bg-accent-hover disabled:opacity-40"
          >
            <Plus className="h-4 w-4" /> Create
          </button>
        </div>

        {cases.length > 0 && (
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

      {/* upload area */}
      {selectedCase && (
        <>
          {error && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-danger/30 bg-danger/5 px-4 py-3 text-sm text-danger">
              <AlertCircle className="h-4 w-4 flex-shrink-0" /> {error}
            </div>
          )}
          {success && (
            <div className="mb-4 flex items-center gap-2 rounded-lg border border-success/30 bg-success/5 px-4 py-3 text-sm text-success">
              <Check className="h-4 w-4 flex-shrink-0" /> {success}
            </div>
          )}

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <UploadZone
              party="A"
              uploading={uploading}
              onUpload={(files) => handleUpload("A", files)}
            />
            <UploadZone
              party="B"
              uploading={uploading}
              onUpload={(files) => handleUpload("B", files)}
            />
          </div>

          {/* document list */}
          {docs.length > 0 && (
            <div className="mt-8 rounded-xl border border-card-border bg-card p-6">
              <h2 className="mb-4 text-sm font-semibold">
                Uploaded Documents ({docs.length})
              </h2>
              <div className="space-y-2">
                {docs.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between rounded-lg border border-card-border bg-background px-4 py-3"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-muted" />
                      <div>
                        <p className="text-sm font-medium">{d.filename}</p>
                        <p className="text-xs text-muted">
                          Party {d.party} &middot; {d.page_count} pages
                        </p>
                      </div>
                    </div>
                    <span className="text-xs text-muted">{d.id}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function UploadZone({
  party,
  uploading,
  onUpload,
}: {
  party: string;
  uploading: boolean;
  onUpload: (files: FileList | null) => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        onUpload(e.dataTransfer.files);
      }}
      className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-8 text-center ${
        dragOver
          ? "border-accent bg-accent/5"
          : "border-card-border hover:border-muted"
      } ${uploading ? "pointer-events-none opacity-50" : ""}`}
    >
      <Upload className="mb-3 h-6 w-6 text-muted" />
      <p className="mb-1 text-sm font-medium">Party {party} Documents</p>
      <p className="text-xs text-muted">drag & drop PDFs or click to browse</p>
      <input
        type="file"
        accept=".pdf"
        multiple
        className="hidden"
        onChange={(e) => onUpload(e.target.files)}
      />
    </label>
  );
}
