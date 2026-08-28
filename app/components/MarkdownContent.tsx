import ReactMarkdown, { type Components } from "react-markdown";

const components: Components = {
  p: ({ children }) => (
    <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>
  ),
  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  ul: ({ children }) => (
    <ul className="mb-2 last:mb-0 ml-4 list-disc space-y-1">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-2 last:mb-0 ml-4 list-decimal space-y-1">{children}</ol>
  ),
  li: ({ children }) => <li className="pl-0.5">{children}</li>,
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-primary underline underline-offset-2 hover:no-underline"
    >
      {children}
    </a>
  ),
  code: ({ children }) => (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]">
      {children}
    </code>
  ),
  h1: ({ children }) => (
    <h3 className="mb-1.5 mt-2 first:mt-0 font-semibold text-foreground">{children}</h3>
  ),
  h2: ({ children }) => (
    <h3 className="mb-1.5 mt-2 first:mt-0 font-semibold text-foreground">{children}</h3>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1.5 mt-2 first:mt-0 font-semibold text-foreground">{children}</h3>
  ),
  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-l-2 border-border pl-3 text-muted-foreground">
      {children}
    </blockquote>
  ),
};

export function MarkdownContent({ text }: { text: string }) {
  return (
    <div className="text-[15px] font-[family-name:var(--font-body)]">
      <ReactMarkdown components={components}>{text}</ReactMarkdown>
    </div>
  );
}
