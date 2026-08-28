import { Landmark } from "lucide-react";

export function TypingIndicator() {
  return (
    <div className="flex justify-start animate-rise-in">
      <div className="flex items-start gap-2.5">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Landmark className="w-3.5 h-3.5" />
        </div>
        <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm border border-border bg-card px-4 py-3.5 shadow-sm">
          <span className="dot-typing h-1.5 w-1.5 rounded-full bg-muted-foreground [animation-delay:0ms]" />
          <span className="dot-typing h-1.5 w-1.5 rounded-full bg-muted-foreground [animation-delay:160ms]" />
          <span className="dot-typing h-1.5 w-1.5 rounded-full bg-muted-foreground [animation-delay:320ms]" />
        </div>
      </div>
    </div>
  );
}
