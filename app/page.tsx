"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Header } from "./components/Header";
import { EmptyState } from "./components/EmptyState";
import { ChatMessage } from "./components/ChatMessage";
import { TypingIndicator } from "./components/TypingIndicator";
import { ChatInput } from "./components/ChatInput";
import { ReportModal } from "./components/ReportModal";

export default function Home() {
  const [input, setInput] = useState("");
  const [isReportOpen, setIsReportOpen] = useState(false);
  const { messages, sendMessage, status, stop } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  const bottomRef = useRef<HTMLDivElement>(null);
  const isStreaming = status === "streaming" || status === "submitted";

  // El backend puede emitir source-url parts antes de abrir el mensaje de
  // texto del mismo turno; el AI SDK las agrupa como un UIMessage separado
  // y "vacio" que precede al mensaje real. Lo fusionamos aca para que no
  // se vea como una respuesta duplicada.
  const displayMessages = useMemo(() => {
    const merged: UIMessage[] = [];
    for (const m of messages) {
      const prev = merged[merged.length - 1];
      const hasText = m.parts.some((p) => p.type === "text");
      if (
        !hasText &&
        m.role === "assistant" &&
        prev?.role === "assistant" &&
        merged.length > 0
      ) {
        continue;
      }
      if (
        hasText &&
        m.role === "assistant" &&
        prev?.role === "assistant" &&
        !prev.parts.some((p) => p.type === "text")
      ) {
        const existingSourceIds = new Set(
          m.parts.filter((p) => p.type === "source-url").map((p) => p.sourceId)
        );
        const extraSources = prev.parts.filter(
          (p) => p.type === "source-url" && !existingSourceIds.has(p.sourceId)
        );
        merged[merged.length - 1] = { ...m, parts: [...extraSources, ...m.parts] };
        continue;
      }
      merged.push(m);
    }
    return merged;
  }, [messages]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isStreaming]);

  function submit(text: string) {
    if (!text.trim()) return;
    sendMessage({ text });
    setInput("");
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background text-foreground">
      <Header onOpenReport={() => setIsReportOpen(true)} />
      <ReportModal open={isReportOpen} onClose={() => setIsReportOpen(false)} />

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col overflow-hidden px-4 pt-14 md:pt-16">
        <div className="flex-1 overflow-y-auto">
          {displayMessages.length === 0 ? (
            <EmptyState onPick={submit} />
          ) : (
            <div className="flex flex-col gap-5 py-6">
              {displayMessages.map((m) => (
                <ChatMessage key={m.id} message={m} />
              ))}
              {status === "submitted" && <TypingIndicator />}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="shrink-0 bg-background/95 pb-4 pt-3 backdrop-blur-sm sm:pb-6">
          <ChatInput
            value={input}
            onChange={setInput}
            onSubmit={() => submit(input)}
            onStop={stop}
            isStreaming={isStreaming}
            disabled={isStreaming}
          />
          <p className="mt-1.5 text-center text-[11px] leading-snug text-muted-foreground sm:mt-2 sm:text-xs">
            Las respuestas se generan a partir de datos públicos de la Legislatura de Santa Fe y pueden contener errores.
          </p>
        </div>
      </main>
    </div>
  );
}
