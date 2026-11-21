"use client";

import { useState } from "react";
import Generator from "@/components/Generator";
import ScannerView from "@/components/ScannerView";
import About from "@/components/About";
import RegisterSW from "@/components/RegisterSW";

type Tab = "generate" | "scan" | "about";

const TABS: { id: Tab; label: string }[] = [
  { id: "generate", label: "Generate Code" },
  { id: "scan", label: "Scan Code" },
  { id: "about", label: "How it works" },
];

export default function Page() {
  const [tab, setTab] = useState<Tab>("generate");
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col px-4 pb-16">
      <RegisterSW />
      <header className="flex flex-col gap-1 py-8">
        <div className="flex items-center gap-3">
          <span className="inline-block h-3 w-3 rounded-full bg-[var(--accent)]" />
          <h1 className="text-2xl font-semibold tracking-tight">GlyphCode</h1>
          <span className="rounded-full border border-[var(--border)] px-2 py-0.5 text-xs text-[var(--muted)]">
            experimental · offline
          </span>
        </div>
        <p className="text-sm text-[var(--muted)]">
          A visual data encoding system that is not a QR code. Text lives inside the shape itself.
        </p>
      </header>

      <nav className="mb-8 flex gap-2 border-b border-[var(--border)] pb-3">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === t.id
                ? "bg-[var(--accent)] text-black"
                : "text-[var(--muted)] hover:bg-[var(--panel-2)] hover:text-[var(--text)]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "generate" && <Generator />}
      {tab === "scan" && <ScannerView />}
      {tab === "about" && <About />}
    </main>
  );
}
