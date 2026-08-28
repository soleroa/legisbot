import { Landmark, User } from "lucide-react";
import type { UIMessage } from "ai";
import { SourcePill } from "./SourcePill";
import { MarkdownContent } from "./MarkdownContent";

interface ChatMessageProps {
  message: UIMessage;
}

export function ChatMessage({ message }: ChatMessageProps) {
  const isUser = message.role === "user";

  const textParts = message.parts.filter(
    (p): p is { type: "text"; text: string } => p.type === "text"
  );
  const sourceParts = message.parts.filter(
    (p): p is { type: "source-url"; sourceId: string; url: string; title?: string } =>
      p.type === "source-url"
  );

  if (isUser) {
    return (
      <div className="flex justify-end animate-rise-in">
        <div className="flex items-start gap-2.5 max-w-[85%] sm:max-w-[70%]">
          <div className="rounded-2xl rounded-tr-sm bg-primary px-4 py-2.5 text-primary-foreground shadow-sm">
            <p className="text-[15px] leading-relaxed whitespace-pre-wrap">
              {textParts.map((p) => p.text).join("")}
            </p>
          </div>
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <User className="w-3.5 h-3.5" />
          </div>
        </div>
      </div>
    );
  }

  if (textParts.length === 0 && sourceParts.length === 0) {
    return null;
  }

  return (
    <div className="flex justify-start animate-rise-in">
      <div className="flex items-start gap-2.5 max-w-[90%] sm:max-w-[75%]">
        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <Landmark className="w-3.5 h-3.5" />
        </div>
        <div className="flex flex-col gap-2 min-w-0">
          {textParts.length > 0 && (
            <div className="rounded-2xl rounded-tl-sm border border-border bg-card px-4 py-2.5 text-card-foreground shadow-sm">
              <MarkdownContent text={textParts.map((p) => p.text).join("")} />
            </div>
          )}
          {sourceParts.length > 0 && (
            <div className="flex flex-wrap gap-1.5 pl-1">
              {sourceParts.map((s) => (
                <SourcePill key={s.sourceId} title={s.title ?? s.url} url={s.url} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
