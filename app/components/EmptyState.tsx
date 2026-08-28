import { Landmark, Scale, Users, Calendar, Mail } from "lucide-react";
import { SUGGESTIONS } from "@/lib/suggestions";

interface EmptyStateProps {
  onPick: (prompt: string) => void;
}

const ICONS = [Scale, Users, Calendar, Mail];

export function EmptyState({ onPick }: EmptyStateProps) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-10 text-center animate-rise-in">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm">
        <Landmark className="w-6 h-6" />
      </div>
      <h1 className="max-w-sm text-2xl font-semibold tracking-tight text-foreground text-balance">
        Preguntale a la Legislatura de Santa Fe
      </h1>
      <p className="mt-2.5 max-w-sm text-[15px] leading-relaxed text-muted-foreground font-[family-name:var(--font-body)]">
        Leyes sancionadas, sesiones, mensajes del Ejecutivo y legisladores —
        con la fuente de cada dato al pie de la respuesta.
      </p>

      <div className="mt-8 grid w-full max-w-md grid-cols-1 gap-2 sm:grid-cols-2">
        {SUGGESTIONS.map((s, i) => {
          const Icon = ICONS[i % ICONS.length];
          return (
            <button
              key={s.label}
              onClick={() => onPick(s.prompt)}
              className="group flex items-center gap-3 rounded-xl border border-border bg-card px-3.5 py-3 text-left shadow-sm transition-all duration-200 hover:border-primary/40 hover:bg-primary/5 hover:shadow-md active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="w-4 h-4" />
              </span>
              <span className="text-sm font-medium text-foreground">{s.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
