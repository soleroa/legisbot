"use client";

import { useRef, type FormEvent, type KeyboardEvent } from "react";
import { ArrowUp, Square } from "lucide-react";

interface ChatInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onStop: () => void;
  isStreaming: boolean;
  disabled: boolean;
}

export function ChatInput({
  value,
  onChange,
  onSubmit,
  onStop,
  isStreaming,
  disabled,
}: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!value.trim() || disabled) return;
    onSubmit();
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }

  function autoGrow() {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-end gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm transition-shadow focus-within:shadow-md focus-within:ring-2 focus-within:ring-primary/30"
    >
      <textarea
        ref={textareaRef}
        rows={1}
        value={value}
        placeholder="Preguntá sobre leyes, sesiones o legisladores..."
        onChange={(e) => {
          onChange(e.target.value);
          autoGrow();
        }}
        onKeyDown={handleKeyDown}
        className="max-h-40 flex-1 resize-none bg-transparent px-2.5 py-2 text-[15px] text-foreground placeholder:text-muted-foreground focus:outline-none font-[family-name:var(--font-body)]"
      />
      {isStreaming ? (
        <button
          type="button"
          onClick={onStop}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground text-background transition-transform active:scale-90"
          aria-label="Detener"
        >
          <Square className="w-3.5 h-3.5 fill-current" />
        </button>
      ) : (
        <button
          type="submit"
          disabled={!value.trim() || disabled}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-all active:scale-90 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Enviar"
        >
          <ArrowUp className="w-4 h-4" />
        </button>
      )}
    </form>
  );
}
