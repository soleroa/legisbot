import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

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
  table: ({ children }) => (
    <div className="mb-2 last:mb-0 max-w-full overflow-hidden rounded-lg border border-border">
      <table className="w-full table-fixed border-collapse text-left text-[0.9em]">
        {children}
      </table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="bg-muted/60">{children}</thead>
  ),
  tbody: ({ children }) => (
    <tbody className="divide-y divide-border">{children}</tbody>
  ),
  tr: ({ children }) => (
    <tr className="even:bg-muted/30">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="break-words px-3 py-1.5 font-semibold text-foreground">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="break-words px-3 py-1.5 align-top text-muted-foreground">
      {children}
    </td>
  ),
};

export function MarkdownContent({ text }: { text: string }) {
  return (
    <div className="text-[15px] font-[family-name:var(--font-body)]">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  );
}
