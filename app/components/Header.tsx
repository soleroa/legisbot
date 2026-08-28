import { Landmark } from "lucide-react";

export function Header() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 md:h-16 border-b border-border bg-background/95 backdrop-blur-sm">
      <div className="mx-auto flex h-full w-full max-w-3xl items-center justify-between px-4 md:px-6">
        <div className="flex items-center gap-3">
          <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary shadow-sm md:h-10 md:w-10">
            <Landmark className="w-4.5 h-4.5 md:w-5 md:h-5" />
          </div>
          <div className="flex flex-col leading-tight">
            <span className="text-base md:text-lg font-semibold tracking-tight text-foreground">
              LegisBot Santa Fe
            </span>
            <span className="hidden text-xs text-muted-foreground sm:block">
              Asistente de actividad parlamentaria
            </span>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full border border-success/20 bg-success-muted px-2.5 py-1 text-xs font-medium text-success">
          <span className="h-1.5 w-1.5 rounded-full bg-success" />
          En línea
        </span>
      </div>
    </header>
  );
}
