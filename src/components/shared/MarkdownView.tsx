import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';
import { sanitizeMarkdownOutput } from '@/lib/ai/markdown-sanitize';

interface Props {
  text: string | null | undefined;
  className?: string;
  /** If true, runs the markdown guardrail sanitizer first. Default: true. */
  sanitize?: boolean;
}

export function MarkdownView({ text, className, sanitize = true }: Props) {
  const content = sanitize ? sanitizeMarkdownOutput(text || '') : (text || '');
  if (!content) {
    return <div className={cn('text-xs italic text-muted-foreground', className)}>(vazio)</div>;
  }
  return (
    <div
      className={cn(
        'prose prose-sm prose-invert max-w-none',
        'prose-headings:text-foreground prose-p:text-foreground prose-li:text-foreground',
        'prose-strong:text-foreground prose-a:text-primary hover:prose-a:underline',
        'prose-code:text-primary prose-code:before:content-none prose-code:after:content-none',
        'prose-pre:bg-muted/60 prose-pre:text-foreground',
        'prose-hr:border-border',
        className,
      )}
    >
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
    </div>
  );
}