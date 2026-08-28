"use client";

import { useState, type FormEvent } from "react";
import { FileDown, FileText, Loader2, X } from "lucide-react";
import type { ReportData } from "@/app/api/report/route";
import { downloadReportAsDocx, downloadReportAsPdf } from "@/lib/report-export";

interface ReportModalProps {
  open: boolean;
  onClose: () => void;
}

type Status = "idle" | "loading" | "error" | "ready";

export function ReportModal({ open, onClose }: ReportModalProps) {
  const [topic, setTopic] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [report, setReport] = useState<ReportData | null>(null);
  const [isExportingDocx, setIsExportingDocx] = useState(false);

  if (!open) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!topic.trim() || status === "loading") return;

    setStatus("loading");
    setError("");
    setReport(null);

    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "No se pudo generar el informe.");
        setStatus("error");
        return;
      }
      setReport(data);
      setStatus("ready");
    } catch {
      setError("Ocurrió un error de red generando el informe.");
      setStatus("error");
    }
  }

  function handleClose() {
    setTopic("");
    setStatus("idle");
    setError("");
    setReport(null);
    onClose();
  }

  async function handleDocx() {
    if (!report) return;
    setIsExportingDocx(true);
    try {
      await downloadReportAsDocx(report);
    } finally {
      setIsExportingDocx(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm">
      <div className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-foreground">Generar informe</h2>
          <button
            onClick={handleClose}
            className="flex h-7 w-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <form onSubmit={handleSubmit} className="flex flex-col gap-3">
            <label className="text-sm text-muted-foreground">
              Describí el tema sobre el que querés el informe (por ejemplo, &ldquo;leyes de
              salud sancionadas en 2025&rdquo;).
            </label>
            <textarea
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              rows={2}
              placeholder="Tema del informe..."
              disabled={status === "loading"}
              className="resize-none rounded-xl border border-border bg-background px-3 py-2.5 text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={!topic.trim() || status === "loading"}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-all active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
            >
              {status === "loading" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Generando informe...
                </>
              ) : (
                "Generar informe"
              )}
            </button>
          </form>

          {status === "error" && (
            <p className="mt-3 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {status === "ready" && report && (
            <div className="mt-5 flex flex-col gap-4">
              <div className="rounded-xl border border-border bg-background p-4">
                <h3 className="text-sm font-semibold text-foreground">{report.title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                  {report.summary}
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {report.sections.length} secciones · {report.sources.length} fuentes
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => downloadReportAsPdf(report)}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-secondary/70 px-4 py-2.5 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary"
                >
                  <FileText className="h-4 w-4" />
                  Descargar PDF
                </button>
                <button
                  onClick={handleDocx}
                  disabled={isExportingDocx}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-secondary/70 px-4 py-2.5 text-sm font-medium text-secondary-foreground transition-colors hover:bg-secondary disabled:opacity-60"
                >
                  {isExportingDocx ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <FileDown className="h-4 w-4" />
                  )}
                  Descargar Word
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
