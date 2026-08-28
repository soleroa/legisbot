import { ScrollText } from "lucide-react";

interface SourcePillProps {
  title: string;
  url: string;
}

const INTERNAL_SCHEME = "legisbot://";

export function SourcePill({ title, url }: SourcePillProps) {
  const isExternal = !url.startsWith(INTERNAL_SCHEME);

  const content = (
    <>
      <ScrollText className="w-3 h-3 shrink-0" />
      <span className="truncate">{title}</span>
    </>
  );

  const className =
    "inline-flex max-w-full items-center gap-1.5 rounded-full border border-border bg-secondary/70 px-2.5 py-1 text-xs font-medium text-secondary-foreground transition-colors hover:bg-secondary";

  if (!isExternal) {
    return <span className={className}>{content}</span>;
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`${className} hover:border-primary/40 hover:text-primary`}
    >
      {content}
    </a>
  );
}
