"use client";

import Link from "next/link";
import { Shield, Zap, FileText } from "lucide-react";

export default function LandingPage() {
  return (
    <div className="flex flex-col items-center pt-20 pb-16">
      <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-card-border bg-card px-4 py-1.5 text-xs text-muted">
        <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse-slow" />
        Evidence-Grounded Mediator Assistant
      </div>

      <h1 className="mb-6 max-w-2xl text-center text-5xl font-bold leading-tight tracking-tight">
        Resolve disputes with
        <span className="text-accent"> evidence</span>, not emotion
      </h1>

      <p className="mb-12 max-w-lg text-center text-lg text-muted leading-relaxed">
        Real-time document retrieval during live mediation sessions. One button
        to surface the facts that matter.
      </p>

      <div className="flex gap-4">
        <Link
          href="/intake"
          className="inline-flex h-11 items-center gap-2 rounded-lg bg-accent px-6 text-sm font-medium text-white hover:bg-accent-hover"
        >
          Start a Case
        </Link>
        <Link
          href="/session"
          className="inline-flex h-11 items-center gap-2 rounded-lg border border-card-border bg-card px-6 text-sm font-medium text-foreground hover:border-muted"
        >
          View Sessions
        </Link>
      </div>

      <div className="mt-24 grid w-full max-w-4xl grid-cols-1 gap-6 md:grid-cols-3">
        <FeatureCard
          icon={<FileText className="h-5 w-5 text-accent" />}
          title="Pre-Mediation Intake"
          desc="Both parties upload evidence documents before the session. PDFs are parsed, chunked, and indexed for instant retrieval."
        />
        <FeatureCard
          icon={<Zap className="h-5 w-5 text-warning" />}
          title="Challenge Button"
          desc="One click during a live session retrieves relevant evidence from uploaded documents based on the current conversation."
        />
        <FeatureCard
          icon={<Shield className="h-5 w-5 text-success" />}
          title="Trust & Citations"
          desc="Every claim includes a clickable citation to the source document. No hallucination -- if no evidence is found, the system says so."
        />
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-xl border border-card-border bg-card p-6">
      <div className="mb-3">{icon}</div>
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <p className="text-sm leading-relaxed text-muted">{desc}</p>
    </div>
  );
}
